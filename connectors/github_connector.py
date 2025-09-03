"""
GitHub Connector implementation for GenAlima.

This module provides integration with GitHub API using OAuth2 authentication.
Supports creating and managing issues for bug reports and feature requests.
"""

from typing import Any, Dict, List, Optional
import requests
import structlog

logger = structlog.get_logger()


class GitHubConnector:
    """GitHub API connector for managing issues and repositories."""

    def __init__(self, credentials_data: Dict[str, Any]):
        """
        Initialize GitHub connector with OAuth credentials.

        Args:
            credentials_data: Dictionary containing OAuth credentials
        """
        # Extract OAuth data from credentials
        oauth_data = credentials_data.get("oauth2", credentials_data)

        if "access_token" in oauth_data:
            self.access_token = oauth_data["access_token"]
        elif "token" in oauth_data:
            self.access_token = oauth_data["token"]
        else:
            raise ValueError("Access token not found in OAuth credentials")

        # Store OAuth credentials for token refresh
        self.refresh_token = oauth_data.get("refresh_token")
        self.client_id = oauth_data.get("client_id")
        self.client_secret = oauth_data.get("client_secret")
        self.token_expiry = oauth_data.get("token_expiry")

        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "GenAlima-GitHub-Connector/1.0"
        }
        logger.info("GitHub connector initialized successfully")

    def _refresh_access_token(self) -> bool:
        """
        Refresh the OAuth access token using refresh token.

        Returns:
            True if token refresh was successful, False otherwise
        """
        if not self.refresh_token or not self.client_id or not self.client_secret:
            logger.warning("Missing OAuth credentials for token refresh")
            return False

        response = requests.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token"
            },
            headers={"Accept": "application/json"},
            timeout=30
        )
        response.raise_for_status()

        token_data = response.json()
        if "access_token" in token_data:
            self.access_token = token_data["access_token"]
            if "refresh_token" in token_data:
                self.refresh_token = token_data["refresh_token"]

            # Update authorization header
            self.headers["Authorization"] = f"Bearer {self.access_token}"
            logger.info("GitHub access token refreshed successfully")
            return True

        return False

    def _make_request(
        self,
        method: str,
        endpoint: str,
        *,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to GitHub API."""
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

        # Handle empty responses
        if response.status_code == 204 or not response.content:
            return {"success": True}

        return response.json()

    def get_user(self) -> Dict[str, Any]:
        """
        Get the authenticated user's information.

        Returns:
            User information
        """
        result = self._make_request("GET", "user")

        if "login" in result:
            return {
                "success": True,
                "user": {
                    "login": result["login"],
                    "name": result.get("name"),
                    "email": result.get("email"),
                    "avatar_url": result.get("avatar_url"),
                    "public_repos": result.get("public_repos", 0),
                    "followers": result.get("followers", 0)
                }
            }
        return result

    def list_repositories(
        self,
        type_filter: str = "owner",
        sort: str = "updated",
        limit: int = 30
    ) -> Dict[str, Any]:
        """
        List repositories for the authenticated user.

        Args:
            type_filter: Filter by repository type ('all', 'owner', 'member')
            sort: Sort by ('created', 'updated', 'pushed', 'full_name')
            limit: Maximum number of repositories to return

        Returns:
            List of repositories
        """
        params = {
            "type": type_filter,
            "sort": sort,
            "per_page": min(limit, 100)
        }

        result = self._make_request("GET", "user/repos", params=params)

        if isinstance(result, list):
            return {
                "success": True,
                "repositories": [
                    {
                        "id": repo["id"],
                        "name": repo["name"],
                        "full_name": repo["full_name"],
                        "description": repo.get("description"),
                        "html_url": repo["html_url"],
                        "private": repo["private"],
                        "language": repo.get("language"),
                        "created_at": repo["created_at"],
                        "updated_at": repo["updated_at"]
                    }
                    for repo in result
                ],
                "count": len(result)
            }
        return result

    def create_issue(
        self,
        owner: str,
        repo: str,
        title: str,
        *,
        body: Optional[str] = None,
        labels: Optional[List[str]] = None,
        assignees: Optional[List[str]] = None,
        milestone: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new issue in a repository.

        Args:
            owner: Repository owner username
            repo: Repository name
            title: Issue title
            body: Issue description/body
            labels: List of label names
            assignees: List of usernames to assign
            milestone: Milestone number

        Returns:
            Created issue information
        """
        issue_data = {
            "title": title
        }

        if body:
            issue_data["body"] = body

        if labels:
            issue_data["labels"] = labels

        if assignees:
            issue_data["assignees"] = assignees

        if milestone:
            issue_data["milestone"] = milestone

        result = self._make_request("POST", f"repos/{owner}/{repo}/issues", data=issue_data)

        if "id" in result:
            return {
                "success": True,
                "issue": {
                    "id": result["id"],
                    "number": result["number"],
                    "title": result["title"],
                    "body": result.get("body"),
                    "state": result["state"],
                    "html_url": result["html_url"],
                    "created_at": result["created_at"],
                    "labels": [label["name"] for label in result.get("labels", [])],
                    "assignees": [user["login"] for user in result.get("assignees", [])]
                },
                "message": f"Issue #{result['number']} created successfully"
            }
        return result

    def list_issues(
        self,
        owner: str,
        repo: str,
        *,
        state: str = "open",
        labels: Optional[str] = None,
        assignee: Optional[str] = None,
        creator: Optional[str] = None,
        sort: str = "created",
        direction: str = "desc",
        limit: int = 30
    ) -> Dict[str, Any]:
        """
        List issues in a repository.

        Args:
            owner: Repository owner username
            repo: Repository name
            state: Issue state ('open', 'closed', 'all')
            labels: Comma-separated list of label names
            assignee: Username assigned to the issues
            creator: Username that created the issues
            sort: Sort by ('created', 'updated', 'comments')
            direction: Sort direction ('asc', 'desc')
            limit: Maximum number of issues to return

        Returns:
            List of issues
        """
        params = {
            "state": state,
            "sort": sort,
            "direction": direction,
            "per_page": min(limit, 100)
        }

        if labels:
            params["labels"] = labels

        if assignee:
            params["assignee"] = assignee

        if creator:
            params["creator"] = creator

        result = self._make_request("GET", f"repos/{owner}/{repo}/issues", params=params)

        if isinstance(result, list):
            # Filter out pull requests (GitHub treats PRs as issues)
            issues = [issue for issue in result if "pull_request" not in issue]

            return {
                "success": True,
                "issues": [
                    {
                        "id": issue["id"],
                        "number": issue["number"],
                        "title": issue["title"],
                        "body": issue.get("body", "")[:500] + ("..." if len(issue.get("body", "")) > 500 else ""),
                        "state": issue["state"],
                        "html_url": issue["html_url"],
                        "created_at": issue["created_at"],
                        "updated_at": issue["updated_at"],
                        "labels": [label["name"] for label in issue.get("labels", [])],
                        "assignees": [user["login"] for user in issue.get("assignees", [])],
                        "creator": issue["user"]["login"],
                        "comments": issue.get("comments", 0)
                    }
                    for issue in issues
                ],
                "count": len(issues)
            }
        return result

    def update_issue(
        self,
        owner: str,
        repo: str,
        issue_number: int,
        *,
        title: Optional[str] = None,
        body: Optional[str] = None,
        state: Optional[str] = None,
        labels: Optional[List[str]] = None,
        assignees: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Update an existing issue.

        Args:
            owner: Repository owner username
            repo: Repository name
            issue_number: Issue number
            title: New issue title
            body: New issue body
            state: New state ('open' or 'closed')
            labels: List of label names
            assignees: List of usernames to assign

        Returns:
            Updated issue information
        """
        update_data = {}

        if title is not None:
            update_data["title"] = title

        if body is not None:
            update_data["body"] = body

        if state is not None:
            update_data["state"] = state

        if labels is not None:
            update_data["labels"] = labels

        if assignees is not None:
            update_data["assignees"] = assignees

        result = self._make_request("PATCH", f"repos/{owner}/{repo}/issues/{issue_number}", data=update_data)

        if "id" in result:
            return {
                "success": True,
                "issue": {
                    "id": result["id"],
                    "number": result["number"],
                    "title": result["title"],
                    "body": result.get("body"),
                    "state": result["state"],
                    "html_url": result["html_url"],
                    "updated_at": result["updated_at"],
                    "labels": [label["name"] for label in result.get("labels", [])],
                    "assignees": [user["login"] for user in result.get("assignees", [])]
                },
                "message": f"Issue #{result['number']} updated successfully"
            }
        return result

    def get_repository_labels(self, owner: str, repo: str) -> Dict[str, Any]:
        """
        Get all labels for a repository.

        Args:
            owner: Repository owner username
            repo: Repository name

        Returns:
            List of repository labels
        """
        result = self._make_request("GET", f"repos/{owner}/{repo}/labels")

        if isinstance(result, list):
            return {
                "success": True,
                "labels": [
                    {
                        "name": label["name"],
                        "color": label["color"],
                        "description": label.get("description", "")
                    }
                    for label in result
                ],
                "count": len(result)
            }
        return result

    def create_bug_issue(
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        *,
        reproduction_steps: Optional[str] = None,
        expected_behavior: Optional[str] = None,
        actual_behavior: Optional[str] = None,
        environment: Optional[str] = None,
        assignees: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a bug report issue with a structured template.

        Args:
            owner: Repository owner username
            repo: Repository name
            title: Bug title
            description: Bug description
            reproduction_steps: Steps to reproduce the bug
            expected_behavior: Expected behavior description
            actual_behavior: Actual behavior description
            environment: Environment information
            assignees: List of usernames to assign

        Returns:
            Created bug issue information
        """
        body_parts = [f"## Description\n{description}"]

        if reproduction_steps:
            body_parts.append(f"## Steps to Reproduce\n{reproduction_steps}")

        if expected_behavior:
            body_parts.append(f"## Expected Behavior\n{expected_behavior}")

        if actual_behavior:
            body_parts.append(f"## Actual Behavior\n{actual_behavior}")

        if environment:
            body_parts.append(f"## Environment\n{environment}")

        body = "\n\n".join(body_parts)

        return self.create_issue(
            owner=owner,
            repo=repo,
            title=f"🐛 {title}",
            body=body,
            labels=["bug"],
            assignees=assignees
        )

    def create_feature_request(
        self,
        owner: str,
        repo: str,
        title: str,
        description: str,
        *,
        use_case: Optional[str] = None,
        proposed_solution: Optional[str] = None,
        alternatives: Optional[str] = None,
        assignees: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a feature request issue with a structured template.

        Args:
            owner: Repository owner username
            repo: Repository name
            title: Feature title
            description: Feature description
            use_case: Use case for the feature
            proposed_solution: Proposed implementation
            alternatives: Alternative solutions considered
            assignees: List of usernames to assign

        Returns:
            Created feature request information
        """
        body_parts = [f"## Description\n{description}"]

        if use_case:
            body_parts.append(f"## Use Case\n{use_case}")

        if proposed_solution:
            body_parts.append(f"## Proposed Solution\n{proposed_solution}")

        if alternatives:
            body_parts.append(f"## Alternatives Considered\n{alternatives}")

        body = "\n\n".join(body_parts)

        return self.create_issue(
            owner=owner,
            repo=repo,
            title=f"✨ {title}",
            body=body,
            labels=["enhancement"],
            assignees=assignees
        )
