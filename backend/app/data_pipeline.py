"""Load datasets once and aggregate everything onto H3 hexagons, per country.

The result is a plain pandas DataFrame held in memory (no DuckDB needed at this
scale). One row per H3 cell: risk per time horizon, under-5 population, facility
metrics, and the ADM2 district it falls in.
"""
from __future__ import annotations

import time

import geopandas as gpd
import numpy as np
import pandas as pd

from . import config, spatial_operations as ops


class DataPipeline:
    def __init__(self) -> None:
        self.df: pd.DataFrame = pd.DataFrame()
        self.facilities: pd.DataFrame = pd.DataFrame()
        self.load()

    def _path(self, name: str) -> str:
        return str(config.DATA_DIR / name)

    def load(self) -> None:
        """Load the precomputed tables if present (fast path used in production),
        otherwise build them from the raw rasters and cache."""
        parquet = config.DATA_DIR / "hexagons.parquet"
        fac_parquet = config.DATA_DIR / "facilities.parquet"
        if parquet.exists() and fac_parquet.exists():
            self.df = pd.read_parquet(parquet)
            self.facilities = pd.read_parquet(fac_parquet)
            print(f"[pipeline] loaded {len(self.df)} hexagons + {len(self.facilities)} "
                  f"facilities ({self.df['country'].nunique()} countries) from parquet")
            return
        hex_frames, fac_frames = [], []
        for c in config.SUPPORTED_COUNTRIES:
            h, f = self.build_country(c)
            hex_frames.append(h)
            fac_frames.append(f)
        self.df = pd.concat(hex_frames, ignore_index=True)
        self.facilities = pd.concat(fac_frames, ignore_index=True)
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.df.to_parquet(parquet, index=False)
        self.facilities.to_parquet(fac_parquet, index=False)
        print(f"[pipeline] cached -> {parquet.name}, {fac_parquet.name}")

    def build_country(self, country: str):
        cfg = config.COUNTRIES[country]
        prefix = cfg["prefix"]
        t0 = time.time()
        print(f"[pipeline] {country}: boundary + facilities + districts ...")
        boundary = gpd.read_file(self._path(f"{prefix}_adm0.geojson")).to_crs(config.GEO_CRS)
        facilities = gpd.read_file(self._path(f"{prefix}_facilities.geojson")).to_crs(config.GEO_CRS)
        adm2 = gpd.read_file(self._path(f"{prefix}_adm2.geojson")).to_crs(config.GEO_CRS)

        cells = ops.build_h3_cells(boundary, config.H3_RES)
        print(f"[pipeline]   {len(cells)} cells")

        # Combine riverine (JRC) + coastal (Aqueduct) hazard per tier (max depth).
        risk, depth_max = {}, {}
        for horizon in config.TIME_HORIZON_TO_RASTER:
            fr = ops.flood_risk_combined(
                cells,
                self._path(config.TIME_HORIZON_TO_RASTER[horizon]),
                self._path(config.COASTAL_HORIZON_TO_RASTER[horizon]),
            )
            risk[horizon] = fr["flood_risk"].values
            depth_max[horizon] = fr["flood_depth_max_m"].values

        pop_u5 = ops.population_under5(cells, [self._path(f) for f in config.worldpop_under5(prefix)])
        fac_metrics = ops.facility_metrics(cells, facilities)
        district = ops.assign_districts(cells, adm2)

        df = pd.DataFrame({
            "h3_id": cells["h3_id"].values,
            "lat": cells["lat"].values,
            "lng": cells["lng"].values,
            "flood_risk_4h": risk["4h"],
            "flood_risk_20h": risk["20h"],
            "flood_risk_7d": risk["7d"],
            "flood_depth_max_m": depth_max["7d"],
            "population_u5": np.round(pop_u5).astype(int),
            "nearby_schools": fac_metrics["nearby_schools"].values,
            "nearby_clinics": fac_metrics["nearby_clinics"].values,
            "nearest_clinic_m": fac_metrics["nearest_clinic_m"].values,
            "district": district.values,
        })
        df["country"] = country
        df["uncertainty"] = config.OVERALL_UNCERTAINTY
        keep = df[["flood_risk_4h", "flood_risk_20h", "flood_risk_7d"]].max(axis=1) > 0.0
        out = df[keep].reset_index(drop=True)

        # Facility table: each school/clinic flagged at_risk by the most-severe
        # combined tier (rp500 riverine + coastal) sampled at its point.
        fr_rasters = [self._path(config.TIME_HORIZON_TO_RASTER["7d"]),
                      self._path(config.COASTAL_HORIZON_TO_RASTER["7d"])]
        frisk = ops.sample_facility_risk(facilities, fr_rasters)
        fac_district = ops.assign_districts(facilities, adm2)
        fac_df = pd.DataFrame({
            "name": facilities.get("name", pd.Series([""] * len(facilities))).fillna("").values,
            "type": facilities["type"].values,
            "lat": facilities.geometry.y.values,
            "lng": facilities.geometry.x.values,
            "risk": frisk["risk"].values.round(3),
            "at_risk": frisk["at_risk"].values,
            "district": fac_district.values,
        })
        fac_df["country"] = country
        fac_df = fac_df.reset_index(drop=True)
        fac_df["id"] = country[:3].lower() + "-" + fac_df.index.astype(str)

        print(f"[pipeline]   {country}: {len(out)} flood cells, {len(fac_df)} facilities "
              f"({int(fac_df['at_risk'].sum())} at risk) in {time.time()-t0:.1f}s")
        return out, fac_df

    # ---- query helpers -------------------------------------------------
    def hexagons(self, country: str, district: str | None = None) -> pd.DataFrame:
        sub = self.df[self.df["country"] == country]
        if district and district != "All":
            sub = sub[sub["district"] == district]
        return sub.sort_values("flood_risk_7d", ascending=False)

    def stats(self, country: str) -> dict:
        sub = self.df[self.df["country"] == country]
        return {
            "country": country,
            "total_hexagons": int(len(sub)),
            "children_at_risk": int(sub["population_u5"].sum()),
            "avg_flood_risk": float(sub["flood_risk_7d"].mean() or 0.0),
            "high_risk_hexagons": int((sub["flood_risk_7d"] > config.DECISION_THRESHOLD).sum()),
        }

    def regions(self, country: str) -> list[dict]:
        """Per-district aggregates for the left-panel ranked list."""
        sub = self.df[self.df["country"] == country]
        rows = []
        for name, g in sub.groupby("district"):
            rows.append({
                "district": str(name),
                "hexagons": int(len(g)),
                "children_at_risk": int(g["population_u5"].sum()),
                "max_risk": float(g["flood_risk_7d"].max()),
                "avg_risk": float(g["flood_risk_7d"].mean()),
                "high_risk_hexagons": int((g["flood_risk_7d"] > config.DECISION_THRESHOLD).sum()),
                "lat": float(g["lat"].mean()),
                "lng": float(g["lng"].mean()),
            })
        rows.sort(key=lambda r: (r["high_risk_hexagons"], r["children_at_risk"]), reverse=True)
        return rows

    def cell(self, h3_id: str) -> dict | None:
        row = self.df[self.df["h3_id"] == h3_id]
        return None if row.empty else row.iloc[0].to_dict()

    def facilities_for(self, country: str, district: str | None = None) -> pd.DataFrame:
        sub = self.facilities[self.facilities["country"] == country]
        if district and district != "All":
            sub = sub[sub["district"] == district]
        return sub
