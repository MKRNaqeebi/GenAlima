"""
Notion tools for LangGraph.

This module provides tools for interacting with Notion API, including
searching, creating, updating pages and databases.
"""
# pylint: disable=too-many-positional-arguments

from typing import Dict, List, Optional, Type
import uuid

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog

from app.core.db import engine as db_engine
from app.models import Connector
from connectors.notion_connector import NotionConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()


def get_notion_connector(connector_id: uuid.UUID) -> Optional[NotionConnector]:
    """Get the Notion connector from database."""
    if not connector_id:
        return None

    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'notion':
            logger.error(f"Notion connector not found: {connector_id}")
            return None

        return NotionConnector(connector.meta_data)


class NotionSearchInput(BaseModel):
    """Input schema for the Notion search tool."""
    query: Optional[str] = Field(None, description="Text to search for in Notion")
    filter_type: Optional[str] = Field(None, description="Filter by 'page' or 'database'")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    limit: int = Field(10, description="Maximum number of results")


class NotionSearchTool(BaseTool):
    """Tool that searches for pages and databases in Notion."""
    name: str = "notion_search"
    description: str = (
        "Search for pages and databases in Notion workspace. "
        "Can search by text query or filter by object type. "
        "Returns matching pages and databases with their properties."
    )
    args_schema: Type[BaseModel] = NotionSearchInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        query: Optional[str] = None,
        filter_type: Optional[str] = None,
        limit: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the search operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        result = connector.search(
            query=query,
            filter_type=filter_type,
            limit=limit
        )

        if not result.get("success"):
            return f"Search failed: {result.get('error', 'Unknown error')}"

        if result["count"] == 0:
            return f"No results found{' for query: ' + query if query else ''}"

        # Format results
        formatted_results = f"Found {result['count']} result(s):\n\n"
        for idx, item in enumerate(result["results"], 1):
            obj_type = item.get("object", "unknown")
            title = "Untitled"

            # Extract title based on object type
            if obj_type == "page":
                props = item.get("properties", {})
                for prop in props.values():
                    if prop.get("type") == "title" and prop.get("title"):
                        title = prop["title"][0].get("plain_text", "Untitled") if prop["title"] else "Untitled"
                        break
            elif obj_type == "database":
                title_arr = item.get("title", [])
                if title_arr and isinstance(title_arr, list):
                    title = title_arr[0].get("plain_text", "Untitled") if title_arr else "Untitled"
            formatted_results += (
                f"{idx}. [{obj_type.upper()}] {title}\n"
                f"   ID: {item['id']}\n"
                f"   URL: {item.get('url', 'N/A')}\n"
                f"   Last edited: {item.get('last_edited_time', 'N/A')}\n\n"
            )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "query": query,
                    "filter_type": filter_type,
                    "limit": limit,
                    "connector_id": str(connector_id)
                },
                "output": {
                    "count": result["count"],
                    "results": result["results"][:3]  # Store first 3 for reference
                }
            }
        )

        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        query: Optional[str] = None,
        filter_type: Optional[str] = None,
        limit: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of search."""
        return self._run(
            message_id=message_id,
            connector_id=connector_id,
            query=query,
            filter_type=filter_type,
            limit=limit,
            run_manager=run_manager,
        )


class CreatePageInput(BaseModel):
    """Input schema for the create page tool."""
    parent_id: str = Field(description="Parent page or database ID")
    title: str = Field(description="Page title")
    content: Optional[str] = Field(None, description="Page content (plain text)")
    icon: Optional[str] = Field(None, description="Page icon (emoji or URL)")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class CreatePageTool(BaseTool):
    """Tool that creates a new page in Notion."""
    name: str = "notion_create_page"
    description: str = (
        "Create a new page in Notion. "
        "Can be created as a child of another page or in a database. "
        "Supports adding title, content, and icon."
    )
    args_schema: Type[BaseModel] = CreatePageInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        parent_id: str,
        title: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        content: Optional[str] = None,
        icon: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create page operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        result = connector.create_page(
            parent_id=parent_id,
            title=title,
            content=content,
            icon=icon
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "parent_id": parent_id,
                    "title": title,
                    "has_content": bool(content),
                    "has_icon": bool(icon),
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            return (
                f"Page '{title}' created successfully!\n"
                f"Page ID: {result['page_id']}\n"
                f"URL: {result.get('url', 'N/A')}"
            )
        return f"Failed to create page: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        parent_id: str,
        title: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        content: Optional[str] = None,
        icon: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of create page."""
        return self._run(
            parent_id=parent_id,
            title=title,
            message_id=message_id,
            connector_id=connector_id,
            content=content,
            icon=icon,
            run_manager=run_manager,
        )


class UpdatePageInput(BaseModel):
    """Input schema for the update page tool."""
    page_id: str = Field(description="The ID of the page to update")
    title: Optional[str] = Field(None, description="New page title")
    archived: Optional[bool] = Field(None, description="Archive/unarchive the page")
    icon: Optional[str] = Field(None, description="New page icon (emoji or URL)")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class UpdatePageTool(BaseTool):
    """Tool that updates a page in Notion."""
    name: str = "notion_update_page"
    description: str = (
        "Update an existing page in Notion. "
        "Can update title, icon, or archive status."
    )
    args_schema: Type[BaseModel] = UpdatePageInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        page_id: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        title: Optional[str] = None,
        archived: Optional[bool] = None,
        icon: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the update page operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        # Build properties if title is provided
        properties = None
        if title:
            properties = {
                "title": {
                    "title": [
                        {
                            "text": {
                                "content": title
                            }
                        }
                    ]
                }
            }

        result = connector.update_page(
            page_id=page_id,
            properties=properties,
            archived=archived,
            icon=icon
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "page_id": page_id,
                    "title": title,
                    "archived": archived,
                    "icon": icon,
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            updates = []
            if title:
                updates.append(f"title to '{title}'")
            if archived is not None:
                updates.append(f"archived to {archived}")
            if icon:
                updates.append(f"icon to '{icon}'")

            update_str = ", ".join(updates) if updates else "no changes"
            return f"Page {page_id} updated successfully! Changes: {update_str}"
        return f"Failed to update page: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        page_id: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        title: Optional[str] = None,
        archived: Optional[bool] = None,
        icon: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of update page."""
        return self._run(
            page_id=page_id,
            message_id=message_id,
            connector_id=connector_id,
            title=title,
            archived=archived,
            icon=icon,
            run_manager=run_manager,
        )


class QueryDatabaseInput(BaseModel):
    """Input schema for the query database tool."""
    database_id: str = Field(description="The ID of the database to query")
    filter_conditions: Optional[Dict] = Field(None, description="Filter conditions for the query")
    sorts: Optional[List[Dict]] = Field(None, description="Sort conditions for the query")
    limit: int = Field(10, description="Maximum number of results")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class QueryDatabaseTool(BaseTool):
    """Tool that queries a database in Notion."""
    name: str = "notion_query_database"
    description: str = (
        "Query a database in Notion to retrieve pages. "
        "Supports filtering and sorting. "
        "Returns pages that match the query criteria."
    )
    args_schema: Type[BaseModel] = QueryDatabaseInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        database_id: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        filter_conditions: Optional[Dict] = None,
        sorts: Optional[List[Dict]] = None,
        limit: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the query database operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        result = connector.query_database(
            database_id=database_id,
            filter_conditions=filter_conditions,
            sorts=sorts,
            limit=limit
        )

        if not result.get("success"):
            return f"Query failed: {result.get('error', 'Unknown error')}"

        if result["count"] == 0:
            return "No pages found in the database"

        # Format results
        formatted_results = f"Found {result['count']} page(s) in database:\n\n"
        for idx, page in enumerate(result["results"], 1):
            # Extract title from properties
            title = "Untitled"
            props = page.get("properties", {})
            for prop in props.values():
                if prop.get("type") == "title" and prop.get("title"):
                    title = prop["title"][0].get("plain_text", "Untitled") if prop["title"] else "Untitled"
                    break
            formatted_results += (
                f"{idx}. {title}\n"
                f"   ID: {page['id']}\n"
                f"   URL: {page.get('url', 'N/A')}\n"
                f"   Created: {page.get('created_time', 'N/A')}\n\n"
            )

        if result.get("has_more"):
            formatted_results += f"Note: More results available beyond the {limit} limit.\n"

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "database_id": database_id,
                    "has_filter": bool(filter_conditions),
                    "has_sorts": bool(sorts),
                    "limit": limit,
                    "connector_id": str(connector_id)
                },
                "output": {
                    "count": result["count"],
                    "has_more": result.get("has_more", False)
                }
            }
        )

        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        database_id: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        filter_conditions: Optional[Dict] = None,
        sorts: Optional[List[Dict]] = None,
        limit: int = 10,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of query database."""
        return self._run(
            database_id=database_id,
            message_id=message_id,
            connector_id=connector_id,
            filter_conditions=filter_conditions,
            sorts=sorts,
            limit=limit,
            run_manager=run_manager,
        )


class AppendBlocksInput(BaseModel):
    """Input schema for the append blocks tool."""
    block_id: str = Field(description="Parent block/page ID to append to")
    content: str = Field(description="Text content to append")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")


class AppendBlocksTool(BaseTool):
    """Tool that appends content to a page or block in Notion."""
    name: str = "notion_append_blocks"
    description: str = (
        "Append text content to an existing page or block in Notion. "
        "The content will be added as paragraph blocks."
    )
    args_schema: Type[BaseModel] = AppendBlocksInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        block_id: str,
        content: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the append blocks operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        # Convert content to paragraph blocks
        paragraphs = content.split('\n\n')
        children = []
        for para in paragraphs:
            if para.strip():
                children.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": para.strip()
                                }
                            }
                        ]
                    }
                })

        if not children:
            return "No content to append"

        result = connector.append_block_children(
            block_id=block_id,
            children=children
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "block_id": block_id,
                    "content_length": len(content),
                    "blocks_count": len(children),
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            return f"Successfully appended {result['blocks_added']} block(s) to {block_id}"
        return f"Failed to append blocks: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        block_id: str,
        content: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of append blocks."""
        return self._run(
            block_id=block_id,
            content=content,
            message_id=message_id,
            connector_id=connector_id,
            run_manager=run_manager,
        )


class GetUserInput(BaseModel):
    """Input schema for the get user tool."""
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    user_id: Optional[str] = Field(None, description="User ID (if None, gets current user)")


class GetUserTool(BaseTool):
    """Tool that gets user information from Notion."""
    name: str = "notion_get_user"
    description: str = (
        "Get user information from Notion. "
        "Can get current user or a specific user by ID."
    )
    args_schema: Type[BaseModel] = GetUserInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        user_id: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the get user operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_notion_connector(connector_id)
        if not connector:
            return "Failed to initialize Notion connector"

        result = connector.get_user(user_id=user_id)

        if not result.get("success"):
            return f"Failed to get user: {result.get('error', 'Unknown error')}"

        user = result["user"]
        user_type = "Current user" if not user_id else f"User {user_id}"
        formatted_result = (
            f"{user_type} information:\n\n"
            f"Name: {user.get('name', 'N/A')}\n"
            f"Email: {user.get('person', {}).get('email', 'N/A')}\n"
            f"Type: {user.get('type', 'N/A')}\n"
            f"ID: {user.get('id', 'N/A')}\n"
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "user_id": user_id,
                    "connector_id": str(connector_id)
                },
                "output": user
            }
        )

        return formatted_result

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        user_id: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of get user."""
        return self._run(
            message_id=message_id,
            connector_id=connector_id,
            user_id=user_id,
            run_manager=run_manager,
        )


# Initialize tool instances
notion_search_tool = NotionSearchTool()
notion_create_page_tool = CreatePageTool()
notion_update_page_tool = UpdatePageTool()
notion_query_database_tool = QueryDatabaseTool()
notion_append_blocks_tool = AppendBlocksTool()
notion_get_user_tool = GetUserTool()
