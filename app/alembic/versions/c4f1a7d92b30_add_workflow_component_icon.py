"""add workflow component icon

Revision ID: c4f1a7d92b30
Revises: b0a12deb8b80
Create Date: 2026-10-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4f1a7d92b30'
down_revision = 'b0a12deb8b80'
branch_labels = None
depends_on = None


def upgrade():
    """
    Add the component icon: an image URL or a small inline data URL.
    """
    # Nullable with no default: every existing component simply has no icon, and
    # the palette falls back to its box glyph.
    op.add_column(
        'workflowcomponent',
        sa.Column('icon', sa.Text(), nullable=True),
    )


def downgrade():
    """
    Remove the component icon.
    """
    op.drop_column('workflowcomponent', 'icon')
