"""Protocol registry.

Each protocol lives in its own disjoint module ``app.protocols.<id>`` exposing:

    build(ctx) -> ProtocolResult        # the protocol logic
    PROVENANCE: dict[str, dict]         # module-level provenance entries

Those modules are owned by a later stage, so we import them LAZILY via importlib
— this registry works before they exist (and degrades gracefully if one is
missing or broken).
"""
from __future__ import annotations

import importlib
from typing import Callable, Dict

PROTOCOL_IDS = ["supply", "education", "complaints", "deconfliction"]


def get_protocol(pid: str) -> Callable:
    """Import ``app.protocols.<pid>`` and return its ``build`` function.

    Raises KeyError for an unknown id, ImportError/AttributeError if the module
    is not yet present or malformed (caller decides how to surface that).
    """
    if pid not in PROTOCOL_IDS:
        raise KeyError(pid)
    module = importlib.import_module(f"{__name__}.{pid}")
    return getattr(module, "build")


def all_provenance() -> Dict[str, dict]:
    """Merge every protocol module's PROVENANCE dict, skipping any that fail.

    Defensive per-module: a missing or broken protocol must not break evidence
    resolution for the others.
    """
    merged: Dict[str, dict] = {}
    for pid in PROTOCOL_IDS:
        try:
            module = importlib.import_module(f"{__name__}.{pid}")
            entries = getattr(module, "PROVENANCE", {}) or {}
            if isinstance(entries, dict):
                merged.update(entries)
        except Exception:  # noqa: BLE001 — a single bad module mustn't poison the rest
            continue
    return merged
