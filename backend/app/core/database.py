"""SQLAlchemy engine, declarative base, and request-scoped sessions."""
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


def _engine_options(database_url: str) -> dict[str, object]:
    return {"connect_args": {"check_same_thread": False}} if database_url.startswith("sqlite") else {}


def _resolve_database_url(database_url: str) -> str:
    """Resolve relative SQLite paths from the backend directory, never the process CWD."""
    sqlite_prefix = "sqlite:///"
    if not database_url.startswith(sqlite_prefix):
        return database_url

    database_path = database_url.removeprefix(sqlite_prefix)
    if not database_path or database_path == ":memory:" or Path(database_path).is_absolute():
        return database_url

    backend_dir = Path(__file__).resolve().parents[2]
    return f"{sqlite_prefix}{(backend_dir / database_path).resolve().as_posix()}"


settings = get_settings()
database_url = _resolve_database_url(settings.database_url)
engine = create_engine(database_url, **_engine_options(database_url))
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def configure_database(database_url: str) -> None:
    """Point request sessions at a database URL (used by isolated test fixtures)."""
    global engine, SessionLocal
    engine.dispose()
    database_url = _resolve_database_url(database_url)
    engine = create_engine(database_url, **_engine_options(database_url))
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all persistence models."""


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and reliably close it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database() -> None:
    """Create all configured tables. Seeding is intentionally separate."""
    from app import models  # noqa: F401  Ensure model metadata has been imported.

    Base.metadata.create_all(bind=engine)
    # This small SQLite-compatible migration keeps existing demo databases usable
    # without introducing a second migration framework for one additive column.
    if engine.dialect.name == "sqlite":
        with engine.connect() as connection:
            inspector = inspect(connection)
            columns = {column["name"] for column in inspector.get_columns("shipments")}
            if "last_event_at" not in columns:
                connection.execute(text("ALTER TABLE shipments ADD COLUMN last_event_at DATETIME"))
                connection.commit()
            disruption_columns = {column["name"] for column in inspector.get_columns("disruptions")}
            if "source_key" not in disruption_columns:
                connection.execute(text("ALTER TABLE disruptions ADD COLUMN source_key VARCHAR(160)"))
                connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_disruptions_source_key ON disruptions (source_key)"))
                connection.commit()
            event_columns = {column["name"] for column in inspector.get_columns("carrier_webhook_events")}
            if "payload_hash" not in event_columns:
                connection.execute(text("ALTER TABLE carrier_webhook_events ADD COLUMN payload_hash VARCHAR(64) NOT NULL DEFAULT ''"))
                connection.commit()
            plan_columns = {column["name"] for column in inspector.get_columns("recovery_plans")}
            for col, col_type in [
                ("created_by", "VARCHAR(128)"),
                ("submitted_by", "VARCHAR(128)"),
                ("approved_by", "VARCHAR(128)"),
                ("rejected_by", "VARCHAR(128)"),
                ("rejection_reason", "TEXT"),
                ("modification_reason", "TEXT"),
                ("executed_by", "VARCHAR(128)"),
            ]:
                if col not in plan_columns:
                    connection.execute(text(f"ALTER TABLE recovery_plans ADD COLUMN {col} {col_type}"))
                    connection.commit()


if __name__ == "__main__":
    init_database()
