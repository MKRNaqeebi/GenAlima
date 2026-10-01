"""add workflow components

Revision ID: 8a4110661e22
Revises: e3ce52adb6a2
Create Date: 2026-10-02 00:11:11.906820

"""
# Standard library imports
import uuid

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '8a4110661e22'
down_revision = 'e3ce52adb6a2'
branch_labels = None
depends_on = None


def _personal_organization_title(email: str, full_name: str | None) -> str:
    """
    Name a backfilled organization within the column's length.
    """
    label = full_name or email
    return f"{label} (personal)"[:255]


def _backfill_missing_organizations() -> None:
    """
    Give every organization-less user a personal organization they own.

    `user.organization_id` becomes NOT NULL below, so any existing user without
    one would break the migration. This mirrors what `crud.create_user` now does
    for new users.
    """
    bind = op.get_bind()
    users = bind.execute(
        sa.text('SELECT id, email, full_name FROM "user" WHERE organization_id IS NULL')
    ).fetchall()

    for user in users:
        organization_id = uuid.uuid4()
        bind.execute(
            sa.text(
                "INSERT INTO organization (id, title, description, owner_id) "
                "VALUES (:id, :title, NULL, :owner_id)"
            ),
            {
                "id": str(organization_id),
                "title": _personal_organization_title(user.email, user.full_name),
                "owner_id": str(user.id),
            },
        )
        bind.execute(
            sa.text('UPDATE "user" SET organization_id = :organization_id WHERE id = :id'),
            {"organization_id": str(organization_id), "id": str(user.id)},
        )


def upgrade():
    """
    Add published workflow components and make organization membership mandatory.
    """
    op.create_table(
        'workflowcomponent',
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('snapshot_workflow_id', sa.Uuid(), nullable=False),
        sa.Column('source_workflow_id', sa.Uuid(), nullable=True),
        sa.Column('input', sa.JSON(), nullable=False),
        sa.Column('output', sa.JSON(), nullable=False),
        sa.Column('release_notes', sqlmodel.sql.sqltypes.AutoString(length=2048), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_workflow_id'], ['workflow.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_workflow_id'], ['workflow.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('owner_id', 'name', 'version', name='uq_workflowcomponent_owner_name_version'),
    )

    _backfill_missing_organizations()

    # Membership becomes mandatory, and deleting an organization now deletes its
    # members. The key is deferred so a user and their organization can be
    # inserted in one transaction in either order.
    op.drop_constraint('fk_user_organization_id_organization', 'user', type_='foreignkey')
    op.alter_column('user', 'organization_id', nullable=False)
    op.create_foreign_key(
        'fk_user_organization_id_organization',
        'user',
        'organization',
        ['organization_id'],
        ['id'],
        ondelete='CASCADE',
        deferrable=True,
        initially='DEFERRED',
    )

    # The other half of the user <-> organization cycle, deferred for the same
    # reason: whichever row is inserted first, both are checked at commit.
    op.drop_constraint('organization_owner_id_fkey', 'organization', type_='foreignkey')
    op.create_foreign_key(
        'organization_owner_id_fkey',
        'organization',
        'user',
        ['owner_id'],
        ['id'],
        ondelete='CASCADE',
        deferrable=True,
        initially='DEFERRED',
    )


def downgrade():
    """
    Drop workflow components and make organization membership optional again.
    """
    op.drop_constraint('organization_owner_id_fkey', 'organization', type_='foreignkey')
    op.create_foreign_key(
        'organization_owner_id_fkey',
        'organization',
        'user',
        ['owner_id'],
        ['id'],
        ondelete='CASCADE',
    )

    op.drop_constraint('fk_user_organization_id_organization', 'user', type_='foreignkey')
    op.alter_column('user', 'organization_id', nullable=True)
    op.create_foreign_key(
        'fk_user_organization_id_organization',
        'user',
        'organization',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.drop_table('workflowcomponent')
