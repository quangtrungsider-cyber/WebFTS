"""
Phase 5 -- turns the Airways module's structured data (Phase 1 RNAV2 draft +
Phase 2 ENR3.1 legacy, see FTS Server/tools/airways/) into the same
`Waypoint(name, lat, lon, alt_ft, spd_kt)` shape `capacity_scenario_engine.py`
and `scn_generator.py` already consume for SID/STAR routes, so an en-route
airway can be dropped into a scenario's ADDWPT chain the same way.

Why this is its own module instead of another `AirportProcedures` entry
-------------------------------------------------------------------------
`AirportProcedures` (capacity_scenario_engine.py) is purpose-built for one
airport's arrival/departure geometry: runway thresholds, TMA-boundary gates,
merge-point separation, a takeoff-roll timing model. An en-route airway has
none of that -- it's just an ordered chain of fixes between two FIR-scale
endpoints, published with a per-LEG altitude band (upper/lower FL) rather
than a single target altitude at each fix the way a STAR is. Forcing it into
`AirportProcedures` would mean inventing runway/TMA semantics that don't
apply. This module is deliberately small and airport-agnostic instead.

Altitude handling
------------------
Because an airway's published constraint is a band per leg, not a target
per fix, `get_airway_route()` leaves `alt_ft`/`spd_kt` as `None` (pure
geometry) unless the caller passes `cruise_fl`. When it does, every leg the
route crosses is checked against its own published [lowerFL, upperFL] band;
if the requested level falls outside ANY leg's band, this raises
`AirwayLevelOutOfRangeError` instead of silently clamping to the nearest
legal level or emitting an unsafe altitude.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_DATA_DIR = Path(__file__).resolve().parent.parent / "static" / "data" / "airways"
_RNAV2_DRAFT_PATH = _DATA_DIR / "airways_rnav2_draft.json"
_ENR31_LEGACY_PATH = _DATA_DIR / "airways_enr31_legacy.json"


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float
    alt_ft: float | None = None
    spd_kt: float | None = None


@dataclass(frozen=True)
class AirwaySummary:
    code: str
    source: Literal["rnav2Draft", "enr31Legacy"]
    waypoint_count: int
    segment_count: int
    is_draft: bool


class AirwayNotFoundError(ValueError):
    pass


class AirwayLevelOutOfRangeError(ValueError):
    def __init__(self, code: str, cruise_fl: int, offending: list[dict]):
        self.code = code
        self.cruise_fl = cruise_fl
        self.offending = offending
        legs = ", ".join(
            f"{o['fromWaypoint']}->{o['toWaypoint']} (published FL{o['lowerFL']}-FL{o['upperFL']})"
            for o in offending
        )
        super().__init__(
            f"FL{cruise_fl} is outside the published band on {len(offending)} leg(s) "
            f"of {code}: {legs}"
        )


_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_RNAV2_DRAFT_PATH, encoding="utf-8") as f:
            draft = json.load(f)
        with open(_ENR31_LEGACY_PATH, encoding="utf-8") as f:
            legacy = json.load(f)

        by_code: dict[str, dict] = {}
        for a in draft["airways"]:
            by_code[a["code"]] = {"source": "rnav2Draft", "data": a}
        for r in legacy["routes"]:
            # Both sources happen not to overlap today (draft = Q16-21,
            # legacy = the 54 ENR3.1 codes), but if they ever do, the draft
            # entry wins -- it's the newer document.
            by_code.setdefault(r["code"], {"source": "enr31Legacy", "data": r})

        _cache = {"by_code": by_code, "draft_meta": draft["source"], "legacy_meta": legacy["source"]}
    return _cache


def list_airways() -> list[AirwaySummary]:
    cache = _load()
    out = []
    for code, entry in sorted(cache["by_code"].items()):
        d = entry["data"]
        out.append(AirwaySummary(
            code=code,
            source=entry["source"],
            waypoint_count=d["waypointCount"],
            segment_count=d["segmentCount"],
            is_draft=entry["source"] == "rnav2Draft",
        ))
    return out


def _leg_band(seg: dict) -> tuple[int | None, int | None]:
    """Return (lowerFL, upperFL) regardless of which source's field names
    the segment came from."""
    if "upperFL" in seg:  # ENR3.1 legacy shape
        return seg.get("lowerFL"), seg.get("upperFL")
    lower = seg.get("lowerLimit")  # RNAV2 draft shape: {"value":.., "unit":"FL"}
    upper = seg.get("upperLimit")
    return (lower["value"] if lower else None), (upper["value"] if upper else None)


def get_airway_route(
    code: str,
    direction: Literal["forward", "reverse"] = "forward",
    cruise_fl: int | None = None,
) -> list[Waypoint]:
    cache = _load()
    entry = cache["by_code"].get(code)
    if entry is None:
        raise AirwayNotFoundError(
            f"No structured data for airway {code!r} (known: {sorted(cache['by_code'])})"
        )
    d = entry["data"]
    waypoints = list(d["waypoints"])
    segments = list(d["segments"])
    if direction == "reverse":
        waypoints = list(reversed(waypoints))
        segments = list(reversed(segments))

    if cruise_fl is not None:
        offending = []
        for seg in segments:
            lower, upper = _leg_band(seg)
            if lower is not None and cruise_fl < lower:
                offending.append({**seg, "lowerFL": lower, "upperFL": upper})
            elif upper is not None and cruise_fl > upper:
                offending.append({**seg, "lowerFL": lower, "upperFL": upper})
        if offending:
            raise AirwayLevelOutOfRangeError(code, cruise_fl, offending)

    alt_ft = cruise_fl * 100 if cruise_fl is not None else None
    return [Waypoint(w["name"], w["lat"], w["lon"], alt_ft, None) for w in waypoints]
