
"""
Google Drive Connector for GenAlima (minimal, clean, functional).
Handles token refresh and basic Drive operations: list, upload, delete, create folder.
"""
import time
import requests
from typing import Any, Dict, List, Optional

GOOGLE_DRIVE_BASE = "https://www.googleapis.com/drive/v3"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"

class GoogleDriveConnector:
    def __init__(self, oauth2: Dict[str, Any]):
        self.access_token = oauth2.get("access_token") or oauth2.get("token")
        self.refresh_token = oauth2.get("refresh_token")
        self.client_id = oauth2.get("client_id")
        self.client_secret = oauth2.get("client_secret")
        self.token_uri = oauth2.get("token_uri", "https://oauth2.googleapis.com/token")
        self.token_expiry = oauth2.get("token_expiry")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}

    def _refresh_if_needed(self):
        if self.token_expiry and time.time() > float(self.token_expiry) - 60:
            if not self.refresh_token:
                raise RuntimeError("No refresh token available")
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }
            resp = requests.post(self.token_uri, data=data, timeout=15)
            resp.raise_for_status()
            token_data = resp.json()
            self.access_token = token_data.get("access_token")
            self.refresh_token = token_data.get("refresh_token", self.refresh_token)
            expires_in = token_data.get("expires_in")
            if expires_in:
                self.token_expiry = time.time() + int(expires_in)
            self.headers["Authorization"] = f"Bearer {self.access_token}"

    def list_files(self, page_size: int = 10) -> List[Dict[str, Any]]:
        self._refresh_if_needed()
        params = {"pageSize": page_size, "fields": "files(id,name)"}
        resp = requests.get(f"{GOOGLE_DRIVE_BASE}/files", headers=self.headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("files", [])

    def upload_file(self, name: str, content: bytes, mime_type: str = "application/octet-stream", folder_id: Optional[str] = None) -> Dict[str, Any]:
        self._refresh_if_needed()
        metadata = {"name": name}
        if folder_id:
            metadata["parents"] = [folder_id]
        files = {
            'data': ('metadata', str(metadata), 'application/json'),
            'file': (name, content, mime_type)
        }
        resp = requests.post(UPLOAD_URL, headers={"Authorization": f"Bearer {self.access_token}"}, files=files, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def delete_file(self, file_id: str) -> bool:
        self._refresh_if_needed()
        resp = requests.delete(f"{GOOGLE_DRIVE_BASE}/files/{file_id}", headers=self.headers, timeout=15)
        return resp.status_code == 204

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> Dict[str, Any]:
        self._refresh_if_needed()
        metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent_id:
            metadata["parents"] = [parent_id]
        resp = requests.post(f"{GOOGLE_DRIVE_BASE}/files", headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}, json=metadata, timeout=15)
        resp.raise_for_status()
        return resp.json()
