#!/usr/bin/env python3
"""Cut the 6 Sylhet-region ADM2 districts out of the national boundary file and
write them as deconfliction_districts.geojson — the choropleth polygons the
deconfliction protocol paints (gap/status per district). Keeps each district's
real geometry plus a 'shapeName' (and a duplicated 'district' for easy joining
to ProtocolResult targets). Lightly simplifies only if the file would be large.
"""
import json
from pathlib import Path

import geopandas as gpd

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "backend" / "data" / "bgd_adm2.geojson"
OUT = REPO / "frontend" / "public" / "data" / "sylhet_2022" / "deconfliction_districts.geojson"

# The 6 districts of the Sylhet division + neighbouring haor basin carried by the
# 2022 flood, matched on the ADM2 'shapeName' property.
DISTRICTS = {"Sylhet", "Sunamganj", "Maulvibazar", "Habiganj", "Netrakona", "Kishoreganj"}

MAX_BYTES = 400_000  # simplify only if the raw output blows past ~400KB


def serialize(gdf):
    return json.dumps(json.loads(gdf.to_json()), separators=(",", ":"))


def main():
    gdf = gpd.read_file(SRC)
    sub = gdf[gdf["shapeName"].isin(DISTRICTS)].copy()

    missing = DISTRICTS - set(sub["shapeName"])
    if missing:
        raise SystemExit(f"missing districts in source: {sorted(missing)}")

    # Carry only what the map needs: shapeName, plus a 'district' alias for joins.
    sub = sub[["shapeName", "geometry"]].copy()
    sub["district"] = sub["shapeName"]

    payload = serialize(sub)
    if len(payload.encode("utf-8")) > MAX_BYTES:
        # Light topology-preserving-ish simplify in degrees; keep geometries valid.
        sub["geometry"] = sub.geometry.simplify(0.001, preserve_topology=True)
        sub = sub[sub.geometry.is_valid & ~sub.geometry.is_empty].copy()
        payload = serialize(sub)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8")

    print("wrote:", OUT)
    print("features:", len(sub))
    print("bytes:", len(payload.encode("utf-8")))
    print("shapeNames:", sorted(sub["shapeName"]))
    print("all valid:", bool(sub.geometry.is_valid.all()))


if __name__ == "__main__":
    main()
