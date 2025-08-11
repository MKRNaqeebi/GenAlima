from http.client import HTTPException
import uuid
from sqlalchemy import select

from app.api.deps import SessionDep

from .models import Message, Chat, Template


def save_chat_message(
    session: SessionDep,
    role: str,
    chat_id: uuid.UUID,
    content: str
) -> Message:
    """
    Save a chat message.
    """
    message = Message(
        role=role,
        chat_id=chat_id,
        content=content
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return message

def update_chat_message(
    session: SessionDep,
    message_id: uuid.UUID,
    content: str
) -> Message:
    """
    Update a chat message.
    """
    message = session.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.content = content
    session.add(message)
    session.commit()
    session.refresh(message)
    return message

def save_chat(
    session: SessionDep,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    title: str,
    owner_id: uuid.UUID,
    template_id: uuid.UUID=None
) -> Chat:
    """
    Save a chat message.
    """
    # get template if template_id is provided
    if template_id:
        template = session.get(Template, template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
    else:
        template = session.exec(select(Template)).first()[0]
        if not template:
            raise HTTPException(status_code=404, detail="Default template not found")
    chat = Chat(
        id=id,
        title=title,
        owner_id=owner_id,
        template_id=template.id
    )
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat
