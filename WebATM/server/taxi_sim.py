"""
VVNB ground/taxi network simulation -- departures only.

BlueSky has no ground-movement/taxi-conflict model of its own (only
airborne ASAS conflict detection), and VVNB's raw taxiway centerline
GeoJSON is too disconnected (no shared endpoint coordinates between its
237 segments) to build a real node-link graph the way route_resolver.py
does for SID/STAR legs -- cross-checking against 124 real named
taxiway-junction sign points (extracted from the source KML,
vietnam_ats_routes_pack/Airport/Layout KMZ/VVNB.kml) only matches ~25%
of the 474 centerline endpoints, too sparse to trust an automatic graph.

What IS usable is the named sign points themselves: real, surveyed
positions for the S1 trunk taxiway (parallel to RWY 11R, leading to its
holding point) plus three secondary taxiways (N1-N5 north of the runway,
QS1-QS5/P4/P7 near the VAECO/hangar area, W11-14/EW/1H-3H/9H further
south). Every one of VVNB's 44 real named gates falls within S1's
coverage today, so S1 is the trunk every departure actually uses; the
other three are modeled for completeness/future gates and connect into
S1 at whichever of their endpoints sits closest to it.

Ground movement is modeled as a shared, one-directional resource per
trunk: a gate's spur joins its nearest trunk point, then travel proceeds
along the trunk (via any branch-to-S1 junction) to the 11R threshold.
Two departures whose unimpeded arrival at the threshold would be too
close in time get queued, exactly like separation_rules.apply_rules
queues departures on the runway -- same mechanic, different resource.

Arrivals are out of scope: there's no equivalent documented taxi-in
route for RWY 11L today, so arrival taxi delay stays a static reference
figure in delay_report.py.

    flightplan_scenario_builder.py <-> taxi_sim.py -> delay_report.py
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from WebATM.server.separation_rules import ScheduledFlight

REPO_ROOT = Path(__file__).resolve().parents[2]
AERODROME_LAYOUT_DIR = REPO_ROOT / "FTS Server" / "data" / "aerodrome_layout"
AERODROME_ACTIVE_FILE = AERODROME_LAYOUT_DIR / "active.json"

_GATE_NAME_RE = re.compile(r"^Gate \d+$")


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float


# All points below are named taxiway-junction sign placemarks extracted
# directly from vietnam_ats_routes_pack/Airport/Layout KMZ/VVNB.kml
# (2026-07-14), ordered west-to-east by longitude -- real surveyed
# positions, not hand-transcribed approximations.

# Main trunk: the S1 taxiway, parallel to RWY 11R, leading to its
# holding point. Every real VVNB gate today falls within its coverage.
_S1_TRUNK: list[Waypoint] = [
    Waypoint("S1E_1", 21.222670, 105.785822),
    Waypoint("S1E_2", 21.222110, 105.786060),
    Waypoint("S1_1", 21.223947, 105.786255),
    Waypoint("S1_2", 21.223029, 105.786340),
    Waypoint("S1D", 21.222198, 105.787435),
    Waypoint("S1_3", 21.221808, 105.790421),
    Waypoint("S1_4", 21.221103, 105.792707),
    Waypoint("S1C", 21.219896, 105.795351),
    Waypoint("S1_5", 21.219754, 105.797502),
    Waypoint("S1_6", 21.218582, 105.801484),
    Waypoint("S1_7", 21.217578, 105.804994),
    Waypoint("S1_8", 21.216582, 105.808404),
    Waypoint("S1B", 21.215469, 105.810718),
    Waypoint("S1_9", 21.215255, 105.812895),
    Waypoint("S1_10", 21.214111, 105.816898),
    Waypoint("S1_11", 21.213376, 105.819485),
    Waypoint("S1_12", 21.214101, 105.819856),
    Waypoint("S1A", 21.213649, 105.820914),
    Waypoint("S1_13", 21.215700, 105.821572),
]

# Secondary taxiway north of the runway ("Northern Parallel Taxiway").
_N_TRUNK: list[Waypoint] = [
    Waypoint("N1", 21.226117, 105.792943),
    Waypoint("N2", 21.224687, 105.797477),
    Waypoint("N3", 21.222339, 105.805724),
    Waypoint("N4", 21.219998, 105.813969),
    Waypoint("N5", 21.218651, 105.818541),
]

# Secondary cluster near the VAECO/hangar area (east side).
_QSP_TRUNK: list[Waypoint] = [
    Waypoint("QS5", 21.225874, 105.798739),
    Waypoint("P4", 21.221565, 105.801468),
    Waypoint("P7", 21.218228, 105.813693),
    Waypoint("QS4", 21.221543, 105.813789),
    Waypoint("QS3", 21.221136, 105.815199),
    Waypoint("QS2", 21.220938, 105.815873),
    Waypoint("QS1", 21.220661, 105.816809),
]

# Secondary cluster further south, also near VAECO/hangar.
_WH_TRUNK: list[Waypoint] = [
    Waypoint("1H", 21.213856, 105.810843),
    Waypoint("2H", 21.213683, 105.811444),
    Waypoint("3H", 21.213537, 105.812057),
    Waypoint("9H", 21.214000, 105.814244),
    Waypoint("W11_1", 21.212687, 105.814520),
    Waypoint("W11_2", 21.213557, 105.814850),
    Waypoint("W12_1", 21.211763, 105.815936),
    Waypoint("W12_2", 21.213077, 105.816309),
    Waypoint("W13_1", 21.212050, 105.816378),
    Waypoint("EW", 21.213384, 105.816470),
    Waypoint("W13_2", 21.212886, 105.816690),
    Waypoint("W14_1", 21.211602, 105.817480),
    Waypoint("W14_2", 21.212647, 105.817865),
]

_MAIN_TRUNK = "S1"
_TRUNKS: dict[str, list[Waypoint]] = {
    "S1": _S1_TRUNK,
    "N": _N_TRUNK,
    "QSP": _QSP_TRUNK,
    "WH": _WH_TRUNK,
}

_THRESHOLD_11R = Waypoint("11R_THR", 21.2246, 105.7868)

TAXI_SPEED_KT = 15.0
_MIN_TRUNK_SEP_MIN = 1  # minimum spacing enforced between consecutive threshold arrivals


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _project_onto_segment(lat: float, lon: float, a: Waypoint, b: Waypoint) -> tuple[float, float]:
    """Nearest point on segment a->b to (lat, lon), via a local equirectangular
    projection (fine at this scale) -- returns (interp_lat, interp_lon)."""
    coslat = math.cos(math.radians((a.lat + b.lat) / 2)) or 1e-9
    ax, ay = a.lon * coslat, a.lat
    bx, by = b.lon * coslat, b.lat
    px, py = lon * coslat, lat
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return a.lat, a.lon
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return ay + t * dy, (ax + t * dx) / coslat


def _nearest_point_on_trunk(gate: Waypoint, trunk: list[Waypoint]) -> tuple[int, Waypoint, float]:
    """Nearest point ON THE TRUNK'S PATH (interpolated between consecutive
    waypoints, not just the waypoints themselves) to `gate`. Returns
    (segment index of the point AFTER the join, join Waypoint, distance NM)."""
    best_idx, best_wp, best_nm = 0, trunk[0], float("inf")
    for i in range(len(trunk) - 1):
        a, b = trunk[i], trunk[i + 1]
        ilat, ilon = _project_onto_segment(gate.lat, gate.lon, a, b)
        d = _haversine_nm(gate.lat, gate.lon, ilat, ilon)
        if d < best_nm:
            best_idx, best_nm = i + 1, d
            best_wp = Waypoint(f"{a.name}~{b.name}", ilat, ilon)
    return best_idx, best_wp, best_nm


def _branch_junction_end(branch: list[Waypoint]) -> int:
    """Which end of a secondary trunk (0 = start, -1 = end) sits closest to
    the main S1 trunk -- that's where a branch route continues onto S1."""
    d_start = min(_haversine_nm(branch[0].lat, branch[0].lon, wp.lat, wp.lon) for wp in _S1_TRUNK)
    d_end = min(_haversine_nm(branch[-1].lat, branch[-1].lon, wp.lat, wp.lon) for wp in _S1_TRUNK)
    return 0 if d_start <= d_end else -1


_branch_junction_cache: dict[str, int] = {}


def _junction_end_index(trunk_name: str) -> int:
    if trunk_name not in _branch_junction_cache:
        _branch_junction_cache[trunk_name] = _branch_junction_end(_TRUNKS[trunk_name])
    return _branch_junction_cache[trunk_name]


def _active_dataset_id() -> str:
    if AERODROME_ACTIVE_FILE.exists():
        try:
            with open(AERODROME_ACTIVE_FILE, encoding="utf-8") as f:
                data = json.load(f)
                if data.get("activeDatasetId"):
                    return data["activeDatasetId"]
        except Exception:
            pass
    return "vietnam_kml_layout"


_gates_cache: dict[str, Waypoint] | None = None


def load_vvnb_gates() -> dict[str, Waypoint]:
    """Read gates.geojson from the active aerodrome_layout dataset, keeping
    only features actually named "Gate N" (the file also mixes in
    stopbars, taxiway signs, and generic apron/terminal labels under the
    same layer)."""
    global _gates_cache
    if _gates_cache is not None:
        return _gates_cache

    path = (
        AERODROME_LAYOUT_DIR / "datasets" / _active_dataset_id()
        / "normalized" / "airports" / "VVNB" / "gates.geojson"
    )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    gates: dict[str, Waypoint] = {}
    for feat in data["features"]:
        name = (feat.get("properties") or {}).get("name") or ""
        if not _GATE_NAME_RE.match(name):
            continue
        lon, lat = feat["geometry"]["coordinates"][:2]
        gates[name] = Waypoint(name, lat, lon)

    _gates_cache = gates
    return gates


def build_taxi_route(gate: Waypoint) -> tuple[list[Waypoint], float]:
    """Gate -> spur join point on its nearest trunk -> (if on a secondary
    trunk) along that trunk to its S1 junction -> westbound along S1 ->
    11R threshold. Returns (ordered waypoints including the gate itself,
    total distance in NM)."""
    best_trunk, best_idx, best_join, best_nm = None, 0, gate, float("inf")
    for trunk_name, trunk in _TRUNKS.items():
        idx, join, nm = _nearest_point_on_trunk(gate, trunk)
        if nm < best_nm:
            best_trunk, best_idx, best_join, best_nm = trunk_name, idx, join, nm

    route: list[Waypoint] = [gate]

    if best_trunk == _MAIN_TRUNK:
        # Walk from the join point back toward the west end (index 0), which
        # leads to the threshold.
        route.append(best_join)
        route.extend(reversed(_S1_TRUNK[:best_idx]))
    else:
        branch = _TRUNKS[best_trunk]
        junction_end = _junction_end_index(best_trunk)
        route.append(best_join)
        if junction_end == 0:
            route.extend(reversed(branch[:best_idx]))
            branch_junction_wp = branch[0]
        else:
            route.extend(branch[best_idx:])
            branch_junction_wp = branch[-1]
        # Continue from the branch's S1-facing end onto the S1 trunk itself.
        s1_idx, s1_join, _ = _nearest_point_on_trunk(branch_junction_wp, _S1_TRUNK)
        route.append(s1_join)
        route.extend(reversed(_S1_TRUNK[:s1_idx]))

    route.append(_THRESHOLD_11R)
    total_nm = sum(_haversine_nm(a.lat, a.lon, b.lat, b.lon) for a, b in zip(route, route[1:]))
    return route, total_nm


def taxi_minutes_for_nm(nm: float) -> float:
    """Convert a taxi route's distance to minutes at the modeled taxi speed."""
    return nm / TAXI_SPEED_KT * 60


def assign_gates(flights: list[ScheduledFlight], gates: dict[str, Waypoint]) -> None:
    """Round-robin assign a real gate to every departure ScheduledFlight, in
    scheduled-time order."""
    if not gates:
        return
    gate_list = list(gates.values())
    dep_flights = sorted((f for f in flights if f.movement == "dep"), key=lambda f: f.scheduled_minutes)
    for i, sf in enumerate(dep_flights):
        sf.gate = gate_list[i % len(gate_list)].name


def simulate_ground_queue(flights: list[ScheduledFlight], taxi_minutes: dict[str, float]) -> None:
    """For every departure: unimpeded threshold-ready time = scheduled_minutes
    (gate pushback / ETD) + taxi_minutes[callsign]. Queue on the shared S1
    trunk (same push-later mechanic as separation_rules.apply_rules, just
    keyed on this ground resource instead of the runway), recording
    taxi_delay_minutes, then overwrite scheduled_minutes with the queued
    threshold-ready time so the runway-separation stage that runs next
    treats it as this flight's new "scheduled" time. The original ETD is
    unaffected on sf.flight.etd_minutes."""
    deps = sorted(
        (f for f in flights if f.movement == "dep"),
        key=lambda f: f.scheduled_minutes + taxi_minutes.get(f.flight.callsign, 0.0),
    )
    prev_threshold_time: float | None = None
    for sf in deps:
        unimpeded = sf.scheduled_minutes + taxi_minutes.get(sf.flight.callsign, 0.0)
        threshold_time = unimpeded
        if prev_threshold_time is not None and threshold_time - prev_threshold_time < _MIN_TRUNK_SEP_MIN:
            threshold_time = prev_threshold_time + _MIN_TRUNK_SEP_MIN
        sf.taxi_delay_minutes = threshold_time - unimpeded
        sf.scheduled_minutes = round(threshold_time)
        prev_threshold_time = threshold_time
