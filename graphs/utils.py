"""This file contains the graph utilities for the application."""

# Third-party imports
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import trim_messages as _trim_messages

# Local application imports
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


def prepare_messages(messages: list[Message], llm: BaseChatModel, system_prompt: str) -> list[Message]:
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
        token_counter=llm,
        max_tokens=settings.MAX_TOKENS,
        start_on="human",
        include_system=False,
        allow_partial=False,
    )
    return [Message(role="system", content=system_prompt)] + trimmed_messages
