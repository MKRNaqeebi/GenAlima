"""
Outlook OAuth2 and connector routes for GenAlima.

Mirrors the Google connector style: /login -> redirect to Microsoft,
/callback -> exchange code, verify user, persist connector metadata.
"""

import uuid
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
import requests
from sqlmodel import select
import structlog

from app.api.deps import SessionDep, CurrentUser, get_current_user, get_user_by_email
from app.core.config import settings
from app.models import Connector, User

logger = structlog.get_logger()
router = APIRouter(prefix="/outlook", tags=["outlook"])

# in-memory state store (use Redis for prod/multi-instance)
oauth_states: Dict[str, Dict[str, Any]] = {}

# Helper: validate state
def _validate_state_token(state: str) -> dict:
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid state token")
    return oauth_states.pop(state)

# Build Microsoft authorization URL
def _build_auth_url(state: str) -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": settings.OUTLOOK_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
        "response_mode": "query",
        "scope": "offline_access Mail.ReadWrite Mail.Send User.Read",
        "state": state,
        "prompt": "consent",
    }
    base = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    return f"{base}?{urlencode(params)}"

# Exchange auth code to tokens
def _exchange_code_for_token(code: str) -> dict:
    token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    data = {
        "client_id": settings.OUTLOOK_CLIENT_ID,
        "client_secret": settings.OUTLOOK_CLIENT_SECRET,
        "code": code,
        "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    resp = requests.post(token_url, data=data, timeout=15)
    if not resp.ok:
        logger.error("Outlook token exchange failed", status=resp.status_code, body=resp.text)
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")
    return resp.json()

# Obtain user email using Graph /me
def _get_user_email(access_token: str) -> str:
    resp = requests.get("https://graph.microsoft.com/v1.0/me", headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    if not resp.ok:
        logger.error("Failed to fetch Microsoft profile", status=resp.status_code, body=resp.text)
        raise HTTPException(status_code=400, detail="Failed to fetch user profile")
    data = resp.json()
    return data.get("mail") or data.get("userPrincipalName")

def _build_connector_data(token_data: dict, user_email: str) -> dict:
    import time
    expiry = None
    if token_data.get("expires_in"):
        expiry = (datetime.now(timezone.utc).timestamp() + int(token_data["expires_in"]))
    return {
        "type": "outlook",
        "oauth2": {
            "client_id": settings.OUTLOOK_CLIENT_ID,
            "client_secret": settings.OUTLOOK_CLIENT_SECRET,
            "access_token": token_data.get("access_token"),
            "refresh_token": token_data.get("refresh_token"),
            "token_uri": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "token_expiry": expiry,
            "user_email": user_email,
            "scopes": token_data.get("scope", "").split(),
        },
        "settings": {
            "default_from": user_email
        }
    }

def _save_or_update_connector(session, user_id: uuid.UUID, connector_name: str, connector_data: dict, user_email: str) -> uuid.UUID:
    statement = select(Connector).where(Connector.owner_id == user_id, Connector.name == connector_name)
    existing = session.exec(statement).first()
    if existing:
        existing.meta_data = connector_data
        existing.active = True
        session.add(existing)
        connector_id = existing.id
    else:
        new = Connector(
            name=connector_name,
            description=f"Outlook connector for {user_email}",
            function="outlook",
            active=True,
            owner_id=user_id,
            meta_data=connector_data
        )
        session.add(new)
        session.commit()
        session.refresh(new)
        connector_id = new.id
    session.commit()
    return connector_id


@router.get("/login/")
async def outlook_login(session: SessionDep, request: Request, connector_name: str = "outlook_mail"):
    """
    Redirect user to Microsoft login to authorize Outlook scopes.
    If Authorization header present, tie state to logged-in user; otherwise store minimal state.
    """
    state = secrets.token_urlsafe(32)
    token = request.headers.get("Authorization")
    # default state
    oauth_states[state] = {"user_email": None, "connector_name": connector_name, "timestamp": datetime.now(timezone.utc).isoformat()}

    if token:
        # note: get_current_user expects token string; adapt to your helper signature if different
        try:
            current_user = get_current_user(session, token)
            oauth_states[state]["user_email"] = str(current_user.email)
        except Exception:
            # If token invalid, still proceed with user_email None (callback will verify via Graph)
            oauth_states[state]["user_email"] = None

    url = _build_auth_url(state)
    return RedirectResponse(url=url)


@router.get("/callback/")
async def outlook_callback(session: SessionDep, code: str = Query(...), state: str = Query(...)):
    """
    Microsoft redirects here after consent. Exchange code for tokens, verify user, and persist connector.
    """
    try:
        state_data = _validate_state_token(state)
        user_email = state_data.get("user_email")
        connector_name = state_data.get("connector_name", "Outlook")
    except HTTPException as e:
        logger.error("Invalid state", error=str(e))
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=invalid_state", status_code=303)

    try:
        token_data = _exchange_code_for_token(code)
    except HTTPException:
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=token_exchange_failed", status_code=303)

    try:
        verified_email = _get_user_email(token_data["access_token"])
        if verified_email:
            user_email = verified_email
    except HTTPException:
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=id_token_verification_failed", status_code=303)

    current_user = None
    if user_email:
        current_user = get_user_by_email(session, user_email)

    if not current_user:
        logger.error("No matching user for Outlook callback", user_email=user_email)
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=user_not_found", status_code=303)

    connector_data = _build_connector_data(token_data, user_email)
    connector_id = _save_or_update_connector(session, current_user.id, connector_name, connector_data, user_email)

    logger.info("Outlook connector persisted", user_id=current_user.id, connector_id=str(connector_id))
    return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?success=outlook_connected&connector_id={connector_id}", status_code=303)


@router.delete("/revoke/{connector_id}/")
async def revoke_outlook(connector_id: uuid.UUID, session: SessionDep, current_user: "User"):
    """Delete stored connector metadata (revocation with Microsoft API optional)."""
    statement = select(Connector).where(Connector.id == connector_id, Connector.owner_id == current_user.id)
    connector = session.exec(statement).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    session.delete(connector)
    session.commit()
    logger.info("Outlook connector deleted", user=current_user.id, connector=str(connector_id))
    return {"success": True, "message": "Outlook access revoked and connector deleted"}

