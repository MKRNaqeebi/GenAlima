"""
Messages API routes.
"""
# Standard library imports
from typing import Any
import uuid

# Third-party imports
from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Chat,
    # Knowledge,
    Message,
    MessageBase,
    MessagePublic,
    MessagesPublic,
    MessageUpdate,
)
from app.model_utils import save_chat_message, update_chat_message
# from gen_model import call_gen_model, gen_openai_model
from graphs.main import lang_graph_agent

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/", response_model=MessagesPublic)
def read_messages(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve messages.
    """
    if current_user.is_superuser:
        # pylint: disable=not-callable
        count_statement = select(func.count()).select_from(Message)
        count = session.exec(count_statement).one()
        # pylint: disable=no-member
        statement = select(Message).offset(skip).limit(limit).order_by(Message.created_at.desc())
        messages = session.exec(statement).all()
        return MessagesPublic(data=messages, count=count)
    count_statement = (
        # pylint: disable=not-callable
        select(func.count()).select_from(Message).where(Message.owner_id == current_user.id))
    count = session.exec(count_statement).one()
    statement = (
        select(Message).where(Message.owner_id == current_user.id).offset(skip).limit(
            # pylint: disable=no-member
            limit)).order_by(Message.created_at.desc())
    messages = session.exec(statement).all()
    return MessagesPublic(data=messages, count=count)


@router.get("/{id}", response_model=MessagePublic)
def read_message(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID) -> Any:
    """
    Get message by ID.
    """
    message = session.get(Message, id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not current_user.is_superuser and (message.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return message


@router.get("/chat/{id}/", response_model=MessagesPublic)
def read_messages_by_chat(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID) -> Any:
    """
    Get messages by chat ID.
    """
    chat = session.get(Chat, id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not current_user.is_superuser and (chat.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    messages = chat.messages
    return MessagesPublic(data=messages, count=len(messages))


@router.post("/", response_model=MessagePublic)
async def create_message(
    *, session: SessionDep, current_user: CurrentUser, message_in: MessageBase
) -> Any:
    """
    Create new message.
    """
    chat = session.get(Chat, message_in.chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not current_user.is_superuser and chat.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    _ = save_chat_message(session=session, role=message_in.role, chat_id=chat.id, content=message_in.content)
    # Prepare messages for the agent (convert to Message objects)
    agent_messages = []
    for msg in chat.messages:
        agent_messages.append(Message(role=msg.role, content=msg.content, chat_id=msg.chat_id))
    response_message = save_chat_message(
        session=session, role="assistant", chat_id=chat.id, content="message processing."
    )
    agent_messages.append(Message(role="system", content=f"message_id={response_message.id}"))
    # get data from connector and pass it to the system prompt
    response = await lang_graph_agent.get_response(agent_messages, str(chat.id), str(current_user.id))
    if not response:
        raise HTTPException(status_code=500, detail="No response generated")
    last_msg = response[-1]
    # update content of the response message
    resp_message = update_chat_message(
        session=session, message_id=response_message.id, content=last_msg.content)
    return resp_message

@router.put("/{id}", response_model=MessagePublic)
def update_message(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    message_in: MessageUpdate,
) -> Any:
    """
    Update an message.
    """
    message = session.get(Message, id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not current_user.is_superuser and (message.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    update_dict = message_in.model_dump(exclude_unset=True)
    message.sqlmodel_update(update_dict)
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


@router.delete("/{id}")
def delete_message(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID
) -> Message:
    """
    Delete an message.
    """
    message = session.get(Message, id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not current_user.is_superuser and (message.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    session.delete(message)
    session.commit()
    return Message(message="Message deleted successfully")
