# Flood Risk Map

**UN Tech Over 2026 — Track 2a (GeoAI & Geospatial Evidence)**

A mobile-first 3D web app that shows flood risk over H3 hexagons for Uganda,
joining an authoritative flood forecast with population (children under-5) and
critical infrastructure (schools + clinics) — and makes the **evidence chain
visible**: tap any hexagon to see which model, which dataset, and what
uncertainty produced the number.

![stack](https://img.shields.io/badge/stack-React%2019%20·%20MapLibre%20·%20deck.gl%20·%20FastAPI-2196f3)

## Why it's credible
- **Flood**: GloFAS / JRC Global Flood Hazard (LISFLOOD, Copernicus EMS) — real
  return-period water-depth layers (rp10 / rp100 / rp500), not a fabricated decay.
- **Population**: WorldPop 2020 age/sex grids — under-5 = sum of female/male ages
  0 and 1–4 (genuine age structure, not a flat 12% guess).
- **Infrastructure**: schools (Giga / OpenStreetMap) + clinics (Healthsites / OSM).
- Every number in the UI is traceable to its source via `/api/evidence/{h3_id}`.

## Architecture
```
frontend/  React 19 + Vite + TypeScript
           MapLibre GL v5 (3D globe) + deck.gl H3HexagonLayer (extruded risk)
           PWA (offline shell + tile/api caching)

backend/   FastAPI
           Heavy geo work runs ONCE (h3 v4 fill @ res 6, rasterstats zonal
           stats, metric-CRS facility joins) -> data/hexagons.parquet.
           The API just serves that table -> tiny image, instant cold start.
```

## Run with Docker
```bash
make up
```

Open the app at http://localhost:5173. The backend is exposed at
http://localhost:8001.

Useful targets:
```bash
make up-detached     # run containers in the background
make logs            # follow all logs
make down            # stop containers
make precompute      # run python scripts/precompute.py in the backend container
make download-data   # run python scripts/download_data.py in the backend container
```

## Run locally without Docker
### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python scripts/download_data.py      # fetch rasters/boundary/facilities (~600MB)
python scripts/precompute.py         # build data/hexagons.parquet (commit this)

uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api -> :8001)
```

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/api/hexagons?country=Uganda&time_horizon=4h\|20h\|7d` | hexagons with risk/pop/facilities |
| GET | `/api/evidence/{h3_id}` | full evidence chain for one hexagon |
| GET | `/api/stats?country=Uganda` | country aggregates |
| POST | `/api/brief` `{h3_id, time_horizon}` | one-page decision-brief PDF |

## Deploy
`render.yaml` deploys both services (Docker backend + static frontend). The
backend image only needs `data/hexagons.parquet`, so deploys are fast and small.
Frontend reads `VITE_API_URL` at build time.

## Notes
- Time horizons (4h / 20h / 7d) map to flood return periods rp10 / rp100 / rp500.
- JRC values are water depth (m); normalised to a 0–1 risk score (see `config.py`).
- H3 resolution 6 (~3 km cells) → a few thousand flood-affected hexagons, smooth on phones.
