"""Fetch the real Barak / Surma / Kushiyara river geometry from OpenStreetMap
(Overpass) and write a small GeoJSON for the 2022 Sylhet reconstruction."""
import json, os, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "frontend", "public", "data", "sylhet_2022", "rivers.geojson")

# bbox covers the Barak (Assam, east) splitting into Surma + Kushiyara into Sylhet
QUERY = """
[out:json][timeout:60];
(
  way["waterway"="river"]["name"~"Surma|Kushiyara|Barak|Kushiara",i](24.0,90.8,25.6,93.3);
);
out geom;
"""
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=data, headers={"User-Agent": "BEACON-sylhet/1.0"})
            print("querying", ep, flush=True)
            return json.load(urllib.request.urlopen(req, timeout=90))
        except Exception as e:
            print("  failed:", e, flush=True)
    raise SystemExit("all Overpass endpoints failed")

js = fetch()
feats = []
names = {}
for el in js.get("elements", []):
    if el.get("type") != "way" or "geometry" not in el:
        continue
    name = el.get("tags", {}).get("name", "river")
    coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
    if len(coords) < 2:
        continue
    # crude flow order: Barak (upstream) = 0, Surma/Kushiyara = 1
    order = 0 if "barak" in name.lower() else 1
    feats.append({
        "type": "Feature",
        "properties": {"name": name, "flow_order": order},
        "geometry": {"type": "LineString", "coordinates": coords},
    })
    names[name] = names.get(name, 0) + 1

fc = {"type": "FeatureCollection", "features": feats}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(fc, f)
print(f"WROTE {OUT}  {len(feats)} segments  {os.path.getsize(OUT)/1024:.0f} KB", flush=True)
print("rivers:", dict(names), flush=True)
