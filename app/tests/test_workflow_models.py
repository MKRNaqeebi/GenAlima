"""
The ``workflow_edge.mapping`` field on the SQLModel layer.

The route validates edges through ``model_validate``, never by constructing the
table model directly, so these tests exercise that path.
"""
# Standard library imports
import pytest
from pydantic import ValidationError

# Local application imports
from app.models import WorkflowEdgeCreate, WorkflowEdgePublic, WorkflowEdge

SOURCE = "11111111-1111-1111-1111-111111111111"
TARGET = "22222222-2222-2222-2222-222222222222"
WORKFLOW = "33333333-3333-3333-3333-333333333333"


def create(**extra):
    """
    Build an edge create payload, overriding any field via ``extra``.
    """
    return WorkflowEdgeCreate.model_validate(
        {
            "source_node_id": SOURCE,
            "target_node_id": TARGET,
            "source_handle": "main",
            "target_handle": "main",
            **extra,
        }
    )


def test_mapping_column_is_not_null_json():
    column = WorkflowEdge.__table__.columns["mapping"]
    assert column.nullable is False
    assert column.type.__class__.__name__ == "JSON"


def test_mapping_defaults_to_empty_object():
    assert create().mapping == {}
    assert create(mapping=None).mapping == {}
    assert create(mapping={}).mapping == {}


def test_mapping_round_trips():
    edge = create(mapping={"target_field": "source_field"})
    assert edge.mapping == {"target_field": "source_field"}
    assert WorkflowEdge.model_validate(
        {
            "source_node_id": SOURCE,
            "target_node_id": TARGET,
            "workflow_id": WORKFLOW,
            "mapping": {"b": "a"},
        }
    ).mapping == {"b": "a"}


def test_public_model_exposes_the_mapping():
    edge = WorkflowEdgePublic.model_validate(
        {
            "id": "44444444-4444-4444-4444-444444444444",
            "workflow_id": WORKFLOW,
            "source_node_id": SOURCE,
            "target_node_id": TARGET,
            "mapping": {"b": "a"},
        }
    )
    assert edge.mapping == {"b": "a"}


@pytest.mark.parametrize(
    "bad",
    [
        [{"b": "a"}],
        "b=a",
        {"b": 1},
        {1: "a"},
        {"": "a"},
        {"b": ""},
        {"b": None},
    ],
)
def test_malformed_mappings_are_rejected(bad):
    with pytest.raises(ValidationError):
        create(mapping=bad)
