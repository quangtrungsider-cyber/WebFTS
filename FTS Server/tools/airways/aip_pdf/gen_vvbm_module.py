"""Sinh WebATM/server/vvbm_procedures.py tu du lieu AIP da tach (PDF AIP/_out/VVBM).

Khong tu nghi ra so lieu: do cao / toc do / toa do deu lay tu bang AIP; o "–" -> None.
Doi don vi: m -> ft (x3.28084), km/h -> kt (x0.539957), lam tron 1 lan.

Chay (sau trich_aip_pdf.py va parse_aip_tables.py):\n    .venv\\Scripts\\python.exe -I "FTS Server\\tools\\airways\\aip_pdf\\gen_vvbm_module.py"
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]                                   # goc repo
OUT = REPO / "PDF AIP" / "_out" / "VVBM"                 # ket qua cua trich_aip_pdf + parse_aip_tables
DEST = REPO / "WebATM" / "server" / "vvbm_procedures.py"

P = json.loads((OUT / "procedures.json").read_text(encoding="utf-8"))
WPP = json.loads((OUT / "waypoints_by_page.json").read_text(encoding="utf-8"))

M2FT, KMH2KT = 3.28084, 0.539957
report: list[str] = []


def km(a, b):
    return math.hypot((a[1] - b[1]) * 111.32 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 110.57) * 1000


def header_runway(stem: str) -> str:
    txt = (OUT / f"{stem}.txt").read_text(encoding="utf-8").splitlines()[:10]
    for ln in txt:
        m = re.search(r"RWY\s*(\d{2})\b", ln)
        if m and "THR" not in ln:
            return m.group(1)
    return ""


def kind(p):
    s = p["section"].upper()
    return "SID" if "DEPARTURE" in s else "STAR" if "ARRIVAL" in s else "IAP"


def tname(section: str) -> str:
    m = re.match(r"([A-Z]+)\s+(\d[A-Z])\b", section)
    return f"{m[1]}_{m[2]}" if m else ""


def val(c, conv):
    return None if c is None else round(c[1] * conv)


# --- 1. gom SID / STAR theo duong CHC ---------------------------------------
procs: dict[tuple[str, str, str], dict] = {}   # (kind, rwy, name) -> {"legs":[...], "page":stem}
for p in P:
    k = kind(p)
    if k not in ("SID", "STAR"):
        continue
    rwy = p["runway"] or header_runway(p["page_file"])
    name = tname(p["section"])
    if not (rwy and name):
        report.append(f"BO QUA {p['page_file']} {p['section']!r}: khong xac dinh duoc runway/ten")
        continue
    procs[(k, rwy, name)] = {"legs": [l for l in p["legs"] if l["wp"]], "page": p["page_file"], "code": p["code"]}

# trang cung (loai, duong CHC) -> thu tu tim toa do
pages_of: dict[tuple[str, str], list[str]] = {}
for (k, rwy, _), v in procs.items():
    pages_of.setdefault((k, rwy), [])
    if v["page"] not in pages_of[(k, rwy)]:
        pages_of[(k, rwy)].append(v["page"])
# them cac trang "a" (bang diem) cung ho: lay moi trang co RWY trung & chua dung
for p in P:
    k = kind(p)
    rwy = p["runway"] or header_runway(p["page_file"])
    if k in ("SID", "STAR") and rwy:
        pages_of.setdefault((k, rwy), [])
        if p["page_file"] not in pages_of[(k, rwy)]:
            pages_of[(k, rwy)].append(p["page_file"])
iap_pages = {"09": [], "27": []}
for p in P:
    if kind(p) == "IAP" and p["runway"] in iap_pages and p["page_file"] not in iap_pages[p["runway"]]:
        iap_pages[p["runway"]].append(p["page_file"])


def coord(name: str, pages: list[str], who: str):
    found = [(pg, WPP[pg][name]) for pg in pages if pg in WPP and name in WPP[pg]]
    if not found:
        found = [(pg, d[name]) for pg, d in sorted(WPP.items()) if name in d]
        if found:
            report.append(f"{who}: diem {name} khong co trong trang cung ho, lay tu {found[0][0]}")
    if not found:
        raise SystemExit(f"KHONG CO TOA DO cho {name} ({who})")
    base = found[0][1]
    for pg, d in found[1:]:
        dd = km((base["lat"], base["lon"]), (d["lat"], d["lon"]))
        if dd > 5:
            report.append(f"LECH TOA DO AIP: {name} {who}: {found[0][0]} vs {pg} = {dd:.0f} m (dung {found[0][0]})")
    return base["lat"], base["lon"]


wp_coords: dict[str, tuple[float, float]] = {}
sid_tab: dict[str, list] = {}
star_tab: dict[str, list] = {}
rwy_of_sid: dict[str, str] = {}
rwy_of_star: dict[str, str] = {}
for (k, rwy, name), v in sorted(procs.items(), key=lambda kv: (kv[0][1], kv[0][0], kv[0][2])):
    pages = pages_of[(k, rwy)]
    key = f"{name}"
    rows = []
    for l in v["legs"]:
        c = coord(l["wp"], pages, f"{k} {name}")
        wp_coords.setdefault(l["wp"], c)
        alt = val(l["alt"], M2FT)
        spd = val(l["speed"], KMH2KT)
        rows.append((l["wp"], alt, spd))
        for q in (l["alt"], l["speed"]):
            if q and q[0] == "RAW":
                report.append(f"RAW constraint {k} {name} {l['wp']}: {q[1]!r}")
    if k == "SID":
        sid_tab[key] = rows
        rwy_of_sid[key] = rwy
    else:
        star_tab[key] = rows
        rwy_of_star[key] = rwy

# --- 2. IAP cuoi (chung): IF -> FAF/MAPT, theo bang RNP cua tung duong CHC ---
FINAL = {}
for rwy, ifix, fafix, thr in (("09", "BM611", "BM610", "RWY09"), ("27", "BM911", "BM910", "RWY27")):
    src = None
    for p in P:
        if kind(p) == "IAP" and p["runway"] == rwy:
            ws = [l["wp"] for l in p["legs"]]
            if ifix in ws and fafix in ws and any(w and w.startswith("RWY") for w in ws):
                src = p
                break
    if src is None:
        raise SystemExit(f"khong tim thay chuoi IAP {ifix}->{fafix}->RWY{rwy}")
    legs = {l["wp"]: l for l in src["legs"] if l["wp"]}
    rows = []
    for w in (ifix, fafix):
        rows.append((w, val(legs[w]["alt"], M2FT), None))
        wp_coords.setdefault(w, coord(w, iap_pages[rwy], f"IAP final RWY{rwy}"))
    thr_key = next(w for w in legs if w.startswith("RWY"))
    wp_coords.setdefault(thr, coord(thr, iap_pages[rwy], f"THR RWY{rwy}"))
    # nguong duong CHC: khong dat do cao rang buoc (engine de VNAV/ILS xu ly), giong VVNB/VVDL
    rows.append((thr, None, None))
    FINAL[rwy] = (rows, val(legs[thr_key]["alt"], M2FT), src["page_file"])

# --- 3. in module ---------------------------------------------------------
def fmt_rows(rows):
    return "[" + ", ".join(f"({n!r}, {a!r}, {s!r})" for n, a, s in rows) + "]"


L = []
L.append('''"""
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

''')
L.append("_WP_COORDS: dict[str, tuple[float, float]] = {")
for n in sorted(wp_coords):
    lat, lon = wp_coords[n]
    L.append(f"    {n!r}: ({lat}, {lon}),")
L.append("}\n")
L.append("\ndef wp(name: str, alt_ft: float | None = None, spd_kt: float | None = None) -> Waypoint:")
L.append("    lat, lon = _WP_COORDS[name]")
L.append("    return Waypoint(name, lat, lon, alt_ft, spd_kt)\n")
L.append("\n# transition -> [(waypoint, alt_ft, spd_kt)] in flight order. Names are the published")
L.append("# <ENTRY/EXIT FIX>_<revision> of each RNP SID/STAR.")
L.append("SID_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {")
for n, rows in sid_tab.items():
    L.append(f"    {n!r}: {fmt_rows(rows)},")
L.append("}\n")
L.append("STAR_TRANSITIONS: dict[str, list[tuple[str, float | None, float | None]]] = {")
for n, rows in star_tab.items():
    L.append(f"    {n!r}: {fmt_rows(rows)},")
L.append("}\n")
L.append("SID_RUNWAY_OF: dict[str, str] = " + repr(rwy_of_sid) + "\n")
L.append("STAR_RUNWAY_OF: dict[str, str] = " + repr(rwy_of_star) + "\n")
L.append("# Shared final per runway: IF -> FAF -> threshold (RNP tables; see note 4).")
L.append("IAP_FINAL_SEGMENT: dict[str, list[tuple[str, float | None, float | None]]] = {")
for rwy, (rows, _, pg) in FINAL.items():
    L.append(f"    {rwy!r}: {fmt_rows(rows)},  # AIP page file {pg}")
L.append("}\n")
L.append('RWY_THRESHOLD = {"09": wp("RWY09"), "27": wp("RWY27")}')
L.append("RWY09_THRESHOLD = RWY_THRESHOLD[\"09\"]")
L.append("RWY27_THRESHOLD = RWY_THRESHOLD[\"27\"]\n")
L.append('''
def sid_route(transition: str) -> list[Waypoint]:
    return [wp(n, a, s) for n, a, s in SID_TRANSITIONS[transition]]


def star_route(transition: str) -> list[Waypoint]:
    """STAR waypoints, then the shared IAP final for the STAR's runway."""
    route = [wp(n, a, s) for n, a, s in STAR_TRANSITIONS[transition]]
    route.extend(wp(n, a, s) for n, a, s in IAP_FINAL_SEGMENT[STAR_RUNWAY_OF[transition]])
    return route
''')
DEST.write_text("\n".join(L), encoding="utf-8")
(OUT / "gen_report.txt").write_text("\n".join(report), encoding="utf-8")
print(f"Ghi {DEST}")
print(f"SID: {len(sid_tab)}  STAR: {len(star_tab)}  diem: {len(wp_coords)}  ghi chu: {len(report)}")
