"""
Official VVPQ (Phu Quoc) PBN SID/STAR/IAP procedure data, transcribed from
the published tabular descriptions:

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMN/PQ/
    2026.08.06 Dự thảo PD2 QĐ PTB PBN tại sân bay PQ.pdf
      SID RNP RWY 10L/R -- NUMDI 3D, OSOTA 3D, RG 3D, ADBOP 3D (all share
        PQ600 as common initial fix)
      SID RNP RWY 28L/R -- NUMDI 3E, OSOTA 3E, RG 3E, RG 3F, ADBOP 3E (all
        share PQ900 as common initial fix)
      STAR RNP RWY 10L/R -- NUMDI 3F, OSOTA 3F, TUNPO 3F, ADBOP 3F (hand off
        at GUKNU or LASOV)
      STAR RNP RWY 28L/R -- NUMDI 3G, OSOTA 3G, TUNPO 3G, ADBOP 3G (hand off
        at OMGUM, TIHAN, or BOTGO)
      RNP Z RWY 10L (IAP): PQ404 -> PQ402 -> PQ400 (MAPT, "@790", 3.0deg
        VPA/50ft TCH) -> RW10L
      RNP Z RWY 28L (IAP): PQ704 -> PQ712 -> RW28L (MAPT, "@73")

VVPQ has TWO independent parallel runway pairs (10L/10R and 28L/28R) --
confirmed by the PDF publishing entirely separate SID/STAR/IAP tabular
descriptions for each pair, not a shared set reused across both. Departures
use the R-end and arrivals the L-end of whichever pair is active (segregated
parallel-runway ops), matching this project's existing VVNB/old-VVPQ
convention.

The 10-side transition names (NUMDI/OSOTA/RG/ADBOP for SID, NUMDI/OSOTA/
TUNPO/ADBOP for STAR) are UNCHANGED from this module's original single-pair
version (same real route, re-verified against this PDF) so any existing
scenario config referencing them keeps working identically. The 28-side
transitions are new, suffixed "_28" to avoid name collisions (RG has two
real published 28-side variants, RG_3E and RG_3F, kept as separate entries
RG_28A/RG_28B rather than picking one arbitrarily).

Two real waypoints referenced by the 28-side SID legs (PIKUD, between
PQ620 and DOVTA on ADBOP_28) and one on the 10-side STAR (PQ500, between
OSOTA/TUNPO and GUKNU) were already transcribed with real coordinates in
this module's original single-pair version -- reused here, not re-derived.
One 28-side STAR fix (PQ800, between NUMDI and OMGUM) has no captured
coordinate in either source and is left OUT of NUMDI_28's route rather than
invented, per this project's no-fabrication rule.

Altitude constraints collapse AT-OR-ABOVE(+)/AT-OR-BELOW(-) windows to their
average (e.g. OSOTA 3D's "-8000 +6000" -> 7000), same simplification as
vvnb_procedures.py. Real speed limits ARE published on both STAR sides, so
arrival_speed_published=True, same as before.

The two pairs' shared IAP final segments are DIFFERENT real lengths (10-side:
PQ404/PQ402/PQ400/threshold = 4 waypoints; 28-side: PQ704/PQ712/threshold =
3 waypoints) -- iap_final_segment_len_by_transition (capacity_scenario_
engine.py) carries this per-transition so _enforce_merge_point_separation
slices the correct boundary for each pair instead of a single airport-wide
number silently being wrong for one of them.
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
    "ADBOP": (8.500000, 104.083333),
    "BUVSU": (9.812694, 103.848472),
    "DOVTA": (9.613944, 104.279139),
    "GUKNU": (10.297306, 103.819083),
    "LASOV": (10.085417, 103.797778),
    "MEBMI": (9.614472, 103.886667),
    "NUMDI": (10.445278, 103.776389),
    "OSOTA": (10.551944, 104.263611),
    "PIKUD": (9.812139, 104.279222),
    "PQ400": (10.178222, 103.941389),
    "PQ402": (10.184556, 103.877667),
    "PQ404": (10.191361, 103.808417),
    "PQ500": (10.275528, 104.038611),
    "PQ600": (10.152833, 104.164389),
    "PQ601": (10.303694, 104.201861),
    "PQ602": (10.369000, 104.005861),
    "PQ603": (10.392000, 103.936750),
    "PQ620": (9.916111, 104.279167),
    "RG": (9.959444, 105.133056),
    "RW10L": (10.174431, 103.979789),
    "RW10R": (10.171189, 103.979464),
    "SAMIX": (9.870000, 104.524167),
    "TIHAN": (10.106667, 104.352500),
    "TUNPO": (10.062222, 104.589444),
    "VIBIL": (9.335250, 104.061111),
    "VILIT": (9.796111, 104.914722),
    # -- 28-side (new this round) --
    "PQ900": (10.186667, 103.822667),
    "PQ901": (10.347250, 103.793944),
    "PQ902": (10.418056, 103.956194),
    "PQ903": (10.485333, 104.110528),
    "PQ920": (10.103361, 103.814306),
    "PQ921": (10.030722, 104.035889),
    "PQ922": (9.995333, 104.143611),
    "PQ930": (9.950833, 103.821833),
    "PQ931": (9.928139, 104.020389),
    "PQ932": (9.911444, 104.165694),
    "OMGUM": (10.236722, 104.204917),
    "BOTGO": (10.074417, 104.219361),
    "PQ704": (10.150389, 104.188833),
    "PQ712": (10.158389, 104.108472),
    "RW28L": (10.168492, 104.006706),
    "PQ705": (10.153583, 104.189444),
    "PQ703": (10.161417, 104.111306),
    "RW28R": (10.171461, 104.009756),
    "IQU_LLZ": (10.174722, 103.976889),
    "IQU_GP_DME": (10.172806, 104.006861),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# (name, alt_ft) -- climb speed schedule handled by capacity_scenario_
# engine's BADA climb-speed helper. 10-side: all 4 share PQ600. 28-side: all
# 5 share PQ900.
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    "NUMDI": [("PQ600", None), ("PQ601", 5000), ("PQ602", 8000), ("PQ603", 9000), ("NUMDI", None)],
    "OSOTA": [("PQ600", None), ("OSOTA", 7000)],  # published window -8000/+6000, collapsed to average
    "RG": [("PQ600", None), ("PQ620", 7000), ("SAMIX", None), ("VILIT", None), ("RG", None)],
    "ADBOP": [("PQ600", None), ("PQ620", 7000), ("PIKUD", None), ("DOVTA", None), ("VIBIL", 13500), ("ADBOP", None)],
    "NUMDI_28": [("PQ900", None), ("NUMDI", 8000)],
    "OSOTA_28": [("PQ900", None), ("PQ901", 7000), ("PQ902", 10000), ("PQ903", 12000), ("OSOTA", None)],  # PQ902 published "-FL100" collapsed to its own bound
    "RG_28A": [("PQ900", None), ("PQ920", None), ("PQ921", 7000), ("PQ922", 9000), ("SAMIX", None), ("VILIT", None), ("RG", None)],
    "RG_28B": [("PQ900", None), ("PQ920", None), ("PQ930", None), ("PQ931", 7000), ("PQ932", 9000), ("SAMIX", None), ("VILIT", None), ("RG", None)],
    "ADBOP_28": [("PQ900", None), ("PQ920", None), ("PQ930", None), ("BUVSU", None), ("MEBMI", None), ("VIBIL", 13500), ("ADBOP", None)],
}

# (name, alt_ft, spd_kt) -- real published speed constraints.
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    "NUMDI": [("NUMDI", 8000, 230), ("GUKNU", 5000, 200)],
    "OSOTA": [("OSOTA", 11000, None), ("PQ500", 9000, 230), ("GUKNU", 5000, 200)],
    "TUNPO": [("TUNPO", None, None), ("TIHAN", None, None), ("PQ500", 9000, 230), ("GUKNU", 5000, 200)],
    "ADBOP": [("ADBOP", None, None), ("VIBIL", 13500, None), ("MEBMI", None, None), ("BUVSU", None, 230), ("LASOV", 5000, 200)],
    # PQ800 (between NUMDI and OMGUM on the real chart) has no captured
    # coordinate -- omitted, route goes straight NUMDI -> OMGUM.
    "NUMDI_28": [("NUMDI", None, None), ("OMGUM", 5000, 200)],
    "OSOTA_28": [("OSOTA", 8500, 230), ("OMGUM", 5000, 200)],  # published window -FL110/+6000, collapsed to average
    "TUNPO_28": [("TUNPO", None, 230), ("TIHAN", 7000, 200)],
    "ADBOP_28": [("ADBOP", None, None), ("VIBIL", 13500, None), ("DOVTA", None, None), ("PIKUD", 8000, None), ("PQ620", None, 230), ("BOTGO", 5000, 200)],
}

# Shared IAP final segment, 10-side (RNP Z RWY10L): every 10-side STAR hands
# off already-established at GUKNU or LASOV, continuing here to the MAPT
# (PQ400, real "@790" AT-restriction, 3.0deg VPA/50ft TCH) and on to the
# RW10L threshold (left unconstrained, same convention as VVNB/VVGB).
IAP_FINAL_SEGMENT_10: list[tuple[str, float | None, float | None]] = [
    ("PQ404", 2500, None), ("PQ402", 2000, None), ("PQ400", 790, None), ("RW10L", None, None),
]

# Shared IAP final segment, 28-side (RNP Z RWY28L): every 28-side STAR hands
# off already-established at OMGUM/TIHAN/BOTGO, continuing here to the MAPT
# (RW28L itself carries the real "@73" AT-restriction -- the published final
# approach has no separate intermediate fix between PQ712 and the runway
# like the 10-side's PQ400 does).
IAP_FINAL_SEGMENT_28: list[tuple[str, float | None, float | None]] = [
    ("PQ704", 2500, None), ("PQ712", 2000, None), ("RW28L", None, None),
]

RW10L_THRESHOLD = wp("RW10L")
RW10R_THRESHOLD = wp("RW10R")
RW28L_THRESHOLD = wp("RW28L")
RW28R_THRESHOLD = wp("RW28R")

# Which runway pair each transition belongs to, and each pair's real IAP
# final-segment length -- consumed by capacity_scenario_engine.py's
# AirportProcedures.*_by_transition fields (dep_runway_by_transition,
# arr_runway_by_transition, iap_final_segment_len_by_transition) so a single
# airport registration can model both pairs correctly.
SID_RUNWAY_OF: dict[str, str] = {
    "NUMDI": "10R", "OSOTA": "10R", "RG": "10R", "ADBOP": "10R",
    "NUMDI_28": "28R", "OSOTA_28": "28R", "RG_28A": "28R", "RG_28B": "28R", "ADBOP_28": "28R",
}
STAR_RUNWAY_OF: dict[str, str] = {
    "NUMDI": "10L", "OSOTA": "10L", "TUNPO": "10L", "ADBOP": "10L",
    "NUMDI_28": "28L", "OSOTA_28": "28L", "TUNPO_28": "28L", "ADBOP_28": "28L",
}
STAR_FINAL_SEGMENT_LEN_OF: dict[str, int] = {
    "NUMDI": 4, "OSOTA": 4, "TUNPO": 4, "ADBOP": 4,
    "NUMDI_28": 3, "OSOTA_28": 3, "TUNPO_28": 3, "ADBOP_28": 3,
}


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route for one of the published SID transitions (both
    runway pairs), each waypoint carrying its published crossing-altitude
    constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from one of the published STAR transitions' own
    entry fix, through its hand-off fix, to the matching runway pair's IAP
    final segment, each waypoint carrying its published altitude AND speed
    constraint where published."""
    star_legs = STAR_TRANSITIONS[transition]
    route = [wp(name, alt, spd) for name, alt, spd in star_legs]
    final_segment = IAP_FINAL_SEGMENT_28 if transition.endswith("_28") else IAP_FINAL_SEGMENT_10
    route.extend(wp(name, alt, spd) for name, alt, spd in final_segment)
    return route


# Real published holding-pattern racetrack geometry at the two 10-side STAR
# hand-off fixes (GUKNU serves NUMDI/OSOTA/TUNPO; LASOV serves ADBOP),
# transcribed point-for-point from VVPQ.kmz's PBN/LNAV 10L+10R/Holding
# folders (Dữ liệu PTB + code/PTB QLBMN/PTB PQ/VVPQ.kmz) -- both close back
# onto their own fix (first point == last point), all at the published
# 1524ft holding altitude. Used by capacity_scenario_engine's real-schedule
# conflict resolver to send an arrival into an actual real hold (one or
# more full laps) at its own transition's real hand-off fix, instead of a
# synthetic detour, when speed reduction alone can't buy enough separation.
# 28-side hold geometry (OMGUM/TIHAN/BOTGO) was not captured this round --
# _resolve_merge_conflict_real only looks up STAR_HOLD for the 10-side
# transition names it already knows (NUMDI/OSOTA/TUNPO/ADBOP), so a 28-side
# real-schedule conflict falls through to the speed-reduction technique only
# (no silent fabrication of hold geometry for the 28 side).
HOLD_GUKNU: list[tuple[float, float]] = [
    (10.297306, 103.819083), (10.293721, 103.81851), (10.29021, 103.817585), (10.286805, 103.816316),
    (10.28354, 103.814717), (10.280446, 103.812802), (10.277552, 103.81059), (10.274887, 103.808103),
    (10.272477, 103.805364), (10.270344, 103.8024), (10.268509, 103.799238), (10.266989, 103.795911),
    (10.2658, 103.792449), (10.264953, 103.788886), (10.264455, 103.785256), (10.264313, 103.781595),
    (10.264526, 103.777937), (10.265093, 103.774318), (10.266009, 103.770773), (10.267265, 103.767335),
    (10.268848, 103.764038), (10.270744, 103.760913), (10.272934, 103.757991), (10.275397, 103.7553),
    (10.278109, 103.752866), (10.281045, 103.750711), (10.284176, 103.748858), (10.287471, 103.747323),
    (10.290899, 103.746122), (10.294428, 103.745266), (10.298023, 103.744763), (10.301649, 103.744618),
    (10.305272, 103.744834), (10.37564, 103.752525), (10.379224, 103.753098), (10.382736, 103.754023),
    (10.386141, 103.755291), (10.389406, 103.756891), (10.392501, 103.758805), (10.395395, 103.761017),
    (10.39806, 103.763505), (10.400471, 103.766245), (10.402604, 103.769211), (10.40444, 103.772373),
    (10.405959, 103.775702), (10.407149, 103.779165), (10.407996, 103.78273), (10.408493, 103.786361),
    (10.408636, 103.790024), (10.408423, 103.793683), (10.407855, 103.797304), (10.406939, 103.800851),
    (10.405683, 103.80429), (10.404099, 103.807589), (10.402203, 103.810714), (10.400012, 103.813637),
    (10.397549, 103.816329), (10.394836, 103.818763), (10.3919, 103.820918), (10.388769, 103.822771),
    (10.385473, 103.824306), (10.382045, 103.825507), (10.378516, 103.826362), (10.374921, 103.826864),
    (10.371295, 103.827008), (10.367672, 103.826792), (10.297306, 103.819083),
]
HOLD_LASOV: list[tuple[float, float]] = [
    (10.085417, 103.797778), (10.08904, 103.797991), (10.092666, 103.797845), (10.09626, 103.797341),
    (10.099789, 103.796483), (10.103217, 103.795281), (10.106511, 103.793746), (10.109641, 103.791892),
    (10.112576, 103.789737), (10.115287, 103.787302), (10.117748, 103.784611), (10.119937, 103.781689),
    (10.121831, 103.778565), (10.123412, 103.775269), (10.124666, 103.771832), (10.125579, 103.768287),
    (10.126144, 103.764669), (10.126355, 103.761013), (10.12621, 103.757353), (10.12571, 103.753726),
    (10.12486, 103.750165), (10.123668, 103.746705), (10.122146, 103.743381), (10.120308, 103.740222),
    (10.118173, 103.737261), (10.11576, 103.734525), (10.113093, 103.732042), (10.110198, 103.729834),
    (10.107102, 103.727923), (10.103835, 103.726327), (10.100429, 103.725063), (10.096917, 103.724141),
    (10.093332, 103.723571), (10.022957, 103.715937), (10.019334, 103.715725), (10.015708, 103.715872),
    (10.012113, 103.716377), (10.008585, 103.717235), (10.005158, 103.718437), (10.001863, 103.719973),
    (9.998734, 103.721827), (9.9958, 103.723982), (9.993089, 103.726416), (9.990628, 103.729107),
    (9.98844, 103.732028), (9.986547, 103.735151), (9.984966, 103.738446), (9.983712, 103.741882),
    (9.982799, 103.745425), (9.982234, 103.749041), (9.982023, 103.752696), (9.982169, 103.756354),
    (9.982669, 103.75998), (9.983519, 103.763539), (9.98471, 103.766997), (9.986232, 103.770321),
    (9.988069, 103.773478), (9.990205, 103.776438), (9.992617, 103.779173), (9.995284, 103.781656),
    (9.998179, 103.783864), (10.001275, 103.785775), (10.004541, 103.78737), (10.007947, 103.788635),
    (10.011459, 103.789557), (10.015044, 103.790128), (10.085417, 103.797778),
]
# Which real hold serves each STAR transition's hand-off fix.
STAR_HOLD: dict[str, list[tuple[float, float]]] = {
    "NUMDI": HOLD_GUKNU, "OSOTA": HOLD_GUKNU, "TUNPO": HOLD_GUKNU, "ADBOP": HOLD_LASOV,
}
