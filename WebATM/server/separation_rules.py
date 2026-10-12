"""
Separation rule engine (TAAM-style) for the FPL -> .scn pipeline.

Applies a small set of declarative dep/arr separation rules to a
time-sorted list of flights at one airport, pushing each flight's
scheduled time later just enough to satisfy whichever rule matches
when comparing it against the closest preceding flight of the same
movement type (e.g. "same departure runway as the previous departure").

    seasonal_plan_parser -> route_resolver -> separation_rules -> flightplan_scenario_builder
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from WebATM.server.seasonal_plan_parser import FlightRecord

_OPS: dict[str, Callable[[Any, Any], bool]] = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "in": lambda a, b: a in b,
    "gt": lambda a, b: a > b,
    "lt": lambda a, b: a < b,
}


@dataclass
class ScheduledFlight:
    flight: FlightRecord
    movement: str  # "dep" or "arr"
    scheduled_minutes: int
    runway: str | None = None
    gate: str | None = None
    taxi_route: list | None = None
    taxi_delay_minutes: float = 0.0
    adjusted_minutes: int = 0
    delay_minutes: int = 0
    applied_rule: str | None = None


def _get_field(sf: ScheduledFlight, name: str) -> Any:
    """Resolve a clause field name against the ScheduledFlight first (movement,
    runway, scheduled_minutes, ...), falling back to its nested FlightRecord
    (aircraft_type, dep, arr, callsign, ...) -- mirrors how TAAM's rule editor
    lets a clause reference either a scheduling attribute or a flight-plan one."""
    if hasattr(sf, name):
        return getattr(sf, name)
    return getattr(sf.flight, name, None)


@dataclass
class Clause:
    """One `if (aircraft.LEFT_FIELD OP prev_aircraft.RIGHT_FIELD)` condition, or
    `if (aircraft.LEFT_FIELD OP RIGHT_VALUE)` when right_field is None -- the two
    forms TAAM's rule editor exposes via its "aircraft" / "prev_aircraft" /
    literal-value operand picker."""
    left_field: str
    op: str = "eq"
    right_field: str | None = None  # compare to prev_aircraft's field if set
    right_value: Any = None         # else compare to this literal


@dataclass
class SeparationRule:
    name: str
    movement: str  # "dep" or "arr" -- which queue this rule applies to
    minutes: int
    active: bool = True
    join: str = "AND"  # "AND" or "OR" across clauses
    clauses: list[Clause] = field(default_factory=list)  # empty = always matches

    def matches(self, sf: ScheduledFlight, prev: ScheduledFlight) -> bool:
        if not self.clauses:
            return True
        results = []
        for clause in self.clauses:
            left = _get_field(sf, clause.left_field)
            right = _get_field(prev, clause.right_field) if clause.right_field is not None else clause.right_value
            results.append(_OPS[clause.op](left, right))
        return all(results) if self.join == "AND" else any(results)


# Defaults derived from VVNB's real operating parameters (project memory: 2
# dependent parallel runways, 3 NM radar separation, no Light-category
# traffic in the fleet mix). More specific rules are listed before their
# catch-all fallback, mirroring TAAM's up/down-arrow priority ordering --
# the first ACTIVE rule whose clauses match wins, no stacking. The minute
# values are a reasonable starting assumption grounded in the 3 NM radar
# separation already used, not a measured operational figure.
VVNB_DEFAULT_RULES: list[SeparationRule] = [
    SeparationRule(
        name="DEP_sep same runway", movement="dep", minutes=2,
        clauses=[Clause("runway", "eq", right_field="runway")],
    ),
    SeparationRule(name="DEP_sep diff runway", movement="dep", minutes=1, clauses=[]),
    SeparationRule(name="ARR_reduced_min_sep diff runway", movement="arr", minutes=2, clauses=[]),
    SeparationRule(
        name="ARR_min_sep same runway", movement="arr", minutes=3,
        clauses=[Clause("runway", "eq", right_field="runway")],
    ),
]

# Round-robin runway pool per airport, used by assign_runways(). Airports
# without a real dual-runway configuration modeled yet fall back to a single
# synthetic runway id so the rule engine still works uniformly.
DEFAULT_RUNWAYS: dict[str, list[str]] = {
    "VVNB": ["11L", "11R"],
}


def assign_runways(flights: list[ScheduledFlight], runway_ids: list[str]) -> None:
    """Round-robin assign a runway id to each flight, in scheduled-time order,
    with independent counters per movement type -- must run before
    apply_rules() so runway-aware clauses have something to compare."""
    if not runway_ids:
        return
    counters = {"dep": 0, "arr": 0}
    for sf in sorted(flights, key=lambda f: f.scheduled_minutes):
        sf.runway = runway_ids[counters[sf.movement] % len(runway_ids)]
        counters[sf.movement] += 1


def build_scheduled_flights(
    airport: str,
    flights: list[FlightRecord],
    eta_minutes: dict[str, int] | None = None,
) -> list[ScheduledFlight]:
    """One ScheduledFlight per flight touching `airport`: movement="dep" at
    `etd_minutes` if it departs here, movement="arr" at `eta_minutes[callsign]`
    if it arrives here and an ETA was supplied (arrivals with no ETA are
    dropped -- the source schedule only carries ETD, so an arrival time has
    to come from an external estimate, e.g. flightplan_scenario_builder's
    route-distance/cruise-speed calculation)."""
    airport = airport.upper()
    eta_minutes = eta_minutes or {}
    scheduled: list[ScheduledFlight] = []
    for f in flights:
        if f.dep == airport:
            scheduled.append(ScheduledFlight(flight=f, movement="dep", scheduled_minutes=f.etd_minutes))
        elif f.arr == airport and f.callsign in eta_minutes:
            scheduled.append(ScheduledFlight(flight=f, movement="arr", scheduled_minutes=eta_minutes[f.callsign]))
    return scheduled


def apply_rules(
    flights: list[ScheduledFlight],
    rules: list[SeparationRule] | None = None,
) -> list[ScheduledFlight]:
    """Push each flight's adjusted_minutes later, in scheduled order, so it
    clears the first active rule (in list order) whose clauses match it
    against the closest preceding flight of the same movement type. Returns
    `flights` sorted by scheduled time (the same objects, mutated in place)."""
    active_rules = [r for r in (rules or VVNB_DEFAULT_RULES) if r.active]
    flights = sorted(flights, key=lambda sf: sf.scheduled_minutes)

    last_by_movement: dict[str, ScheduledFlight] = {}
    for sf in flights:
        sf.adjusted_minutes = sf.scheduled_minutes
        sf.delay_minutes = 0
        sf.applied_rule = None
        prev = last_by_movement.get(sf.movement)
        if prev is not None:
            for rule in active_rules:
                if rule.movement != sf.movement or not rule.matches(sf, prev):
                    continue
                required = prev.adjusted_minutes + rule.minutes
                if required > sf.adjusted_minutes:
                    sf.adjusted_minutes = required
                    sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
                    sf.applied_rule = rule.name
                break  # first matching rule wins, no stacking
        last_by_movement[sf.movement] = sf
    return flights
