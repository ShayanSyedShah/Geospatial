"""Smoke tests for the Flood Risk Map API. Requires data/hexagons.parquet
(run scripts/precompute.py first). Run:  pytest -q  (from backend/)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_hexagons():
    r = client.get("/api/hexagons?country=Uganda&time_horizon=4h")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] > 0
    h = body["hexagons"][0]
    assert 0.0 <= h["flood_risk"] <= 1.0
    assert h["population_u5"] >= 0
    # sorted by descending risk
    risks = [x["flood_risk"] for x in body["hexagons"]]
    assert risks == sorted(risks, reverse=True)


def test_time_horizon_validation():
    assert client.get("/api/hexagons?time_horizon=bogus").status_code == 422


def test_evidence_and_brief():
    first = client.get("/api/hexagons?time_horizon=20h").json()["hexagons"][0]
    h3_id = first["h3_id"]

    ev = client.get(f"/api/evidence/{h3_id}")
    assert ev.status_code == 200
    assert "GloFAS" in ev.json()["flood_forecast"]["source"]

    brief = client.post("/api/brief", json={"h3_id": h3_id, "time_horizon": "20h"})
    assert brief.status_code == 200
    assert brief.headers["content-type"] == "application/pdf"
    assert brief.content[:4] == b"%PDF"


def test_stats():
    r = client.get("/api/stats?country=Uganda")
    assert r.status_code == 200
    assert r.json()["total_hexagons"] > 0
