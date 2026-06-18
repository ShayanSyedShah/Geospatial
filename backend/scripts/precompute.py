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
    for name in ("hexagons.parquet", "facilities.parquet"):
        f = config.DATA_DIR / name
        if f.exists():
            f.unlink()  # force a rebuild
    p = DataPipeline()  # builds from rasters (no parquet present) and caches
    print(f"\nWrote {len(p.df)} hexagons + {len(p.facilities)} facilities")
    print("hexagons by country:", p.df.groupby("country").size().to_dict())
    print("facilities at risk:",
          p.facilities.groupby("country")["at_risk"].agg(["size", "sum"]).to_dict())


if __name__ == "__main__":
    main()
