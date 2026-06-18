"""Geospatial operations: H3 fill, raster zonal stats, facility joins.

Uses h3-py v4 (h3>=4). Remember: every H3 v4 coordinate is (lat, lng), the
opposite of GeoJSON/shapely (lng, lat) -- we flip when building shapely polys.
"""
from __future__ import annotations

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from rasterstats import zonal_stats
from shapely.geometry import Polygon

from . import config


def build_h3_cells(boundary: gpd.GeoDataFrame, res: int) -> gpd.GeoDataFrame:
    """Fill a country boundary with H3 cells and return them as polygons.

    Returns a GeoDataFrame (EPSG:4326) with columns: h3_id, lat, lng, geometry.
    """
    # Union all boundary parts into one shape; geo_to_h3shape accepts any object
    # implementing __geo_interface__ (shapely geometries do).
    geom = boundary.geometry.union_all()
    h3_shape = h3.geo_to_h3shape(geom)
    cell_ids = list(h3.h3shape_to_cells(h3_shape, res))

    rows = []
    for cid in cell_ids:
        lat, lng = h3.cell_to_latlng(cid)  # (lat, lng)
        boundary_latlng = h3.cell_to_boundary(cid)  # ((lat, lng), ...)
        poly = Polygon([(lng_, lat_) for (lat_, lng_) in boundary_latlng])  # -> (lng, lat)
        rows.append({"h3_id": cid, "lat": lat, "lng": lng, "geometry": poly})

    return gpd.GeoDataFrame(rows, geometry="geometry", crs=config.GEO_CRS)


def flood_risk_for_raster(cells: gpd.GeoDataFrame, raster_path: str) -> pd.DataFrame:
    """Mean/max water depth per cell, normalised to a 0-1 risk score.

    JRC flood layers are water depth in metres. We divide by FLOOD_DEPTH_NORM_M
    and clip to [0, 1].
    """
    stats = zonal_stats(
        cells.geometry, raster_path, stats=["mean", "max"], all_touched=True
    )
    norm = config.FLOOD_DEPTH_NORM_M
    mean = np.array([(s["mean"] or 0.0) for s in stats], dtype=float)
    mx = np.array([(s["max"] or 0.0) for s in stats], dtype=float)
    return pd.DataFrame({
        "flood_risk": np.clip(mean / norm, 0.0, 1.0),
        "flood_depth_max_m": mx,
    }, index=cells.index)


def population_under5(cells: gpd.GeoDataFrame, raster_paths: list[str]) -> np.ndarray:
    """Sum WorldPop under-5 counts (across the 4 age/sex grids) per cell."""
    total = np.zeros(len(cells), dtype=float)
    for path in raster_paths:
        stats = zonal_stats(cells.geometry, path, stats=["sum"])
        vals = np.array([(s["sum"] or 0.0) for s in stats], dtype=float)
        vals[vals < 0] = 0.0  # guard nodata leakage
        total += vals
    return total


def facility_metrics(cells: gpd.GeoDataFrame, facilities: gpd.GeoDataFrame) -> pd.DataFrame:
    """Count schools/clinics within FACILITY_RADIUS_M of each cell centroid and
    distance to the nearest clinic. All maths in a metric CRS (metres)."""
    cells_m = cells.to_crs(config.METRIC_CRS)
    fac_m = facilities.to_crs(config.METRIC_CRS)

    centroids = cells_m.copy()
    centroids["geometry"] = cells_m.geometry.centroid

    # Buffer centroids and spatial-join facilities for the "nearby" counts.
    buffers = centroids.copy()
    buffers["geometry"] = centroids.geometry.buffer(config.FACILITY_RADIUS_M)
    joined = gpd.sjoin(buffers[["geometry"]], fac_m[["geometry", "type"]],
                       how="left", predicate="intersects")
    counts = (joined.reset_index()
                    .groupby(["index", "type"]).size()
                    .unstack(fill_value=0))
    nearby_schools = counts.get("school", pd.Series(0, index=cells.index)).reindex(cells.index, fill_value=0)
    nearby_clinics = counts.get("clinic", pd.Series(0, index=cells.index)).reindex(cells.index, fill_value=0)

    # Distance (m) to nearest clinic.
    clinics_m = fac_m[fac_m["type"] == "clinic"]
    if len(clinics_m):
        near = gpd.sjoin_nearest(centroids[["geometry"]], clinics_m[["geometry"]],
                                 how="left", distance_col="dist_clinic_m")
        # sjoin_nearest can yield duplicate index rows on ties; keep the min.
        nearest = near.groupby(near.index)["dist_clinic_m"].min().reindex(cells.index)
    else:
        nearest = pd.Series(np.nan, index=cells.index)

    return pd.DataFrame({
        "nearby_schools": nearby_schools.astype(int).values,
        "nearby_clinics": nearby_clinics.astype(int).values,
        "nearest_clinic_m": nearest.values,
    }, index=cells.index)
