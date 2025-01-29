from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrganizationSchema(BaseModel):
    id: str
    name: str
    description: str
    createdAt: datetime
    updatedAt: datetime

class UserSchema(BaseModel):
    id: str
    email: str
    firstName: str
    lastName: str
    photoURL: str
    permission: str
    organization: str
    organizationPermission: str
    createdAt: datetime
    updatedAt: datetime

class LargeModelSchema(BaseModel):
    id: str
    name: str
    description: str
    rank: int
    provider: str
    organization: str
    active: bool
    createdAt: datetime
    updatedAt: datetime

class ConnectorSchema(BaseModel):
    id: str
    name: str
    description: str
    function: str
    organization: str
    active: bool
    createdAt: datetime
    updatedAt: datetime

class PromptTemplateSchema(BaseModel):
    id: str
    title: str
    description: str
    instructions: str
    organization: str
    template: str
    placeholder: str
    # model: LargeModelSchema
    model: str
    connector: str
    active: bool
    createdAt: datetime
    updatedAt: datetime

class ChatSchema(BaseModel):
    id: str
    user: UserSchema
    model: LargeModelSchema
    template: PromptTemplateSchema
    organization: OrganizationSchema
    history: list[dict]
    organization: str
    createdAt: datetime
    updatedAt: datetime

class MessageSchema(BaseModel):
    id: Optional[str]
    role: str
    content: str
    createdAt: datetime
    updatedAt: datetime

class CompletionsInputSchema(BaseModel):
    """
    This is the schema for the input data to the get_completions endpoint.
    """
    query: str
    prompt: Optional[str]
    history: Optional[list[MessageType]]
