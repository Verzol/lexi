"""M6 admin dashboard: per-student progress + who's slipping, all derived from
the reviews log. Admin-only."""

from datetime import UTC, datetime, timedelta

from app.models import Review
from app.models.enums import Rating, ReviewSource


def _row(data, student_id):
    return next(s for s in data["students"] if s["id"] == student_id)


def test_dashboard_is_admin_only(client, student_auth):
    assert client.get("/admin/dashboard", headers=student_auth).status_code == 403


def test_baseline_lists_every_student_with_due_counts(client, admin_auth, seeded):
    data = client.get("/admin/dashboard", headers=admin_auth).json()

    ids = {s["id"] for s in data["students"]}
    assert ids == {seeded["student"].id, seeded["other"].id}

    mai = _row(data, seeded["student"].id)
    duc = _row(data, seeded["other"].id)
    # mai has the 2-card deck assigned and has done nothing yet.
    assert mai["due_count"] == 2
    assert mai["current_streak"] == 0
    assert mai["accuracy"] is None
    assert mai["reviewed_week"] == 0
    assert mai["last_active_at"] is None
    assert mai["slipping"] is False  # brand-new account isn't flagged
    # duc has no assignment → nothing due.
    assert duc["due_count"] == 0

    assert data["summary"] == {
        "total_students": 2,
        "active_this_week": 0,
        "reviewed_week": 0,
        "avg_accuracy": None,
        "slipping_count": 0,
    }

    # One class deck, assigned to one student, nothing graduated yet.
    assert len(data["decks"]) == 1
    deck = data["decks"][0]
    assert deck["card_count"] == 2
    assert deck["students_assigned"] == 1
    assert deck["mastered_pct"] == 0  # 2 cards materialized as `new`, none learned


def test_activity_shows_up_in_progress(client, admin_auth, student_auth, seeded):
    card = seeded["deck"].cards[0]
    client.post("/review/grade", headers=student_auth, json={"card_id": card.id, "rating": "good"})

    data = client.get("/admin/dashboard", headers=admin_auth).json()
    mai = _row(data, seeded["student"].id)
    assert mai["reviewed_week"] == 1
    assert mai["accuracy"] == 100
    assert mai["current_streak"] == 1
    assert mai["days_inactive"] == 0
    assert mai["last_active_at"] is not None
    assert mai["due_count"] == 1  # the graded card was pushed out

    assert data["summary"]["active_this_week"] == 1
    assert data["summary"]["reviewed_week"] == 1
    assert data["summary"]["avg_accuracy"] == 100


def test_deck_progress_counts_graduated_cards(client, admin_auth, seeded, db_session):
    from app.models import CardState
    from app.models.enums import CardStateEnum

    # Materialize mai's per-card states, then graduate one of the two to `review`.
    client.get("/admin/dashboard", headers=admin_auth)
    states = db_session.query(CardState).filter_by(student_id=seeded["student"].id).all()
    assert len(states) == 2
    states[0].state = CardStateEnum.review
    db_session.commit()

    deck = client.get("/admin/dashboard", headers=admin_auth).json()["decks"][0]
    assert deck["mastered_pct"] == 50  # 1 of 2 (student × card) states learned


def test_personal_decks_are_excluded_from_deck_progress(client, admin_auth, student_auth):
    # A student's own deck must not appear in the teacher's class-deck progress.
    client.post("/decks", headers=student_auth, json={"name": "Mine only"})
    names = {d["name"] for d in client.get("/admin/dashboard", headers=admin_auth).json()["decks"]}
    assert "Mine only" not in names


def test_accuracy_counts_again_as_a_miss(client, admin_auth, student_auth, seeded):
    a, b = seeded["deck"].cards
    client.post("/review/grade", headers=student_auth, json={"card_id": a.id, "rating": "good"})
    client.post("/review/grade", headers=student_auth, json={"card_id": b.id, "rating": "again"})

    mai = _row(client.get("/admin/dashboard", headers=admin_auth).json(), seeded["student"].id)
    assert mai["accuracy"] == 50  # 1 recalled of 2 graded


def test_inactive_student_is_flagged_slipping(client, admin_auth, seeded, db_session):
    # A review 8 days ago and nothing since → past the 5-day slip threshold, and
    # outside the 7-day "this week" window.
    card = seeded["deck"].cards[0]
    db_session.add(
        Review(
            student_id=seeded["student"].id,
            card_id=card.id,
            rating=Rating.good,
            reviewed_at=datetime.now(UTC) - timedelta(days=8),
            source=ReviewSource.review,
        )
    )
    db_session.commit()

    data = client.get("/admin/dashboard", headers=admin_auth).json()
    mai = _row(data, seeded["student"].id)
    assert mai["slipping"] is True
    assert mai["days_inactive"] == 8
    assert mai["reviewed_week"] == 0
    assert data["summary"]["slipping_count"] >= 1
