"""store only the icon's URL

Revision ID: d9a4f6b2c815
Revises: b6d2e8f1a430
Create Date: 2026-10-05 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd9a4f6b2c815'
down_revision = 'b6d2e8f1a430'
branch_labels = None
depends_on = None


def upgrade():
    """
    Collapse the storage key and the pasted link into one URL column.

    The app only ever renders an icon's URL, so it has no reason to know which
    of the two it is looking at. A pasted link wins where both were set. No
    deployment holds icon data — the feature is unreleased — so in practice this
    moves nothing and only widens the column to fit a URL.
    """
    op.execute(
        """
        UPDATE workflowcomponent
        SET icon = icon_url
        WHERE icon_url IS NOT NULL
        """
    )
    op.drop_column('workflowcomponent', 'icon_url')
    op.alter_column(
        'workflowcomponent',
        'icon',
        existing_type=sa.String(length=512),
        type_=sa.String(length=2048),
        existing_nullable=True,
    )


def downgrade():
    """
    Restore the key/link pair, keeping every icon as a link.

    A URL cannot be reduced back to a storage key without knowing the
    deployment's public base, so the URL is preserved in `icon_url` and the key
    column is left empty — the icon still renders, which is what matters.
    """
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_url', sa.String(length=2048), nullable=True),
    )
    op.execute(
        """
        UPDATE workflowcomponent
        SET icon_url = icon, icon = NULL
        WHERE icon IS NOT NULL
        """
    )
    op.alter_column(
        'workflowcomponent',
        'icon',
        existing_type=sa.String(length=2048),
        type_=sa.String(length=512),
        existing_nullable=True,
    )
