"""
Outlook tools for GenAlima.

This module provides tools for interacting with the Microsoft Graph API, including
sending emails, reading emails, searching, and managing email state.
"""

from typing import Any, Dict, List, Optional, Union, Type
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
    """Get the Outlook connector from the database."""
    if not connector_id:
        return None

    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'outlook':
            logger.error(f"Outlook connector not found: {connector_id}")
            return None

        return OutlookMailConnector(connector.meta_data)


class SendEmailInput(BaseModel):
    """Input schema for the send email tool."""

    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")


class SendEmailTool(BaseTool):
    """Tool that sends emails via Outlook API."""

    name: str = "outlook_send_email"
    description: str = (
        "Send an email via Outlook API. "
        "Supports multiple recipients, CC, BCC, and HTML content. "
        "Updates metadata for the current message with the send results."
    )
    args_schema: Type[BaseModel] = SendEmailInput
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
        connector_id: uuid.UUID = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the send email operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        result = connector.send_email(
            to=to,
            subject=subject,
            body=body,
            cc=cc,
            bcc=bcc,
            html=html
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
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

        if result['success']:
            return f"Email sent successfully! Message ID: {result['message_id']}"
        return f"Failed to send email: {result.get('error', 'Unknown error')}"


class CreateEventInput(BaseModel):
    """Input schema for the create event tool."""

    subject: str = Field(description="Event subject")
    start_time: str = Field(description="Event start time in ISO 8601 format")
    end_time: str = Field(description="Event end time in ISO 8601 format")
    attendees: Optional[List[str]] = Field(None, description="List of attendee email addresses")
    location: Optional[str] = Field(None, description="Event location")
    body: Optional[str] = Field(None, description="Event description")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class CreateEventTool(BaseTool):
    """Tool to create calendar events."""

    name: str = "outlook_create_event"
    description: str = (
        "Create a calendar event via Outlook API. "
        "Supports specifying subject, time, attendees, location, and description."
    )
    args_schema: Type[BaseModel] = CreateEventInput
    return_direct: bool = False

    def _run(
        self,
        subject: str,
        start_time: str,
        end_time: str,
        attendees: Optional[List[str]] = None,
        location: Optional[str] = None,
        body: Optional[str] = None,
        connector_id: uuid.UUID = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create event operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_outlook_connector(connector_id)
        if not connector:
            return "Failed to initialize Outlook connector"

        result = connector.create_event(
            subject=subject,
            start_time=start_time,
            end_time=end_time,
            attendees=attendees,
            location=location,
            body=body
        )

        # Store metadata
        store_tool_result_metadata(
            "create_event", self.name,
            {
                "input": {
                    "subject": subject,
                    "start_time": start_time,
                    "end_time": end_time,
                    "attendees": attendees,
                    "location": location,
                    "body": body,
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result['success']:
            return f"Event created successfully! Event ID: {result['event_id']}"
        return f"Failed to create event: {result.get('error', 'Unknown error')}"


# Placeholder for Contacts Management tools
class ManageContactsTool(BaseTool):
    """Tool to manage contacts."""
    name: str = "outlook_manage_contacts"
    description: str = "Manage personal or business contacts via Outlook API."


# Placeholder for Tasks Management tools
class ManageTasksTool(BaseTool):
    """Tool to manage tasks."""
    name: str = "outlook_manage_tasks"
    description: str = "Create and manage tasks via Outlook API."


# Placeholder for Notes tools
class ManageNotesTool(BaseTool):
    """Tool to manage notes."""
    name: str = "outlook_manage_notes"
    description: str = "Create and manage notes via Outlook API."


# Placeholder for Integration Features tools
class IntegrationTool(BaseTool):
    """Tool for integration with Microsoft 365 services."""
    name: str = "outlook_integration_tool"
    description: str = "Integrate with Teams, OneDrive, and SharePoint."


# Placeholder for Security & Compliance tools
class SecurityTool(BaseTool):
    """Tool for security and compliance features."""
    name: str = "outlook_security_tool"
    description: str = "Manage OAuth2 authentication and email encryption."


# Initialize tool instances
outlook_send_email_tool = SendEmailTool()
outlook_create_event_tool = CreateEventTool()
outlook_manage_contacts_tool = ManageContactsTool()
outlook_manage_tasks_tool = ManageTasksTool()
outlook_manage_notes_tool = ManageNotesTool()
outlook_integration_tool = IntegrationTool()
outlook_security_tool = SecurityTool()