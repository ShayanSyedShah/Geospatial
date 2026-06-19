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
from scipy.ndimage import gaussian_filter, zoom

from . import config

# Smoothing: upsample the ~1km depth grid + gaussian blur so it isn't blocky.
UPSCALE = 3
SIGMA = 1.5
MAX_ALPHA = 200  # per-tier ceiling; frontend further caps combined opacity
FEATHER_M = 0.18  # depth (m) over which the water edge fades in

# Colour gradient control points: (normalised-depth, (r,g,b)). Shallow -> deep.
_GRAD = [
    (0.00, (140, 214, 255)),
    (0.22, (96, 186, 250)),
    (0.45, (52, 140, 236)),
    (0.70, (32, 100, 208)),
    (1.00, (20, 52, 140)),
]


def _build_lut() -> np.ndarray:
    """256-entry RGBA lookup table: continuous colour + feathered alpha."""
    xs = np.array([g[0] for g in _GRAD])
    rs = np.array([g[1][0] for g in _GRAD])
    gs = np.array([g[1][1] for g in _GRAD])
    bs = np.array([g[1][2] for g in _GRAD])
    t = np.linspace(0, 1, 256)
    lut = np.zeros((256, 4), dtype=np.uint8)
    lut[:, 0] = np.interp(t, xs, rs)
    lut[:, 1] = np.interp(t, xs, gs)
    lut[:, 2] = np.interp(t, xs, bs)
    lut[:, 3] = MAX_ALPHA
    return lut


_LUT = _build_lut()


def _colorize(depth: np.ndarray) -> np.ndarray:
    r = np.clip(depth / config.FLOOD_DEPTH_NORM_M, 0.0, 1.0)
    idx = (r * 255).astype(np.uint8)
    rgba = _LUT[idx]
    # feather the edge: alpha ramps 0 -> MAX_ALPHA over the first FEATHER_M of depth
    feather = np.clip(depth / FEATHER_M, 0.0, 1.0)
    feather = feather * feather * (3 - 2 * feather)  # smoothstep
    rgba = rgba.copy()
    rgba[..., 3] = (rgba[..., 3] * feather).astype(np.uint8)
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
    real_bounds = array_bounds(shape[0], shape[1], wt)  # geographic extent (unchanged by upsampling)
    # upsample + gaussian-smooth so the ~1km grid renders smooth, not blocky
    depth = zoom(depth, UPSCALE, order=1)
    depth = gaussian_filter(depth, sigma=SIGMA)
    depth[depth < 0.01] = 0  # keep dry areas crisp-transparent
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
            img.save(config.DATA_DIR / f"flood_{country}_{tier}.webp", "WEBP", quality=80, method=6)
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
