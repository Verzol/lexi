"""Students see only what the teacher assigned them — enforced server-side."""


def test_student_sees_assigned_deck_with_due_counts(client, student_auth):
    resp = client.get("/decks", headers=student_auth)
    assert resp.status_code == 200

    decks = resp.json()
    assert len(decks) == 1
    deck = decks[0]
    assert deck["name"] == "Entrance Exam — Core 300"
    assert deck["card_count"] == 2
    # card_states are materialized lazily on first read, so both cards are due now.
    assert deck["due_count"] == 2


def test_unassigned_student_sees_nothing(client, other_auth):
    assert client.get("/decks", headers=other_auth).json() == []


def test_student_cannot_read_cards_from_an_unassigned_deck(client, other_auth, seeded):
    deck_id = seeded["deck"].id
    # Duc has no assignment for this deck — 404, not 403, so the deck's existence isn't leaked.
    assert client.get(f"/decks/{deck_id}/cards", headers=other_auth).status_code == 404


def test_assigned_student_can_read_the_cards(client, student_auth, seeded):
    resp = client.get(f"/decks/{seeded['deck'].id}/cards", headers=student_auth)
    assert resp.status_code == 200
    assert [c["term"] for c in resp.json()] == ["meticulous", "resilient"]


def test_teacher_add_then_assign_reaches_the_student(client, admin_auth, other_auth):
    deck = client.post(
        "/admin/decks",
        headers=admin_auth,
        json={"name": "Phrasal Verbs", "topic_tags": ["phrasal-verbs"]},
    ).json()

    card = client.post(
        f"/admin/decks/{deck['id']}/cards",
        headers=admin_auth,
        json={"term": "put off", "meaning": "to postpone", "source": "ai-enriched"},
    )
    assert card.status_code == 201
    # The hyphenated value from the data model survives the round trip.
    assert card.json()["source"] == "ai-enriched"

    # Duc can't see it until it is assigned to him.
    assert client.get("/decks", headers=other_auth).json() == []

    students = client.get("/auth/students", headers=admin_auth).json()
    duc = next(s for s in students if s["email"] == "duc@lexi.app")
    assign = client.post(
        "/admin/assignments",
        headers=admin_auth,
        json={"student_id": duc["id"], "deck_id": deck["id"]},
    )
    assert assign.status_code == 201

    decks = client.get("/decks", headers=other_auth).json()
    assert [d["name"] for d in decks] == ["Phrasal Verbs"]
    assert decks[0]["due_count"] == 1
