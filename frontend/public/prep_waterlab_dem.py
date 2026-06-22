#!/usr/bin/env python3
"""Fetch a real dense DEM for Sirajganj from terrarium elevation tiles,
stitch + crop + resample to a grid, write waterlab_dem.js for the Water Lab."""
import math, io, json, urllib.request
import numpy as np
from PIL import Image

# Sirajganj bbox (river on the east, town in the middle)
LNG0, LAT0, LNG1, LAT1 = 89.620, 24.380, 89.790, 24.520
Z = 13                       # terrarium zoom (~20-30 m)
OUT_NX, OUT_NY = 220, 200    # output heightfield resolution

def deg2num(lat, lng, z):
    n = 2 ** z
    x = (lng + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return x, y

def num2deg(x, y, z):
    n = 2 ** z
    lng = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lng

x0f, y0f = deg2num(LAT1, LNG0, Z)   # north-west
x1f, y1f = deg2num(LAT0, LNG1, Z)   # south-east
xt0, xt1 = int(math.floor(x0f)), int(math.floor(x1f))
yt0, yt1 = int(math.floor(y0f)), int(math.floor(y1f))
print(f"tiles x {xt0}..{xt1}  y {yt0}..{yt1}  ({(xt1-xt0+1)*(yt1-yt0+1)} tiles)")

TS = 256
W = (xt1 - xt0 + 1) * TS
H = (yt1 - yt0 + 1) * TS
mosaic = np.zeros((H, W), dtype=np.float32)

for ty in range(yt0, yt1 + 1):
    for tx in range(xt0, xt1 + 1):
        url = f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{tx}/{ty}.png"
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "BEACON-waterlab/1.0"})
                data = urllib.request.urlopen(req, timeout=40).read()
                img = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(np.float32)
                elev = img[:, :, 0] * 256.0 + img[:, :, 1] + img[:, :, 2] / 256.0 - 32768.0
                oy = (ty - yt0) * TS; ox = (tx - xt0) * TS
                mosaic[oy:oy + TS, ox:ox + TS] = elev
                print(f"  tile {tx},{ty} ok  ({elev.min():.0f}..{elev.max():.0f} m)")
                break
            except Exception as e:
                print(f"  retry {tx},{ty}: {e}")
        else:
            raise SystemExit("tile fetch failed")

# pixel geo-extent of the mosaic
lat_nw, lng_nw = num2deg(xt0, yt0, Z)
lat_se, lng_se = num2deg(xt1 + 1, yt1 + 1, Z)

def px_for(lat, lng):
    fx = (lng - lng_nw) / (lng_se - lng_nw) * (W - 1)
    fy = (lat - lat_nw) / (lat_se - lat_nw) * (H - 1)
    return fx, fy

# resample bbox into OUT grid (row 0 = south so +y = north in the sim)
out = np.zeros((OUT_NY, OUT_NX), dtype=np.float32)
for j in range(OUT_NY):
    lat = LAT0 + (LAT1 - LAT0) * j / (OUT_NY - 1)
    for i in range(OUT_NX):
        lng = LNG0 + (LNG1 - LNG0) * i / (OUT_NX - 1)
        fx, fy = px_for(lat, lng)
        xi = min(W - 1, max(0, int(round(fx)))); yi = min(H - 1, max(0, int(round(fy))))
        out[j, i] = mosaic[yi, xi]

emin = float(out.min()); emax = float(out.max())
print(f"OUT grid {OUT_NX}x{OUT_NY}  elev {emin:.1f}..{emax:.1f} m")

data = {
    "place": "Sirajganj, Bangladesh",
    "bbox": [LNG0, LAT0, LNG1, LAT1],
    "nx": OUT_NX, "ny": OUT_NY,
    "emin": round(emin, 1), "emax": round(emax, 1),
    "elev": [[round(float(out[j, i]), 1) for i in range(OUT_NX)] for j in range(OUT_NY)],
    "source": "terrarium / SRTM (real)",
}
with open("waterlab_dem.js", "w", encoding="utf-8") as f:
    f.write("window.WATERLAB_DEM=" + json.dumps(data, separators=(",", ":")) + ";")
print(f"wrote waterlab_dem.js ({len(json.dumps(data))//1024} KB)")
