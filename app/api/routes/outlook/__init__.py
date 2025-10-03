"""
Outlook OAuth2 and API routes for GenAlima.

This module provides OAuth2 authentication flow and Outlook operation endpoints.
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep
from app.models import Connector
from connectors.outlook_connector import OutlookMailConnector

logger = structlog.get_logger()

router = APIRouter(prefix="/outlook", tags=["outlook"])

# Include authentication routes  
from .auth import router as auth_router
router.include_router(auth_router)


# Pydantic models for request/response
class EmailSendRequest(BaseModel):
    to: str | List[EmailStr]
    subject: str
    body: str
    cc: Optional[str | List[EmailStr]] = None
    bcc: Optional[str | List[EmailStr]] = None
    html: bool = False
    attachments: Optional[List[Dict[str, Any]]] = None


def get_outlook_connector(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
) -> OutlookMailConnector:
    """
    Get Outlook connector for the current user.

    Ensures metadata.type == "outlook" and OAuth2 credentials are present.
    """
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if not connector.meta_data or connector.meta_data.get("type") != "outlook":
        raise HTTPException(status_code=400, detail="Not an Outlook connector")

    oauth2_data = connector.meta_data.get("oauth2")
    if not oauth2_data:
        raise HTTPException(status_code=400, detail="OAuth2 credentials not found")

    try:
        return OutlookMailConnector(credentials_data=oauth2_data)
    except Exception as e:
        logger.error("Failed to initialize Outlook connector", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to initialize Outlook connector") from e


@router.post("/send/{connector_id}/")
async def send_email(
    connector_id: uuid.UUID,
    email_data: EmailSendRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Send an email via Outlook.
    """
    outlook = get_outlook_connector(connector_id, session, current_user)

    result = await outlook.send_email(   # ✅ added await
        to=email_data.to,
        subject=email_data.subject,
        body=email_data.body,
        cc=email_data.cc,
        bcc=email_data.bcc,
        attachments=email_data.attachments,
        html=email_data.html
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to send email"))

    return result


@router.get("/messages/{connector_id}/")
async def list_messages(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    *,
    query: Optional[str] = Query(None, description="Outlook search query"),
    max_results: int = Query(10, description="Maximum number of results")
):
    """
    List Outlook messages (default: inbox).
    """
    outlook = get_outlook_connector(connector_id, session, current_user)

    messages = await outlook.read_emails(   # ✅ added await, removed invalid `folder`
        query=query,
        max_results=max_results
    )

    return {
        "success": True,
        "count": len(messages),
        "messages": messages
    }


@router.get("/profile/{connector_id}/")
async def get_outlook_profile(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get Outlook profile information (via Microsoft Graph `/me`).
    """
    outlook = get_outlook_connector(connector_id, session, current_user)

    profile = await outlook.get_profile()   # ✅ added await
    if not profile:
        raise HTTPException(status_code=500, detail="Failed to fetch Outlook profile")

    return {
        "success": True,
        "profile": profile
    }
