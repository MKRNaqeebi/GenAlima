"""store the component icon as an image

Revision ID: f2b8c1d47a90
Revises: c4f1a7d92b30
Create Date: 2026-10-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2b8c1d47a90'
down_revision = 'c4f1a7d92b30'
branch_labels = None
depends_on = None


def upgrade():
    """
    Keep the icon itself instead of a URL to it.

    Existing values are converted rather than dropped: an inline
    ``data:image/…;base64,…`` icon becomes the image bytes plus its content
    type, and anything else — a plain http(s) link, or a shape validation would
    never have written — moves to ``icon_url``.
    """
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_content_type', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_url', sa.String(length=2048), nullable=True),
    )
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_bytes', sa.LargeBinary(), nullable=True),
    )

    # Links keep being links: the server never fetches a remote image.
    op.execute(
        """
        UPDATE workflowcomponent
        SET icon_url = icon
        WHERE icon IS NOT NULL AND icon NOT LIKE 'data:image/%;base64,%'
        """
    )
    # The inline form the publish dialog produces becomes the stored image.
    op.execute(
        """
        UPDATE workflowcomponent
        SET icon_bytes = decode(split_part(icon, ',', 2), 'base64'),
            icon_content_type = substring(icon from '^data:([^;]+);')
        WHERE icon ~* '^data:image/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$'
        """
    )

    op.drop_column('workflowcomponent', 'icon')
    op.alter_column('workflowcomponent', 'icon_bytes', new_column_name='icon')


def downgrade():
    """
    Go back to one text column, rebuilding the data URL from the stored image.
    """
    op.add_column(
        'workflowcomponent',
        sa.Column('icon_text', sa.Text(), nullable=True),
    )
    op.execute(
        """
        UPDATE workflowcomponent
        SET icon_text = COALESCE(
            icon_url,
            'data:' || icon_content_type || ';base64,' || encode(icon, 'base64')
        )
        WHERE icon IS NOT NULL OR icon_url IS NOT NULL
        """
    )

    op.drop_column('workflowcomponent', 'icon')
    op.drop_column('workflowcomponent', 'icon_content_type')
    op.drop_column('workflowcomponent', 'icon_url')
    op.alter_column('workflowcomponent', 'icon_text', new_column_name='icon')
