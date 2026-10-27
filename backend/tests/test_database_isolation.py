"""Guard against accidental use of the development database in tests."""
from app.core import database


def test_suite_uses_a_disposable_database() -> None:
    assert database.engine.url.database
    assert ".test-databases" in database.engine.url.database
    assert "disruptioniq-test-" in database.engine.url.database
