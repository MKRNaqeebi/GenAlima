"""LangGraph tools for enhanced language model capabilities.

This package contains custom tools that can be used with LangGraph to extend
the capabilities of language models. Currently includes tools for web search
and other external integrations.
"""

# Third-party imports
from langchain_core.tools.base import BaseTool

from .knowledge_search import knowledge_search_tool
from .update_chat_title import update_chat_title_tool

tools: list[BaseTool] = [knowledge_search_tool, update_chat_title_tool]
