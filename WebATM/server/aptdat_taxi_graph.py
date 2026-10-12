"""
Generic real-taxiway-graph parser + pathfinder for any airport with an
apt.dat scenery pack under vietnam_ats_routes_pack/Airport/Layout
flightsim.to/Vietnam Scenery pack/<ICAO>_Scenery_Pack/Earth nav data/apt.dat.

Built after VVDN_35L35R_COORDINATED_OPS.scn's ground-ops rework (2026-08):
that scenario needed the real taxi route from a departure gate to the
runway hold point, and hand-parsing apt.dat's 1201 (taxi-route node) /
1202 (taxi-route edge) / 1300+1301 (parking + category/operation-type)
rows one airport at a time, then re-deriving Dijkstra by hand for every
new gate, proved slow and error-prone (an indexing bug crept into the
first one-off script, VDN_5DEP_TAXI_OUT_35R's build script, from manually
re-deriving the same "walk to the second-to-last waypoint" logic twice).
This module generalizes that into a reusable parse-once, query-many-times
graph, for use with any of the 22 ICAO codes that have a scenery pack in
this repo today (VVDN, VVNB, VVCA, VVCI, VVCM, VVCR, VVCS, VVCT, VVDB,
VVDH, VVDL, VVPB, VVPC, VVPK, VVPQ, VVRG, VVTH, VVTS, VVVD, VVVH, VVVT,
VV01 -- run `list_available_airports()` to get the current list).

Known real-world caveat (found while building VVDN's graph): these
scenery packs are hand-digitized (WorldEditor), and their taxi-route
graphs are frequently INCOMPLETE -- many named parking spots turn out to
be disconnected islands with no route to anywhere (VVDN: only 1 of its
31 connected components has more than 2 nodes; Gate 33/34/35/24-27 all
turned out to be disconnected islands despite being real, correctly
positioned parking spots). ALWAYS check route()/connected_parkings()'s
return before assuming a gate is usable -- never fall back to inventing
a straight-line route for a disconnected gate; report it as disconnected
and let the caller pick a different, confirmed-connected one instead
(connected_parkings() exists for exactly this).

Usage:
    from WebATM.server.aptdat_taxi_graph import AptDatTaxiGraph

    g = AptDatTaxiGraph("VVDN")
    gate36 = g.find_parking("Gate 36")
    polyline, dist_m = g.route(gate36, (16.0297, 108.2024))
    if polyline is None:
        print("Gate 36 has no confirmed real route to that point")
    else:
        print(f"{len(polyline)}-point real route, {dist_m:.0f}m")

    # Or: discover which gates near a runway hold point actually work,
    # instead of guessing then finding out later they're disconnected:
    for parking, dist_m in g.connected_parkings((16.0297, 108.2024))[:10]:
        print(parking.name, parking.operation_type, f"{dist_m:.0f}m")
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENERY_PACK_DIR = (
    REPO_ROOT / "vietnam_ats_routes_pack" / "Airport" / "Layout flightsim.to" / "Vietnam Scenery pack"
)

_R_EARTH_M = 6371000.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * _R_EARTH_M * math.asin(math.sqrt(a))


def list_available_airports() -> list[str]:
    """ICAO codes with an apt.dat scenery pack available under SCENERY_PACK_DIR."""
    if not SCENERY_PACK_DIR.is_dir():
        return []
    return sorted(
        p.name.removesuffix("_Scenery_Pack")
        for p in SCENERY_PACK_DIR.iterdir()
        if p.is_dir() and p.name.endswith("_Scenery_Pack")
    )


@dataclass
class Parking:
    lat: float
    lon: float
    heading: float
    kind: str  # gate / hangar / tie-down / ...
    category: str  # e.g. "jets|turboprops|props"
    name: str
    operation_type: str  # airline / general_aviation / military / "" if unspecified


class AptDatTaxiGraph:
    """Parsed real taxiway-route graph + parking list for one airport's apt.dat."""

    def __init__(self, icao: str):
        self.icao = icao.upper()
        self.nodes: dict[str, tuple[float, float, str]] = {}  # node_id -> (lat, lon, name)
        self.edges: list[tuple[str, str, str, str]] = []  # (n1, n2, direction, taxiway_name)
        self.parkings: list[Parking] = []
        self._adj: dict[str, list[tuple[str, float, str]]] = {}
        self._parse(self._find_apt_dat(self.icao))
        self._build_adjacency()

    @staticmethod
    def _find_apt_dat(icao: str) -> Path:
        candidate = SCENERY_PACK_DIR / f"{icao}_Scenery_Pack" / "Earth nav data" / "apt.dat"
        if not candidate.exists():
            raise FileNotFoundError(
                f"No apt.dat scenery pack found for {icao} at {candidate}. "
                f"Available: {list_available_airports()}"
            )
        return candidate

    def _parse(self, path: Path) -> None:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        i = 0
        while i < len(lines):
            parts = lines[i].split()
            if not parts:
                i += 1
                continue
            code = parts[0]
            if code == "1201":
                lat, lon = float(parts[1]), float(parts[2])
                node_id = parts[4]
                name = " ".join(parts[5:])
                self.nodes[node_id] = (lat, lon, name)
            elif code == "1202":
                n1, n2, direction = parts[1], parts[2], parts[3]
                taxiway_name = " ".join(parts[4:])
                self.edges.append((n1, n2, direction, taxiway_name))
            elif code == "1300":
                lat, lon, heading, kind = float(parts[1]), float(parts[2]), float(parts[3]), parts[4]
                category = parts[5] if len(parts) > 5 else ""
                name = " ".join(parts[6:]).strip()
                optype = ""
                if i + 1 < len(lines):
                    nxt = lines[i + 1].split()
                    if nxt and nxt[0] == "1301" and len(nxt) > 2:
                        optype = nxt[2]
                        i += 1  # 1301 metadata line belongs to this parking; skip it
                self.parkings.append(Parking(lat, lon, heading, kind, category, name, optype))
            i += 1

    def _build_adjacency(self) -> None:
        self._adj = {node_id: [] for node_id in self.nodes}
        for n1, n2, direction, taxiway_name in self.edges:
            if n1 not in self.nodes or n2 not in self.nodes:
                continue
            lat1, lon1, _ = self.nodes[n1]
            lat2, lon2, _ = self.nodes[n2]
            w = _haversine_m(lat1, lon1, lat2, lon2)
            self._adj[n1].append((n2, w, taxiway_name))
            if direction != "oneway":
                self._adj[n2].append((n1, w, taxiway_name))

    def nearest_node(self, lat: float, lon: float) -> tuple[str | None, float]:
        """(node_id, distance_m) of the closest 1201 node to (lat, lon)."""
        best, best_d = None, float("inf")
        for node_id, (nlat, nlon, _name) in self.nodes.items():
            d = _haversine_m(lat, lon, nlat, nlon)
            if d < best_d:
                best, best_d = node_id, d
        return best, best_d

    def find_parking(self, name: str) -> Parking | None:
        """Exact (case/whitespace-insensitive) match on a parking's real apt.dat name."""
        target = name.strip().lower()
        for p in self.parkings:
            if p.name.lower() == target:
                return p
        return None

    def shortest_path(self, src_node: str, dst_node: str) -> tuple[list[str] | None, float | None]:
        """Dijkstra over the real 1201/1202 graph. (None, None) if disconnected."""
        dist = {src_node: 0.0}
        prev: dict[str, str] = {}
        pq = [(0.0, src_node)]
        seen = set()
        while pq:
            d, u = heapq.heappop(pq)
            if u in seen:
                continue
            seen.add(u)
            if u == dst_node:
                break
            for v, w, _tw in self._adj.get(u, []):
                nd = d + w
                if nd < dist.get(v, float("inf")):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        if dst_node not in dist:
            return None, None
        path = [dst_node]
        cur = dst_node
        while cur != src_node:
            cur = prev[cur]
            path.append(cur)
        path.reverse()
        total = sum(
            _haversine_m(*self.nodes[path[i]][:2], *self.nodes[path[i + 1]][:2]) for i in range(len(path) - 1)
        )
        return path, total

    def route(
        self, parking: Parking, target_latlon: tuple[float, float]
    ) -> tuple[list[tuple[float, float]] | None, float | None]:
        """Real lat/lon polyline from a parking's stand-exit node to the nearest
        node of target_latlon. (None, None) if disconnected -- callers MUST
        check for this and report the gate as unusable rather than inventing
        a straight-line fallback."""
        start_node, _ = self.nearest_node(parking.lat, parking.lon)
        target_node, _ = self.nearest_node(*target_latlon)
        path, total = self.shortest_path(start_node, target_node)
        if path is None:
            return None, None
        polyline = [self.nodes[n][:2] for n in path]
        return polyline, total

    def connected_parkings(self, target_latlon: tuple[float, float]) -> list[tuple[Parking, float]]:
        """Every parking with a confirmed graph-connected route to target_latlon,
        sorted by route distance. Use this FIRST when picking a gate for a new
        scenario, instead of guessing a name and discovering later it's an
        isolated island."""
        target_node, _ = self.nearest_node(*target_latlon)
        results = []
        for p in self.parkings:
            start_node, _ = self.nearest_node(p.lat, p.lon)
            path, total = self.shortest_path(start_node, target_node)
            if path is not None:
                results.append((p, total))
        results.sort(key=lambda x: x[1])
        return results
