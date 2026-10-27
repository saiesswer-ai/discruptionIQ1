"""Per-test database isolation for the FastAPI integration suite."""
from pathlib import Path
import sys
from uuid import uuid4

import pytest

# The synthetic datasets are a sibling package of backend, not a dependency
# installed into the interpreter. Make the repository root available for the
# existing dataset-validation tests without changing production imports.
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from app.core import database
from app.scripts.seed_database import seed_database


@pytest.fixture(autouse=True)
def isolated_test_database():
    """Seed a disposable SQLite database without ever mutating development data."""
    development_url = database.engine.url.render_as_string(hide_password=False)
    test_dir = REPOSITORY_ROOT / "backend" / ".test-databases"
    test_dir.mkdir(exist_ok=True)
    test_path = test_dir / f"disruptioniq-test-{uuid4().hex}.db"
    test_url = f"sqlite:///{test_path.as_posix()}"
    database.configure_database(test_url)
    database.init_database()
    session = database.SessionLocal()
    try:
        seed_database(session)
    finally:
        session.close()

    try:
        yield
    finally:
        database.configure_database(development_url)
        test_path.unlink(missing_ok=True)
