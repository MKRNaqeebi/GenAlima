import uuid
import secrets
import requests
import structlog
from datetime import datetime, timezone
from typing import Any, Dict
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Request, Query, Form
from fastapi.responses import RedirectResponse
from sqlmodel import select, Session

from app.models import Connector, User
from app.api.deps import SessionDep, CurrentUser, get_current_user, get_user_by_email
from app.core.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/onedrive", tags=["OneDrive"])

BASE_GRAPH = "https://graph.microsoft.com/v1.0"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

# In-memory OAuth state tracker
OAUTH_STATES: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------
# OneDrive OAuth2 Utility
# ---------------------------------------------------------------------
class OneDriveOAuth2:
    @staticmethod
    def build_auth_url(state: str) -> str:
        params = {
            "client_id": settings.ONEDRIVE_CLIENT_ID or settings.OUTLOOK_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": settings.ONEDRIVE_REDIRECT_URI,
            "scope": "offline_access Files.ReadWrite.All Sites.ReadWrite.All User.Read",
            "state": state,
            "response_mode": "query",
            "prompt": "consent",
        }
        return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urlencode(params)}"

    @staticmethod
    def exchange_token(data: dict) -> dict:
        r = requests.post(TOKEN_URL, data=data, timeout=30)
        if r.status_code != 200:
            logger.error("Token exchange failed", text=r.text)
            raise HTTPException(status_code=400, detail="Failed to obtain token")
        return r.json()

    @staticmethod
    def get_user_email(token: str) -> str:
        r = requests.get(f"{BASE_GRAPH}/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        user = r.json()
        return user.get("mail") or user.get("userPrincipalName")

    @staticmethod
    def save_connector(session: Session, user: User, tokens: dict, email: str) -> uuid.UUID:
        meta = {
            "oauth2": {
                "access_token": tokens["access_token"],
                "refresh_token": tokens.get("refresh_token"),
                "expires_in": tokens.get("expires_in"),
                "user_email": email,
            },
            "settings": {"default_folder": "/", "max_file_size": 250_000_000_000},
        }

        existing = session.exec(
            select(Connector).where(Connector.owner_id == user.id, Connector.name == "onedrive")
        ).first()

        if existing:
            existing.meta_data = meta
            existing.active = True
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return existing.id

        conn = Connector(
            name="onedrive", owner_id=user.id, meta_data=meta, active=True
        )
        session.add(conn)
        session.commit()
        session.refresh(conn)
        return conn.id


# ---------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------
def get_connector(session: Session, user_id: uuid.UUID, connector_id: uuid.UUID) -> Connector:
    conn = session.get(Connector, connector_id)
    if not conn or conn.owner_id != user_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    return conn


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------
@router.get("/login/")
def login_redirect_slash():
    """Redirecting /login → /auth/login for compatibility"""
    return RedirectResponse(url="/api/v1/onedrive/auth/login")


@router.get("/auth/login")
async def login(session: SessionDep, request: Request):
    """Initiates OneDrive OAuth2 flow."""
    state = secrets.token_urlsafe(32)
    token = request.headers.get("Authorization")
    email = None

    if token:
        try:
            user = get_current_user(session, token)
            email = user.email
        except HTTPException:
            logger.warning("Invalid token passed to /auth/login, proceeding without pre-auth user email.")

    OAUTH_STATES[state] = {
        "user_email": email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    return RedirectResponse(OneDriveOAuth2.build_auth_url(state))


@router.get("/callback")
async def callback(session: SessionDep, code: str = Query(...), state: str = Query(...)):
    """Exchanges code for tokens, gets user info, saves the connector."""
    state_data = OAUTH_STATES.pop(state, None)
    if not state_data:
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=invalid_state")

    try:
        tokens = OneDriveOAuth2.exchange_token({
            "client_id": settings.ONEDRIVE_CLIENT_ID or settings.OUTLOOK_CLIENT_ID,
            "client_secret": settings.ONEDRIVE_CLIENT_SECRET or settings.OUTLOOK_CLIENT_SECRET,
            "redirect_uri": settings.ONEDRIVE_REDIRECT_URI,
            "grant_type": "authorization_code",
            "code": code,
        })

        email = OneDriveOAuth2.get_user_email(tokens["access_token"])

    except HTTPException as e:
        logger.error("OAuth callback failed", error=str(e.detail))
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=token_failed")

    user = get_user_by_email(session, state_data.get("user_email")) or get_user_by_email(session, email)
    if not user:
        return RedirectResponse(f"{settings.FRONTEND_HOST}/connectors?error=user_not_found")

    connector_id = OneDriveOAuth2.save_connector(session, user, tokens, email)

    # ✅ Include state for frontend mapping
    return RedirectResponse(
        f"{settings.FRONTEND_HOST}/connectors?success=onedrive_connected"
        f"&connector_id={connector_id}&state={state}"
    )


@router.post("/auth/refresh/{connector_id}")
async def refresh(session: SessionDep, current_user: CurrentUser, connector_id: uuid.UUID):
    conn = get_connector(session, current_user.id, connector_id)
    refresh_token = conn.meta_data["oauth2"].get("refresh_token")

    if not refresh_token:
        raise HTTPException(400, detail="No refresh token")

    tokens = OneDriveOAuth2.exchange_token({
        "client_id": settings.ONEDRIVE_CLIENT_ID or settings.OUTLOOK_CLIENT_ID,
        "client_secret": settings.ONEDRIVE_CLIENT_SECRET or settings.OUTLOOK_CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": "offline_access Files.ReadWrite.All Sites.ReadWrite.All User.Read",
    })

    conn.meta_data["oauth2"].update({
        "access_token": tokens["access_token"],
        "expires_in": tokens.get("expires_in"),
    })
    session.add(conn)
    session.commit()

    return {"success": True, "expires_in": tokens.get("expires_in")}


@router.delete("/auth/revoke/{connector_id}")
async def revoke(session: SessionDep, current_user: CurrentUser, connector_id: uuid.UUID):
    conn = get_connector(session, current_user.id, connector_id)
    conn.active = False
    for k in ("access_token", "refresh_token"):
        conn.meta_data["oauth2"].pop(k, None)
    session.add(conn)
    session.commit()
    return {"message": "Connector revoked"}


# ---------------------------------------------------------------------
# File Routes
# ---------------------------------------------------------------------
class OneDriveAPI:
    def __init__(self, token: str):
        self.h = {"Authorization": f"Bearer {token}"}
        self.base = f"{BASE_GRAPH}/me/drive"

    def list_files(self, folder="root", limit=100):
        r = requests.get(f"{self.base}/items/{folder}/children", headers=self.h, params={"$top": limit}, timeout=30)
        r.raise_for_status()
        return r.json()

    def upload_file(self, name, content, folder="/", conflict="rename"):
        url = f"{self.base}/root:/{folder.strip('/')}/{name}:/content"
        if conflict != "replace":
            url += f"?@microsoft.graph.conflictBehavior={conflict}"
        r = requests.put(url, headers={**self.h, "Content-Type": "application/octet-stream"}, data=content, timeout=60)
        r.raise_for_status()
        return r.json()

    def create_folder(self, name, parent="root"):
        data = {"name": name, "folder": {}, "@microsoft.graph.conflictBehavior": "rename"}
        r = requests.post(f"{self.base}/items/{parent}/children", headers=self.h, json=data, timeout=30)
        r.raise_for_status()
        return r.json()

    def search(self, query, limit=10):
        r = requests.get(f"{self.base}/search(q='{query}')", headers=self.h, params={"$top": limit}, timeout=30)
        r.raise_for_status()
        return r.json()

    def delete(self, file_id):
        r = requests.delete(f"{self.base}/items/{file_id}", headers=self.h, timeout=30)
        if r.status_code not in (200, 204):
            raise HTTPException(r.status_code, detail="Failed to delete file")
        return {"success": True, "deleted_id": file_id}

    def share(self, file_id, permission="view", scope="anonymous"):
        data = {"type": permission, "scope": scope}
        r = requests.post(f"{self.base}/items/{file_id}/createLink", headers=self.h, json=data, timeout=30)
        r.raise_for_status()
        return r.json()
