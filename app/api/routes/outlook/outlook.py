"""
Outlook Mail API routes (provided after connector exists).
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep
from app.models import Connector
from connectors.outlook_connector import OutlookMailConnector

logger = structlog.get_logger()
router = APIRouter(prefix="/mail", tags=["outlook_mail"])


class EmailSendRequest(BaseModel):
    to: str | List[EmailStr]
    subject: str
    body: str
    html: bool = False
    cc: Optional[str | List[EmailStr]] = None
    bcc: Optional[str | List[EmailStr]] = None


def get_outlook_connector(connector_id: uuid.UUID, session: SessionDep, current_user: CurrentUser) -> OutlookMailConnector:
    statement = select(Connector).where(Connector.id == connector_id, Connector.owner_id == current_user.id)
    connector = session.exec(statement).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not connector.meta_data or connector.meta_data.get("type") != "outlook":
        raise HTTPException(status_code=400, detail="Not an Outlook connector")
    oauth2_data = connector.meta_data.get("oauth2")
    if not oauth2_data:
        raise HTTPException(status_code=400, detail="OAuth2 credentials not found")
    try:
        # Fetch user info from metadata or Microsoft Graph API
        user_info = {
            "username": oauth2_data.get("username"),
            "email": oauth2_data.get("email")
        }
        return OutlookMailConnector(oauth2_data=oauth2_data, user_info=user_info)
    except Exception as e:
        logger.error(f"Failed to initialize Outlook connector: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize Outlook connector") from e


@router.post("/send/{connector_id}/")
async def send_email(connector_id: uuid.UUID, email_data: EmailSendRequest, session: SessionDep, current_user: CurrentUser):
    outlook = get_outlook_connector(connector_id, session, current_user)
    result = outlook.send_email(
        to=email_data.to, subject=email_data.subject, body=email_data.body, html=email_data.html,
        cc=email_data.cc, bcc=email_data.bcc
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to send email"))
    return result


@router.get("/inbox/{connector_id}/")
async def inbox(connector_id: uuid.UUID, session: SessionDep, current_user: CurrentUser, q: Optional[str] = Query(None), top: int = Query(10)):
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        messages = outlook.read_emails(folder="Inbox", top=top, query=q)
        return {"success": True, "count": len(messages), "messages": messages}
    except Exception as e:
        logger.error("Read inbox failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to read inbox")


@router.delete("/message/{connector_id}/{message_id}/")
async def delete_message(connector_id: uuid.UUID, message_id: str, session: SessionDep, current_user: CurrentUser, permanent: bool = Query(False)):
    outlook = get_outlook_connector(connector_id, session, current_user)
    if permanent:
        ok = outlook.delete_email(message_id)
    else:
        ok = outlook.trash_email(message_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete/trash message")
    return {"success": True, "message": "Message deleted"}


@router.get("/status/{connector_id}/")
async def get_connector_status(connector_id: uuid.UUID, session: SessionDep, current_user: CurrentUser):
    """Fetch the status and user information of the Outlook connector."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        # Get profile info from Graph API
        profile = outlook.get_profile()
        return {
            "connected": True,
            "user": {
                "username": profile.get("displayName"),
                "email": profile.get("mail") or profile.get("userPrincipalName"),
                "id": profile.get("id"),
                "mailboxSettings": profile.get("mailboxSettings", {}),
                "preferredLanguage": profile.get("preferredLanguage"),
                "jobTitle": profile.get("jobTitle")
            }
        }
    except Exception as e:
        logger.error("Failed to fetch connector status", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch connector status")


@router.put("/message/{connector_id}/{message_id}/read/")
async def mark_as_read(connector_id: uuid.UUID, message_id: str, session: SessionDep, current_user: CurrentUser):
    """Mark a message as read."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        success = outlook.mark_as_read(message_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to mark message as read")
        return {"success": True, "message": "Message marked as read"}
    except Exception as e:
        logger.error("Failed to mark message as read", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to mark message as read")


@router.put("/message/{connector_id}/{message_id}/unread/")
async def mark_as_unread(connector_id: uuid.UUID, message_id: str, session: SessionDep, current_user: CurrentUser):
    """Mark a message as unread."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        success = outlook.mark_as_unread(message_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to mark message as unread")
        return {"success": True, "message": "Message marked as unread"}
    except Exception as e:
        logger.error("Failed to mark message as unread", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to mark message as unread")


@router.get("/folders/{connector_id}/")
async def list_folders(connector_id: uuid.UUID, session: SessionDep, current_user: CurrentUser):
    """Get all mail folders."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        folders = outlook.get_folders()
        return {
            "success": True,
            "count": len(folders),
            "folders": folders
        }
    except Exception as e:
        logger.error("Failed to fetch folders", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch folders")


@router.post("/draft/{connector_id}/")
async def create_draft(
    connector_id: uuid.UUID,
    email_data: EmailSendRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """Create a draft message."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        result = outlook.create_draft(
            to=email_data.to,
            subject=email_data.subject,
            body=email_data.body,
            html=email_data.html,
            cc=email_data.cc,
            bcc=email_data.bcc
        )
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to create draft"))
        return result
    except Exception as e:
        logger.error("Failed to create draft", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create draft")


@router.put("/message/{connector_id}/{message_id}/archive/")
async def archive_message(connector_id: uuid.UUID, message_id: str, session: SessionDep, current_user: CurrentUser):
    """Archive a message."""
    outlook = get_outlook_connector(connector_id, session, current_user)
    try:
        success = outlook.archive_email(message_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to archive message")
        return {"success": True, "message": "Message archived"}
    except Exception as e:
        logger.error("Failed to archive message", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to archive message")
