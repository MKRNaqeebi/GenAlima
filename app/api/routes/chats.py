"""

"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Chat, ChatCreate, ChatPublic, ChatsPublic, ChatUpdate, Message

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("/", response_model=ChatsPublic)
def read_chats(
  session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
  """
  Retrieve chats.
  """
  if current_user.is_superuser:
    count_statement = select(func.count()).select_from(Chat)
    count = session.exec(count_statement).one()
    statement = select(Chat).offset(skip).limit(limit)
    chats = session.exec(statement).all()
  else:
    count_statement = (
      select(func.count())
      .select_from(Chat)
      .where(Chat.owner_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
      select(Chat)
      .where(Chat.owner_id == current_user.id)
      .offset(skip)
      .limit(limit)
    )
    chats = session.exec(statement).all()

  return ChatsPublic(data=chats, count=count)


@router.get("/{id}", response_model=ChatPublic)
def read_chat(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
  """
  Get chat by ID.
  """
  chat = session.get(Chat, id)
  if not chat:
    raise HTTPException(status_code=404, detail="Chat not found")
  if not current_user.is_superuser and (chat.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  return chat


@router.post("/", response_model=ChatPublic)
def create_chat(
  *, session: SessionDep, current_user: CurrentUser, chat_in: ChatCreate
) -> Any:
  """
  Create new chat.
  """
  chat = Chat.model_validate(chat_in, update={"owner_id": current_user.id})
  session.add(chat)
  session.commit()
  session.refresh(chat)
  return chat


@router.put("/{id}", response_model=ChatPublic)
def update_chat(
  *,
  session: SessionDep,
  current_user: CurrentUser,
  id: uuid.UUID,
  chat_in: ChatUpdate,
) -> Any:
  """
  Update an chat.
  """
  chat = session.get(Chat, id)
  if not chat:
    raise HTTPException(status_code=404, detail="Chat not found")
  if not current_user.is_superuser and (chat.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  update_dict = chat_in.model_dump(exclude_unset=True)
  chat.sqlmodel_update(update_dict)
  session.add(chat)
  session.commit()
  session.refresh(chat)
  return chat


@router.delete("/{id}")
def delete_chat(
  session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
  """
  Delete an chat.
  """
  chat = session.get(Chat, id)
  if not chat:
    raise HTTPException(status_code=404, detail="Chat not found")
  if not current_user.is_superuser and (chat.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  session.delete(chat)
  session.commit()
  return Message(message="Chat deleted successfully")
