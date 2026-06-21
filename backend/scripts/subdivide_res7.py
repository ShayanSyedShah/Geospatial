"""Refine the cached hexagon table from H3 res 6 to res 7 for a denser grid.

The raw WorldPop / flood rasters aren't kept in the repo, so we can't re-measure
at res 7. Instead we subdivide each res-6 cell into its 7 res-7 children:

  - population_u5 is split EVENLY across the 7 children (so national/district
    totals are preserved exactly within rounding -- no population is invented);
  - flood risk/depth, facility metrics, district, country and uncertainty are
    inherited from the parent cell;
  - lat/lng are recomputed at each child's true centre.

This is a *display-resolution* refinement of the real res-6 data, giving the
"forest of spikes" Human Terrain look. For genuinely re-measured res-7 values,
re-run download_data.py + precompute.py with H3_RES=7.

    python backend/scripts/subdivide_res7.py
"""
from pathlib import Path

import h3
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SRC = DATA_DIR / "hexagons.parquet"
BACKUP = DATA_DIR / "hexagons_res6.parquet"
CHILD_RES = 7

INHERIT = [
    "flood_risk_4h", "flood_risk_20h", "flood_risk_7d", "flood_depth_max_m",
    "nearby_schools", "nearby_clinics", "nearest_clinic_m",
    "district", "country", "uncertainty",
]


def main() -> None:
    df = pd.read_parquet(SRC)
    parent_res = h3.get_resolution(df["h3_id"].iloc[0])
    print(f"loaded {len(df)} cells at res {parent_res}")
    if parent_res >= CHILD_RES:
        print(f"already at res {parent_res} (>= {CHILD_RES}); nothing to do")
        return

    if not BACKUP.exists():
        df.to_parquet(BACKUP, index=False)
        print(f"backed up original -> {BACKUP.name}")

    rows = []
    for r in df.itertuples(index=False):
        children = h3.cell_to_children(r.h3_id, CHILD_RES)
        share = r.population_u5 / len(children)
        for ch in children:
            lat, lng = h3.cell_to_latlng(ch)
            row = {"h3_id": ch, "lat": lat, "lng": lng,
                   "population_u5": int(round(share))}
            for col in INHERIT:
                row[col] = getattr(r, col)
            rows.append(row)

    out = pd.DataFrame(rows)[df.columns]
    out.to_parquet(SRC, index=False)
    print(f"wrote {len(out)} cells at res {CHILD_RES} -> {SRC.name}")
    print("population by country (before / after):")
    before = df.groupby("country")["population_u5"].sum().to_dict()
    after = out.groupby("country")["population_u5"].sum().to_dict()
    for c in before:
        print(f"  {c}: {before[c]:,} -> {after.get(c, 0):,}")
    print("cells by country:", out.groupby("country").size().to_dict())


if __name__ == "__main__":
    main()
