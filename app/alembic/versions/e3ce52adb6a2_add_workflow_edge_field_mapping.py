"""add workflow edge field mapping

Revision ID: e3ce52adb6a2
Revises: c12743a75456
Create Date: 2026-02-18 00:00:00.000000

"""
import json

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e3ce52adb6a2'
down_revision = 'c12743a75456'
branch_labels = None
depends_on = None


def _backfill_same_name_mapping() -> None:
    """
    Give existing edges the mapping they implicitly had before strict mode.

    Before this column, an edge carried every field whose name matched on both
    sides. Saving the graphs created then under the new strict rules would drop
    those fields and start failing coverage checks, so seed each edge with that
    same-name mapping and let the editor make it explicit from here on.
    """
    bind = op.get_bind()
    nodes = bind.execute(
        sa.text("SELECT id, input, output FROM workflownode")
    ).fetchall()
    contracts = {
        str(row.id): (row.input or {}, row.output or {})
        for row in nodes
    }

    edges = bind.execute(
        sa.text("SELECT id, source_node_id, target_node_id FROM workflowedge")
    ).fetchall()

    for edge in edges:
        source_output = contracts.get(str(edge.source_node_id), ({}, {}))[1]
        target_input = contracts.get(str(edge.target_node_id), ({}, {}))[0]
        mapping = {
            name: name for name in target_input if name in source_output
        }
        bind.execute(
            sa.text(
                "UPDATE workflowedge SET mapping = CAST(:mapping AS JSON) "
                "WHERE id = :id"
            ),
            {"mapping": json.dumps(mapping), "id": str(edge.id)},
        )


def upgrade():
    """
    Add the per-edge field mapping and backfill the implicit name matching.
    """
    # Existing rows need a value for a NOT NULL column, so seed a server default
    # and drop it afterwards to leave the application in charge (same pattern as
    # workflow.is_frozen).
    op.add_column(
        'workflowedge',
        sa.Column(
            'mapping',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    _backfill_same_name_mapping()
    op.alter_column('workflowedge', 'mapping', server_default=None)


def downgrade():
    """
    Remove the field mapping.
    """
    op.drop_column('workflowedge', 'mapping')
