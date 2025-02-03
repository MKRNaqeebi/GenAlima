"""
This file contains the schema for the different models in the application.
The schema is used to validate the data that is sent to the application.
"""
from datetime import datetime
import uuid

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel


# Shared properties
class UserBase(SQLModel):
  """
  This is the base schema for the user (Shared properties)
  """
  email: EmailStr = Field(unique=True, index=True, max_length=255)
  is_active: bool = True
  is_superuser: bool = False
  full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
  """
  Properties to receive via API on creation
  """
  password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
  """
  Properties to receive via API on registration
  """
  email: EmailStr = Field(max_length=255)
  password: str = Field(min_length=8, max_length=40)
  full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
  """
  Properties to receive via API on update, all are optional
  """
  email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
  password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
  """
  Properties to receive via API on update, all are optional
  """
  full_name: str | None = Field(default=None, max_length=255)
  email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
  """
  Properties to receive via API on update password
  """
  current_password: str = Field(min_length=8, max_length=40)
  new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  hashed_password: str
  items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


class UserPublic(UserBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID


class UsersPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[UserPublic]
  count: int


# All Organization models
class OrganizationBase(SQLModel):
  """
  Shared properties
  """
  title: str = Field(min_length=1, max_length=255)
  description: str | None = Field(default=None, max_length=255)


class OrganizationCreate(OrganizationBase):
  """
  Properties to receive on item creation
  """
  pass


class OrganizationUpdate(OrganizationBase):
  """
  Properties to receive on item update
  """
  title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


class Organization(OrganizationBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  title: str = Field(max_length=255)
  owner_id: uuid.UUID = Field(
    foreign_key="user.id", nullable=False, ondelete="CASCADE"
  )
  owner: User | None = Relationship(back_populates="items")


class OrganizationPublic(OrganizationBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None
  owner_id: uuid.UUID | None = None


class OrganizationsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[OrganizationPublic]
  count: int


# All LargeModel models
class LargeModelBase(SQLModel):
  """
  This is the schema for the large model
  """
  title: str = Field(max_length=255)
  description: str | None = Field(default=None, max_length=255)
  rank: int = Field(default=0)
  provider: str | None = Field(default=None, max_length=255)
  active: bool = Field(default=True)


class LargeModelCreate(LargeModelBase):
  """
  Properties to receive on item creation
  """
  pass


class LargeModelUpdate(LargeModelBase):
  """
  Properties to receive on item update
  """
  title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
  description: str | None = Field(default=None, max_length=255)


class LargeModel(LargeModelBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  title: str = Field(max_length=255)


class LargeModelPublic(LargeModelBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None


class LargeModelsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[LargeModelPublic]
  count: int


# All Connector models
class ConnectorBase(SQLModel):
  """
  This is the schema for the connector
  """
  name: str = Field(max_length=255)
  description: str | None = Field(default=None, max_length=255)
  function: str | None = Field(default=None, max_length=255)
  active: bool = Field(default=True)


class ConnectorCreate(ConnectorBase):
  """
  Properties to receive on item creation
  """
  pass


class ConnectorUpdate(ConnectorBase):
  """
  Properties to receive on item update
  """
  name: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
  description: str | None = Field(default=None, max_length=255)


class Connector(ConnectorBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  name: str = Field(max_length=255)


class ConnectorPublic(ConnectorBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None


class ConnectorsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[ConnectorPublic]
  count: int


# All Template models
class TemplateBase(SQLModel):
  """
  This is the schema for the template
  """
  title: str = Field(max_length=255)
  description: str | None = Field(default=None, max_length=255)
  instructions: str | None = Field(default=None, max_length=255)
  template: str | None = Field(default=None, max_length=255)
  placeholder: str | None = Field(default=None, max_length=255)
  model: str | None = Field(default=None, max_length=255)
  connector: str | None = Field(default=None, max_length=255)
  active: bool = Field(default=True)


class TemplateCreate(TemplateBase):
  """
  Properties to receive on item creation
  """
  pass


class TemplateUpdate(TemplateBase):
  """
  Properties to receive on item update
  """
  title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
  description: str | None = Field(default=None, max_length=255)


class Template(TemplateBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  title: str = Field(max_length=255)
  owner_id: uuid.UUID = Field(
    foreign_key="user.id", nullable=False, ondelete="CASCADE"
  )
  owner: User | None = Relationship(back_populates="templates")


class TemplatePublic(TemplateBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None


class TemplatesPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[TemplatePublic]
  count: int


# All Chat models
class ChatBase(SQLModel):
  """
  This is the schema for the chat
  """
  title: str = Field(max_length=255)
  template_id: uuid.UUID = Field(
    foreign_key="template.id", nullable=False, ondelete="CASCADE"
  )


class ChatCreate(ChatBase):
  """
  Properties to receive on item creation
  """
  pass


class ChatUpdate(ChatBase):
  """
  Properties to receive on item update
  """
  title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


class Chat(ChatBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  title: str = Field(max_length=255)
  owner_id: uuid.UUID = Field(
    foreign_key="user.id", nullable=False, ondelete="CASCADE"
  )
  owner: User | None = Relationship(back_populates="chats")
  created_at: datetime = Field(default_factory=datetime.utcnow)
  updated_at: datetime = Field(default_factory=datetime.utcnow)


class ChatPublic(ChatBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None


class ChatsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[ChatPublic]
  count: int


class MessageBase(SQLModel):
  """
  This is the schema for the message
  """
  role: str = Field(max_length=255)
  content: str = Field(max_length=255)


class MessageCreate(MessageBase):
  """
  Properties to receive on item creation
  """
  pass


class MessageUpdate(MessageBase):
  """
  Properties to receive on item update
  """
  role: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
  content: str | None = Field(default=None, max_length=255)


class Message(MessageBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  role: str = Field(max_length=255)
  content: str = Field(max_length=255)
  chat_id: uuid.UUID = Field(
    foreign_key="chat.id", nullable=False, ondelete="CASCADE"
  )
  chat: Chat | None = Relationship(back_populates="messages")
  created_at: datetime = Field(default_factory=datetime.utcnow)


class MessagePublic(MessageBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None


class MessagesPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[MessagePublic]
  count: int


# All Completion models
class CompletionInput(SQLModel):
  """
  This is the schema for the input data to the get_completions endpoint.
  """
  query: str = Field(max_length=255)
  chat_id: uuid.UUID = Field(
    foreign_key="chat.id", nullable=False, ondelete="CASCADE"
  )


# Shared properties
class ItemBase(SQLModel):
  """
  Shared properties
  """
  title: str = Field(min_length=1, max_length=255)
  description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
  """
  Properties to receive on item creation
  """
  pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
  """
  Properties to receive on item update
  """
  title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
  """
  Database model, database table inferred from class name
  """
  id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
  title: str = Field(max_length=255)
  owner_id: uuid.UUID = Field(
      foreign_key="user.id", nullable=False, ondelete="CASCADE"
  )
  owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
  """
  Properties to return via API, id is always required
  """
  id: uuid.UUID | None = None
  owner_id: uuid.UUID | None = None


class ItemsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[ItemPublic]
  count: int


class Token(SQLModel):
  """
  JSON payload containing access token
  """
  access_token: str
  token_type: str = "bearer"


class TokenPayload(SQLModel):
  """
  Contents of JWT token
  """
  sub: str | None = None


class NewPassword(SQLModel):
  """
  Properties to receive via API on update
  """
  token: str
  new_password: str = Field(min_length=8, max_length=40)
