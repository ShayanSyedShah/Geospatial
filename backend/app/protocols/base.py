"""The protocol contract — shared Pydantic models for every response protocol.

These types are the single source of truth that the protocol modules
(supply/education/complaints), the scenario context, and the evidence registry
all serialise into. The frontend mirrors them verbatim in `types/index.ts`.

Design notes
------------
- ``Provenance`` is a *curated, static* citation (real DCID + source + publisher +
  date + URL). It is never produced by a live Data Commons call at runtime.
- ``Metric`` is a clickable number: it carries a ``provenance_id`` that resolves
  via ``GET /api/evidence/{id}`` to the full ``Provenance`` record.
- ``ProtocolResult`` is what ``build(ctx)`` returns in each protocol module.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel


class Provenance(BaseModel):
    """A verified citation for a single number or dataset."""
    id: str
    label: str
    value: Optional[Any] = None      # the cited value (number/string), if scalar
    unit: Optional[str] = None
    source: str                      # dataset / survey name
    publisher: str                   # organisation that publishes it
    dcid: Optional[str] = None       # UN Data Commons DCID (or None for non-DC sources)
    date: Optional[str] = None       # publication / reference date
    url: Optional[str] = None
    method: Optional[str] = None     # how the value was derived / transcribed
    caveat: Optional[str] = None     # honest limitations


class Metric(BaseModel):
    """A clickable number on the decision panel, linked to its evidence."""
    id: str
    label: str
    value: Any
    unit: Optional[str] = None
    provenance_id: Optional[str] = None


class Target(BaseModel):
    """A ranked place / school / zone the protocol recommends acting on."""
    id: str
    name: str
    admin_unit: str                  # the district / union this sits in
    rank: int
    score: float
    metrics: List[Metric] = []
    lat: Optional[float] = None
    lng: Optional[float] = None


class MapLayer(BaseModel):
    """A renderable overlay the frontend hands straight to deck.gl."""
    id: str
    kind: Literal["choropleth", "points", "path"]
    data: Any                        # GeoJSON FeatureCollection or list of rows
    color_by: Optional[str] = None   # property name to colour by
    legend: Optional[Dict[str, Any]] = None


class ProtocolResult(BaseModel):
    """The full output of one protocol run against a scenario."""
    protocol_id: str
    headline: str
    summary_metrics: List[Metric] = []
    targets: List[Target] = []
    map_layer: Optional[MapLayer] = None
    evidence: List[Provenance] = []
    caveats: List[str] = []
