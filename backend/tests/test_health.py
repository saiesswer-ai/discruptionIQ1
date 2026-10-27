"""Initial smoke test verifying FastAPI health endpoint."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "documentation" in response.json()


def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["service"] == "DisruptionIQ FastAPI Backend"


def test_login_preflight_allows_vite_dev_origin_and_bearer_headers() -> None:
    """The login JSON POST must pass browser preflight from the configured Vite origin."""
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in response.headers["access-control-allow-methods"]
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_invalid_query_returns_standard_error() -> None:
    response = client.get("/api/v1/orders/at-risk", params={"priority": "urgent"})
    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in payload["error"]["details"]


def test_unknown_route_returns_standard_error() -> None:
    response = client.get("/api/v1/not-a-route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"
