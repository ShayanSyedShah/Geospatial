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
    r = client.get("/api/hexagons?country=Bangladesh")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] > 0
    h = body["hexagons"][0]
    assert 0.0 <= h["flood_risk_7d"] <= 1.0
    assert h["population_u5"] >= 0
    assert "district" in h
    # sorted by descending 7d risk
    risks = [x["flood_risk_7d"] for x in body["hexagons"]]
    assert risks == sorted(risks, reverse=True)


def test_regions():
    r = client.get("/api/regions?country=Bangladesh")
    assert r.status_code == 200
    regions = r.json()
    assert len(regions) > 0
    assert "district" in regions[0] and "children_at_risk" in regions[0]


def test_countries():
    r = client.get("/api/countries")
    assert r.status_code == 200
    assert any(c["default"] for c in r.json())


def test_facilities():
    r = client.get("/api/facilities?country=Bangladesh")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] > 0
    assert 0 < body["at_risk"] <= body["count"]
    f = body["facilities"][0]
    assert f["type"] in ("school", "clinic")
    assert "at_risk" in f and "lat" in f and "lng" in f


def test_evidence_and_brief():
    first = client.get("/api/hexagons?country=Bangladesh").json()["hexagons"][0]
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
