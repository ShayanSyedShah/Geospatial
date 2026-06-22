#!/usr/bin/env python3
"""Fetch Esri satellite imagery for the Sylhet bbox, crop to bbox, and write
sylhet_sat.js (window.SYLHET_SAT = base64 data URL) draped on the Water Lab
terrain. Same method as prep_waterlab_sat.py, Sylhet bbox + self-contained .js."""
import base64
import io
import math
import urllib.request

LNG0, LAT0, LNG1, LAT1 = 91.780, 24.860, 91.990, 25.050
Z = 14  # one zoom deeper than DEM for sharper imagery

from PIL import Image


def deg2num(lat, lng, z):
    n = 2 ** z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def num2deg(x, y, z):
    n = 2 ** z
    return (math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), x / n * 360 - 180)


x0f, y0f = deg2num(LAT1, LNG0, Z)
x1f, y1f = deg2num(LAT0, LNG1, Z)
xt0, xt1 = int(x0f), int(x1f)
yt0, yt1 = int(y0f), int(y1f)
print(f"sat tiles x {xt0}..{xt1} y {yt0}..{yt1} ({(xt1-xt0+1)*(yt1-yt0+1)} tiles)")
TS = 256
W = (xt1 - xt0 + 1) * TS
H = (yt1 - yt0 + 1) * TS
mosaic = Image.new("RGB", (W, H))
for ty in range(yt0, yt1 + 1):
    for tx in range(xt0, xt1 + 1):
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}"
        for a in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "BEACON-sylhet/1.0"})
                im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=40).read())).convert("RGB")
                mosaic.paste(im, ((tx - xt0) * TS, (ty - yt0) * TS))
                break
            except Exception as e:
                print("  retry", tx, ty, e)
        else:
            raise SystemExit("sat tile fail")
    print(f"  row {ty} done")

lat_nw, lng_nw = num2deg(xt0, yt0, Z)
lat_se, lng_se = num2deg(xt1 + 1, yt1 + 1, Z)


def px(lat, lng):
    return ((lng - lng_nw) / (lng_se - lng_nw) * W, (lat - lat_nw) / (lat_se - lat_nw) * H)


l, t = px(LAT1, LNG0)   # north-west pixel
r, bm = px(LAT0, LNG1)  # south-east pixel
crop = mosaic.crop((int(l), int(t), int(r), int(bm)))
crop = crop.resize((1024, int(1024 * (bm - t) / (r - l))), Image.LANCZOS)
buf = io.BytesIO()
crop.save(buf, format="JPEG", quality=86)
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
with open("sylhet_sat.js", "w", encoding="utf-8") as f:
    f.write('window.SYLHET_SAT="data:image/jpeg;base64,' + b64 + '";')
print(f"wrote sylhet_sat.js {crop.size}  ({len(b64)//1024} KB base64)")
