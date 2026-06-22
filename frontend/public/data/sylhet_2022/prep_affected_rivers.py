#!/usr/bin/env python3
"""Fetch the real geometry of every river that carried the 2022 Sylhet flood:
the Barak -> Surma/Kushiyara spine plus the hill flash-flood feeders. Writes
affected_rivers.geojson with each river named and classed as 'main' or 'feeder'
so the map can style + label them as the "rivers at risk" network for step 4.
"""
import json
import urllib.parse
import urllib.request

# Region: Barak coming from Meghalaya (east) across Sylhet/Sunamganj/Moulvibazar/Habiganj.
WEST, SOUTH, EAST, NORTH = 90.90, 24.10, 93.30, 25.30
OVERPASS = "https://overpass-api.de/api/interpreter"

NAME_RE = "Barak|Surma|Kushiyara|Kalni|Goyain|Gowain|Piyain|Piain|Dhalai|Manu|Khowai|Jadukata|Someshwari|Juri|Sonai"

QUERY = f"""
[out:json][timeout:180];
(
  way["waterway"="river"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="river"]["name"~"{NAME_RE}",i]({SOUTH},{WEST},{NORTH},{EAST});
  relation["waterway"="river"]["name"~"{NAME_RE}",i]({SOUTH},{WEST},{NORTH},{EAST});
);
out body;
>;
out skel qt;
"""

# The rivers that actually carried / spread the 2022 surge (lowercased match keys).
MAIN = ["barak", "surma", "kushiyara", "kalni"]
FEEDER = ["sari", "goyain", "gowain", "piyain", "piain", "dhalai", "manu",
          "khowai", "jadukata", "someshwari", "juri", "sonai", "bogapani"]


def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "BEACON-sylhet/1.0"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.load(res)


def classify(name_l):
    for m in MAIN:
        if m in name_l:
            return "main"
    for f in FEEDER:
        if f in name_l:
            return "feeder"
    return None  # unnamed / unrelated river — skip to keep the map clean


def main():
    raw = fetch()
    nodes = {e["id"]: [round(e["lon"], 6), round(e["lat"], 6)] for e in raw["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in raw["elements"] if e["type"] == "way"}
    feats = []
    counts = {"main": 0, "feeder": 0}
    used_ways = set()

    def add(name, cls, coords):
        if len(coords) < 2:
            return
        feats.append({
            "type": "Feature",
            "properties": {"name": name, "klass": cls},
            "geometry": {"type": "LineString", "coordinates": coords},
        })
        counts[cls] += 1

    # 1) Relations first (big rivers like Barak/Kushiyara are often relations whose
    #    member ways carry no name) — name comes from the relation.
    for e in raw["elements"]:
        if e["type"] != "relation":
            continue
        name = (e.get("tags", {}).get("name") or e.get("tags", {}).get("name:en") or "")
        cls = classify(name.lower())
        if not cls:
            continue
        for m in e.get("members", []):
            if m.get("type") != "way":
                continue
            w = ways.get(m["ref"])
            if not w:
                continue
            used_ways.add(w["id"])
            add(name, cls, [nodes[n] for n in w.get("nodes", []) if n in nodes])

    # 2) Standalone named ways.
    for w in ways.values():
        if w["id"] in used_ways:
            continue
        name = (w.get("tags", {}).get("name") or w.get("tags", {}).get("name:en") or "")
        cls = classify(name.lower())
        if not cls:
            continue
        add(name, cls, [nodes[n] for n in w.get("nodes", []) if n in nodes])

    fc = {"type": "FeatureCollection", "bbox": [WEST, SOUTH, EAST, NORTH], "features": feats}
    with open("affected_rivers.geojson", "w", encoding="utf-8") as f:
        json.dump(fc, f, separators=(",", ":"))
    names = sorted({f["properties"]["name"] for f in feats})
    print("features:", len(feats), counts)
    try:
        print("named:", names)
    except Exception:
        print("named count:", len(names))


if __name__ == "__main__":
    main()
