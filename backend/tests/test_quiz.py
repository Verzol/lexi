"""M4 quizzes: a short auto-generated quiz over known cards, whose answers feed
the FSRS scheduler (a miss reschedules sooner) and log with source=quiz."""

from datetime import UTC, datetime

from app.models import Card, CardState, Review
from app.models.enums import CardStateEnum, ReviewSource


def _make_known(db_session, seeded):
    """Promote both seeded cards out of `new` so they're eligible for the quiz."""
    student_id = seeded["student"].id
    for card in seeded["deck"].cards:
        db_session.add(
            CardState(
                student_id=student_id,
                card_id=card.id,
                state=CardStateEnum.review,
                stability=5.0,
                difficulty=5.0,
                reps=2,
                due_at=datetime.now(UTC),
            )
        )
    db_session.commit()


def test_new_student_gets_an_empty_quiz(client, student_auth):
    # Cards are all still `new` (never reviewed) — nothing to quiz yet.
    resp = client.get("/quiz", headers=student_auth)
    assert resp.status_code == 200
    assert resp.json() == []


def test_unassigned_student_gets_an_empty_quiz(client, other_auth):
    assert client.get("/quiz", headers=other_auth).json() == []


def test_quiz_draws_only_known_cards(client, student_auth, seeded, db_session):
    _make_known(db_session, seeded)
    questions = client.get("/quiz", headers=student_auth).json()

    assert 1 <= len(questions) <= 2
    known_ids = {c.id for c in seeded["deck"].cards}
    for q in questions:
        assert q["card_id"] in known_ids
        assert q["kind"] in {"mcq", "type_answer"}
        if q["kind"] == "mcq":
            # The word is shown; the answer (meaning) is withheld but sits among the options.
            assert q["term"] is not None and q["meaning"] is None
            card = db_session.get(Card, q["card_id"])
            assert card.meaning in q["options"]
        else:
            # The definition is shown; the term (the answer) is withheld.
            assert q["meaning"] is not None and q["term"] is None


def test_correct_answer_grades_good_and_logs_a_quiz_review(
    client, student_auth, seeded, db_session
):
    _make_known(db_session, seeded)
    card = seeded["deck"].cards[0]

    resp = client.post(
        "/quiz/answer",
        headers=student_auth,
        json={"card_id": card.id, "kind": "type_answer", "answer": "  Meticulous. "},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Normalization forgives case, whitespace, and trailing punctuation.
    assert body["correct"] is True
    assert body["correct_answer"] == "meticulous"

    review = db_session.query(Review).filter_by(card_id=card.id).one()
    assert review.rating.value == "good"
    assert review.source is ReviewSource.quiz


def test_wrong_answer_grades_again_and_reschedules_sooner(
    client, student_auth, seeded, db_session
):
    _make_known(db_session, seeded)
    again_card, good_card = seeded["deck"].cards

    wrong = client.post(
        "/quiz/answer",
        headers=student_auth,
        json={"card_id": again_card.id, "kind": "type_answer", "answer": "completely wrong"},
    ).json()
    right = client.post(
        "/quiz/answer",
        headers=student_auth,
        json={"card_id": good_card.id, "kind": "type_answer", "answer": "resilient"},
    ).json()

    assert wrong["correct"] is False
    assert wrong["correct_answer"] == "meticulous"
    # A missed card is scheduled back sooner than a remembered one.
    assert datetime.fromisoformat(wrong["due_at"]) < datetime.fromisoformat(right["due_at"])


def test_mcq_grades_the_chosen_meaning(client, student_auth, seeded, db_session):
    _make_known(db_session, seeded)
    card = seeded["deck"].cards[0]

    resp = client.post(
        "/quiz/answer",
        headers=student_auth,
        json={"card_id": card.id, "kind": "mcq", "answer": card.meaning},
    )
    assert resp.status_code == 200
    assert resp.json()["correct"] is True


def test_cannot_answer_a_card_from_an_unassigned_deck(client, other_auth, seeded, db_session):
    _make_known(db_session, seeded)
    card = seeded["deck"].cards[0]
    # Duc isn't assigned this deck — answering its card must 404, not 403.
    resp = client.post(
        "/quiz/answer",
        headers=other_auth,
        json={"card_id": card.id, "kind": "type_answer", "answer": "meticulous"},
    )
    assert resp.status_code == 404
