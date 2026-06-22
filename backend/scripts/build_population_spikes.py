"""Build a fine TOTAL-population spike dataset for the iconic 3D "population spikes" map.

Reads WorldPop total-population (100 m), block-sum downsamples to ~400 m cells,
keeps populated cells, and emits a lean [lng, lat, pop] array the frontend renders
as thin glowing columns.

Run:  backend/.venv/bin/python backend/scripts/build_population_spikes.py
Output: frontend/public/data/population_spikes_Bangladesh.json
"""
from __future__ import annotations
import json
import os
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import xy
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parents[1]            # backend/
DATA = HERE / "data"
OUT = HERE.parent / "frontend" / "public" / "data" / "population_spikes_Bangladesh.json"

# WorldPop total population, unconstrained 2020, 100 m (matches the age/sex vintage already in data/)
PPP_TIF = DATA / "bgd_ppp_2020.tif"
PPP_URL = "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/BGD/bgd_ppp_2020.tif"

# Meta Relative Wealth Index (modeled relative wealth, ~2.4 km tiles). Lower rwi =
# poorer area (proxy for less durable housing / fewer assets). CC BY-NC.
RWI_CSV = DATA / "bgd_relative_wealth_index.csv"
RWI_URL = ("https://data.humdata.org/dataset/76f2a2ea-ba50-40f5-b79c-db95d668b843/"
           "resource/57d0f567-272b-4dc4-b9bb-9a1d9dc4ea54/download/bgd_relative_wealth_index.csv")

FACTOR = int(os.environ.get("FACTOR", "6"))        # 100 m * 6 = ~550 m cells
POP_MIN = float(os.environ.get("POP_MIN", "30"))   # drop sparse rural cells; keep towns/cities
ROUND = 4           # lng/lat decimal places (~11 m)


def ensure_raster() -> None:
    if PPP_TIF.exists():
        print(f"raster present: {PPP_TIF.name} ({PPP_TIF.stat().st_size/1e6:.0f} MB)")
        return
    print(f"downloading {PPP_URL} ...")
    DATA.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(PPP_URL, PPP_TIF)
    print(f"saved {PPP_TIF.name} ({PPP_TIF.stat().st_size/1e6:.0f} MB)")


def load_rwi():
    if not RWI_CSV.exists():
        print(f"downloading RWI {RWI_URL} ...")
        urllib.request.urlretrieve(RWI_URL, RWI_CSV)
    arr = np.genfromtxt(RWI_CSV, delimiter=",", skip_header=1, usecols=(0, 1, 2, 3))
    lat, lng, rwi, err = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]
    print(f"RWI points: {len(rwi):,}  rwi range [{rwi.min():.2f}, {rwi.max():.2f}]")
    return lat, lng, rwi, err


def poverty_for(lngs, lats, rwi_lat, rwi_lng, rwi_val, rwi_err):
    """For each spike centroid, the nearest tile's poverty[0..1], raw rwi, and ±error."""
    tree = cKDTree(np.column_stack([rwi_lng, rwi_lat]))
    _, idx = tree.query(np.column_stack([lngs, lats]), k=1)
    rwi = rwi_val[idx]
    err = rwi_err[idx]
    lo, hi = np.percentile(rwi_val, 5), np.percentile(rwi_val, 95)  # clip outliers
    poverty = np.clip((hi - rwi) / (hi - lo), 0.0, 1.0)             # high rwi -> low poverty
    return poverty, rwi, err


def block_sum(a: np.ndarray, f: int) -> np.ndarray:
    """Sum f x f blocks, trimming any remainder rows/cols."""
    h, w = a.shape
    h2, w2 = (h // f) * f, (w // f) * f
    a = a[:h2, :w2]
    return a.reshape(h2 // f, f, w2 // f, f).sum(axis=(1, 3))


def main() -> None:
    ensure_raster()
    with rasterio.open(PPP_TIF) as src:
        band = src.read(1, masked=True).astype("float64")
        band = band.filled(0.0)
        band[band < 0] = 0.0                      # WorldPop nodata is a large negative
        transform = src.transform

    coarse = block_sum(band, FACTOR)
    rows, cols = np.nonzero(coarse >= POP_MIN)
    pops = coarse[rows, cols]

    # centroid of each coarse cell in original-pixel coordinates
    center_rows = rows * FACTOR + FACTOR / 2.0
    center_cols = cols * FACTOR + FACTOR / 2.0
    lngs, lats = xy(transform, center_rows, center_cols)        # arrays of lon, lat
    lngs = np.asarray(lngs); lats = np.asarray(lats)

    rwi_lat, rwi_lng, rwi_val, rwi_err = load_rwi()
    poverty, rwi, err = poverty_for(lngs, lats, rwi_lat, rwi_lng, rwi_val, rwi_err)

    spikes = [
        [round(float(lng), ROUND), round(float(lat), ROUND), int(round(float(p))),
         round(float(v), 3), round(float(r), 2), round(float(e), 2)]
        for lng, lat, p, v, r, e in zip(lngs, lats, pops, poverty, rwi, err)
    ]

    payload = {
        "country": "Bangladesh",
        "cell_m": int(round(abs(transform.a) * FACTOR * 111_320)),
        "count": len(spikes),
        "max": int(round(float(pops.max()))) if len(pops) else 0,
        "total_pop": int(round(float(pops.sum()))),
        "fields": ["lng", "lat", "pop", "poverty", "rwi", "rwi_err"],  # poverty 0..1; rwi raw ±err
        "spikes": spikes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(
        f"wrote {len(spikes):,} spikes  max={payload['max']:,}  "
        f"total={payload['total_pop']:,}  cell~{payload['cell_m']} m  "
        f"-> {OUT}  ({OUT.stat().st_size/1e6:.1f} MB)"
    )


if __name__ == "__main__":
    main()
