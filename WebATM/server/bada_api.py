"""
Read-only reference view of the real BADA3 aircraft performance dataset
already vendored for BlueSky's own performance engine
(FTS Server/bluesky/traffic/performance/bada/coeff_bada.py), plus a
comparison against the newer BADA reference material the user supplied in
vietnam_ats_routes_pack/BADA/ (checked directly against the installed files,
not re-derived):

  - Installed: BADA Release 3.16, base dataset dated 24 May 2022, 264
    aircraft coefficient files (.OPF/.APF), SYNONYM.NEW mapping 1832 ICAO
    type codes to those 264 models. Byte-identical to the "bada_316_*.zip"
    base package in the supplied folder -- no newer BASE release exists yet.
  - The supplied folder's 9 monthly "bada_316_update_*" zips (2022-05
    through 2023-09) only ever replace SYNONYM.NEW (new ICAO type-code ->
    existing-model mappings), never .OPF/.APF coefficients. Diffing the
    installed SYNONYM.NEW against the newest (2023-09) one: 58 new type
    codes added, 1 removed -- all small GA/glider/homebuilt/military types
    (e.g. AT1, KF21, TUCR), none of them airliners this project's own fleet
    mix (scn_generator.AIRCRAFT_PERF) actually uses.
  - "bada_316_offISA_*.zip" adds ISA+-10/+-20 off-standard-atmosphere
    .PTD/.PTF tables for 265 aircraft -- genuinely new data, but BlueSky's
    own coeff_bada.py doesn't parse this format at all yet, so it isn't
    usable without engine changes (not made here).
  - "BADA_Family_H..." sample dataset only contains the public "DUMH" dummy
    helicopter -- the same placeholder category already vendored at
    FTS Server/pybada/src/aircraft/BADAH/DUMMY, not real per-type data (BADA
    H per-aircraft data needs a separate license EUROCONTROL doesn't
    distribute publicly).
  - The 3 "bada_315_*" zips are an older major version, and the 7 PDFs are
    EUROCONTROL's own BADA 3.16 / BADA H documentation (user manuals,
    revision summary, performance/accuracy/synonym reports) -- reference
    material, not data to import.

Conclusion: the installed BADA3 dataset is already current for this
project's actual civil-airliner fleet mix; nothing in the supplied folder
needs importing. This module surfaces that dataset (and the comparison
above) for reference inside the Scenario section, mirroring how Rules/
Constraints/Weather expose other real backend data read-only.
"""

import re
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission
from .scn_generator import AIRCRAFT_PERF

_PROJECT_ROOT = Path(__file__).parent.parent.parent
BADA_DIR = _PROJECT_ROOT / "FTS Server" / "bluesky" / "data" / "performance" / "bada"

_WEIGHT_CAT_LABEL = {"L": "Light", "M": "Medium", "H": "Heavy", "J": "Super"}

_cache: dict = {}


def _parse_release_summary() -> dict:
    path = BADA_DIR / "ReleaseSummary"
    version, release_date = "Unknown", "Unknown"
    if path.exists():
        text = path.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"BADA Release:\s+([\d.]+)", text)
        if m:
            version = m.group(1)
        m = re.search(r"Summary Date:\s+(.+)", text)
        if m:
            release_date = m.group(1).strip()
    return {"version": version, "releaseDate": release_date}


def _parse_synonyms() -> dict:
    """SYNONYM.NEW: one aircraft-type mapping per 'CD' line, fixed tokens
    (is_equivalent_marker, icao_code, manufacturer, model..., coeff_file,
    icao_designator_flag). Manufacturer/model can contain internal spaces,
    so only the first 2 and last 2 tokens are trusted positions."""
    path = BADA_DIR / "SYNONYM.NEW"
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.startswith("CD "):
            continue
        parts = [t for t in line[3:].split() if t != "/"]
        if len(parts) < 4:
            continue
        is_equiv = parts[0] == "*"
        code = parts[1]
        icao_flag = parts[-1] == "Y"
        coeff_file = parts[-2]
        manufacturer_model = " ".join(parts[2:-2])
        out[code] = {
            "code": code,
            "manufacturerModel": manufacturer_model,
            "coeffFile": coeff_file.rstrip("_"),
            "isEquivalent": is_equiv,
            "isIcaoDesignator": icao_flag,
        }
    return out


def _tokens(line: str) -> list[str]:
    """Strips the 'CD' marker and the trailing '/' column-alignment
    decoration every data line ends with."""
    return [t for t in line[2:].split() if t != "/"]


_CONFIG_PHASE_LABEL = {
    "CR": "Clean (cruise)",
    "IC": "Initial climb",
    "TO": "Takeoff",
    "AP": "Approach",
    "LD": "Landing",
}


def _parse_opf(path: Path) -> dict | None:
    """Real physical/performance fields from one .OPF file's fixed-format
    'CD' data lines (see coeff_bada.py's setOPFData for the authoritative
    block order this mirrors)."""
    lines = [l for l in path.read_text(encoding="utf-8", errors="replace").splitlines() if l.startswith("CD")]
    if len(lines) < 4:
        return None
    try:
        # Header: "<code> <numEngines> engines <engineType> <weightCat>" --
        # the literal word "engines" is always present (even for 1 engine).
        header = _tokens(lines[0])
        actype = header[0]
        num_engines = int(header[1])
        engine_type = header[3]
        weight_cat = header[4]

        mass = [float(x) for x in _tokens(lines[1])]
        envelope = [float(x) for x in _tokens(lines[2])]

        # Ground block is the LAST 'CD' line in the file (TOL/LDL/span/length)
        ground = [float(x) for x in _tokens(lines[-1])]

        # Configuration block: 5 lines, one per flight phase (CR/IC/TO/AP/LD),
        # each "<n> <phase> <name> <Vstall(KCAS)> <CD0> <CD2> <unused>" --
        # this is the ONLY place BADA publishes stall speed, and it's the
        # basis for every speed-margin figure elsewhere in this file (see
        # _derive_approach_speeds below). Lines are identified by phase code
        # rather than fixed position, since some types omit a phase.
        stall_speeds = {}
        for line in lines:
            toks = _tokens(line)
            if len(toks) >= 4 and toks[1] in _CONFIG_PHASE_LABEL:
                try:
                    stall_speeds[toks[1]] = round(float(toks[3]))
                except ValueError:
                    pass

        return {
            "code": actype.rstrip("_"),
            "numEngines": num_engines,
            "engineType": engine_type,
            "weightCategory": weight_cat,
            "weightCategoryLabel": _WEIGHT_CAT_LABEL.get(weight_cat, weight_cat),
            "mtowT": round(mass[2], 1),
            "mrefT": round(mass[0], 1),
            "mminT": round(mass[1], 1),
            "vmoKt": round(envelope[0]),
            "mmo": round(envelope[1], 2),
            "maxAltFt": round(envelope[2]),
            "tolM": round(ground[0]),
            "ldlM": round(ground[1]),
            "wingspanM": round(ground[2], 1),
            "lengthM": round(ground[3], 1),
            "stallSpeedsKcas": stall_speeds,
        }
    except (ValueError, IndexError):
        return None


def _derive_approach_speeds(stall_speeds: dict) -> dict | None:
    """NOT a raw BADA field -- BADA only publishes Vstall per configuration
    (see _parse_opf). Final-approach and touchdown reference speeds are
    estimated here using the standard operational margin convention
    (1.3x / 1.15x Vstall in landing configuration), same convention TAAM's
    own editor applies on top of BADA. Clearly flagged as derived so it's
    never mistaken for a published BADA number."""
    vld = stall_speeds.get("LD")
    if not vld:
        return None
    return {
        "vAppNormalKt": round(vld * 1.3),
        "vAppMaxKt": round(vld * 1.35),
        "vTouchdownNormalKt": round(vld * 1.15),
        "vTouchdownMaxKt": round(vld * 1.23),
        "basedOnVstallLdKcas": vld,
        "note": "Ước tính theo hệ số quy ước 1.15-1.35x Vstall(LD) — KHÔNG phải số liệu BADA gốc.",
    }


_PTD_SECTION_RE = re.compile(r"^(Low|Medium|High) mass (CLIMBS|DESCENTS)$")


def _parse_ptd(path: Path) -> dict[str, list[dict]]:
    """Detailed per-flight-level performance from a .PTD file. BADA breaks
    CLIMB into 3 sections (low/medium/high reference mass -- genuinely
    different TAS+ROC per section, unlike the single-TAS summary in .PTF),
    but typically publishes only ONE mass tier for DESCENT (usually
    'Medium'; kept as whichever tier(s) the file actually has rather than
    assuming which one)."""
    if not path.exists():
        return {}
    sections: dict[str, list[dict]] = {}
    current = None
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        m = _PTD_SECTION_RE.match(line)
        if m:
            current = f"{m.group(1).lower()}_{m.group(2).lower()}"
            sections[current] = []
            continue
        if current is None:
            continue
        toks = line.split()
        if not toks or not toks[0].isdigit():
            continue
        try:
            sections[current].append({
                "fl": int(toks[0]),
                "tasKt": float(toks[5]),
                "rateFpm": float(toks[13]),
            })
        except (ValueError, IndexError):
            continue
    return sections


def _parse_ptf_cruise(path: Path) -> dict[int, dict]:
    """Cruise TAS + fuel flow (lo/nom/hi reference mass) per flight level
    from the '|'-delimited summary table in a .PTF file. BADA's cruise
    schedule is CAS/Mach-based, so TAS itself does not vary by mass here
    (only fuel burn does) -- this is published as-is, not padded out into a
    fake min/max speed range."""
    if not path.exists():
        return {}
    out: dict[int, dict] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "|" not in line:
            continue
        cols = line.split("|")
        if len(cols) < 2:
            continue
        fl_tok = cols[0].strip()
        if not fl_tok.isdigit():
            continue
        cruise = cols[1].split()
        if len(cruise) >= 4:
            try:
                out[int(fl_tok)] = {
                    "cruiseSpeedKt": float(cruise[0]),
                    "cruiseFuelLoKgMin": float(cruise[1]),
                    "cruiseFuelNomKgMin": float(cruise[2]),
                    "cruiseFuelHiKgMin": float(cruise[3]),
                }
            except ValueError:
                pass
    return out


def _build_climb_cruise_descent_grid(ptd: dict, cruise_by_fl: dict) -> tuple[list[dict], str | None]:
    """Merges the 3 climb mass-tiers + whichever descent tier is published
    + the cruise summary into one row-per-FL table -- the BADA-native
    equivalent of TAAM's Climb/Cruise/Descent x Min/Norm/Max grid."""
    low = {r["fl"]: r for r in ptd.get("low_climbs", [])}
    nom = {r["fl"]: r for r in ptd.get("medium_climbs", [])}
    high = {r["fl"]: r for r in ptd.get("high_climbs", [])}

    descent_key = next(
        (k for k in ("medium_descents", "low_descents", "high_descents") if ptd.get(k)),
        None,
    )
    descent = {r["fl"]: r for r in ptd.get(descent_key, [])} if descent_key else {}
    descent_tier = descent_key.split("_")[0] if descent_key else None

    all_fls = sorted(set(low) | set(nom) | set(high) | set(descent) | set(cruise_by_fl))
    grid = []
    for fl in all_fls:
        c = cruise_by_fl.get(fl, {})
        grid.append({
            "fl": fl,
            "climbSpeedLoKt": low.get(fl, {}).get("tasKt"),
            "climbSpeedNomKt": nom.get(fl, {}).get("tasKt"),
            "climbSpeedHiKt": high.get(fl, {}).get("tasKt"),
            "climbRocLoFpm": low.get(fl, {}).get("rateFpm"),
            "climbRocNomFpm": nom.get(fl, {}).get("rateFpm"),
            "climbRocHiFpm": high.get(fl, {}).get("rateFpm"),
            "cruiseSpeedKt": c.get("cruiseSpeedKt"),
            "cruiseFuelLoKgMin": c.get("cruiseFuelLoKgMin"),
            "cruiseFuelNomKgMin": c.get("cruiseFuelNomKgMin"),
            "cruiseFuelHiKgMin": c.get("cruiseFuelHiKgMin"),
            "descentSpeedKt": descent.get(fl, {}).get("tasKt"),
            "descentRodFpm": descent.get(fl, {}).get("rateFpm"),
        })
    return grid, descent_tier


def _parse_apf_climb(path: Path) -> dict | None:
    """Real published climb speed schedule from one .APF file's 'AV'
    (average mass) row: CAScl1 (low-altitude climb CAS), CAScl2
    (high-altitude/high-speed climb CAS), Mcl (climb Mach above the CAS/Mach
    crossover altitude) -- see coeff_bada.py's setAPFData for the
    authoritative 9-value row layout this mirrors (only the first 3 of the
    9 values -- climb -- are needed here)."""
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.startswith("CD"):
            continue
        tokens = _tokens(line)
        if len(tokens) < 11 or tokens[1] != "AV":
            continue
        try:
            return {
                "casCl1Kt": int(tokens[2]),
                "casCl2Kt": int(tokens[3]),
                "mCl": int(tokens[4]) / 100,
            }
        except (ValueError, IndexError):
            return None
    return None


_climb_cache: dict[str, dict | None] = {}


def get_real_climb_schedule(icao_type: str) -> dict | None:
    """Public lookup used by capacity_scenario_engine.py to fly departures
    at the aircraft's own real published BADA climb speed instead of a
    generic altitude-band guess. Resolves icao_type through the real
    SYNONYM.NEW mapping (equivalence-aware) to find its coefficient file,
    same as the rest of this dataset."""
    icao_type = icao_type.upper()
    if icao_type in _climb_cache:
        return _climb_cache[icao_type]

    synonyms = _parse_synonyms()
    syn = synonyms.get(icao_type)
    # Coefficient filenames are always padded to exactly 6 characters with
    # trailing underscores (e.g. "A320__.APF") -- coeffFile here is already
    # stripped of that padding for display, so it's reconstructed here.
    padded = f"{syn['coeffFile']:_<6}" if syn else None
    result = _parse_apf_climb(BADA_DIR / f"{padded}.APF") if padded else None
    _climb_cache[icao_type] = result
    return result


_detail_cache: dict[str, dict | None] = {}


def _build_detail(icao_type: str) -> dict | None:
    """Full per-aircraft detail: everything _load_dataset already exposes,
    plus stall speeds by configuration, derived approach/touchdown speeds,
    the real published climb speed schedule, and the merged climb/cruise/
    descent-by-FL grid -- the data backing the TAAM-style detail panel."""
    icao_type = icao_type.upper()
    if icao_type in _detail_cache:
        return _detail_cache[icao_type]

    synonyms = _parse_synonyms()
    syn = synonyms.get(icao_type)
    if not syn:
        _detail_cache[icao_type] = None
        return None

    padded = f"{syn['coeffFile']:_<6}"
    opf = _parse_opf(BADA_DIR / f"{padded}.OPF")
    ptd = _parse_ptd(BADA_DIR / f"{padded}.PTD")
    cruise_by_fl = _parse_ptf_cruise(BADA_DIR / f"{padded}.PTF")
    climb_schedule = _parse_apf_climb(BADA_DIR / f"{padded}.APF")
    grid, descent_tier = _build_climb_cruise_descent_grid(ptd, cruise_by_fl)

    result = {
        "code": icao_type,
        "manufacturerModel": syn["manufacturerModel"],
        "coeffFile": syn["coeffFile"],
        "isEquivalent": syn["isEquivalent"],
        "usedInFleetMix": icao_type in AIRCRAFT_PERF,
        "performance": opf,
        "approachSpeeds": _derive_approach_speeds(opf["stallSpeedsKcas"]) if opf else None,
        "climbSchedule": climb_schedule,
        "climbCruiseDescentGrid": grid,
        "descentMassTier": descent_tier,
    }
    _detail_cache[icao_type] = result
    return result


def _load_dataset() -> dict:
    if _cache:
        return _cache

    release = _parse_release_summary()
    synonyms = _parse_synonyms()

    opf_data: dict[str, dict] = {}
    for opf_path in BADA_DIR.glob("*.OPF"):
        parsed = _parse_opf(opf_path)
        if parsed:
            opf_data[parsed["code"]] = parsed

    fleet_mix_codes = set(AIRCRAFT_PERF.keys())

    aircraft = []
    for code, syn in synonyms.items():
        model = opf_data.get(syn["coeffFile"])
        aircraft.append({
            "code": code,
            "manufacturerModel": syn["manufacturerModel"],
            "coeffFile": syn["coeffFile"],
            "isEquivalent": syn["isEquivalent"],
            "isIcaoDesignator": syn["isIcaoDesignator"],
            "usedInFleetMix": code in fleet_mix_codes,
            "performance": model,
        })
    aircraft.sort(key=lambda a: (not a["usedInFleetMix"], a["code"]))

    _cache["release"] = release
    _cache["aircraft"] = aircraft
    _cache["synonymCount"] = len(synonyms)
    _cache["coeffFileCount"] = len(opf_data)
    _cache["fleetMixCodes"] = sorted(fleet_mix_codes)
    return _cache


# Real, already-computed comparison against vietnam_ats_routes_pack/BADA/ --
# see this module's docstring for how each figure was derived.
COMPARISON_NOTES = {
    "installedRelease": "3.16",
    "installedReleaseDate": "24 May 2022",
    "suppliedBaseIdentical": True,
    "suppliedSynonymUpdatesAvailableThrough": "2023-09",
    "newAircraftTypeCodesInLatestUpdate": 58,
    "removedAircraftTypeCodesInLatestUpdate": 1,
    "newCodesAreFleetRelevant": False,
    "offIsaDataAvailable": True,
    "offIsaWiredIntoEngine": False,
    "badaFamilyHSampleIsDummyOnly": True,
}


def register_bada_routes(app):
    @app.route("/api/bada/status", methods=["GET"])
    @require_permission("scenarios.read")
    def get_bada_status():
        try:
            ds = _load_dataset()
            return jsonify({
                "release": ds["release"],
                "synonymCount": ds["synonymCount"],
                "coeffFileCount": ds["coeffFileCount"],
                "fleetMixCodes": ds["fleetMixCodes"],
                "comparison": COMPARISON_NOTES,
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/bada/aircraft", methods=["GET"])
    @require_permission("scenarios.read")
    def get_bada_aircraft():
        try:
            ds = _load_dataset()
            q = (request.args.get("q") or "").strip().upper()
            fleet_only = request.args.get("fleetOnly") == "true"
            items = ds["aircraft"]
            if fleet_only:
                items = [a for a in items if a["usedInFleetMix"]]
            if q:
                items = [a for a in items if q in a["code"] or q in a["manufacturerModel"].upper()]
            return jsonify(items)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/bada/aircraft/<code>", methods=["GET"])
    @require_permission("scenarios.read")
    def get_bada_aircraft_detail(code):
        try:
            detail = _build_detail(code)
            if detail is None:
                return jsonify({"error": f"Unknown ICAO type code: {code}"}), 404
            return jsonify(detail)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
