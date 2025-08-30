"""
Google OAuth2 and API routes for GenAlima.

This module provides OAuth2 authentication flow and Google API operation endpoints.
"""

import uuid
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.auth.transport import requests
from google.oauth2 import id_token
from google.auth.exceptions import GoogleAuthError
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel, EmailStr
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep, get_current_user, get_user_by_email
from app.core.config import settings
from app.models import Connector, User
from app.api.routes.google import mail

logger = structlog.get_logger()

router = APIRouter(prefix="/google", tags=["google"])


class EmailSendRequest(BaseModel):
    """Request model for sending emails."""
    to: str | List[EmailStr]
    subject: str
    body: str
    cc: Optional[str | List[EmailStr]] = None
    bcc: Optional[str | List[EmailStr]] = None
    html: bool = False
    attachments: Optional[List[Dict[str, Any]]] = None


class EmailSearchRequest(BaseModel):
    """Request model for searching emails."""
    query: str
    max_results: int = 10
    include_spam_trash: bool = False


class DraftCreateRequest(BaseModel):
    """Request model for creating drafts."""
    to: str | List[EmailStr]
    subject: str
    body: str
    cc: Optional[str | List[EmailStr]] = None
    bcc: Optional[str | List[EmailStr]] = None
    html: bool = False


oauth_states: Dict[str, Dict[str, Any]] = {}

def _validate_state_token(state: str) -> dict:
    """Validate OAuth state token and return state data."""
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid state token")
    return oauth_states.pop(state)

def _create_oauth_flow(state: str) -> Flow:
    """Create Gmail OAuth2 flow."""
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": settings.GOOGLE_AUTH_URI,
                "token_uri": settings.GOOGLE_TOKEN_URI,
            }
        },
        scopes=settings.GMAIL_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
        state=state
    )

def _get_user_email_from_credentials(credentials) -> str:
    """Extract user email from OAuth credentials."""
    request_session = requests.Request()
    id_info = id_token.verify_oauth2_token(
        credentials.id_token, request_session, settings.GOOGLE_CLIENT_ID
    )
    return id_info.get('email')

def _build_connector_data(credentials, user_email: str) -> dict:
    """Build connector metadata from OAuth credentials."""
    return {
        "type": "gmail",
        "oauth2": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": credentials.refresh_token,
            "access_token": credentials.token,
            "token_uri": settings.GOOGLE_TOKEN_URI,
            "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "user_email": user_email,
            "scopes": list(credentials.scopes) if credentials.scopes else settings.GMAIL_SCOPES
        },
        "settings": {
            "default_from": user_email,
            "max_attachment_size": 25000000  # 25MB
        }
    }

def _save_or_update_connector(session, user_id: uuid.UUID, connector_name: str,
                             connector_data: dict, user_email: str) -> uuid.UUID:
    """Save or update Gmail connector in database."""
    statement = select(Connector).where(
        Connector.owner_id == user_id,
        Connector.name == connector_name
    )
    existing_connector = session.exec(statement).first()
    if existing_connector:
        existing_connector.meta_data = connector_data
        existing_connector.active = True
        session.add(existing_connector)
        connector_id = existing_connector.id
    else:
        new_connector = Connector(
            name=connector_name,
            description=f"Gmail connector for {user_email}",
            function="gmail",
            active=True,
            owner_id=user_id,
            meta_data=connector_data
        )
        session.add(new_connector)
        session.commit()
        session.refresh(new_connector)
        connector_id = new_connector.id
    session.commit()
    return connector_id

@router.get("/login/")
async def google_login(
    session: SessionDep, request: Request, connector_name: str = "google_mail"
):
    """
    Initiate Gmail OAuth2 authentication flow.

    Args:
        current_user: Current authenticated user
        connector_name: Name for the Gmail connector

    Returns:
        Redirect to Google OAuth2 consent screen
    """
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": settings.GOOGLE_AUTH_URI,
                "token_uri": settings.GOOGLE_TOKEN_URI,
            }
        },
        scopes=settings.GMAIL_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    # Generate state token for CSRF protection
    state = secrets.token_urlsafe(32)
    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        state=state,
        prompt='consent'  # Force consent to get refresh token
    )
    # Get token from request headers
    token = request.headers.get("Authorization")
    if not token:
        # Store minimal state so callback can still resolve user via ID token email
        oauth_states[state] = {
            'user_email': None,
            'connector_name': connector_name,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        return RedirectResponse(url=authorization_url)
    current_user = get_current_user(session, token)
    # Store state with user info
    oauth_states[state] = {
        'user_email': str(current_user.email),
        'connector_name': connector_name,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    logger.info(f"Initiating Google OAuth2 for user {current_user.id}")
    return RedirectResponse(url=authorization_url)

@router.get("/callback/")
async def google_callback(
    session: SessionDep,
    code: str = Query(...),
    state: str = Query(...)
):
    """
    Handle Gmail OAuth2 callback.
    Args:
        session: Database session
        code: Authorization code from Google
        state: State token for CSRF protection
    Returns:
        Success response or redirect to frontend
    """
    connector_name = "Google"
    user_email: Optional[str] = None
    current_user: Optional[User] = None

    # Validate state and recover stored context (user email + connector name)
    try:
        state_data = _validate_state_token(state)
        user_email = state_data.get('user_email')
        connector_name = state_data.get('connector_name', connector_name)
    except HTTPException as e:
        logger.error("Failed to validate state token", event="invalid_state", error=str(e))
        # Redirect user back with error instead of 500 response
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=invalid_state"
        return RedirectResponse(url=error_redirect, status_code=303)

    # Create OAuth flow and exchange auth code for tokens
    flow = _create_oauth_flow(state)
    try:
        flow.fetch_token(code=code)
    except GoogleAuthError as e:
        logger.error("Failed to fetch Google OAuth token", error=str(e))
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=token_exchange_failed"
        return RedirectResponse(url=error_redirect, status_code=303)

    credentials = flow.credentials

    # Resolve current user (initial email from stored state, fallback to ID token email)
    if user_email:
        current_user = get_user_by_email(session, user_email)

    # Ensure we have the authoritative email from the ID token
    try:
        verified_email = _get_user_email_from_credentials(credentials)
        if verified_email and verified_email != user_email:
            user_email = verified_email
            if not current_user:
                current_user = get_user_by_email(session, user_email)
    except GoogleAuthError as e:
        logger.error("Failed to verify ID token for Google user", error=str(e))
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=id_token_verification_failed"
        return RedirectResponse(url=error_redirect, status_code=303)

    if not current_user:
        logger.error("No matching user found for Google OAuth callback", user_email=user_email)
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=user_not_found"
        return RedirectResponse(url=error_redirect, status_code=303)

    # Build connector metadata and persist
    connector_data = _build_connector_data(credentials, user_email)
    connector_id = _save_or_update_connector(session, current_user.id, connector_name, connector_data, user_email)
    logger.info(
        "Google connector created/updated",
        user_id=current_user.id,
        connector_id=str(connector_id),
        connector_name=connector_name,
        scopes=list(credentials.scopes) if credentials.scopes else settings.GMAIL_SCOPES,
    )
    redirect_url = f"{settings.FRONTEND_HOST}/connectors?success=google_connected&connector_id={connector_id}"
    return RedirectResponse(url=redirect_url, status_code=303)

@router.post("/refresh/{connector_id}/")
async def refresh_google_token(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Refresh Gmail OAuth2 access token.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    connector = mail.get_gmail_connector(connector_id, session, current_user)

    try:
        # The GmailConnector automatically refreshes tokens when needed
        profile = connector.get_profile()

        return {
            "success": True,
            "message": "Token refreshed successfully",
            "email": profile.get("email_address")
        }
    except Exception as e:
        logger.error(f"Failed to refresh Gmail token: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to refresh token") from e


@router.delete("/revoke/{connector_id}/")
async def revoke_gmail_access(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Revoke Gmail access and delete connector.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # TODO: Implement token revocation with Google API
    # For now, just delete the connector
    session.delete(connector)
    session.commit()

    logger.info(f"Gmail connector {connector_id} deleted for user {current_user.id}")

    return {
        "success": True,
        "message": "Gmail access revoked and connector deleted"
    }

router.include_router(mail.router)
