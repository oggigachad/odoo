"""0001_baseline

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-10 11:00:00.000000

"""

import re
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Read schema.sql from database directory
    sql_path = Path(__file__).resolve().parents[2] / "database" / "schema.sql"
    if not sql_path.exists():
        sql_path = Path(__file__).resolve().parents[3] / "database" / "schema.sql"

    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    # Strip BEGIN and COMMIT since Alembic already manages transactions
    sql = re.sub(r"^\s*BEGIN\s*;\s*", "", sql, flags=re.MULTILINE | re.IGNORECASE)
    sql = re.sub(r"^\s*COMMIT\s*;\s*", "", sql, flags=re.MULTILINE | re.IGNORECASE)

    bind = op.get_bind()
    # If using asyncpg driver directly under SQLAlchemy async engine
    if bind.dialect.name == "postgresql" and "asyncpg" in bind.dialect.driver:
        from sqlalchemy.util.concurrency import await_only

        raw_asyncpg = bind.connection.connection._connection
        await_only(raw_asyncpg.execute(sql))
    else:
        op.execute(sa.text(sql))


def downgrade() -> None:
    drop_sql = """
        DROP VIEW IF EXISTS club_balance CASCADE;
        DROP VIEW IF EXISTS treasurer_summary CASCADE;
        DROP VIEW IF EXISTS fundraiser_progress CASCADE;
        DROP VIEW IF EXISTS event_summary CASCADE;
        DROP VIEW IF EXISTS ticket_availability CASCADE;
        DROP VIEW IF EXISTS memberships_due_for_renewal CASCADE;
        DROP VIEW IF EXISTS active_members CASCADE;
        DROP TABLE IF EXISTS expenses CASCADE;
        DROP TABLE IF EXISTS fundraiser_tasks CASCADE;
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TRIGGER IF EXISTS order_items_non_member_limit ON order_items CASCADE;
        DROP FUNCTION IF EXISTS enforce_non_member_goodie_limit CASCADE;
        DROP TABLE IF EXISTS product_variants CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS announcements CASCADE;
        DROP TRIGGER IF EXISTS tickets_seat_limit ON tickets CASCADE;
        DROP FUNCTION IF EXISTS enforce_seat_limit CASCADE;
        DROP TABLE IF EXISTS tickets CASCADE;
        DROP TABLE IF EXISTS ticket_types CASCADE;
        DROP TABLE IF EXISTS events CASCADE;
        DROP TABLE IF EXISTS memberships CASCADE;
        DROP TABLE IF EXISTS membership_types CASCADE;
        DROP TABLE IF EXISTS semesters CASCADE;
        DROP TABLE IF EXISTS payments CASCADE;
        DROP TABLE IF EXISTS fundraisers CASCADE;
        DROP TABLE IF EXISTS leadership_roles CASCADE;
        DROP TABLE IF EXISTS members CASCADE;
    """
    bind = op.get_bind()
    if bind.dialect.name == "postgresql" and "asyncpg" in bind.dialect.driver:
        from sqlalchemy.util.concurrency import await_only

        raw_asyncpg = bind.connection.connection._connection
        await_only(raw_asyncpg.execute(drop_sql))
    else:
        op.execute(sa.text(drop_sql))
