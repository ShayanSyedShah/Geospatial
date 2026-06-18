"""Load datasets once at startup and aggregate everything onto H3 hexagons.

The result is a plain pandas DataFrame held in memory (no DuckDB needed at this
scale). One row per H3 cell, with risk per time horizon, under-5 population, and
facility metrics.
"""
from __future__ import annotations

import time

import geopandas as gpd
import numpy as np
import pandas as pd

from . import config, spatial_operations as ops

WORLDPOP_U5 = ["uga_f_0_2020.tif", "uga_m_0_2020.tif", "uga_f_1_2020.tif", "uga_m_1_2020.tif"]


class DataPipeline:
    def __init__(self) -> None:
        self.country = config.DEFAULT_COUNTRY
        self.df: pd.DataFrame = pd.DataFrame()
        self.load()

    def _path(self, name: str) -> str:
        return str(config.DATA_DIR / name)

    def load(self) -> None:
        """Load the precomputed hexagon table if present (fast path used in
        production), otherwise build it from the raw rasters and cache it."""
        parquet = config.DATA_DIR / "hexagons.parquet"
        if parquet.exists():
            self.df = pd.read_parquet(parquet)
            print(f"[pipeline] loaded {len(self.df)} hexagons from {parquet.name}")
            return
        self.build_from_rasters()
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.df.to_parquet(parquet, index=False)
        print(f"[pipeline] cached -> {parquet.name}")

    def build_from_rasters(self) -> None:
        t0 = time.time()
        print(f"[pipeline] loading boundary + facilities for {self.country} ...")
        boundary = gpd.read_file(self._path("uganda_adm0.geojson")).to_crs(config.GEO_CRS)
        facilities = gpd.read_file(self._path("facilities.geojson")).to_crs(config.GEO_CRS)

        print(f"[pipeline] building H3 cells at res {config.H3_RES} ...")
        cells = ops.build_h3_cells(boundary, config.H3_RES)
        print(f"[pipeline]   {len(cells)} cells")

        print("[pipeline] flood zonal stats (rp10/rp100/rp500) ...")
        risk = {}
        depth_max = {}
        for horizon, raster in config.TIME_HORIZON_TO_RASTER.items():
            fr = ops.flood_risk_for_raster(cells, self._path(raster))
            risk[horizon] = fr["flood_risk"].values
            depth_max[horizon] = fr["flood_depth_max_m"].values

        print("[pipeline] population (WorldPop under-5 x4) ...")
        pop_u5 = ops.population_under5(cells, [self._path(f) for f in WORLDPOP_U5])

        print("[pipeline] facility metrics ...")
        fac = ops.facility_metrics(cells, facilities)

        df = pd.DataFrame({
            "h3_id": cells["h3_id"].values,
            "lat": cells["lat"].values,
            "lng": cells["lng"].values,
            "flood_risk_4h": risk["4h"],
            "flood_risk_20h": risk["20h"],
            "flood_risk_7d": risk["7d"],
            "flood_depth_max_m": depth_max["20h"],
            "population_u5": np.round(pop_u5).astype(int),
            "nearby_schools": fac["nearby_schools"].values,
            "nearby_clinics": fac["nearby_clinics"].values,
            "nearest_clinic_m": fac["nearest_clinic_m"].values,
        })
        df["country"] = self.country
        df["uncertainty"] = config.OVERALL_UNCERTAINTY

        # Keep only flood-affected cells (any horizon has risk > 0). This keeps the
        # map a crisp flood story -- the river corridors light up -- instead of
        # blanketing the whole country in thousands of empty hexes, and makes
        # "children at risk" mean children inside flood zones.
        keep = df[["flood_risk_4h", "flood_risk_20h", "flood_risk_7d"]].max(axis=1) > 0.0
        self.df = df[keep].reset_index(drop=True)
        print(f"[pipeline] done: {len(self.df)} non-empty cells in {time.time()-t0:.1f}s")

    # ---- query helpers -------------------------------------------------
    def hexagons(self, country: str, time_horizon: str) -> pd.DataFrame:
        col = f"flood_risk_{time_horizon}"
        sub = self.df[self.df["country"] == country].copy()
        sub["flood_risk"] = sub[col]
        return sub.sort_values("flood_risk", ascending=False)

    def stats(self, country: str) -> dict:
        sub = self.df[self.df["country"] == country]
        return {
            "country": country,
            "total_hexagons": int(len(sub)),
            "children_at_risk": int(sub["population_u5"].sum()),
            "avg_flood_risk": float(sub["flood_risk_4h"].mean() or 0.0),
            "high_risk_hexagons": int((sub["flood_risk_4h"] > config.DECISION_THRESHOLD).sum()),
        }

    def cell(self, h3_id: str) -> dict | None:
        row = self.df[self.df["h3_id"] == h3_id]
        if row.empty:
            return None
        return row.iloc[0].to_dict()
