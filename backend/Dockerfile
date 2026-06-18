# Slim image: rasterio/geopandas pip wheels bundle GDAL/GEOS/PROJ, so we do NOT
# need apt-get gdal. The deployed API loads the precomputed data/hexagons.parquet
# and never touches the big rasters.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data/hexagons.parquet ./data/hexagons.parquet

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
