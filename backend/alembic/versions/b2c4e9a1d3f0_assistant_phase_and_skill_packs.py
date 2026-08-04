"""assistant_phase and skill_packs

Revision ID: b2c4e9a1d3f0
Revises: 8a7f1837ef02
Create Date: 2026-08-03

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c4e9a1d3f0"
down_revision: Union[str, Sequence[str], None] = "8a7f1837ef02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("decks") as batch_op:
        batch_op.add_column(
            sa.Column("assistant_phase", sa.String(length=32), nullable=False, server_default="coaching")
        )

    op.create_table(
        "skill_packs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("skill_md", sa.Text(), nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "version", name="uq_skill_pack_slug_version"),
    )
    op.create_index("ix_skill_packs_slug", "skill_packs", ["slug"])
    op.create_index("ix_skill_packs_status", "skill_packs", ["status"])
    op.create_index("ix_skill_packs_author_user_id", "skill_packs", ["author_user_id"])


def downgrade() -> None:
    op.drop_index("ix_skill_packs_author_user_id", table_name="skill_packs")
    op.drop_index("ix_skill_packs_status", table_name="skill_packs")
    op.drop_index("ix_skill_packs_slug", table_name="skill_packs")
    op.drop_table("skill_packs")
    with op.batch_alter_table("decks") as batch_op:
        batch_op.drop_column("assistant_phase")
