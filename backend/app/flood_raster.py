"""Render smooth, river-following flood overlays from the source rasters.

Instead of blocky H3 hexagons, we colorize the native ~1km combined
(riverine + coastal) flood-depth raster, clipped to each country, into a PNG
per return-period tier. The raster follows real river/coast shapes. Output:
  data/flood_{country}_{tier}.png  +  data/flood_meta.json
"""
from __future__ import annotations

import json

import numpy as np
import rasterio
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds

from . import config

# Water palette (depth-normalised), matching the frontend waterColor().
_STOPS = [
    (0.2, (122, 205, 255, 170)),
    (0.4, (78, 175, 246, 186)),
    (0.6, (44, 132, 232, 200)),
    (0.8, (30, 96, 205, 212)),
    (1.01, (22, 58, 150, 222)),
]


def _colorize(depth: np.ndarray) -> np.ndarray:
    r = np.clip(depth / config.FLOOD_DEPTH_NORM_M, 0.0, 1.0)
    h, w = depth.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    prev = 0.001
    for thr, col in _STOPS:
        m = (r > prev) & (r <= thr)
        rgba[m] = col
        prev = thr
    return rgba


def _combined_depth(riv_path: str, cst_path: str, bounds, boundary_geoms):
    w, s, e, n = bounds
    with rasterio.open(riv_path) as src:
        win = from_bounds(w, s, e, n, src.transform)
        riv = src.read(1, window=win, boundless=True, fill_value=0).astype(float)
        wt = src.window_transform(win)
        shape = riv.shape
    cst = np.zeros(shape, dtype=float)
    with rasterio.open(cst_path) as csrc:
        reproject(
            source=rasterio.band(csrc, 1), destination=cst,
            src_transform=csrc.transform, src_crs=csrc.crs,
            dst_transform=wt, dst_crs="EPSG:4326", resampling=Resampling.bilinear,
        )
    riv[(riv < 0) | (riv > 1e4)] = 0
    cst[(cst < 0) | (cst > 1e4)] = 0
    depth = np.maximum(riv, cst)
    # zero out everything outside the country boundary
    outside = geometry_mask(boundary_geoms, out_shape=shape, transform=wt, invert=False)
    depth[outside] = 0
    real_bounds = array_bounds(shape[0], shape[1], wt)  # (w, s, e, n)
    return depth, real_bounds


def render_all() -> dict:
    import geopandas as gpd

    meta: dict = {}
    for country, cfg in config.COUNTRIES.items():
        prefix = cfg["prefix"]
        boundary = gpd.read_file(config.DATA_DIR / f"{prefix}_adm0.geojson").to_crs(config.GEO_CRS)
        geoms = list(boundary.geometry)
        b = boundary.total_bounds  # minx, miny, maxx, maxy
        pad = 0.15
        bbox = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
        out_bounds = None
        for tier in config.TIME_HORIZON_TO_RASTER:
            depth, real_bounds = _combined_depth(
                str(config.DATA_DIR / config.TIME_HORIZON_TO_RASTER[tier]),
                str(config.DATA_DIR / config.COASTAL_HORIZON_TO_RASTER[tier]),
                bbox, geoms,
            )
            out_bounds = real_bounds
            img = Image.fromarray(_colorize(depth), "RGBA")
            img.save(config.DATA_DIR / f"flood_{country}_{tier}.png")
            print(f"[flood] {country} {tier}: {img.size} flooded_px={(depth>0).sum()}")
        meta[country] = {
            "bounds": [out_bounds[0], out_bounds[1], out_bounds[2], out_bounds[3]],
            "tiers": list(config.TIME_HORIZON_TO_RASTER),
        }
    (config.DATA_DIR / "flood_meta.json").write_text(json.dumps(meta))
    print("[flood] wrote flood_meta.json")
    return meta


if __name__ == "__main__":
    render_all()
