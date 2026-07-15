"""M3 admin surface: AI enrichment (stubbed), card edit/delete/move, and
whole-class assignment. Authorization is enforced in FastAPI — a student must
never reach these routes."""

from app.models import Card, CardState, Review
from app.models.enums import Rating
from app.vocab import enrichment
from app.vocab.enrichment import EnrichmentDraft


def test_student_cannot_reach_enrichment(client, student_auth):
    resp = client.post("/admin/enrich", headers=student_auth, json={"term": "ambitious"})
    assert resp.status_code == 403


def test_enrich_returns_a_draft(client, admin_auth, monkeypatch):
    monkeypatch.setattr(
        enrichment,
        "enrich_term",
        lambda term: EnrichmentDraft(
            meaning="having a strong desire to succeed",
            ipa="æmˈbɪʃəs",
            example_sentence="She is ambitious about the exam.",
        ),
    )
    resp = client.post("/admin/enrich", headers=admin_auth, json={"term": "  ambitious  "})
    assert resp.status_code == 200
    body = resp.json()
    assert body["term"] == "ambitious"  # trimmed
    assert body["ipa"] == "æmˈbɪʃəs"
    assert "succeed" in body["meaning"]


def test_enrich_without_a_key_returns_503(client, admin_auth):
    # The test environment has no ANTHROPIC_API_KEY, so the real call is unavailable.
    resp = client.post("/admin/enrich", headers=admin_auth, json={"term": "resilient"})
    assert resp.status_code == 503


def test_bulk_enrich_reports_failures_per_row(client, admin_auth, monkeypatch):
    def fake(term: str) -> EnrichmentDraft:
        if term == "boom":
            raise enrichment.EnrichmentError("nope")
        return EnrichmentDraft(meaning=f"def of {term}", ipa="x", example_sentence=f"A {term}.")

    monkeypatch.setattr(enrichment, "is_configured", lambda: True)
    monkeypatch.setattr(enrichment, "enrich_term", fake)

    resp = client.post(
        "/admin/enrich/bulk", headers=admin_auth, json={"terms": ["alpha", "boom", "  "]}
    )
    assert resp.status_code == 200
    rows = resp.json()
    # Blank term skipped; the two real terms come back — one drafted, one errored.
    assert [r["term"] for r in rows] == ["alpha", "boom"]
    assert rows[0]["meaning"] == "def of alpha" and rows[0]["error"] is None
    assert rows[1]["meaning"] is None and rows[1]["error"] == "nope"


def test_update_card_edits_fields(client, admin_auth, seeded, db_session):
    card = seeded["deck"].cards[0]
    resp = client.patch(
        f"/admin/cards/{card.id}",
        headers=admin_auth,
        json={"meaning": "very careful indeed", "ipa": "məˈtɪkjələs"},
    )
    assert resp.status_code == 200
    assert resp.json()["meaning"] == "very careful indeed"
    # Untouched fields survive.
    assert resp.json()["term"] == "meticulous"


def test_move_card_to_another_deck(client, admin_auth, seeded):
    card = seeded["deck"].cards[0]
    other = client.post(
        "/admin/decks", headers=admin_auth, json={"name": "Phrasal Verbs"}
    ).json()

    moved = client.patch(
        f"/admin/cards/{card.id}", headers=admin_auth, json={"deck_id": other["id"]}
    )
    assert moved.status_code == 200
    assert moved.json()["deck_id"] == other["id"]
    # It now lists under the new deck and no longer under the old one.
    new_terms = [c["term"] for c in client.get(
        f"/admin/decks/{other['id']}/cards", headers=admin_auth
    ).json()]
    assert new_terms == ["meticulous"]


def test_move_card_to_missing_deck_404(client, admin_auth, seeded):
    card = seeded["deck"].cards[0]
    resp = client.patch(f"/admin/cards/{card.id}", headers=admin_auth, json={"deck_id": 99999})
    assert resp.status_code == 404


def test_delete_card_also_clears_scheduling_state(
    client, admin_auth, student_auth, seeded, db_session
):
    card = seeded["deck"].cards[0]
    # Materialize the student's card_states so the delete must clear them.
    client.get("/review/due", headers=student_auth)
    assert db_session.query(CardState).filter_by(card_id=card.id).count() == 1

    resp = client.delete(f"/admin/cards/{card.id}", headers=admin_auth)
    assert resp.status_code == 204
    assert db_session.get(Card, card.id) is None
    assert db_session.query(CardState).filter_by(card_id=card.id).count() == 0


def test_delete_card_with_review_history_is_blocked(client, admin_auth, seeded, db_session):
    card = seeded["deck"].cards[0]
    # A single grade in the immutable log must protect the card from deletion.
    db_session.add(Review(student_id=seeded["student"].id, card_id=card.id, rating=Rating.good))
    db_session.commit()

    resp = client.delete(f"/admin/cards/{card.id}", headers=admin_auth)
    assert resp.status_code == 409
    assert db_session.get(Card, card.id) is not None


def test_assign_deck_to_whole_class(client, admin_auth, seeded, db_session):
    deck = client.post(
        "/admin/decks", headers=admin_auth, json={"name": "Class Deck"}
    ).json()

    resp = client.post(
        "/admin/assignments/class",
        headers=admin_auth,
        json={"deck_id": deck["id"], "daily_new_target": 5},
    )
    assert resp.status_code == 201
    rows = resp.json()
    # Both seeded students get an active assignment with the class-wide target.
    assert len(rows) == 2
    assert all(r["active"] and r["daily_new_target"] == 5 for r in rows)


def test_update_student_daily_target(client, admin_auth, seeded):
    student_id = seeded["student"].id
    resp = client.patch(
        f"/admin/students/{student_id}", headers=admin_auth, json={"daily_new_target": 3}
    )
    assert resp.status_code == 200
    assert resp.json()["daily_new_target"] == 3
