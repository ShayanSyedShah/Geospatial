"""Configuration for the Flood Risk Map backend."""
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

# Default H3 resolution for the country fill. res 7 ~= 1.2 km cells -> a denser
# grid for the Human Terrain "forest of spikes". The committed parquet is built
# at this resolution (see scripts/subdivide_res7.py / precompute.py).
H3_RES = int(os.environ.get("H3_RES", "7"))

# Per-country settings. `prefix` matches the WorldPop ISO-lowercase file prefix
# and our boundary/facility filenames. `center`/`zoom` drive the initial camera.
COUNTRIES = {
    "Bangladesh": {"iso": "BGD", "prefix": "bgd", "center": [90.36, 23.7], "zoom": 6.3},
    "Uganda":     {"iso": "UGA", "prefix": "uga", "center": [32.4, 1.3],  "zoom": 5.7},
}
DEFAULT_COUNTRY = "Bangladesh"
SUPPORTED_COUNTRIES = list(COUNTRIES)

# Flood hazard return-period rasters mapped to the UI time-horizon tiers.
# Shorter horizon -> more frequent / lower-magnitude event (rp10);
# longer horizon -> rarer / more severe event (rp500). Each tier combines
# RIVERINE (JRC/GloFAS) and COASTAL (WRI Aqueduct) hazard as max depth, so both
# inland river floods and coastal/storm-surge flooding are captured.
TIME_HORIZON_TO_RASTER = {
    "4h": "flood_rp10y.tif",
    "20h": "flood_rp100y.tif",
    "7d": "flood_rp500y.tif",
}
COASTAL_HORIZON_TO_RASTER = {
    "4h": "coast_rp0010.tif",
    "20h": "coast_rp0100.tif",
    "7d": "coast_rp0500.tif",
}

# Water depth (m) used to normalise the JRC flood layers onto a 0-1 risk scale.
FLOOD_DEPTH_NORM_M = float(os.environ.get("FLOOD_DEPTH_NORM_M", "4.0"))

FACILITY_RADIUS_M = 5000
METRIC_CRS = "EPSG:3857"
GEO_CRS = "EPSG:4326"

OVERALL_UNCERTAINTY = 0.08
DECISION_THRESHOLD = 0.6

# A cell counts as "flooded" (exposed) above this interpolated risk.
FLOOD_EXPOSURE_THRESHOLD = 0.05


def worldpop_under5(prefix: str) -> list[str]:
    return [f"{prefix}_{s}_{a}_2020.tif" for s in ("f", "m") for a in (0, 1)]
