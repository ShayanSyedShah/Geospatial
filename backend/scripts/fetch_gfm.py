"""Fetch the latest Copernicus GFM (Sentinel-1) OBSERVED flood extent for
Sirajganj and save it as a small GeoJSON overlay + metadata. Real satellite
flood observation, no auth. -> frontend/public/beacon/observed.{geojson,json}
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.features import shapes
from shapely.geometry import shape as shp_shape, mapping, MultiPolygon
from shapely.ops import unary_union
from shapely.validation import make_valid

OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "beacon"
BBOX = (89.25, 24.0, 89.83, 24.79)  # Sirajganj
STAC = ("https://stac.eodc.eu/api/v1/search?collections=GFM"
        f"&bbox={BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}&limit=1"
        "&datetime=2024-01-01T00:00:00Z/2026-12-31T00:00:00Z")


def _round(o, nd=4):
    if isinstance(o, float): return round(o, nd)
    if isinstance(o, (list, tuple)): return [_round(x, nd) for x in o]
    if isinstance(o, dict): return {k: _round(v, nd) for k, v in o.items()}
    return o


def main():
    print("[gfm] querying STAC ...")
    with urllib.request.urlopen(STAC, timeout=40) as r:
        feats = json.loads(r.read().decode())["features"]
    if not feats:
        print("[gfm] no items"); return
    it = feats[0]
    date = it["properties"]["datetime"][:10]
    assets = it["assets"]
    key = next((k for k in ("dlr_flood_extent", "ensemble_flood_extent", "flood_extent") if k in assets), None)
    if not key:
        print("[gfm] no flood-extent asset:", list(assets)); return
    href = assets[key]["href"]
    print(f"[gfm] {date} · {key}")

    with rasterio.open(href) as src:
        with WarpedVRT(src, crs="EPSG:4326", resampling=rasterio.enums.Resampling.nearest) as vrt:
            full = rasterio.windows.Window(0, 0, vrt.width, vrt.height)
            win = from_bounds(*BBOX, vrt.transform).intersection(full).round_offsets().round_lengths()
            arr = vrt.read(1, window=win)
            wt = vrt.window_transform(win)
    flooded = (arr == 1).astype("uint8")
    print(f"[gfm] flooded px: {int(flooded.sum())} of {flooded.size}")
    polys = [shp_shape(g) for g, v in shapes(flooded, mask=flooded.astype(bool), transform=wt) if v == 1]
    if not polys:
        print("[gfm] no flood polygons"); return
    g = make_valid(unary_union(polys).buffer(0).simplify(0.0015, preserve_topology=False))
    keep = [p for p in (g.geoms if g.geom_type.startswith("Multi") or g.geom_type == "GeometryCollection" else [g])
            if p.geom_type == "Polygon" and p.area > 1e-5]
    if not keep:
        print("[gfm] all polys tiny"); return
    geom = MultiPolygon(keep) if len(keep) > 1 else keep[0]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "observed.geojson").write_text(json.dumps(_round({"type": "Feature", "properties": {}, "geometry": mapping(geom)})))
    (OUT / "observed.json").write_text(json.dumps({
        "date": date, "source": "Copernicus GFM (Sentinel-1), DLR flood extent",
        "note": "Observed flood from the most recent Sentinel-1 pass over Sirajganj.",
    }))
    print(f"[gfm] wrote observed.geojson ({len(keep)} parts), date {date}")


if __name__ == "__main__":
    main()
