#!/usr/bin/env python3
"""Regional DEM + river network for the Sylhet 2022 river-surge scene.

The old src/water/sylhet_dem.json only covered Sylhet city (91.78-91.99,
24.86-25.05) — but the real Barak/Surma/Kushiyara rivers live to the SOUTH
(91.12-93.30, 24.24-24.83), so they never overlapped and the water sim fell
back to fake edge-inlets. This rebuilds the DEM over the river network and
extracts the real river polylines so the sim can fill the actual channels.

Writes:
  src/water/sylhet_dem.json      (window-free plain JSON: nx,ny,bbox,elev)
  src/water/sylhet_rivers.json   ({"rivers":[[[lng,lat],...],...]})
"""
import io
import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

# Region covering the full Barak -> Surma/Kushiyara network + hill feeders.
LNG0, LAT0, LNG1, LAT1 = 91.05, 24.15, 93.35, 25.30
Z = 10                       # regional view, ~150 m native tiles
OUT_NX, OUT_NY = 640, 320    # ~360 m cells — finer ribbons for the water mask

HERE = os.path.dirname(os.path.abspath(__file__))
# Use the FULL affected-river network (Barak/Surma/Kushiyara/Kalni + feeders).
RIVERS_SRC = os.path.join(HERE, "..", "..", "public", "data", "sylhet_2022", "affected_rivers.geojson")


def deg2num(lat, lng, z):
    n = 2 ** z
    return ((lng + 180.0) / 360.0 * n,
            (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)


def num2deg(x, y, z):
    n = 2 ** z
    return (math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), x / n * 360.0 - 180.0)


def build_dem():
    x0f, y0f = deg2num(LAT1, LNG0, Z)
    x1f, y1f = deg2num(LAT0, LNG1, Z)
    xt0, xt1 = int(math.floor(x0f)), int(math.floor(x1f))
    yt0, yt1 = int(math.floor(y0f)), int(math.floor(y1f))
    print(f"DEM tiles x {xt0}..{xt1} y {yt0}..{yt1} ({(xt1-xt0+1)*(yt1-yt0+1)} tiles)", flush=True)
    TS = 256
    W = (xt1 - xt0 + 1) * TS
    H = (yt1 - yt0 + 1) * TS
    mosaic = np.zeros((H, W), dtype=np.float32)
    for ty in range(yt0, yt1 + 1):
        for tx in range(xt0, xt1 + 1):
            url = f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{tx}/{ty}.png"
            for _ in range(4):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "BEACON-sylhet/1.0"})
                    data = urllib.request.urlopen(req, timeout=40).read()
                    img = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(np.float32)
                    elev = img[:, :, 0] * 256.0 + img[:, :, 1] + img[:, :, 2] / 256.0 - 32768.0
                    mosaic[(ty - yt0) * TS:(ty - yt0) * TS + TS, (tx - xt0) * TS:(tx - xt0) * TS + TS] = elev
                    break
                except Exception as e:
                    print("  retry", tx, ty, e, flush=True)
            else:
                raise SystemExit("tile fetch failed")
        print(f"  row {ty} done", flush=True)

    lat_nw, lng_nw = num2deg(xt0, yt0, Z)
    lat_se, lng_se = num2deg(xt1 + 1, yt1 + 1, Z)
    out = np.zeros((OUT_NY, OUT_NX), dtype=np.float32)
    for j in range(OUT_NY):
        lat = LAT0 + (LAT1 - LAT0) * j / (OUT_NY - 1)
        fy = (lat - lat_nw) / (lat_se - lat_nw) * (H - 1)
        yi = min(H - 1, max(0, int(round(fy))))
        for i in range(OUT_NX):
            lng = LNG0 + (LNG1 - LNG0) * i / (OUT_NX - 1)
            fx = (lng - lng_nw) / (lng_se - lng_nw) * (W - 1)
            xi = min(W - 1, max(0, int(round(fx))))
            out[j, i] = mosaic[yi, xi]

    emin, emax = float(out.min()), float(out.max())
    dem = {
        "place": "Sylhet region (Barak/Surma/Kushiyara)",
        "bbox": [LNG0, LAT0, LNG1, LAT1],
        "nx": OUT_NX, "ny": OUT_NY,
        "emin": round(emin, 1), "emax": round(emax, 1),
        "elev": [[round(float(out[j, i]), 1) for i in range(OUT_NX)] for j in range(OUT_NY)],
        "source": "terrarium / SRTM (real)",
    }
    with open(os.path.join(HERE, "sylhet_dem.json"), "w", encoding="utf-8") as f:
        json.dump(dem, f, separators=(",", ":"))
    print(f"WROTE sylhet_dem.json  elev {emin:.1f}..{emax:.1f} m", flush=True)


def build_rivers():
    gj = json.load(open(RIVERS_SRC, encoding="utf-8-sig"))
    lines = []
    for f in gj["features"]:
        g = f.get("geometry", {})
        if g.get("type") == "LineString":
            lines.append([[round(c[0], 5), round(c[1], 5)] for c in g["coordinates"]])
        elif g.get("type") == "MultiLineString":
            for seg in g["coordinates"]:
                lines.append([[round(c[0], 5), round(c[1], 5)] for c in seg])
    out = {"bbox": [LNG0, LAT0, LNG1, LAT1], "rivers": lines}
    with open(os.path.join(HERE, "sylhet_rivers.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    pts = sum(len(l) for l in lines)
    print(f"WROTE sylhet_rivers.json  {len(lines)} polylines, {pts} pts", flush=True)


if __name__ == "__main__":
    build_dem()
    build_rivers()
