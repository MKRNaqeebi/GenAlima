"""
Gmail OAuth2 and API routes for GenAlima.

This module provides OAuth2 authentication flow and Gmail operation endpoints.
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep
from app.models import Connector
from connectors.google_mail_connector import GoogleMailConnector

logger = structlog.get_logger()

router = APIRouter(prefix="/mail", tags=["google_mail"])


# Pydantic models for request/response
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


def get_gmail_connector(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
) -> GoogleMailConnector:
    """
    Get Google Mail connector for the current user.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        GoogleMailConnector instance

    Raises:
        HTTPException: If connector not found or not authorized
    """
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if not connector.meta_data or connector.meta_data.get("type") != "gmail":
        raise HTTPException(status_code=400, detail="Not a Gmail connector")

    oauth2_data = connector.meta_data.get("oauth2")
    if not oauth2_data:
        raise HTTPException(status_code=400, detail="OAuth2 credentials not found")

    try:
        return GoogleMailConnector(oauth2_data)
    except Exception as e:
        logger.error(f"Failed to initialize Google Mail connector: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to initialize Google Mail connector") from e


@router.post("/send/{connector_id}/")
async def send_email(
    connector_id: uuid.UUID,
    email_data: EmailSendRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Send an email via Gmail.

    Args:
        connector_id: Connector UUID
        email_data: Email data
        session: Database session
        current_user: Current authenticated user

    Returns:
        Send result
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    result = gmail.send_email(
        to=email_data.to,
        subject=email_data.subject,
        body=email_data.body,
        cc=email_data.cc,
        bcc=email_data.bcc,
        attachments=email_data.attachments,
        html=email_data.html
    )

    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to send email'))

    return result


@router.get("/mail/messages/{connector_id}/")
async def list_messages(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    *,
    query: Optional[str] = Query(None, description="Gmail search query"),
    max_results: int = Query(10, description="Maximum number of results"),
    include_spam_trash: bool = Query(False, description="Include spam and trash")
):
    """
    List Gmail messages.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user
        query: Gmail search query
        max_results: Maximum number of results
        include_spam_trash: Include spam and trash

    Returns:
        List of messages
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    messages = gmail.read_emails(
        query=query,
        max_results=max_results,
        include_spam_trash=include_spam_trash
    )

    return {
        "success": True,
        "count": len(messages),
        "messages": messages
    }


@router.get("/mail/message/{connector_id}/{message_id}/")
async def get_message(
    connector_id: uuid.UUID,
    message_id: str,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get a specific Gmail message.

    Args:
        connector_id: Connector UUID
        message_id: Gmail message ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Message details
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    messages = gmail.read_emails(query=f"rfc822msgid:{message_id}", max_results=1)

    if not messages:
        raise HTTPException(status_code=404, detail="Message not found")

    return {
        "success": True,
        "message": messages[0]
    }


@router.post("/mail/search/{connector_id}")
async def search_emails(
    connector_id: uuid.UUID,
    search_data: EmailSearchRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Search Gmail messages.

    Args:
        connector_id: Connector UUID
        search_data: Search parameters
        session: Database session
        current_user: Current authenticated user

    Returns:
        Search results
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    messages = gmail.search_emails(search_data.query)

    # Apply max_results limit
    if search_data.max_results and len(messages) > search_data.max_results:
        messages = messages[:search_data.max_results]

    return {
        "success": True,
        "count": len(messages),
        "messages": messages
    }


@router.put("/mail/message/{connector_id}/{message_id}/read/")
async def mark_as_read(
    connector_id: uuid.UUID,
    message_id: str,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Mark a Gmail message as read.

    Args:
        connector_id: Connector UUID
        message_id: Gmail message ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    success = gmail.mark_as_read(message_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to mark message as read")

    return {
        "success": True,
        "message": "Message marked as read"
    }


@router.put("/mail/message/{connector_id}/{message_id}/unread/")
async def mark_as_unread(
    connector_id: uuid.UUID,
    message_id: str,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Mark a Gmail message as unread.

    Args:
        connector_id: Connector UUID
        message_id: Gmail message ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    success = gmail.mark_as_unread(message_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to mark message as unread")

    return {
        "success": True,
        "message": "Message marked as unread"
    }


@router.delete("/mail/message/{connector_id}/{message_id}/")
async def delete_message(
    connector_id: uuid.UUID,
    message_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    permanent: bool = Query(False, description="Permanently delete (not trash)")
):
    """
    Delete or trash a Gmail message.

    Args:
        connector_id: Connector UUID
        message_id: Gmail message ID
        session: Database session
        current_user: Current authenticated user
        permanent: Whether to permanently delete

    Returns:
        Success status
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    if permanent:
        success = gmail.delete_email(message_id)
        action = "deleted"
    else:
        success = gmail.trash_email(message_id)
        action = "moved to trash"

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to {action} message")

    return {
        "success": True,
        "message": f"Message {action}"
    }


@router.put("/mail/message/{connector_id}/{message_id}/archive/")
async def archive_message(
    connector_id: uuid.UUID,
    message_id: str,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Archive a Gmail message.

    Args:
        connector_id: Connector UUID
        message_id: Gmail message ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    success = gmail.archive_email(message_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to archive message")

    return {
        "success": True,
        "message": "Message archived"
    }


@router.get("/mail/labels/{connector_id}/")
async def get_labels(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get Gmail labels.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        List of labels
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    labels = gmail.get_labels()

    return {
        "success": True,
        "count": len(labels),
        "labels": labels
    }


@router.get("/mail/profile/{connector_id}/")
async def get_gmail_profile(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get Gmail profile information.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Profile information
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    profile = gmail.get_profile()

    return {
        "success": True,
        "profile": profile
    }


@router.post("/mail/draft/{connector_id}/")
async def create_draft(
    connector_id: uuid.UUID,
    draft_data: DraftCreateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a Gmail draft.

    Args:
        connector_id: Connector UUID
        draft_data: Draft data
        session: Database session
        current_user: Current authenticated user

    Returns:
        Draft creation result
    """
    gmail = get_gmail_connector(connector_id, session, current_user)

    result = gmail.create_draft(
        to=draft_data.to,
        subject=draft_data.subject,
        body=draft_data.body,
        cc=draft_data.cc,
        bcc=draft_data.bcc,
        html=draft_data.html
    )

    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to create draft'))

    return result
