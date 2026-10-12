"""
Real VVDN (Da Nang) arrival procedure data for the "procedure_capacity"
scenario engine (capacity_scenario_engine.py) -- reuses the exact same real
DOTEN-transition waypoint/altitude chain already used throughout this
project's VVDN scenario generators (see FTS Server/scenario/_gen_vvdn_
minsep_pairs_from_doten.py's CP/ALT_FT dicts, themselves transcribed from
_KB5GEN_ARR_APPROACH_ARRxxx.scn / AIP AD2-VVDN-13-52 RNP Z RWY35L /
AD2-VVDN-13-30/32 ILS U/V, missed-approach chain). SID departure data reuses
scn_generator.py's _VVDN_SIDS_35R (already real, AIRAC 01/26) instead of
duplicating it.

KNOWN SIMPLIFICATION: VVDN publishes two distinct final approaches to RWY
35L, ILS U and ILS V (see IAP_OPTIONS below) -- but only ONE real waypoint
chain (DOTEN -> ... -> threshold) has been transcribed into this project so
far, used identically for both. Until a second, actually-differing ILS-U
track is transcribed, "ILS U 35L" and "ILS V 35L" are the same flown route
under two labels -- surfaced honestly in generated .scn headers (see
scn_generator.generate_scn_content's "IAPs:" line) as whichever label the
user picked, never invented as two different geometries.

Only one real STAR transition (DOTEN) is registered for now -- adding more
requires transcribing another real arrival's waypoint/altitude chain the
same way this one was, not guessing at one.
"""

from __future__ import annotations

from dataclasses import dataclass

from WebATM.server.scn_generator import _VVDN_RWY, _VVDN_SIDS_35R


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float
    alt_ft: float | None = None
    spd_kt: float | None = None


# Real coordinates (WGS-84) -- identical to _gen_vvdn_minsep_pairs_from_
# doten.py's CP dict, renamed "THR" -> "RW35L" for clarity alongside the
# SID side's own runway-named waypoints.
_WP_COORDS: dict[str, tuple[float, float]] = {
    "DOTEN": (15.767222, 108.118333),
    "TRACO": (15.601667, 108.142222),
    "CADAS": (15.618056, 108.262500),
    "MONRY": (15.700556, 108.250000),
    "TAMLA": (15.788333, 108.237500),
    "KALET": (15.865171, 108.224271),
    "NB2":   (15.947115, 108.212410),
    "DN351": (15.957222, 108.210944),
    "RW35L": (16.030133, 108.200372),
}

# Real altitude (ft) at each checkpoint -- identical to _gen_vvdn_minsep_
# pairs_from_doten.py's ALT_FT dict. DOTEN's 6070ft matches the spawn
# altitude used identically across every VVDN scenario generator in this
# project (CRE ...,6070,...), not invented here.
_ALT_FT: dict[str, float] = {
    "DOTEN": 6070, "TRACO": 5548, "CADAS": 5181, "MONRY": 4921, "TAMLA": 4429,
    "KALET": 2592, "NB2": 1611, "DN351": 1476, "RW35L": 0,
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


STAR_TRANSITIONS: dict[str, list[str]] = {
    "DOTEN": ["DOTEN", "TRACO", "CADAS", "MONRY", "TAMLA", "KALET", "NB2", "DN351", "RW35L"],
}

# Metadata-only IAP labels (see module docstring's KNOWN SIMPLIFICATION) --
# not yet two distinct flown geometries.
IAP_OPTIONS: list[str] = ["ILS U 35L", "ILS V 35L"]

# Rough defaults for the advanced "SID/STAR mix" form, proportional to
# scn_generator._VVDN_SIDS_35R's own weighting (_SID_W: 50/25/15/10) scaled
# down to a per-hour count in the same range VVNB/VVGB/VVPQ's defaults use --
# a scenario-authoring convenience, not a real capacity figure.
DEFAULT_SID_MIX: dict[str, int] = {"SADIN1G": 4, "KUMUN1G": 2, "PAPRA2G": 1, "XAQUA1G": 1}
DEFAULT_STAR_MIX: dict[str, int] = {"DOTEN": 4}

RW35L_THRESHOLD = wp("RW35L", _ALT_FT["RW35L"])

_rwy35r = _VVDN_RWY["35R"]
RW35R_THRESHOLD = Waypoint("RW35R", _rwy35r["thr_lat"], _rwy35r["thr_lon"], 0.0)

SID_TRANSITIONS: list[str] = list(_VVDN_SIDS_35R.keys())


def star_route(transition: str) -> list[Waypoint]:
    names = STAR_TRANSITIONS[transition]
    return [wp(n, _ALT_FT[n]) for n in names]


def sid_route(transition: str) -> list[Waypoint]:
    return [Waypoint(name, lat, lon, alt) for name, lat, lon, alt in _VVDN_SIDS_35R[transition]]


def _all_waypoints() -> dict[str, tuple[float, float]]:
    coords = dict(_WP_COORDS)
    for wpts in _VVDN_SIDS_35R.values():
        for name, lat, lon, _alt in wpts:
            coords[name] = (lat, lon)
    coords["RW35R"] = (RW35R_THRESHOLD.lat, RW35R_THRESHOLD.lon)
    return coords
