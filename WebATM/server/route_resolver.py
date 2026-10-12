"""
Route resolver: named ATS route strings + real SID/STAR leg graphs -> an
ordered list of flyable waypoints (name, lat, lon[, alt]).

Two independent real data sources are combined:

  1. Enroute airways ("A1", "N892", "L628", ...) come from
     vietnam_ats_routes_pack/vietnam_ats_routes.geojson (route_id ->
     ordered LineString of coordinates) cross-matched against
     vietnam_ats_routes_pack/vietnam_ats_waypoints.geojson (coordinate ->
     waypoint name) -- coordinate lookup is used instead of parsing the
     free-text "point_sequence" string, since the two files are already
     coordinate-aligned 1:1 and the point_sequence text has PDF-extraction
     noise ("+/- 5 NM ", stray spaces in "DVOR/ DME").

  2. SID/STAR data (FTS Server/data/aixm/datasets/<active>/procedures_
     {sid,star}_nominal_tracks.geojson) is NOT a flat per-procedure list --
     it is a graph of individual 2-point legs named "FROMWPT-TOWPT" (plus
     unrelated "Area"/"CF ..." obstacle/fix-marker features that must be
     filtered out). Resolving "the SID out of VVNB runway 11L that joins
     waypoint NB110" means walking this leg graph from a runway-adjacent
     root node to whichever node sits closest to the target coordinate --
     there is no procedure-name lookup, because the source data doesn't
     expose one directly.

This module is deliberately data-driven (no per-airport hardcoding like
scn_generator.py's _VVDN_SIDS_35R) so it works for any airport that has
AIXM procedure data, without new code per airport.
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

from WebATM.server.scn_generator import AIRPORT_CENTRE

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_PACK_DIR = REPO_ROOT / "vietnam_ats_routes_pack"
AIXM_DATASETS_DIR = REPO_ROOT / "FTS Server" / "data" / "aixm" / "datasets"
AIXM_ACTIVE_FILE = REPO_ROOT / "FTS Server" / "data" / "aixm" / "active_dataset.json"

_LEG_NAME_RE = re.compile(r"^[A-Za-z0-9]+-[A-Za-z0-9]+$")

# PDF-extraction noise prefixes seen on waypoint names in
# vietnam_ats_waypoints.geojson ("+/- 5 NM DA NANG DVOR/DME (DAN)",
# "ACC NAM HA DVOR/DME (NAH)") -- stripped for a clean display name only;
# coordinate matching itself never depends on the name string.
_NAME_NOISE_PREFIXES = (re.compile(r"^\+/-\s*\d+\s*NM\s+"), re.compile(r"^ACC\s+"))

# Coarse (region-level, not airport-level) centroids keyed by 2-letter ICAO
# prefix, covering every foreign prefix seen in the seasonal flight-plan
# export. Real ATS airways can pass THROUGH a departure/arrival airport's
# vicinity rather than starting/ending there (e.g. R474 runs LAVOS-MC-NOI
# BAI-NAKHA-TEBAK, with VVNB sitting at its 3rd of 5 points) -- so picking
# the flyable direction and slicing off the unused tail needs at least a
# rough bearing toward the other end of the flight, even for airports we
# have no real procedure data for. Precision only needs to be good enough
# to pick a direction, not to navigate.
_FOREIGN_REGION_CENTROID: dict[str, tuple[float, float]] = {
    "ED": (51.0, 10.0), "EG": (52.0, 0.0), "EH": (52.3, 5.0), "EK": (55.7, 12.5),
    "EL": (49.6, 6.1), "EN": (60.0, 10.0),
    "K": (39.0, -98.0), "PA": (61.2, -149.9), "PH": (21.3, -157.9),
    "LF": (46.6, 2.3), "LI": (42.5, 12.5), "LT": (39.0, 35.0),
    "OE": (24.0, 45.0), "OJ": (31.0, 36.0), "OK": (29.3, 47.5), "OL": (33.9, 35.5),
    "OM": (24.0, 54.0), "OT": (25.3, 51.2),
    "RC": (23.7, 121.0), "RJ": (36.0, 138.0), "RK": (36.5, 127.8), "RP": (13.0, 122.0),
    "UA": (48.0, 68.0), "UC": (41.2, 74.8), "UH": (48.5, 135.1), "UI": (52.3, 104.3),
    "UM": (53.9, 27.6), "UN": (55.0, 83.0), "US": (56.8, 60.6), "UT": (41.3, 69.3),
    "UU": (55.75, 37.6), "UW": (53.2, 50.1), "UZ": (55.2, 30.2),
    "VA": (19.1, 72.9), "VD": (12.5, 104.9), "VE": (22.5, 88.3), "VG": (23.8, 90.4),
    "VH": (22.3, 114.2), "VI": (28.6, 77.2), "VL": (17.9, 102.6), "VM": (22.15, 113.55),
    "VO": (13.0, 80.0), "VT": (13.7, 100.5), "VY": (16.8, 96.2),
    "WA": (-8.0, 115.0), "WB": (4.9, 114.9), "WI": (-6.1, 106.7), "WM": (3.1, 101.6),
    "WS": (1.35, 103.8),
    "YB": (-27.5, 153.0), "YM": (-37.7, 145.0), "YP": (-31.9, 115.9), "YS": (-33.9, 151.2),
    "ZB": (40.0, 116.4), "ZG": (23.1, 113.3), "ZH": (30.6, 114.3), "ZJ": (20.0, 110.3),
    "ZL": (34.3, 108.9), "ZP": (25.0, 102.7), "ZS": (31.2, 121.5), "ZU": (30.6, 104.1),
}


def _airport_anchor(icao: str) -> tuple[float, float] | None:
    """Real coordinate if it's one of our AIXM-covered VN airports, else a
    coarse regional fallback by ICAO prefix -- good enough to pick a flyable
    direction along an airway, not for navigation."""
    icao = icao.upper()
    if icao in AIRPORT_CENTRE:
        return AIRPORT_CENTRE[icao]
    if icao[:2] in _FOREIGN_REGION_CENTROID:
        return _FOREIGN_REGION_CENTROID[icao[:2]]
    if icao[:1] in _FOREIGN_REGION_CENTROID:
        return _FOREIGN_REGION_CENTROID[icao[:1]]
    return None


@dataclass(frozen=True)
class Waypoint:
    name: str
    lat: float
    lon: float


# ---------------------------------------------------------------------------
# Enroute airway network (vietnam_ats_routes_pack)
# ---------------------------------------------------------------------------

_airway_cache: dict | None = None


def _clean_wp_name(raw: str) -> str:
    name = raw
    for pattern in _NAME_NOISE_PREFIXES:
        name = pattern.sub("", name)
    return name.strip()


def _load_airway_network() -> dict:
    global _airway_cache
    if _airway_cache is not None:
        return _airway_cache

    with open(ROUTES_PACK_DIR / "vietnam_ats_waypoints.geojson", encoding="utf-8") as f:
        wpts_geojson = json.load(f)
    coord_to_name: dict[tuple[float, float], str] = {}
    for feat in wpts_geojson["features"]:
        lon, lat = feat["geometry"]["coordinates"][:2]
        coord_to_name[(round(lon, 5), round(lat, 5))] = _clean_wp_name(feat["properties"]["name"])

    with open(ROUTES_PACK_DIR / "vietnam_ats_routes.geojson", encoding="utf-8") as f:
        routes_geojson = json.load(f)
    airways: dict[str, list[Waypoint]] = {}
    for feat in routes_geojson["features"]:
        route_id = feat["properties"].get("route_id")
        if not route_id:
            continue
        points = []
        for lon, lat in feat["geometry"]["coordinates"]:
            key = (round(lon, 5), round(lat, 5))
            name = coord_to_name.get(key, f"{lat:.4f},{lon:.4f}")
            points.append(Waypoint(name, lat, lon))
        airways[route_id.upper()] = points

    _airway_cache = {"airways": airways, "coord_to_name": coord_to_name}
    return _airway_cache


def _haversine_nm(lat1, lon1, lat2, lon2) -> float:
    r_nm = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r_nm * math.asin(math.sqrt(a))


def _nearest_point_pair(a: list[Waypoint], b: list[Waypoint]) -> tuple[int, int, float]:
    """Nearest-neighbour pair of indices between two point lists -- the
    real-world junction between two airways is wherever they physically
    come closest, which is not necessarily either airway's stored
    start/end (a flight often joins/leaves an airway partway along its
    published length)."""
    best_i, best_j, best_d = 0, 0, float("inf")
    for i, pa in enumerate(a):
        for j, pb in enumerate(b):
            d = _haversine_nm(pa.lat, pa.lon, pb.lat, pb.lon)
            if d < best_d:
                best_i, best_j, best_d = i, j, d
    return best_i, best_j, best_d


def _slice_toward(pts: list[Waypoint], entry_idx: int, exit_idx: int) -> list[Waypoint]:
    """Sub-path of `pts` from entry_idx to exit_idx inclusive, in travel order."""
    if exit_idx >= entry_idx:
        return pts[entry_idx : exit_idx + 1]
    return list(reversed(pts[exit_idx : entry_idx + 1]))


# A junction match farther than this is almost certainly wrong (the two
# named airways don't actually meet) -- surfaced via chain warnings rather
# than silently producing a huge erroneous jump.
_MAX_JUNCTION_NM = 60.0


def resolve_airway_chain(
    airway_names: list[str], *, warnings: list[str] | None = None
) -> list[Waypoint]:
    """Expand an ordered list of airway names (e.g. ["A1","N892","L628"])
    into one continuous waypoint chain.

    Airways are stored in the source data along their full published
    length, in one fixed direction, and a flight typically joins/leaves an
    airway at whichever fix is closest to the *next* airway in the chain
    -- not necessarily at the airway's own start or end. So each step
    finds the nearest-point-pair junction with the following airway and
    slices out only the sub-path actually flown, rather than taking the
    whole airway."""
    net = _load_airway_network()["airways"]
    segments = [(n.upper(), net[n.upper()]) for n in airway_names if n.upper() in net]
    if warnings is not None:
        for n in airway_names:
            if n.upper() not in net:
                warnings.append(f"unknown airway id: {n}")
    if not segments:
        return []
    if len(segments) == 1:
        return segments[0][1]

    chain: list[Waypoint] = []
    entry_idx: int | None = None

    for i, (name, pts) in enumerate(segments):
        has_next = i + 1 < len(segments)
        if entry_idx is None:
            # First airway: no prior anchor -- infer entry from the exit
            # junction with the next airway (enter from whichever end is
            # farther from that junction).
            if has_next:
                ia, _, dist = _nearest_point_pair(pts, segments[i + 1][1])
                if warnings is not None and dist > _MAX_JUNCTION_NM:
                    warnings.append(f"{name}->{segments[i+1][0]} junction {dist:.0f}NM apart (suspect)")
                this_entry = len(pts) - 1 if ia < len(pts) / 2 else 0
                this_exit = ia
            else:
                this_entry, this_exit = 0, len(pts) - 1
        else:
            this_entry = min(range(len(pts)), key=lambda k: _haversine_nm(
                chain[-1].lat, chain[-1].lon, pts[k].lat, pts[k].lon
            ))
            if has_next:
                this_exit, _, dist = _nearest_point_pair(pts, segments[i + 1][1])
                if warnings is not None and dist > _MAX_JUNCTION_NM:
                    warnings.append(f"{name}->{segments[i+1][0]} junction {dist:.0f}NM apart (suspect)")
            else:
                this_exit = len(pts) - 1 if this_entry < len(pts) / 2 else 0

        sub = _slice_toward(pts, this_entry, this_exit)
        if chain and sub and chain[-1].name == sub[0].name:
            sub = sub[1:]
        chain.extend(sub)
        entry_idx = this_exit

    return chain


# ---------------------------------------------------------------------------
# SID/STAR leg graph (FTS Server/data/aixm)
# ---------------------------------------------------------------------------

_procedure_cache: dict[str, dict] = {}


def _active_aixm_dataset_dir() -> Path:
    with open(AIXM_ACTIVE_FILE, encoding="utf-8") as f:
        active_id = json.load(f)["active_id"]
    return AIXM_DATASETS_DIR / active_id


def _load_procedure_graph(procedure_type: str) -> dict:
    """procedure_type: 'sid' or 'star'. Returns
    {airport_icao: {"nodes": {name: Waypoint}, "edges": {name: [(neighbor, [Waypoint,...])]}}}.

    Each leg feature's geometry is not always a straight 2-point line --
    most carry several intermediate points tracing the real curved track
    (turns/arcs), only the first and last of which are the named fixes.
    Those interior points are kept (with synthetic coordinate-based names)
    so the reconstructed path preserves the actual curve, not just a
    straight line between the two named endpoints."""
    if procedure_type in _procedure_cache:
        return _procedure_cache[procedure_type]

    path = _active_aixm_dataset_dir() / f"procedures_{procedure_type}_nominal_tracks.geojson"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    by_airport: dict[str, dict] = defaultdict(lambda: {"nodes": {}, "edges": defaultdict(list)})
    for feat in data["features"]:
        props = feat["properties"]
        name = props.get("name") or ""
        coords = feat["geometry"]["coordinates"]
        if len(coords) < 2 or not _LEG_NAME_RE.match(name):
            continue  # skips "Area" obstacle polygons and "CF <fix>" markers

        airport = props.get("airport_icao")
        if not airport:
            continue
        from_id, to_id = name.split("-", 1)

        leg_pts: list[Waypoint] = []
        for idx, coord in enumerate(coords):
            lon, lat = coord[0], coord[1]
            if idx == 0:
                leg_pts.append(Waypoint(from_id, lat, lon))
            elif idx == len(coords) - 1:
                leg_pts.append(Waypoint(to_id, lat, lon))
            else:
                leg_pts.append(Waypoint(f"{lat:.4f},{lon:.4f}", lat, lon))

        graph = by_airport[airport]
        graph["nodes"].setdefault(from_id, leg_pts[0])
        graph["nodes"].setdefault(to_id, leg_pts[-1])
        graph["edges"][from_id].append((to_id, leg_pts))

    _procedure_cache[procedure_type] = dict(by_airport)
    return _procedure_cache[procedure_type]


def _nearest_node(graph: dict, target_lat: float, target_lon: float) -> str | None:
    best_name, best_dist = None, float("inf")
    for name, wp in graph["nodes"].items():
        d = _haversine_nm(target_lat, target_lon, wp.lat, wp.lon)
        if d < best_dist:
            best_name, best_dist = name, d
    return best_name


def _root_nodes(graph: dict) -> list[str]:
    """Nodes that are never a leg's destination -- the natural starting
    points of the procedure graph (at/near the runway for a SID, at/near
    the enroute transition for a STAR)."""
    has_incoming = set()
    for edges in graph["edges"].values():
        for to_id, _ in edges:
            has_incoming.add(to_id)
    return [n for n in graph["nodes"] if n not in has_incoming]


def _bfs_path(graph: dict, start: str, goal: str) -> list[Waypoint] | None:
    """Shortest path by number of LEGS traversed, not number of points --
    a single leg can carry dozens of interpolated curve points, so point
    count is not a valid proxy for path length."""
    if start == goal:
        return [graph["nodes"][start]]
    visited = {start}
    queue = deque([(start, [graph["nodes"][start]])])
    while queue:
        node, path = queue.popleft()
        for to_id, leg_pts in graph["edges"].get(node, []):
            if to_id in visited:
                continue
            new_path = path + leg_pts[1:]
            if to_id == goal:
                return new_path
            visited.add(to_id)
            queue.append((to_id, new_path))
    return None


def resolve_departure_procedure(
    airport: str, target_lat: float, target_lon: float
) -> list[Waypoint]:
    """Best-effort SID: walk the airport's SID leg graph from a runway-side
    root node to whichever node is closest to (target_lat, target_lon) --
    the first enroute waypoint of the flight's airway chain. Returns []
    if this airport has no SID data in the active AIXM dataset."""
    graph = _load_procedure_graph("sid").get(airport.upper())
    if not graph or not graph["nodes"]:
        return []

    goal = _nearest_node(graph, target_lat, target_lon)
    if goal is None:
        return []

    best_path: list[Waypoint] | None = None
    best_hops = None
    for root in _root_nodes(graph):
        path = _bfs_path(graph, root, goal)
        if path is None:
            continue
        hops = len({wp.name for wp in path} & set(graph["nodes"]))
        if best_hops is None or hops < best_hops:
            best_path, best_hops = path, hops
    return best_path or []


def resolve_arrival_procedure(
    airport: str, source_lat: float, source_lon: float
) -> list[Waypoint]:
    """Best-effort STAR: walk the airport's STAR leg graph from whichever
    root node is closest to (source_lat, source_lon) -- the last enroute
    waypoint of the flight's airway chain -- toward the runway side.
    Returns [] if this airport has no STAR data in the active dataset."""
    graph = _load_procedure_graph("star").get(airport.upper())
    if not graph or not graph["nodes"]:
        return []

    roots = _root_nodes(graph)
    if not roots:
        return []
    start = min(roots, key=lambda n: _haversine_nm(source_lat, source_lon, *_node_latlon(graph, n)))

    # STARs fan IN toward the runway; walk as far as the graph allows from
    # the chosen entry root (no fixed goal -- take the path with the most
    # LEGS, i.e. named nodes visited, not the most interpolated points).
    best_path: list[Waypoint] = [graph["nodes"][start]]
    best_hops = 0
    visited = {start}
    queue = deque([(start, [graph["nodes"][start]], 0)])
    while queue:
        node, path, hops = queue.popleft()
        if hops > best_hops:
            best_path, best_hops = path, hops
        for to_id, leg_pts in graph["edges"].get(node, []):
            if to_id in visited:
                continue
            visited.add(to_id)
            queue.append((to_id, path + leg_pts[1:], hops + 1))
    return best_path


def _node_latlon(graph: dict, name: str) -> tuple[float, float]:
    wp = graph["nodes"][name]
    return wp.lat, wp.lon


# ---------------------------------------------------------------------------
# Public: full route for one flight
# ---------------------------------------------------------------------------


def _orient_enroute(enroute: list[Waypoint], dep: str, arr: str) -> list[Waypoint]:
    """The airway geojson stores each route as a plain LineString with no
    notion of flight direction, and the departure/arrival airport is not
    always at one of its two endpoints -- an airway can run THROUGH an
    airport's vicinity partway along its length (e.g. R474 runs LAVOS-MC-
    NOI BAI-NAKHA-TEBAK, with VVNB sitting at its 3rd of 5 points). So this
    both picks the flyable direction (dep-side first) and slices off
    whichever tail isn't between the two airports, using at least a coarse
    anchor (real coordinate or regional fallback) for each end."""
    dep_anchor = _airport_anchor(dep)
    arr_anchor = _airport_anchor(arr)

    def _nearest_idx(anchor: tuple[float, float]) -> int:
        lat, lon = anchor
        return min(
            range(len(enroute)),
            key=lambda i: _haversine_nm(lat, lon, enroute[i].lat, enroute[i].lon),
        )

    if dep_anchor and arr_anchor:
        dep_idx, arr_idx = _nearest_idx(dep_anchor), _nearest_idx(arr_anchor)
        if dep_idx == arr_idx:
            return enroute
        if dep_idx < arr_idx:
            return enroute[dep_idx:arr_idx + 1]
        return list(reversed(enroute[arr_idx:dep_idx + 1]))

    anchor = dep_anchor or arr_anchor
    if anchor is None:
        return enroute
    lat, lon = anchor
    dist_first = _haversine_nm(lat, lon, enroute[0].lat, enroute[0].lon)
    dist_last = _haversine_nm(lat, lon, enroute[-1].lat, enroute[-1].lon)
    starts_near_anchor = dist_first < dist_last
    if bool(dep_anchor) != starts_near_anchor:
        return list(reversed(enroute))
    return enroute


_DEDUP_NM = 1.0


def _append_dedup(route: list[Waypoint], segment: list[Waypoint]) -> None:
    """SID/STAR graph nodes and airway waypoints are two independent data
    sources that both happen to name the same real-world fix (e.g. the SID's
    "NOB" vs the airway file's "NOI BAI DVOR/DME (NOB)") -- drop the
    incoming duplicate when it sits on top of the route's current tail."""
    if route and segment:
        head = segment[0]
        if _haversine_nm(route[-1].lat, route[-1].lon, head.lat, head.lon) < _DEDUP_NM:
            segment = segment[1:]
    route.extend(segment)


def build_full_route(
    dep: str, arr: str, airway_names: list[str], *, warnings: list[str] | None = None
) -> list[Waypoint]:
    """Combine SID (if `dep` has AIXM procedure data) + enroute airway
    chain + STAR (if `arr` has AIXM procedure data) into one ordered
    waypoint list, ready to become ADDWPT lines."""
    enroute = resolve_airway_chain(airway_names, warnings=warnings)
    if not enroute:
        return []
    enroute = _orient_enroute(enroute, dep, arr)

    route: list[Waypoint] = []

    sid = resolve_departure_procedure(dep, enroute[0].lat, enroute[0].lon)
    route.extend(sid)

    _append_dedup(route, enroute)

    star = resolve_arrival_procedure(arr, enroute[-1].lat, enroute[-1].lon)
    _append_dedup(route, star)

    return route
