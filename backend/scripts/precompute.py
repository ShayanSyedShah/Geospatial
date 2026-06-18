"""Build the hexagon table from the raw rasters and write data/hexagons.parquet.

Run once locally after download_data.py. The committed parquet is what the
deployed API loads -- so the cloud backend never touches the big rasters.

    python backend/scripts/precompute.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.data_pipeline import DataPipeline  # noqa: E402


def main() -> None:
    parquet = config.DATA_DIR / "hexagons.parquet"
    if parquet.exists():
        parquet.unlink()  # force a rebuild
    p = DataPipeline()  # builds from rasters (no parquet present) and caches
    print(f"\nWrote {len(p.df)} hexagons -> {parquet}")
    print(p.df[["flood_risk_4h", "flood_risk_20h", "flood_risk_7d",
                "population_u5", "nearby_clinics", "nearby_schools"]].describe().round(2))


if __name__ == "__main__":
    main()
