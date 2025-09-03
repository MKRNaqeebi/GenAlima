"""This file contains the graph utilities for the application."""
from typing import Any, Dict, Union
import uuid
import tiktoken

# Third-party imports
from langchain_core.messages import trim_messages as _trim_messages
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select

# Local application imports
from app.core.db import engine as db_engine
from app.core.logging import logger
from app.core.config import settings
from app.models import Message


def dump_messages(messages: list[Message]) -> list[dict]:
    """Dump the messages to a list of dictionaries.

    Args:
        messages (list[Message]): The messages to dump.

    Returns:
        list[dict]: The dumped messages.
    """
    dumped_messages = []
    for message in messages:
        msg_dict = message.model_dump()
        # Convert UUID fields to strings for LangChain compatibility
        if "id" in msg_dict and msg_dict["id"] is not None:
            msg_dict["id"] = str(msg_dict["id"])
        if "chat_id" in msg_dict and msg_dict["chat_id"] is not None:
            msg_dict["chat_id"] = str(msg_dict["chat_id"])
        dumped_messages.append(msg_dict)
    return dumped_messages

def hard_coded_token_counter(messages: Union[list, dict, str]) -> int:
    """
    Count tokens for messages using tiktoken.
    
    Args:
        messages: Can be a list of messages, a single message dict, or a string
        
    Returns:
        int: Number of tokens
    """
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
    except KeyError:
        encoding = tiktoken.encoding_for_model("gpt-4")
    total_tokens = 0
    if isinstance(messages, str):
        return len(encoding.encode(messages))
    if isinstance(messages, dict):
        messages = [messages]
    for message in messages:
        if isinstance(message, dict):
            role = message.get("role", "")
            content = message.get("content", "")
            total_tokens += len(encoding.encode(role))
            total_tokens += len(encoding.encode(str(content)))
            total_tokens += 3
        elif isinstance(message, str):
            total_tokens += len(encoding.encode(message))
    total_tokens += 3
    return total_tokens

def prepare_messages(messages: list[Message], system_prompt: str) -> list[Message]:
    """Prepare the messages for the LLM.

    Args:
        messages (list[Message]): The messages to prepare.
        llm (BaseChatModel): The LLM to use.
        system_prompt (str): The system prompt to use.

    Returns:
        list[Message]: The prepared messages.
    """
    trimmed_messages = _trim_messages(
        dump_messages(messages),
        strategy="last",
        token_counter=hard_coded_token_counter,
        max_tokens=settings.MAX_TOKENS,
        start_on="human",
        include_system=False,
        allow_partial=False,
    )
    return [Message(role="system", content=system_prompt)] + trimmed_messages

def store_tool_result_metadata(
    message_id: uuid.UUID,
    tool_name: str,
    tool_result: Dict[str, Any],
    display_name: str | None = None,
) -> None:
    """
    Store tool results in message metadata.

    Args:
        message_id: The ID of the message to store metadata for
        tool_name: The name of the tool that generated the result
        tool_result: The result data to store
        display_name: Optional display name for frontend presentation
    """
    with Session(db_engine) as session:
        statement = select(Message).where(Message.id == message_id)
        message = session.exec(statement).first()
        if not message:
            logger.warning("Message with ID %s not found", message_id)
            return
        # Update the metadata with tool results
        meta_data = message.meta_data or {}
        # Add tool results to metadata
        if "debug" not in meta_data:
            meta_data["debug"] = {}

        # Create the debug entry with display name if provided
        debug_entry = (
            tool_result.copy()
            if isinstance(tool_result, dict)
            else {"data": tool_result}
        )
        if display_name:
            debug_entry["name"] = display_name

        meta_data["debug"][tool_name] = debug_entry
        message.meta_data = meta_data
        flag_modified(message, "meta_data")
        session.add(message)
        session.commit()
        session.refresh(message)
        logger.info("Stored tool metadata for message %s", message_id)
