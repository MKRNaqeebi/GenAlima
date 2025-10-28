
"""
Google Drive tools for LangGraph/GenAlima.
This module provides tools for interacting with Google Drive API: list, upload, delete files, create folder.
"""
from typing import Any, Dict, List, Optional, Type
import uuid
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog
from app.core.db import engine as db_engine
from app.models import Connector
from connectors.google_drive_connector import GoogleDriveConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()

def get_drive_connector(connector_id: uuid.UUID) -> Optional[GoogleDriveConnector]:
    if not connector_id:
        return None
    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()
        if not connector or connector.name != 'google_drive':
            logger.error(f"Google Drive connector not found: {connector_id}")
            return None
        return GoogleDriveConnector(connector.meta_data)

class ListFilesInput(BaseModel):
    connector_id: uuid.UUID = Field(description="Google Drive connector ID")
    page_size: int = Field(10, description="Number of files to list")

class ListFilesTool(BaseTool):
    name: str = "drive_list_files"
    description: str = "List files in Google Drive."
    args_schema: Type[BaseModel] = ListFilesInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, page_size: int = 10, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        files = connector.list_files(page_size=page_size)
        if not files:
            return "No files found."
        formatted = f"Found {len(files)} file(s):\n\n"
        for idx, f in enumerate(files, 1):
            formatted += f"File {idx}:\n- Name: {f['name']}\n- ID: {f['id']}\n\n"
        return formatted

class UploadFileInput(BaseModel):
    connector_id: uuid.UUID = Field(description="Google Drive connector ID")
    name: str = Field(description="Name of the file to upload")
    content: bytes = Field(description="File content (bytes)")
    mime_type: str = Field("application/octet-stream", description="MIME type")
    folder_id: Optional[str] = Field(None, description="Parent folder ID (optional)")

class UploadFileTool(BaseTool):
    name: str = "drive_upload_file"
    description: str = "Upload a file to Google Drive."
    args_schema: Type[BaseModel] = UploadFileInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, name: str, content: bytes, mime_type: str = "application/octet-stream", folder_id: Optional[str] = None, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        file = connector.upload_file(name, content, mime_type, folder_id)
        # Store metadata
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"name": name, "mime_type": mime_type, "folder_id": folder_id, "connector_id": str(connector_id)}, "output": file}
        )
        return f"File uploaded: {file.get('name')} (ID: {file.get('id')})"

class DeleteFileInput(BaseModel):
    connector_id: uuid.UUID = Field(description="Google Drive connector ID")
    file_id: str = Field(description="ID of the file to delete")

class DeleteFileTool(BaseTool):
    name: str = "drive_delete_file"
    description: str = "Delete a file from Google Drive by file ID."
    args_schema: Type[BaseModel] = DeleteFileInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, file_id: str, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        success = connector.delete_file(file_id)
        # Store metadata
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"file_id": file_id, "connector_id": str(connector_id)}, "output": {"success": success}}
        )
        return "File deleted successfully." if success else "Failed to delete file."

class CreateFolderInput(BaseModel):
    connector_id: uuid.UUID = Field(description="Google Drive connector ID")
    name: str = Field(description="Name of the folder to create")
    parent_id: Optional[str] = Field(None, description="Parent folder ID (optional)")

class CreateFolderTool(BaseTool):
    name: str = "drive_create_folder"
    description: str = "Create a folder in Google Drive."
    args_schema: Type[BaseModel] = CreateFolderInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, name: str, parent_id: Optional[str] = None, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        folder = connector.create_folder(name, parent_id)
        # Store metadata
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"name": name, "parent_id": parent_id, "connector_id": str(connector_id)}, "output": folder}
        )
        return f"Folder created: {folder.get('name')} (ID: {folder.get('id')})"

# Initialize tool instances
drive_list_files_tool = ListFilesTool()
drive_upload_file_tool = UploadFileTool()
drive_delete_file_tool = DeleteFileTool()
drive_create_folder_tool = CreateFolderTool()
"""
Google Drive tools for LangGraph/GenAlima.
Implements file list, upload, download, delete, and search tools using GoogleDriveConnector.
"""
from typing import Any, Dict, List, Optional, Type, Union
import uuid
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog
from app.core.db import engine as db_engine
from app.models import Connector
from connectors.google_drive_connector import GoogleDriveConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()

def get_drive_connector(connector_id: uuid.UUID) -> Optional[GoogleDriveConnector]:
    if not connector_id:
        return None
    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()
        if not connector or connector.name != 'google_drive':
            logger.error(f"Google Drive connector not found: {connector_id}")
            return None
        return GoogleDriveConnector(connector.meta_data)

class ListFilesInput(BaseModel):
    connector_id: uuid.UUID = Field(description="The ID of the Google Drive connector")
    query: Optional[str] = Field(None, description="Search query for files (Drive API q syntax)")
    page_size: int = Field(10, description="Number of files to list")

class ListFilesTool(BaseTool):
    name: str = "drive_list_files"
    description: str = "List files in Google Drive. Optionally filter with a query."
    args_schema: Type[BaseModel] = ListFilesInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, query: Optional[str] = None, page_size: int = 10, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        files = connector.list_files(q=query, page_size=page_size)
        if not files:
            return "No files found."
        return "\n".join(f"{f['name']} (ID: {f['id']}, Type: {f['mimeType']})" for f in files)

class DeleteFileInput(BaseModel):
    connector_id: uuid.UUID = Field(description="The ID of the Google Drive connector")
    file_id: str = Field(description="ID of the file to delete")

class DeleteFileTool(BaseTool):
    name: str = "drive_delete_file"
    description: str = "Delete a file from Google Drive by file ID."
    args_schema: Type[BaseModel] = DeleteFileInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, file_id: str, **kwargs) -> str:
        connector = get_drive_connector(connector_id)
        if not connector:
            return "Failed to initialize Google Drive connector"
        success = connector.delete_file(file_id)
        return "File deleted successfully." if success else "Failed to delete file."

# You can add more tools (upload, download, search) following this pattern.
