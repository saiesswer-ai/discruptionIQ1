"""Replay the two deterministic carrier scenarios against a running API."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx


SCENARIOS = {
    "delay": {
        "eventId": "demo-delay-99214-v1", "trackingNumber": "MSKU-781920-4", "eventType": "delay_reported",
        "occurredAt": "2026-10-26T20:00:00Z", "status": "delayed", "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
        "location": "Rotterdam outer anchorage", "reason": "Berth hold",
    },
    "customs": {
        "eventId": "demo-customs-99218-v1", "trackingNumber": "FDX-PRI-3310", "eventType": "shipment_updated",
        "occurredAt": "2026-10-26T21:00:00Z", "status": "customs_hold", "estimatedDeliveryDate": "2026-10-27T14:00:00Z",
        "location": "Chicago customs", "reason": "Documentation inspection",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--scenario", choices=["delay", "customs", "all"], default="all")
    args = parser.parse_args()
    names = SCENARIOS if args.scenario == "all" else {args.scenario: SCENARIOS[args.scenario]}
    with httpx.Client(base_url=args.base_url, timeout=10) as client:
        for name, event in names.items():
            response = client.post("/api/v1/webhooks/carrier", json=event)
            response.raise_for_status()
            print(json.dumps({"scenario": name, **response.json()}, indent=2))


if __name__ == "__main__":
    main()
