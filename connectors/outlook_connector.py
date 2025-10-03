"""
Outlook Mail Connector implementation for GenAlima.

This module provides integration with Outlook / Microsoft 365 using OAuth2 credentials.
"""

import base64
from typing import Any, Dict, List, Optional
import structlog
import httpx

logger = structlog.get_logger()


class OutlookMailConnector:
    """Outlook / Microsoft 365 connector for sending and reading emails."""

    def __init__(self, credentials_data: Dict[str, Any]):
        """
        Initialize Outlook connector with OAuth2 credentials.

        Args:
            credentials_data: Dictionary containing OAuth2 credentials
        """
        self.access_token = credentials_data.get("access_token")
        self.refresh_token = credentials_data.get("refresh_token")
        self.client_id = credentials_data.get("client_id")
        self.client_secret = credentials_data.get("client_secret")
        self.token_uri = credentials_data.get(
            "token_uri", "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        )
        self.user_email = credentials_data.get("user_email")

    async def _headers(self) -> Dict[str, str]:
        """Return authorization headers."""
        return {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}

    async def refresh_access_token(self) -> Dict[str, Any]:
        """
        Refresh the access token using the refresh token.
        """
        data = {
            "client_id": self.client_id,
            "scope": "offline_access Mail.ReadWrite Mail.Send",
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
            "client_secret": self.client_secret,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.token_uri, data=data)
            resp.raise_for_status()
            token_data = resp.json()
            self.access_token = token_data["access_token"]
            self.refresh_token = token_data.get("refresh_token", self.refresh_token)
            profile = await self.get_profile()
            logger.info("Successfully refreshed access token")
            return profile

    async def send_email(
        self,
        to: str | List[str],
        subject: str,
        body: str,
        cc: Optional[str | List[str]] = None,
        bcc: Optional[str | List[str]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        html: bool = False,
    ) -> Dict[str, Any]:
        """Send an email via Outlook."""
        if isinstance(to, list):
            to = [{"emailAddress": {"address": addr}} for addr in to]
        else:
            to = [{"emailAddress": {"address": to}}]

        message = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML" if html else "Text",
                    "content": body,
                },
                "toRecipients": to,
            }
        }

        if cc:
            cc = cc if isinstance(cc, list) else [cc]
            message["message"]["ccRecipients"] = [{"emailAddress": {"address": addr}} for addr in cc]

        if bcc:
            bcc = bcc if isinstance(bcc, list) else [bcc]
            message["message"]["bccRecipients"] = [{"emailAddress": {"address": addr}} for addr in bcc]

        if attachments:
            message["message"]["attachments"] = [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": a["filename"],
                    "contentBytes": base64.b64encode(a["content"]).decode("utf-8"),
                }
                for a in attachments
            ]

        url = "https://graph.microsoft.com/v1.0/me/sendMail"
        payload = {**message, "saveToSentItems": "true"}

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=await self._headers())
            if resp.status_code == 401:  # expired token
                await self.refresh_access_token()
                resp = await client.post(url, json=payload, headers=await self._headers())
            resp.raise_for_status()
        logger.info("Email sent successfully", to=to)
        return {"success": True}

    async def create_draft(
        self,
        to: str | List[str],
        subject: str,
        body: str,
        cc: Optional[str | List[str]] = None,
        bcc: Optional[str | List[str]] = None,
        html: bool = False,
    ) -> Dict[str, Any]:
        """Create an email draft in Outlook."""
        if isinstance(to, list):
            to = [{"emailAddress": {"address": addr}} for addr in to]
        else:
            to = [{"emailAddress": {"address": to}}]

        message = {
            "subject": subject,
            "body": {
                "contentType": "HTML" if html else "Text",
                "content": body,
            },
            "toRecipients": to,
        }

        url = "https://graph.microsoft.com/v1.0/me/messages"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=message, headers=await self._headers())
            resp.raise_for_status()
            draft = resp.json()
        return {"success": True, "draft_id": draft["id"], "message": draft}

    async def read_emails(self, query: Optional[str] = None, max_results: int = 10) -> List[Dict[str, Any]]:
        """Read emails from Outlook inbox."""
        url = f"https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top={max_results}"
        if query:
            url += f"&$search=\"{query}\""
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=await self._headers())
            resp.raise_for_status()
            data = resp.json()
        return data.get("value", [])

    async def mark_as_read(self, message_id: str) -> bool:
        """Mark an email as read."""
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
        payload = {"isRead": True}
        async with httpx.AsyncClient() as client:
            resp = await client.patch(url, json=payload, headers=await self._headers())
            resp.raise_for_status()
        return True

    async def mark_as_unread(self, message_id: str) -> bool:
        """Mark an email as unread."""
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
        payload = {"isRead": False}
        async with httpx.AsyncClient() as client:
            resp = await client.patch(url, json=payload, headers=await self._headers())
            resp.raise_for_status()
        return True

    async def delete_email(self, message_id: str) -> bool:
        """Delete an email permanently."""
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, headers=await self._headers())
            resp.raise_for_status()
        return True

    async def archive_email(self, message_id: str) -> bool:
        """Move an email to Archive folder."""
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}/move"
        payload = {"destinationId": "archive"}
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=await self._headers())
            resp.raise_for_status()
        return True

    async def get_profile(self) -> Dict[str, Any]:
        """Get Outlook profile information."""
        url = "https://graph.microsoft.com/v1.0/me"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=await self._headers())
            resp.raise_for_status()
            profile = resp.json()
        return {
            "email": profile.get("userPrincipalName"),
            "displayName": profile.get("displayName"),
            "id": profile.get("id"),
        }

    async def get_folders(self) -> List[Dict[str, Any]]:
        """Get mail folders for the user."""
        url = "https://graph.microsoft.com/v1.0/me/mailFolders"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=await self._headers())
            resp.raise_for_status()
            data = resp.json()
        return data.get("value", [])


OutlookConnector = OutlookMailConnector