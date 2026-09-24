"""
This file contains the schema for the different models in the application.
The schema is used to validate the data that is sent to the application.
"""
# Standard library imports
from datetime import datetime
from typing import Any, Dict, List
import uuid

# Third-party imports
from pgvector.sqlalchemy import Vector
from pydantic import EmailStr, ConfigDict, field_validator, model_validator
from sqlalchemy import Column, Text
from sqlmodel import JSON, Field, Relationship, SQLModel


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
    email: EmailStr | None = Field(
        default=None, max_length=255)  # type: ignore
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
    items: list["Item"] = Relationship(
        back_populates="owner", cascade_delete=True)
    organizations: list["Organization"] = Relationship(
        back_populates="owner", cascade_delete=True)
    templates: list["Template"] = Relationship(
        back_populates="owner", cascade_delete=True)
    chats: list["Chat"] = Relationship(
        back_populates="owner", cascade_delete=True)
    knowledge_files: list["KnowledgeFile"] = Relationship(
        back_populates="owner", cascade_delete=True)
    connectors: list["Connector"] = Relationship(
        back_populates="owner", cascade_delete=True)
    workflows: list["Workflow"] = Relationship(
        back_populates="owner", cascade_delete=True)


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


class OrganizationUpdate(OrganizationBase):
    """
    Properties to receive on item update
    """
    title: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore


class Organization(OrganizationBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="organizations")


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


class LargeModelUpdate(LargeModelBase):
    """
    Properties to receive on item update
    """
    title: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore
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
    meta_data: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class ConnectorCreate(ConnectorBase):
    """
    Properties to receive on connector creation
    """


class ConnectorUpdate(ConnectorBase):
    """
    Properties to receive on item update
    """
    name: str | None = Field(default=None, min_length=1,
                             max_length=255)  # type: ignore
    description: str | None = Field(default=None, max_length=255)
    active: bool | None = Field(default=None)
    meta_data: Dict[str, Any] | None = Field(default=None)


class Connector(ConnectorBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="connectors")


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
    template: str | None = Field(default=None, max_length=4096)
    placeholder: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)
    connector: str | None = Field(default=None, max_length=255)
    active: bool = Field(default=True)


class TemplateUpdate(TemplateBase):
    """
    Properties to receive on item update
    """
    title: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore
    description: str | None = Field(default=None, max_length=255)


class Template(TemplateBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE")
    owner: User | None = Relationship(back_populates="templates")
    chats: list["Chat"] = Relationship(
        back_populates="template", cascade_delete=True)


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


class ChatUpdate(ChatBase):
    """
    Properties to receive on item update
    """
    title: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore


class Chat(ChatBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE")
    owner: User | None = Relationship(back_populates="chats")
    template_id: uuid.UUID = Field(
        foreign_key="template.id", nullable=False, ondelete="CASCADE")
    template: Template | None = Relationship(back_populates="chats")
    messages: list["Message"] = Relationship(
        back_populates="chat", cascade_delete=True)
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
    content: str = Field(max_length=4096)
    meta_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=True))
    chat_id: uuid.UUID = Field(
        foreign_key="chat.id", nullable=False, ondelete="CASCADE"
    )


class MessageUpdate(SQLModel):
    """
    Properties to receive on item update
    """
    meta_data: Dict[str, Any] = Field(default=None)


class Message(MessageBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    role: str = Field(max_length=255)
    content: str = Field(max_length=4096)
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
    meta_data: Dict[str, Any] | None = None


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


# Properties to receive on item update
class ItemUpdate(ItemBase):
    """
    Properties to receive on item update
    """
    title: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore


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


class KnowledgeFileBase(SQLModel):
    """
    Model for knowledge files.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    file_path: str = Field(max_length=255)
    chunk_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgeFile(KnowledgeFileBase, table=True):
    """
    Database model for knowledge files.
    """
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    owner: User | None = Relationship(back_populates="knowledge_files")
    knowledges: list["Knowledge"] = Relationship(back_populates="knowledge_file")


class KnowledgeFilePublic(KnowledgeFileBase):
    """
    Properties to return via API, id is always required
    """
    id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    created_at: datetime | None = None


class KnowledgeFilesPublic(SQLModel):
    """
    Properties to return via API for file listing
    """
    data: list[KnowledgeFilePublic]
    count: int


class KnowledgeBase(SQLModel):
    """
    Base model for knowledge-related data.
    source_type: pdf, txt, word, md, webpage, etc
    """
    source_type: str = Field(default="pdf", max_length=64)
    content: str
    meta: dict = Field(sa_column=Column(JSON))


class KnowledgeUpdate(KnowledgeBase):
    """
    Properties to receive on item update
    """
    category: str | None = Field(
        default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None)


class Knowledge(KnowledgeBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    content_vector: List[float] = Field(default=None, sa_column=Column(Vector(1536)))
    knowledge_file_id: uuid.UUID = Field(
        foreign_key="knowledgefile.id", nullable=False, ondelete="CASCADE"
    )
    knowledge_file: KnowledgeFile | None = Relationship(back_populates="knowledges")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgePublic(KnowledgeBase):
    """
    Properties to return via API, id is always required
    """
    id: uuid.UUID | None = None
    knowledge_file_id: uuid.UUID | None = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgesPublic(SQLModel):
    """
    Properties to return via API, id is always required
    """
    data: list[KnowledgePublic]
    count: int


# ---------------------------------------------------------------------------
# All Workflow models
#
# A workflow is a DAG of code nodes. Every node holds user-authored Python in
# the `code` column; edges connect node ids and carry lists of n8n-style items
# shaped {"json": {...}, "binary": {...}}. Unlike n8n, each node also declares a
# strict input and output contract built from WorkflowFieldSpec.
# ---------------------------------------------------------------------------
ALLOWED_FIELD_TYPES = ("str", "int", "float", "bool", "list", "dict", "datetime", "Any")


class WorkflowBase(SQLModel):
    """
    This is the shared schema for a workflow
    """
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    active: bool = Field(default=True)
    settings: Dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON))


class WorkflowCreate(WorkflowBase):
    """
    Properties to receive on workflow creation
    """


class WorkflowUpdate(WorkflowBase):
    """
    Properties to receive on workflow update
    """
    name: str | None = Field(
        default=None, min_length=1, max_length=255)  # type: ignore
    description: str | None = Field(default=None, max_length=1024)
    active: bool | None = Field(default=None)
    settings: Dict[str, Any] | None = Field(default=None)


class Workflow(WorkflowBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    version: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    owner: User | None = Relationship(back_populates="workflows")
    nodes: list["WorkflowNode"] = Relationship(
        back_populates="workflow", cascade_delete=True)
    edges: list["WorkflowEdge"] = Relationship(
        back_populates="workflow", cascade_delete=True)


class WorkflowPublic(WorkflowBase):
    """
    Properties to return via API, id is always required
    """
    id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    version: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkflowsPublic(SQLModel):
    """
    Properties to return via API for workflow listing
    """
    data: list[WorkflowPublic]
    count: int


class WorkflowDetailPublic(WorkflowPublic):
    """
    A workflow plus its full graph, returned by GET /workflows/{id} so the
    editor loads everything in one request.
    """
    nodes: list["WorkflowNodePublic"] = Field(default_factory=list)
    edges: list["WorkflowEdgePublic"] = Field(default_factory=list)


class WorkflowFieldSpec(SQLModel):
    """
    Pydantic-style spec for one field of a node's input or output.

    A node declares its input and output as ``{field_name: WorkflowFieldSpec}``.
    The allowed ``type`` values mirror the common Pydantic annotations GenAlima
    uses: str, int, float, bool, list, dict, datetime, Any. ``items`` names the
    element type when ``type`` is "list".

    Invariants enforced here: the type must come from the known vocabulary, and
    `required` follows Pydantic semantics — leave it unset and it resolves to
    false when a `default` is given, true otherwise. Stating `required: true`
    alongside a default is rejected as contradictory.
    """
    model_config = ConfigDict(extra="forbid")

    type: str = Field(default="str", max_length=16)
    required: bool | None = Field(
        default=None,
        description="Resolved automatically: false when a default is set, else true.",
    )
    default: Any | None = Field(default=None)
    description: str | None = Field(default=None, max_length=255)
    enum: list[Any] | None = Field(default=None)
    items: str | None = Field(default=None, max_length=16)

    @field_validator("type", "items")
    @classmethod
    def _known_type(cls, value: str | None) -> str | None:
        """
        Reject typos such as "string" or "integer" at write time instead of
        letting them fail silently at run time.
        """
        if value is None:
            return value
        if value not in ALLOWED_FIELD_TYPES:
            raise ValueError(
                f"unknown field type {value!r}; allowed: {list(ALLOWED_FIELD_TYPES)}"
            )
        return value

    @model_validator(mode="after")
    def _resolve_required(self) -> "WorkflowFieldSpec":
        """
        Mirror Pydantic: a field carrying a default is optional, everything else
        is required. An explicit contradiction is an authoring error.
        """
        if self.required is None:
            self.required = self.default is None
        elif self.required and self.default is not None:
            raise ValueError(
                f"field of type {self.type!r} has a default and cannot be required"
            )
        return self


class WorkflowNodeBase(SQLModel):
    """
    Shared schema for a node inside a workflow graph.

    `type` is "code" for now but exists so other node types can be added later
    without reshaping the graph. `code` is a first-class column rather than a
    key inside `parameters` so code round-trips through the API verbatim.

    `input` and `output` are the node's strict type contracts, expressed as
    Pydantic-style field specs. An empty dict means "no declared contract":
    allowed for the input of entry nodes, but an untyped output cannot be
    statically proven to satisfy a typed downstream input.

    The contracts are canonicalised on write (shorthands expanded, defaults
    filled in), so the JSON column always holds a uniform, complete spec.
    """
    key: str = Field(max_length=64)
    name: str = Field(max_length=255)
    type: str = Field(default="code", max_length=64)
    type_version: int = Field(default=1)
    position_x: float = Field(default=0)
    position_y: float = Field(default=0)
    disabled: bool = Field(default=False)
    code: str = Field(default="", sa_column=Column(Text))
    input: Dict[str, WorkflowFieldSpec] = Field(
        default_factory=dict, sa_column=Column(JSON))
    output: Dict[str, WorkflowFieldSpec] = Field(
        default_factory=dict, sa_column=Column(JSON))
    type_enforcement: str = Field(default="strict", max_length=8)
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {
            "language": "python",
            "mode": "runOnceForAllItems",
            "timeout": 30,
            "onError": "stopWorkflow",
        },
        sa_column=Column(JSON),
    )
    notes: str | None = Field(default=None, max_length=1024)

    @field_validator("input", "output", mode="before")
    @classmethod
    def _canonicalize_contract(cls, value: Any) -> Any:
        """
        Validate and normalise a declared contract.

        Accepts ``{"q": "str"}`` as shorthand for ``{"q": {"type": "str"}}``.
        Without this, `sa_column` fields on SQLModel table classes skip type
        validation entirely and malformed specs reach the database.
        """
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError(
                "input/output must be a mapping of field name to field spec")
        canonical: Dict[str, Any] = {}
        for name, spec in value.items():
            if isinstance(spec, str):
                spec = {"type": spec}
            if isinstance(spec, WorkflowFieldSpec):
                spec = spec.model_dump()
            canonical[name] = WorkflowFieldSpec.model_validate(spec).model_dump()
        return canonical

    @field_validator("type_enforcement")
    @classmethod
    def _known_enforcement(cls, value: str) -> str:
        """
        Only the three documented modes are accepted.
        """
        if value not in ("strict", "warn", "off"):
            raise ValueError(
                f"type_enforcement must be strict, warn or off, got {value!r}")
        return value


class WorkflowNodeCreate(WorkflowNodeBase):
    """
    Properties to receive when saving a node. The id is generated by the client
    so edges can reference a node before it has been persisted; the server fills
    it in when omitted.
    """
    id: uuid.UUID | None = None


class WorkflowNode(WorkflowNodeBase, table=True):
    """
    Database model for a single code node of a workflow.

    `input`/`output` are deliberately re-typed to plain dicts here: the API
    models (`WorkflowNodeCreate` / `WorkflowNodePublic`) carry the typed
    `WorkflowFieldSpec` contract for validation and responses, while
    SQLAlchemy's JSON column can only serialise plain dicts. The inherited
    `_canonicalize_contract` validator still runs, so what lands in the column
    is always a canonical spec dict.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(
        foreign_key="workflow.id", nullable=False, ondelete="CASCADE"
    )
    input: Dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON))
    output: Dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON))
    workflow: Workflow | None = Relationship(back_populates="nodes")

    @field_validator("id", mode="before")
    @classmethod
    def _default_id(cls, value: Any) -> Any:
        """
        Fill in a server-side id when the client omitted one.

        `WorkflowNodeCreate.id` is optional so edges can reference a node before
        it exists; without this, validating a create payload straight into the
        table model fails instead of generating the primary key.
        """
        return value if value is not None else uuid.uuid4()


class WorkflowNodePublic(WorkflowNodeBase):
    """
    Properties to return via API, id is always required
    """
    id: uuid.UUID
    workflow_id: uuid.UUID


class WorkflowEdgeBase(SQLModel):
    """
    Shared schema for an edge between two nodes, keyed by node id (not name)
    """
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    source_handle: str = Field(default="main", max_length=32)
    target_handle: str = Field(default="main", max_length=32)


class WorkflowEdgeCreate(WorkflowEdgeBase):
    """
    Properties to receive when saving an edge
    """
    id: uuid.UUID | None = None


class WorkflowEdge(WorkflowEdgeBase, table=True):
    """
    Database model for an edge of a workflow
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(
        foreign_key="workflow.id", nullable=False, ondelete="CASCADE"
    )
    workflow: Workflow | None = Relationship(back_populates="edges")


class WorkflowEdgePublic(WorkflowEdgeBase):
    """
    Properties to return via API, id is always required
    """
    id: uuid.UUID
    workflow_id: uuid.UUID


class WorkflowGraphIn(SQLModel):
    """
    Payload for the transactional graph upsert: the full node and edge set of a
    workflow. Anything missing from these lists is deleted by the route.
    """
    nodes: list[WorkflowNodeCreate]
    edges: list[WorkflowEdgeCreate]


class WorkflowGraphPublic(SQLModel):
    """
    Canonical graph returned after a save so the client can reconcile ids
    """
    id: uuid.UUID
    version: int
    nodes: list[WorkflowNodePublic]
    edges: list[WorkflowEdgePublic]


class WorkflowRunIn(SQLModel):
    """
    Payload for running a workflow or a single node
    """
    items: list[dict] = Field(default_factory=lambda: [{"json": {}}])


class WorkflowRun(SQLModel, table=True):
    """
    Database model for one execution of a workflow
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(
        foreign_key="workflow.id", nullable=False, ondelete="CASCADE"
    )
    status: str = Field(default="running", max_length=16)
    mode: str = Field(default="manual", max_length=16)
    trigger_items: list[dict] = Field(
        default_factory=list, sa_column=Column(JSON))
    error: str | None = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = Field(default=None)


class WorkflowRunNode(SQLModel, table=True):
    """
    Database model for the result of one node inside one run
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(
        foreign_key="workflowrun.id", nullable=False, ondelete="CASCADE"
    )
    node_id: uuid.UUID = Field(
        foreign_key="workflownode.id", nullable=False, ondelete="CASCADE"
    )
    status: str = Field(default="pending", max_length=16)
    input_items: list[dict] = Field(
        default_factory=list, sa_column=Column(JSON))
    output_items: list[dict] = Field(
        default_factory=list, sa_column=Column(JSON))
    logs: str | None = Field(default=None, sa_column=Column(Text))
    error: str | None = Field(default=None, sa_column=Column(Text))
    duration_ms: int | None = Field(default=None)


class WorkflowRunNodePublic(SQLModel):
    """
    Properties to return via API for a single node result
    """
    id: uuid.UUID
    run_id: uuid.UUID
    node_id: uuid.UUID
    status: str
    input_items: list[dict]
    output_items: list[dict]
    logs: str | None = None
    error: str | None = None
    duration_ms: int | None = None


class WorkflowRunPublic(SQLModel):
    """
    Properties to return via API for a run, including per-node results
    """
    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    mode: str
    trigger_items: list[dict]
    error: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    nodes: list[WorkflowRunNodePublic] = Field(default_factory=list)


class WorkflowRunsPublic(SQLModel):
    """
    Properties to return via API for run history
    """
    data: list[WorkflowRunPublic]
    count: int
