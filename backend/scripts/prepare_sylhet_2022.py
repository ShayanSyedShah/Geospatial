"""Convert UNOSAT 2022 Sylhet flood shapefiles into small, browser-ready GeoJSON.

Source: UNOSAT/UNITAR satellite-detected FLOOD extent (water minus permanent water),
bundled in FL20220525BGD_SHP.zip from unosat-maps.web.cern.ch. We keep the two
Sylhet-scoped frames (same footprint) so the animation grows cleanly, and simplify
aggressively for the web.
"""
import os, glob
import geopandas as gpd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "backend", "data", "raw", "sylhet_2022", "FL20220525BGD", "FL20220525BGD_SHP")
OUT = os.path.join(ROOT, "frontend", "public", "data", "sylhet_2022")
os.makedirs(OUT, exist_ok=True)

FRAMES = {
    # Only the 25 May Chaohu-1 (OPTICAL) frame is shippable: the RCM-1 / Sentinel-1
    # SAR frames are pixel-edge polygons with millions of vertices that pyogrio/
    # shapely cannot read in reasonable time on this box (no GDAL bindings / ogr2ogr).
    # The June "catastrophic" state is shown as UNOSAT's cited 840 km² figure instead.
    "2022-05-25": "Chaohu1_20220525_FloodExtent_Sylhet.shp",
}

MIN_PART_M2 = 120000     # drop slivers < 0.12 km²
SIMPLIFY_DEG = 0.0022    # ~220 m — aggressive, keeps the regional shape, tiny files
PRECISION = 4            # ~10 m coordinate precision

for date, fname in FRAMES.items():
    path = os.path.join(SRC, fname)
    if not os.path.exists(path):
        print(f"MISSING {fname}")
        continue
    dst_check = os.path.join(OUT, f"flood_extent_{date}.geojson")
    if os.path.exists(dst_check) and os.path.getsize(dst_check) > 1000:
        print(f"[{date}] already converted, skipping", flush=True)
        continue
    print(f"[{date}] reading {fname} (arrow) ...", flush=True)
    # use_arrow dramatically speeds the read of dense SAR polygons
    g = gpd.read_file(path, engine="pyogrio", use_arrow=True).to_crs(4326)
    print(f"  raw features: {len(g)}", flush=True)
    # Simplify FIRST on the raw geometry — collapses vertex density (the source of
    # the bloat) and makes the later steps fast.
    # preserve_topology=False = plain Douglas-Peucker: FAST (the topology-preserving
    # variant is near-O(n^2) and hangs on this million-vertex polygon). We don't
    # dissolve, and GeoJSON fills don't need valid topology, so this is fine.
    g["geometry"] = g.simplify(SIMPLIFY_DEG, preserve_topology=False)
    g = g.explode(index_parts=False).reset_index(drop=True)
    areas = g.to_crs(3857).area
    g = g[areas > MIN_PART_M2].reset_index(drop=True)
    print(f"  parts kept (> {MIN_PART_M2/1e6:.2f} km²): {len(g)}", flush=True)
    # write the simplified parts straight out as a FeatureCollection — no dissolve
    # and no buffer(0) needed to render a fill, and GeoJSON doesn't require validity.
    out = g[["geometry"]].copy()
    out["date"] = date
    dst = os.path.join(OUT, f"flood_extent_{date}.geojson")
    try:
        out.to_file(dst, driver="GeoJSON", COORDINATE_PRECISION=PRECISION)
    except TypeError:
        out.to_file(dst, driver="GeoJSON")
    mb = os.path.getsize(dst) / 1e6
    b = [round(x, 3) for x in out.total_bounds]
    print(f"  WROTE {os.path.basename(dst)}  {mb:.2f} MB  bounds={b}", flush=True)

print("DONE", flush=True)
