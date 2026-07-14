import os

# Point every module at the test database before app modules import settings.
# This deliberately IGNORES .env — the suite drops and recreates every table,
# so it must never be able to reach the real (Supabase) database.
os.environ["DATABASE_URL"] = "postgresql+psycopg://lexi:lexi@localhost:5433/lexi_test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.auth.security import hash_password  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Assignment, Card, Deck, Language, Streak, User, UserRole  # noqa: E402

TEST_URL = os.environ["DATABASE_URL"]

# Belt and braces: `db_session` calls drop_all(). If someone ever edits the URL
# above to point at a hosted database, fail loudly instead of wiping it.
if "localhost" not in TEST_URL and "127.0.0.1" not in TEST_URL:
    raise RuntimeError(
        f"Refusing to run tests against a non-local database: {TEST_URL!r}. "
        "The suite drops every table."
    )


@pytest.fixture(scope="session", autouse=True)
def _create_test_database() -> None:
    admin_engine = create_engine(
        "postgresql+psycopg://lexi:lexi@localhost:5433/postgres", isolation_level="AUTOCOMMIT"
    )
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = 'lexi_test'")
        ).scalar()
        if not exists:
            conn.execute(text("CREATE DATABASE lexi_test"))
    admin_engine.dispose()


@pytest.fixture
def db_session(_create_test_database):
    engine = create_engine(TEST_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def seeded(db_session):
    """A teacher, a student, and one 2-card deck assigned to that student."""
    lang = Language(code="en", name="English")
    db_session.add(lang)
    db_session.flush()

    admin = User(
        email="teacher@lexi.app",
        password_hash=hash_password("adminpw"),
        display_name="Verzol",
        role=UserRole.admin,
    )
    student = User(
        email="mai@lexi.app",
        password_hash=hash_password("studentpw"),
        display_name="Mai Nguyen",
        role=UserRole.student,
    )
    other = User(
        email="duc@lexi.app",
        password_hash=hash_password("otherpw"),
        display_name="Duc Tran",
        role=UserRole.student,
    )
    db_session.add_all([admin, student, other])
    db_session.flush()
    db_session.add_all([Streak(student_id=student.id), Streak(student_id=other.id)])

    deck = Deck(
        owner_id=admin.id,
        language_id=lang.id,
        name="Entrance Exam — Core 300",
        exam_tag="grade-10-entrance",
        topic_tags=["academic-adjectives"],
    )
    db_session.add(deck)
    db_session.flush()

    db_session.add_all(
        [
            Card(deck_id=deck.id, term="meticulous", meaning="very careful and precise"),
            Card(deck_id=deck.id, term="resilient", meaning="able to recover quickly"),
        ]
    )
    # Assigned to `student` only — `other` must not be able to see it.
    db_session.add(Assignment(student_id=student.id, deck_id=deck.id))
    db_session.commit()

    return {"admin": admin, "student": student, "other": other, "deck": deck}


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def token_for(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def student_auth(client, seeded) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(client, 'mai@lexi.app', 'studentpw')}"}


@pytest.fixture
def other_auth(client, seeded) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(client, 'duc@lexi.app', 'otherpw')}"}


@pytest.fixture
def admin_auth(client, seeded) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(client, 'teacher@lexi.app', 'adminpw')}"}
