"""add users.token_version

Revision ID: c1a2b3d4e5f6
Revises: 186fc858fb7e
Create Date: 2026-07-21 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c1a2b3d4e5f6'
down_revision: str | None = '186fc858fb7e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default backfills existing rows to 0; every current token predates
    # this and lacks a `tv` claim, so all sessions are invalidated once on deploy.
    op.add_column(
        'users',
        sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('users', 'token_version')
