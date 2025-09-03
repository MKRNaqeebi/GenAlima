"""
Notion API routes for GenAlima.

This module provides API key management and Notion API operation endpoints.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import select
import structlog
from connectors.notion_connector import NotionConnector

from app.api.deps import CurrentUser, SessionDep
from app.models import Connector

logger = structlog.get_logger()

router = APIRouter(prefix="/notion", tags=["notion"])


class NotionConnectorCreate(BaseModel):
    """Request model for creating a Notion connector."""
    api_key: str
    connector_name: str = "notion"


class NotionSearchRequest(BaseModel):
    """Request model for searching Notion."""
    query: Optional[str] = None
    filter_type: Optional[str] = None
    limit: int = 10


class NotionPageCreateRequest(BaseModel):
    """Request model for creating a Notion page."""
    parent_id: str
    title: str
    content: Optional[str] = None
    icon: Optional[str] = None


class NotionPageUpdateRequest(BaseModel):
    """Request model for updating a Notion page."""
    title: Optional[str] = None
    archived: Optional[bool] = None
    icon: Optional[str] = None


@router.post("/connect/")
async def create_notion_connector(
    request: NotionConnectorCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create or update a Notion connector with API key.

    Args:
        request: Connector creation request with API key
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success response with connector ID
    """
    # Check if connector already exists
    statement = select(Connector).where(
        Connector.owner_id == current_user.id,
        Connector.name == request.connector_name
    )
    existing_connector = session.exec(statement).first()

    connector_data = {
        "type": "notion",
        "api_key": request.api_key,
        "settings": {
            "workspace_access": True
        }
    }

    if existing_connector:
        # Update existing connector
        existing_connector.meta_data = connector_data
        existing_connector.active = True
        session.add(existing_connector)
        connector_id = existing_connector.id
        logger.info(f"Updated Notion connector {connector_id} for user {current_user.id}")
    else:
        # Create new connector
        new_connector = Connector(
            name=request.connector_name,
            description="Notion connector for workspace",
            function="notion",
            active=True,
            owner_id=current_user.id,
            meta_data=connector_data
        )
        session.add(new_connector)
        session.commit()
        session.refresh(new_connector)
        connector_id = new_connector.id
        logger.info(f"Created Notion connector {connector_id} for user {current_user.id}")

    session.commit()

    return {
        "success": True,
        "message": "Notion connector configured successfully",
        "connector_id": str(connector_id)
    }


@router.get("/test/{connector_id}/")
async def test_notion_connection(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Test Notion connection by fetching user information.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Connection test result
    """

    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "notion":
        raise HTTPException(status_code=400, detail="Not a Notion connector")

    # Initialize Notion connector and test connection
    notion = NotionConnector(connector.meta_data)
    user_info = notion.get_user()

    if user_info.get("success"):
        return {
            "success": True,
            "message": "Notion connection successful",
            "user": user_info.get("user", {})
        }
    else:
        return {
            "success": False,
            "message": "Failed to connect to Notion",
            "error": user_info.get("error", "Unknown error")
        }


@router.post("/search/{connector_id}/")
async def search_notion(
    connector_id: uuid.UUID,
    request: NotionSearchRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Search for pages and databases in Notion.

    Args:
        connector_id: Connector UUID
        request: Search request parameters
        session: Database session
        current_user: Current authenticated user

    Returns:
        Search results
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "notion":
        raise HTTPException(status_code=400, detail="Not a Notion connector")

    notion = NotionConnector(connector.meta_data)
    results = notion.search(
        query=request.query,
        filter_type=request.filter_type,
        limit=request.limit
    )

    return results


@router.post("/pages/{connector_id}/")
async def create_page(
    connector_id: uuid.UUID,
    request: NotionPageCreateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a new page in Notion.

    Args:
        connector_id: Connector UUID
        request: Page creation request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Created page information
    """

    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "notion":
        raise HTTPException(status_code=400, detail="Not a Notion connector")

    notion = NotionConnector(connector.meta_data)
    result = notion.create_page(
        parent_id=request.parent_id,
        title=request.title,
        content=request.content,
        icon=request.icon
    )

    return result


@router.patch("/pages/{connector_id}/{page_id}/")
async def update_page(
    connector_id: uuid.UUID,
    page_id: str,
    request: NotionPageUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Update a page in Notion.

    Args:
        connector_id: Connector UUID
        page_id: Notion page ID
        request: Page update request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Update result
    """

    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "notion":
        raise HTTPException(status_code=400, detail="Not a Notion connector")

    notion = NotionConnector(connector.meta_data)

    # Build properties if title is provided
    properties = None
    if request.title:
        properties = {
            "title": {
                "title": [
                    {
                        "text": {
                            "content": request.title
                        }
                    }
                ]
            }
        }

    result = notion.update_page(
        page_id=page_id,
        properties=properties,
        archived=request.archived,
        icon=request.icon
    )

    return result


@router.delete("/disconnect/{connector_id}/")
async def disconnect_notion(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Disconnect Notion by deleting the connector.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Success status
    """
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "notion":
        raise HTTPException(status_code=400, detail="Not a Notion connector")

    session.delete(connector)
    session.commit()

    logger.info(f"Notion connector {connector_id} deleted for user {current_user.id}")

    return {
        "success": True,
        "message": "Notion connector disconnected successfully"
    }
