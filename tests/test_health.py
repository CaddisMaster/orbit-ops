def test_healthz_reports_ok_and_version(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]  # "dev" locally, the release version in an image


def test_healthz_needs_no_login(client):
    assert client.get("/healthz", follow_redirects=False).status_code == 200
