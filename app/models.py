"""
This file contains the schema for the different models in the application.
The schema is used to validate the data that is sent to the application.
"""
# Standard library imports
from datetime import datetime
from typing import Any, Dict, Optional
import uuid

# Third-party imports
from pydantic import EmailStr, ConfigDict, field_validator, model_validator
from sqlalchemy import Column, ForeignKey, Text, UniqueConstraint, Uuid
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
    # Membership in an organization is mandatory. Both this key and
    # `Organization.owner_id` are deferred so a user and the organization that
    # owns it can be inserted in one transaction in either order, which is the
    # only way to satisfy both non-null keys given the user <-> organization
    # cycle. `CASCADE` means deleting an organization deletes its members.
    organization_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("organization.id", ondelete="CASCADE", deferrable=True, initially="DEFERRED"),
            nullable=False))
    organization: Optional["Organization"] = Relationship(
        back_populates="users",
        sa_relationship_kwargs={"foreign_keys": "User.organization_id"},
    )
    organizations: list["Organization"] = Relationship(
        back_populates="owner",
        cascade_delete=True,
        passive_deletes=True,
        sa_relationship_kwargs={"foreign_keys": "Organization.owner_id"},
    )
    workflows: list["Workflow"] = Relationship(back_populates="owner", cascade_delete=True)


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
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


class Organization(OrganizationBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    # Deferred for the same reason as `User.organization_id`: the user <-> owner
    # cycle means either row may be inserted first, so both foreign keys must be
    # checked at commit rather than per statement.
    owner_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user.id", ondelete="CASCADE", deferrable=True, initially="DEFERRED"),
            nullable=False))
    owner: User = Relationship(back_populates="organizations", sa_relationship_kwargs={"foreign_keys": "Organization.owner_id"})
    users: list["User"] = Relationship(
        back_populates="organization",
        passive_deletes=True,
        sa_relationship_kwargs={"foreign_keys": "User.organization_id"})


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


class Message(SQLModel):
    """
    Generic single-message response body, returned by endpoints that only need
    to report the outcome of the action they performed.
    """
    message: str


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


ALLOWED_FIELD_TYPES = ("str", "int", "float", "bool", "list", "dict", "datetime", "Any")


class WorkflowBase(SQLModel):
    """
    This is the shared schema for a workflow
    """
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    active: bool = Field(default=True)
    settings: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class WorkflowCreate(WorkflowBase):
    """
    Properties to receive on workflow creation
    """


class WorkflowUpdate(WorkflowBase):
    """
    Properties to receive on workflow update
    """
    name: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
    description: str | None = Field(default=None, max_length=1024)
    active: bool | None = Field(default=None)
    settings: Dict[str, Any] | None = Field(default=None)


class Workflow(WorkflowBase, table=True):
    """
    Database model, database table inferred from class name
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    version: int = Field(default=1)
    is_frozen: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    owner: User | None = Relationship(back_populates="workflows")
    nodes: list["WorkflowNode"] = Relationship(back_populates="workflow", cascade_delete=True)
    edges: list["WorkflowEdge"] = Relationship(back_populates="workflow", cascade_delete=True)


class WorkflowPublic(WorkflowBase):
    """
    Properties to return via API, id is always required

    `is_frozen` marks a published snapshot: readable, but never writable. The
    editor uses it to render the graph read-only.
    """
    id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    version: int | None = None
    is_frozen: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkflowSummaryPublic(WorkflowPublic):
    """
    A workflow as the list shows it: metadata plus its latest run and the newest
    component version published from it, so the table needs no extra requests.
    """
    last_run_status: str | None = None
    last_run_at: datetime | None = None
    published_version: int | None = None


class WorkflowsPublic(SQLModel):
    """
    Properties to return via API for workflow listing
    """
    data: list[WorkflowSummaryPublic]
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
    required: bool | None = Field(default=None, description="Resolved automatically: false when a default is set, else true.")
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
            raise ValueError(f"unknown field type {value!r}; allowed: {list(ALLOWED_FIELD_TYPES)}")
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
            raise ValueError(f"field of type {self.type!r} has a default and cannot be required")
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
    input: Dict[str, WorkflowFieldSpec] = Field(default_factory=dict, sa_column=Column(JSON))
    output: Dict[str, WorkflowFieldSpec] = Field(default_factory=dict, sa_column=Column(JSON))
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
            raise ValueError("input/output must be a mapping of field name to field spec")
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
            raise ValueError(f"type_enforcement must be strict, warn or off, got {value!r}")
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
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    input: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    output: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
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

    `mapping` says which key of the source node's output feeds which key of the
    target node's input, as ``{target_field: source_field}``. It is strict: an
    edge only carries the pairs it names, so an empty mapping carries nothing.
    Coverage is checked per target node across its inbound edges, not per edge.
    """
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    source_handle: str = Field(default="main", max_length=32)
    target_handle: str = Field(default="main", max_length=32)
    mapping: Dict[str, str] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))

    @field_validator("mapping", mode="before")
    @classmethod
    def _canonicalize_mapping(cls, value: Any) -> Any:
        """
        Reject a mapping that is not a flat object of non-empty field names.

        The column is JSON, so accepting anything else (a list of pairs, a
        ``{field: spec}`` contract) would store a shape the save-time checker
        cannot read. Field names are not length-capped here because the input
        and output contracts do not cap them either.
        """
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("mapping must be an object of {target_field: source_field}")
        canonical: Dict[str, str] = {}
        for target, source in value.items():
            if not isinstance(target, str) or not isinstance(source, str):
                raise ValueError("mapping keys and values must be field names (strings)")
            if not target or not source:
                raise ValueError("mapping field names must not be empty")
            canonical[target] = source
        return canonical


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
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
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
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    status: str = Field(default="running", max_length=16)
    mode: str = Field(default="manual", max_length=16)
    trigger_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    error: str | None = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = Field(default=None)


class WorkflowRunNode(SQLModel, table=True):
    """
    Database model for the result of one node inside one run
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="workflowrun.id", nullable=False, ondelete="CASCADE")
    node_id: uuid.UUID = Field(foreign_key="workflownode.id", nullable=False, ondelete="CASCADE")
    status: str = Field(default="pending", max_length=16)
    input_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    output_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
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


# ---------------------------------------------------------------------------
# Published workflow components
# ---------------------------------------------------------------------------
class WorkflowComponentBase(SQLModel):
    """
    Shared schema for a published, reusable workflow component.

    A component is a workflow published for reuse as a node in other workflows.
    Its identity is `(owner, name, version)`: the same name may be published many
    times, once per version, and each publish is its own immutable row. Routes
    compare the name trimmed and case-insensitively, so "Daily report" and
    "daily report" group together.

    There is no `organization_id` column: the owning organization is reached
    through `owner.organization_id`. Organization scoping (who may read or
    version a component) is therefore resolved by joining the owner, not stored
    per row.
    """
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)


class WorkflowComponentPublishIn(SQLModel):
    """
    Properties to receive when publishing a workflow as a component version.

    `version` is the author-chosen integer version; the routes reject one that
    already exists for the same `(organization, name)` with a 409 so the client
    can ask for another. `graph` is optional: when present the route replaces the
    workflow's graph before snapshotting, so the published version always matches
    the canvas the author was looking at. When omitted the persisted graph is
    used.
    """
    name: str = Field(min_length=1, max_length=255)
    version: int = Field(ge=1)
    description: str | None = Field(default=None, max_length=1024)
    release_notes: str | None = Field(default=None, max_length=2048)
    graph: WorkflowGraphIn | None = Field(default=None)


class WorkflowComponent(WorkflowComponentBase, table=True):
    """
    Database model for one immutable, published version of a workflow.

    Publishing deep-copies the source workflow: `snapshot_workflow_id` points at
    a frozen `Workflow` (`is_frozen=True`) whose nodes and edges are identical
    apart from fresh ids. Nothing edits a snapshot, not even its author — a
    change means publishing another version. Deleting the snapshot deletes the
    component row with it (`CASCADE`), so a version can never outlive the graph
    it describes; the components route deletes the row first and lets the
    snapshot follow.

    `input` and `output` are copied from the snapshot's single entry node and
    single exit node, so the component's public contract can be shown without
    loading the graph. They are plain dicts for the same JSON-column reason as
    `WorkflowNode.input`/`output`; the public model re-types them as field specs.

    `source_workflow_id` links back to the editable workflow the version came
    from. It is nullable and `SET NULL` so deleting the source keeps history.

    `(owner_id, name, version)` is unique. The constraint is exact-match and
    owner-scoped; routes additionally trim and lowercase the name and resolve
    the publisher's organization on lookup, so the intended case-insensitive,
    organization-wide identity holds in practice. Because the organization is
    not stored, the database cannot enforce uniqueness across two members of the
    same organization — that check lives in the publish route.
    """
    __table_args__ = (UniqueConstraint("owner_id", "name", "version", name="uq_workflowcomponent_owner_name_version"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    version: int = Field(ge=1)
    snapshot_workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    source_workflow_id: uuid.UUID | None = Field(default=None, foreign_key="workflow.id", ondelete="SET NULL")
    input: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    output: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    release_notes: str | None = Field(default=None, max_length=2048)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner: User | None = Relationship(passive_deletes=True)


class WorkflowComponentPublic(WorkflowComponentBase):
    """
    Properties to return via API for one published component version.

    `input` and `output` are the version's public contract, so a client can
    render the component without loading the snapshot's graph.
    """
    id: uuid.UUID
    owner_id: uuid.UUID
    version: int
    snapshot_workflow_id: uuid.UUID
    source_workflow_id: uuid.UUID | None = None
    input: Dict[str, WorkflowFieldSpec] = Field(default_factory=dict)
    output: Dict[str, WorkflowFieldSpec] = Field(default_factory=dict)
    release_notes: str | None = None
    created_at: datetime


class WorkflowComponentsPublic(SQLModel):
    """
    Properties to return via API for component listings
    """
    data: list[WorkflowComponentPublic]
    count: int
