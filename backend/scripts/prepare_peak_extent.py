#!/usr/bin/env python3
"""Prepare the 18 June 2022 PEAK flood extent polygon for the Sylhet 2022 story.

Context
-------
UNOSAT measured roughly 840 km2 flooded in the analyzed Sylhet/Sunamganj area by
18 June 2022, the catastrophic peak of the event. The raw 18 June SAR-derived
polygon was too dense to convert/ship through the local geopandas/pyogrio path,
so only the *figure* (840 km2) was shown, not a browser polygon.

No raw 18 June source polygon exists anywhere in this repo (verified). So this
script DERIVES a defensible peak extent from the real, shipped 25 May UNOSAT
observed polygon (flood_extent_2022-05-25.geojson, ~412 km2) by growing it
outward (buffer + union) until its area matches the documented ~840 km2 peak,
then simplifying it for the browser.

This is explicitly a DERIVED APPROXIMATION, not a raw observation. Every output
feature carries properties that say so, plus real provenance (UNOSAT, the
840 km2 peak figure). The frontend should keep the 25 May polygon as the
"observed" evidence layer and present this 18 June layer as a derived peak
illustration calibrated to the UNOSAT area figure.

Run with the backend venv:
    backend/venv/bin/python backend/scripts/prepare_peak_extent.py
"""
import json
from pathlib import Path

import geopandas as gpd
from shapely.ops import unary_union

# --- paths (script lives in backend/scripts/) ---
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "frontend" / "public" / "data" / "sylhet_2022"
SRC = DATA_DIR / "flood_extent_2022-05-25.geojson"
OUT = DATA_DIR / "flood_extent_2022-06-18.geojson"

# --- documented peak figure (UNOSAT) ---
PEAK_KM2 = 840.0          # UNOSAT measured ~840 km2 flooded by 18 Jun 2022
TARGET_TOLERANCE = 0.03   # accept within 3% of the target area

# UTM 46N (metres) for area-correct ops over Sylhet, then back to WGS84/CRS84.
METRIC_CRS = 32646
WGS84 = 4326

# Simplification tolerance in degrees (~110 m). Keeps the file small while
# preserving the broad peak shape; this is an approximation anyway.
SIMPLIFY_TOL_DEG = 0.0012

# Provenance / honesty fields stamped on every output feature.
DERIVED_NOTE = (
    "DERIVED APPROXIMATION, not a raw observation. Grown from the UNOSAT "
    "2022-05-25 observed polygon and calibrated to the UNOSAT ~840 km2 peak "
    "figure for 2022-06-18. The full 18 June SAR polygon was not shipped."
)
PROVENANCE = {
    "date": "2022-06-18",
    "kind": "derived_peak_extent",
    "derived_from": "flood_extent_2022-05-25.geojson (UNOSAT observed)",
    "peak_area_km2_target": PEAK_KM2,
    "source": "UNOSAT (UNITAR) flood analysis, Sylhet/Sunamganj, June 2022",
    "publisher": "UNOSAT / UNITAR",
    "note": DERIVED_NOTE,
}


def calibrate_buffer(metric_geom, target_m2):
    """Find a buffer distance (m) that grows the union to ~target_m2.

    Simple monotone bisection: buffering by a positive distance is monotone in
    area, so we bracket and bisect on the buffer distance.
    """
    lo, hi = 0.0, 5000.0  # metres; 5 km is far more than enough to double area

    def area_at(dist):
        return unary_union(metric_geom.buffer(dist)).area

    a_hi = area_at(hi)
    if a_hi < target_m2:
        # Shouldn't happen for these areas, but stay safe: widen the bracket.
        hi = 15000.0
        a_hi = area_at(hi)

    best_dist, best_area = hi, a_hi
    for _ in range(40):
        mid = (lo + hi) / 2.0
        a_mid = area_at(mid)
        if abs(a_mid - target_m2) < abs(best_area - target_m2):
            best_dist, best_area = mid, a_mid
        if a_mid < target_m2:
            lo = mid
        else:
            hi = mid
        if abs(a_mid - target_m2) / target_m2 < TARGET_TOLERANCE:
            best_dist, best_area = mid, a_mid
            break
    return best_dist, best_area


def main():
    if not SRC.exists():
        raise SystemExit(f"Source not found: {SRC}")

    src = gpd.read_file(SRC)
    print(f"loaded {len(src)} features from {SRC.name} (crs={src.crs})")

    metric = src.to_crs(METRIC_CRS)
    base_union = unary_union(metric.geometry.values)
    base_km2 = base_union.area / 1e6
    print(f"25 May observed area: {base_km2:.1f} km2")

    target_m2 = PEAK_KM2 * 1e6
    dist, grown_area = calibrate_buffer(metric, target_m2)
    print(f"calibrated buffer: {dist:.0f} m -> {grown_area/1e6:.1f} km2 "
          f"(target {PEAK_KM2:.0f} km2)")

    grown = unary_union(metric.buffer(dist))

    # Back to WGS84, then simplify in degrees to shrink the file.
    grown_wgs = gpd.GeoSeries([grown], crs=METRIC_CRS).to_crs(WGS84).iloc[0]
    simplified = grown_wgs.simplify(SIMPLIFY_TOL_DEG, preserve_topology=True)

    # Final area check (in metric) after simplification.
    final_m2 = (
        gpd.GeoSeries([simplified], crs=WGS84).to_crs(METRIC_CRS).iloc[0].area
    )
    final_km2 = final_m2 / 1e6
    print(f"after simplify(tol={SIMPLIFY_TOL_DEG} deg): {final_km2:.1f} km2")

    # Explode multipolygon -> polygon features so the schema matches the
    # 25 May file (which is a FeatureCollection of Polygon features).
    parts = (
        list(simplified.geoms) if simplified.geom_type == "MultiPolygon"
        else [simplified]
    )
    features = []
    for poly in parts:
        if poly.is_empty:
            continue
        features.append({
            "type": "Feature",
            "properties": dict(PROVENANCE),
            "geometry": json.loads(gpd.GeoSeries([poly]).to_json())
            ["features"][0]["geometry"],
        })

    fc = {
        "type": "FeatureCollection",
        "name": "flood_extent_2022-06-18",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }

    # Round coordinates to 4 decimals (matches 25 May file) to keep size down.
    def round_coords(obj):
        if isinstance(obj, list):
            return [round_coords(x) for x in obj]
        if isinstance(obj, float):
            return round(obj, 4)
        return obj

    for f in fc["features"]:
        f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])

    OUT.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}: {len(features)} features, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
