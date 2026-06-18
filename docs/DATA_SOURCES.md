# Data Sources

All datasets are free and open. `backend/scripts/download_data.py` fetches them
(only the Healthsites live API would need a key; we use the keyless OSM Overpass
path instead).

| Dataset | Source | Access | Format | License |
|---|---|---|---|---|
| Flood hazard | JRC Global River Flood Hazard (GloFAS/LISFLOOD lineage, Copernicus EMS) | Static GeoTIFF, no auth — `cidportal.jrc.ec.europa.eu/ftp/.../floodMapGL_rp{10,100,500}y.zip` | GeoTIFF (water depth, m) | CC-BY 4.0 |
| Population (under-5) | WorldPop 2020 age/sex structures, Uganda | Direct HTTP, no auth — `data.worldpop.org/GIS/AgeSex_structures/Global_2000_2020/2020/UGA/uga_{f,m}_{0,1}_2020.tif` | GeoTIFF (counts/pixel) | CC-BY 4.0 |
| Country boundary | geoBoundaries UGA ADM0 (simplified) | Direct HTTP, no auth | GeoJSON | CC-BY 4.0 |
| Schools | Giga (ITU/UNICEF) + OpenStreetMap | OSM Overpass API (keyless) | GeoJSON points | ODbL |
| Clinics | Healthsites.io / OpenStreetMap | OSM Overpass API (keyless); Healthsites v3 API optional | GeoJSON points | ODbL |

## Notes on substitutions
- **Live GloFAS forecast** (`cems-glofas-forecast` on the CEMS Early Warning Data
  Store) needs an account + license acceptance + GRIB→GeoTIFF conversion. We use
  the JRC static hazard maps instead — same model lineage, no approval delay, and
  the evidence panel labels it honestly.
- **Giga** has no clean keyless bulk download; we pull school points from OSM
  (which Giga also ingests) and cite Giga as the canonical source.
- **Healthsites** requires a free API key; the keyless OSM Overpass query returns
  the same facilities, so we default to that.

## Refreshing
```bash
python backend/scripts/download_data.py   # re-fetch raw data
python backend/scripts/precompute.py      # rebuild data/hexagons.parquet
```
