"""
Outlook Mail Connector implementation for GenAlima.

This module provides integration with Microsoft Outlook Mail API using OAuth2 authentication.
"""

import base64
import structlog
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Any, Dict, List, Optional

import requests
from datetime import datetime, timedelta, timezone

logger = structlog.get_logger()

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class OutlookConnector:
    """Outlook (Microsoft Graph) API connector for sending, reading, and managing emails."""

    def __init__(self, credentials_data: Dict[str, Any]):
        """
        Initialize Outlook connector with OAuth2 credentials.

        Args:
            credentials_data: Dictionary containing OAuth2 credentials
        """
        self.credentials = self._extract_credentials(credentials_data)
        self.access_token = self.credentials["access_token"]
        self.refresh_token = self.credentials.get("refresh_token")
        self.token_expires = datetime.now(timezone.utc) + timedelta(
            seconds=self.credentials.get("expires_in", 3600)
        )

    def _extract_credentials(self, credentials_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract OAuth2 credentials from meta_data."""
        if "oauth2" in credentials_data:
            return credentials_data["oauth2"]
        return credentials_data

    def _headers(self) -> Dict[str, str]:
        """Return authorization headers for Microsoft Graph."""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _check_and_refresh_token(self):
        """Auto-refresh token if expired."""
        if datetime.now(timezone.utc) < self.token_expires:
            return  # still valid
        if not self.refresh_token:
            raise Exception("Refresh token not available to renew Outlook token.")

        logger.info("Refreshing Outlook access token...")
        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.credentials["client_id"],
            "client_secret": self.credentials["client_secret"],
            "scope": "https://graph.microsoft.com/.default offline_access Mail.ReadWrite Mail.Send",
        }
        resp = requests.post(token_url, data=data, timeout=30)
        if resp.status_code != 200:
            logger.error("Token refresh failed", text=resp.text)
            raise Exception("Failed to refresh token.")
        new_tokens = resp.json()
        self.access_token = new_tokens["access_token"]
        self.refresh_token = new_tokens.get("refresh_token", self.refresh_token)
        self.token_expires = datetime.now(timezone.utc) + timedelta(
            seconds=new_tokens.get("expires_in", 3600)
        )
        logger.info("Outlook access token refreshed successfully.")

    # --------------------------------------------------------------
    # Core Mail Functions
    # --------------------------------------------------------------
    def send_email(
        self,
        to: str | List[str],
        subject: str,
        body: str,
        cc: Optional[str | List[str]] = None,
        bcc: Optional[str | List[str]] = None,
        html: bool = False,
    ) -> Dict[str, Any]:
        """Send an email using Microsoft Graph API."""
        self._check_and_refresh_token()

        if isinstance(to, str):
            to = [to]
        if isinstance(cc, str):
            cc = [cc]
        if isinstance(bcc, str):
            bcc = [bcc]

        message = {
            "message": {
                "subject": subject,
                "body": {"contentType": "HTML" if html else "Text", "content": body},
                "toRecipients": [{"emailAddress": {"address": addr}} for addr in to],
                "ccRecipients": [{"emailAddress": {"address": addr}} for addr in (cc or [])],
                "bccRecipients": [{"emailAddress": {"address": addr}} for addr in (bcc or [])],
            },
            "saveToSentItems": True,
        }

        r = requests.post(f"{GRAPH_BASE}/me/sendMail", headers=self._headers(), json=message, timeout=30)
        if r.status_code not in (200, 202):
            logger.error("Outlook send failed", text=r.text)
            raise Exception("Failed to send Outlook email.")
        logger.info(f"Email sent successfully via Outlook: {subject}")
        return {"success": True, "subject": subject}

    def read_emails(self, query: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Read Outlook emails (Inbox by default)."""
        self._check_and_refresh_token()
        params = {"$top": limit, "$orderby": "receivedDateTime DESC"}
        if query:
            params["$search"] = query

        r = requests.get(f"{GRAPH_BASE}/me/messages", headers=self._headers(), params=params, timeout=30)
        if r.status_code != 200:
            logger.error("Failed to fetch emails", text=r.text)
            raise Exception("Failed to fetch emails from Outlook.")
        messages = r.json().get("value", [])
        logger.info(f"Retrieved {len(messages)} Outlook emails.")
        return [
            {
                "id": m["id"],
                "subject": m.get("subject"),
                "from": m.get("from", {}).get("emailAddress", {}).get("address"),
                "to": [r["emailAddress"]["address"] for r in m.get("toRecipients", [])],
                "receivedDateTime": m.get("receivedDateTime"),
                "isRead": m.get("isRead"),
                "bodyPreview": m.get("bodyPreview"),
            }
            for m in messages
        ]

    def get_email(self, message_id: str) -> Dict[str, Any]:
        """Retrieve a single email by ID."""
        self._check_and_refresh_token()
        r = requests.get(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self._headers(), timeout=30)
        if r.status_code != 200:
            logger.error("Failed to get email", text=r.text)
            raise Exception("Failed to get email from Outlook.")
        return r.json()

    def delete_email(self, message_id: str) -> bool:
        """Delete an Outlook email."""
        self._check_and_refresh_token()
        r = requests.delete(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self._headers(), timeout=30)
        if r.status_code not in (204, 200):
            logger.error("Failed to delete Outlook email", text=r.text)
            raise Exception("Failed to delete email.")
        logger.info(f"Deleted Outlook email: {message_id}")
        return True

    def mark_as_read(self, message_id: str) -> bool:
        """Mark email as read."""
        self._check_and_refresh_token()
        data = {"isRead": True}
        r = requests.patch(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self._headers(), json=data, timeout=30)
        if r.status_code not in (200, 204):
            raise Exception("Failed to mark email as read.")
        logger.info(f"Marked Outlook email {message_id} as read.")
        return True

    def mark_as_unread(self, message_id: str) -> bool:
        """Mark email as unread."""
        self._check_and_refresh_token()
        data = {"isRead": False}
        r = requests.patch(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self._headers(), json=data, timeout=30)
        if r.status_code not in (200, 204):
            raise Exception("Failed to mark email as unread.")
        logger.info(f"Marked Outlook email {message_id} as unread.")
        return True

    def move_to_folder(self, message_id: str, folder_id: str) -> bool:
        """Move an email to another folder."""
        self._check_and_refresh_token()
        r = requests.post(
            f"{GRAPH_BASE}/me/messages/{message_id}/move",
            headers=self._headers(),
            json={"destinationId": folder_id},
            timeout=30,
        )
        if r.status_code != 201:
            logger.error("Failed to move Outlook email", text=r.text)
            raise Exception("Failed to move email.")
        logger.info(f"Moved Outlook email {message_id} to folder {folder_id}")
        return True

    def get_folders(self) -> List[Dict[str, Any]]:
        """List user's mail folders."""
        self._check_and_refresh_token()
        r = requests.get(f"{GRAPH_BASE}/me/mailFolders", headers=self._headers(), timeout=30)
        if r.status_code != 200:
            logger.error("Failed to list folders", text=r.text)
            raise Exception("Failed to list mail folders.")
        return r.json().get("value", [])

    def get_profile(self) -> Dict[str, Any]:
        """Get Outlook user's profile info."""
        self._check_and_refresh_token()
        r = requests.get(f"{GRAPH_BASE}/me", headers=self._headers(), timeout=30)
        if r.status_code != 200:
            raise Exception("Failed to get Outlook profile.")
        user = r.json()
        return {
            "email": user.get("mail") or user.get("userPrincipalName"),
            "displayName": user.get("displayName"),
            "id": user.get("id"),
        }
