"""Regression tests for deterministic carrier-event intelligence."""
from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app


def _event(event_id: str | None = None, occurred_at: str = "2026-10-26T20:00:00Z") -> dict:
    return {
        # A fresh id makes tests independent of a developer's prior webhook
        # replays while individual tests still reuse the same payload to test
        # idempotency.
        "eventId": event_id or f"test-delay-{uuid4().hex}",
        "trackingNumber": "MSKU-781920-4",
        "eventType": "delay_reported",
        "occurredAt": occurred_at,
        "status": "delayed",
        "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
        "location": "Rotterdam outer anchorage",
        "reason": "Berth hold",
    }


def test_normal_event_creates_explainable_disruptions_and_risk() -> None:
    client = TestClient(app)
    response = client.post("/api/v1/webhooks/carrier", json=_event())
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "processed"
    assert len(body["disruptionIds"]) >= 2

    detail = client.get(f"/api/v1/disruptions/{body['disruptionIds'][0]}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["evidence"]
    assert payload["affectedOrders"]
    assert any(impact["entityType"] == "shipment" for impact in payload["impacts"])
    assert any(impact["entityType"] == "order_line" for impact in payload["impacts"])


def test_duplicate_event_is_safe_and_does_not_apply_twice() -> None:
    client = TestClient(app)
    event = _event()
    assert client.post("/api/v1/webhooks/carrier", json=event).json()["status"] == "processed"
    duplicate = client.post("/api/v1/webhooks/carrier", json=event)
    assert duplicate.status_code == 202
    assert duplicate.json()["status"] == "duplicate"


def test_conflicting_replay_is_rejected() -> None:
    client = TestClient(app)
    event = _event()
    client.post("/api/v1/webhooks/carrier", json=event)
    conflicting = dict(event)
    conflicting["estimatedDeliveryDate"] = "2026-10-29T06:00:00Z"
    response = client.post("/api/v1/webhooks/carrier", json=conflicting)
    assert response.status_code == 409


def test_invalid_payload_is_rejected_by_schema() -> None:
    client = TestClient(app)
    response = client.post("/api/v1/webhooks/carrier", json={"eventId": "missing-fields"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_stale_event_cannot_overwrite_newer_shipment_state() -> None:
    client = TestClient(app)
    assert client.post("/api/v1/webhooks/carrier", json=_event()).json()["status"] == "processed"
    stale = _event(f"test-delay-old-{uuid4().hex}", "2026-10-26T19:00:00Z")
    stale["estimatedDeliveryDate"] = "2026-10-26T22:00:00Z"
    result = client.post("/api/v1/webhooks/carrier", json=stale)
    assert result.status_code == 202
    assert result.json()["status"] == "stale"
    shipment = next(item for item in client.get("/api/v1/shipments").json() if item["trackingNumber"] == stale["trackingNumber"])
    assert shipment["estimatedDeliveryDate"].startswith("2026-10-28")


def test_actual_available_stock_shortage_is_detected() -> None:
    client = TestClient(app)
    response = client.post("/api/v1/webhooks/carrier", json=_event())
    disruption_ids = response.json()["disruptionIds"]
    types = {client.get(f"/api/v1/disruptions/{item}").json()["type"] for item in disruption_ids}
    assert "inventory_shortage" in types


def test_unaffected_order_is_not_linked_or_rescored() -> None:
    client = TestClient(app)
    client.post("/api/v1/webhooks/carrier", json=_event())
    unaffected = next(item for item in client.get("/api/v1/orders/at-risk").json() if item["id"] == "ORD-8415")
    assert unaffected["associatedDisruptionId"] == ""
    assert unaffected["riskScore"] == 15
