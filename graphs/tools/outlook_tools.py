"""
Outlook Mail tools for LangGraph.

This module provides tools for interacting with Microsoft Outlook (Office 365) Mail API,
including sending, reading, searching, and managing emails.
"""
# pylint: disable=too-many-positional-arguments

from typing import Any, Dict, List, Optional, Type, Union
import uuid

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog

from app.core.db import engine as db_engine
from app.models import Connector
from connectors.outlook_connector import OutlookConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()


def get_outlook_connector(connector_id: uuid.UUID) -> Optional[OutlookConnector]:
    """Get the Outlook connector from database."""
    if not connector_id:
        return None

    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'outlook_mail':
            logger.error(f"Outlook Mail connector not found: {connector_id}")
            return None

        return OutlookConnector(connector.meta_data)


# ============================ SEND EMAIL TOOL ============================

class SendOutlookEmailInput(BaseModel):
    """Input schema for sending Outlook email."""
    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")
    attachments: Optional[List[Dict[str, Any]]] = Field(None, description="List of attachments")


class SendOutlookEmailTool(BaseTool):
    """Tool to send email via Outlook API."""

    name: str = "outlook_send_email"
    description: str = (
        "Send an email via Outlook (Microsoft Graph) API. "
        "Supports multiple recipients, CC, BCC, HTML content, and attachments."
    )
    args_schema: Type[BaseModel] = SendOutlookEmailInput
    return_direct: bool = False

    def _run(
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: uuid.UUID,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        attachments: Optional[List[Dict[str, Any]]] = None,
        connector_id: uuid.UUID = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the send email operation."""
        _ = run_manager
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        result = connector.send_email(
            to=to, subject=subject, body=body,
            cc=cc, bcc=bcc, html=html, attachments=attachments
        )

        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {"to": to, "subject": subject, "body": body[:500], "html": html},
                "output": result
            }
        )

        if result.get("success"):
            return f"Outlook email sent successfully! Message ID: {result['message_id']}"
        return f"Failed to send Outlook email: {result.get('error', 'Unknown error')}"

    async def _arun(self, **kwargs):
        return self._run(**kwargs)


# ============================ READ EMAIL TOOL ============================

class ReadOutlookEmailsInput(BaseModel):
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    folder: Optional[str] = Field("Inbox", description="Folder to read emails from")
    top: int = Field(10, description="Maximum number of emails to retrieve")


class ReadOutlookEmailsTool(BaseTool):
    """Tool that reads emails from Outlook."""

    name: str = "outlook_read_emails"
    description: str = "Read emails from Outlook Inbox or specified folder."
    args_schema: Type[BaseModel] = ReadOutlookEmailsInput
    return_direct: bool = False

    def _run(
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        folder: Optional[str] = "Inbox",
        top: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        _ = run_manager
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        emails = connector.read_emails(folder=folder, top=top)
        if not emails:
            return "No emails found."

        formatted = f"Retrieved {len(emails)} email(s) from {folder}:\n\n"
        for idx, e in enumerate(emails, 1):
            formatted += (
                f"{idx}. From: {e['from']}\n"
                f"   Subject: {e['subject']}\n"
                f"   Date: {e['date']}\n"
                f"   Snippet: {e['snippet'][:120]}...\n\n"
            )

        store_tool_result_metadata(str(message_id), self.name, {"emails": emails[:5]})
        return formatted

    async def _arun(self, **kwargs):
        return self._run(**kwargs)


# ============================ SEARCH EMAIL TOOL ============================

class SearchOutlookEmailsInput(BaseModel):
    query: str = Field(description="Search query (subject, sender, or keyword)")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class SearchOutlookEmailsTool(BaseTool):
    """Search Outlook emails by keyword or filter."""
    name: str = "outlook_search_emails"
    description: str = "Search emails in Outlook Mail by keyword, sender, or subject."
    args_schema: Type[BaseModel] = SearchOutlookEmailsInput
    return_direct: bool = False

    def _run(
        self,
        query: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        _ = run_manager
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        results = connector.search_emails(query)
        if not results:
            return f"No Outlook emails found for query: {query}"

        formatted = f"Found {len(results)} email(s) for '{query}':\n\n"
        for idx, e in enumerate(results, 1):
            formatted += f"{idx}. From: {e['from']} | Subject: {e['subject']}\n"

        store_tool_result_metadata(str(message_id), self.name, {"query": query, "results": results[:5]})
        return formatted

    async def _arun(self, **kwargs):
        return self._run(**kwargs)


# ============================ PROFILE TOOL ============================

class GetOutlookProfileInput(BaseModel):
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class GetOutlookProfileTool(BaseTool):
    """Retrieve Outlook account profile info."""

    name: str = "outlook_get_profile"
    description: str = "Retrieve Outlook user profile (email address, display name, mailbox stats)."
    args_schema: Type[BaseModel] = GetOutlookProfileInput
    return_direct: bool = False

    def _run(
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        _ = run_manager
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        profile = connector.get_profile()
        if not profile:
            return "Failed to retrieve Outlook profile"

        formatted = (
            f"Outlook Profile:\n"
            f"- Display Name: {profile.get('display_name')}\n"
            f"- Email: {profile.get('email')}\n"
            f"- Total Messages: {profile.get('total_messages', 0)}\n"
        )

        store_tool_result_metadata(str(message_id), self.name, {"profile": profile})
        return formatted

    async def _arun(self, **kwargs):
        return self._run(**kwargs)


# ============================ TOOL REGISTRY ============================

outlook_send_email_tool = SendOutlookEmailTool()
outlook_read_emails_tool = ReadOutlookEmailsTool()
outlook_search_emails_tool = SearchOutlookEmailsTool()
outlook_get_profile_tool = GetOutlookProfileTool()
