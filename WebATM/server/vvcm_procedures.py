"""
Official VVCM (Ca Mau) PBN SID/STAR/IAP procedure data, transcribed from the
published tabular descriptions:

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMN/CM/PD02 PBN.pdf
    ATSUK 1D DEPARTURE (SID RWY27): CF CM600 -> TF CM601 -> TF CM602(+7000)
      -> TF ATSUK
    ATSUK 1F ARRIVAL (STAR RWY27): IF ATSUK -> TF CM723(+3000,-210kt)
    RNP Z RWY27 (IAP): initial entries via CM723 or CM900, converging through
      CM722(+2000) -> CM721(+1500) -> RWY27 (MAPT, "@59", 3.0deg VPA/50ft TCH)

Also published in the same two PDFs but NOT transcribed here (capacity_
scenario_engine.py's AirportProcedures models one active runway direction
per scenario, same convention as vvpq_procedures.py): RWY09's own SID
(ATSUK 1C), STAR (ATSUK 1E), and IAP (RNP Z RWY09) -- RWY27 was picked as
the transcribed direction since it additionally publishes an ILS (ILS Y
RWY27), the richer of the two real approach options. VVCM has a single
physical runway (09/27, not a parallel pair), so dep and arr share the same
runway identifier -- same convention already used for VVGB's RWY07.

Altitude constraints collapse AT-OR-ABOVE(+)/AT-OR-BELOW(-) to their bare
number, and the one published window (RNP Z RWY27's IAF entries) to their
single real value, same simplification already used in vvnb_procedures.py/
vvpq_procedures.py. ATSUK1F's STAR DOES publish a real speed at its hand-off
fix (CM723, "-210"), so arrival_speed_published=True, same as VVNB/VVPQ.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float
    alt_ft: float | None = None
    spd_kt: float | None = None


_WP_COORDS: dict[str, tuple[float, float]] = {
    "ATSUK": (9.415556, 105.344722),
    "CM600": (9.180861, 105.052333),
    "CM601": (9.295556, 105.055417),
    "CM602": (9.361833, 105.215139),
    "CM721": (9.174833, 105.278917),
    "CM722": (9.172556, 105.362944),
    "CM723": (9.272972, 105.365694),
    "CM724": (9.072111, 105.360167),
    "CM900": (9.016833, 105.171250),
    "CM921": (9.179472, 105.104639),
    "CM922": (9.181694, 105.020417),
    "CM923": (9.282139, 105.023083),
    "CM924": (9.081278, 105.017750),
    "RWY09": (9.177450, 105.180867),
    "RWY27": (9.176867, 105.202694),
    "ICM_LLZ": (9.177528, 105.178222),
    "ICM_GP_DME": (9.175861, 105.199750),
    "CMA_VORDME": (9.176389, 105.215833),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# (name, alt_ft) -- climb speed schedule handled by capacity_scenario_engine's
# BADA climb-speed helper, same as VVNB/VVGB/VVPQ (departures don't publish a
# usable speed constraint: the real data's one speed note, "-195" at CM601,
# is actually an AT-OR-BELOW limit upstream of the engine's climb-speed
# ramp-up, not a cruise target, so it's left to BADA like the other airports).
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "ATSUK": [("CM600", None), ("CM601", None), ("CM602", 7000), ("ATSUK", None)],
}

# (name, alt_ft, spd_kt) -- real published speed constraint at the hand-off
# fix (CM723, "-210").
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    "ATSUK": [("ATSUK", None, None), ("CM723", 3000, 210)],
}

# Shared IAP final segment (RNP Z RWY27, same real fixes republished by ILS Y
# RWY27): hands off already-established at CM723 (real alt/spd from the STAR
# table above), continuing here through the intermediate/final fixes to the
# MAPT (RWY27, real "@59" AT-restriction, 3.0deg VPA/50ft TCH) -- left
# unconstrained at the threshold itself, same convention as VVNB/VVGB/VVPQ.
IAP_FINAL_SEGMENT: list[tuple[str, float | None, float | None]] = [
    ("CM722", 2000, None), ("CM721", 1500, None), ("RWY27", None, None),
]

RWY27_THRESHOLD = wp("RWY27")
RWY09_THRESHOLD = wp("RWY09")


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route (from CM600 onward) for the single published
    RWY27 SID transition, each waypoint carrying its published crossing-
    altitude constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from the STAR's own entry fix, through its
    hand-off fix (CM723), to the RWY27 threshold (IAP final), each waypoint
    carrying its published altitude AND speed constraint where published."""
    star_legs = STAR_TRANSITIONS[transition]
    route = [wp(name, alt, spd) for name, alt, spd in star_legs]
    route.extend(wp(name, alt, spd) for name, alt, spd in IAP_FINAL_SEGMENT)
    return route
