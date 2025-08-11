from http.client import HTTPException
import uuid

from app.api.deps import SessionDep

from .models import Message


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
