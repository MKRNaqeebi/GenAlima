"""
Google Mail tools for LangGraph.

This module provides tools for interacting with Google Mail API, including
sending emails, reading emails, searching, and managing email state.
"""
# pylint: disable=too-many-positional-arguments

from typing import Any, Dict, List, Optional, Type, Union
import uuid

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session

from app.core.db import engine as db_engine
from app.models import Connector
from connectors.google_mail_connector import GoogleMailConnector
from graphs.utils import store_tool_result_metadata
import structlog

logger = structlog.get_logger()



def get_gmail_connector(connector_id: uuid.UUID) -> Optional[GoogleMailConnector]:
    """Get the Google Mail connector from database."""
    if not connector_id:
        return None
        
    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'google_mail':
            logger.error(f"Google Mail connector not found: {connector_id}")
            return None
            
        return GoogleMailConnector(connector.meta_data)


class SendEmailInput(BaseModel):
    """Input schema for the send email tool."""

    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: str = Field(description="The ID of the message being processed")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")
    attachments: Optional[List[Dict[str, Any]]] = Field(None, description="List of attachments")


class SendEmailTool(BaseTool):
    """Tool that sends emails via Google Mail API."""

    name: str = "gmail_send_email"
    description: str = (
        "Send an email via Google Mail API. "
        "Supports multiple recipients, CC, BCC, HTML content, and attachments. "
        "Updates metadata for current message with the send results."
    )
    args_schema: Type[BaseModel] = SendEmailInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
            
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
                
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        attachments: Optional[List[Dict[str, Any]]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the send email operation."""
        _ = run_manager  # Suppress unused argument warning
        
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        result = connector.send_email(
            to=to,
            subject=subject,
            body=body,
            cc=cc,
            bcc=bcc,
            attachments=attachments,
            html=html
        )
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {
                    "to": to,
                    "subject": subject,
                    "body": body[:500],  # Truncate for storage
                    "cc": cc,
                    "bcc": bcc,
                    "html": html,
                    "has_attachments": bool(attachments)
                },
                "output": result
            }
        )
        
        if result['success']:
            return f"Email sent successfully! Message ID: {result['message_id']}"
        else:
            return f"Failed to send email: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        attachments: Optional[List[Dict[str, Any]]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of send email."""
        return self._run(
            to=to,
            subject=subject,
            body=body,
            message_id=message_id,
            cc=cc,
            bcc=bcc,
            html=html,
            attachments=attachments,
            run_manager=run_manager,
        )


class ReadEmailsInput(BaseModel):
    """Input schema for the read emails tool."""

    message_id: str = Field(description="The ID of the message being processed")
    query: Optional[str] = Field(None, description="Google Mail search query (e.g., 'is:unread')")
    max_results: int = Field(10, description="Maximum number of emails to retrieve")
    include_spam_trash: bool = Field(False, description="Whether to include spam and trash messages")


class ReadEmailsTool(BaseTool):
    """Tool that reads emails from Google Mail."""

    name: str = "gmail_read_emails"
    description: str = (
        "Read emails from Google Mail inbox. "
        "Supports filtering with Google Mail query syntax. "
        "Returns email content, metadata, and attachment information."
    )
    args_schema: Type[BaseModel] = ReadEmailsInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
            
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
                
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        query: Optional[str] = None,
        max_results: int = 10,
        include_spam_trash: bool = False,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the read emails operation."""
        _ = run_manager  # Suppress unused argument warning
        
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        emails = connector.read_emails(
            query=query,
            max_results=max_results,
            include_spam_trash=include_spam_trash
        )
        
        if not emails:
            return f"No emails found{' matching query: ' + query if query else ''}"
        
        # Format results
        formatted_results = f"Found {len(emails)} email(s):\n\n"
        for idx, email in enumerate(emails, 1):
            formatted_results += (
                f"Email {idx}:\n"
                f"- From: {email['from']}\n"
                f"- To: {email['to']}\n"
                f"- Subject: {email['subject']}\n"
                f"- Date: {email['date']}\n"
                f"- Snippet: {email['snippet'][:200]}...\n"
                f"- Unread: {email['is_unread']}\n"
                f"- Attachments: {len(email['attachments'])} file(s)\n"
                f"- Message ID: {email['id']}\n\n"
            )
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {
                    "query": query,
                    "max_results": max_results,
                    "include_spam_trash": include_spam_trash
                },
                "output": {
                    "count": len(emails),
                    "emails": emails[:5]  # Store first 5 for reference
                }
            }
        )
        
        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        query: Optional[str] = None,
        max_results: int = 10,
        include_spam_trash: bool = False,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of read emails."""
        return self._run(
            message_id=message_id,
            query=query,
            max_results=max_results,
            include_spam_trash=include_spam_trash,
            run_manager=run_manager,
        )


class SearchEmailsInput(BaseModel):
    """Input schema for the search emails tool."""

    query: str = Field(description="Google Mail search query")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    max_results: int = Field(10, description="Maximum number of results")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class SearchEmailsTool(BaseTool):
    """Tool that searches emails using Google Mail query syntax."""

    name: str = "gmail_search_emails"
    description: str = (
        "Search emails using Google Mail query syntax. "
        "Examples: 'from:example@gmail.com', 'subject:invoice', 'is:unread', "
        "'has:attachment', 'after:2024/1/1', 'label:important'. "
        "Can combine queries with AND/OR operators."
    )
    args_schema: Type[BaseModel] = SearchEmailsInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        query: str,
        message_id: str,
        connector_id: uuid.UUID,
        max_results: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the email search."""
        _ = run_manager  # Suppress unused argument warning
        print(f"Searching emails with query: {query}")
        print(f"Using connector ID: {connector_id}")
        connector = get_gmail_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        emails = connector.search_emails(query)[:max_results]
        
        if not emails:
            return f"No emails found matching query: {query}"
        
        # Format results
        formatted_results = f"Found {len(emails)} email(s) matching '{query}':\n\n"
        for idx, email in enumerate(emails, 1):
            formatted_results += (
                f"Result {idx}:\n"
                f"- From: {email['from']}\n"
                f"- Subject: {email['subject']}\n"
                f"- Date: {email['date']}\n"
                f"- Snippet: {email['snippet'][:150]}...\n"
                f"- Message ID: {email['id']}\n\n"
            )
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {"query": query, "max_results": max_results},
                "output": {"count": len(emails), "query": query}
            }
        )
        
        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        query: str,
        message_id: str,
        connector_id: uuid.UUID,
        max_results: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of search emails."""
        return self._run(
            query=query,
            message_id=message_id,
            connector_id=connector_id,
            max_results=max_results,
            run_manager=run_manager,
        )


class ManageEmailInput(BaseModel):
    """Input schema for the manage email tool."""

    email_id: str = Field(description="Google Mail message ID to manage")
    action: str = Field(
        description="Action to perform: 'mark_read', 'mark_unread', 'archive', 'trash', 'delete'"
    )
    message_id: str = Field(description="The ID of the message being processed")


class ManageEmailTool(BaseTool):
    """Tool that manages email state (read/unread, archive, trash, delete)."""

    name: str = "gmail_manage_email"
    description: str = (
        "Manage email state in Google Mail. "
        "Actions: mark_read, mark_unread, archive, trash, delete. "
        "Use 'archive' to remove from inbox, 'trash' to move to trash, "
        "'delete' to permanently delete."
    )
    args_schema: Type[BaseModel] = ManageEmailInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
            
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
                
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        email_id: str,
        action: str,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the email management action."""
        _ = run_manager  # Suppress unused argument warning
        
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        success = False
        action_result = ""
        
        if action == "mark_read":
            success = connector.mark_as_read(email_id)
            action_result = "marked as read" if success else "failed to mark as read"
        elif action == "mark_unread":
            success = connector.mark_as_unread(email_id)
            action_result = "marked as unread" if success else "failed to mark as unread"
        elif action == "archive":
            success = connector.archive_email(email_id)
            action_result = "archived" if success else "failed to archive"
        elif action == "trash":
            success = connector.trash_email(email_id)
            action_result = "moved to trash" if success else "failed to trash"
        elif action == "delete":
            success = connector.delete_email(email_id)
            action_result = "deleted permanently" if success else "failed to delete"
        else:
            return f"Invalid action: {action}. Use: mark_read, mark_unread, archive, trash, delete"
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {"email_id": email_id, "action": action},
                "output": {"success": success, "result": action_result}
            }
        )
        
        return f"Email {email_id} {action_result}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        email_id: str,
        action: str,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of manage email."""
        return self._run(
            email_id=email_id,
            action=action,
            message_id=message_id,
            run_manager=run_manager,
        )


class CreateDraftInput(BaseModel):
    """Input schema for the create draft tool."""

    to: Union[str, List[str]] = Field(description="Recipient email address(es)")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body content")
    message_id: str = Field(description="The ID of the message being processed")
    cc: Optional[Union[str, List[str]]] = Field(None, description="CC recipient(s)")
    bcc: Optional[Union[str, List[str]]] = Field(None, description="BCC recipient(s)")
    html: bool = Field(False, description="Whether body is HTML content")


class CreateDraftTool(BaseTool):
    """Tool that creates draft emails in Google Mail."""

    name: str = "gmail_create_draft"
    description: str = (
        "Create a draft email in Google Mail. "
        "The draft can be edited and sent later from the Gmail interface. "
        "Supports multiple recipients, CC, BCC, and HTML content."
    )
    args_schema: Type[BaseModel] = CreateDraftInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create draft operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        result = connector.create_draft(
            to=to,
            subject=subject,
            body=body,
            cc=cc,
            bcc=bcc,
            html=html
        )
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {
                    "to": to,
                    "subject": subject,
                    "body": body[:500],  # Truncate for storage
                    "cc": cc,
                    "bcc": bcc,
                    "html": html
                },
                "output": result
            }
        )
        if result['success']:
            return f"Draft created successfully! Draft ID: {result['draft_id']}"
        return f"Failed to create draft: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        to: Union[str, List[str]],
        subject: str,
        body: str,
        message_id: str,
        cc: Optional[Union[str, List[str]]] = None,
        bcc: Optional[Union[str, List[str]]] = None,
        html: bool = False,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of create draft."""
        return self._run(
            to=to,
            subject=subject,
            body=body,
            message_id=message_id,
            cc=cc,
            bcc=bcc,
            html=html,
            run_manager=run_manager,
        )


class GetLabelsInput(BaseModel):
    """Input schema for the get labels tool."""

    message_id: str = Field(description="The ID of the message being processed")


class GetLabelsTool(BaseTool):
    """Tool that retrieves all Google Mail labels."""

    name: str = "gmail_get_labels"
    description: str = (
        "Get all Google Mail labels/folders in the account. "
        "Returns system labels (INBOX, SENT, TRASH, etc.) and user-created labels."
    )
    args_schema: Type[BaseModel] = GetLabelsInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
            
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
                
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the get labels operation."""
        _ = run_manager  # Suppress unused argument warning
        
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        labels = connector.get_labels()
        
        if not labels:
            return "No labels found or failed to retrieve labels"
        
        # Group labels by type
        system_labels = [l for l in labels if l['type'] == 'system']
        user_labels = [l for l in labels if l['type'] == 'user']
        
        # Format results
        formatted_results = "Google Mail Labels:\n\n"
        
        if system_labels:
            formatted_results += "System Labels:\n"
            for label in system_labels:
                formatted_results += f"- {label['name']} (ID: {label['id']})\n"
        
        if user_labels:
            formatted_results += "\nUser Labels:\n"
            for label in user_labels:
                formatted_results += f"- {label['name']} (ID: {label['id']})\n"
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {},
                "output": {
                    "total_labels": len(labels),
                    "system_labels": len(system_labels),
                    "user_labels": len(user_labels)
                }
            }
        )
        
        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of get labels."""
        return self._run(
            message_id=message_id,
            run_manager=run_manager,
        )


class GetProfileInput(BaseModel):
    """Input schema for the get profile tool."""

    message_id: str = Field(description="The ID of the message being processed")


class GetProfileTool(BaseTool):
    """Tool that retrieves Google Mail profile information."""

    name: str = "gmail_get_profile"
    description: str = (
        "Get Google Mail account profile information including "
        "email address, total messages, and total threads."
    )
    args_schema: Type[BaseModel] = GetProfileInput
    return_direct: bool = False
    connector_id: Optional[str] = None

    def _get_connector(self) -> Optional[GoogleMailConnector]:
        """Get the Google Mail connector from database."""
        if not self.connector_id:
            return None
            
        with Session(db_engine) as session:
            connector = session.exec(
                select(Connector).where(Connector.id == self.connector_id)
            ).first()
            
            if not connector or connector.name != 'google_mail':
                logger.error(f"Google Mail connector not found: {self.connector_id}")
                return None
                
            return GoogleMailConnector(connector.meta_data)

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the get profile operation."""
        _ = run_manager  # Suppress unused argument warning
        
        connector = self._get_connector()
        if not connector:
            return "Failed to initialize Google Mail connector"
        
        profile = connector.get_profile()
        
        if not profile:
            return "Failed to retrieve Google Mail profile"
        
        # Format results
        formatted_results = (
            "Google Mail Profile:\n\n"
            f"Email Address: {profile.get('email_address', 'N/A')}\n"
            f"Total Messages: {profile.get('messages_total', 0):,}\n"
            f"Total Threads: {profile.get('threads_total', 0):,}\n"
        )
        
        # Store metadata
        store_tool_result_metadata(
            message_id, self.name,
            {
                "input": {},
                "output": profile
            }
        )
        
        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of get profile."""
        return self._run(
            message_id=message_id,
            run_manager=run_manager,
        )


# Initialize tool instances
gmail_send_email_tool = SendEmailTool()
gmail_read_emails_tool = ReadEmailsTool()
gmail_search_emails_tool = SearchEmailsTool()
gmail_manage_email_tool = ManageEmailTool()
gmail_create_draft_tool = CreateDraftTool()
gmail_get_labels_tool = GetLabelsTool()
gmail_get_profile_tool = GetProfileTool()
