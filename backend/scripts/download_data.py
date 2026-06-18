"""Download datasets for the Flood Risk Map backend (country-parameterized).

Standard library only, so it runs before the backend deps are installed.
Writes into backend/data/. All sources are open; no API keys.

  python backend/scripts/download_data.py            # all countries
  python backend/scripts/download_data.py Bangladesh # one country
"""
import json
import os
import sys
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(HERE, "..", "data"))
RAW_DIR = os.path.join(DATA_DIR, "_raw")
UA = {"User-Agent": "flood-risk-map/1.0 (UN Tech Over 2026 hackathon)"}

# Flood hazard is global (shared by all countries) -> downloaded once.
JRC_BASE = "https://cidportal.jrc.ec.europa.eu/ftp/jrc-opendata/FLOODS/GlobalMaps"
JRC_RETURN_PERIODS = ["rp10y", "rp100y", "rp500y"]

WORLDPOP_BASE = "https://data.worldpop.org/GIS/AgeSex_structures/Global_2000_2020/2020"
GEOBOUNDARIES = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen"
OVERPASS = "https://overpass-api.de/api/interpreter"

COUNTRIES = {
    "Uganda":     {"iso": "UGA", "wp": "uga", "osm_area": 3600192796},
    "Bangladesh": {"iso": "BGD", "wp": "bgd", "osm_area": 3600184640},
}


def _download(url, dest, desc):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  [skip] {desc} ({os.path.getsize(dest)//1024} KB)")
        return dest
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)
    print(f"  [ok  ] {desc} ({os.path.getsize(dest)//1024} KB)")
    return dest


def get_flood_hazard():
    print("Flood hazard (JRC rp10/rp100/rp500, global)")
    for rp in JRC_RETURN_PERIODS:
        out = os.path.join(DATA_DIR, f"flood_{rp}.tif")
        if os.path.exists(out):
            print(f"  [skip] flood_{rp}.tif")
            continue
        zp = os.path.join(RAW_DIR, f"floodMapGL_{rp}.zip")
        _download(f"{JRC_BASE}/floodMapGL_{rp}.zip", zp, f"floodMapGL_{rp}.zip")
        with zipfile.ZipFile(zp) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".tif"))
            with z.open(name) as s, open(out, "wb") as d:
                d.write(s.read())
        print(f"  [ok  ] -> flood_{rp}.tif")


def get_boundaries(country, cfg):
    iso = cfg["iso"]
    for adm in ("ADM0", "ADM2"):
        url = f"{GEOBOUNDARIES}/{iso}/{adm}/geoBoundaries-{iso}-{adm}_simplified.geojson"
        dest = os.path.join(DATA_DIR, f"{cfg['wp']}_{adm.lower()}.geojson")
        try:
            _download(url, dest, f"{country} {adm}")
        except Exception as e:
            print(f"  [warn] {country} {adm}: {e}")


def get_worldpop(country, cfg):
    files = [f"{cfg['wp']}_{s}_{a}_2020" for s in ("f", "m") for a in (0, 1)]
    def one(name):
        _download(f"{WORLDPOP_BASE}/{cfg['iso']}/{name}.tif",
                  os.path.join(DATA_DIR, f"{name}.tif"), f"{country} {name}")
    print(f"WorldPop under-5 for {country} (4 files, parallel)")
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(one, files))


def get_facilities(country, cfg):
    dest = os.path.join(DATA_DIR, f"{cfg['wp']}_facilities.geojson")
    if os.path.exists(dest):
        print(f"  [skip] {country} facilities")
        return
    q = f"""
[out:json][timeout:240];
area({cfg['osm_area']})->.a;
(
  node["amenity"="school"](area.a);
  node["amenity"="hospital"](area.a);
  node["amenity"="clinic"](area.a);
  node["amenity"="doctors"](area.a);
  node["healthcare"](area.a);
);
out center;
""".encode()
    print(f"Facilities for {country} via Overpass ...")
    req = urllib.request.Request(OVERPASS, data=q, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        els = json.loads(r.read().decode()).get("elements", [])
    feats = []
    for el in els:
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        a = tags.get("amenity", "")
        if a == "school":
            ft = "school"
        elif a in ("hospital", "clinic", "doctors") or "healthcare" in tags:
            ft = "clinic"
        else:
            continue
        feats.append({"type": "Feature",
                      "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"name": tags.get("name", ""), "type": ft}})
    json.dump({"type": "FeatureCollection", "features": feats}, open(dest, "w"))
    ns = sum(f["properties"]["type"] == "school" for f in feats)
    nc = sum(f["properties"]["type"] == "clinic" for f in feats)
    print(f"  [ok  ] {country} facilities: {ns} schools, {nc} clinics")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    targets = sys.argv[1:] or list(COUNTRIES)
    get_flood_hazard()
    for country in targets:
        cfg = COUNTRIES[country]
        print(f"\n=== {country} ({cfg['iso']}) ===")
        get_boundaries(country, cfg)
        get_facilities(country, cfg)
        get_worldpop(country, cfg)
        time.sleep(1)
    print("\nDone.")


if __name__ == "__main__":
    main()
