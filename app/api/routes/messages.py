"""
Messages API routes.
"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message, MessageBase, MessagePublic, MessagesPublic, MessageUpdate, Chat)
from gen_model import call_gen_model

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


@router.post("/", response_model=MessagePublic)
def create_message(
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
    message = Message.model_validate(message_in)
    messages = []
    for msg in chat.messages:
        messages.append({"role": msg.role, "content": msg.content})
    session.add(message)
    session.commit()
    session.refresh(message)
    # TODO: get data from connector and pass it to the system prompt
    messages.append({"role": "system", "content": chat.template.template})
    messages.append({"role": message_in.role, "content": message_in.content})
    response = call_gen_model(chat.template.model, messages)
    resp_message = Message(
        chat_id=chat.id, role="assistant", content=response, owner_id=current_user.id)
    session.add(resp_message)
    session.commit()
    session.refresh(resp_message)
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
