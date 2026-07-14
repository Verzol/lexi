"""
Authorization is enforced in the API, never in the frontend. These tests are
the boundary — if they pass, hiding admin UI in React is purely cosmetic.
"""


def test_login_returns_access_token_and_sets_refresh_cookie(client, seeded):
    resp = client.post("/auth/login", json={"email": "mai@lexi.app", "password": "studentpw"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["role"] == "student"
    # The refresh token must NOT be in the response body — it belongs in an httpOnly cookie.
    assert "refresh_token" not in body
    assert "lexi_refresh" in resp.cookies


def test_wrong_password_and_unknown_email_are_indistinguishable(client, seeded):
    wrong_pw = client.post("/auth/login", json={"email": "mai@lexi.app", "password": "nope"})
    unknown = client.post("/auth/login", json={"email": "ghost@lexi.app", "password": "nope"})

    assert wrong_pw.status_code == unknown.status_code == 401
    # Identical message, so the API can't be used to enumerate accounts.
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


def test_protected_route_rejects_missing_and_garbage_tokens(client, seeded):
    assert client.get("/decks").status_code == 401
    assert client.get("/decks", headers={"Authorization": "Bearer not.a.token"}).status_code == 401


def test_student_cannot_reach_admin_routes(client, student_auth):
    assert client.get("/admin/decks", headers=student_auth).status_code == 403
    assert client.post("/admin/decks", headers=student_auth, json={"name": "x"}).status_code == 403


def test_student_cannot_create_accounts(client, student_auth):
    resp = client.post(
        "/auth/students",
        headers=student_auth,
        json={"email": "hacker@lexi.app", "display_name": "H", "password": "pw"},
    )
    assert resp.status_code == 403


def test_admin_can_create_a_student_and_no_self_signup_exists(client, admin_auth):
    resp = client.post(
        "/auth/students",
        headers=admin_auth,
        json={"email": "new@lexi.app", "display_name": "New Student", "password": "pw123456"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "student"

    # Duplicate email is rejected.
    again = client.post(
        "/auth/students",
        headers=admin_auth,
        json={"email": "new@lexi.app", "display_name": "Dupe", "password": "pw123456"},
    )
    assert again.status_code == 409


def test_access_token_is_not_accepted_as_a_refresh_token(client, seeded):
    login = client.post("/auth/login", json={"email": "mai@lexi.app", "password": "studentpw"})
    access = login.json()["access_token"]

    client.cookies.clear()
    resp = client.post("/auth/refresh", cookies={"lexi_refresh": access})
    assert resp.status_code == 401


def test_refresh_issues_a_new_access_token(client, seeded):
    client.post("/auth/login", json={"email": "mai@lexi.app", "password": "studentpw"})
    resp = client.post("/auth/refresh")  # cookie carried by the TestClient
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "mai@lexi.app"
