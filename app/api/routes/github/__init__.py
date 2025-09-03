"""
GitHub OAuth2 and API routes for GenAlima.

This module provides OAuth2 authentication flow and GitHub API operation endpoints.
"""

import uuid
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlmodel import select
import structlog

from app.api.deps import CurrentUser, SessionDep, get_current_user, get_user_by_email
from app.core.config import settings
from app.models import Connector, User
from connectors.github_connector import GitHubConnector

logger = structlog.get_logger()

router = APIRouter(prefix="/github", tags=["github"])


class IssueCreateRequest(BaseModel):
    """Request model for creating issues."""
    owner: str
    repo: str
    title: str
    body: Optional[str] = None
    labels: Optional[List[str]] = None
    assignees: Optional[List[str]] = None


class BugIssueCreateRequest(BaseModel):
    """Request model for creating bug issues."""
    owner: str
    repo: str
    title: str
    description: str
    reproduction_steps: Optional[str] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None
    environment: Optional[str] = None
    assignees: Optional[List[str]] = None


class FeatureRequestCreateRequest(BaseModel):
    """Request model for creating feature requests."""
    owner: str
    repo: str
    title: str
    description: str
    use_case: Optional[str] = None
    proposed_solution: Optional[str] = None
    alternatives: Optional[str] = None
    assignees: Optional[List[str]] = None


class IssueUpdateRequest(BaseModel):
    """Request model for updating issues."""
    title: Optional[str] = None
    body: Optional[str] = None
    state: Optional[str] = None
    labels: Optional[List[str]] = None
    assignees: Optional[List[str]] = None


# OAuth states storage (in production, use Redis or similar)
oauth_states: Dict[str, Dict[str, Any]] = {}


def _validate_state_token(state: str) -> dict:
    """Validate OAuth state token and return state data."""
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid state token")
    return oauth_states.pop(state)


def _build_connector_data(access_token: str, user_info: Dict[str, Any]) -> dict:
    """Build connector metadata from OAuth response."""
    return {
        "type": "github",
        "oauth2": {
            "access_token": access_token,
            "token_type": "bearer",
            "user_login": user_info.get("login"),
            "user_email": user_info.get("email"),
            "scopes": ["repo", "user:email"]  # Standard GitHub scopes
        },
        "settings": {
            "default_assignee": user_info.get("login")
        }
    }


def _save_or_update_connector(
    session,
    user_id: uuid.UUID,
    connector_name: str,
    connector_data: dict,
    user_login: str
) -> uuid.UUID:
    """Save or update GitHub connector in database."""
    statement = select(Connector).where(
        Connector.owner_id == user_id,
        Connector.name == connector_name
    )
    existing_connector = session.exec(statement).first()

    if existing_connector:
        existing_connector.meta_data = connector_data
        existing_connector.active = True
        session.add(existing_connector)
        connector_id = existing_connector.id
    else:
        new_connector = Connector(
            name=connector_name,
            description=f"GitHub connector for {user_login}",
            function="github",
            active=True,
            owner_id=user_id,
            meta_data=connector_data
        )
        session.add(new_connector)
        session.commit()
        session.refresh(new_connector)
        connector_id = new_connector.id

    session.commit()
    return connector_id


@router.get("/login/")
async def github_login(
    session: SessionDep,
    request: Request,
    connector_name: str = "github"
):
    """
    Initiate GitHub OAuth2 authentication flow.

    Args:
        session: Database session
        request: FastAPI request object
        connector_name: Name for the GitHub connector

    Returns:
        Redirect to GitHub OAuth2 consent screen
    """
    # GitHub OAuth2 configuration
    client_id = getattr(settings, 'GITHUB_CLIENT_ID', None)
    if not client_id:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    # Generate state token for CSRF protection
    state = secrets.token_urlsafe(32)

    # Build OAuth URL
    scopes = "repo,user:email"
    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={getattr(settings, 'GITHUB_REDIRECT_URI', '')}"
        f"&scope={scopes}"
        f"&state={state}"
        f"&allow_signup=false"
    )

    # Get token from request headers for user identification
    token = request.headers.get("Authorization")
    if not token:
        # Store minimal state so callback can still resolve user
        oauth_states[state] = {
            'user_email': None,
            'connector_name': connector_name,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        return RedirectResponse(url=auth_url)

    current_user = get_current_user(session, token)

    # Store state with user info
    oauth_states[state] = {
        'user_email': str(current_user.email),
        'connector_name': connector_name,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

    logger.info(f"Initiating GitHub OAuth2 for user {current_user.id}")
    return RedirectResponse(url=auth_url)


@router.get("/callback/")
async def github_callback(
    session: SessionDep,
    code: str = Query(...),
    state: str = Query(...)
):
    """
    Handle GitHub OAuth2 callback.

    Args:
        session: Database session
        code: Authorization code from GitHub
        state: State token for CSRF protection

    Returns:
        Success response or redirect to frontend
    """
    connector_name = "github"
    user_email: Optional[str] = None
    current_user: Optional[User] = None

    # Validate state and recover stored context
    state_data = _validate_state_token(state)
    user_email = state_data.get('user_email')
    connector_name = state_data.get('connector_name', connector_name)

    # Exchange code for access token
    token_response = requests.post(
        "https://github.com/login/oauth/access_token",
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code
        },
        headers={"Accept": "application/json"},
        timeout=30
    )

    if token_response.status_code != 200:
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=token_exchange_failed"
        return RedirectResponse(url=error_redirect, status_code=303)
    token_data = token_response.json()
    if "error" in token_data:
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error={token_data['error']}"
        return RedirectResponse(url=error_redirect, status_code=303)

    access_token = token_data["access_token"]

    # Get user information from GitHub
    user_response = requests.get(
        "https://api.github.com/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json"
        },
        timeout=30
    )
    if user_response.status_code != 200:
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=user_info_failed"
        return RedirectResponse(url=error_redirect, status_code=303)
    github_user = user_response.json()
    # Get primary email if not public
    if not github_user.get("email"):
        emails_response = requests.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json"
            },
            timeout=30
        )
        if emails_response.status_code == 200:
            emails = emails_response.json()
            primary_email = next((e["email"] for e in emails if e["primary"]), None)
            if primary_email:
                github_user["email"] = primary_email

    # Resolve current user
    if user_email:
        current_user = get_user_by_email(session, user_email)
    elif github_user.get("email"):
        current_user = get_user_by_email(session, github_user["email"])

    if not current_user:
        logger.error("No matching user found for GitHub OAuth callback")
        error_redirect = f"{settings.FRONTEND_HOST}/connectors?error=user_not_found"
        return RedirectResponse(url=error_redirect, status_code=303)

    # Build connector metadata and persist
    connector_data = _build_connector_data(access_token, github_user)
    connector_id = _save_or_update_connector(
        session,
        current_user.id,
        connector_name,
        connector_data,
        github_user.get("login", "unknown")
    )

    logger.info(
        "GitHub connector created/updated",
        user_id=current_user.id,
        connector_id=str(connector_id),
        connector_name=connector_name,
        github_login=github_user.get("login")
    )

    redirect_url = f"{settings.FRONTEND_HOST}/connectors?success=github_connected&connector_id={connector_id}"
    return RedirectResponse(url=redirect_url, status_code=303)


@router.get("/repositories/{connector_id}/")
async def list_repositories(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    type_filter: str = "owner",
    limit: int = 30
):
    """
    List GitHub repositories for the authenticated user.

    Args:
        connector_id: Connector UUID
        session: Database session
        current_user: Current authenticated user
        type_filter: Repository type filter
        limit: Maximum results

    Returns:
        List of repositories
    """

    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and list repositories
    github_connector = GitHubConnector(connector.meta_data)
    repositories = github_connector.list_repositories(type_filter=type_filter, limit=limit)
    return repositories


@router.post("/issues/{connector_id}/")
async def create_issue(
    connector_id: uuid.UUID,
    request: IssueCreateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a new issue in a GitHub repository.

    Args:
        connector_id: Connector UUID
        request: Issue creation request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Created issue information
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and create issue
    github_connector = GitHubConnector(connector.meta_data)
    issue = github_connector.create_issue(
        owner=request.owner,
        repo=request.repo,
        title=request.title,
        body=request.body,
        labels=request.labels,
        assignees=request.assignees
    )
    return issue


@router.post("/issues/{connector_id}/bug/")
async def create_bug_issue(
    connector_id: uuid.UUID,
    request: BugIssueCreateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a bug report issue in a GitHub repository.

    Args:
        connector_id: Connector UUID
        request: Bug issue creation request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Created bug issue information
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and create bug issue
    github_connector = GitHubConnector(connector.meta_data)
    issue = github_connector.create_bug_issue(
        owner=request.owner,
        repo=request.repo,
        title=request.title,
        description=request.description,
        reproduction_steps=request.reproduction_steps,
        expected_behavior=request.expected_behavior,
        actual_behavior=request.actual_behavior,
        environment=request.environment,
        assignees=request.assignees
    )
    return issue


@router.post("/issues/{connector_id}/feature/")
async def create_feature_request(
    connector_id: uuid.UUID,
    request: FeatureRequestCreateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a feature request issue in a GitHub repository.

    Args:
        connector_id: Connector UUID
        request: Feature request creation request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Created feature request information
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and create feature request
    github_connector = GitHubConnector(connector.meta_data)
    issue = github_connector.create_feature_request(
        owner=request.owner,
        repo=request.repo,
        title=request.title,
        description=request.description,
        use_case=request.use_case,
        proposed_solution=request.proposed_solution,
        alternatives=request.alternatives,
        assignees=request.assignees
    )
    return issue


@router.get("/issues/{connector_id}/{owner}/{repo}/")
async def list_issues(
    connector_id: uuid.UUID,
    owner: str,
    repo: str,
    session: SessionDep,
    current_user: CurrentUser,
    state: str = "open",
    labels: Optional[str] = None,
    assignee: Optional[str] = None,
    limit: int = 30
):
    """
    List issues in a GitHub repository.

    Args:
        connector_id: Connector UUID
        owner: Repository owner
        repo: Repository name
        session: Database session
        current_user: Current authenticated user
        state: Issue state filter
        labels: Label filter
        assignee: Assignee filter
        limit: Maximum results

    Returns:
        List of issues
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and list issues
    github_connector = GitHubConnector(connector.meta_data)
    issues = github_connector.list_issues(
        owner=owner,
        repo=repo,
        state=state,
        labels=labels,
        assignee=assignee,
        limit=limit
    )
    return issues


@router.patch("/issues/{connector_id}/{owner}/{repo}/{issue_number}/")
async def update_issue(
    connector_id: uuid.UUID,
    owner: str,
    repo: str,
    issue_number: int,
    request: IssueUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Update an issue in a GitHub repository.

    Args:
        connector_id: Connector UUID
        owner: Repository owner
        repo: Repository name
        issue_number: Issue number
        request: Issue update request
        session: Database session
        current_user: Current authenticated user

    Returns:
        Updated issue information
    """
    # Get connector from database
    statement = select(Connector).where(
        Connector.id == connector_id,
        Connector.owner_id == current_user.id
    )
    connector = session.exec(statement).first()

    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    # Initialize GitHub connector and update issue
    github_connector = GitHubConnector(connector.meta_data)
    issue = github_connector.update_issue(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        title=request.title,
        body=request.body,
        state=request.state,
        labels=request.labels,
        assignees=request.assignees
    )
    return issue


@router.delete("/disconnect/{connector_id}/")
async def disconnect_github(
    connector_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Disconnect GitHub by deleting the connector.

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

    if connector.name != "github":
        raise HTTPException(status_code=400, detail="Not a GitHub connector")

    session.delete(connector)
    session.commit()

    logger.info(f"GitHub connector {connector_id} deleted for user {current_user.id}")

    return {
        "success": True,
        "message": "GitHub connector disconnected successfully"
    }
