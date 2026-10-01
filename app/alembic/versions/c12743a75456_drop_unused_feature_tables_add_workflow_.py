"""drop unused feature tables add workflow frozen and org membership

Revision ID: c12743a75456
Revises: d756a628af2c
Create Date: 2026-10-01 20:39:53.397688

"""
from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c12743a75456'
down_revision = 'd756a628af2c'
branch_labels = None
depends_on = None


def upgrade():
    """
    Drop the tables whose models were removed, attach users to an organization,
    and add the workflow freeze flag.
    """
    # Order matters: a table cannot be dropped while another table still holds a
    # foreign key into it, so dependants go first (message -> chat -> template).
    op.drop_table('message')
    op.drop_table('chat')
    op.drop_table('knowledge')
    op.drop_table('knowledgefile')
    op.drop_table('template')
    op.drop_table('connector')
    op.drop_table('item')
    op.drop_table('largemodel')

    # A user belongs to at most one organization. SET NULL rather than CASCADE so
    # deleting an organization keeps its members around.
    op.add_column('user', sa.Column('organization_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_user_organization_id_organization',
        'user',
        'organization',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL',
    )

    # Existing workflow rows need a value for a NOT NULL column, so seed it with a
    # server default and then drop that default to leave the application in charge.
    op.add_column(
        'workflow',
        sa.Column('is_frozen', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f('ix_workflow_is_frozen'), 'workflow', ['is_frozen'], unique=False)
    op.alter_column('workflow', 'is_frozen', server_default=None)


def downgrade():
    """
    Restore the dropped tables and remove the columns added in upgrade.
    """
    op.drop_index(op.f('ix_workflow_is_frozen'), table_name='workflow')
    op.drop_column('workflow', 'is_frozen')
    op.drop_constraint('fk_user_organization_id_organization', 'user', type_='foreignkey')
    op.drop_column('user', 'organization_id')

    # Parents before children so every foreign key target already exists.
    op.create_table('item',
    sa.Column('description', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('title', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('owner_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['user.id'], name='item_owner_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='item_pkey')
    )
    op.create_table('largemodel',
    sa.Column('description', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('rank', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('provider', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('active', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('title', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name='largemodel_pkey')
    )
    op.create_table('template',
    sa.Column('description', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('template', sa.VARCHAR(length=4096), autoincrement=False, nullable=True),
    sa.Column('placeholder', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('model', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('connector', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('active', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('title', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('owner_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['user.id'], name='template_owner_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='template_pkey'),
    postgresql_ignore_search_path=False
    )
    op.create_table('connector',
    sa.Column('description', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('function', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('active', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('meta_data', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('owner_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['owner_id'], ['user.id'], name='connector_owner_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='connector_pkey')
    )
    op.create_table('knowledgefile',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('file_path', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('chunk_count', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
    sa.Column('owner_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['user.id'], name='knowledgefile_owner_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='knowledgefile_pkey')
    )
    op.create_table('chat',
    sa.Column('template_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('title', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('owner_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['user.id'], name='chat_owner_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_id'], ['template.id'], name='chat_template_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='chat_pkey'),
    postgresql_ignore_search_path=False
    )
    # content_vector is a pgvector column; the reflected type is not renderable,
    # so it is declared explicitly here.
    op.create_table('knowledge',
    sa.Column('content', sa.VARCHAR(), autoincrement=False, nullable=False),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('content_vector', Vector(dim=1536), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
    sa.Column('source_type', sa.VARCHAR(length=64), autoincrement=False, nullable=False),
    sa.Column('meta', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('knowledge_file_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['knowledge_file_id'], ['knowledgefile.id'], name='knowledge_knowledge_file_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='knowledge_pkey')
    )
    op.create_table('message',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('role', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('content', sa.VARCHAR(length=4096), autoincrement=False, nullable=False),
    sa.Column('chat_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
    sa.Column('meta_data', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['chat_id'], ['chat.id'], name='message_chat_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='message_pkey')
    )
