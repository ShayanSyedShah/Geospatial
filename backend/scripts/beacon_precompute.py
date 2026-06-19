"""BEACON Phase 0 — precompute the Sirajganj flood "what-if" bundle.

Connected-bathtub inundation on a bare-earth-ish DEM, seeded from the Jamuna's
low channel, at a stack of water levels. For each level we store the flood
extent polygon and an impact lookup (children under-5, schools, clinics — total
and per upazila). Plus zone boundaries and a cached UNICEF statistic.

Output (static, instant + offline-ready): frontend/public/beacon/
  zones.geojson, inundation/level_{cm}.geojson, impact.json, unicef.json

Run: python backend/scripts/beacon_precompute.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import scipy.ndimage as ndi
from rasterio.features import shapes
from rasterio.mask import mask as rio_mask
from rasterstats import zonal_stats
from shapely.geometry import MultiPolygon
from shapely.geometry import shape as shp_shape
from shapely.ops import unary_union
from shapely.validation import make_valid

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
OUT = HERE.parent.parent / "frontend" / "public" / "beacon"

DISTRICT = "Sirajganj"
# The slider is an ABSOLUTE water-surface level (m). At Sirajganj the Jamuna sits
# ~6-7m, populated floodplain ~9-15m, FFWC danger level ~13m, extreme (1998) ~15m.
LEVELS_M = [round(6.5 + 0.5 * i, 1) for i in range(0, 20)]  # 6.5 .. 16.0 m
NORMAL_M = 7.0
DANGER_M = 13.0
WP = [f"bgd_{s}_{a}_2020.tif" for s in ("f", "m") for a in (0, 1)]  # under-5 grids


def _district_geom():
    adm2 = gpd.read_file(DATA / "bgd_adm2.geojson").to_crs(4326)
    row = adm2[adm2["shapeName"].str.contains("Siraj", case=False, na=False)]
    return row.geometry.union_all(), tuple(row.total_bounds)


def _upazilas(district_geom):
    adm3 = gpd.read_file(DATA / "bgd_adm3.geojson").to_crs(4326)
    name_col = "shapeName" if "shapeName" in adm3.columns else adm3.columns[0]
    sub = adm3[adm3.geometry.representative_point().within(district_geom)].copy()
    if sub.empty:  # fallback: intersect
        sub = adm3[adm3.geometry.intersects(district_geom)].copy()
    sub = sub.rename(columns={name_col: "name"})[["name", "geometry"]].reset_index(drop=True)
    return sub


def _clip_dem(district_geom):
    with rasterio.open(DATA / "srj_dem_src.tif") as src:
        arr, transform = rio_mask(src, [district_geom.__geo_interface__], crop=True, filled=True, nodata=-9999)
        nodata = -9999
    elev = arr[0].astype("float32")
    elev[elev == nodata] = np.nan
    return elev, transform


def _u5_sum_array(district_geom):
    """Combined under-5 people-per-pixel array (WorldPop) clipped to the district."""
    total, transform = None, None
    for name in WP:
        with rasterio.open(DATA / name) as src:
            a, transform = rio_mask(src, [district_geom.__geo_interface__], crop=True, filled=True, nodata=0)
            a = a[0].astype("float32")
            a[a < 0] = 0
            total = a if total is None else total + a
    return total, transform


def _round(o, nd=4):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, (list, tuple)):
        return [_round(x, nd) for x in o]
    if isinstance(o, dict):
        return {k: _round(v, nd) for k, v in o.items()}
    return o


UA = {"User-Agent": "beacon/1.0 (UN Tech Over 2026 hackathon)"}


def fetch_unicef():
    """Real, citable UNICEF under-5 mortality for Bangladesh (SDMX, zero-auth)."""
    url = ("https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/"
           "UNICEF,CME,1.0/BGD.CME_MRY0T4..?format=csv&startPeriod=2018")
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            rows = list(csv.DictReader(io.StringIO(r.read().decode())))
        tot = [x for x in rows if x.get("SEX") in ("_T", "Total", "")] or rows
        latest = max(tot, key=lambda x: x.get("TIME_PERIOD", "0"))
        out = {
            "indicator": "Under-five mortality rate (deaths per 1,000 live births)",
            "country": "Bangladesh",
            "value": float(latest["OBS_VALUE"]),
            "year": int(float(latest["TIME_PERIOD"])),
            "ci_low": float(latest["LOWER_BOUND"]) if latest.get("LOWER_BOUND") else None,
            "ci_high": float(latest["UPPER_BOUND"]) if latest.get("UPPER_BOUND") else None,
            "source": "UNICEF Data Warehouse, Child Mortality (CME) dataflow / UN IGME",
            "url": "https://sdmx.data.unicef.org",
        }
        (OUT / "unicef.json").write_text(json.dumps(out))
        print(f"[beacon] UNICEF U5MR Bangladesh = {out['value']} ({out['year']}) "
              f"CI {out['ci_low']}-{out['ci_high']}")
    except Exception as e:
        print(f"[beacon] WARN unicef fetch failed: {e}")


def fetch_buildings(bbox):
    """OSM building footprints for the demo town area (for 3D fill-extrusion)."""
    w, s, e, n = bbox
    q = f"""[out:json][timeout:120];(way["building"]({s},{w},{n},{e}););out geom;"""
    try:
        req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                     data=q.encode(), headers=UA)
        with urllib.request.urlopen(req, timeout=180) as r:
            els = json.loads(r.read().decode()).get("elements", [])
        feats = []
        for el in els:
            g = el.get("geometry")
            if not g or len(g) < 4:
                continue
            ring = [[p["lon"], p["lat"]] for p in g]
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            tags = el.get("tags", {})
            lv = tags.get("building:levels")
            try:
                h = float(lv) * 3.0 if lv else 6.0
            except ValueError:
                h = 6.0
            feats.append({"type": "Feature", "properties": {"height": h},
                          "geometry": {"type": "Polygon", "coordinates": [ring]}})
        (OUT / "buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
        print(f"[beacon] OSM buildings: {len(feats)}")
    except Exception as e:
        print(f"[beacon] WARN buildings fetch failed: {e}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "inundation").mkdir(exist_ok=True)
    print(f"[beacon] district={DISTRICT}")
    dgeom, bounds = _district_geom()
    print(f"[beacon] bounds={tuple(round(b,3) for b in bounds)}")

    upz = _upazilas(dgeom)
    print(f"[beacon] upazilas: {len(upz)} -> {list(upz['name'])}")

    elev, transform = _clip_dem(dgeom)
    valid = elev[~np.isnan(elev)]
    fill = np.where(np.isnan(elev), 1e6, elev)
    seed = np.unravel_index(np.argmin(fill), fill.shape)  # lowest cell = river channel
    print(f"[beacon] DEM {elev.shape} range {valid.min():.1f}..{valid.max():.1f}m  (water levels {LEVELS_M[0]}..{LEVELS_M[-1]}m)")

    # under-5 population grid
    u5, u5_tf = _u5_sum_array(dgeom)
    print(f"[beacon] under-5 total in district ~ {int(np.nansum(u5)):,}")

    # facilities within the district
    fac = gpd.read_file(DATA / "bgd_facilities.geojson").to_crs(4326)
    fac = fac[fac.geometry.within(dgeom)].reset_index(drop=True)
    schools = fac[fac["type"] == "school"]
    clinics = fac[fac["type"] == "clinic"]
    print(f"[beacon] facilities in district: {len(schools)} schools, {len(clinics)} clinics")

    MIN_CELLS = 150  # drop isolated pits (~0.13 km2) but keep the floodplain
    impact = {"levels": LEVELS_M, "normal": NORMAL_M, "danger": DANGER_M, "byLevel": {}}
    for lv in LEVELS_M:
        we = lv  # slider value IS the absolute water-surface elevation
        flooded = fill < we
        lab, n = ndi.label(flooded)
        if n:
            sizes = np.bincount(lab.ravel())
            small = np.where(sizes < MIN_CELLS)[0]
            flooded[np.isin(lab, small[small > 0])] = False  # remove speckle
        depth = np.where(flooded, we - elev, np.nan)

        # vectorize the flood extent
        polys = [shp_shape(g) for g, v in shapes(flooded.astype("uint8"), mask=flooded, transform=transform) if v == 1]
        if polys:
            g = make_valid(unary_union(polys).buffer(0).simplify(0.004, preserve_topology=False))
            keep = [p for p in (g.geoms if g.geom_type.startswith("Multi") or g.geom_type == "GeometryCollection" else [g])
                    if p.geom_type == "Polygon" and p.area > 2e-5]
            geom = (MultiPolygon(keep) if len(keep) > 1 else keep[0]) if keep else None
        else:
            geom = None
        gj = _round({"type": "Feature", "properties": {}, "geometry": geom.__geo_interface__}) if geom else {"type": "FeatureCollection", "features": []}
        (OUT / "inundation" / f"level_{int(lv*100)}.geojson").write_text(json.dumps(gj))

        # impact: children u5 (zonal sum over flood polygon), schools/clinics inside
        if geom is None or geom.is_empty:
            total = {"childrenU5": 0, "schools": 0, "clinics": 0, "maxDepth": 0.0}
            zones = []
        else:
            ch = zonal_stats([geom], u5, affine=u5_tf, stats=["sum"], nodata=0)[0]["sum"] or 0
            s_in = int(schools.within(geom).sum())
            c_in = int(clinics.within(geom).sum())
            total = {"childrenU5": int(round(ch)), "schools": s_in, "clinics": c_in,
                     "maxDepth": round(float(np.nanmax(depth)) if np.isfinite(depth).any() else 0.0, 1)}
            zones = []
            for _, z in upz.iterrows():
                try:
                    zfl = z.geometry.buffer(0).intersection(geom)
                except Exception:
                    zfl = geom.intersection(z.geometry.buffer(0).buffer(1e-9))
                if zfl.is_empty:
                    zones.append({"name": z["name"], "childrenU5": 0, "schools": 0, "clinics": 0, "meanDepth": 0.0})
                    continue
                zch = zonal_stats([zfl], u5, affine=u5_tf, stats=["sum"], nodata=0)[0]["sum"] or 0
                zmd = zonal_stats([zfl], depth, affine=transform, stats=["mean"], nodata=np.nan)[0]["mean"]
                zones.append({
                    "name": z["name"],
                    "childrenU5": int(round(zch)),
                    "schools": int(schools.within(zfl).sum()),
                    "clinics": int(clinics.within(zfl).sum()),
                    "meanDepth": round(float(zmd) if zmd is not None else 0.0, 1),
                })
            zones.sort(key=lambda r: r["childrenU5"], reverse=True)
        impact["byLevel"][str(lv)] = {"waterElev": round(we, 1), "total": total, "zones": zones}
        print(f"[beacon] level {lv:>4}m  children={total['childrenU5']:>7,}  schools={total['schools']:>3}  clinics={total['clinics']:>3}")

    (OUT / "impact.json").write_text(json.dumps(impact))

    # zone boundaries + static context (nearest-clinic distance handled client-side)
    upz.to_file(OUT / "zones.geojson", driver="GeoJSON")

    # facilities (for markers + evidence popups)
    fac[["name", "type", "geometry"]].to_file(OUT / "facilities.geojson", driver="GeoJSON")

    fetch_unicef()
    fetch_buildings((89.66, 24.41, 89.74, 24.47))  # Sirajganj Sadar town (3D demo area)

    print(f"[beacon] wrote bundle -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
