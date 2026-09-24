"""LangGraph tools for enhanced language model capabilities.

This package contains custom tools that can be used with LangGraph to extend
the capabilities of language models. Currently includes tools for web search
and other external integrations.
"""

# Third-party imports
from langchain_core.tools.base import BaseTool

from app.models import Connector
from .update_chat_title import update_chat_title_tool


def get_tools_by_credentials(connectors: list[Connector]) -> list[BaseTool]:
    """
    Get a list of tools that can be used with the provided credentials.
    """
    tools = [
        update_chat_title_tool
    ]
    print(f"No of tools available: {len(tools)}")
    return tools
