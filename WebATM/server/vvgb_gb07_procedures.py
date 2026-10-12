"""
Official VVGB (Gia Binh) runway 07 SID/STAR/IAP procedure data, transcribed
from the published AIP-style tabular descriptions:

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMB/PTB Gia Bình/
    PL1A. GB SID 07.doc        -- 5 SID transitions (NAH 5J, BIVIM 5J,
                                   NAKHA 5J, TEBAK 5J, NOB 5J)
    PL4A. GB STAR 07 (TB).doc  -- 4 STAR transitions (NAKHA 5Q, NAH 5Q,
                                   BIVIM 5Q, MC 5Q), all converging at DUBOD
    PL7A. IAP RNP Z 07.doc     -- final approach, DUBOD -> GB712 -> GB711 ->
                                   RWY07 threshold (real published coordinate)

This is the only officially published procedure set currently available for
VVGB (single runway "07", not the dual-SOIR 06L/24R + 07R/25L configuration
used by earlier AIXM/KMZ-derived work in this project) -- supersedes that
data for anything touching runway 07 traffic. Waypoint coordinates were
parsed directly from each document's own "WAYPOINT LIST" table (WGS-84
DMS), not re-derived or estimated.

Altitude constraints (the "Altitude (FT)" column) were parsed from the same
.doc files' table cells (converted to plain text via Word COM automation,
which preserves the original table's cell boundaries as \\x07/\\x0b control
characters -- naive line-based reading of the converted text runs every
cell together with no separators, which is what caused this data to be
missed on the first pass through this procedure set). Each cell holds one
of: "-" (dash, no constraint -> None here), a plain +/-nnnn value in feet, a
+/-FLnnn flight level (x100 ft), or occasionally both a floor and a ceiling
on one line (e.g. "-FL170 +FL150", a window) -- windows are collapsed to
their average for simplicity, since BlueSky's ADDWPT takes a single target
crossing altitude, not an AT-OR-ABOVE/AT-OR-BELOW range.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float
    alt_ft: float | None = None


_WP_COORDS: dict[str, tuple[float, float]] = {
    "BIKPA": (21.072194, 105.982694),
    "BISON": (20.433333, 105.641667),
    "BIVIM": (19.509444, 106.107778),
    "DUBOD": (20.879361, 106.053417),
    "ELNUM": (21.161861, 106.260778),
    "GB361": (21.412472, 106.47675),
    "GB371": (20.570278, 105.534889),
    "GB423": (21.109917, 106.374333),
    "GB424": (21.150778, 106.462389),
    "GB425": (21.032694, 106.485361),
    "GB426": (21.219111, 106.515028),
    "GB427": (20.822639, 106.448583),
    "GB428": (21.337944, 106.491528),
    "GB429": (21.329222, 106.440333),
    "GB430": (21.307694, 106.324639),
    "GB432": (21.269333, 106.119528),
    "GB612": (21.107417, 106.09175),
    "GB613": (20.914528, 106.162333),
    "GB614": (21.134583, 106.176056),
    "GB615": (20.941639, 106.246528),
    "GB616": (21.373806, 106.222),
    "GB617": (20.968889, 106.331167),
    "GB619": (20.874306, 106.365583),
    "GB621": (20.847083, 106.281),
    "GB623": (20.819972, 106.196861),
    "GB624": (20.784806, 106.087972),
    "GB625": (20.743944, 105.96175),
    "GB627": (20.517389, 105.704028),
    "GB711": (21.011278, 106.078667),
    "GB712": (20.99, 106.012861),
    "GB723": (21.060556, 106.231556),
    "GB727": (21.010361, 106.370972),
    "GB728": (20.933806, 106.369833),
    "GOVSO": (20.711722, 106.114806),
    "LANOX": (21.715278, 106.434167),
    "LASES": (20.70575, 105.844111),
    "MC": (20.828056, 104.700278),
    "NAH": (20.387222, 106.117778),
    "NAKHA": (21.966667, 106.493333),
    "NB501": (19.743889, 105.72),
    "NB502": (19.7625, 105.455556),
    "NB503": (19.878611, 105.200833),
    "NIMUX": (20.631667, 106.343889),
    "NOB": (21.213028, 105.834917),
    "OLSOK": (20.6375, 105.318889),
    "RWY07": (21.044267, 106.180986),
    "SAPDO": (21.601944, 106.523056),
    "TEBAK": (22.175, 106.675),
    "TOSCA": (19.8075, 105.958056),
}


def wp(name: str, alt_ft: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft)


# Each SID transition's leg sequence AFTER the initial "010 CA" climb-out
# (course 073M/071.1T off RWY07, no fix, altitude +430ft -- the runway
# threshold itself is the effective start point for scenario purposes, and
# GB423's own -5000 constraint is used as the first real crossing altitude).
# All 5 transitions share the first 1-2 fixes. (name, altitude_ft_or_None).
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "NAH": [("GB423", 5000), ("GB425", None), ("GB427", None), ("NIMUX", 14000), ("NAH", None)],
    "BIVIM": [("GB423", 5000), ("GB425", None), ("GB427", None), ("NIMUX", 14000), ("NAH", None), ("BIVIM", 29000)],
    "NAKHA": [("GB423", 5000), ("GB424", None), ("GB426", None), ("GB428", None), ("GB361", None), ("SAPDO", 15000), ("NAKHA", 13000)],
    "TEBAK": [("GB423", 5000), ("GB424", None), ("GB426", None), ("GB428", None), ("GB361", None), ("SAPDO", 15000), ("TEBAK", 15000)],
    "NOB": [("GB423", 5000), ("GB424", None), ("GB426", None), ("GB429", None), ("GB430", 11000), ("GB432", 13000), ("NOB", None)],
}

# Each STAR transition's own leg sequence, from its named entry fix (IF) to
# the shared hand-off fix DUBOD, where the IAP final segment takes over.
# (name, altitude_ft_or_None).
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "NAKHA": [("NAKHA", None), ("LANOX", 16000), ("GB616", 10000), ("ELNUM", None),
              ("GB617", 6000), ("GB615", 4000), ("GB613", 3000), ("DUBOD", 2000)],
    "NAH": [("NAH", 12000), ("GB623", None), ("GB621", None), ("GB619", None),
            ("GB617", None), ("GB615", 4000), ("GB613", 3000), ("DUBOD", 2000)],
    "BIVIM": [("BIVIM", 29000), ("TOSCA", None), ("NB501", None), ("NB502", None), ("NB503", None),
              ("BISON", 16000), ("GB627", None), ("LASES", None), ("GB625", 8000), ("GB624", None),
              ("GB623", None), ("GB621", None), ("GB619", None), ("GB617", None),
              ("GB615", 4000), ("GB613", 3000), ("DUBOD", 2000)],
    "MC": [("MC", None), ("OLSOK", 10000), ("GB371", 9000), ("GB627", None), ("LASES", None),
           ("GB625", 8000), ("GB624", None), ("GB623", None), ("GB621", None), ("GB619", None),
           ("GB617", None), ("GB615", 4000), ("GB613", 3000), ("DUBOD", 2000)],
}

# Shared final segment, all STARs hand off at DUBOD -> IAP takes over to the
# runway. real published RNP Z 07 final: DUBOD -> GB712 -> GB711 -> RWY07
# threshold (3.00 deg descent angle, TCH 50ft, from GB711; RWY07 itself left
# unconstrained here -- VNAV/the landing SPD schedule handles final touchdown).
IAP_FINAL_SEGMENT: list[tuple[str, float | None]] = [
    ("DUBOD", 2000), ("GB712", 2000), ("GB711", 2000), ("RWY07", None),
]

RWY07_THRESHOLD = wp("RWY07")


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route (GB423 onward) for one of the 5 SID transitions,
    each waypoint carrying its published crossing-altitude constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from one of the 4 STAR transitions' own entry fix,
    through the shared DUBOD hand-off, to the RWY07 threshold (IAP final),
    each waypoint carrying its published crossing-altitude constraint."""
    star_legs = STAR_TRANSITIONS[transition]
    final_legs = IAP_FINAL_SEGMENT[1:]  # drop DUBOD, already the STAR's last point
    return [wp(name, alt) for name, alt in star_legs + final_legs]
