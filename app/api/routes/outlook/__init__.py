"""
Outlook OAuth2 and connector routes for GenAlima.
Mirrors the GitHub connector style: /login -> redirect to Microsoft,
/callback -> exchange code, verify user, persist connector metadata.
"""
import uuid
import secrets
from datetime import datetime, timezone
from typing import Any, Dict

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep, get_current_user, get_user_by_email
from app.core.config import settings
from app.models import Connector, User

logger = structlog.get_logger()
router = APIRouter(prefix="/outlook", tags=["outlook"])

oauth_states: Dict[str, Dict[str, Any]] = {}  # use Redis in production

def _build_auth_url(state: str) -> str:
    from urllib.parse import urlencode
    return (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?"
        + urlencode({
            "client_id": settings.OUTLOOK_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
            "response_mode": "query",
            "scope": " ".join(settings.OUTLOOK_SCOPES),
            "state": state,
            "prompt": "consent",
        })
    )

def _exchange_code(code: str) -> dict:
    resp = requests.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        data={
            "client_id": settings.OUTLOOK_CLIENT_ID,
            "client_secret": settings.OUTLOOK_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.OUTLOOK_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if not resp.ok:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    return resp.json()

def _get_user_email(token: str) -> str:
    resp = requests.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if not resp.ok:
        raise HTTPException(400, f"Profile fetch failed: {resp.text}")
    data = resp.json()
    return data.get("mail") or data.get("userPrincipalName")

def _connector_data(tokens: dict, email: str) -> dict:
    expiry = datetime.now(timezone.utc).timestamp() + int(tokens.get("expires_in", 0))
    return {
        "type": "outlook",
        "oauth2": {
            "client_id": settings.OUTLOOK_CLIENT_ID,
            "client_secret": settings.OUTLOOK_CLIENT_SECRET,
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "token_uri": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "token_expiry": expiry,
            "user_email": email,
            "scopes": tokens.get("scope", "").split(),
        },
        "settings": {"default_from": email},
    }

def _save_connector(session, user: User, name: str, data: dict, email: str) -> uuid.UUID:
    stmt = select(Connector).where(Connector.owner_id == user.id, Connector.name == name)
    conn = session.exec(stmt).first()
    if conn:
        conn.meta_data, conn.active = data, True
    else:
        conn = Connector(
            name=name,
            description=f"Outlook connector for {email}",
            function="outlook",
            active=True,
            owner_id=user.id,
            meta_data=data,
        )
        session.add(conn)
    session.commit()
    session.refresh(conn)
    return conn.id

@router.get("/login/")
async def outlook_login(
    session: SessionDep, request: Request, connector_name: str = "outlook"
):
    """Redirect user to Microsoft login for Outlook OAuth2."""
    state, token = secrets.token_urlsafe(32), request.headers.get("Authorization")
    email = None
    if token:
        try:
            email = get_current_user(session, token).email
        except HTTPException:
            logger.warning("Invalid token, proceeding as guest")

    oauth_states[state] = {
        "user_email": email,
        "connector_name": connector_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return RedirectResponse(_build_auth_url(state))

@router.get("/callback/")
async def outlook_callback(session: SessionDep, code: str = Query(...), state: str = Query(...)):
    """Exchange code, fetch email, and save connector."""
    state_data = oauth_states.pop(state, None)
    if not state_data:
        return RedirectResponse(
            f"{settings.FRONTEND_HOST}/connectors?error=invalid_state"
        )

    try:
        tokens = _exchange_code(code)
        email = _get_user_email(tokens["access_token"])
    except HTTPException as e:
        logger.error("OAuth callback failed", error=str(e.detail))
        return RedirectResponse(
            f"{settings.FRONTEND_HOST}/connectors?error=token_failed"
        )

    user = get_user_by_email(
        session, state_data.get("user_email")
    ) or get_user_by_email(session, email)
    if not user:
        return RedirectResponse(
            f"{settings.FRONTEND_HOST}/connectors?error=user_not_found"
        )

    connector_id = _save_connector(
        session, user, state_data["connector_name"], _connector_data(tokens, email), email
    )
    return RedirectResponse(
        f"{settings.FRONTEND_HOST}/connectors?success=outlook_connected&connector_id={connector_id}"
    )


@router.delete("/revoke/{connector_id}/")
async def revoke_outlook(
    connector_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
):
    """Remove Outlook connector (optional revoke at Microsoft)."""
    stmt = select(Connector).where(
        Connector.id == connector_id, Connector.owner_id == current_user.id
    )
    connector = session.exec(stmt).first()
    if not connector:
        raise HTTPException(404, "Connector not found")
    session.delete(connector)
    session.commit()
    return {"success": True, "message": "Outlook connector removed"}
