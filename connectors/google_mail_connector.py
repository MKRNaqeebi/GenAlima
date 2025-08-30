"""
Google Mail Connector implementation for GenAlima.

This module provides integration with Google Mail API using OAuth2 authentication.
"""

import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import structlog

logger = structlog.get_logger()


class GoogleMailConnector:
    """Google Mail API connector for sending and reading emails."""

    def __init__(self, credentials_data: Dict[str, Any]):
        """
        Initialize Google Mail connector with OAuth2 credentials.

        Args:
            credentials_data: Dictionary containing OAuth2 credentials
        """
        self.credentials = self._build_credentials(credentials_data)
        self.service = None
        self._initialize_service()

    def _build_credentials(self, credentials_data: Dict[str, Any]) -> Credentials:
        """Build Google OAuth2 credentials from stored data."""
        print("Building credentials...", credentials_data)
        # Extract oauth2 data from meta_data if it's nested
        oauth2_data = credentials_data.get("oauth2", credentials_data)
        
        creds = Credentials(
            token=oauth2_data.get("access_token"),
            refresh_token=oauth2_data.get("refresh_token"),
            token_uri=oauth2_data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=oauth2_data.get("client_id"),
            client_secret=oauth2_data.get("client_secret"),
            scopes=oauth2_data.get("scopes", [
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.modify"
            ])
        )
        # Check if token needs refresh
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            logger.info("Google Mail access token refreshed successfully")
        return creds

    def _initialize_service(self):
        """Initialize Google Mail API service."""
        self.service = build('gmail', 'v1', credentials=self.credentials)
        logger.info("Google Mail service initialized successfully")

    def send_email(
        self,
        to: str | List[str],
        subject: str,
        body: str,
        cc: Optional[str | List[str]] = None,
        bcc: Optional[str | List[str]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        html: bool = False
    ) -> Dict[str, Any]:
        """
        Send an email via Google Mail API.

        Args:
            to: Recipient email address(es)
            subject: Email subject
            body: Email body content
            cc: CC recipient(s)
            bcc: BCC recipient(s)
            attachments: List of attachments with 'filename' and 'content' keys
            html: Whether body is HTML content

        Returns:
            Dictionary with send result
        """
        # Create message
        if attachments:
            message = MIMEMultipart()
        else:
            message = MIMEText(body, 'html' if html else 'plain')

        # Handle multiple recipients
        if isinstance(to, list):
            to = ', '.join(to)
        message['to'] = to

        if cc:
            if isinstance(cc, list):
                cc = ', '.join(cc)
            message['cc'] = cc

        if bcc:
            if isinstance(bcc, list):
                bcc = ', '.join(bcc)
            message['bcc'] = bcc

        message['subject'] = subject

        # Add body if using multipart
        if attachments:
            message.attach(MIMEText(body, 'html' if html else 'plain'))

            # Add attachments
            for attachment in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment['content'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={attachment["filename"]}'
                )
                message.attach(part)

        # Encode message
        raw_message = base64.urlsafe_b64encode(
            message.as_bytes()
        ).decode('utf-8')

        # Send message
        result = self.service.users().messages().send(
            userId='me',
            body={'raw': raw_message}
        ).execute()

        logger.info(f"Email sent successfully: {result['id']}")
        return {
            'success': True,
            'message_id': result['id'],
            'thread_id': result.get('threadId')
        }

    def read_emails(
        self,
        query: Optional[str] = None,
        max_results: int = 10,
        include_spam_trash: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Read emails from Google Mail.

        Args:
            query: Google Mail search query (e.g., 'is:unread', 'from:example@gmail.com')
            max_results: Maximum number of emails to retrieve
            include_spam_trash: Whether to include spam and trash messages

        Returns:
            List of email dictionaries
        """
        # List messages
        results = self.service.users().messages().list(
            userId='me',
            q=query,
            maxResults=max_results,
            includeSpamTrash=include_spam_trash
        ).execute()

        messages = results.get('messages', [])
        emails = []

        for msg in messages:
            # Get full message details
            message = self.service.users().messages().get(
                userId='me',
                id=msg['id']
            ).execute()

            # Parse email data
            email_data = self._parse_email(message)
            emails.append(email_data)

        logger.info(f"Retrieved {len(emails)} emails")
        return emails

    def _parse_email(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Parse email message into structured format."""
        headers = message['payload'].get('headers', [])

        # Extract header values
        header_dict = {h['name']: h['value'] for h in headers}

        # Extract body
        body = self._extract_body(message['payload'])

        # Extract attachments info
        attachments = self._extract_attachments(message['payload'])

        return {
            'id': message['id'],
            'thread_id': message['threadId'],
            'label_ids': message.get('labelIds', []),
            'snippet': message.get('snippet', ''),
            'from': header_dict.get('From', ''),
            'to': header_dict.get('To', ''),
            'subject': header_dict.get('Subject', ''),
            'date': header_dict.get('Date', ''),
            'body': body,
            'attachments': attachments,
            'is_unread': 'UNREAD' in message.get('labelIds', [])
        }

    def _extract_body(self, payload: Dict[str, Any]) -> str:
        """Extract email body from payload."""
        body = ''

        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body']['data']
                    body = base64.urlsafe_b64decode(data).decode('utf-8')
                    break
                if part['mimeType'] == 'text/html':
                    data = part['body']['data']
                    body = base64.urlsafe_b64decode(data).decode('utf-8')
        elif payload['body'].get('data'):
            body = base64.urlsafe_b64decode(
                payload['body']['data']
            ).decode('utf-8')

        return body

    def _extract_attachments(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract attachment information from payload."""
        attachments = []

        if 'parts' in payload:
            for part in payload['parts']:
                if part.get('filename'):
                    attachments.append({
                        'filename': part['filename'],
                        'mime_type': part['mimeType'],
                        'size': part['body'].get('size', 0),
                        'attachment_id': part['body'].get('attachmentId')
                    })

        return attachments

    def search_emails(self, query: str) -> List[Dict[str, Any]]:
        """
        Search emails using Google Mail query syntax.

        Args:
            query: Google Mail search query

        Returns:
            List of matching emails
        """
        return self.read_emails(query=query)

    def get_labels(self) -> List[Dict[str, Any]]:
        """
        Get all Google Mail labels.

        Returns:
            List of label dictionaries
        """
        results = self.service.users().labels().list(userId='me').execute()
        labels = results.get('labels', [])

        return [
            {
                'id': label['id'],
                'name': label['name'],
                'type': label.get('type', 'user'),
                'message_list_visibility': label.get('messageListVisibility'),
                'label_list_visibility': label.get('labelListVisibility')
            }
            for label in labels
        ]

    def mark_as_read(self, message_id: str) -> bool:
        """
        Mark an email as read.

        Args:
            message_id: Google Mail message ID

        Returns:
            Success status
        """
        self.service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()

        logger.info(f"Message {message_id} marked as read")
        return True

    def mark_as_unread(self, message_id: str) -> bool:
        """
        Mark an email as unread.

        Args:
            message_id: Google Mail message ID

        Returns:
            Success status
        """
        self.service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'addLabelIds': ['UNREAD']}
        ).execute()

        logger.info(f"Message {message_id} marked as unread")
        return True

    def delete_email(self, message_id: str) -> bool:
        """
        Delete an email permanently.

        Args:
            message_id: Google Mail message ID

        Returns:
            Success status
        """
        self.service.users().messages().delete(
            userId='me',
            id=message_id
        ).execute()

        logger.info(f"Message {message_id} deleted")
        return True

    def trash_email(self, message_id: str) -> bool:
        """
        Move an email to trash.

        Args:
            message_id: Google Mail message ID

        Returns:
            Success status
        """
        self.service.users().messages().trash(
            userId='me',
            id=message_id
        ).execute()

        logger.info(f"Message {message_id} moved to trash")
        return True

    def archive_email(self, message_id: str) -> bool:
        """
        Archive an email (remove INBOX label).

        Args:
            message_id: Google Mail message ID

        Returns:
            Success status
        """
        self.service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'removeLabelIds': ['INBOX']}
        ).execute()

        logger.info(f"Message {message_id} archived")
        return True

    def get_profile(self) -> Dict[str, Any]:
        """
        Get user's Google Mail profile information.

        Returns:
            User profile dictionary
        """
        profile = self.service.users().getProfile(userId='me').execute()
        return {
            'email_address': profile.get('emailAddress'),
            'messages_total': profile.get('messagesTotal'),
            'threads_total': profile.get('threadsTotal'),
            'history_id': profile.get('historyId')
        }

    def create_draft(
        self,
        to: str | List[str],
        subject: str,
        body: str,
        cc: Optional[str | List[str]] = None,
        bcc: Optional[str | List[str]] = None,
        html: bool = False
    ) -> Dict[str, Any]:
        """
        Create a draft email.

        Args:
            to: Recipient email address(es)
            subject: Email subject
            body: Email body content
            cc: CC recipient(s)
            bcc: BCC recipient(s)
            html: Whether body is HTML content

        Returns:
            Draft creation result
        """
        message = MIMEText(body, 'html' if html else 'plain')

        # Handle multiple recipients
        if isinstance(to, list):
            to = ', '.join(to)
        message['to'] = to

        if cc:
            if isinstance(cc, list):
                cc = ', '.join(cc)
            message['cc'] = cc

        if bcc:
            if isinstance(bcc, list):
                bcc = ', '.join(bcc)
            message['bcc'] = bcc

        message['subject'] = subject

        # Encode message
        raw_message = base64.urlsafe_b64encode(
            message.as_bytes()
        ).decode('utf-8')

        # Create draft
        draft = self.service.users().drafts().create(
            userId='me',
            body={
                'message': {
                    'raw': raw_message
                }
            }
        ).execute()

        logger.info(f"Draft created successfully: {draft['id']}")
        return {
            'success': True,
            'draft_id': draft['id'],
            'message': draft['message']
        }
