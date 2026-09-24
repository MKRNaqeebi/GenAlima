"""
GitHub tools for LangGraph.

This module provides tools for interacting with GitHub API, including
creating and managing issues for bug reports and feature requests.
"""
# pylint: disable=too-many-positional-arguments

from typing import List, Optional, Type
import uuid

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import select, Session
import structlog

from app.core.db import engine as db_engine
from app.models import Connector
from connectors.github_connector import GitHubConnector
from graphs.utils import store_tool_result_metadata

logger = structlog.get_logger()


def get_github_connector(connector_id: uuid.UUID) -> Optional[GitHubConnector]:
    """Get the GitHub connector from database."""
    if not connector_id:
        return None

    with Session(db_engine) as session:
        connector = session.exec(
            select(Connector).where(Connector.id == connector_id)
        ).first()

        if not connector or connector.name != 'github':
            logger.error(f"GitHub connector not found: {connector_id}")
            return None

        return GitHubConnector(connector.meta_data)


class ListRepositoriesInput(BaseModel):
    """Input schema for the list repositories tool."""

    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    type_filter: str = Field("owner", description="Filter by repository type ('all', 'owner', 'member')")
    limit: int = Field(30, description="Maximum number of repositories")


class ListRepositoriesTool(BaseTool):
    """Tool that lists GitHub repositories for the authenticated user."""

    name: str = "github_list_repositories"
    description: str = (
        "List GitHub repositories for the authenticated user. "
        "Returns repository names, descriptions, and URLs that can be used for creating issues."
    )
    args_schema: Type[BaseModel] = ListRepositoriesInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        type_filter: str = "owner",
        limit: int = 30,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the list repositories operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_github_connector(connector_id)
        if not connector:
            return "Failed to initialize GitHub connector"

        result = connector.list_repositories(
            type_filter=type_filter,
            limit=limit
        )

        if not result.get("success"):
            return f"Failed to list repositories: {result.get('error', 'Unknown error')}"

        if result["count"] == 0:
            return "No repositories found"

        # Format results
        formatted_results = f"Found {result['count']} repository(ies):\n\n"
        for idx, repo in enumerate(result["repositories"], 1):
            formatted_results += (
                f"{idx}. **{repo['full_name']}**\n"
                f"   Description: {repo.get('description', 'No description')}\n"
                f"   Language: {repo.get('language', 'Not specified')}\n"
                f"   Private: {repo['private']}\n"
                f"   URL: {repo['html_url']}\n"
                f"   Updated: {repo['updated_at']}\n\n"
            )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "type_filter": type_filter,
                    "limit": limit,
                    "connector_id": str(connector_id)
                },
                "output": {
                    "count": result["count"],
                    "repositories": result["repositories"][:3]  # Store first 3 for reference
                }
            }
        )

        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        type_filter: str = "owner",
        limit: int = 30,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of list repositories."""
        return self._run(
            message_id=message_id,
            connector_id=connector_id,
            type_filter=type_filter,
            limit=limit,
            run_manager=run_manager,
        )


class CreateBugIssueInput(BaseModel):
    """Input schema for the create bug issue tool."""

    owner: str = Field(description="Repository owner username")
    repo: str = Field(description="Repository name")
    title: str = Field(description="Bug title")
    description: str = Field(description="Bug description")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    reproduction_steps: Optional[str] = Field(None, description="Steps to reproduce the bug")
    expected_behavior: Optional[str] = Field(None, description="Expected behavior")
    actual_behavior: Optional[str] = Field(None, description="Actual behavior")
    environment: Optional[str] = Field(None, description="Environment information")
    assignees: Optional[List[str]] = Field(None, description="List of usernames to assign")


class CreateBugIssueTool(BaseTool):
    """Tool that creates a bug report issue in GitHub."""

    name: str = "github_create_bug_issue"
    description: str = (
        "Create a bug report issue in a GitHub repository. "
        "Uses a structured template with sections for description, reproduction steps, "
        "expected behavior, actual behavior, and environment information."
    )
    args_schema: Type[BaseModel] = CreateBugIssueInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        reproduction_steps: Optional[str] = None,
        expected_behavior: Optional[str] = None,
        actual_behavior: Optional[str] = None,
        environment: Optional[str] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create bug issue operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_github_connector(connector_id)
        if not connector:
            return "Failed to initialize GitHub connector"

        result = connector.create_bug_issue(
            owner=owner,
            repo=repo,
            title=title,
            description=description,
            reproduction_steps=reproduction_steps,
            expected_behavior=expected_behavior,
            actual_behavior=actual_behavior,
            environment=environment,
            assignees=assignees
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "owner": owner,
                    "repo": repo,
                    "title": title,
                    "has_reproduction_steps": bool(reproduction_steps),
                    "has_assignees": bool(assignees),
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            issue = result["issue"]
            return (
                f"Bug report created successfully!\n\n"
                f"**Issue #{issue['number']}: {issue['title']}**\n"
                f"Repository: {owner}/{repo}\n"
                f"State: {issue['state']}\n"
                f"URL: {issue['html_url']}\n"
                f"Labels: {', '.join(issue['labels']) if issue['labels'] else 'None'}\n"
                f"Assignees: {', '.join(issue['assignees']) if issue['assignees'] else 'None'}"
            )
        return f"Failed to create bug issue: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        reproduction_steps: Optional[str] = None,
        expected_behavior: Optional[str] = None,
        actual_behavior: Optional[str] = None,
        environment: Optional[str] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of create bug issue."""
        return self._run(
            owner=owner,
            repo=repo,
            title=title,
            description=description,
            message_id=message_id,
            connector_id=connector_id,
            reproduction_steps=reproduction_steps,
            expected_behavior=expected_behavior,
            actual_behavior=actual_behavior,
            environment=environment,
            assignees=assignees,
            run_manager=run_manager,
        )


class CreateFeatureRequestInput(BaseModel):
    """Input schema for the create feature request tool."""

    owner: str = Field(description="Repository owner username")
    repo: str = Field(description="Repository name")
    title: str = Field(description="Feature title")
    description: str = Field(description="Feature description")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    use_case: Optional[str] = Field(None, description="Use case for the feature")
    proposed_solution: Optional[str] = Field(None, description="Proposed implementation")
    alternatives: Optional[str] = Field(None, description="Alternative solutions considered")
    assignees: Optional[List[str]] = Field(None, description="List of usernames to assign")


class CreateFeatureRequestTool(BaseTool):
    """Tool that creates a feature request issue in GitHub."""

    name: str = "github_create_feature_request"
    description: str = (
        "Create a feature request issue in a GitHub repository. "
        "Uses a structured template with sections for description, use case, "
        "proposed solution, and alternatives considered."
    )
    args_schema: Type[BaseModel] = CreateFeatureRequestInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        use_case: Optional[str] = None,
        proposed_solution: Optional[str] = None,
        alternatives: Optional[str] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the create feature request operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_github_connector(connector_id)
        if not connector:
            return "Failed to initialize GitHub connector"

        result = connector.create_feature_request(
            owner=owner,
            repo=repo,
            title=title,
            description=description,
            use_case=use_case,
            proposed_solution=proposed_solution,
            alternatives=alternatives,
            assignees=assignees
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "owner": owner,
                    "repo": repo,
                    "title": title,
                    "has_use_case": bool(use_case),
                    "has_proposed_solution": bool(proposed_solution),
                    "has_assignees": bool(assignees),
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            issue = result["issue"]
            return (
                f"Feature request created successfully!\n\n"
                f"**Issue #{issue['number']}: {issue['title']}**\n"
                f"Repository: {owner}/{repo}\n"
                f"State: {issue['state']}\n"
                f"URL: {issue['html_url']}\n"
                f"Labels: {', '.join(issue['labels']) if issue['labels'] else 'None'}\n"
                f"Assignees: {', '.join(issue['assignees']) if issue['assignees'] else 'None'}"
            )
        return f"Failed to create feature request: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        use_case: Optional[str] = None,
        proposed_solution: Optional[str] = None,
        alternatives: Optional[str] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of create feature request."""
        return self._run(
            owner=owner,
            repo=repo,
            title=title,
            description=description,
            message_id=message_id,
            connector_id=connector_id,
            use_case=use_case,
            proposed_solution=proposed_solution,
            alternatives=alternatives,
            assignees=assignees,
            run_manager=run_manager,
        )


class ListIssuesInput(BaseModel):
    """Input schema for the list issues tool."""

    owner: str = Field(description="Repository owner username")
    repo: str = Field(description="Repository name")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    state: str = Field("open", description="Issue state ('open', 'closed', 'all')")
    labels: Optional[str] = Field(None, description="Comma-separated list of label names")
    assignee: Optional[str] = Field(None, description="Username assigned to the issues")
    limit: int = Field(30, description="Maximum number of issues to return")


class ListIssuesTool(BaseTool):
    """Tool that lists issues in a GitHub repository."""

    name: str = "github_list_issues"
    description: str = (
        "List issues in a GitHub repository. "
        "Can filter by state, labels, assignee, and other criteria. "
        "Useful for viewing existing bug reports and feature requests."
    )
    args_schema: Type[BaseModel] = ListIssuesInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        state: str = "open",
        labels: Optional[str] = None,
        assignee: Optional[str] = None,
        limit: int = 30,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the list issues operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_github_connector(connector_id)
        if not connector:
            return "Failed to initialize GitHub connector"

        result = connector.list_issues(
            owner=owner,
            repo=repo,
            state=state,
            labels=labels,
            assignee=assignee,
            limit=limit
        )

        if not result.get("success"):
            return f"Failed to list issues: {result.get('error', 'Unknown error')}"

        if result["count"] == 0:
            filter_desc = []
            if state != "all":
                filter_desc.append(f"state: {state}")
            if labels:
                filter_desc.append(f"labels: {labels}")
            if assignee:
                filter_desc.append(f"assignee: {assignee}")

            filter_text = " with " + ", ".join(filter_desc) if filter_desc else ""
            return f"No issues found in {owner}/{repo}{filter_text}"

        # Format results
        formatted_results = f"Found {result['count']} issue(s) in {owner}/{repo}:\n\n"
        for idx, issue in enumerate(result["issues"], 1):
            formatted_results += (
                f"{idx}. **#{issue['number']}: {issue['title']}**\n"
                f"   State: {issue['state']}\n"
                f"   Creator: {issue['creator']}\n"
                f"   Labels: {', '.join(issue['labels']) if issue['labels'] else 'None'}\n"
                f"   Assignees: {', '.join(issue['assignees']) if issue['assignees'] else 'None'}\n"
                f"   Comments: {issue['comments']}\n"
                f"   URL: {issue['html_url']}\n"
                f"   Created: {issue['created_at']}\n"
                f"   Body: {issue['body'][:150]}{'...' if len(issue['body']) > 150 else ''}\n\n"
            )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "owner": owner,
                    "repo": repo,
                    "state": state,
                    "labels": labels,
                    "assignee": assignee,
                    "limit": limit,
                    "connector_id": str(connector_id)
                },
                "output": {
                    "count": result["count"],
                    "issues": result["issues"][:3]  # Store first 3 for reference
                }
            }
        )

        return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        state: str = "open",
        labels: Optional[str] = None,
        assignee: Optional[str] = None,
        limit: int = 30,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of list issues."""
        return self._run(
            owner=owner,
            repo=repo,
            message_id=message_id,
            connector_id=connector_id,
            state=state,
            labels=labels,
            assignee=assignee,
            limit=limit,
            run_manager=run_manager,
        )


class UpdateIssueInput(BaseModel):
    """Input schema for the update issue tool."""

    owner: str = Field(description="Repository owner username")
    repo: str = Field(description="Repository name")
    issue_number: int = Field(description="Issue number")
    message_id: uuid.UUID = Field(description="The ID of the message being processed")
    connector_id: uuid.UUID = Field(description="The ID of the connector to get credentials")
    title: Optional[str] = Field(None, description="New issue title")
    body: Optional[str] = Field(None, description="New issue body")
    state: Optional[str] = Field(None, description="New state ('open' or 'closed')")
    labels: Optional[List[str]] = Field(None, description="List of label names")
    assignees: Optional[List[str]] = Field(None, description="List of usernames to assign")


class UpdateIssueTool(BaseTool):
    """Tool that updates an existing issue in GitHub."""

    name: str = "github_update_issue"
    description: str = (
        "Update an existing issue in a GitHub repository. "
        "Can modify title, body, state (open/closed), labels, and assignees."
    )
    args_schema: Type[BaseModel] = UpdateIssueInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        issue_number: int,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        title: Optional[str] = None,
        body: Optional[str] = None,
        state: Optional[str] = None,
        labels: Optional[List[str]] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the update issue operation."""
        _ = run_manager  # Suppress unused argument warning
        connector = get_github_connector(connector_id)
        if not connector:
            return "Failed to initialize GitHub connector"

        result = connector.update_issue(
            owner=owner,
            repo=repo,
            issue_number=issue_number,
            title=title,
            body=body,
            state=state,
            labels=labels,
            assignees=assignees
        )

        # Store metadata
        store_tool_result_metadata(
            str(message_id), self.name,
            {
                "input": {
                    "owner": owner,
                    "repo": repo,
                    "issue_number": issue_number,
                    "has_title": bool(title),
                    "has_body": bool(body),
                    "state": state,
                    "has_labels": bool(labels),
                    "has_assignees": bool(assignees),
                    "connector_id": str(connector_id)
                },
                "output": result
            }
        )

        if result.get("success"):
            issue = result["issue"]
            updates = []
            if title:
                updates.append(f"title to '{title}'")
            if body:
                updates.append("body")
            if state:
                updates.append(f"state to '{state}'")
            if labels:
                updates.append(f"labels to [{', '.join(labels)}]")
            if assignees:
                updates.append(f"assignees to [{', '.join(assignees)}]")

            update_str = ", ".join(updates) if updates else "no changes"
            return (
                f"Issue #{issue['number']} updated successfully!\n\n"
                f"**{issue['title']}**\n"
                f"Repository: {owner}/{repo}\n"
                f"State: {issue['state']}\n"
                f"URL: {issue['html_url']}\n"
                f"Changes: {update_str}\n"
                f"Labels: {', '.join(issue['labels']) if issue['labels'] else 'None'}\n"
                f"Assignees: {', '.join(issue['assignees']) if issue['assignees'] else 'None'}"
            )
        return f"Failed to update issue: {result.get('error', 'Unknown error')}"

    async def _arun(  # pylint: disable=arguments-differ
        self,
        owner: str,
        repo: str,
        issue_number: int,
        message_id: uuid.UUID,
        connector_id: uuid.UUID,
        title: Optional[str] = None,
        body: Optional[str] = None,
        state: Optional[str] = None,
        labels: Optional[List[str]] = None,
        assignees: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of update issue."""
        return self._run(
            owner=owner,
            repo=repo,
            issue_number=issue_number,
            message_id=message_id,
            connector_id=connector_id,
            title=title,
            body=body,
            state=state,
            labels=labels,
            assignees=assignees,
            run_manager=run_manager,
        )


# Initialize tool instances
github_list_repositories_tool = ListRepositoriesTool()
github_create_bug_issue_tool = CreateBugIssueTool()
github_create_feature_request_tool = CreateFeatureRequestTool()
github_list_issues_tool = ListIssuesTool()
github_update_issue_tool = UpdateIssueTool()
