"""Supply-chain allocation derived from flood exposure per district.

Demand tracks the flood scenario: districts with more exposed children at
higher risk need more relief. A naive even split is compared to a
priority-weighted allocation to make "optimize" legible.
"""
from __future__ import annotations

import pandas as pd

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
        rows.append({"district": str(name), "children_exposed": exposed,
                     "max_risk": round(max_risk, 3), "demand": demand, "weight": weight})
    rows.sort(key=lambda r: r["demand"], reverse=True)
    rows = rows[:8]  # focus on the worst-hit for a legible board

    # Routes: the flood severs the long corridors, so far districts get cut off.
    depots = {"Bangladesh": "Dhaka hub", "Uganda": "Kampala hub"}
    depot = depots.get(country, "National hub")
    routes = []
    for i, r in enumerate(rows):
        r["distance_km"] = 40 + i * 22
        r["eta_h"] = round(1.5 + i * 0.8, 1)
        r["reachable"] = r["distance_km"] <= 130  # corridor open within lead time
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

    return {
        "country": country, "district": district, "items": ITEMS,
        "districts": rows, "routes": routes,
        "efficiency": {
            "naive": naive_pct, "optimized": optimized_pct,
            "coverage_pct": optimized_pct,
            "unmet": max(0, total_demand - delivered_opt),
        },
    }
