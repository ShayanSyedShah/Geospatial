"""
Download all Uganda datasets for the Flood Risk Map backend.

Uses only the Python standard library so it can run before the backend deps
are installed. Writes everything into backend/data/.

Datasets (all open, no auth):
  1. JRC Global Flood Hazard maps (GloFAS/LISFLOOD lineage) - return periods
     rp10/rp100/rp500. Global ~1km GeoTIFFs; clipped to Uganda at load time.
  2. WorldPop 2020 age/sex structures for Uganda - the four under-5 grids
     (f_0, m_0, f_1, m_1). Summed at load time = real under-5 population.
  3. geoBoundaries Uganda ADM0 (simplified) GeoJSON - country boundary.
  4. Facilities (schools + clinics) via the OSM Overpass API - keyless.
     We cite Giga (schools) and Healthsites/OSM (clinics) in the evidence panel.

Run:  python backend/scripts/download_data.py
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(HERE, "..", "data"))
RAW_DIR = os.path.join(DATA_DIR, "_raw")

JRC_BASE = "https://cidportal.jrc.ec.europa.eu/ftp/jrc-opendata/FLOODS/GlobalMaps"
JRC_RETURN_PERIODS = ["rp10y", "rp100y", "rp500y"]

WORLDPOP_BASE = "https://data.worldpop.org/GIS/AgeSex_structures/Global_2000_2020/2020/UGA"
WORLDPOP_U5_FILES = ["uga_f_0_2020", "uga_m_0_2020", "uga_f_1_2020", "uga_m_1_2020"]

GEOBOUNDARIES_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/"
    "gbOpen/UGA/ADM0/geoBoundaries-UGA-ADM0_simplified.geojson"
)

# Uganda OSM relation 192796 -> Overpass area id 3600192796
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OVERPASS_QUERY = """
[out:json][timeout:180];
area(3600192796)->.ug;
(
  node["amenity"="school"](area.ug);
  node["amenity"="hospital"](area.ug);
  node["amenity"="clinic"](area.ug);
  node["amenity"="doctors"](area.ug);
  node["healthcare"](area.ug);
);
out center;
"""

UA = {"User-Agent": "flood-risk-map/1.0 (UN Tech Over 2026 hackathon)"}


def _download(url, dest, desc):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  [skip] {desc} already present ({os.path.getsize(dest)//1024} KB)")
        return dest
    print(f"  [get ] {desc}\n         {url}")
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        total = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
            sys.stdout.write(f"\r         {total/1e6:.1f} MB")
            sys.stdout.flush()
    sys.stdout.write("\n")
    os.replace(tmp, dest)
    return dest


def get_flood_hazard():
    print("1) JRC flood hazard maps (rp10/rp100/rp500)")
    for rp in JRC_RETURN_PERIODS:
        zip_path = os.path.join(RAW_DIR, f"floodMapGL_{rp}.zip")
        out_tif = os.path.join(DATA_DIR, f"flood_{rp}.tif")
        if os.path.exists(out_tif) and os.path.getsize(out_tif) > 0:
            print(f"  [skip] flood_{rp}.tif present")
            continue
        try:
            _download(f"{JRC_BASE}/floodMapGL_{rp}.zip", zip_path, f"floodMapGL_{rp}.zip")
            with zipfile.ZipFile(zip_path) as z:
                tif_name = next(n for n in z.namelist() if n.lower().endswith(".tif"))
                with z.open(tif_name) as src, open(out_tif, "wb") as dst:
                    dst.write(src.read())
            print(f"  [ok  ] -> flood_{rp}.tif")
        except Exception as e:
            print(f"  [FAIL] {rp}: {e}")


def get_worldpop():
    print("2) WorldPop under-5 grids (4 files, ~99 MB each)")
    for name in WORLDPOP_U5_FILES:
        dest = os.path.join(DATA_DIR, f"{name}.tif")
        try:
            _download(f"{WORLDPOP_BASE}/{name}.tif", dest, f"{name}.tif")
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")


def get_boundary():
    print("3) Uganda ADM0 boundary (geoBoundaries simplified)")
    dest = os.path.join(DATA_DIR, "uganda_adm0.geojson")
    try:
        _download(GEOBOUNDARIES_URL, dest, "uganda_adm0.geojson")
    except Exception as e:
        print(f"  [FAIL] boundary: {e}")


def get_facilities():
    print("4) Facilities (schools + clinics) via OSM Overpass")
    dest = os.path.join(DATA_DIR, "facilities.geojson")
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print("  [skip] facilities.geojson present")
        return
    data = OVERPASS_QUERY.encode("utf-8")
    elements = None
    for ep in OVERPASS_ENDPOINTS:
        try:
            print(f"  [get ] querying {ep}")
            req = urllib.request.Request(ep, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=200) as r:
                elements = json.loads(r.read().decode("utf-8")).get("elements", [])
            break
        except Exception as e:
            print(f"  [warn] {ep} failed: {e}")
            time.sleep(2)
    if not elements:
        print("  [FAIL] Overpass returned nothing.")
        return

    features = []
    for el in elements:
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        amenity = tags.get("amenity", "")
        if amenity == "school":
            ftype = "school"
        elif amenity in ("hospital", "clinic", "doctors") or "healthcare" in tags:
            ftype = "clinic"
        else:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": tags.get("name", ""),
                "type": ftype,
                "amenity": amenity or tags.get("healthcare", ""),
            },
        })
    fc = {"type": "FeatureCollection", "features": features}
    with open(dest, "w") as f:
        json.dump(fc, f)
    n_school = sum(1 for x in features if x["properties"]["type"] == "school")
    n_clinic = sum(1 for x in features if x["properties"]["type"] == "clinic")
    print(f"  [ok  ] facilities.geojson: {n_school} schools, {n_clinic} clinics")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    print(f"Downloading into {DATA_DIR}\n")
    get_boundary()
    get_facilities()
    get_flood_hazard()
    get_worldpop()
    print("\nDone.")


if __name__ == "__main__":
    main()
