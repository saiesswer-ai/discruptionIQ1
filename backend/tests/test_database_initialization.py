"""Regression coverage for database initialization and authentication."""

from fastapi import Request
from sqlalchemy import inspect, select

from app.api.v1.auth import login
from app.core import database
from app.core.security import verify_password
from app.models.auth import User, UserRole
from app.schemas.auth import LoginRequest
from app.scripts.seed_database import provision_development_users


def test_initialized_database_creates_users_and_supports_login(tmp_path) -> None:
    """A new isolated database receives schema, hashed users, and a working login."""
    prior_url = database.engine.url.render_as_string(hide_password=False)
    test_url = f"sqlite:///{(tmp_path / 'initialized-auth.db').as_posix()}"
    database.configure_database(test_url)
    try:
        database.init_database()
        assert "users" in database.Base.metadata.tables
        assert "users" in inspect(database.engine).get_table_names()

        result = provision_development_users()
        assert result["created"] > 0

        session = database.SessionLocal()
        try:
            analyst = session.scalar(select(User).where(User.username == "analyst"))
            assert analyst is not None
            assert analyst.role == UserRole.OPERATIONS_ANALYST.value
            assert verify_password("DisruptionIQ#2026!Analyst", analyst.password_hash)
        finally:
            session.close()

        request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 50000)})
        session = database.SessionLocal()
        try:
            response = login(
                request,
                LoginRequest(username="analyst", password="DisruptionIQ#2026!Analyst"),
                session,
            )
        finally:
            session.close()
        assert response.user.role == UserRole.OPERATIONS_ANALYST.value
        assert response.access_token
    finally:
        database.configure_database(prior_url)
