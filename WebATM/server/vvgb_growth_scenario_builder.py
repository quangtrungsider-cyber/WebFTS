"""
VVGB capacity-growth scenario builder.

Derives a synthetic VVGB traffic sample from VVNB's own real July 14, 2026
(Tuesday) seasonal schedule -- "VVGB as a parallel copy of VVNB's real
operation that day" -- then applies asymmetric demand growth by corridor
and rebalances runway-strip usage, per a capacity/design stress test for
the new Gia Binh airport:

  1. Baseline: every VVNB-touching flight from the summer seasonal plan
     that actually operates on 2026-07-14 (seasonal_plan_parser, same
     weekday+validity filter as flightplan_scenario_builder.build_day_
     scenario), mirrored into a VVGB-origin/destination twin (same
     callsign+"_GB" suffix, aircraft type and time-of-day unchanged).
  2. Corridor classification: each twin's real enroute chain (resolved via
     route_resolver's airway network, unchanged from the original VVNB
     flight -- only the Hanoi-side endpoint is swapped) is geography-
     classified against VVGB's own real SID/STAR entry fixes -- North
     (NAKHA, ~22N) vs South (BISON/MC/NAH, ~19.5-20.8N).
  3. Growth: North corridor x3 (+200%), South corridor x1.75 (+75%) --
     applied via a running-remainder (Bresenham-style) accumulator so the
     ratio comes out exact over the whole set without clumping duplicates
     at identical minutes; extra copies get a jittered offset + a "_GB2"/
     "_GB3" callsign suffix. VVNB's own Jan14 CSV traffic (a separate,
     unrelated real-FPL dataset -- see hanoi_scenario_builder) is passed
     through unmodified; only the VVGB side is grown.
  4. Runway-strip rebalance: VVGB only has real AIXM SID+STAR coverage on
     the 06L and 25L runway ends (see hanoi_scenario_builder's docstring),
     one per physical strip (06L/24R and 07R/25L are reciprocal ends of
     the same two strips) -- so each strip is modeled as single-direction
     mixed-mode traffic through its one AIXM-covered end (06L for the
     "06L/24R" strip, 25L for the "07R/25L" strip). Movements (arrivals +
     departures combined) are assigned to a strip via the same running-
     remainder accumulator, hitting the requested 40-45%/55-60% split
     interleaved evenly across the day rather than batched.

    seasonal_plan_parser -> route_resolver -> vvgb_growth_scenario_builder
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from WebATM.server.flightplan_scenario_builder import (
    ResolvedFlight,
    _emit_arr,
    _emit_dep,
    _route_minutes,
)
from WebATM.server.hanoi_scenario_builder import (
    _ASAS_HEADER,
    _resolve_vvgb_procedure,
    build_hanoi_scenario,
)
from WebATM.server.hanoi_scenario_builder import _emit_arr as _hanoi_emit_arr
from WebATM.server.hanoi_scenario_builder import _emit_dep as _hanoi_emit_dep
from WebATM.server.route_resolver import Waypoint, _haversine_nm, _orient_enroute, resolve_airway_chain
from WebATM.server.seasonal_plan_parser import FlightRecord, parse_seasonal_plan
from WebATM.server.separation_rules import ScheduledFlight, apply_rules

# Real VVGB SID/STAR entry fixes (see hanoi_scenario_builder._load_vvgb_
# procedures_by_variant) -- geography, not procedure choice, drives the
# corridor classification below.
_NAKHA = Waypoint("NAKHA", 21.966667, 106.493333)
_SOUTH_FIXES = [
    Waypoint("BISON", 19.509444, 106.107778),
    Waypoint("MC", 20.828056, 104.700278),
    Waypoint("NAH", 20.387222, 106.117778),
]

NORTH_GROWTH = 3.0    # +200%
SOUTH_GROWTH = 1.75   # +75% (midpoint of the requested 70-80%)

# Strip usage target: fraction of VVGB's total (grown) movements served via
# the 06L-covered strip; the rest via the 25L-covered strip. Midpoint of
# the requested 40-45%/55-60% split.
STRIP_06L_SHARE = 0.425
STRIP_RUNWAYS = {"06L": "06L", "25L": "25L"}


def classify_corridor(lat: float, lon: float) -> str:
    d_north = _haversine_nm(lat, lon, _NAKHA.lat, _NAKHA.lon)
    d_south = min(_haversine_nm(lat, lon, f.lat, f.lon) for f in _SOUTH_FIXES)
    return "north" if d_north < d_south else "south"


@dataclass
class GrowthStats:
    baseline_count: int = 0
    north_baseline: int = 0
    south_baseline: int = 0
    north_grown: int = 0
    south_grown: int = 0
    total_grown: int = 0
    strip_06L: int = 0
    strip_25L: int = 0
    skipped_no_route: int = 0
    warnings: list[str] = field(default_factory=list)


def _vvnb_july14_baseline(xlsx_path: str, date: datetime.date) -> list[FlightRecord]:
    weekday = date.isoweekday()
    parsed = parse_seasonal_plan(xlsx_path)
    return [
        f for f in parsed.flights
        if weekday in f.operating_days
        and "VVNB" in (f.dep, f.arr)
        and (f.valid_from is None or f.valid_from <= date)
        and (f.valid_to is None or date <= f.valid_to)
    ]


@dataclass
class _TwinRoute:
    source: FlightRecord
    is_dep: bool  # True: VVGB departure (mirrors a VVNB departure); False: VVGB arrival
    other: str    # the foreign/domestic airport at the other end (unchanged)
    enroute: list[Waypoint]
    hanoi_side_target: Waypoint  # near-Hanoi entry/exit point, for corridor + procedure resolution
    corridor: str


def _build_twin_routes(baseline: list[FlightRecord], warnings: list[str]) -> list[_TwinRoute]:
    twins: list[_TwinRoute] = []
    for f in baseline:
        if not f.airways:
            continue
        route_warnings: list[str] = []
        enroute = resolve_airway_chain(f.airways, warnings=route_warnings)
        if not enroute:
            continue
        # Orient using the ORIGINAL VVNB-based dep/arr -- VVGB has no airway-
        # network anchor of its own, but sits only ~25NM from VVNB, close
        # enough that the picked flyable direction and tail-slice are
        # unaffected by substituting one for the other.
        enroute = _orient_enroute(enroute, f.dep, f.arr)
        for w in route_warnings:
            warnings.append(f"{f.callsign}: {w}")

        is_dep = f.dep == "VVNB"
        other = f.arr if is_dep else f.dep
        target = enroute[0] if is_dep else enroute[-1]
        twins.append(_TwinRoute(
            source=f, is_dep=is_dep, other=other, enroute=enroute,
            hanoi_side_target=target, corridor=classify_corridor(target.lat, target.lon),
        ))
    return twins


def _grown_copies(count_ratio: float, n: int) -> list[int]:
    """Bresenham-style running-remainder: how many EXTRA copies (beyond the
    always-present original) each of `n` items in sequence should get so the
    total across all of them averages exactly `count_ratio` extra, spread
    evenly rather than clumped at the start/end."""
    extra = count_ratio - 1.0
    acc = 0.0
    out = []
    for _ in range(n):
        acc += extra
        take = int(acc)
        acc -= take
        out.append(take)
    return out


def _assign_strip(n: int) -> list[str]:
    """Same running-remainder trick, interleaved across the whole
    chronological movement list so the 06L/25L split lands close to the
    target ratio without batching all of one strip's traffic together."""
    acc = 0.0
    out = []
    for _ in range(n):
        acc += STRIP_06L_SHARE
        if acc >= 1.0:
            acc -= 1.0
            out.append("06L")
        else:
            out.append("25L")
    return out


# Deterministic time jitter for duplicate copies (minutes), so extras don't
# stack on the exact same minute as the original -- preserves the day's
# peak-period shape (duplicates sit near their original flight's time)
# while keeping the schedule visually/operationally distinct.
_JITTER_PATTERN = [7, -5, 11, -9, 13]


def build_growth_scenario(
    xlsx_path: str, date: datetime.date = datetime.date(2026, 7, 14),
) -> tuple[list[ResolvedFlight], GrowthStats]:
    stats = GrowthStats()
    warnings: list[str] = []

    baseline = _vvnb_july14_baseline(xlsx_path, date)
    stats.baseline_count = len(baseline)

    twins = _build_twin_routes(baseline, warnings)
    stats.skipped_no_route = stats.baseline_count - len(twins)
    stats.north_baseline = sum(1 for t in twins if t.corridor == "north")
    stats.south_baseline = sum(1 for t in twins if t.corridor == "south")

    north_extra = _grown_copies(NORTH_GROWTH, stats.north_baseline)
    south_extra = _grown_copies(SOUTH_GROWTH, stats.south_baseline)
    north_iter = iter(north_extra)
    south_iter = iter(south_extra)

    # movement, callsign, aircraft_type, etd_minutes, twin -- gathered first
    # so the runway-strip split can be assigned in one chronological pass
    # across ALL grown VVGB movements (arrivals + departures combined).
    pending: list[dict] = []
    for t in twins:
        extra = next(north_iter) if t.corridor == "north" else next(south_iter)
        copies = 1 + extra
        for k in range(copies):
            suffix = "_GB" if k == 0 else f"_GB{k + 1}"
            jitter = 0 if k == 0 else _JITTER_PATTERN[(k - 1) % len(_JITTER_PATTERN)]
            f = t.source
            new_record = FlightRecord(
                no=f.no, permission=f.permission,
                aircraft_type=f.aircraft_type, aircraft_type_raw=f.aircraft_type_raw,
                callsign=f"{f.callsign}{suffix}",
                dep="VVGB" if t.is_dep else t.other,
                arr=t.other if t.is_dep else "VVGB",
                etd_minutes=max(0, f.etd_minutes + jitter),
                airways=f.airways, operating_days=f.operating_days,
                valid_from=f.valid_from, valid_to=f.valid_to,
            )
            pending.append({"twin": t, "record": new_record, "is_dep": t.is_dep})

    pending.sort(key=lambda p: p["record"].etd_minutes)
    strips = _assign_strip(len(pending))

    routes_by_callsign: dict[str, list[Waypoint]] = {}
    dep_scheduled: list[ScheduledFlight] = []
    arr_scheduled: list[ScheduledFlight] = []
    eta_minutes: dict[str, int] = {}

    for p, strip in zip(pending, strips):
        t: _TwinRoute = p["twin"]
        rec: FlightRecord = p["record"]
        runway = STRIP_RUNWAYS[strip]

        if p["is_dep"]:
            sid = _resolve_vvgb_procedure("SID", runway, t.hanoi_side_target.lat, t.hanoi_side_target.lon)
            route = list(t.enroute)
            if sid:
                if route and sid[-1].name == route[0].name:
                    route = route[1:]
                route = sid + route
        else:
            star = _resolve_vvgb_procedure("STAR", runway, t.hanoi_side_target.lat, t.hanoi_side_target.lon)
            route = list(t.enroute)
            if star:
                if route and star[0].name == route[-1].name:
                    star = star[1:]
                route = route + star

        if not route:
            stats.skipped_no_route += 1
            continue

        routes_by_callsign[rec.callsign] = route
        if t.corridor == "north":
            stats.north_grown += 1
        else:
            stats.south_grown += 1
        if strip == "06L":
            stats.strip_06L += 1
        else:
            stats.strip_25L += 1

        if p["is_dep"]:
            sf = ScheduledFlight(flight=rec, movement="dep", scheduled_minutes=rec.etd_minutes, runway=runway)
            dep_scheduled.append(sf)
        else:
            route_minutes = _route_minutes(route, rec.aircraft_type)
            eta = rec.etd_minutes + route_minutes
            eta_minutes[rec.callsign] = eta
            sf = ScheduledFlight(flight=rec, movement="arr", scheduled_minutes=eta, runway=runway)
            arr_scheduled.append(sf)

    all_scheduled = apply_rules(dep_scheduled + arr_scheduled)
    stats.total_grown = len(all_scheduled)
    stats.warnings = warnings

    resolved = [
        ResolvedFlight(
            scheduled=sf,
            route=routes_by_callsign[sf.flight.callsign],
            route_minutes=_route_minutes(routes_by_callsign[sf.flight.callsign], sf.flight.aircraft_type),
        )
        for sf in all_scheduled
    ]
    return resolved, stats


def emit_growth_scn_body(flights: list[ResolvedFlight]) -> list[tuple[int, list[str]]]:
    """Returns (spawn_minute, lines) entries -- NOT joined to a string, so
    the caller can merge with another builder's entries under one shared
    ASAS header before sorting once by spawn time."""
    entries: list[tuple[int, list[str]]] = []
    for rf in flights:
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
    return entries


@dataclass
class CombinedStats:
    vvnb_flights: int = 0
    vvnb_warnings: int = 0
    growth: GrowthStats = field(default_factory=GrowthStats)


def build_combined_scn(
    csv_path: str, xlsx_path: str, *, date: datetime.date = datetime.date(2026, 7, 14),
) -> tuple[str, CombinedStats]:
    """VVNB traffic: the real Jan14 FPL CSV, unmodified, VVGB-touching
    entries dropped (VVGB's traffic for this scenario comes entirely from
    the growth-derived source below, per the capacity study's request to
    keep VVNB's own operation as the unmodified reference). VVGB traffic:
    build_growth_scenario's grown twins of VVNB's real July 14 operation.
    Both sets are emitted independently (their separation-rule timing was
    already computed independently per airport) and merged under one
    shared ASAS header, sorted once by spawn time so the file reads
    chronologically."""
    hanoi_scenario = build_hanoi_scenario(csv_path)
    vvnb_flights = [
        rf for rf in hanoi_scenario.flights
        if rf.scheduled.flight.orig == "VVNB" or rf.scheduled.flight.dest == "VVNB"
    ]

    entries: list[tuple[int, list[str]]] = []
    for rf in vvnb_flights:
        if not rf.route:
            continue
        if rf.scheduled.movement == "dep":
            lines = _hanoi_emit_dep(rf)
            spawn = rf.scheduled.adjusted_minutes
        else:
            lines = _hanoi_emit_arr(rf)
            spawn = max(0, rf.scheduled.adjusted_minutes - 40)
        if lines:
            entries.append((spawn, lines))

    grown_flights, growth_stats = build_growth_scenario(xlsx_path, date)
    entries.extend(emit_growth_scn_body(grown_flights))

    entries.sort(key=lambda e: e[0])
    body_lines: list[str] = list(_ASAS_HEADER)
    for _, lines in entries:
        body_lines.extend(lines)

    stats = CombinedStats(
        vvnb_flights=len(vvnb_flights),
        vvnb_warnings=len(hanoi_scenario.warnings),
        growth=growth_stats,
    )
    return "\n".join(body_lines), stats
