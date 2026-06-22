"""Replace OSM facilities with real UN-hosted data for Bangladesh.

Source: OCHA (UN Office for the Coordination of Humanitarian Affairs), Regional
Office for Asia & the Pacific, on HDX (Humanitarian Data Exchange). Underlying
data is the Bangladesh Local Government Engineering Department (LGED) point
registry of every education and health facility.

  Schools : data.humdata.org/dataset/bangladesh-education-facilities-by-lged
  Health  : data.humdata.org/dataset/bangladesh-health-facilities-by-lged

Giga (UNICEF/ITU) does NOT publish Bangladesh, so OCHA's LGED registry is the
correct UN source for this country -- 78k schools vs ~9k from OpenStreetMap.

Flood exposure (`at_risk`) is sampled from the already-computed flood-risk
hexagons (hexagons.parquet), so no raster downloads are needed and the value
chain stays: UN facility point -> precomputed JRC/GloFAS flood risk -> at_risk.

Outputs (Bangladesh only; Uganda rows are preserved untouched):
  backend/data/bgd_facilities.geojson          (UN points, pipeline format)
  backend/data/facilities.parquet              (BGD rows swapped to UN)
  backend/data/un_facilities_source.json       (provenance)
  frontend/public/data/facilities_Bangladesh.json  (API-shape collection)
"""
from __future__ import annotations
import glob
import json
import os
import urllib.request
import zipfile

import geopandas as gpd
import h3
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
RAW = os.path.join(DATA, "raw", "un_facilities")
FRONTEND = os.path.abspath(os.path.join(
    HERE, "..", "..", "frontend", "public", "data"))

EXPOSURE_THRESHOLD = 0.05  # matches config.FLOOD_EXPOSURE_THRESHOLD

SOURCES = {
    "schools": {
        "dataset": "bangladesh-education-facilities-by-lged",
        "url": "https://data.humdata.org/dataset/42908dc9-6a5f-4947-9048-f8f97da749a1/"
               "resource/1dbae83a-7629-461e-8b08-63da519b1ee1/download/"
               "bgd_poi_educationfacilities_lged.zip",
    },
    "health": {
        "dataset": "bangladesh-health-facilities-by-lged",
        "url": "https://data.humdata.org/dataset/80920682-bbb5-421e-b7ac-f89b7b640a5c/"
               "resource/c545d196-bc2c-44ed-9028-316ab080a41c/download/"
               "bgd_poi_healthfacilities_lged.zip",
    },
}
PROVENANCE = {
    "source": "UN OCHA (ROAP) / Bangladesh LGED, via HDX",
    "host": "Humanitarian Data Exchange (data.humdata.org)",
    "agency": "UN Office for the Coordination of Humanitarian Affairs",
    "schools_dataset": "https://data.humdata.org/dataset/bangladesh-education-facilities-by-lged",
    "health_dataset": "https://data.humdata.org/dataset/bangladesh-health-facilities-by-lged",
    "note": "Giga (UNICEF/ITU) does not cover Bangladesh; OCHA/LGED is the UN source for this country.",
}


def _download_and_read(key: str) -> gpd.GeoDataFrame:
    os.makedirs(RAW, exist_ok=True)
    zpath = os.path.join(RAW, f"{key}.zip")
    if not os.path.exists(zpath) or os.path.getsize(zpath) == 0:
        print(f"  downloading {key} from HDX (OCHA/LGED) ...")
        req = urllib.request.Request(SOURCES[key]["url"],
                                     headers={"User-Agent": "beacon-hackathon"})
        with urllib.request.urlopen(req, timeout=180) as r, open(zpath, "wb") as f:
            f.write(r.read())
    outdir = os.path.join(RAW, key)
    zipfile.ZipFile(zpath).extractall(outdir)
    shp = glob.glob(os.path.join(outdir, "**", "*.shp"), recursive=True)[0]
    g = gpd.read_file(shp).to_crs("EPSG:4326")
    return g[g.geometry.notna() & g.geometry.geom_type.eq("Point")]


def _clean_name(v: object, fallback: str) -> str:
    s = "" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v).strip()
    # LGED Bengali names are stored in a legacy encoding (mojibake); keep only
    # clean ASCII-ish names, otherwise fall back to a place label.
    if s and all(ord(c) < 128 for c in s):
        return s.title()
    return fallback


def build() -> None:
    print("Fetching real UN facility data (OCHA / LGED via HDX) ...")
    schools = _download_and_read("schools")
    health = _download_and_read("health")
    print(f"  schools: {len(schools):,} points | health: {len(health):,} points")

    rows = []
    for _, r in schools.iterrows():
        upz = str(r.get("UPZ_NAME") or "").title()
        rows.append({
            "name": _clean_name(r.get("SCH_NAME"), f"School, {upz}" if upz else "School"),
            "type": "school",
            "lat": float(r.geometry.y), "lng": float(r.geometry.x),
            "district": str(r.get("DIST_NAME") or "").title(),
        })
    for _, r in health.iterrows():
        ft = str(r.get("FType") or "Health facility").strip()
        upz = str(r.get("Upazila") or "").strip()
        rows.append({
            "name": f"{ft} - {upz}" if upz else ft,
            "type": "clinic",
            "lat": float(r.geometry.y), "lng": float(r.geometry.x),
            "district": str(r.get("District") or "").strip(),
        })
    fac = pd.DataFrame(rows)
    fac = fac[(fac["lat"].between(20, 27)) & (fac["lng"].between(88, 93))].reset_index(drop=True)
    print(f"  total Bangladesh UN facilities: {len(fac):,}")

    # Sample flood risk from the precomputed hexagons by exact H3 cell; where a
    # facility's cell has no hexagon, fall back to its district's mean risk.
    hx = pd.read_parquet(os.path.join(DATA, "hexagons.parquet"))
    hxb = hx[hx["country"] == "Bangladesh"]
    res = h3.get_resolution(hxb["h3_id"].iloc[0])
    cell_risk = dict(zip(hxb["h3_id"], hxb["flood_risk_7d"]))
    dist_risk = hxb.groupby("district")["flood_risk_7d"].mean().to_dict()

    cells = [h3.latlng_to_cell(la, ln, res) for la, ln in zip(fac["lat"], fac["lng"])]
    exact = np.array([cell_risk.get(c, np.nan) for c in cells])
    fallback = fac["district"].map(dist_risk).to_numpy(dtype=float)
    risk = np.where(np.isnan(exact), np.where(np.isnan(fallback), 0.0, fallback), exact)
    fac["risk"] = np.round(risk, 3)
    fac["at_risk"] = fac["risk"] > EXPOSURE_THRESHOLD
    print(f"  exact-cell matches: {int((~np.isnan(exact)).sum()):,} / {len(fac):,}")
    fac["country"] = "Bangladesh"
    fac["id"] = [f"bgd-{i}" for i in range(len(fac))]
    print(f"  at risk (flood>{EXPOSURE_THRESHOLD}): {int(fac['at_risk'].sum()):,}")

    # 1) GeoJSON in the pipeline's format (for future precompute runs).
    feats = [{"type": "Feature",
              "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
              "properties": {"name": r["name"], "type": r["type"]}}
             for r in fac.to_dict("records")]
    with open(os.path.join(DATA, "bgd_facilities.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)

    # 2) facilities.parquet: swap Bangladesh rows, keep Uganda.
    pq_path = os.path.join(DATA, "facilities.parquet")
    cols = ["name", "type", "lat", "lng", "risk", "at_risk", "district", "country", "id"]
    if os.path.exists(pq_path):
        old = pd.read_parquet(pq_path)
        other = old[old["country"] != "Bangladesh"]
        merged = pd.concat([other, fac[cols]], ignore_index=True)
    else:
        merged = fac[cols]
    merged.to_parquet(pq_path, index=False)

    # 3) Frontend collection (API shape).
    collection = {
        "country": "Bangladesh",
        "count": int(len(fac)),
        "at_risk": int(fac["at_risk"].sum()),
        "source": PROVENANCE["source"],
        "source_url": PROVENANCE["schools_dataset"],
        "facilities": [
            {"id": r["id"], "name": r["name"], "type": r["type"],
             "lat": round(r["lat"], 5), "lng": round(r["lng"], 5),
             "risk": float(r["risk"]), "at_risk": bool(r["at_risk"]),
             "district": r["district"]}
            for r in fac.to_dict("records")
        ],
    }
    os.makedirs(FRONTEND, exist_ok=True)
    with open(os.path.join(FRONTEND, "facilities_Bangladesh.json"), "w", encoding="utf-8") as f:
        json.dump(collection, f)
    with open(os.path.join(DATA, "un_facilities_source.json"), "w", encoding="utf-8") as f:
        json.dump({**PROVENANCE, "schools": int((fac["type"] == "school").sum()),
                   "clinics": int((fac["type"] == "clinic").sum()),
                   "at_risk": int(fac["at_risk"].sum())}, f, indent=2)

    size_mb = os.path.getsize(os.path.join(FRONTEND, "facilities_Bangladesh.json")) / 1e6
    print(f"\nDone. schools={int((fac['type']=='school').sum()):,} "
          f"clinics={int((fac['type']=='clinic').sum()):,} "
          f"at_risk={int(fac['at_risk'].sum()):,}")
    print(f"frontend facilities_Bangladesh.json = {size_mb:.1f} MB")


if __name__ == "__main__":
    build()
