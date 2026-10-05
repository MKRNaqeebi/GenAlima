"""keep component icons in storage, not in the database

Revision ID: b6d2e8f1a430
Revises: f2b8c1d47a90
Create Date: 2026-10-05 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b6d2e8f1a430'
down_revision = 'f2b8c1d47a90'
branch_labels = None
depends_on = None


def upgrade():
    """
    Replace the stored image with a key into object storage or the media folder.

    The PNGs themselves move on the next publish: a migration cannot upload to
    S3, and the byte column being replaced only ever existed inside this same
    change, so no deployment has icons in it to preserve. `icon_url` — the
    pasted-link alternative — is unaffected.
    """
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_key', sa.String(length=512), nullable=True),
    )
    op.drop_column('workflowcomponent', 'icon')
    op.drop_column('workflowcomponent', 'icon_content_type')
    op.alter_column('workflowcomponent', 'icon_key', new_column_name='icon')


def downgrade():
    """
    Go back to holding the image itself, with an empty one for every icon.

    Storage keys cannot be resolved back into bytes without reaching the storage
    backend, so previously uploaded icons are dropped rather than guessed at.
    """
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_bytes', sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_content_type', sa.String(length=64), nullable=True),
    )
    op.drop_column('workflowcomponent', 'icon')
    op.alter_column('workflowcomponent', 'icon_bytes', new_column_name='icon')
