"""
Google Drive API integration for GenAlima
Handles OAuth2 authentication and Drive operations:
- Login / Callback / Refresh
- File upload, list, delete
- Folder creation
"""
import os
import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, Form, Query
from fastapi.responses import RedirectResponse, JSONResponse

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

import structlog
from app.core.db import engine as db_engine
from app.models import Connector
from sqlmodel import Session, select

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
logger = structlog.get_logger()
router = APIRouter(prefix="/google", tags=["Google Drive"])

GOOGLE_CLIENT_CONFIG = json.loads(os.getenv("GOOGLE_OAUTH_CLIENT_JSON", "{}"))
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/google/auth/callback")
SCOPES = ["https://www.googleapis.com/auth/drive"]

# -----------------------------------------------------------------------------
# GoogleDriveAPI — Internal logic layer
# -----------------------------------------------------------------------------
class GoogleDriveAPI:
    def __init__(self, connector_id: uuid.UUID):
        self.connector_id = connector_id
        self.creds = self._get_credentials()

    def _get_credentials(self) -> Credentials:
        with Session(db_engine) as s:
            conn = s.exec(select(Connector).where(Connector.id == self.connector_id)).first()
            if not conn or conn.name != "google_drive":
                raise HTTPException(404, f"Google Drive connector not found: {self.connector_id}")
            return Credentials.from_authorized_user_info(conn.meta_data)

    def _service(self):
        return build("drive", "v3", credentials=self.creds)

    def list_files(self, page_size: int = 10):
        service = self._service()
        results = service.files().list(pageSize=page_size, fields="files(id, name)").execute()
        return results.get("files", [])

    def upload_file(self, file: UploadFile, folder_id: Optional[str] = None):
        service = self._service()
        media = MediaIoBaseUpload(file.file, mimetype=file.content_type)
        metadata = {"name": file.filename}
        if folder_id:
            metadata["parents"] = [folder_id]
        uploaded = service.files().create(body=metadata, media_body=media, fields="id,name").execute()
        return uploaded

    def delete_file(self, file_id: str):
        service = self._service()
        service.files().delete(fileId=file_id).execute()
        return {"success": True, "deleted_id": file_id}

    def create_folder(self, name: str, parent_id: Optional[str] = None):
        service = self._service()
        metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent_id:
            metadata["parents"] = [parent_id]
        folder = service.files().create(body=metadata, fields="id,name").execute()
        return folder


# -----------------------------------------------------------------------------
# OAuth2 AUTH ROUTES
# -----------------------------------------------------------------------------
@router.get("/auth/login")
def login():
    flow = Flow.from_client_config(GOOGLE_CLIENT_CONFIG, scopes=SCOPES, redirect_uri=REDIRECT_URI)
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline", include_granted_scopes="true")
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
def callback(code: str):
    flow = Flow.from_client_config(GOOGLE_CLIENT_CONFIG, scopes=SCOPES, redirect_uri=REDIRECT_URI)
    flow.fetch_token(code=code)
    creds = flow.credentials

    metadata = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
    }

    connector_id = uuid.uuid4()
    with Session(db_engine) as s:
        s.add(Connector(id=connector_id, name="google_drive", meta_data=metadata))
        s.commit()

    logger.info("Google Drive connected", connector_id=str(connector_id))
    return JSONResponse({"success": True, "connector_id": str(connector_id)})


@router.get("/auth/refresh/{connector_id}")
def refresh_token(connector_id: uuid.UUID):
    api = GoogleDriveAPI(connector_id)
    creds = api.creds
    if not creds or not creds.refresh_token:
        raise HTTPException(400, "No refresh token available")
    creds.refresh()
    return {"success": True}


# -----------------------------------------------------------------------------
# DRIVE OPERATIONS ROUTES
# -----------------------------------------------------------------------------
@router.post("/files/upload")
async def upload_file(
    connector_id: uuid.UUID = Form(...),
    file: UploadFile = Form(...),
    folder_id: Optional[str] = Form(None)
):
    api = GoogleDriveAPI(connector_id)
    uploaded = api.upload_file(file, folder_id)
    return {"success": True, "file": uploaded}


@router.get("/files/list")
def list_files(connector_id: uuid.UUID = Query(...), limit: int = Query(10)):
    api = GoogleDriveAPI(connector_id)
    return {"files": api.list_files(limit)}


@router.delete("/files/{file_id}")
def delete_file(file_id: str, connector_id: uuid.UUID = Query(...)):
    api = GoogleDriveAPI(connector_id)
    return api.delete_file(file_id)


@router.post("/folders/create")
def create_folder(name: str = Form(...), connector_id: uuid.UUID = Form(...), parent_id: Optional[str] = Form(None)):
    api = GoogleDriveAPI(connector_id)
    return {"folder": api.create_folder(name, parent_id)}
