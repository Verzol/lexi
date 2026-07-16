"""M5 streaks: grading any card advances the daily streak once per local day,
freezes bridge a missed day, and a long gap resets it."""

from datetime import date, timedelta

from app.models import Streak
from app.streaks.service import record_activity


def _streak_for(db, student_id) -> Streak:
    return db.query(Streak).filter_by(student_id=student_id).one()


def test_grading_starts_the_streak(client, student_auth, seeded, db_session):
    card = seeded["deck"].cards[0]
    client.post("/review/grade", headers=student_auth, json={"card_id": card.id, "rating": "good"})

    body = client.get("/me/streak", headers=student_auth).json()
    assert body["current_streak"] == 1
    assert body["longest_streak"] == 1


def test_a_quiz_answer_also_counts_for_the_day(client, student_auth, seeded, db_session):
    # Warm a card into a non-new state so a quiz can be generated over it.
    card = seeded["deck"].cards[0]
    client.post("/review/grade", headers=student_auth, json={"card_id": card.id, "rating": "good"})
    quiz = client.get("/quiz", headers=student_auth).json()
    assert quiz, "expected a quiz once a card is known"

    q = quiz[0]
    client.post(
        "/quiz/answer",
        headers=student_auth,
        json={"card_id": q["card_id"], "kind": q["kind"], "answer": "anything"},
    )
    # Review + quiz on the same day is still a single day of streak.
    assert client.get("/me/streak", headers=student_auth).json()["current_streak"] == 1


def test_second_activity_same_day_does_not_double_count(client, student_auth, seeded):
    a, b = seeded["deck"].cards
    client.post("/review/grade", headers=student_auth, json={"card_id": a.id, "rating": "good"})
    client.post("/review/grade", headers=student_auth, json={"card_id": b.id, "rating": "good"})
    assert client.get("/me/streak", headers=student_auth).json()["current_streak"] == 1


def test_consecutive_day_increments(db_session, seeded):
    student = seeded["student"]
    streak = _streak_for(db_session, student.id)
    streak.current_streak = 3
    streak.longest_streak = 3
    streak.last_completed_date = date.today() - timedelta(days=1)
    db_session.commit()

    record_activity(db_session, student.id)
    db_session.commit()

    streak = _streak_for(db_session, student.id)
    assert streak.current_streak == 4
    assert streak.longest_streak == 4


def test_one_missed_day_is_bridged_by_a_freeze(db_session, seeded):
    student = seeded["student"]
    streak = _streak_for(db_session, student.id)
    streak.current_streak = 5
    streak.longest_streak = 5
    streak.freezes_remaining = 2
    streak.last_completed_date = date.today() - timedelta(days=2)  # skipped yesterday
    db_session.commit()

    record_activity(db_session, student.id)
    db_session.commit()

    streak = _streak_for(db_session, student.id)
    assert streak.current_streak == 6  # streak survives
    assert streak.freezes_remaining == 1  # one freeze spent


def test_gap_beyond_freezes_resets_to_one(db_session, seeded):
    student = seeded["student"]
    streak = _streak_for(db_session, student.id)
    streak.current_streak = 10
    streak.longest_streak = 10
    streak.freezes_remaining = 2
    streak.last_completed_date = date.today() - timedelta(days=6)  # 5 missed > 2 freezes
    db_session.commit()

    record_activity(db_session, student.id)
    db_session.commit()

    streak = _streak_for(db_session, student.id)
    assert streak.current_streak == 1  # reset, but today still counts
    assert streak.longest_streak == 10  # best-ever preserved
    assert streak.freezes_remaining == 2  # untouched on a reset


def test_admin_has_no_streak_to_record(db_session, seeded):
    assert record_activity(db_session, seeded["admin"].id) is None
