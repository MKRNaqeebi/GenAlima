"""
This file contains the schema for the different models in the application.
The schema is used to validate the data that is sent to the application.
"""
from typing import Optional
from datetime import datetime
import uuid

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel


class Organization(SQLModel):
  """
  This is the schema for the organization
  """
  id: str
  name: str
  description: str
  createdAt: datetime
  updatedAt: datetime


class LargeModel(SQLModel):
  """
  This is the schema for the large model
  """
  id: str
  name: str
  description: str
  rank: int
  provider: str
  organization: str
  active: bool
  createdAt: datetime
  updatedAt: datetime


class Connector(SQLModel):
  """
  This is the schema for the connector
  """
  id: str
  name: str
  description: str
  function: str
  organization: str
  active: bool
  createdAt: datetime
  updatedAt: datetime


class PromptTemplate(SQLModel):
  """
  This is the schema for the prompt
  """
  id: str
  title: str
  description: str
  instructions: str
  organization: str
  template: str
  placeholder: str
  model: str
  connector: str
  active: bool
  createdAt: datetime
  updatedAt: datetime


class Message(SQLModel):
  """
  This is the schema for the message
  """
  id: Optional[str]
  role: str
  content: str
  createdAt: datetime
  updatedAt: datetime


class CompletionsInput(SQLModel):
  """
  This is the schema for the input data to the get_completions endpoint.
  """
  query: str
  prompt: Optional[str]
  history: Optional[list[Message]]


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


class Chat(SQLModel):
  """
  This is the schema for the chat
  """
  id: str
  user: User
  model: LargeModel
  template: PromptTemplate
  organization: Organization
  history: list[dict]
  organization: str
  createdAt: datetime
  updatedAt: datetime


# Properties to return via API, id is always required
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
  id: uuid.UUID
  owner_id: uuid.UUID


class ItemsPublic(SQLModel):
  """
  Properties to return via API, id is always required
  """
  data: list[ItemPublic]
  count: int


# JSON payload containing access token
class Token(SQLModel):
  """
  JSON payload containing access token
  """
  access_token: str
  token_type: str = "bearer"


# Contents of JWT token
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
