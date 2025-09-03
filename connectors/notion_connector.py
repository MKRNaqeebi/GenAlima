"""
Notion Connector implementation for GenAlima.

This module provides integration with Notion API using API key authentication.
"""

from typing import Any, Dict, List, Optional, Union
import requests
import structlog

logger = structlog.get_logger()


class NotionConnector:
    """Notion API connector for managing pages, databases, and blocks."""

    def __init__(self, credentials_data: Dict[str, Any]):
        """
        Initialize Notion connector with API credentials.

        Args:
            credentials_data: Dictionary containing API credentials
        """
        # Extract API key from credentials
        if "api_key" in credentials_data:
            self.api_key = credentials_data["api_key"]
        elif "api" in credentials_data and "key" in credentials_data["api"]:
            self.api_key = credentials_data["api"]["key"]
        else:
            raise ValueError("API key not found in credentials")

        self.base_url = "https://api.notion.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }
        logger.info("Notion connector initialized successfully")

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make an authenticated request to Notion API."""
        url = f"{self.base_url}/{endpoint}"

        response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=30
            )
        response.raise_for_status()
        return response.json()

    def search(
        self,
        query: Optional[str] = None,
        filter_type: Optional[str] = None,
        sort_direction: str = "descending",
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Search for pages and databases in Notion.

        Args:
            query: Text to search for
            filter_type: Filter by object type ('page' or 'database')
            sort_direction: Sort direction ('ascending' or 'descending')
            limit: Maximum number of results

        Returns:
            Search results
        """
        data = {
            "page_size": min(limit, 100),
            "sort": {
                "direction": sort_direction,
                "timestamp": "last_edited_time"
            }
        }

        if query:
            data["query"] = query

        if filter_type:
            data["filter"] = {"property": "object", "value": filter_type}

        result = self._make_request("POST", "search", data=data)

        if "results" in result:
            return {
                "success": True,
                "results": result["results"],
                "count": len(result["results"])
            }
        return result

    def get_page(self, page_id: str) -> Dict[str, Any]:
        """
        Retrieve a page from Notion.

        Args:
            page_id: The ID of the page to retrieve

        Returns:
            Page data
        """
        result = self._make_request("GET", f"pages/{page_id}")

        if "id" in result:
            return {"success": True, "page": result}
        return result

    def create_page(
        self,
        parent_id: str,
        title: str,
        *,
        content: Optional[Union[str, List[Dict]]] = None,
        properties: Optional[Dict] = None,
        icon: Optional[str] = None,
        cover: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new page in Notion.

        Args:
            parent_id: Parent page or database ID
            title: Page title
            content: Page content (text or rich blocks)
            properties: Additional properties
            icon: Page icon (emoji or URL)
            cover: Page cover image URL

        Returns:
            Created page data
        """
        # Determine parent type (page or database)
        parent = {}
        if len(parent_id.replace("-", "")) == 32:
            # Check if it's a database or page
            parent_check = self._make_request("GET", f"databases/{parent_id}")
            if "id" in parent_check:
                parent = {"database_id": parent_id}
            else:
                parent = {"page_id": parent_id}
        else:
            parent = {"page_id": parent_id}

        # Build page data
        page_data = {
            "parent": parent
        }

        # Add properties
        if parent.get("database_id"):
            # For database parent, use properties
            page_data["properties"] = properties or {
                "Name": {
                    "title": [
                        {
                            "text": {
                                "content": title
                            }
                        }
                    ]
                }
            }
        else:
            # For page parent, use title
            page_data["properties"] = {
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

        # Add icon if provided
        if icon:
            if icon.startswith("http"):
                page_data["icon"] = {"type": "external", "external": {"url": icon}}
            else:
                page_data["icon"] = {"type": "emoji", "emoji": icon}

        # Add cover if provided
        if cover:
            page_data["cover"] = {"type": "external", "external": {"url": cover}}

        # Add content as children blocks
        if content:
            if isinstance(content, str):
                page_data["children"] = [
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": content
                                    }
                                }
                            ]
                        }
                    }
                ]
            elif isinstance(content, list):
                page_data["children"] = content

        result = self._make_request("POST", "pages", data=page_data)

        if "id" in result:
            return {
                "success": True,
                "page_id": result["id"],
                "url": result.get("url", ""),
                "message": f"Page '{title}' created successfully"
            }
        return result

    def update_page(
        self,
        page_id: str,
        *,
        properties: Optional[Dict] = None,
        archived: Optional[bool] = None,
        icon: Optional[str] = None,
        cover: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a page in Notion.

        Args:
            page_id: The ID of the page to update
            properties: Properties to update
            archived: Whether to archive/unarchive the page
            icon: Page icon (emoji or URL)
            cover: Page cover image URL

        Returns:
            Updated page data
        """
        update_data = {}

        if properties:
            update_data["properties"] = properties

        if archived is not None:
            update_data["archived"] = archived

        if icon:
            if icon.startswith("http"):
                update_data["icon"] = {"type": "external", "external": {"url": icon}}
            else:
                update_data["icon"] = {"type": "emoji", "emoji": icon}

        if cover:
            update_data["cover"] = {"type": "external", "external": {"url": cover}}

        result = self._make_request("PATCH", f"pages/{page_id}", data=update_data)

        if "id" in result:
            return {
                "success": True,
                "page_id": result["id"],
                "message": "Page updated successfully"
            }
        return result

    def get_database(self, database_id: str) -> Dict[str, Any]:
        """
        Retrieve a database from Notion.

        Args:
            database_id: The ID of the database to retrieve

        Returns:
            Database data
        """
        result = self._make_request("GET", f"databases/{database_id}")

        if "id" in result:
            return {"success": True, "database": result}
        return result

    def query_database(
        self,
        database_id: str,
        filter_conditions: Optional[Dict] = None,
        sorts: Optional[List[Dict]] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Query a database in Notion.

        Args:
            database_id: The ID of the database to query
            filter_conditions: Filter conditions
            sorts: Sort conditions
            limit: Maximum number of results

        Returns:
            Query results
        """
        query_data = {
            "page_size": min(limit, 100)
        }

        if filter_conditions:
            query_data["filter"] = filter_conditions

        if sorts:
            query_data["sorts"] = sorts

        result = self._make_request("POST", f"databases/{database_id}/query", data=query_data)

        if "results" in result:
            return {
                "success": True,
                "results": result["results"],
                "count": len(result["results"]),
                "has_more": result.get("has_more", False)
            }
        return result

    def create_database(
        self,
        parent_id: str,
        title: str,
        properties: Dict[str, Dict],
        *,
        icon: Optional[str] = None,
        cover: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new database in Notion.

        Args:
            parent_id: Parent page ID
            title: Database title
            properties: Database schema properties
            icon: Database icon (emoji or URL)
            cover: Database cover image URL

        Returns:
            Created database data
        """
        database_data = {
            "parent": {"page_id": parent_id},
            "title": [
                {
                    "type": "text",
                    "text": {
                        "content": title
                    }
                }
            ],
            "properties": properties
        }

        if icon:
            if icon.startswith("http"):
                database_data["icon"] = {"type": "external", "external": {"url": icon}}
            else:
                database_data["icon"] = {"type": "emoji", "emoji": icon}

        if cover:
            database_data["cover"] = {"type": "external", "external": {"url": cover}}

        result = self._make_request("POST", "databases", data=database_data)

        if "id" in result:
            return {
                "success": True,
                "database_id": result["id"],
                "url": result.get("url", ""),
                "message": f"Database '{title}' created successfully"
            }
        return result

    def append_block_children(
        self,
        block_id: str,
        children: List[Dict]
    ) -> Dict[str, Any]:
        """
        Append children blocks to a parent block.

        Args:
            block_id: Parent block ID (can be a page ID)
            children: List of child blocks to append

        Returns:
            Result of the operation
        """
        data = {"children": children}
        result = self._make_request("PATCH", f"blocks/{block_id}/children", data=data)

        if "results" in result:
            return {
                "success": True,
                "blocks_added": len(result["results"]),
                "message": f"Added {len(result['results'])} blocks"
            }
        return result

    def get_block_children(
        self,
        block_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get children of a block.

        Args:
            block_id: Parent block ID
            limit: Maximum number of results

        Returns:
            Child blocks
        """
        params = {"page_size": min(limit, 100)}
        result = self._make_request("GET", f"blocks/{block_id}/children", params=params)

        if "results" in result:
            return {
                "success": True,
                "blocks": result["results"],
                "count": len(result["results"])
            }
        return result

    def get_user(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get user information.

        Args:
            user_id: User ID (if None, gets current user)

        Returns:
            User information
        """
        if user_id:
            endpoint = f"users/{user_id}"
        else:
            endpoint = "users/me"

        result = self._make_request("GET", endpoint)

        if "id" in result:
            return {
                "success": True,
                "user": result
            }
        return result

    def list_users(self, limit: int = 50) -> Dict[str, Any]:
        """
        List all users in the workspace.

        Args:
            limit: Maximum number of results

        Returns:
            List of users
        """
        params = {"page_size": min(limit, 100)}
        result = self._make_request("GET", "users", params=params)

        if "results" in result:
            return {
                "success": True,
                "users": result["results"],
                "count": len(result["results"])
            }
        return result
