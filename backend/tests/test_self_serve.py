"""Self-serve model: public registration, and students authoring their own
decks/cards. Ownership is the boundary — a student can edit only decks they made,
teacher ("class") decks stay read-only, and AI enrichment stays teacher-only."""

from app.models import Card, Deck


def _register(client, email, password="password123", name="New Learner"):
    return client.post(
        "/auth/register",
        json={"email": email, "display_name": name, "password": password},
    )


def _auth(client, email, password="password123") -> dict[str, str]:
    token = client.post("/auth/login", json={"email": email, "password": password}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


# --- Registration ---------------------------------------------------------


def test_register_creates_a_student_and_logs_them_in(client):
    resp = _register(client, "newbie@lexi.app")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["role"] == "student"
    assert body["access_token"]

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    # The token works, and a streak row was created with the account.
    assert client.get("/auth/me", headers=headers).json()["email"] == "newbie@lexi.app"
    streak = client.get("/me/streak", headers=headers).json()
    assert streak == {"current_streak": 0, "longest_streak": 0, "freezes_remaining": 2}


def test_registered_user_is_not_an_admin(client):
    headers = {
        "Authorization": f"Bearer {_register(client, 'newbie@lexi.app').json()['access_token']}"
    }
    # Self-signup can't grant admin — the admin surface stays closed.
    assert client.post("/admin/decks", headers=headers, json={"name": "x"}).status_code == 403


def test_register_rejects_a_duplicate_email(client):
    assert _register(client, "dup@lexi.app").status_code == 201
    assert _register(client, "dup@lexi.app").status_code == 409


def test_register_rejects_a_short_password(client):
    assert _register(client, "weak@lexi.app", password="short").status_code == 422


# --- Personal decks in the study loop -------------------------------------


def test_personal_deck_appears_owned_and_the_class_deck_does_not(client, student_auth, seeded):
    created = client.post("/decks", headers=student_auth, json={"name": "My words"})
    assert created.status_code == 201
    assert created.json()["owned"] is True

    decks = {d["name"]: d for d in client.get("/decks", headers=student_auth).json()}
    assert decks["My words"]["owned"] is True
    # The teacher-assigned deck is visible but not editable — owned=False.
    assert decks[seeded["deck"].name]["owned"] is False


def test_a_self_authored_card_becomes_due_for_review(client, student_auth, db_session):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "My words"}).json()["id"]
    card = client.post(
        f"/decks/{deck_id}/cards",
        headers=student_auth,
        json={"term": "serendipity", "meaning": "a pleasant surprise"},
    )
    assert card.status_code == 201
    assert card.json()["source"] == "manual"

    terms = {c["term"] for c in client.get("/review/due", headers=student_auth).json()}
    assert "serendipity" in terms


def test_card_source_is_forced_manual_even_if_ai_is_claimed(client, student_auth):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "My words"}).json()["id"]
    card = client.post(
        f"/decks/{deck_id}/cards",
        headers=student_auth,
        json={"term": "x", "meaning": "y", "source": "ai-enriched"},
    )
    # A student can't route through here to mint AI-tagged content.
    assert card.json()["source"] == "manual"


def test_edit_and_delete_a_card_in_your_own_deck(client, student_auth):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "My words"}).json()["id"]
    card_id = client.post(
        f"/decks/{deck_id}/cards", headers=student_auth, json={"term": "teh", "meaning": "typo"}
    ).json()["id"]

    edited = client.patch(
        f"/decks/{deck_id}/cards/{card_id}", headers=student_auth, json={"term": "the"}
    )
    assert edited.status_code == 200
    assert edited.json()["term"] == "the"

    assert (
        client.delete(f"/decks/{deck_id}/cards/{card_id}", headers=student_auth).status_code == 204
    )
    assert client.get(f"/decks/{deck_id}/cards", headers=student_auth).json() == []


def test_rename_and_delete_your_own_deck(client, student_auth):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "Draft"}).json()["id"]
    renamed = client.patch(f"/decks/{deck_id}", headers=student_auth, json={"name": "Final"})
    assert renamed.json()["name"] == "Final"
    assert client.delete(f"/decks/{deck_id}", headers=student_auth).status_code == 204
    assert deck_id not in {d["id"] for d in client.get("/decks", headers=student_auth).json()}


# --- Ownership boundaries --------------------------------------------------


def test_cannot_add_a_card_to_the_teacher_deck(client, student_auth, seeded):
    # The class deck is owned by the teacher — writing to it 404s (not 403).
    resp = client.post(
        f"/decks/{seeded['deck'].id}/cards",
        headers=student_auth,
        json={"term": "x", "meaning": "y"},
    )
    assert resp.status_code == 404


def test_cannot_touch_another_students_deck(client, student_auth):
    _register(client, "rival@lexi.app")
    rival = _auth(client, "rival@lexi.app")
    rival_deck = client.post("/decks", headers=rival, json={"name": "Rival's"}).json()["id"]

    # mai (student_auth) must not see, edit, or add to rival's deck — all 404.
    assert (
        client.post(
            f"/decks/{rival_deck}/cards", headers=student_auth, json={"term": "x", "meaning": "y"}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/decks/{rival_deck}", headers=student_auth, json={"name": "hijack"}
        ).status_code
        == 404
    )
    assert client.delete(f"/decks/{rival_deck}", headers=student_auth).status_code == 404


def test_graded_card_and_deck_cannot_be_deleted(client, student_auth):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "My words"}).json()["id"]
    card_id = client.post(
        f"/decks/{deck_id}/cards", headers=student_auth, json={"term": "kept", "meaning": "logged"}
    ).json()["id"]
    client.post("/review/grade", headers=student_auth, json={"card_id": card_id, "rating": "good"})

    # reviews is append-only — a graded card (and its deck) can't be destroyed.
    assert (
        client.delete(f"/decks/{deck_id}/cards/{card_id}", headers=student_auth).status_code == 409
    )
    assert client.delete(f"/decks/{deck_id}", headers=student_auth).status_code == 409


def test_personal_deck_and_card_actually_persist(client, student_auth, db_session):
    deck_id = client.post("/decks", headers=student_auth, json={"name": "Persisted"}).json()["id"]
    client.post(f"/decks/{deck_id}/cards", headers=student_auth, json={"term": "t", "meaning": "m"})

    deck = db_session.get(Deck, deck_id)
    assert deck is not None and deck.name == "Persisted"
    cards = db_session.query(Card).filter_by(deck_id=deck_id).all()
    assert [c.term for c in cards] == ["t"]
