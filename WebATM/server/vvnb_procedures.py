"""
Official VVNB (Noi Bai) SID/STAR/IAP procedure data, transcribed from the
published AIP-style tabular descriptions (PDF, read directly -- unlike the
Gia Binh .doc source, PDF text extraction preserved real spacing/columns):

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMB/PTB Nội Bài/
    SID DILEN 3A / NAKHA 3A / NAH 3A / MC 3A / HUVAN 3A / HUVAN 3B
      Coding 1/2/3.pdf   -- RNAV RWY 11L/R departures (6 transitions, all
                             from NB110; initial climb heading differs by
                             which runway is actually used -- both share
                             the same route beyond NB110)
    STAR BISON 3H Coding 1/2.pdf   -- "PMS-SOUTH": BISON/MC/HUVAN arrivals,
                                      converging at GOMEP
    STAR NAKHA 3H Coding 1/2/3.pdf -- "PMS-NORTH": DILEN/NAKHA/VDO/GASSO/
                                      DOKLA arrivals, converging at VILOX
    ILS X 11L Coding.pdf -- final approach: GOMEP/VILOX (+NB362/NB368, not
                             used here) -> NB601 -> RWY11L threshold

Real published ILS/IAP data exists ONLY for runway 11L (confirmed: this is
the only ILS coding file in this data pack) -- so ARRIVALS here use 11L.
SIDs are published as common to either runway ("INITIAL CLIMB RWY 11L" /
"INITIAL CLIMB RWY 11R" are alternate first legs off the SAME onward
route), so DEPARTURES use 11R instead (avoiding the only-ILS-covered
runway, matching this project's established VVNB convention elsewhere --
see hanoi_scenario_builder.py's VVNB_DEP_RUNWAY/VVNB_ARR_RUNWAY and
taxi_sim.py's real gate-to-11R-threshold routing, reused for departures
here instead of reimplementing).

Altitude was published in meters, speed in km/h (unlike Gia Binh's
feet/knots) -- both converted once here (round(m*3.28084) ft,
round(kmh*0.539957) kt) so the rest of this project's convention (feet,
knots) stays consistent. Window constraints (e.g. "-FL130 +FL120") are
collapsed to their average, same simplification as Gia Binh, since
BlueSky's ADDWPT takes one target altitude/speed, not an AT-OR-ABOVE/
AT-OR-BELOW range.
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
    "ASUSO": (21.498333, 105.966389),
    "BISAX": (21.022778, 105.636389),
    "BISON": (20.433333, 105.641667),
    "BUNBO": (21.707222, 106.33),
    "DILEN": (22.109722, 105.470278),
    "DOKLA": (21.070278, 106.5525),
    "DUBSI": (20.683333, 105.638889),
    "ENDIV": (21.739444, 105.698056),
    "EXOLI": (20.576667, 106.082778),
    "GASSO": (21.086667, 106.751944),
    "GOMEP": (21.177222, 105.5875),
    "HUVAN": (21.208333, 105.111389),
    "IBITO": (21.150278, 106.554167),
    "KADGA": (21.822778, 105.515556),
    "LATUS": (21.226111, 106.316111),
    "MC": (20.828056, 104.700278),
    "MEKAP": (21.395556, 106.531111),
    "MIMEK": (20.8425, 105.637778),
    "MORKO": (21.594167, 106.101111),
    "MUDAK": (20.945556, 105.048056),
    "MULEX": (21.755278, 105.400833),
    "NAH": (20.387222, 106.117778),
    "NAKHA": (21.966667, 106.493333),
    "NB110": (21.1675, 105.9925),
    "NB111": (20.959444, 105.968889),
    "NB112": (21.318056, 106.042222),
    "NB113": (21.418889, 105.697778),
    "NB114": (20.885, 105.757778),
    "NB362": (21.295, 105.542222),
    "NB368": (21.221111, 105.434167),
    "NB371": (21.013889, 105.275),
    "NB372": (20.850556, 105.325),
    "NB373": (20.7275, 105.458333),
    "NB374": (20.833611, 105.294444),
    "NB375": (20.698611, 105.440833),
    "NB376": (20.650278, 105.639167),
    "NB381": (21.7075, 105.708611),
    "NB382": (21.721389, 105.8525),
    "NB383": (21.681389, 105.990833),
    "NB384": (21.754722, 105.856111),
    "NB385": (21.710833, 106.007778),
    "NB386": (21.615, 106.129167),
    "NB601": (21.27325, 105.626167),
    "NB603": (21.246611, 105.718639),
    "NIXEV": (21.556111, 105.759444),
    "PUGIP": (21.013056, 105.239444),
    "RW11L": (21.225264, 105.792569),
    "SUBUP": (21.383889, 105.816944),
    "TUSPO": (21.731944, 106.269444),
    "VDO": (21.073333, 107.39),
    "VEMOR": (21.018056, 105.444167),
    "VILOX": (21.368889, 105.650278),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# (name, alt_ft) -- departures don't publish a speed constraint in this data
# (only altitude); climb speed schedule is handled in the scenario builder
# same as Gia Binh's departures.
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "DILEN": [("NB112", 7054), ("SUBUP", 12000), ("NB113", 14000), ("MULEX", 16000), ("DILEN", None)],
    "NAKHA": [("BUNBO", 16000), ("NAKHA", None)],
    "NAH": [("EXOLI", 16000), ("NAH", None)],
    "MC": [("NB111", 7054), ("NB114", 13000), ("VEMOR", 16000), ("MUDAK", None), ("MC", None)],
    "HUVAN_3A": [("NB111", 7054), ("NB114", 13000), ("VEMOR", 16000), ("HUVAN", None)],
    "HUVAN_3B": [("NB112", 7054), ("SUBUP", 12000), ("NB113", 14000), ("HUVAN", None)],
}

# (name, alt_ft, spd_kt) -- real published speed constraints, converted
# from km/h. South group all converge at GOMEP; North group at VILOX.
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    "BISON": [("BISON", 15000, None), ("DUBSI", 13000, None), ("NB373", None, None), ("NB372", None, None),
              ("NB371", 13000, None), ("VEMOR", None, None), ("BISAX", 6070, 221), ("GOMEP", 3937, 200)],
    "MC": [("MC", None, None), ("MUDAK", 12500, None), ("PUGIP", 11000, 251), ("NB374", None, None),
           ("NB375", None, None), ("NB376", None, None), ("MIMEK", None, None), ("BISAX", 6070, 221), ("GOMEP", 3937, 200)],
    "HUVAN": [("HUVAN", 10500, None), ("PUGIP", 11000, 251), ("NB374", None, None), ("NB375", None, None),
              ("NB376", None, None), ("MIMEK", None, None), ("BISAX", 6070, 221), ("GOMEP", 3937, 200)],
    "DILEN": [("DILEN", None, None), ("KADGA", 14000, None), ("ENDIV", 12000, 251), ("NB384", None, None),
              ("NB385", None, None), ("NB386", None, None), ("ASUSO", None, None), ("SUBUP", 5988, 221), ("VILOX", 3937, 200)],
    "NAKHA": [("NAKHA", None, None), ("TUSPO", 15000, None), ("MORKO", 14000, 251), ("NB383", None, None),
              ("NB382", None, None), ("NB381", 14000, None), ("NIXEV", None, None), ("SUBUP", 5988, 221), ("VILOX", 3937, 200)],
    "VDO": [("VDO", None, None), ("IBITO", 15000, None), ("MORKO", 14000, 251), ("NB383", None, None),
            ("NB382", None, None), ("NB381", 14000, None), ("NIXEV", None, None), ("SUBUP", 5988, 221), ("VILOX", 3937, 200)],
    "GASSO": [("GASSO", None, None), ("MEKAP", 14000, None), ("MORKO", 14000, 251), ("NB383", None, None),
              ("NB382", None, None), ("NB381", 14000, None), ("NIXEV", None, None), ("SUBUP", 5988, 221), ("VILOX", 3937, 200)],
    "DOKLA": [("DOKLA", None, None), ("MEKAP", 14000, None), ("MORKO", 14000, 251), ("NB383", None, None),
              ("NB382", None, None), ("NB381", 14000, None), ("NIXEV", None, None), ("SUBUP", 5988, 221), ("VILOX", 3937, 200)],
}

# Which merge hub each STAR group hands off to (South -> GOMEP, North -> VILOX).
_STAR_HUB = {
    "BISON": "GOMEP", "MC": "GOMEP", "HUVAN": "GOMEP",
    "DILEN": "VILOX", "NAKHA": "VILOX", "VDO": "VILOX", "GASSO": "VILOX", "DOKLA": "VILOX",
}

# Shared IAP final segment from each hub to the RWY11L threshold (real
# published RNAV/ILS X 11L data: hub already carries its own alt/spd from
# the STAR table above; NB601 at +750m=2461ft, RW11L unconstrained here --
# VNAV/ILS glide handles final touchdown).
IAP_FINAL_SEGMENT: list[tuple[str, float | None, float | None]] = [
    ("NB601", 2461, None), ("RW11L", None, None),
]

RW11L_THRESHOLD = wp("RW11L")


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route (from NB110 onward) for one of the 6 SID
    transitions, each waypoint carrying its published crossing-altitude
    constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from one of the 8 STAR transitions' own entry
    fix, through its group's merge hub (GOMEP/VILOX), to the RWY11L
    threshold (IAP final), each waypoint carrying its published altitude
    AND speed constraint where published."""
    star_legs = STAR_TRANSITIONS[transition]
    route = [wp(name, alt, spd) for name, alt, spd in star_legs]
    final_legs = IAP_FINAL_SEGMENT
    route.extend(wp(name, alt, spd) for name, alt, spd in final_legs)
    return route
