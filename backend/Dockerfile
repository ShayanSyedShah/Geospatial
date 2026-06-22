# Slim image: rasterio/geopandas pip wheels bundle GDAL/GEOS/PROJ, so we do NOT
# need apt-get gdal. Rasterio still needs libexpat at runtime on slim images.
# The deployed API loads the precomputed data/hexagons.parquet and never touches
# the big rasters.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# Precomputed serving data only (parquets, flood overlay PNGs + meta). The big
# source rasters/geojson are excluded via .dockerignore.
COPY data ./data

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
