"""Configuration for the Flood Risk Map backend."""
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

# H3 resolution for the country fill. res 6 ~= 3.2 km cells -> a few thousand
# cells for Uganda, which renders smoothly on phones. (Spec said res 8 = far
# too many.) Override with H3_RES for quick experiments.
H3_RES = int(os.environ.get("H3_RES", "6"))

# Default (and currently only fully-wired) country.
DEFAULT_COUNTRY = "Uganda"
SUPPORTED_COUNTRIES = ["Uganda"]

# Flood hazard return-period rasters mapped to the UI time-horizon toggles.
# Shorter horizon -> more frequent / lower-magnitude event (rp10);
# longer horizon -> rarer / higher-magnitude event (rp500).
TIME_HORIZON_TO_RASTER = {
    "4h": "flood_rp10y.tif",
    "20h": "flood_rp100y.tif",
    "7d": "flood_rp500y.tif",
}

# Water-depth (m) used to normalise the JRC flood layers onto a 0-1 risk scale.
# Depths at/above this are treated as risk = 1.0.
FLOOD_DEPTH_NORM_M = float(os.environ.get("FLOOD_DEPTH_NORM_M", "4.0"))

# Facility proximity threshold (metres) for "nearby" counts.
FACILITY_RADIUS_M = 5000

# Metric CRS used for distance/buffer maths (Web Mercator; fine near equator).
METRIC_CRS = "EPSG:3857"
GEO_CRS = "EPSG:4326"

# Fixed overall uncertainty surfaced in the evidence chain (from GloFAS/WorldPop
# validation literature). Decision threshold drives the "prioritise" rule.
OVERALL_UNCERTAINTY = 0.08
DECISION_THRESHOLD = 0.6
