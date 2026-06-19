"""BEACON backend smoke tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_report():
    payload = {
        "level": 13.0, "waterElev": 13.0,
        "total": {"childrenU5": 209130, "schools": 17, "clinics": 3, "maxDepth": 13.8},
        "zones": [
            {"rank": 1, "name": "Shahjadpur", "childrenU5": 48000, "schools": 5, "clinics": 1, "nearestClinicKm": 4.2},
            {"rank": 2, "name": "Belkuchi", "childrenU5": 39000, "schools": 4, "clinics": 1, "nearestClinicKm": 3.1},
        ],
        "unicef": {"indicator": "Under-five mortality rate", "value": 39.8, "year": 2024,
                   "ci_low": 35.2, "ci_high": 45.3, "source": "UNICEF/UN IGME"},
        "weights": {"children": 0.45, "flood": 0.35, "access": 0.2},
    }
    r = client.post("/api/report", json=payload)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
