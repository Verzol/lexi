"""M7 hardening: logout revokes every outstanding token via the user's token
version, so a captured access or refresh token can't outlive a logout."""


def _login(client):
    resp = client.post("/auth/login", json={"email": "mai@lexi.app", "password": "studentpw"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"], client.cookies.get("lexi_refresh")


def test_logout_revokes_the_access_token(client, seeded):
    token, _ = _login(client)
    auth = {"Authorization": f"Bearer {token}"}

    assert client.get("/auth/me", headers=auth).status_code == 200

    assert client.post("/auth/logout").status_code == 204

    # The same access token is rejected now that the version has moved on.
    assert client.get("/auth/me", headers=auth).status_code == 401


def test_logout_revokes_the_refresh_token(client, seeded):
    _token, refresh_cookie = _login(client)
    assert refresh_cookie is not None

    assert client.post("/auth/logout").status_code == 204

    # A captured pre-logout refresh token can no longer mint new tokens.
    client.cookies.set("lexi_refresh", refresh_cookie)
    assert client.post("/auth/refresh").status_code == 401


def test_refresh_still_works_before_logout(client, seeded):
    _token, _refresh_cookie = _login(client)
    # Sanity: a live refresh token rotates fine until it's revoked.
    assert client.post("/auth/refresh").status_code == 200
