"""
Official VVDL (Lien Khuong) PBN SID/STAR/IAP procedure data, transcribed from
the published tabular descriptions:

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMN/LK/PĐ2 Chart PBN.pdf
    BMT 2J / CRA 2B / VETOM 2F DEPARTURE (SID RWY09): share DL209 as their
      common initial fix.
    BMT 2L, BMT 2M, SOSPA 3C, KADUM 2B, LUTRI 2G, VETOM 3H, SAKOD 2G
      ARRIVAL (STAR RWY09): 7 published transitions, converging either via
      DL901 (BMT 2L only) or DL902 (the other 6) into the shared IAP.
    RNP Z RWY09 (IAP): two initial-entry branches (via DL901 or DL902),
      converging through DL900(+6200) -> DL911(+5000) -> DL922(MAPT, "@3744")
      -> RWY09.

Also published in the same PDF but NOT transcribed here (capacity_scenario_
engine.py's AirportProcedures models one active runway direction per
scenario, same convention as vvcm_procedures.py/vvpq_procedures.py): RWY27's
own SID (BMT 2K/CRA 2C/VETOM 2G), STAR (BMT 2N/CRA 3D/KADUM 2C/LUTRI
2H/VETOM 2J/SAKOD 2H), and IAP (RNP Z RWY27, ILS W/X RWY09) -- RWY09 was
picked since it has the richer published 7-transition STAR set. VVDL has a
single physical runway (09/27, not a parallel pair), so dep and arr share
the same runway identifier, same convention as VVCM/VVGB.

VETOM 3F's real chain passes through an intermediate fix "GIVIK" between
DL259 and VETOM whose coordinates were never captured during transcription
(absent from the source PDF's own Waypoint List page) -- per this project's
no-fabrication rule, GIVIK is left OUT of the flown route below rather than
invented; the route goes straight from DL259 to VETOM, carrying only the
two fixes whose coordinates ARE real and published.

Altitude constraints collapse AT-OR-ABOVE(+)/AT-OR-BELOW(-) windows to their
average, same simplification as vvnb_procedures.py/vvpq_procedures.py (e.g.
KILEN's published "-FL110 +9000" -> 10000). Several STAR transitions publish
a real speed at their hand-off fix (DL901/DL902, both "-230"), so
arrival_speed_published=True, same as VVNB/VVCM/VVPQ.
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
    "BMT": (12.666528, 108.122944),
    "CRA": (11.994528, 109.219972),
    "LKH": (11.754139, 108.355194),
    "PANSO": (12.013333, 108.289444),
    "SOSPA": (11.833889, 108.640833),
    "BIXEX": (11.603611, 108.138611),
    "VETOM": (11.233056, 107.607500),
    "KADUM": (11.357222, 107.059444),
    "LUTRI": (11.161500, 107.236250),
    "SAKOD": (10.715167, 107.323611),
    "SALUV": (12.394444, 108.133889),
    "SANIV": (11.880556, 108.808056),
    "BOGOK": (12.404444, 108.190000),
    "KILEN": (12.021111, 108.410000),
    "OSURA": (12.205000, 108.363611),
    "LUXUM": (11.922500, 108.152500),
    "DL209": (11.760278, 108.495833),
    "DL219": (11.877222, 108.489167),
    "DL239": (11.643056, 108.502000),
    "DL259": (11.593611, 108.400833),
    "DL610": (11.547222, 107.890278),
    "DL620": (11.492222, 107.910278),
    "DL630": (11.458611, 107.930556),
    "DL640": (11.417778, 107.967500),
    "DL901": (11.826000, 108.156278),
    "DL902": (11.658750, 108.165528),
    "DL903": (11.664167, 108.267222),
    "DL904": (12.080278, 108.272500),
    "DL905": (12.192778, 108.141944),
    "DL900": (11.742333, 108.160917),
    "DL911": (11.746806, 108.245611),
    "DL922": (11.750417, 108.312722),
    "RWY09": (11.752242, 108.346933),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# (name, alt_ft) -- climb speed schedule handled by capacity_scenario_engine's
# BADA climb-speed helper, same as VVNB/VVGB/VVCM/VVPQ. All 3 transitions
# share DL209 as their common initial fix.
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "BMT": [("DL209", None), ("DL219", None), ("KILEN", 10000), ("OSURA", None), ("BMT", None)],
    "CRA": [("DL209", None), ("SOSPA", 8000), ("SANIV", 11000), ("CRA", 13500)],
    "VETOM": [("DL209", None), ("DL239", 10000), ("DL259", 11000), ("VETOM", None)],
}

# (name, alt_ft, spd_kt) -- real published speed constraint at each
# transition's own hand-off fix (DL901, "-230", for BMT 2L only; DL902,
# "-230", for the other 6).
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    "BMT_L": [("BMT", None, None), ("SALUV", 16000, None), ("DL905", 12000, None), ("LUXUM", 8500, None), ("DL901", 7100, 230)],
    "BMT_M": [("BMT", None, None), ("BOGOK", 16000, None), ("DL904", 12000, None), ("PANSO", 11000, None), ("DL903", 8000, None), ("DL902", 7000, 230)],
    "SOSPA": [("SOSPA", 13500, None), ("LKH", 12000, None), ("DL903", 8000, None), ("DL902", 7000, 230)],
    "KADUM": [("KADUM", None, None), ("DL610", None, None), ("BIXEX", 8100, None), ("DL902", 7000, 230)],
    "LUTRI": [("LUTRI", None, None), ("DL620", None, None), ("BIXEX", 8100, None), ("DL902", 7000, 230)],
    "VETOM": [("VETOM", 10000, None), ("DL630", None, None), ("BIXEX", 8100, None), ("DL902", 7000, 230)],
    "SAKOD": [("SAKOD", None, None), ("DL640", None, None), ("BIXEX", 8100, None), ("DL902", 7000, 230)],
}

# Shared IAP final segment (RNP Z RWY09): every STAR hands off already-
# established at DL901 or DL902 (both carry real alt/spd from the STAR table
# above), converging here through DL900(+6200) -> DL911(+5000) -> the MAPT
# (DL922, real "@3744" AT-restriction) -> RWY09 threshold (left unconstrained,
# same convention as VVNB/VVCM/VVPQ).
IAP_FINAL_SEGMENT: list[tuple[str, float | None, float | None]] = [
    ("DL900", 6200, None), ("DL911", 5000, None), ("DL922", 3744, None), ("RWY09", None, None),
]

RWY09_THRESHOLD = wp("RWY09")


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route (from DL209 onward) for one of the 3 published
    RWY09 SID transitions, each waypoint carrying its published crossing-
    altitude constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from one of the 7 STAR transitions' own entry fix,
    through its hand-off fix (DL901 or DL902), to the RWY09 threshold (IAP
    final), each waypoint carrying its published altitude AND speed
    constraint where published."""
    star_legs = STAR_TRANSITIONS[transition]
    route = [wp(name, alt, spd) for name, alt, spd in star_legs]
    route.extend(wp(name, alt, spd) for name, alt, spd in IAP_FINAL_SEGMENT)
    return route
