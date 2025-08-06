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
    Knowledge,
    Message,
    MessageBase,
    MessagePublic,
    MessagesPublic,
    MessageUpdate,
)
from gen_model import call_gen_model, gen_openai_model

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


def get_message_knowledge(
        session: SessionDep, current_user: CurrentUser, message_content: str) -> str:
    """
    Get message by ID.
    """
    # convert message_content to vector using openai
    embedding = gen_openai_model.get_text_to_embedding(message_content)
    messages = session.exec(select(Knowledge).where(Knowledge.owner_id==current_user.id).order_by(
        # pylint: disable=no-member
        Knowledge.content_vector.l2_distance(embedding)).limit(3)).all()
    # get the knowledge content and convert it to string
    knowledge_content = "\n### Knowledge relevant to the message\n"
    for knowledge in messages:
        knowledge_content += f"- {knowledge.content}\n"
    return knowledge_content


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
    # get data from connector and pass it to the system prompt
    knowledge_content = get_message_knowledge(session, current_user, message.content)
    messages.append({"role": "system", "content": f"{chat.template.template}\n{knowledge_content}"})
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
