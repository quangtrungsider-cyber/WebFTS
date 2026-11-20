"""
Official VVBM (Buon Ma Thuot) SID/STAR/IAP data for the scenario engine,
transcribed BY SCRIPT (FTS Server/tools/airways/aip_pdf/gen_vvbm_module.py) from the English AIP
Viet Nam AD 2.24 pages (tabular descriptions + WAYPOINT LISTs), AMDT dated
28 FEB 2023 / 30 OCT 2022 as printed on the pages. Source pages (file ids in
PDF AIP/VVBM): SID 8b/8e (RNP RWY 09/27, 2E/2F/3E/3F), STAR 9c-9h (RNP, 2G/2H/
2J/2K/3G/3H/3J/3K), IAP 11q-11y (RNP/ILS final, RWY 09/27).

Units: the AIP publishes altitude in METRES and speed in KM/H; both are
converted once here (round(m*3.28084) ft, round(kmh*0.539957) kt) so the rest
of the project stays in feet/knots (same as vvnb_procedures.py).

HONEST SIMPLIFICATIONS (flag for review, not hidden):
 1. Constraints are published as "+" (at or above), "-" (at or below) or "@"
    (at). BlueSky's ADDWPT takes ONE target, so each constraint's numeric
    bound is used as the target (the same collapse vvnb_procedures.py makes
    for windows). The sign is NOT kept here.
 2. SID speed limits (BM412/BM712 <=463 km/h = 250 kt, BM413 <=360 km/h =
    194 kt) are stored and the departure engine uses them as the speed at
    that fix (its BADA climb schedule applies elsewhere). STAR and IAP pages
    publish NO speed (every speed cell is "-"), so arrival_speed_published=
    False and BADA fills in. SID "at or below" fixes are only met because the
    engine sends no standalone ALT cap for VVBM (dep_alt_clearance=False).
 3. The STAR entry fixes (MEVON, ENGIM, ...) publish no altitude, so the
    engine's own default spawn level applies there -- no value is invented.
 4. The shared final (IF -> RNP FAF -> threshold) is taken from the RNP
    approach tables (RNP Z/Y/X); the ILS tables in this data set list no
    altitude for the final fixes. Both share the BM611/BM911 intermediate fix.
 5. Where the AIP prints two different coordinates for the same fix on
    different pages the one from the procedure's own page family is used; see
    docs in PDF AIP/_out/VVBM/gen_report.txt (not tracked).
 6. Holding patterns and conventional (non-RNP) SID/STAR/VOR approaches are
    NOT in this data set and are not modelled.
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
    'ASUNO': (12.423056, 108.234167),
    'BITET': (12.906667, 108.248333),
    'BM411': (12.667222, 108.187778),
    'BM412': (12.818889, 108.226111),
    'BM413': (12.538611, 108.19),
    'BM414': (12.451944, 108.038611),
    'BM415': (12.306389, 107.927778),
    'BM511': (12.769444, 108.088889),
    'BM512': (12.766111, 108.286111),
    'BM513': (12.569722, 108.007222),
    'BM514': (12.568333, 108.085556),
    'BM610': (12.670056, 108.016333),
    'BM611': (12.671472, 107.93075),
    'BM612': (12.771944, 107.9325),
    'BM613': (12.571111, 107.928889),
    'BM711': (12.669444, 108.052222),
    'BM712': (12.83, 108.026389),
    'BM713': (13.031944, 108.045833),
    'BM714': (13.141111, 108.254167),
    'BM715': (13.257222, 108.476389),
    'BM811': (12.5675, 108.15),
    'BM812': (12.768333, 108.153333),
    'BM910': (12.666639, 108.223333),
    'BM911': (12.665222, 108.308917),
    'BM912': (12.765556, 108.310556),
    'BM913': (12.564722, 108.307222),
    'DOBLU': (12.829722, 108.338611),
    'DOVIN': (11.916944, 108.108056),
    'ENGIM': (13.340556, 108.139167),
    'ENRIN': (11.190833, 107.323889),
    'HINTO': (12.939167, 108.129722),
    'KONAO': (12.425833, 107.992778),
    'MEVON': (13.336389, 108.074167),
    'NOBID': (13.312222, 108.581944),
    'NUMRO': (12.505556, 107.895833),
    'ONEBI': (11.938056, 108.308611),
    'PATMA': (12.336389, 107.81),
    'RWY09': (12.668556, 108.106472),
    'RWY27': (12.6681, 108.134086),
    'VULIN': (12.397222, 108.117778),
    'XELEX': (12.919444, 108.011944),
}


def wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:
    lat, lon = _WP_COORDS[name]
    return Waypoint(name, lat, lon, alt_ft, spd_kt)


# transition -> [(waypoint, alt_ft, spd_kt)] in flight order. Names are the published
# <ENTRY/EXIT FIX>_<revision> of each RNP SID/STAR.
SID_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    'DOVIN_2E': [('BM411', None, None), ('ASUNO', 9022, None), ('DOVIN', 9022, None)],
    'ENGIM_2E': [('BM411', None, None), ('BM412', 6070, 250), ('BITET', 8038, None), ('ENGIM', 9022, None)],
    'ENRIN_2E': [('BM411', None, None), ('BM413', None, 194), ('BM414', 6562, None), ('KONAO', 8038, None), ('BM415', 9022, None), ('ENRIN', None, None)],
    'MEVON_2E': [('BM411', None, None), ('BM412', 6070, 250), ('BITET', 8038, None), ('MEVON', 9022, None)],
    'NOBID_2E': [('BM411', None, None), ('BM412', 6070, 250), ('BITET', 8038, None), ('NOBID', 8038, None)],
    'ONEBI_3E': [('BM411', None, None), ('ASUNO', 9022, None), ('ONEBI', 10007, None)],
    'DOVIN_2F': [('BM711', None, None), ('KONAO', 8038, None), ('DOVIN', 9022, None)],
    'ENGIM_2F': [('BM711', None, None), ('BM712', 6070, 250), ('XELEX', 9022, None), ('ENGIM', 9022, None)],
    'ENRIN_2F': [('BM711', None, None), ('KONAO', 8038, None), ('BM415', 9022, None), ('ENRIN', None, None)],
    'MEVON_2F': [('BM711', None, None), ('BM712', 6070, 250), ('XELEX', 9022, None), ('MEVON', 9022, None)],
    'NOBID_2F': [('BM711', None, None), ('BM712', 6070, 250), ('XELEX', 9022, None), ('BM713', None, None), ('BM714', 9022, None), ('BM715', None, None), ('NOBID', None, None)],
    'ONEBI_3F': [('BM711', None, None), ('KONAO', 8038, None), ('ONEBI', 10007, None)],
}

STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {
    'DOVIN_2G': [('DOVIN', None, None), ('VULIN', 10007, None), ('BM514', 9022, None), ('BM513', 7546, None), ('BM613', 6070, None)],
    'DOVIN_2H': [('DOVIN', None, None), ('VULIN', 10007, None), ('BM514', None, None), ('BM511', 9022, None), ('BM612', 6070, None)],
    'ENGIM_2G': [('ENGIM', None, None), ('HINTO', 10007, None), ('BM612', 6070, None)],
    'ENGIM_2H': [('ENGIM', None, None), ('HINTO', 10007, None), ('BM511', None, None), ('BM514', 9022, None), ('BM513', 7546, None), ('BM613', 6070, None)],
    'MEVON_2G': [('MEVON', None, None), ('HINTO', 10007, None), ('BM612', 6070, None)],
    'MEVON_2H': [('MEVON', None, None), ('HINTO', 10007, None), ('BM511', None, None), ('BM514', 9022, None), ('BM513', 7546, None), ('BM613', 6070, None)],
    'NOBID_2G': [('NOBID', None, None), ('DOBLU', None, None), ('BM512', None, None), ('BM511', 9022, None), ('BM612', 6070, None)],
    'ONEBI_3G': [('ONEBI', None, None), ('VULIN', 10007, None), ('BM514', 9022, None), ('BM513', 7546, None), ('BM613', 6070, None)],
    'ONEBI_3H': [('ONEBI', None, None), ('VULIN', 10007, None), ('BM514', None, None), ('BM511', 9022, None), ('BM612', 6070, None)],
    'PATMA_2G': [('PATMA', None, None), ('NUMRO', 7054, None), ('BM613', 6070, None)],
    'DOVIN_2J': [('DOVIN', None, None), ('VULIN', 10007, None), ('BM913', 6070, None)],
    'DOVIN_2K': [('DOVIN', None, None), ('VULIN', 10007, None), ('BM811', None, None), ('BM812', 9022, None), ('BM912', 6070, None)],
    'ENGIM_2J': [('ENGIM', None, None), ('HINTO', 10007, None), ('BM912', 6070, None)],
    'ENGIM_2K': [('ENGIM', None, None), ('HINTO', 10007, None), ('BM812', None, None), ('BM811', 9022, None), ('BM913', 6070, None)],
    'MEVON_2J': [('MEVON', None, None), ('HINTO', 10007, None), ('BM912', 6070, None)],
    'MEVON_2K': [('MEVON', None, None), ('HINTO', 10007, None), ('BM812', None, None), ('BM811', 9022, None), ('BM913', 6070, None)],
    'NOBID_2J': [('NOBID', None, None), ('DOBLU', 7054, None), ('BM912', 6070, None)],
    'ONEBI_3J': [('ONEBI', None, None), ('VULIN', 10007, None), ('BM913', 6070, None)],
    'ONEBI_3K': [('ONEBI', None, None), ('VULIN', 10007, None), ('BM811', None, None), ('BM812', 9022, None), ('BM912', 6070, None)],
    'PATMA_2J': [('PATMA', None, None), ('NUMRO', None, None), ('BM613', None, None), ('BM811', 9022, None), ('BM913', 6070, None)],
}

SID_RUNWAY_OF: dict[str, str] = {'DOVIN_2E': '09', 'ENGIM_2E': '09', 'ENRIN_2E': '09', 'MEVON_2E': '09', 'NOBID_2E': '09', 'ONEBI_3E': '09', 'DOVIN_2F': '27', 'ENGIM_2F': '27', 'ENRIN_2F': '27', 'MEVON_2F': '27', 'NOBID_2F': '27', 'ONEBI_3F': '27'}

STAR_RUNWAY_OF: dict[str, str] = {'DOVIN_2G': '09', 'DOVIN_2H': '09', 'ENGIM_2G': '09', 'ENGIM_2H': '09', 'MEVON_2G': '09', 'MEVON_2H': '09', 'NOBID_2G': '09', 'ONEBI_3G': '09', 'ONEBI_3H': '09', 'PATMA_2G': '09', 'DOVIN_2J': '27', 'DOVIN_2K': '27', 'ENGIM_2J': '27', 'ENGIM_2K': '27', 'MEVON_2J': '27', 'MEVON_2K': '27', 'NOBID_2J': '27', 'ONEBI_3J': '27', 'ONEBI_3K': '27', 'PATMA_2J': '27'}

# Shared final per runway: IF -> FAF -> threshold (RNP tables; see note 4).
IAP_FINAL_SEGMENT: dict[str, list[tuple[str, float | None, float | None]]] = {
    '09': [('BM611', 4429, None), ('BM610', 3445, None), ('RWY09', None, None)],  # AIP page file 8508
    '27': [('BM911', 4429, None), ('BM910', 3445, None), ('RWY27', None, None)],  # AIP page file 8534
}

RWY_THRESHOLD = {"09": wp("RWY09"), "27": wp("RWY27")}
RWY09_THRESHOLD = RWY_THRESHOLD["09"]
RWY27_THRESHOLD = RWY_THRESHOLD["27"]


def sid_route(transition: str) -> list[Waypoint]:
    return [wp(n, a, s) for n, a, s in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """STAR waypoints, then the shared IAP final for the STAR's runway."""
    route = [wp(n, a, s) for n, a, s in STAR_TRANSITIONS[transition]]
    route.extend(wp(n, a, s) for n, a, s in IAP_FINAL_SEGMENT[STAR_RUNWAY_OF[transition]])
    return route
