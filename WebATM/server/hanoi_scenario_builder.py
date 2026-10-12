"""
Orchestrator: Hanoi_FlightPlan_Jan14_2026.csv -> flyable VVNB+VVGB .scn,
with BlueSky's built-in ASAS conflict detection + MVP resolution enabled
(the "ASM-App" decision-support brain -- see traffic/asas/statebased.py +
mvp.py in the vendored BlueSky engine; this module only has to enable it
and assign real SID/STAR, not implement conflict resolution itself).

The CSV already carries the real enroute fix chain per flight (the
`Waypoints` column), so unlike the seasonal-Excel pipeline
(seasonal_plan_parser -> route_resolver's airway-chaining), no airway
lookup is needed here -- just a name -> coordinate table covering VVNB's
named fixes (vietnam_ats_routes_pack/vietnam_ats_waypoints.geojson) and
VVGB's (already loaded into procedures_by_airport/vatm_procedures_VVGB.geojson).
SID/STAR assignment reuses route_resolver.resolve_departure_procedure/
resolve_arrival_procedure verbatim -- already confirmed to work for VVGB.

Known gap: VVGB has no apron/taxiway data, so VVGB departures spawn at the
ARP instead of taxiing from a real gate like VVNB (taxi_sim.py) does. SID/
STAR/IAP data itself is real AIXM (STAR + synthetic-IAP-final-segment only
cover the 06L/25L runway ends -- see procedures_index.json).

    hanoi_fpl_parser -> hanoi_scenario_builder
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from WebATM.server.hanoi_fpl_parser import parse_hanoi_fpl
from WebATM.server.scn_generator import AIRCRAFT_PERF, _fmt
from WebATM.server.route_resolver import (
    Waypoint,
    _active_aixm_dataset_dir,
    resolve_arrival_procedure,
    resolve_departure_procedure,
)
from WebATM.server.separation_rules import (
    ScheduledFlight,
    apply_rules,
)
from WebATM.server.taxi_sim import (
    TAXI_SPEED_KT,
    assign_gates,
    build_taxi_route,
    load_vvnb_gates,
    simulate_ground_queue,
    taxi_minutes_for_nm,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_PACK_DIR = REPO_ROOT / "vietnam_ats_routes_pack"

VVGB_ARP = Waypoint("VVGB", 21.042644, 106.202514)

# VVGB runs SOIR (segregated independent parallel runways). Runway roles are
# a scenario input (not fixed by the airport's own geometry) -- of the two
# runway ends with real published STAR data in the active AIXM dataset
# (06L, 25L; see procedures_index.json), this capacity-test scenario departs
# 06L and lands 25L.
VVGB_ARR_RUNWAY = "25L"
VVGB_DEP_RUNWAY = "06L"

# VVNB fixed runway roles for this capacity-test scenario: 11L lands, 11R
# departs (no round-robin alternation between the two, unlike the general
# DEFAULT_RUNWAYS round-robin pool -- matches VVGB's fixed-role SOIR setup
# above so both airports are modeled the same way for this test).
VVNB_ARR_RUNWAY = "11L"
VVNB_DEP_RUNWAY = "11R"

# BlueSky's built-in conflict-detection + MVP resolution ("ASM-App"),
# enabled once at scenario start. RPZ 3NM matches the radar separation
# already used throughout this project (see project memory
# project-vvnb-airport-data); DHPZ 1000ft is the standard half-height
# below FL290 (pre-RVSM style separation).
_ASAS_HEADER = [
    "00:00:00.00>ASAS ON",
    "00:00:00.00>RESO MVP",
    "00:00:00.00>RPZ 3",
    "00:00:00.00>DHPZ 1000",
    "",
]

_NAME_NOISE_PREFIXES = (re.compile(r"^\+/-\s*\d+\s*NM\s+"), re.compile(r"^ACC\s+"))
_NAME_SUFFIX_RE = re.compile(r"\s*\(\d+\)\s*$")


def _base_name(raw: str) -> str:
    name = raw
    for pat in _NAME_NOISE_PREFIXES:
        name = pat.sub("", name)
    return _NAME_SUFFIX_RE.sub("", name).strip()


_waypoint_cache: dict[str, Waypoint] | None = None


def _load_hanoi_waypoints() -> dict[str, Waypoint]:
    """Combined name -> Waypoint lookup: VVNB's named ATS fixes (already
    used by route_resolver.py) plus VVGB's (already loaded into
    procedures_by_airport/vatm_procedures_VVGB.geojson -- reused here
    rather than re-parsing VVGB.kmz). First occurrence wins on name clash."""
    global _waypoint_cache
    if _waypoint_cache is not None:
        return _waypoint_cache

    wps: dict[str, Waypoint] = {
        "VVNB": Waypoint("VVNB", 21.2187, 105.8072),
        "VVGB": VVGB_ARP,
        # DILEN isn't in vietnam_ats_waypoints.geojson but is a real, official
        # VVNB SID/STAR fix -- see project memory project-vvnb-sid-star-ils
        # (Vietnam AIP coordinates).
        "DILEN": Waypoint("DILEN", 22.10972, 105.47028),
        # These enroute fixes were only reachable before via the old KMZ-
        # derived VVGB procedure file's own leg endpoints (which happened to
        # pass through them); after replacing that file with the real AIXM
        # SID/STAR data (whose transitions don't extend this far), they're
        # not in either lookup below anymore. Coordinates from the AIXM
        # DesignatedPoint/Navaid data (BQ/WUY/XEREN/LON) and the old KMZ
        # backup (VIN) -- see 2026.07.01 NB-GB-BOEING_v5.4.xml.
        "BQ": Waypoint("BQ", 21.215, 104.038056),
        "WUY": Waypoint("WUY", 22.585, 108.148333),
        "XEREN": Waypoint("XEREN", 22.426667, 107.255),
        "LON": Waypoint("LON", 22.356667, 106.868333),
        "VIN": Waypoint("VIN", 18.734111, 105.668389),
    }

    with open(ROUTES_PACK_DIR / "vietnam_ats_waypoints.geojson", encoding="utf-8") as f:
        data = json.load(f)
    for feat in data["features"]:
        name = _base_name(feat["properties"]["name"])
        lon, lat = feat["geometry"]["coordinates"][:2]
        wps.setdefault(name, Waypoint(name, lat, lon))

    vvgb_path = _active_aixm_dataset_dir() / "procedures_by_airport" / "vatm_procedures_VVGB.geojson"
    with open(vvgb_path, encoding="utf-8") as f:
        vvgb_data = json.load(f)
    for feat in vvgb_data["features"]:
        from_name, to_name = feat["properties"]["name"].split("-", 1)
        # AIXM-derived legs (unlike the old KMZ ones) can carry more than 2
        # points per curve -- only the endpoints matter for this name lookup.
        coords = feat["geometry"]["coordinates"]
        (lon1, lat1), (lon2, lat2) = coords[0], coords[-1]
        wps.setdefault(from_name, Waypoint(from_name, lat1, lon1))
        wps.setdefault(to_name, Waypoint(to_name, lat2, lon2))

    _waypoint_cache = wps
    return wps


_vvgb_procedures_cache: dict[str, list[Waypoint]] | None = None


def _load_vvgb_procedures_by_variant() -> dict[str, list[Waypoint]]:
    """variant procedure_name -> ordered Waypoint chain, straight from
    vatm_procedures_VVGB.geojson (features are stored in leg sequence order
    per variant, per how hanoi_scenario_builder's own AIXM importer wrote
    them -- see build_vvgb_aixm_replacement_v2.py)."""
    global _vvgb_procedures_cache
    if _vvgb_procedures_cache is not None:
        return _vvgb_procedures_cache

    vvgb_path = _active_aixm_dataset_dir() / "procedures_by_airport" / "vatm_procedures_VVGB.geojson"
    with open(vvgb_path, encoding="utf-8") as f:
        vvgb_data = json.load(f)

    variants: dict[str, list[Waypoint]] = {}
    for feat in vvgb_data["features"]:
        variant = feat["properties"]["procedure_name"]
        from_name, to_name = feat["properties"]["name"].split("-", 1)
        coords = feat["geometry"]["coordinates"]
        chain = variants.setdefault(variant, [])
        if not chain:
            chain.append(Waypoint(from_name, coords[0][1], coords[0][0]))
        for lon, lat in coords[1:]:
            chain.append(Waypoint(to_name, lat, lon))
    _vvgb_procedures_cache = variants
    return variants


def _resolve_vvgb_procedure(proc_type: str, runway: str, target_lat: float, target_lon: float) -> list[Waypoint]:
    """Runway-scoped SID/STAR lookup for VVGB, bypassing
    route_resolver.py's generic per-airport graph -- which, now that VVGB's
    AIXM data covers 4 SID runways and shares entry-fix names across them
    (e.g. "NAKHA" feeds both the 06L and 25L STARs), can no longer reliably
    tell which runway's procedure a given flight should actually fly (its
    BFS only knows "closest root" / "most or fewest hops", not which
    runway is active). Since this scenario pins one fixed runway per
    movement, filtering vatm_procedures_VVGB.geojson's own procedure_name
    (which already encodes the runway -- "VVGB_{SID,STAR}_{runway}_...")
    and picking the best-matching variant directly is unambiguous."""
    variants = _load_vvgb_procedures_by_variant()
    prefix = f"VVGB_{proc_type}_{runway}_"
    candidates = {name: chain for name, chain in variants.items() if name.startswith(prefix)}
    if not candidates:
        return []

    if proc_type == "SID":
        # Target-aware, like route_resolver's own SID resolution: pick the
        # variant whose final point lands closest to the flight's first
        # real enroute fix.
        def dist(chain: list[Waypoint]) -> float:
            wp = chain[-1]
            return (wp.lat - target_lat) ** 2 + (wp.lon - target_lon) ** 2
        return min(candidates.values(), key=dist)

    # STAR: the runway's final-approach bridge (hand-off fix -> threshold,
    # see build_vvgb_aixm_replacement_v2.py) is its own separate variant --
    # pick the best real entry-fix variant, then append the bridge chain
    # (dropping its first point, which duplicates the entry variant's last).
    final_key = f"VVGB_STAR_{runway}_FINAL_APPROACH"
    final_chain = candidates.pop(final_key, [])
    if not candidates:
        return final_chain
    best = max(candidates.values(), key=len)
    star = best + final_chain[1:] if (final_chain and best and best[-1].name == final_chain[0].name) else best + final_chain

    # VVGB currently publishes only ONE real entry per runway (e.g. NAKHA
    # for 25L) -- a flight whose real enroute chain approaches from a
    # different direction (e.g. via BISON, which only exists as a 06L
    # entry) would otherwise get joined at the STAR's own first point,
    # producing a huge (100+ NM) instantaneous jump that both looks wrong
    # and can crash the sim's autopilot. Splice in at whichever point of
    # the chain is actually closest to the flight instead -- an
    # approximation of the vectoring a real controller would apply to
    # join traffic onto the active runway's one published corridor.
    def sqdist(wp: Waypoint) -> float:
        return (wp.lat - target_lat) ** 2 + (wp.lon - target_lon) ** 2

    closest_idx = min(range(len(star)), key=lambda i: sqdist(star[i]))
    return star[closest_idx:]


@dataclass
class ResolvedFlight:
    scheduled: ScheduledFlight
    route: list[Waypoint]
    unresolved_waypoints: list[str] = field(default_factory=list)


@dataclass
class HanoiScenario:
    flights: list[ResolvedFlight]
    warnings: list[str]
    skipped_no_route: int


def build_hanoi_scenario(csv_path: str, *, max_minutes: int | None = None) -> HanoiScenario:
    """Resolve every VVNB/VVGB-touching flight in the CSV into a scheduled,
    flyable route. `max_minutes` optionally caps to the first N minutes of
    the schedule (for building a smaller demo/test scenario)."""
    parsed = parse_hanoi_fpl(csv_path)
    wps = _load_hanoi_waypoints()
    gates = load_vvnb_gates()

    warnings: list[str] = []
    skipped_no_route = 0

    by_airport_dep: dict[str, list[ScheduledFlight]] = {"VVNB": [], "VVGB": []}
    by_airport_arr: dict[str, list[ScheduledFlight]] = {"VVNB": [], "VVGB": []}
    routes_by_callsign: dict[str, list[Waypoint]] = {}

    for f in parsed.flights:
        if max_minutes is not None and f.etd_minutes > max_minutes:
            continue

        enroute: list[Waypoint] = []
        unresolved: list[str] = []
        for name in f.waypoints:
            wp = wps.get(name)
            if wp is None:
                unresolved.append(name)
                continue
            enroute.append(wp)
        if len(enroute) < 2:
            skipped_no_route += 1
            if unresolved:
                warnings.append(f"{f.callsign}: no usable route, unresolved fixes {unresolved}")
            continue
        if unresolved:
            warnings.append(f"{f.callsign}: skipped unresolved fixes {unresolved}")

        # The CSV's own Waypoints column starts/ends with the Hanoi airport
        # name itself (e.g. "VVNB MC LAVOS", "LADON BQ HUVAN VVNB") -- that
        # placeholder token is dropped from the enroute core once a real
        # SID/STAR takes over that end, or it ends up duplicated mid-route.
        sid_target = enroute[1] if f.orig in ("VVNB", "VVGB") and len(enroute) > 1 else None
        star_target = enroute[-2] if f.dest in ("VVNB", "VVGB") and len(enroute) > 1 else None

        core = enroute
        if f.orig in ("VVNB", "VVGB") and core and core[0].name == f.orig:
            core = core[1:]
        if f.dest in ("VVNB", "VVGB") and core and core[-1].name == f.dest:
            core = core[:-1]

        route: list[Waypoint] = list(core)
        if sid_target is not None:
            if f.orig == "VVGB":
                # route_resolver's generic per-airport graph can no longer
                # disambiguate VVGB's now-4-runway AIXM SID data (see
                # _resolve_vvgb_procedure) -- go straight to the runway
                # pinned for this scenario instead.
                sid = _resolve_vvgb_procedure("SID", VVGB_DEP_RUNWAY, sid_target.lat, sid_target.lon)
            else:
                sid = resolve_departure_procedure(f.orig, sid_target.lat, sid_target.lon)
            if sid:
                # The SID's own last node is often the very fix the CSV
                # route already starts at (both resolved to the same real
                # waypoint) -- drop the duplicate rather than fly it twice.
                if route and sid[-1].name == route[0].name:
                    route = route[1:]
                route = sid + route
        if star_target is not None:
            if f.dest == "VVGB":
                star = _resolve_vvgb_procedure("STAR", VVGB_ARR_RUNWAY, star_target.lat, star_target.lon)
            else:
                star = resolve_arrival_procedure(f.dest, star_target.lat, star_target.lon)
            if star:
                if route and star[0].name == route[-1].name:
                    star = star[1:]
                route = route + star

        routes_by_callsign[f.callsign] = route

        if f.orig in ("VVNB", "VVGB"):
            by_airport_dep[f.orig].append(
                ScheduledFlight(flight=f, movement="dep", scheduled_minutes=f.etd_minutes)
            )
        if f.dest in ("VVNB", "VVGB"):
            by_airport_arr[f.dest].append(
                ScheduledFlight(flight=f, movement="arr", scheduled_minutes=f.eta_minutes)
            )

    all_scheduled: list[ScheduledFlight] = []

    # --- VVNB: real gates/taxi + existing runway rules ---
    vvnb_dep = by_airport_dep["VVNB"]
    vvnb_arr = by_airport_arr["VVNB"]
    assign_gates(vvnb_dep, gates)
    taxi_minutes: dict[str, float] = {}
    for sf in vvnb_dep:
        gate_wp = gates[sf.gate]
        taxi_route, taxi_nm = build_taxi_route(gate_wp)
        sf.taxi_route = taxi_route
        taxi_minutes[sf.flight.callsign] = taxi_minutes_for_nm(taxi_nm)
    simulate_ground_queue(vvnb_dep, taxi_minutes)
    for sf in vvnb_dep:
        sf.runway = VVNB_DEP_RUNWAY
    for sf in vvnb_arr:
        sf.runway = VVNB_ARR_RUNWAY
    all_scheduled += apply_rules(vvnb_dep + vvnb_arr)

    # --- VVGB: fixed SOIR runways (06L departure / 25L arrival), no taxi data ---
    vvgb_dep = by_airport_dep["VVGB"]
    vvgb_arr = by_airport_arr["VVGB"]
    for sf in vvgb_dep:
        sf.runway = VVGB_DEP_RUNWAY
    for sf in vvgb_arr:
        sf.runway = VVGB_ARR_RUNWAY
    all_scheduled += apply_rules(vvgb_dep + vvgb_arr)

    resolved = [
        ResolvedFlight(scheduled=sf, route=routes_by_callsign[sf.flight.callsign])
        for sf in all_scheduled
    ]
    return HanoiScenario(flights=resolved, warnings=warnings, skipped_no_route=skipped_no_route)


# ---------------------------------------------------------------------------
# .scn emission
# ---------------------------------------------------------------------------

_MAX_ADDWPT = 60
_ARR_TAXI_BUFFER_MIN = 5
_VVGB_CENTRE = (VVGB_ARP.lat, VVGB_ARP.lon)


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _emit_dep(rf: ResolvedFlight) -> list[str]:
    f = rf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    t_takeoff = rf.scheduled.adjusted_minutes * 60

    lines = [f"# --- {cs} DEP {f.orig}->{f.dest} ({f.aircraft_type}) ---"]

    taxi_route = rf.scheduled.taxi_route
    if taxi_route:
        gate = taxi_route[0]
        t_push = f.etd_minutes * 60
        hdg0 = round(_bearing(gate.lat, gate.lon, taxi_route[1].lat, taxi_route[1].lon)) if len(taxi_route) > 1 else 0
        lines.append(f"{_fmt(t_push)}>CRE {cs},{f.aircraft_type},{gate.lat:.6f},{gate.lon:.6f},{hdg0},0,{TAXI_SPEED_KT:.0f}")
        lines.append(f"{_fmt(t_push)}>{cs} ORIG {f.orig}")
        lines.append(f"{_fmt(t_push)}>{cs} DEST {f.dest}")
        for wp in taxi_route[1:]:
            lines.append(f"{_fmt(t_push)}>{cs} ADDWPT {wp.lat:.6f},{wp.lon:.6f},0")
        lines.append(f"{_fmt(t_push)}>{cs} LNAV ON")
        lines.append(f"{_fmt(t_push)}>{cs} VNAV ON")
    else:
        lat, lon = _VVGB_CENTRE
        hdg = round(_bearing(lat, lon, rf.route[0].lat, rf.route[0].lon)) if rf.route else 0
        lines.append(f"{_fmt(t_takeoff)}>CRE {cs},{f.aircraft_type},{lat:.6f},{lon:.6f},{hdg},50,{perf['v2']}")
        lines.append(f"{_fmt(t_takeoff)}>{cs} ORIG {f.orig}")
        lines.append(f"{_fmt(t_takeoff)}>{cs} DEST {f.dest}")

    for wp in rf.route[:_MAX_ADDWPT]:
        lines.append(f"{_fmt(t_takeoff)}>{cs} ADDWPT {wp.lat:.6f},{wp.lon:.6f}")
    lines.append(f"{_fmt(t_takeoff)}>{cs} SPD {perf['v2'] + 30}")
    if not taxi_route:
        lines.append(f"{_fmt(t_takeoff)}>{cs} LNAV ON")
        lines.append(f"{_fmt(t_takeoff)}>{cs} VNAV ON")
    lines.append(f"{_fmt(t_takeoff)}>{cs} ALT FL200")
    # Plain "DEL {cs}" (no "{cs} " target prefix) -- see flightplan_scenario_
    # builder._emit_dep's comment: the prefix form gets parsed as a
    # duplicate acid argument by BlueSky's stack, which desyncs the
    # aircraft id list from the numpy position arrays on every delete and
    # eventually crashes the sim once enough deletes accumulate.
    lines.append(f"{_fmt(t_takeoff + 3600)}>DEL {cs}")
    lines.append("")
    return lines


def _emit_arr(rf: ResolvedFlight) -> list[str]:
    f = rf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    landing_min = rf.scheduled.adjusted_minutes
    spawn_min = max(0, landing_min - 40)  # arrive from ~40 sim-minutes out
    t0 = spawn_min * 60

    if not rf.route:
        return []
    first = rf.route[0]
    hdg = round(_bearing(first.lat, first.lon, rf.route[min(1, len(rf.route) - 1)].lat,
                          rf.route[min(1, len(rf.route) - 1)].lon))

    lines = [f"# --- {cs} ARR {f.orig}->{f.dest} ({f.aircraft_type}) ---"]
    lines.append(f"{_fmt(t0)}>CRE {cs},{f.aircraft_type},{first.lat:.6f},{first.lon:.6f},{hdg},FL200,{perf['vapp'] + 60}")
    lines.append(f"{_fmt(t0)}>{cs} ORIG {f.orig}")
    lines.append(f"{_fmt(t0)}>{cs} DEST {f.dest}")
    for wp in rf.route[1:_MAX_ADDWPT]:
        lines.append(f"{_fmt(t0)}>{cs} ADDWPT {wp.lat:.6f},{wp.lon:.6f}")
    lines.append(f"{_fmt(t0)}>{cs} SPD {perf['vapp'] + 40}")
    lines.append(f"{_fmt(t0)}>{cs} LNAV ON")
    lines.append(f"{_fmt(t0)}>{cs} VNAV ON")
    t_land = landing_min * 60
    lines.append(f"{_fmt(t_land)}>{cs} SPD {perf['vapp']}")
    lines.append(f"{_fmt(t_land + _ARR_TAXI_BUFFER_MIN * 60)}>DEL {cs}")
    lines.append("")
    return lines


def emit_scn_body(scenario: HanoiScenario) -> str:
    entries: list[tuple[int, list[str]]] = []
    for rf in scenario.flights:
        if not rf.route:
            continue
        if rf.scheduled.movement == "dep":
            lines = _emit_dep(rf)
            spawn = rf.scheduled.adjusted_minutes
        else:
            lines = _emit_arr(rf)
            spawn = max(0, rf.scheduled.adjusted_minutes - 40)
        if lines:
            entries.append((spawn, lines))

    entries.sort(key=lambda e: e[0])
    body_lines: list[str] = list(_ASAS_HEADER)
    for _, lines in entries:
        body_lines.extend(lines)
    return "\n".join(body_lines)
