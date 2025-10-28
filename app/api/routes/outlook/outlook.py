"""
Outlook tools for GenAlima — interact with Microsoft Graph API
(send emails, create events, manage contacts/tasks, etc.).
"""
import uuid
from typing import Any, Dict, List, Optional, Type, Union
from langchain_core.tools import BaseTool
from langchain_core.callbacks import CallbackManagerForToolRun
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog

from app.core.db import engine as db_engine
from app.models import Connector
from connectors.outlook_connector import OutlookMailConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()


def get_outlook_connector(connector_id: uuid.UUID) -> Optional[OutlookMailConnector]:
    if not connector_id:
        return None
    with Session(db_engine) as s:
        conn = s.exec(select(Connector).where(Connector.id == connector_id)).first()
        if not conn or conn.name != "outlook":
            logger.error(f"Outlook connector not found: {connector_id}")
            return None
        return OutlookMailConnector(conn.meta_data)


# ---------- Shared Base ----------
class OutlookTool(BaseTool):
    """Base for Outlook tools with common logic."""

    def get_connector(self, connector_id: uuid.UUID):
        c = get_outlook_connector(connector_id)
        if not c:
            raise ValueError("Failed to initialize Outlook connector")
        return c

    @staticmethod
    def store_result(name: str, message_id: str, inp: dict, out: dict):
        store_tool_result_metadata(message_id, name, {"input": inp, "output": out})


# ---------- Send Email ----------
class SendEmailInput(BaseModel):
    to: Union[str, List[str]]
    subject: str
    body: str
    message_id: uuid.UUID
    connector_id: uuid.UUID
    cc: Optional[Union[str, List[str]]] = None
    bcc: Optional[Union[str, List[str]]] = None
    html: bool = False


class SendEmailTool(OutlookTool):
    name, description = "outlook_send_email", "Send an email via Outlook API."
    args_schema: Type[BaseModel] = SendEmailInput

    def _run(
        self, to, subject, body, message_id, connector_id,
        cc=None, bcc=None, html=False, run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        connector = self.get_connector(connector_id)
        result = connector.send_email(to=to, subject=subject, body=body, cc=cc, bcc=bcc, html=html)
        self.store_result(self.name, str(message_id), {
            "to": to, "subject": subject, "body": body[:500],
            "cc": cc, "bcc": bcc, "html": html, "connector_id": str(connector_id)
        }, result)
        return (
            f"Email sent successfully! Message ID: {result['message_id']}"
            if result.get("success") else f"Failed to send email: {result.get('error', 'Unknown error')}"
        )


# ---------- Create Event ----------
class CreateEventInput(BaseModel):
    subject: str
    start_time: str
    end_time: str
    connector_id: uuid.UUID
    attendees: Optional[List[str]] = None
    location: Optional[str] = None
    body: Optional[str] = None


class CreateEventTool(OutlookTool):
    name, description = "outlook_create_event", "Create a calendar event via Outlook API."
    args_schema: Type[BaseModel] = CreateEventInput

    def _run(
        self, subject, start_time, end_time, connector_id,
        attendees=None, location=None, body=None, run_manager=None,
    ) -> str:
        connector = self.get_connector(connector_id)
        result = connector.create_event(
            subject=subject, start_time=start_time, end_time=end_time,
            attendees=attendees, location=location, body=body
        )
        self.store_result(self.name, "create_event", {
            "subject": subject, "start_time": start_time, "end_time": end_time,
            "attendees": attendees, "location": location, "body": body,
            "connector_id": str(connector_id)
        }, result)
        return (
            f"Event created successfully! Event ID: {result['event_id']}"
            if result.get("success") else f"Failed to create event: {result.get('error', 'Unknown error')}"
        )


# Initialize tool instances
outlook_send_email_tool = SendEmailTool()
outlook_create_event_tool = CreateEventTool()
