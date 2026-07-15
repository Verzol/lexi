"""The M2 review loop: `/review/due` serves the right cards, `/review/grade`
reschedules them via FSRS, and neither leaks another student's cards."""

from datetime import UTC, datetime, timedelta

from app.models import Assignment, Card, CardState, Review
from app.models.enums import CardStateEnum


def _assignment_for(db, student_id, deck_id):
    return db.query(Assignment).filter_by(student_id=student_id, deck_id=deck_id).one()


def test_due_lists_the_assigned_cards(client, student_auth):
    resp = client.get("/review/due", headers=student_auth)
    assert resp.status_code == 200

    cards = resp.json()
    # Both seeded cards are brand-new and thus due immediately (under the target of 10).
    assert {c["term"] for c in cards} == {"meticulous", "resilient"}
    first = next(c for c in cards if c["term"] == "meticulous")
    assert first["state"] == "new"
    assert first["exam_tag"] == "grade-10-entrance"


def test_unassigned_student_has_an_empty_queue(client, other_auth):
    assert client.get("/review/due", headers=other_auth).json() == []


def test_grading_good_reschedules_into_the_future_and_logs_a_review(
    client, student_auth, seeded, db_session
):
    card = seeded["deck"].cards[0]

    resp = client.post(
        "/review/grade",
        headers=student_auth,
        json={"card_id": card.id, "rating": "good", "elapsed_ms": 4200},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["card_id"] == card.id
    assert body["reps"] == 1
    # "good" on a new card graduates it out of the `new` state and pushes it out.
    assert body["state"] != "new"
    assert datetime.fromisoformat(body["due_at"]) > datetime.now(UTC)

    # The immutable log gained exactly one row for this grade.
    reviews = db_session.query(Review).filter_by(card_id=card.id).all()
    assert len(reviews) == 1
    assert reviews[0].rating.value == "good"
    assert reviews[0].elapsed_ms == 4200

    state = db_session.query(CardState).filter_by(card_id=card.id).one()
    assert state.reps == 1
    assert state.stability is not None and state.difficulty is not None


def test_again_comes_back_sooner_than_good(client, student_auth, seeded):
    again_card, good_card = seeded["deck"].cards[0], seeded["deck"].cards[1]

    again = client.post(
        "/review/grade", headers=student_auth, json={"card_id": again_card.id, "rating": "again"}
    ).json()
    good = client.post(
        "/review/grade", headers=student_auth, json={"card_id": good_card.id, "rating": "good"}
    ).json()

    # A forgotten card is scheduled back much sooner than a remembered one.
    assert datetime.fromisoformat(again["due_at"]) < datetime.fromisoformat(good["due_at"])


def test_a_graded_card_leaves_the_due_queue(client, student_auth, seeded):
    card = seeded["deck"].cards[0]
    client.post("/review/grade", headers=student_auth, json={"card_id": card.id, "rating": "good"})

    still_due = {c["term"] for c in client.get("/review/due", headers=student_auth).json()}
    # "good" pushed it days out, so only the ungraded card remains.
    assert still_due == {"resilient"}


def test_cannot_grade_a_card_from_an_unassigned_deck(client, other_auth, seeded):
    # Duc has no assignment for this deck — grading its card must 404, not 403.
    card = seeded["deck"].cards[0]
    resp = client.post(
        "/review/grade", headers=other_auth, json={"card_id": card.id, "rating": "good"}
    )
    assert resp.status_code == 404


def test_daily_new_target_caps_the_new_cards_served(client, student_auth, seeded, db_session):
    # Add eight more new cards (deck now has 10) but cap this student's intake at 3.
    deck = seeded["deck"]
    for i in range(8):
        db_session.add(Card(deck_id=deck.id, term=f"word{i}", meaning=f"meaning {i}"))
    assignment = _assignment_for(db_session, seeded["student"].id, deck.id)
    assignment.daily_new_target = 3
    db_session.commit()

    due = client.get("/review/due", headers=student_auth).json()
    assert len(due) == 3

    # Home's due count uses the same queue, so it agrees with the review screen.
    decks = client.get("/decks", headers=student_auth).json()
    assert decks[0]["due_count"] == 3


def test_review_state_cards_are_served_regardless_of_the_new_cap(
    client, student_auth, seeded, db_session
):
    # A card already in review, due now, must show even when the new cap is zero.
    deck = seeded["deck"]
    review_card = deck.cards[0]
    # Materialize the per-student state rows, then push this card into `review`.
    client.get("/review/due", headers=student_auth)
    state = db_session.query(CardState).filter_by(card_id=review_card.id).one()
    state.state = CardStateEnum.review
    state.stability = 5.0
    state.difficulty = 5.0
    state.reps = 3
    state.due_at = datetime.now(UTC) - timedelta(days=1)
    assignment = _assignment_for(db_session, seeded["student"].id, deck.id)
    assignment.daily_new_target = 0
    db_session.commit()

    terms = {c["term"] for c in client.get("/review/due", headers=student_auth).json()}
    # The review card shows; the still-new second card is suppressed by the 0 cap.
    assert terms == {"meticulous"}
