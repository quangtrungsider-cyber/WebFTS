"""
FPL -> .scn orchestrator: the last stage of the automated pipeline.

    seasonal_plan_parser -> route_resolver -> separation_rules -> flightplan_scenario_builder

Ties the three earlier stages together for one airport on one operating
weekday: parse the seasonal schedule, resolve every touching flight's real
route (SID/airway/STAR), space out departures/arrivals with
separation_rules, then emit a runnable BlueSky .scn body in the same
"HH:MM:SS.00>CALLSIGN CMD ..." stack-command style as scn_generator.py.
"""

from __future__ import annotations

import datetime
import math
from dataclasses import dataclass, field

from WebATM.server.scn_generator import AIRCRAFT_PERF, AIRPORT_CENTRE, _fmt
from WebATM.server.seasonal_plan_parser import parse_seasonal_plan
from WebATM.server.route_resolver import Waypoint, build_full_route
from WebATM.server.separation_rules import (
    DEFAULT_RUNWAYS,
    ScheduledFlight,
    SeparationRule,
    apply_rules,
    assign_runways,
)
from WebATM.server.taxi_sim import (
    TAXI_SPEED_KT,
    assign_gates,
    build_taxi_route,
    load_vvnb_gates,
    simulate_ground_queue,
    taxi_minutes_for_nm,
)

# Approximate cruise groundspeed by aircraft category -- there's no real
# performance database wired in yet, so this is only precise enough to
# turn a route distance into a plausible flight-time estimate for arrival
# scheduling, not for navigation.
_HEAVY_TYPES = {
    "A333", "A339", "A359", "B777", "B772", "B773", "B77W", "B77X",
    "B787", "B788", "B789", "B747", "B763", "B764", "B767",
}
_TURBOPROP_TYPES = {"AT72", "AT76", "ATR"}


def _cruise_kt(aircraft_type: str) -> int:
    if aircraft_type in _TURBOPROP_TYPES:
        return 280
    if aircraft_type in _HEAVY_TYPES:
        return 480
    return 420


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _route_minutes(route: list[Waypoint], aircraft_type: str) -> int:
    if len(route) < 2:
        return 0
    nm = sum(
        _haversine_nm(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon)
        for i in range(len(route) - 1)
    )
    return max(1, round(nm / _cruise_kt(aircraft_type) * 60))


@dataclass
class ResolvedFlight:
    scheduled: ScheduledFlight
    route: list[Waypoint]
    route_minutes: int
    warnings: list[str] = field(default_factory=list)


@dataclass
class DayScenario:
    airport: str
    date: datetime.date
    flights: list[ResolvedFlight]
    warnings: list[str]
    skipped_no_route: int


def build_day_scenario(
    xlsx_path: str,
    airport: str,
    date: datetime.date,
    *,
    rules: list[SeparationRule] | None = None,
) -> DayScenario:
    """Resolve every seasonal-plan flight touching `airport` that operates
    on `date`'s weekday AND falls inside that flight's own valid_from/
    valid_to sub-period into a scheduled, flyable route, with separation
    rules applied.

    A calendar date (not just a bare weekday) is required: the same real
    flight is often split across multiple rows with overlapping weekday
    patterns but different validity sub-periods (e.g. one row for
    2026-03-29..04-12, another for 2026-04-22..10-24) -- weekday alone
    would match several of those rows at once and duplicate the flight."""
    airport = airport.upper()
    weekday = date.isoweekday()
    parsed = parse_seasonal_plan(xlsx_path)
    todays = [
        f for f in parsed.flights
        if weekday in f.operating_days
        and airport in (f.dep, f.arr)
        and (f.valid_from is None or f.valid_from <= date)
        and (f.valid_to is None or date <= f.valid_to)
    ]

    warnings: list[str] = []
    skipped_no_route = 0
    dep_scheduled: list[ScheduledFlight] = []
    arr_scheduled: list[ScheduledFlight] = []
    routes_by_callsign: dict[str, tuple[list[Waypoint], int, list[str]]] = {}

    for f in todays:
        if not f.airways:
            skipped_no_route += 1
            continue
        route_warnings: list[str] = []
        route = build_full_route(f.dep, f.arr, f.airways, warnings=route_warnings)
        if not route:
            skipped_no_route += 1
            continue
        route_minutes = _route_minutes(route, f.aircraft_type)
        routes_by_callsign[f.callsign] = (route, route_minutes, route_warnings)
        for w in route_warnings:
            warnings.append(f"{f.callsign}: {w}")
        if len(route) > _MAX_ADDWPT:
            warnings.append(
                f"{f.callsign}: route has {len(route)} points, truncated to "
                f"{_MAX_ADDWPT} ADDWPTs in the emitted .scn"
            )

        if f.dep == airport:
            dep_scheduled.append(ScheduledFlight(flight=f, movement="dep", scheduled_minutes=f.etd_minutes))
        if f.arr == airport:
            eta = f.etd_minutes + route_minutes
            arr_scheduled.append(ScheduledFlight(flight=f, movement="arr", scheduled_minutes=eta))

    if airport == "VVNB":
        gates = load_vvnb_gates()
        assign_gates(dep_scheduled, gates)
        taxi_minutes: dict[str, float] = {}
        for sf in dep_scheduled:
            gate_wp = gates[sf.gate]
            taxi_route, taxi_nm = build_taxi_route(gate_wp)
            sf.taxi_route = taxi_route
            taxi_minutes[sf.flight.callsign] = taxi_minutes_for_nm(taxi_nm)
        simulate_ground_queue(dep_scheduled, taxi_minutes)

    runway_ids = DEFAULT_RUNWAYS.get(airport, ["RWY1"])
    assign_runways(dep_scheduled, runway_ids)
    assign_runways(arr_scheduled, runway_ids)
    all_scheduled = apply_rules(dep_scheduled + arr_scheduled, rules)

    resolved = [
        ResolvedFlight(
            scheduled=sf,
            route=routes_by_callsign[sf.flight.callsign][0],
            route_minutes=routes_by_callsign[sf.flight.callsign][1],
            warnings=routes_by_callsign[sf.flight.callsign][2],
        )
        for sf in all_scheduled
    ]
    return DayScenario(
        airport=airport, date=date, flights=resolved,
        warnings=warnings, skipped_no_route=skipped_no_route,
    )


# ---------------------------------------------------------------------------
# .scn emission
# ---------------------------------------------------------------------------

_MAX_ADDWPT = 60  # cap dense curved-track legs so a single flight doesn't flood the scenario
_ARR_TAXI_BUFFER_MIN = 5


def _emit_dep(rf: ResolvedFlight) -> list[str]:
    f = rf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    t_takeoff = rf.scheduled.adjusted_minutes * 60

    lines = [f"# --- {cs} DEP {f.dep}->{f.arr} ({f.aircraft_type}) ---"]
    # CRE takes the callsign as its OWN first argument -- at creation time
    # there is no existing aircraft "{cs}" yet to scope a stack line to, so
    # a "{cs} CRE ..." prefix line is silently rejected by BlueSky (it reads
    # {cs} as an unrecognized command name, not a target).

    taxi_route = rf.scheduled.taxi_route
    if taxi_route:
        # Real gate -> spur -> S1 trunk -> threshold taxi route (VVNB only,
        # see taxi_sim.py). CRE at the gate itself, at pushback time (the
        # original ETD -- adjusted/scheduled_minutes has already been
        # rewritten to the post-taxi-queue threshold-ready time by
        # simulate_ground_queue). Ground legs are flown at alt=0/taxi speed,
        # matching the alt=0/15kt convention documented for VVNB taxiing.
        gate = taxi_route[0]
        t_push = f.etd_minutes * 60
        hdg0 = round(_bearing(gate.lat, gate.lon, taxi_route[1].lat, taxi_route[1].lon)) if len(taxi_route) > 1 else 0
        lines.append(f"{_fmt(t_push)}>CRE {cs},{f.aircraft_type},{gate.lat:.6f},{gate.lon:.6f},{hdg0},0,{TAXI_SPEED_KT:.0f}")
        lines.append(f"{_fmt(t_push)}>{cs} ORIG {f.dep}")
        lines.append(f"{_fmt(t_push)}>{cs} DEST {f.arr}")
        for wp in taxi_route[1:]:
            lines.append(f"{_fmt(t_push)}>{cs} ADDWPT {wp.lat:.6f},{wp.lon:.6f},0")
        lines.append(f"{_fmt(t_push)}>{cs} LNAV ON")
        lines.append(f"{_fmt(t_push)}>{cs} VNAV ON")
    else:
        lat, lon = AIRPORT_CENTRE.get(f.dep, (16.0, 108.0))
        hdg = round(_bearing(lat, lon, rf.route[0].lat, rf.route[0].lon)) if rf.route else 0
        lines.append(f"{_fmt(t_takeoff)}>CRE {cs},{f.aircraft_type},{lat:.6f},{lon:.6f},{hdg},50,{perf['v2']}")
        lines.append(f"{_fmt(t_takeoff)}>{cs} ORIG {f.dep}")
        lines.append(f"{_fmt(t_takeoff)}>{cs} DEST {f.arr}")

    for wp in rf.route[:_MAX_ADDWPT]:
        lines.append(f"{_fmt(t_takeoff)}>{cs} ADDWPT {wp.lat:.6f},{wp.lon:.6f}")
    lines.append(f"{_fmt(t_takeoff)}>{cs} SPD {perf['v2'] + 30}")
    if not taxi_route:
        lines.append(f"{_fmt(t_takeoff)}>{cs} LNAV ON")
        lines.append(f"{_fmt(t_takeoff)}>{cs} VNAV ON")
    lines.append(f"{_fmt(t_takeoff)}>{cs} ALT FL200")
    cutoff = min(rf.route_minutes, 60) * 60
    # No "{cs} " target prefix here: BlueSky's stack parser treats a leading
    # acid token it doesn't recognize as a command as an implicit target
    # scope and re-injects it into the argument string (simstack.py's
    # "cmdu in bs.traf.id" branch) -- "{cs} DEL {cs}" is parsed as "DEL {cs}
    # {cs}", a DUPLICATE acid argument. bs.traf.delete() then removes that
    # index TWICE from the aircraft id/type list-typed arrays (Python list
    # del, no dedup) but only ONCE from the numpy-typed arrays (np.delete
    # silently dedups repeated indices) -- permanently desyncing the two,
    # eventually raising IndexError deep in a later CRE or ASAS conflict-
    # detection pass once enough deletes have accumulated the drift.
    lines.append(f"{_fmt(t_takeoff + cutoff)}>DEL {cs}")
    lines.append("")
    return lines


def _emit_arr(rf: ResolvedFlight) -> list[str]:
    f = rf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    landing_min = rf.scheduled.adjusted_minutes
    spawn_min = max(0, landing_min - min(rf.route_minutes, 60))
    t0 = spawn_min * 60

    if not rf.route:
        return []
    first = rf.route[0]
    hdg = round(_bearing(first.lat, first.lon, rf.route[min(1, len(rf.route) - 1)].lat,
                          rf.route[min(1, len(rf.route) - 1)].lon))

    lines = [f"# --- {cs} ARR {f.dep}->{f.arr} ({f.aircraft_type}) ---"]
    lines.append(f"{_fmt(t0)}>CRE {cs},{f.aircraft_type},{first.lat:.6f},{first.lon:.6f},{hdg},FL200,{perf['vapp'] + 60}")
    lines.append(f"{_fmt(t0)}>{cs} ORIG {f.dep}")
    lines.append(f"{_fmt(t0)}>{cs} DEST {f.arr}")
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


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def emit_scn_body(scenario: DayScenario) -> str:
    """Render a DayScenario's resolved flights as BlueSky stack commands,
    ordered by spawn time so the file reads chronologically."""
    entries: list[tuple[int, list[str]]] = []
    for rf in scenario.flights:
        if not rf.route:
            continue
        if rf.scheduled.movement == "dep":
            lines = _emit_dep(rf)
            spawn = rf.scheduled.adjusted_minutes
        else:
            lines = _emit_arr(rf)
            spawn = max(0, rf.scheduled.adjusted_minutes - min(rf.route_minutes, 60))
        if lines:
            entries.append((spawn, lines))

    entries.sort(key=lambda e: e[0])
    body_lines: list[str] = []
    for _, lines in entries:
        body_lines.extend(lines)
    return "\n".join(body_lines)
