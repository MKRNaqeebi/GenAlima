"""
Outlook Mail Connector using Microsoft Graph (basic read/write/send/delete).
Handles token refresh when refresh_token is present.
"""


import time
import requests
from typing import Any, Dict, List, Optional


GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class OutlookMailConnector:
    def __init__(self, oauth2_data: Dict[str, Any]):
        # oauth2_data expected to contain: access_token, refresh_token(optional), token_uri, client_id, client_secret, token_expiry (epoch)
        self.oauth2 = oauth2_data
        self.access_token = oauth2_data.get("access_token")
        self.refresh_token = oauth2_data.get("refresh_token")
        self.client_id = oauth2_data.get("client_id")
        self.client_secret = oauth2_data.get("client_secret")
        self.token_uri = oauth2_data.get("token_uri", "https://login.microsoftonline.com/common/oauth2/v2.0/token")
        self.user_email = oauth2_data.get("user_email")
        self.headers = {"Content-Type": "application/json"}
        if self.access_token:
            self.headers["Authorization"] = f"Bearer {self.access_token}"


    def _refresh_if_needed(self):
        expiry = self.oauth2.get("token_expiry")
        if expiry and time.time() > float(expiry) - 60:
            # refresh
            if not self.refresh_token:
                raise RuntimeError("No refresh token available")
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }
            resp = requests.post(self.token_uri, data=data, timeout=15)
            if not resp.ok:
                raise RuntimeError("Failed to refresh token: " + resp.text)
            token_data = resp.json()
            self.access_token = token_data.get("access_token")
            self.refresh_token = token_data.get("refresh_token", self.refresh_token)
            expires_in = token_data.get("expires_in")
            if expires_in:
                self.oauth2["token_expiry"] = time.time() + int(expires_in)
            self.oauth2["access_token"] = self.access_token
            self.oauth2["refresh_token"] = self.refresh_token
            # update header
            self.headers["Authorization"] = f"Bearer {self.access_token}"


    def _get(self, path: str, params: Optional[dict] = None):
        self._refresh_if_needed()
        resp = requests.get(GRAPH_BASE + path, headers=self.headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()


    def _post(self, path: str, json_payload: dict):
        self._refresh_if_needed()
        resp = requests.post(GRAPH_BASE + path, headers=self.headers, json=json_payload, timeout=15)
        if not resp.ok:
            return False, resp.json() if resp.content else {}
        return True, resp.json() if resp.content else {}


    def read_emails(self, folder: str = "Inbox", top: int = 10, query: Optional[str] = None) -> List[Dict[str, Any]]:
        # Graph: /me/mailFolders/{id}/messages
        params = {"$top": top}
        if query:
            # Graph uses $search (requires special headers) or filter. Keep simple: use $filter on subject/body fallback is limited.
            params["$search"] = query
        path = f"/me/mailFolders/{folder}/messages"
        data = self._get(path, params=params)
        return data.get("value", [])


    def send_email(self, to, subject, body, html=False, cc=None, bcc=None):
        if isinstance(to, str):
            to = [to]
        recipients = [{"emailAddress": {"address": addr}} for addr in to]
        if cc:
            if isinstance(cc, str): cc = [cc]
            cc_recip = [{"emailAddress": {"address": addr}} for addr in cc]
        else:
            cc_recip = []
        if bcc:
            if isinstance(bcc, str): bcc = [bcc]
            bcc_recip = [{"emailAddress": {"address": addr}} for addr in bcc]
        else:
            bcc_recip = []
        content_type = "HTML" if html else "Text"
        message = {
            "message": {
                "subject": subject,
                "body": {"contentType": content_type, "content": body},
                "toRecipients": recipients,
                "ccRecipients": cc_recip,
                "bccRecipients": bcc_recip
            },
            "saveToSentItems": "true"
        }
        ok, res = self._post("/me/sendMail", message)
        return {"success": ok, "response": res}


    def delete_email(self, message_id: str) -> bool:
        self._refresh_if_needed()
        resp = requests.delete(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self.headers, timeout=15)
        return resp.ok


    def trash_email(self, message_id: str) -> bool:
        # move to Deleted Items folder
        self._refresh_if_needed()
        body = {"DestinationId": "deleteditems"}  # Graph uses move endpoint for messages
        resp = requests.post(f"{GRAPH_BASE}/me/messages/{message_id}/move", headers=self.headers, json=body, timeout=15)
        return resp.ok


    def create_event(
        self,
        subject: str,
        start_time: str,
        end_time: str,
        attendees: Optional[List[str]] = None,
        location: Optional[str] = None,
        body: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a calendar event."""
        self._refresh_if_needed()
        event = {
            "subject": subject,
            "start": {"dateTime": start_time, "timeZone": "UTC"},
            "end": {"dateTime": end_time, "timeZone": "UTC"},
        }
        if attendees:
            event["attendees"] = [
                {"emailAddress": {"address": addr}} for addr in attendees
            ]
        if location:
            event["location"] = {"displayName": location}
        if body:
            event["body"] = {"contentType": "HTML", "content": body}

        ok, res = self._post("/me/events", event)
        if ok:
            return {"success": True, "event_id": res.get("id"), "response": res}
        return {"success": False, "error": res}

    def get_profile(self) -> dict:
        """Get user profile information."""
        self._refresh_if_needed()
        resp = requests.get(f"{GRAPH_BASE}/me", headers=self.headers, timeout=15)
        resp.raise_for_status()
        return resp.json()


    def mark_as_read(self, message_id: str) -> bool:
        """Mark a message as read."""
        self._refresh_if_needed()
        body = {"isRead": True}
        resp = requests.patch(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self.headers, json=body, timeout=15)
        return resp.ok


    def mark_as_unread(self, message_id: str) -> bool:
        """Mark a message as unread."""
        self._refresh_if_needed()
        body = {"isRead": False}
        resp = requests.patch(f"{GRAPH_BASE}/me/messages/{message_id}", headers=self.headers, json=body, timeout=15)
        return resp.ok


    def get_folders(self) -> List[Dict[str, Any]]:
        """Get all mail folders."""
        self._refresh_if_needed()
        resp = requests.get(f"{GRAPH_BASE}/me/mailFolders", headers=self.headers, timeout=15)
        resp.raise_for_status()
        return resp.json().get("value", [])


    def create_draft(self, to, subject: str, body: str, html: bool = False, cc=None, bcc=None) -> Dict[str, Any]:
        """Create a draft message."""
        self._refresh_if_needed()
        if isinstance(to, str):
            to = [to]
        message = {
            "subject": subject,
            "body": {
                "contentType": "HTML" if html else "Text",
                "content": body
            },
            "toRecipients": [{"emailAddress": {"address": addr}} for addr in to],
            "ccRecipients": [{"emailAddress": {"address": addr}} for addr in (cc if cc else [])],
            "bccRecipients": [{"emailAddress": {"address": addr}} for addr in (bcc if bcc else [])]
        }
        resp = requests.post(f"{GRAPH_BASE}/me/messages", headers=self.headers, json=message, timeout=15)
        if not resp.ok:
            return {"success": False, "error": resp.text}
        draft_data = resp.json()
        return {"success": True, "draft_id": draft_data.get("id"), "draft": draft_data}


    def archive_email(self, message_id: str) -> bool:
        """Archive a message (move to Archive folder)."""
        self._refresh_if_needed()
        # First, get the Archive folder ID
        resp = requests.get(f"{GRAPH_BASE}/me/mailFolders", headers=self.headers, params={"$filter": "displayName eq 'Archive'"}, timeout=15)
        if not resp.ok:
            return False
        folders = resp.json().get("value", [])
        if not folders:
            return False
        archive_id = folders[0]["id"]
        # Move message to Archive folder
        body = {"destinationId": archive_id}
        resp = requests.post(f"{GRAPH_BASE}/me/messages/{message_id}/move", headers=self.headers, json=body, timeout=15)
        return resp.ok