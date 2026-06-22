"""Supply-chain allocation derived from flood exposure per district.

Demand tracks the flood scenario: districts with more exposed children at
higher risk need more relief. A naive even split is compared to a
priority-weighted allocation to make "optimize" legible.
"""
from __future__ import annotations

import math

import pandas as pd

# Depot hubs (national logistics staging points) and their coordinates.
# Distances below are real great-circle distances from the depot to each
# district centroid — no fabricated figures.
DEPOTS = {
    "Bangladesh": {"name": "Dhaka hub", "lat": 23.8103, "lng": 90.4125},
    "Uganda": {"name": "Kampala hub", "lat": 0.3476, "lng": 32.5825},
}
# Indicative ground convoy speed for ETA from distance (planning assumption).
CONVOY_KMH = 35.0
# Corridor reach within the response lead time (planning assumption).
REACH_KM = 200.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))

ITEMS = [
    {"id": "ors", "name": "ORS sachets", "unit": "kits", "stock": 9000},
    {"id": "water", "name": "Water-purification units", "unit": "units", "stock": 120},
    {"id": "tarp", "name": "Tarpaulin / shelter kits", "unit": "kits", "stock": 4000},
    {"id": "food", "name": "Food rations (family/wk)", "unit": "packs", "stock": 6000},
]
# total deliverable "units of relief" available to allocate this cycle
TOTAL_STOCK = sum(i["stock"] for i in ITEMS)


def build_supply(df: pd.DataFrame, country: str, district: str | None) -> dict:
    sub = df[df["country"] == country]
    if district and district != "All":
        sub = sub[sub["district"] == district]

    rows = []
    for name, g in sub.groupby("district"):
        exposed = int(g["population_u5"].sum())
        max_risk = float(g["flood_risk_7d"].max())
        # demand in relief "kits": ~30% of exposed under-5 need a kit this cycle
        demand = max(1, int(round(exposed * 0.3)))
        # severity weight: high-risk districts matter more per kit delivered
        weight = round(0.5 + max_risk, 3)
        # real district centroid from the hexagon cells, for true depot distance
        clat = float(g["lat"].mean())
        clng = float(g["lng"].mean())
        rows.append({"district": str(name), "children_exposed": exposed,
                     "max_risk": round(max_risk, 3), "demand": demand, "weight": weight,
                     "_lat": clat, "_lng": clng})
    rows.sort(key=lambda r: r["demand"], reverse=True)
    rows = rows[:8]  # focus on the worst-hit for a legible board

    # Routes: real great-circle distance from the national depot to each
    # district centroid. Far districts fall outside the corridor reach.
    depot_cfg = DEPOTS.get(country, {"name": "National hub", "lat": None, "lng": None})
    depot = depot_cfg["name"]
    routes = []
    for r in rows:
        if depot_cfg["lat"] is not None:
            r["distance_km"] = round(
                _haversine_km(depot_cfg["lat"], depot_cfg["lng"], r["_lat"], r["_lng"]), 1)
        else:
            r["distance_km"] = None
        r["eta_h"] = round(r["distance_km"] / CONVOY_KMH, 1) if r["distance_km"] else None
        r["reachable"] = bool(r["distance_km"] is not None and r["distance_km"] <= REACH_KM)
        routes.append({
            "depot": depot, "district": r["district"],
            "distance_km": r["distance_km"], "eta_h": r["eta_h"],
            "status": "open" if r["reachable"] else "cut",
        })

    total_demand = sum(r["demand"] for r in rows) or 1
    # trucks/boats available this cycle can move ~70% of total need
    capacity = int(round(0.70 * total_demand))

    # OPTIMIZED: only ship down OPEN corridors, biggest need first; flag the
    # cut districts for airlift instead of wasting a convoy on a flooded road.
    remaining = capacity
    for r in rows:
        if r["reachable"]:
            give = min(r["demand"], remaining)
            remaining -= give
        else:
            give = 0
        r["allocated"] = give
        r["coverage_pct"] = round(100 * give / r["demand"], 1) if r["demand"] else 0.0
    delivered_opt = sum(r["allocated"] for r in rows)

    # NAIVE: even split to ALL districts regardless of access — convoys sent
    # down cut roads never arrive (lost), and capped districts waste the rest.
    even = capacity / len(rows) if rows else 0
    delivered_naive = sum(min(even, r["demand"]) for r in rows if r["reachable"])

    optimized_pct = round(100 * delivered_opt / total_demand, 1)
    naive_pct = round(100 * delivered_naive / total_demand, 1)

    for r in rows:  # drop internal centroid helpers from the response
        r.pop("_lat", None)
        r.pop("_lng", None)

    return {
        "country": country, "district": district, "items": ITEMS,
        "districts": rows, "routes": routes,
        "efficiency": {
            "naive": naive_pct, "optimized": optimized_pct,
            "coverage_pct": optimized_pct,
            "unmet": max(0, total_demand - delivered_opt),
        },
    }
