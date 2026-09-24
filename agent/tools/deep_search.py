"""
Deep search tool using Perplexity AI for LangGraph.

This tool allows searching for information on specific topics using the Perplexity API.
It can optionally filter results by domains and returns comprehensive information
about the query topic. This is useful for getting up-to-date information beyond
the knowledge base.
"""
from typing import Any, Dict, List, Optional, Type, Union

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from connectors.perplexity_connector import perplexity_service


class DeepSearchInput(BaseModel):
    """Input schema for the deep search tool."""

    query: str = Field(description="The search query to research")
    domains: Optional[List[str]] = Field(
        default=None, description="Optional list of domains to restrict the search to"
    )
    use_documentation_sources: bool = Field(
        default=False,
        description="Whether to use organization's documentation sources as domain filters",
    )
    organization_id: Optional[str] = Field(
        default=None,
        description="Organization ID (required if use_documentation_sources is True)",
    )


class DeepSearchTool(BaseTool):
    """Tool that performs deep web search using Perplexity AI."""

    name: str = "deep_search"
    description: str = (
        "Perform a comprehensive web search on a specific topic using Perplexity AI. "
        "This tool is useful for getting up-to-date information, researching topics, "
        "and finding information not available in the local knowledge base. "
        "Can optionally filter results by specific domains."
    )
    args_schema: Type[BaseModel] = DeepSearchInput
    return_direct: bool = False

    # Remove __init__ to avoid attribute issues with LangChain tools

    def _run(
        self,
        query: str,
        domains: Optional[List[str]] = None,
        use_documentation_sources: bool = False,
        organization_id: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> Union[str, Dict[str, Any]]:
        """Execute the deep search."""
        result = perplexity_service.search(
            query=query,
            domains=[] # search_domains[:5],  # Limit to 5 domains to avoid API limits
        )

        if not result:
            return "No results found for the query."

        # Format the response
        response = {
            "query": query,
            "result": result,
            "domains_searched": [],
            "source": "perplexity_ai",
            "model": "sonar-pro",
        }

        return response

    async def _arun(
        self,
        query: str,
        domains: Optional[List[str]] = None,
        use_documentation_sources: bool = False,
        organization_id: Optional[str] = None,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> Union[str, Dict[str, Any]]:
        """Async version of the deep search."""
        # For now, we'll use the sync version
        # In a production environment, this should be properly async
        return self._run(
            query=query,
            domains=domains,
            use_documentation_sources=use_documentation_sources,
            organization_id=organization_id,
            run_manager=run_manager,
        )


# Create a singleton instance of the tool
deep_search_tool = DeepSearchTool()
