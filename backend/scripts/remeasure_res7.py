"""Replace split (display-subdivided) res-7 population with REAL per-cell counts.

subdivide_res7.py gave each res-7 child 1/7 of its parent's population, so the 7
children of a res-6 cell rendered as identical-height spikes (a uniform, blocky
look). This script keeps the exact same res-7 cell set but re-measures under-5
population in each child directly from the WorldPop 100 m rasters, so every cell
gets its true value and the spikes vary organically.

Measurement is a rasterize + bincount zonal sum (one pass per raster): each pixel
is burned with its cell index, then population is summed per cell. This conserves
the raster total and is deterministic (rasterstats.zonal_stats proved flaky in
this env). Flood risk/depth, facility metrics, district and uncertainty are
inherited from the res-6 parent (those inputs are unchanged).

Requires the WorldPop under-5 tifs in data/ (download_data.py / get_worldpop).

    python backend/scripts/remeasure_res7.py
"""
from pathlib import Path
import sys

import h3
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize
from shapely.geometry import Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # noqa: E402

DATA_DIR = config.DATA_DIR
SRC = DATA_DIR / "hexagons.parquet"          # res-7 table -> overwritten
RES6 = DATA_DIR / "hexagons_res6.parquet"    # measured res-6 source (flood/facility/district)
CHILD_RES = 7

INHERIT = [
    "flood_risk_4h", "flood_risk_20h", "flood_risk_7d", "flood_depth_max_m",
    "nearby_schools", "nearby_clinics", "nearest_clinic_m",
    "district", "country", "uncertainty",
]


def measure_country(polys: list[Polygon], raster_paths: list[str]) -> np.ndarray:
    """Sum WorldPop under-5 counts across the 4 grids for each polygon."""
    pop = np.zeros(len(polys), dtype="float64")
    shapes = [(g, i + 1) for i, g in enumerate(polys)]
    labels = None
    for path in raster_paths:
        with rasterio.open(path) as src:
            if labels is None:
                labels = rasterize(shapes, out_shape=src.shape, transform=src.transform,
                                   fill=0, dtype="int32")
                flat = labels.ravel()
            arr = src.read(1).astype("float64")
            arr[arr == src.nodata] = 0.0
            arr[arr < 0] = 0.0
        sums = np.bincount(flat, weights=arr.ravel(), minlength=len(polys) + 1)
        pop += sums[1:]
    return pop


def main() -> None:
    parents = pd.read_parquet(RES6)
    cols = list(parents.columns)
    print(f"loaded {len(parents)} measured res-6 parent cells")

    # Expand each parent into its 7 res-7 children, carrying inherited fields.
    rows, geoms = [], []
    for r in parents.itertuples(index=False):
        for ch in h3.cell_to_children(r.h3_id, CHILD_RES):
            lat, lng = h3.cell_to_latlng(ch)
            geoms.append(Polygon([(b_lng, b_lat) for (b_lat, b_lng) in h3.cell_to_boundary(ch)]))
            row = {"h3_id": ch, "lat": lat, "lng": lng, "population_u5": 0}
            for c in INHERIT:
                row[c] = getattr(r, c)
            rows.append(row)
    df = pd.DataFrame(rows)
    print(f"expanded to {len(df)} res-{CHILD_RES} children; measuring population ...")

    for country in df["country"].unique():
        prefix = config.COUNTRIES[country]["prefix"]
        rasters = [str(DATA_DIR / f) for f in config.worldpop_under5(prefix)]
        mask = (df["country"] == country).values
        polys = [geoms[i] for i in np.nonzero(mask)[0]]
        pop = measure_country(polys, rasters)
        df.loc[mask, "population_u5"] = np.round(pop).astype(int)
        print(f"  {country}: {len(polys)} cells, sum under-5 = {int(pop.sum()):,}")

    out = df[cols]
    out.to_parquet(SRC, index=False)
    print(f"wrote {len(out)} cells -> {SRC.name}")
    nz = out["population_u5"]
    print(f"population_u5 — min {nz.min()}, median {int(nz.median())}, "
          f"max {nz.max():,}, nonzero {int((nz > 0).sum())}/{len(nz)}")


if __name__ == "__main__":
    main()
