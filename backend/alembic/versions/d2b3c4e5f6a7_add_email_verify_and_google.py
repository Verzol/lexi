"""add email verification + google sign-in columns

Revision ID: d2b3c4e5f6a7
Revises: c1a2b3d4e5f6
Create Date: 2026-07-21 00:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd2b3c4e5f6a7'
down_revision: str | None = 'c1a2b3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'users',
        sa.Column('auth_provider', sa.String(length=16), nullable=False, server_default='local'),
    )
    op.add_column('users', sa.Column('google_sub', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_users_google_sub'), 'users', ['google_sub'], unique=True)

    # A Google-only account has no password.
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=True)

    # Every account that predates verification was created out-of-band or by the
    # teacher, so treat it as already verified — don't nag existing users.
    op.execute("UPDATE users SET email_verified = true")


def downgrade() -> None:
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=False)
    op.drop_index(op.f('ix_users_google_sub'), table_name='users')
    op.drop_column('users', 'google_sub')
    op.drop_column('users', 'auth_provider')
    op.drop_column('users', 'email_verified')
