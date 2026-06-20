#!/usr/bin/env python3
"""Fetch Sirajganj OSM buildings, roads, and river geometry for Water Lab.

Writes waterlab_osm.js with a compact window.WATERLAB_OSM object so the
standalone Three.js scene can render real city context without a backend.
"""
import json
import random
import urllib.parse
import urllib.request


WEST, SOUTH, EAST, NORTH = 89.620, 24.380, 89.790, 24.520
OVERPASS = "https://overpass-api.de/api/interpreter"


QUERY = f"""
[out:json][timeout:90];
(
  way["building"]({SOUTH},{WEST},{NORTH},{EAST});
  way["highway"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="river"]({SOUTH},{WEST},{NORTH},{EAST});
  way["waterway"="riverbank"]({SOUTH},{WEST},{NORTH},{EAST});
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
        OVERPASS,
        data=data,
        headers={"User-Agent": "BEACON-waterlab/1.0"},
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
    # Deterministic estimate: most Sirajganj buildings are low-rise.
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
            tags.get("waterway") in ("river", "riverbank")
            or tags.get("natural") == "water"
            or tags.get("water") == "river"
        ):
            rivers.append({
                "id": el["id"],
                "kind": tags.get("waterway") or tags.get("natural") or tags.get("water"),
                "name": tags.get("name"),
                "pts": coords,
            })

    # Keep the asset compact and performant for the demo.
    buildings = sorted(buildings, key=lambda b: len(b["pts"]), reverse=True)[:2600]
    roads = roads[:900]
    rivers = rivers[:160]
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
    with open("waterlab_osm.js", "w", encoding="utf-8") as f:
        f.write("window.WATERLAB_OSM=")
        json.dump(out, f, separators=(",", ":"))
        f.write(";\n")
    print(out["counts"])


if __name__ == "__main__":
    main()
