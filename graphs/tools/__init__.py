"""LangGraph tools for enhanced language model capabilities.

This package contains custom tools that can be used with LangGraph to extend
the capabilities of language models. Currently includes tools for web search
and other external integrations.
"""

# Third-party imports
from langchain_core.tools.base import BaseTool

from app.models import Connector
from .knowledge_search import knowledge_search_tool
from .update_chat_title import update_chat_title_tool
from .google_mail_tools import (
    gmail_send_email_tool,
    gmail_read_emails_tool,
    gmail_search_emails_tool,
    gmail_manage_email_tool,
    gmail_create_draft_tool,
    gmail_get_labels_tool,
    gmail_get_profile_tool,
)
from .notion_tools import (
    notion_search_tool,
    notion_create_page_tool,
    notion_update_page_tool,
    notion_query_database_tool,
    notion_append_blocks_tool,
    notion_get_user_tool,
)
from .github_tools import (
    github_list_repositories_tool,
    github_create_bug_issue_tool,
    github_create_feature_request_tool,
    github_list_issues_tool,
    github_update_issue_tool,
)

def get_tools_by_credentials(connectors: list[Connector]) -> list[BaseTool]:
    """
    Get a list of tools that can be used with the provided credentials.
    """
    tools = [
        knowledge_search_tool,
        update_chat_title_tool
    ]
    if any(connector.name == "google_mail" for connector in connectors):
        tools.extend([
            gmail_send_email_tool,
            gmail_read_emails_tool,
            gmail_search_emails_tool,
            gmail_manage_email_tool,
            gmail_create_draft_tool,
            gmail_get_labels_tool,
            gmail_get_profile_tool,
        ])
    if any(connector.name == "notion" for connector in connectors):
        tools.extend([
            notion_search_tool,
            notion_create_page_tool,
            notion_update_page_tool,
            notion_query_database_tool,
            notion_append_blocks_tool,
            notion_get_user_tool,
        ])
    if any(connector.name == "github" for connector in connectors):
        tools.extend([
            github_list_repositories_tool,
            github_create_bug_issue_tool,
            github_create_feature_request_tool,
            github_list_issues_tool,
            github_update_issue_tool,
        ])
    print(f"No of tools available: {len(tools)}")
    return tools
