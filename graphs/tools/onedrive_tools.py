"""
OneDrive tools for LangGraph/GenAlima.
This module provides tools for interacting with OneDrive API: list, upload, delete files, create folder, search files.
"""
from typing import Any, Dict, List, Optional, Type
import uuid
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog
from app.core.db import engine as db_engine
from app.models import Connector
from connectors.onedrive_connector import OneDriveConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()

def get_onedrive_connector(connector_id: uuid.UUID) -> Optional[OneDriveConnector]:
    if not connector_id:
        return None
    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()
        if not connector or connector.name != 'onedrive':
            logger.error(f"OneDrive connector not found: {connector_id}")
            return None
        return OneDriveConnector(connector.meta_data)

class ListFilesInput(BaseModel):
    connector_id: uuid.UUID = Field(description="OneDrive connector ID")
    folder: str = Field("root", description="Folder ID or 'root'")
    limit: int = Field(10, description="Number of files to list")

class ListFilesTool(BaseTool):
    name: str = "onedrive_list_files"
    description: str = "List files in OneDrive folder."
    args_schema: Type[BaseModel] = ListFilesInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, folder: str = "root", limit: int = 10, **kwargs) -> str:
        connector = get_onedrive_connector(connector_id)
        if not connector:
            return "Failed to initialize OneDrive connector"
        files = connector.list_files(folder=folder, limit=limit)
        if not files:
            return "No files found."
        formatted = f"Found {len(files)} file(s):\n\n"
        for idx, f in enumerate(files, 1):
            formatted += f"File {idx}:\n- Name: {f['name']}\n- ID: {f['id']}\n\n"
        return formatted

class UploadFileInput(BaseModel):
    connector_id: uuid.UUID = Field(description="OneDrive connector ID")
    file_name: str = Field(description="Name of the file to upload")
    content: bytes = Field(description="File content (bytes)")
    folder_path: str = Field("/", description="Folder path (default: root)")
    conflict: str = Field("rename", description="Conflict behavior: rename, fail, replace")

class UploadFileTool(BaseTool):
    name: str = "onedrive_upload_file"
    description: str = "Upload a file to OneDrive."
    args_schema: Type[BaseModel] = UploadFileInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, file_name: str, content: bytes, folder_path: str = "/", conflict: str = "rename", **kwargs) -> str:
        connector = get_onedrive_connector(connector_id)
        if not connector:
            return "Failed to initialize OneDrive connector"
        file = connector.upload_file(file_name, content, folder_path, conflict)
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"file_name": file_name, "folder_path": folder_path, "conflict": conflict, "connector_id": str(connector_id)}, "output": file}
        )
        return f"File uploaded: {file.get('name')} (ID: {file.get('id')})"

class DeleteFileInput(BaseModel):
    connector_id: uuid.UUID = Field(description="OneDrive connector ID")
    file_id: str = Field(description="ID of the file to delete")

class DeleteFileTool(BaseTool):
    name: str = "onedrive_delete_file"
    description: str = "Delete a file from OneDrive by file ID."
    args_schema: Type[BaseModel] = DeleteFileInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, file_id: str, **kwargs) -> str:
        connector = get_onedrive_connector(connector_id)
        if not connector:
            return "Failed to initialize OneDrive connector"
        success = connector.delete_file(file_id)
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"file_id": file_id, "connector_id": str(connector_id)}, "output": {"success": success}}
        )
        return "File deleted successfully." if success else "Failed to delete file."

class CreateFolderInput(BaseModel):
    connector_id: uuid.UUID = Field(description="OneDrive connector ID")
    folder_name: str = Field(description="Name of the folder to create")
    parent: str = Field("root", description="Parent folder ID (default: root)")

class CreateFolderTool(BaseTool):
    name: str = "onedrive_create_folder"
    description: str = "Create a folder in OneDrive."
    args_schema: Type[BaseModel] = CreateFolderInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, folder_name: str, parent: str = "root", **kwargs) -> str:
        connector = get_onedrive_connector(connector_id)
        if not connector:
            return "Failed to initialize OneDrive connector"
        folder = connector.create_folder(folder_name, parent)
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"folder_name": folder_name, "parent": parent, "connector_id": str(connector_id)}, "output": folder}
        )
        return f"Folder created: {folder.get('name')} (ID: {folder.get('id')})"

class SearchFilesInput(BaseModel):
    connector_id: uuid.UUID = Field(description="OneDrive connector ID")
    query: str = Field(description="Search query string")
    limit: int = Field(10, description="Number of results to return")

class SearchFilesTool(BaseTool):
    name: str = "onedrive_search_files"
    description: str = "Search files in OneDrive by query string."
    args_schema: Type[BaseModel] = SearchFilesInput
    return_direct: bool = False

    def _run(self, connector_id: uuid.UUID, query: str, limit: int = 10, **kwargs) -> str:
        connector = get_onedrive_connector(connector_id)
        if not connector:
            return "Failed to initialize OneDrive connector"
        files = connector.search_files(query, limit)
        store_tool_result_metadata(
            str(uuid.uuid4()), self.name,
            {"input": {"query": query, "limit": limit, "connector_id": str(connector_id)}, "output": files}
        )
        if not files:
            return "No files found."
        formatted = f"Found {len(files)} file(s) matching '{query}':\n\n"
        for idx, f in enumerate(files, 1):
            formatted += f"File {idx}:\n- Name: {f['name']}\n- ID: {f['id']}\n\n"
        return formatted

# Initialize tool instances
onedrive_list_files_tool = ListFilesTool()
onedrive_upload_file_tool = UploadFileTool()
onedrive_delete_file_tool = DeleteFileTool()
onedrive_create_folder_tool = CreateFolderTool()
onedrive_search_files_tool = SearchFilesTool()
