"""
Outlook Mail tools for LangGraph.

This module provides tools for interacting with Microsoft Outlook Mail API, including
sending emails, reading emails, searching, and managing email state.
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
from connectors.outlook_connector import OutlookMailConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()


def get_outlook_connector(connector_id: uuid.UUID) -> Optional[OutlookMailConnector]:
    """Get the Outlook Mail connector from database."""
    if not connector_id:
        return None

    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'Outlook':
            logger.error(f"Outlook connector not found: {connector_id}")
            return None

        # Get the token from meta_data
        token_data = connector.meta_data.get('token') if connector.meta_data else None
        if not token_data:
            logger.error(f"No OAuth token found for Outlook connector: {connector_id}")
            return None

        return OutlookMailConnector(credentials_data=token_data)


class OutlookSendEmailInput(BaseModel):
    """Input schema for the send email tool."""

    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")
    attachments: Optional[List[Dict[str, Any]]] = Field(None, description="List of attachments")


class OutlookSendEmailTool(BaseTool):
    """Tool that sends emails via Outlook Mail API."""

    name: str = "outlook_send_email"
    description: str = (
        "Send an email via Microsoft Outlook Mail API. "
        "Supports multiple recipients, CC, BCC, HTML content, and attachments. "
        "Updates metadata for current message with the send results."
    )
    args_schema: Type[BaseModel] = OutlookSendEmailInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: uuid.UUID,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        attachments: Optional[List[Dict[str, Any]]] = None,
        connector_id: uuid.UUID = None,  # Provided via args schema
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the send email operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook Mail connector"

        try:
            # Use asyncio to run the async method
            import asyncio
            result = asyncio.run(connector.send_email(
                to=to,
                subject=subject,
                body=body,
                cc=cc,
                bcc=bcc,
                attachments=attachments,
                html=html
            ))

            # Store metadata
            store_tool_result_metadata(
                str(message_id),
                self.name,
                {
                    "input": {
                        "to": to,
                        "subject": subject,
                        "body": body[:500],  # Truncate for storage
                        "cc": cc,
                        "bcc": bcc,
                        "html": html,
                        "has_attachments": bool(attachments),
                        "connector_id": str(connector_id)
                    },
                    "output": result
                }
            )

            return f"Email sent successfully to {to}"
        except Exception as e:
            logger.exception("Error sending email via Outlook", error=str(e))
            return f"Failed to send email: {str(e)}"


class OutlookReadEmailsInput(BaseModel):
    """Input schema for the read emails tool."""

    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    max_results: int = Field(10, description="Maximum number of emails to retrieve")
    query: Optional[str] = Field(None, description="Optional search query to filter emails")


class OutlookReadEmailsTool(BaseTool):
    """Tool that reads emails from Outlook."""

    name: str = "outlook_read_emails"
    description: str = (
        "Read emails from Microsoft Outlook inbox. "
        "Can optionally filter by search query. "
        "Returns a list of emails with id, subject, sender, date, and preview."
    )
    args_schema: Type[BaseModel] = OutlookReadEmailsInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        max_results: int = 10,
        query: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the read emails operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook Mail connector"

        try:
            import asyncio
            emails = asyncio.run(connector.read_emails(query=query, max_results=max_results))

            # Store metadata
            store_tool_result_metadata(
                str(message_id),
                self.name,
                {
                    "input": {
                        "max_results": max_results,
                        "query": query,
                        "connector_id": str(connector_id)
                    },
                    "output": {"emails_count": len(emails)}
                }
            )

            if not emails:
                return "No emails found in your Outlook inbox"

            # Format emails for display
            email_list = []
            for i, email in enumerate(emails[:max_results], 1):
                from_addr = email.get('from', {}).get('emailAddress', {})
                email_summary = (
                    f"{i}. Subject: {email.get('subject', 'No Subject')}\n"
                    f"   From: {from_addr.get('name', '')} <{from_addr.get('address', '')}>\n"
                    f"   Date: {email.get('receivedDateTime', 'Unknown')}\n"
                    f"   Preview: {email.get('bodyPreview', '')[:100]}...\n"
                )
                email_list.append(email_summary)

            return "\n".join(email_list)
        except Exception as e:
            logger.exception("Error reading emails from Outlook", error=str(e))
            return f"Failed to read emails: {str(e)}"


class OutlookCreateDraftInput(BaseModel):
    """Input schema for creating an email draft."""

    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")


class OutlookCreateDraftTool(BaseTool):
    """Tool that creates email drafts in Outlook."""

    name: str = "outlook_create_draft"
    description: str = (
        "Create an email draft in Microsoft Outlook. "
        "The draft is saved but not sent, allowing the user to review before sending."
    )
    args_schema: Type[BaseModel] = OutlookCreateDraftInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create draft operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook Mail connector"

        try:
            import asyncio
            result = asyncio.run(connector.create_draft(
                to=to,
                subject=subject,
                body=body,
                cc=cc,
                bcc=bcc,
                html=html
            ))

            # Store metadata
            store_tool_result_metadata(
                str(message_id),
                self.name,
                {
                    "input": {
                        "to": to,
                        "subject": subject,
                        "body": body[:500],  # Truncate for storage
                        "cc": cc,
                        "bcc": bcc,
                        "html": html,
                        "connector_id": str(connector_id)
                    },
                    "output": result
                }
            )

            draft_id = result.get('draft_id', 'unknown')
            return f"Draft created successfully with ID: {draft_id}"
        except Exception as e:
            logger.exception("Error creating draft in Outlook", error=str(e))
            return f"Failed to create draft: {str(e)}"


class OutlookGetProfileInput(BaseModel):
    """Input schema for getting Outlook profile."""

    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class OutlookGetProfileTool(BaseTool):
    """Tool that retrieves the Outlook user profile."""

    name: str = "outlook_get_profile"
    description: str = (
        "Get the Microsoft Outlook user profile information. "
        "Returns email address, display name, and user ID."
    )
    args_schema: Type[BaseModel] = OutlookGetProfileInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the get profile operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook Mail connector"

        try:
            import asyncio
            profile = asyncio.run(connector.get_profile())

            # Store metadata
            store_tool_result_metadata(
                str(message_id),
                self.name,
                {
                    "input": {
                        "connector_id": str(connector_id)
                    },
                    "output": profile
                }
            )

            return (
                f"Outlook Profile:\n"
                f"Name: {profile.get('displayName', 'N/A')}\n"
                f"Email: {profile.get('email', 'N/A')}\n"
                f"User ID: {profile.get('id', 'N/A')}"
            )
        except Exception as e:
            logger.exception("Error getting Outlook profile", error=str(e))
            return f"Failed to get profile: {str(e)}"


# Tool instances
outlook_send_email_tool = OutlookSendEmailTool()
outlook_read_emails_tool = OutlookReadEmailsTool()
outlook_create_draft_tool = OutlookCreateDraftTool()
outlook_get_profile_tool = OutlookGetProfileTool()
