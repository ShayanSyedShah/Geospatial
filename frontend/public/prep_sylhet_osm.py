#!/usr/bin/env python3
"""Fetch Sylhet OSM buildings, roads, and river geometry (the Surma channel)
for the Sylhet Water Lab. Writes sylhet_osm.js with window.SYLHET_OSM so the
standalone Three.js scene can render the real river + city context.

Same method as prep_waterlab_osm.py, just the Sylhet bbox + Surma rivers.
"""
import json
import random
import urllib.parse
import urllib.request

# Sylhet bbox: city + Surma river + 2022 flood footprint (matches sylhet_dem.js)
WEST, SOUTH, EAST, NORTH = 91.780, 24.860, 91.990, 25.050
OVERPASS = "https://overpass-api.de/api/interpreter"

QUERY = f"""
[out:json][timeout:90];
(
  way["building"]({SOUTH},{WEST},{NORTH},{EAST});
  way["highway"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="river"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="riverbank"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="stream"]({SOUTH},{WEST},{NORTH},{EAST});
  way["natural"="water"]({SOUTH},{WEST},{NORTH},{EAST});
  way["water"="river"]({SOUTH},{WEST},{NORTH},{EAST});
);
out body;
>;
out skel qt;
"""


def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    req = urllib.request.Request(
        OVERPASS, data=data, headers={"User-Agent": "BEACON-sylhet/1.0"}
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def parse_height(tags, way_id):
    raw = tags.get("height") or tags.get("building:height")
    if raw:
        try:
            return max(2.5, min(42.0, float(str(raw).replace("m", "").strip())))
        except ValueError:
            pass
    levels = tags.get("building:levels")
    if levels:
        try:
            return max(2.8, min(42.0, float(levels) * 3.1))
        except ValueError:
            pass
    random.seed(int(way_id))
    return random.choice([3.2, 3.6, 4.2, 5.0, 6.2, 7.5, 9.0])


def main():
    raw = fetch()
    nodes = {
        el["id"]: [round(el["lon"], 7), round(el["lat"], 7)]
        for el in raw["elements"]
        if el["type"] == "node"
    }
    buildings, roads, rivers = [], [], []

    for el in raw["elements"]:
        if el["type"] != "way":
            continue
        tags = el.get("tags", {})
        coords = [nodes[n] for n in el.get("nodes", []) if n in nodes]
        if len(coords) < 2:
            continue

        if "building" in tags and len(coords) >= 4 and coords[0] == coords[-1]:
            buildings.append({
                "id": el["id"],
                "height": round(parse_height(tags, el["id"]), 1),
                "levels": tags.get("building:levels"),
                "name": tags.get("name"),
                "pts": coords[:-1],
            })
        elif "highway" in tags:
            roads.append({
                "id": el["id"],
                "kind": tags.get("highway", "road"),
                "name": tags.get("name"),
                "pts": coords,
            })
        elif (
            tags.get("waterway") in ("river", "riverbank", "stream")
            or tags.get("natural") == "water"
            or tags.get("water") == "river"
        ):
            rivers.append({
                "id": el["id"],
                "kind": tags.get("waterway") or tags.get("natural") or tags.get("water"),
                "name": tags.get("name"),
                "pts": coords,
            })

    buildings = sorted(buildings, key=lambda b: len(b["pts"]), reverse=True)[:2600]
    roads = roads[:900]
    rivers = rivers[:220]
    named = sorted({r["name"] for r in rivers if r.get("name")})
    out = {
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "source": "OpenStreetMap / Overpass API",
        "counts": {
            "buildings": len(buildings),
            "roads": len(roads),
            "rivers": len(rivers),
        },
        "buildings": buildings,
        "roads": roads,
        "rivers": rivers,
    }
    with open("sylhet_osm.js", "w", encoding="utf-8") as f:
        f.write("window.SYLHET_OSM=")
        json.dump(out, f, separators=(",", ":"))
        f.write(";\n")
    print(out["counts"])
    print("named rivers:", named)


if __name__ == "__main__":
    main()
