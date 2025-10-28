"""
OneDrive Connector for GenAlima (clean, minimal, functional).
OAuth2 and file operations via Microsoft Graph API.
"""
from typing import Any, Dict, List, Optional
import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

class OneDriveConnector:
    """OneDrive API connector for file operations."""
    def __init__(self, oauth2: Dict[str, Any]):
        self.access_token = oauth2.get("access_token")
        self.refresh_token = oauth2.get("refresh_token")
        self.token_uri = oauth2.get("token_uri", "https://login.microsoftonline.com/common/oauth2/v2.0/token")
        self.client_id = oauth2.get("client_id")
        self.client_secret = oauth2.get("client_secret")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        self.base = f"{GRAPH_BASE}/me/drive"

    def list_files(self, folder: str = "root", limit: int = 100) -> List[Dict[str, Any]]:
        url = f"{self.base}/items/{folder}/children"
        params = {"$top": limit}
        resp = requests.get(url, headers=self.headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json().get("value", [])

    def upload_file(self, file_name: str, content: bytes, folder_path: str = "/", conflict: str = "rename") -> Dict[str, Any]:
        url = f"{self.base}/root:/{folder_path.strip('/')}/{file_name}:/content"
        if conflict != "replace":
            url += f"?@microsoft.graph.conflictBehavior={conflict}"
        resp = requests.put(url, headers={**self.headers, "Content-Type": "application/octet-stream"}, data=content, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def create_folder(self, folder_name: str, parent: str = "root") -> Dict[str, Any]:
        url = f"{self.base}/items/{parent}/children"
        data = {"name": folder_name, "folder": {}, "@microsoft.graph.conflictBehavior": "rename"}
        resp = requests.post(url, headers=self.headers, json=data, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def delete_file(self, file_id: str) -> bool:
        url = f"{self.base}/items/{file_id}"
        resp = requests.delete(url, headers=self.headers, timeout=30)
        return resp.status_code in (204, 200)

    def search_files(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        url = f"{self.base}/search(q='{query}')"
        params = {"$top": limit}
        resp = requests.get(url, headers=self.headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json().get("value", [])
