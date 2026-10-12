"""
Official VVLT (Dong Nai / Long Thanh Intl) PBN SID/STAR procedure data,
transcribed from the published tabular descriptions:

  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMN/PTB LT/
    "SID VVLT Coding 1/2/3.pdf" -- RNP RWY 23L SID: PATMA 5C, DOVIN 5F,
      BIXEX 5D, PTH 5E, PATMA 5D, ANBOV 5C, TRN 5D, POTIX 5A, ATGAS 5A,
      SAPEN 5C (all share LT601->LT602->LT603->LUTRI as common initial
      climb, except PATMA 5D and SAPEN 5C which diverge earlier/later).
    "STAR ... Coding.pdf" (x4 pages) -- RNP RWY 23L STAR: DOVIN 5H, VETOM
      5B, PTH 5G, DAGAG 5A, NIXIV 5D, TRN 5E, ANBOV 5D, SAPEN 5D + real
      holding-procedure table (ANBOV/DALAP/NOKUM/VICAL).
  vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMN/LT/PD2 Sơ đồ PBN.pdf
    pages 1-15 -- RNP RWY 05L/R SID (PATMA 5H, DOVIN 5R, BIXEX 5L, PTH
      5N/5P, ELSAS 5H, NIXIV 5K, ANHOA 5D, ENPAS 5D, POTIX 5C, ATGAS 5C,
      SAPEN 5H) and STAR (DOVIN 5S, VETOM 5D, PTH 5Q, ELSAS 5J, NIXIV 5L,
      TRN 5L, ANBOV 5F, SAPEN 5J) + holding table (ANBOV/VICAL/DALAP).

VVLT has TWO independent parallel runway pairs (05L/05R and 23L/23R),
confirmed by the source publishing entirely separate SID/STAR tabular sets
for each. Departures use the R-end, arrivals the L-end of whichever pair is
active, same segregated-parallel-ops convention as VVNB/VVPQ.

KNOWN LIMITATIONS (documented, not silently worked around):

1. No runway THRESHOLD coordinate was published in either source read this
   round (only DME distances from the LTH VOR/DME and THR ELEV, never an
   absolute lat/lon for the runway itself). LT801 (10.824556, 107.096917,
   the real published RWY05-side initial-climb fix, "DF LT801" flyover,
   immediately after liftoff) is reused as a real-but-approximate stand-in
   for BOTH pairs' thresholds -- same kind of approximation this project's
   vvnb_procedures.py already uses (its 11L threshold stands in for the
   nearby 11R).

2. Each STAR's own published tabular description ends in a real but
   AMBIGUOUS repeating sequence (e.g. DOVIN 5H: ...LT403->LT402->LT401->
   LT510->LT511->LT512->LT502->LT501->LT403 again) that reads as a real
   published racetrack/sequencing pattern at the IAF, not a one-way transit
   to the runway -- and no further "IAF to threshold" IAP tabular page was
   read this round (28 of VVLT's PBN approach-chart pages were left
   un-transcribed; see this project's task history). Rather than inventing
   a final-approach segment, every STAR_TRANSITIONS route below stops at
   its own real terminal IAF (LT903 for the 05-side, real "@-4000/+3000"
   altitude window; LT502 for the 23-side, real "@3000") -- the genuine
   published data, just short of touchdown. capacity_scenario_engine.py's
   iap_final_segment_len=1 reflects this: the LAST waypoint of every route
   IS the real merge/IAF point, with no further segment appended after it.

3. GIVIK (VVPQ has its own equivalent gap) does not appear here, but a few
   referenced fixes with no captured coordinate (PQ800-equivalents) are
   likewise never invented -- every waypoint below has a real lat/lon from
   one of the two PDFs' own Waypoint List pages.

Altitude constraints collapse AT-OR-ABOVE(+)/AT-OR-BELOW(-) windows to their
average (e.g. "-6000 +4000" -> 5000), same convention as every other
procedures module in this project. Real speed limits ARE published at
several hand-off points (e.g. LT701 "-210"), so arrival_speed_published=True.
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
    "AC_NDB": (10.939167, 107.188333),
    "ANBOV": (10.266389, 106.248333),
    "ANHOA": (9.787222, 105.908333),
    "ATGAS": (10.404722, 105.517222),
    "BIXEX": (11.603694, 108.138694),
    "DAGAG": (9.463333, 108.441667),
    "DALAP": (11.014167, 107.389389),
    "DOVIN": (11.916944, 108.108056),
    "ELSAS": (10.136667, 107.548333),
    "ENPAS": (10.399722, 106.111389),
    "LETRO": (10.477083, 106.848167),
    "LT401": (10.849139, 107.131250),
    "LT402": (10.888444, 107.186111),
    "LT403": (10.927722, 107.241000),
    "LT500": (10.970250, 107.313972),
    "LT501": (10.859917, 107.290667),
    "LT502": (10.820639, 107.235806),
    "LT503": (10.638667, 107.319083),
    "LT504": (10.539056, 107.209139),
    "LT505": (10.395917, 107.051306),
    "LT510": (10.795083, 107.055778),
    "LT511": (10.727278, 107.105472),
    "LT512": (10.781361, 107.180917),
    "LT515": (11.255889, 107.581222),
    "LT545": (10.465278, 107.127778),
    "LT600": (10.744389, 106.985028),
    "LT601": (10.867750, 106.989444),
    "LT602": (10.960083, 107.135639),
    "LT603": (10.998056, 107.195056),
    "LT604": (11.082028, 107.335722),
    "LT608": (10.631806, 106.863833),
    "LT609": (10.463250, 106.583139),
    "LT610": (10.596306, 106.487750),
    "LT611": (10.648917, 106.450000),
    "LT612": (10.704139, 106.410389),
    "LT700": (10.589583, 106.769361),
    "LT701": (10.521472, 106.819333),
    "LT702": (10.561194, 106.873861),
    "LT703": (10.600861, 106.928389),
    "LT704": (10.650639, 106.998528),
    "LT705": (10.706083, 107.075833),
    "LT706": (10.773861, 107.026167),
    "LT707": (10.658083, 106.606389),
    "LT709": (10.436083, 106.981528),
    "LT710": (10.300556, 107.238472),
    "LT711": (10.391389, 106.795472),
    "LT712": (10.301139, 106.517222),
    "LT801": (10.824556, 107.096917),
    "LT802": (10.854111, 107.372306),
    "LT803": (10.678056, 107.204222),
    "LT804": (10.585222, 107.263333),
    "LT805": (10.399444, 107.381500),
    "LT806": (10.526722, 106.993111),
    "LT807": (10.469333, 106.754167),
    "LT836": (10.577167, 107.063444),
    "LT901": (10.718417, 106.948833),
    "LT902": (10.668278, 106.878944),
    "LT903": (10.628944, 106.824139),
    "LUTRI": (11.161500, 107.236250),
    "MALAY": (10.179778, 106.409722),
    "NIXIV": (9.393333, 106.633889),
    "NOKUM": (10.582167, 106.584500),
    "PATMA": (12.336389, 107.810000),
    "POTIX": (10.234722, 105.616667),
    "PTH": (10.928056, 108.071944),
    "SAPEN": (11.020000, 106.183333),
    "TRN": (10.083389, 105.705528),
    "TS492": (10.538417, 106.694389),
    "TS496": (10.681500, 106.493639),
    "TS498": (10.731139, 106.448194),
    "TS548": (10.771556, 107.197278),
    "TS584": (10.964194, 106.314167),
    "TS816": (11.028472, 107.154361),
    "TS828": (10.451722, 106.680972),
    "VETOM": (11.233056, 107.607500),
    "VICAL": (10.146361, 106.750556),
    "XOBAV": (10.140278, 106.642500),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# (name, alt_ft) -- climb speed schedule handled by capacity_scenario_
# engine's BADA climb-speed helper, same as every other airport in this
# project.
SID_TRANSITIONS: dict[str, list[tuple[str, float | None]]] = {
    # -- RWY23L/R, common initial LT601->LT602->LT603->LUTRI --
    "PATMA_23": [("LT601", None), ("LT602", 3000), ("LT603", 3000), ("LUTRI", 10000), ("PATMA", 29000)],
    "DOVIN_23": [("LT601", None), ("LT602", 3000), ("LT603", 3000), ("LUTRI", 10000), ("DOVIN", 9000)],
    "BIXEX_23": [("LT601", None), ("LT602", 3000), ("LT603", 3000), ("LUTRI", 10000), ("BIXEX", 10000)],
    "PTH_23": [("LT601", None), ("LT602", 3000), ("LT603", 3000), ("LUTRI", 10000), ("PTH", 13500)],
    "PATMA2_23": [("LT601", None), ("LT602", 3000), ("LT603", 3000), ("LT604", 8000), ("PATMA", 29000)],
    "ANBOV_23": [("LT600", None), ("LT608", 3000), ("LT609", 5000), ("ANBOV", None)],
    "TRN_23": [("LT600", None), ("LT608", 3000), ("LT609", 5000), ("ANBOV", None), ("TRN", None)],
    "POTIX_23": [("LT600", None), ("LT608", 3000), ("LT609", 5000), ("ANBOV", None), ("POTIX", None)],
    "ATGAS_23": [("LT600", None), ("LT608", 3000), ("LT609", 5000), ("ANBOV", None), ("ATGAS", None)],
    "SAPEN_23": [("LT600", None), ("LT608", 3000), ("LT609", 5000), ("LT610", 10000), ("LT611", 10500), ("LT612", 13000), ("SAPEN", 14000)],
    # -- RWY05L/R, common initial LT801->TS816->LUTRI --
    "PATMA_05": [("LT801", None), ("TS816", 5000), ("LUTRI", None), ("PATMA", 29000)],
    "DOVIN_05": [("LT801", None), ("TS816", 5000), ("LUTRI", None), ("DOVIN", 9000)],
    "BIXEX_05": [("LT801", None), ("TS816", 5000), ("LUTRI", None), ("BIXEX", 10000)],
    "PTH_05N": [("LT801", None), ("TS816", 5000), ("LUTRI", None), ("PTH", 13500)],
    "PTH_05P": [("LT801", None), ("LT802", 5000), ("PTH", 13500)],
    "ELSAS_05": [("LT801", None), ("LT803", 3000), ("LT804", 5000), ("LT805", 12000), ("ELSAS", 13500)],
    "NIXIV_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("XOBAV", None), ("NIXIV", None)],
    "ANHOA_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("MALAY", None), ("ANHOA", None)],
    "ENPAS_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("ENPAS", None)],
    "POTIX_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("ENPAS", None), ("POTIX", None)],
    "ATGAS_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("ENPAS", None), ("ATGAS", None)],
    "SAPEN_05": [("LT801", None), ("LT803", 3000), ("LT836", 5000), ("LT806", 6000), ("LT807", 12000), ("TS828", 13000), ("SAPEN", None)],
}

# (name, alt_ft, spd_kt) -- every route stops at this airport's own real
# terminal IAF (LT903 for 05-side, LT502 for 23-side) -- see module
# docstring limitation (2).
STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    # -- RWY23L/R, terminal IAF = LT502 (real "@3000") --
    "DOVIN_23": [("DOVIN", None, None), ("LT515", 10000, None), ("DALAP", 5000, None), ("LT500", 3000, 210),
                 ("LT403", None, None), ("LT402", None, None), ("LT401", None, None), ("LT510", None, None),
                 ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    "VETOM_23": [("VETOM", 10000, None), ("DALAP", 5000, None), ("LT500", 3000, 210),
                 ("LT403", None, None), ("LT402", None, None), ("LT401", None, None), ("LT510", None, None),
                 ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    "PTH_23": [("PTH", 13500, None), ("DALAP", 5000, None), ("LT500", 3000, 210),
               ("LT403", None, None), ("LT402", None, None), ("LT401", None, None), ("LT510", None, None),
               ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    "DAGAG_23": [("DAGAG", 13500, None), ("ELSAS", 12000, None), ("LT503", 3000, None), ("LT502", None, 210),
                 ("LT501", None, None), ("LT403", None, None), ("LT402", None, None), ("LT401", None, None),
                 ("LT510", None, None), ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    "NIXIV_23": [("NIXIV", None, None), ("VICAL", None, None), ("LT505", 7000, None), ("LT545", 6000, None),
                 ("LT504", 5000, None), ("LT503", 3000, None), ("LT502", None, 210), ("LT501", None, None),
                 ("LT403", None, None), ("LT402", None, None), ("LT401", None, None), ("LT510", None, None),
                 ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    "TRN_23": [("TRN", None, None), ("ANBOV", None, None), ("NOKUM", 12000, None), ("TS492", 11000, None),
               ("LETRO", 7000, None), ("LT505", 7000, None), ("LT545", 6000, None), ("LT504", 5000, None),
               ("LT503", 3000, None), ("LT502", None, 210), ("LT501", None, None), ("LT403", None, None),
               ("LT402", None, None), ("LT401", None, None), ("LT510", None, None), ("LT511", None, None),
               ("LT512", None, None), ("LT502", 3000, None)],
    "ANBOV_23": [("ANBOV", None, None), ("NOKUM", 12000, None), ("TS492", 11000, None), ("LETRO", 7000, None),
                 ("LT505", 7000, None), ("LT545", 6000, None), ("LT504", 5000, None), ("LT503", 3000, None),
                 ("LT502", None, 210), ("LT501", None, None), ("LT403", None, None), ("LT402", None, None),
                 ("LT401", None, None), ("LT510", None, None), ("LT511", None, None), ("LT512", None, None),
                 ("LT502", 3000, None)],
    "SAPEN_23": [("SAPEN", None, None), ("TS498", 15000, None), ("TS496", 14000, None), ("NOKUM", 12000, None),
                 ("TS492", 11000, None), ("LETRO", 7000, None), ("LT505", 7000, None), ("LT545", 6000, None),
                 ("LT504", 5000, None), ("LT503", 3000, None), ("LT502", None, 210), ("LT501", None, None),
                 ("LT403", None, None), ("LT402", None, None), ("LT401", None, None), ("LT510", None, None),
                 ("LT511", None, None), ("LT512", None, None), ("LT502", 3000, None)],
    # -- RWY05L/R, terminal IAF = LT903 (real "@-4000/+3000" window, avg 3500) --
    "DOVIN_05": [("DOVIN", None, None), ("LT515", 10000, None), ("DALAP", 5000, None), ("TS548", 6000, None),
                 ("LT705", 4000, None), ("LT704", None, None), ("LT703", None, None), ("LT702", None, None),
                 ("LT701", None, 210), ("LT700", None, None), ("LT903", 3500, None)],
    "VETOM_05": [("VETOM", 10000, None), ("DALAP", 5000, None), ("TS548", 6000, None), ("LT705", 4000, None),
                 ("LT704", None, None), ("LT703", None, None), ("LT702", None, None), ("LT701", None, 210),
                 ("LT700", None, None), ("LT903", 3500, None)],
    "PTH_05": [("PTH", 13500, None), ("DALAP", 5000, None), ("TS548", 6000, None), ("LT705", 4000, None),
               ("LT704", None, None), ("LT703", None, None), ("LT702", None, None), ("LT701", None, 210),
               ("LT700", None, None), ("LT903", 3500, None)],
    "ELSAS_05": [("ELSAS", 13500, None), ("LT710", 12000, None), ("LT709", 5000, None), ("LT701", 5000, 210),
                 ("LT700", None, None), ("LT903", 3500, None)],
    "NIXIV_05": [("NIXIV", None, None), ("VICAL", 9000, None), ("LT711", 5000, None), ("LT701", None, 210),
                 ("LT700", None, None), ("LT903", 3500, None)],
    "TRN_05": [("TRN", None, None), ("ANBOV", 12000, None), ("LT712", 4000, None), ("LT701", None, 210),
               ("LT700", None, None), ("LT903", 3500, None)],
    "ANBOV_05": [("ANBOV", 12000, None), ("LT712", 4000, None), ("LT701", None, 210), ("LT700", None, None),
                 ("LT903", 3500, None)],
    "SAPEN_05": [("SAPEN", 8000, None), ("TS584", 6000, None), ("LT707", 6000, 210), ("LT700", None, None),
                 ("LT903", 3500, None)],
}

# Runway pair + IAP-segment-length maps, consumed by capacity_scenario_
# engine.py's AirportProcedures.*_by_transition fields -- same mechanism as
# vvpq_procedures.py's SID_RUNWAY_OF/STAR_RUNWAY_OF.
SID_RUNWAY_OF: dict[str, str] = {t: ("05R" if t.endswith("_05") or t.endswith("_05N") or t.endswith("_05P") else "23R")
                                  for t in SID_TRANSITIONS}
STAR_RUNWAY_OF: dict[str, str] = {t: ("05L" if t.endswith("_05") else "23L") for t in STAR_TRANSITIONS}

# LT801 reused as a real-but-approximate threshold stand-in for every runway
# end -- see module docstring limitation (1).
RWY_THRESHOLD = wp("LT801")


def sid_route(transition: str) -> list[Waypoint]:
    """Full departure route for one of the published SID transitions (both
    runway pairs), each waypoint carrying its published crossing-altitude
    constraint."""
    return [wp(name, alt) for name, alt in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """Full arrival route from one of the published STAR transitions' own
    entry fix to its own airport's terminal IAF (LT903 or LT502 -- see
    module docstring limitation (2)), each waypoint carrying its published
    altitude AND speed constraint where published."""
    return [wp(name, alt, spd) for name, alt, spd in STAR_TRANSITIONS[transition]]
