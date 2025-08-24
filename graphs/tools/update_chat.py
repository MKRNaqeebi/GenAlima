"""
Update chat tool for LangGraph.

This tool allows updating a chat's title in the system by interacting
with the database directly. It provides a way for the AI to update chat
metadata during conversations.
"""

from typing import Optional, Type
import uuid

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.db import engine as db_engine
from app.models import Chat
from graphs.utils import store_tool_result_metadata


class UpdateChatInput(BaseModel):
    """Input schema for the update chat tool."""

    chat_id: str = Field(description="The UUID of the chat to update")
    title: Optional[str] = Field(
        description="New title for the chat based on conversation context in 2-5 words", default="New Chat")
    message_id: str = Field(description="The ID of the message being processed")


class UpdateChatTool(BaseTool):
    """Tool that updates a chat's title in the database."""

    name: str = "update_chat"
    description: str = (
        "Update a chat's title. This tool called on every call to update chat title."
        "chat metadata such as the title. Use this when you need to rename "
        "or update chat information based on the conversation context."
    )
    args_schema: Type[BaseModel] = UpdateChatInput
    return_direct: bool = False

    def _run(  # pylint: disable=arguments-differ
        self,
        chat_id: str,
        title: Optional[str] = None,
        message_id: str = "",
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Execute the chat update."""
        _ = run_manager  # Suppress unused argument warning

        try:
            # Parse UUID
            chat_uuid = uuid.UUID(chat_id)
        except ValueError:
            error_msg = f"Invalid chat ID format: {chat_id}"
            store_tool_result_metadata(
                message_id, self.name,
                {"input": {"chat_id": chat_id, "title": title}, "error": error_msg}
            )
            return error_msg

        with Session(db_engine) as session:
            # Get the chat
            chat = session.get(Chat, chat_uuid)
            if not chat:
                error_msg = f"Chat not found with ID: {chat_id}"
                store_tool_result_metadata(
                    message_id, self.name,
                    {"input": {"chat_id": chat_id, "title": title}, "error": error_msg}
                )
                return error_msg

            # Update fields if provided
            updates_made = []
            if title is not None:
                old_title = chat.title
                chat.title = title
                updates_made.append(f"title: '{old_title}' -> '{title}'")

            if not updates_made:
                result_msg = "No updates provided"
                store_tool_result_metadata(
                    message_id, self.name,
                    {"input": {"chat_id": chat_id, "title": title}, "output": result_msg}
                )
                return result_msg

            # Save changes
            session.add(chat)
            session.commit()
            session.refresh(chat)

            result_msg = f"Successfully updated chat {chat_id}: {', '.join(updates_made)}"
            store_tool_result_metadata(
                message_id, self.name,
                {
                    "input": {"chat_id": chat_id, "title": title},
                    "output": result_msg,
                    "updates": updates_made
                }
            )
            return result_msg

    async def _arun(  # pylint: disable=arguments-differ
        self,
        chat_id: str,
        title: Optional[str] = None,
        message_id: str = "",
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> str:
        """Async version of the chat update."""
        return self._run(
            chat_id=chat_id,
            title=title,
            message_id=message_id,
            run_manager=run_manager,
        )


update_chat_tool = UpdateChatTool()
