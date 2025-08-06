"""
Knowledge search tool for LangGraph.

This tool allows searching for knowledge in the organization's knowledge base
using semantic similarity search with pgvector. It returns relevant documents
based on the query and includes confidence scores.
"""
# pylint: disable=too-many-positional-arguments

from typing import Any, Dict, List, Optional, Type, Union

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlalchemy import Connection
from sqlmodel import text

from app.core.config import settings
from app.core.db import engine as db_engine
from gen_model import gen_openai_model


class KnowledgeSearchInput(BaseModel):
    """Input schema for the knowledge search tool."""

    query: str = Field(description="The search query to find relevant knowledge")


class KnowledgeSearchResult(BaseModel):
    """Schema for individual search results."""

    id: str
    content: str
    confidence_score: float
    distance: float
    metadata: Dict[str, Any] = Field(default_factory=dict)
    source_id: Optional[str] = None
    content_id: Optional[str] = None
    chunk_number: Optional[int] = None


class KnowledgeSearchTool(BaseTool):
    """Tool that searches the knowledge base using semantic similarity."""

    name: str = "knowledge_search"
    description: str = (
        "Search the organization's knowledge base for relevant information. "
        "This tool uses semantic similarity to find the most relevant documents "
        "Update metadata for current message with the search results."
        "based on the query. Returns results with confidence scores."
    )
    args_schema: Type[BaseModel] = KnowledgeSearchInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        query: str,
        run_manager: Optional[
            CallbackManagerForToolRun
        ] = None,
    ) -> str:
        """Execute the knowledge search."""
        _ = run_manager  # Suppress unused argument warning
        # Get config values
        max_results = settings.KNOWLEDGE_SEARCH_MAX_RESULTS
        similarity_threshold = settings.KNOWLEDGE_SEARCH_SIMILARITY_THRESHOLD
        organization_id = settings.KNOWLEDGE_SEARCH_ORGANIZATION_ID
        with db_engine.connect() as connection:
            # Generate embedding for the query
            embedding = self._generate_embedding(query)
            if not embedding:
                return "Failed to generate query embedding"
            # Search knowledge base
            results = self._search_knowledge(  # pylint: disable=too-many-function-args
                connection=connection,
                embedding=embedding,
                organization_id=organization_id,
                max_results=max_results,
                similarity_threshold=similarity_threshold,
            )
            if not results:
                return f"No relevant knowledge found for query: {query}"

            # Format results according to docstring
            documents = []
            for result in results:
                doc = {
                    "id": result["id"],
                    "relevance_score": result.get("confidence_score", 0.0),
                    "content": result["content"],
                }
                documents.append(doc)

            # Return formatted string for display and metadata for storage
            formatted_results = f"Found {len(documents)} relevant documents:\n\n"
            for result in results:
                formatted_results += (
                    f"""- Content: {result["content"]}\n- Confidence Score: {result["confidence_score"]}\n"""
                )

            return formatted_results

    async def _arun(  # pylint: disable=arguments-differ
        self,
        query: str,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> Union[List[Dict[str, Any]], str]:
        """Async version of the knowledge search."""
        # For now, we'll use the sync version
        # In a production environment, this should be properly async
        return self._run(
            query=query,
            run_manager=run_manager,
        )

    def _generate_embedding(self, query_content: str) -> Optional[List[float]]:
        """Generate embedding for the query text."""
        embedding = gen_openai_model.get_large_embedding(query_content)
        return embedding

    def _search_knowledge(  # pylint: disable=too-many-arguments
        self,
        connection: Connection,
        embedding: List[float],
        organization_id: str,
        max_results: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search knowledge base using pgvector similarity."""
        # Convert embedding to string format for PostgreSQL
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"
        # Use raw SQL for pgvector distance query
        # Note: We use session.execute() here for compatibility with raw SQL text queries
        query = text(
            """
            SELECT
                k.id,
                k.content,
                k.source_id,
                k.content_id,
                k.chunk_number,
                k.meta_data,
                k.created,
                k.embedding <-> CAST(:embedding AS vector) as distance
            FROM knowledge k
            WHERE k.organization_id = :org_id
                AND k.embedding <-> CAST(:embedding AS vector) < :threshold
            ORDER BY k.embedding <-> CAST(:embedding AS vector)
            LIMIT :max_results
        """
        )
        results = connection.execute(
            query,
            {
                "embedding": embedding_str,
                "org_id": organization_id,
                "threshold": similarity_threshold,
                "max_results": max_results,
            },
        ).fetchall()
        if not results:
            return []
        # Process results
        processed_results = []
        for result in results:
            processed_result = self._process_single_result(
                result, connection, organization_id
            )
            processed_results.append(processed_result)
        return processed_results

    def _process_single_result(  # pylint: disable=too-many-arguments
        self, result: Any, connection: Connection, organization_id: str
    ) -> Dict[str, Any]:
        """Process a single search result and enrich with adjacent chunks."""
        distance = float(result.distance)
        confidence_score = self._calculate_confidence_score(distance)

        # Get adjacent chunks if content_id and chunk_number are available
        full_content = result.content
        if result.content_id and result.chunk_number is not None:
            full_content = self._get_full_content_with_context(  # pylint: disable=too-many-function-args
                connection=connection,
                content_id=result.content_id,
                chunk_number=result.chunk_number,
                current_content=result.content,
                organization_id=organization_id,
            )

        return {
            "id": str(result.id),
            "content": full_content,
            "source_id": str(result.source_id),
            "content_id": result.content_id,
            "chunk_number": result.chunk_number,
            "metadata": result.meta_data if result.meta_data else {},
            "confidence_score": confidence_score,
            "distance": distance,
        }

    def _get_full_content_with_context(
        self,
        connection: Connection,
        content_id: str,
        chunk_number: int,
        current_content: str,
        organization_id: str,
    ) -> str:  # pylint: disable=too-many-arguments
        """Get full content including adjacent chunks."""
        all_chunks = self._get_adjacent_chunks(
            connection=connection,
            content_id=content_id,
            chunk_number=chunk_number,
            organization_id=organization_id,
        )

        if not all_chunks:
            return current_content

        # Sort by chunk_number
        all_chunks.sort(key=lambda x: x["chunk_number"])

        # Combine content
        return "\n\n".join(
            [
                f'***Message #{idx}***{chunk["content"]}'
                for idx, chunk in enumerate(all_chunks)
            ]
        )

    def _get_adjacent_chunks(  # pylint: disable=too-many-arguments
        self,
        connection: Connection,
        content_id: str,
        chunk_number: int,
        organization_id: str,
        num_chunks: int = 4,
    ) -> List[Dict[str, Any]]:
        """Fetch adjacent chunks (before and after) for a given chunk."""
        # Get chunks within the range: chunk_number - num_chunks to chunk_number + num_chunks
        query = text(
            """
            SELECT
                id,
                content,
                chunk_number,
                meta_data
            FROM knowledge
            WHERE content_id = :content_id
                AND organization_id = :org_id
                AND chunk_number BETWEEN :start_chunk AND :end_chunk
            ORDER BY chunk_number
        """
        )

        results = connection.execute(
            query,
            {
                "content_id": content_id,
                "org_id": organization_id,
                "start_chunk": chunk_number - num_chunks,
                "end_chunk": chunk_number + num_chunks,
            },
        ).fetchall()

        adjacent_chunks = []
        for result in results:
            adjacent_chunks.append(
                {
                    "id": str(result.id),
                    "content": result.content,
                    "chunk_number": result.chunk_number,
                    "metadata": result.meta_data if result.meta_data else {},
                }
            )

        return adjacent_chunks

    def _calculate_confidence_score(self, distance: float) -> float:
        """Convert L2 distance to confidence score (0-1 scale)."""
        # Lower distance means higher confidence
        # Distance 0 = perfect match (confidence 1.0)
        # Distance 2+ = very low confidence (confidence ~0)
        return max(0.0, min(1.0, 1.0 - (distance / 2.0)))


knowledge_search_tool = KnowledgeSearchTool()
