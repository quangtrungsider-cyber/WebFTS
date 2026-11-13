"""Extract SID/STAR/IAP nominal-track geometry for one airport (one effective
variant, if the airport has more than one) from the national KML export
`PHƯƠNG THỨC BAY (SID, STAR, IAP).kml` (19.9.2026 pack -- new parallel-runway
procedures).

Source structure (verified by hand on the real 109MB file before writing this
script):

    Document(root)
      Folder "PHƯƠNG THỨC BAY (SID, STAR, IAP)"
        Folder <ICAO or "<ICAO> (Hiệu lực ...)">        <- --airport-folder
          Folder "PBN"/"CV"/"VOR"/"NDB"
            [Folder "<RWY/SID-NN grouping>"]              <- optional, airport-dependent, pure grouping
              <Document OR Folder> "<procedure name>"     <- one SID/STAR/IAP (tag varies!)
                Folder "Departure"/"Arrival"/"Initial"/"Final"/... (name varies)
                  Folder "<leg name, e.g. NICKY-TRN>"
                    Placemark                               <- the leg's own track (LineString) -- KEEP
                    Folder "Protection Areas" -> Placemark*  <- polygon, NOT a track -- EXCLUDE
                    Folder "Controlling obstacle(s)" -> ...  <- obstacle point(s) -- EXCLUDE
                Folder "Holding" -> Folder "Holding <name>" -> Placemark  <- EXCLUDE (see below)
                Folder "Waypoints" -> Placemark "WP <name>"/"Navaid <name> ..."  <- EXCLUDE, but its mere
                                                                presence marks this container as a procedure

Two structural quirks confirmed by hand on the real file before relying on
them here:

1. A procedure is NOT always wrapped in a `<Document>` -- some (e.g. VVLT's
   "VVLT STAR 05") are plain `<Folder>`s, sitting inside a further grouping
   `<Folder>` ("STAR 05") that is itself NOT a procedure. The one structural
   signal that reliably marks "this container IS one procedure" in every case
   found (Document or Folder, `.kmz`-suffixed or not, nested inside another
   procedure-like container or not) is: **it has a direct child Folder named
   exactly "Waypoints"**. Grouping-only containers never have one. This is
   computed with a first pass (`scan_boundaries`) so the second pass can look
   it up by traversal order without needing lookahead.
2. Procedure containers can themselves nest further procedure containers
   (seen in the PQ "cũ" variant: Document "STAR 10/28.kmz", itself without a
   direct Waypoints child, wraps two real procedures "ADBOP 1B.kmz" and
   "TUNPO 1B.kmz", each with their own Waypoints folder). The boundary rule
   above handles this automatically: the outer one is not flagged (no direct
   Waypoints child of its own), the inner ones are.

The inclusion rule for which Placemarks become geojson features: a Placemark
is a track segment iff (a) its geometry is a LineString, (b) it is inside at
least one procedure boundary (per above), and (c) no ancestor folder between
it and the innermost procedure boundary is named "Protection Areas" /
"Controlling obstacle(s)" / "Waypoints", or is a "Holding" folder or a
"Holding <name>" leaf. Holding geometry is deliberately excluded -- some
procedures carry their own inline Holding-pattern folders, but this script's
scope is SID/STAR/IAP display tracks only; Holding data is kept from the
pre-existing geojson, not replaced from this KML, per an explicit decision.

procedure_type is classified from the procedure_name text: "STAR" keyword ->
STAR; "SID" or "SOD" keyword (the source KML has at least one typo, "VVLT SOD
05LR ..." in a folder full of sibling "... SID ..." documents) -> SID;
anything else (ILS/VOR/RNP/LNAV/NDB.../...) -> IAP.

Transition splitting (graph-leaf-name method)
----------------------------------------------
A single procedure boundary (Document/Folder) often bundles MULTIPLE named
transitions with no folder-level separation between them -- e.g. VVPQ's "SID
28 CV" is really 4 published SIDs (NUMDI/OSOTA/RG/ADBOP) whose legs sit flat,
interleaved, directly under one "Departure" folder. Verified by hand (VVDL
"SID 09 PBN"): legs are named "A-B" (ARINC-424 leg-type text), forming a
directed graph when read as edges A->B. Walking that graph from its root(s)
to its leaves recovers the individual transitions -- each leaf fix name
becomes that transition's label (e.g. a branch ending at "CRA" -> transition
"CRA"). This needs no OCR and no new KML structure assumption beyond what's
already parsed; see `classify_leg`/`build_transition_graph`/`split_legs`.

Leg-name grammar observed in the real file (ARINC-424 path-terminator style):
  "A-B"      -> edge A -> B
  "CF <fix>" / "DF <fix>" (Course/Direct-to-Fix) -> edge __ROOT__ -> <fix>
  "CA" / "VA" (Course/heading-to-Altitude, no fix) -> root marker, no edge
  "A-A" (identical both sides) -> degenerate placeholder, skip (always
         total_pm=0 in practice -- no geometry, never actually reaches here)
  anything else -> unclassified; kept under the original Document name as a
         safe fallback, never silently dropped or guessed at

Root nodes = `__ROOT__` (if any CF/DF edge was seen) union any node that is a
leg source but never a leg destination (handles multi-IAF approaches where
one initial fix has no explicit CF/DF entry, e.g. CM's "LNAV 09" IAP has two
independent initial fixes CM800 and CM913 converging on the same final leg).
Leaves = nodes with no outgoing edge. If two distinct paths from different
roots land on the same leaf name (common for IAP missed-approach/holding
convergence), their edge sets are merged under that one shared leaf label
(not silently picking one) and the collision is reported for manual review --
this matches real procedure structure (several IAFs feeding one approach) so
it is expected to fire often for IAP and rarely for SID/STAR.

If no root can be identified at all, the whole boundary falls back to one
group named after the Document (current pre-split behaviour) rather than
guessing a split.

Usage:
    python parse_procedures_kml.py \
        --kml ".../PHƯƠNG THỨC BAY (SID, STAR, IAP).kml" \
        --airport-folder "VVDL (Hiệu lực TỪ 00h01 (HN) 01/10/26)" \
        --icao VVDL \
        --out-geojson /tmp/vvdl_new.geojson \
        --out-index-fragment /tmp/vvdl_index_fragment.json
"""
from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict

NS = "{http://www.opengis.net/kml/2.2}"
EXCLUDE_FOLDER_NAMES = {"protection areas", "protection area", "controlling obstacle", "controlling obstacles", "waypoints"}


def is_excluded_folder(name: str) -> bool:
    n = name.strip().lower()
    if n in EXCLUDE_FOLDER_NAMES:
        return True
    return n == "holding" or n.startswith("holding ")


def local(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def classify_type(procedure_name: str, ancestors: list[str] | tuple[str, ...] = (), default: str | None = "IAP") -> str | None:
    # 1) keyword in the procedure's own name wins (existing behaviour).
    # Boundaries are "not adjacent to a letter" rather than \b, because real
    # names glue the keyword to "_" or digits: "SID_35LR_KONCO-VIDEN-BUNTA",
    # "SID35LR_BUNTA_ITBAM", "STAR_DAN_17LR_35LR" -- \b doesn't match there
    # since "_" counts as a word character.
    if re.search(r"(?<![A-Za-z])STAR(?![A-Za-z])", procedure_name, re.I):
        return "STAR"
    if re.search(r"(?<![A-Za-z])S[IO]D(?![A-Za-z])", procedure_name, re.I):
        return "SID"
    # 2) No keyword in the name (e.g. VVPB's "PHADE 1C", which sits in
    #    "PBN > SID > RWY 09"): fall back to the nearest ancestor folder whose
    #    name is EXACTLY SID / STAR / IAP. Exact match on purpose -- grouping
    #    folders such as "STAR 05" (VVLT) keep their previous classification.
    for anc in reversed(ancestors):
        n = (anc or "").strip().upper()
        if n in ("SID", "STAR", "IAP"):
            return n
    return default


def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name.strip())
    return re.sub(r"-+", "-", s).strip("-").upper()


ROOT = "__ROOT__"
_EDGE_RE = re.compile(r"^([A-Za-z0-9.]+)-([A-Za-z0-9.]+)$")
_ROOT_EDGE_RE = re.compile(r"^(?:CF|DF)\s+([A-Za-z0-9.]+)$", re.I)
_ROOT_MARKER_RE = re.compile(r"^(?:CA|VA|CD|VI|CI)$", re.I)  # ARINC-424 leg types with no terminating fix in the name


def classify_leg(name: str) -> tuple[str, str | None, str | None]:
    """Returns (kind, from_node, to_node). kind is one of:
    'edge' (from->to), 'root_edge' (ROOT->to, from_node is None),
    'root_marker' (no edge), 'degenerate' (self-loop placeholder, no geometry
    in practice), 'unknown' (unparseable -- caller must not guess)."""
    n = name.strip()
    m = _EDGE_RE.match(n)
    if m:
        a, b = m.group(1), m.group(2)
        if a == b:
            return ("degenerate", None, None)
        return ("edge", a, b)
    m = _ROOT_EDGE_RE.match(n)
    if m:
        return ("root_edge", ROOT, m.group(1))
    if _ROOT_MARKER_RE.match(n):
        return ("root_marker", None, None)
    return ("unknown", None, None)


def build_transition_graph(legs: list[dict], name_by: str = "leaf") -> tuple[dict, dict, list, list]:
    """legs: ordered list of {"name", "raw_name", "coords"} dicts (one per
    leg-folder placemark already collected for one procedure boundary).

    `name_by` picks which end of each root-to-leaf path becomes the
    transition's label:
      - "leaf" (default, correct for SID/IAP): a departure/approach FANS OUT
        from one shared initial fix to several distinct far-end fixes, so
        the leaf is the real published transition name (e.g. SID "ADBOP"
        ends at fix ADBOP).
      - "root" (correct for STAR): an arrival instead FANS IN from several
        distinct real entry fixes (NUMDI/OSOTA/TUNPO/...) to one shared
        hand-off fix close to the runway -- naming by leaf there collapses
        every arrival transition down to that one shared hand-off fix's
        name (e.g. 3 geometrically unrelated real STARs all labeled
        "GUKNU"), which is backwards: confirmed live for VVPQ ("GUKNU"
        silently merged NUMDI's/OSOTA's/TUNPO's STARs, each starting from a
        different real point, under one name -- exactly what made the
        on-map track look disconnected). "root" instead labels each
        transition by its own real entry fix, which IS the natural "source"
        node (in-degree 0) already computed below as `sources`.

    Returns (edges, transitions, unknown_legs, collisions, trunk_legs):
      edges: {(from,to): leg_dict} -- first-seen geometry for that edge
      transitions: {name: [(from,to), ...]} -- ordered edge path per
        transition, several transitions may reference the same edge (shared
        trunk segment)
      unknown_legs: leg dicts whose name didn't match any known leg-type grammar
      collisions: names reached by more than one distinct path (their edge
        sets got merged under that one name -- reported, not hidden)
      trunk_legs: 'root_marker' legs (CA/VA/CD/VI -- no terminating fix in the
        name, but real flown geometry, e.g. initial climb-out/heading
        intercept). These have no graph position, so they're treated as
        common to every transition found in this same procedure boundary
        (duplicated into each transition's output), matching how a published
        procedure's shared initial segment applies to every transition.
    """
    edges: dict[tuple[str, str], dict] = {}
    children: dict[str, list[str]] = defaultdict(list)
    unknown: list[dict] = []
    trunk_legs: list[dict] = []

    for leg in legs:
        kind, a, b = classify_leg(leg["name"])
        if kind in ("edge", "root_edge"):
            key = (a, b)
            if key not in edges:
                edges[key] = leg
                # A leg folder holds SEVERAL consecutive LineString pieces (a turn
                # arc, then a straight, ...) and the same pieces repeated once per
                # sibling transition. `edges[key]` stays the first piece (callers
                # such as extract_transition_waypoints rely on that); every
                # DISTINCT piece is kept in `_pieces` so the full track can be
                # rebuilt by `chain_pieces` instead of truncating at piece 1.
                leg["_pieces"] = [leg]
                children[a].append(b)
            else:
                first = edges[key]
                if all(p["coords"] != leg["coords"] for p in first["_pieces"]):
                    first["_pieces"].append(leg)
        elif kind == "root_marker":
            if all(t["coords"] != leg["coords"] for t in trunk_legs):
                trunk_legs.append(leg)
        elif kind == "degenerate":
            pass
        else:
            unknown.append(leg)

    all_from = {a for a, b in edges if a != ROOT}
    all_to = {b for a, b in edges}
    sources = sorted(all_from - all_to)
    roots = ([ROOT] if children.get(ROOT) else []) + sources

    transitions: dict[str, list[tuple[str, str]]] = {}
    collisions: list[str] = []

    def record(key: str, path: list[tuple[str, str]]):
        if key in transitions and transitions[key] != path:
            if key not in collisions:
                collisions.append(key)
            merged = list(dict.fromkeys(transitions[key] + path))
            transitions[key] = merged
        else:
            transitions[key] = path

    def dfs(node: str, path: list[tuple[str, str]], visited: set[str], root_name: str | None):
        kids = children.get(node, [])
        if not kids:
            if node == ROOT:
                return
            key = root_name if (name_by == "root" and root_name is not None) else node
            record(key, path)
            return
        for nxt in kids:
            if nxt in visited:
                continue  # defensive: avoid infinite loop on a genuine cycle
            dfs(nxt, path + [(node, nxt)], visited | {nxt}, root_name)

    for r in roots:
        # ROOT itself (the synthetic CF/DF placeholder) is never a real fix
        # name -- "name by root" falls back to "name by leaf" for whichever
        # branches start there, since there's no real root fix name to use.
        root_name = r if r != ROOT else None
        dfs(r, [], {r}, root_name)

    return edges, transitions, unknown, collisions, trunk_legs


def _same_pt(a, b, tol: float = 5e-5) -> bool:
    # ~5 m: consecutive legs in the KML are authored separately and their
    # shared fix differs by ~1e-7 deg (cm) of rounding, so exact match fails.
    return abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol


def chain_pieces(path: list[tuple[str, str]], edges: dict, node_limit: int = 20000):
    """Rebuild one transition's continuous track from its legs' pieces.

    Each leg in `path` offers several distinct LineString pieces (see
    build_transition_graph). Pick pieces so that every piece starts exactly
    where the previous one ended -- within a leg (arc -> straight) and across
    legs -- by depth-first search with backtracking (the straight piece that
    ends a leg differs per sibling variant, so the right one is only known by
    looking at what the NEXT leg starts from). Returns the ordered list of leg
    dicts, or None if no continuous chain exists / the search budget ran out
    (caller falls back and reports it)."""
    pieces = [edges[k].get("_pieces", [edges[k]]) for k in path]
    n = len(pieces)
    if n == 0:
        return []
    budget = [node_limit]

    def search(i: int, cur, used: frozenset, took: bool):
        budget[0] -= 1
        if budget[0] < 0:
            return None
        for j, p in enumerate(pieces[i]):
            if j in used:
                continue
            if cur is not None and not _same_pt(p["coords"][0], cur):
                continue
            rest = search(i, p["coords"][-1], used | {j}, True)
            if rest is not None:
                return [p] + rest
        if took:
            if i == n - 1:
                return []
            return search(i + 1, cur, frozenset(), False)
        return None

    return search(0, None, frozenset(), False)


def scan_boundaries(kml_path: str, airport_folder: str) -> list[bool]:
    """First pass: for every Document/Folder opened inside the target airport
    subtree (in traversal order), determine whether it has a direct child
    Folder named "Waypoints" -- the structural signal that it is itself one
    procedure. Returns a flat list of booleans indexed by open-order."""
    stack = []  # list of dicts: {tag, name, has_waypoints_child, open_index}
    in_target = False
    flags: list[bool] = []
    counter = 0

    context = ET.iterparse(kml_path, events=("start", "end"))
    for event, elem in context:
        tag = local(elem.tag)
        if event == "start":
            if tag in ("Document", "Folder"):
                idx = None
                if in_target:
                    idx = counter
                    counter += 1
                    flags.append(False)
                stack.append({"tag": tag, "name": None, "has_wp": False, "idx": idx})
        else:
            if tag == "name":
                if stack and stack[-1]["name"] is None:
                    nm = (elem.text or "").strip()
                    stack[-1]["name"] = nm
                    if not in_target and len(stack) == 3 and stack[-1]["tag"] == "Folder" and nm == airport_folder:
                        in_target = True
            elif tag in ("Document", "Folder"):
                info = stack.pop()
                if info["name"] == "Waypoints" and info["tag"] == "Folder" and stack:
                    stack[-1]["has_wp"] = True
                if info["idx"] is not None:
                    flags[info["idx"]] = info["has_wp"]
                if in_target and info["name"] == airport_folder and len(stack) == 2:
                    in_target = False
                elem.clear()
    return flags


def extract(kml_path: str, airport_folder: str, icao: str, boundary_flags: list[bool]) -> tuple[dict, dict, list]:
    """Returns (geojson_feature_collection, index_fragment, diagnostics).
    `boundary_flags` must be the output of `scan_boundaries` for the same
    (kml_path, airport_folder) -- consumed in the same traversal order.
    `diagnostics` is a list of human-readable strings describing fallbacks/
    collisions hit while splitting transitions (for manual review, never
    silently swallowed)."""
    stack = []
    in_target = False
    in_placemark = False
    current_pm = None
    proc_stack = []  # names of currently open procedure boundaries, innermost last
    legs_stack = []  # list of leg-lists, parallel to proc_stack
    flag_i = 0

    features = []
    fragment = defaultdict(lambda: defaultdict(list))
    seq_counter = defaultdict(int)
    diagnostics: list[str] = []

    # Two real, DIFFERENT procedure boundaries (Documents) can produce a leaf
    # with the SAME fix name -- e.g. VVPQ now publishes "ADBOP" as the leaf
    # of 4 separate real Documents ("SID 10 PBN", "SID 28 PBN", "SID 10 CV",
    # "SID 28 CV", each its own real route with its own geometry since the
    # airport grew a second parallel runway pair). Emitting all 4 under one
    # bare "ADBOP" silently merges their geometries into one broken-looking
    # tangle of disconnected segments. So emission is staged in two passes:
    # first collect every (ptype, leaf_name, doc_name, leg) into `pending`
    # without assigning a final display name, THEN once every boundary in
    # the whole airport has been walked, any (ptype, leaf_name) reached by
    # more than one distinct doc_name gets a "<leaf_name> (<doc_name>)"
    # qualified name for EACH contributing doc_name (so "ADBOP (SID 10
    # PBN)"/"ADBOP (SID 28 PBN)"/etc, never a bare ambiguous "ADBOP"); a
    # (ptype, leaf_name) reached by only one doc_name keeps the original
    # bare name, unchanged from before this fix.
    pending: list[tuple[str, str, str, dict]] = []  # (ptype, leaf_name, doc_name, leg)

    def emit(ptype: str, proc_name: str, leg: dict):
        # Count per SLUG, not per raw name: "TRN (STAR 09-27)" and "TRN (STAR
        # 09/27)" are different names but slugify to the same id stem, which
        # produced duplicate feature ids (seen at VVCM).
        key = (ptype, slugify(proc_name))
        seq_counter[key] += 1
        fid = f"{icao}_{ptype}_{slugify(proc_name)}_{seq_counter[key]:03d}"
        features.append({
            "type": "Feature",
            "properties": {
                "id": fid,
                "name": leg["raw_name"],
                # The live-sim map's color expression (VietnamKmlAirspaceControls.ts)
                # detects type by substring-matching "sid"/"star"/"iap" anywhere in
                # folder_path (case-insensitive, unanchored -- first match wins in
                # the order sid > star > iap). Deliberately built from ONLY icao/
                # ptype/procedure_name here, NOT the raw KML ancestor folder chain:
                # that chain is free-form source text and WILL occasionally contain
                # a different type's keyword by accident (e.g. this KML's own root
                # wrapper folder is literally named "PHƯƠNG THỨC BAY (SID, STAR,
                # IAP)", and some IAP-classified Documents like "DOVIN TRANS" sit
                # inside a grouping folder named "STAR 05") -- either would get
                # mis-colored if that raw text were included.
                "folder_path": f"{icao}/{ptype}/{proc_name}",
                "airport_icao": icao,
                "procedure_type": ptype,
                "procedure_name": proc_name,
            },
            "geometry": {"type": "LineString", "coordinates": leg["coords"]},
        })
        fragment[ptype][proc_name].append(fid)

    def flush_boundary(doc_name: str, legs: list[dict]):
        if not legs:
            return
        ptype = classify_type(doc_name, [s["name"] for s in stack if s["name"]])
        # STAR fans IN (several real entry fixes -> one shared hand-off fix
        # near the runway) -- name by the real entry fix (root), not the
        # shared hand-off point (leaf). SID/IAP fan OUT -- leaf is correct.
        # See build_transition_graph's docstring for the VVPQ "GUKNU" case
        # this fixes.
        name_by = "root" if ptype == "STAR" else "leaf"
        edges, transitions, unknown, collisions, trunk_legs = build_transition_graph(legs, name_by=name_by)
        # Technology group (PBN/CV/VOR/NDB) this boundary sits under. Carried
        # with the Document name so that two Documents with the SAME name in
        # different groups (VVTX's PBN "SID 13.kmz" vs VOR "SID 13.kmz") can be
        # told apart in flush_pending instead of being merged into one name.
        tech = next((s["name"].strip().upper() for s in reversed(stack)
                     if s["name"] and s["name"].strip().upper() in ("PBN", "CV", "VOR", "NDB", "RNAV")), "")
        dkey = (doc_name, tech)
        if not transitions:
            # No root identifiable at all -- fall back to the pre-split
            # behaviour (one group named after the Document) rather than guess.
            diagnostics.append(f"[fallback-no-root] {doc_name!r}: could not identify any root fix; kept as one group ({len(legs)} leg(s))")
            seen: set = set()
            for leg in legs:
                sig = tuple(map(tuple, leg["coords"]))
                if sig in seen:  # identical piece repeated once per sibling variant
                    continue
                seen.add(sig)
                pending.append((ptype, doc_name, dkey, leg))
            return
        for leaf_name, path in transitions.items():
            chain = chain_pieces(path, edges)
            if chain is None:
                # No continuous chain (e.g. a leaf-collision merged two different
                # paths under one name): keep EVERY distinct piece rather than
                # silently truncating, and say so.
                diagnostics.append(f"[chain-fail] {doc_name!r} -> {leaf_name!r}: no continuous chain of pieces over {len(path)} leg(s); emitted all distinct pieces")
                chain = [pc for edge_key in path for pc in edges[edge_key].get("_pieces", [edges[edge_key]])]
            for pc in chain:
                pending.append((ptype, leaf_name, dkey, pc))
            for trunk_leg in trunk_legs:
                pending.append((ptype, leaf_name, dkey, trunk_leg))
        if unknown:
            diagnostics.append(f"[unclassified-leg] {doc_name!r}: {len(unknown)} leg name(s) didn't match any known pattern: {[u['name'] for u in unknown]!r} -- kept under the Document name")
            seen_u: set = set()
            for leg in unknown:
                sig = tuple(map(tuple, leg["coords"]))
                if sig in seen_u:
                    continue
                seen_u.add(sig)
                pending.append((ptype, doc_name, dkey, leg))
        for leaf_name in collisions:
            diagnostics.append(f"[leaf-collision] {doc_name!r}: more than one distinct path ends at {leaf_name!r} -- merged under that one name, review manually")

    def flush_pending():
        # Same Document name under more than one technology group -> suffix the
        # group ("SID 13 VOR") so the two real procedures stay distinct.
        techs_of_name: dict[str, set[str]] = defaultdict(set)
        for _pt, _ln, (dn, tech), _leg in pending:
            techs_of_name[dn].add(tech)
        def _eff(dn: str, tech: str) -> str:
            return f"{dn} {tech}" if len(techs_of_name[dn]) > 1 and tech else dn

        # Leaves that are just the Document's own name (no-root fallback /
        # unclassified legs) follow the disambiguated name too.
        pending[:] = [
            (pt, (_eff(dn, tech) if ln == dn else ln), _eff(dn, tech), leg)
            for pt, ln, (dn, tech), leg in pending
        ]
        doc_names_of: dict[tuple[str, str], set[str]] = defaultdict(set)
        for ptype, leaf_name, doc_name, _leg in pending:
            doc_names_of[(ptype, leaf_name)].add(doc_name)
        cross_boundary = {k for k, docs in doc_names_of.items() if len(docs) > 1}
        if cross_boundary:
            diagnostics.append(
                "[cross-boundary-leaf-name] the following (type, leaf) pairs are reached by more than one "
                f"distinct Document and were qualified with their own Document name to keep them visually "
                f"separate: {sorted(cross_boundary)!r}"
            )
        for ptype, leaf_name, doc_name, leg in pending:
            final_name = f"{leaf_name} ({doc_name})" if (ptype, leaf_name) in cross_boundary else leaf_name
            emit(ptype, final_name, leg)

    context = ET.iterparse(kml_path, events=("start", "end"))
    for event, elem in context:
        tag = local(elem.tag)
        if event == "start":
            if tag in ("Document", "Folder"):
                # Snapshot in_target at open time (not at this element's own
                # name-end-tag time) so flag consumption lines up exactly with
                # scan_boundaries' idx assignment, which is also done at open time.
                stack.append({"tag": tag, "name": None, "is_boundary": False, "consume_flag": in_target})
            elif tag == "Placemark":
                in_placemark = True
                if in_target:
                    folder_names = [s["name"] for s in stack if s["name"]]
                    excluded = any(is_excluded_folder(n) for n in folder_names)
                    current_pm = {
                        "name": None, "geom": None, "coords": None,
                        "excluded": excluded, "folder_path": folder_names,
                    }
                else:
                    current_pm = None
        else:  # end
            if tag == "name":
                if in_placemark:
                    if current_pm is not None and current_pm["name"] is None:
                        current_pm["name"] = (elem.text or "").strip()
                elif stack and stack[-1]["name"] is None:
                    nm = (elem.text or "").strip()
                    stack[-1]["name"] = nm
                    if not in_target and len(stack) == 3 and stack[-1]["tag"] == "Folder" and nm == airport_folder:
                        in_target = True
                    if stack[-1]["consume_flag"]:
                        is_boundary = boundary_flags[flag_i] if flag_i < len(boundary_flags) else False
                        flag_i += 1
                        stack[-1]["is_boundary"] = is_boundary
                        if is_boundary:
                            pname = nm[: -len(".kmz")].strip() if nm.lower().endswith(".kmz") else nm
                            proc_stack.append(pname)
                            legs_stack.append([])
            elif tag == "Placemark":
                in_placemark = False
                if current_pm is not None and not current_pm["excluded"] and current_pm["geom"] == "LineString":
                    if legs_stack:
                        leg_name = current_pm["folder_path"][-1] if current_pm["folder_path"] else "(no-folder)"
                        legs_stack[-1].append({
                            "name": leg_name,
                            "raw_name": current_pm["name"] or "",
                            "coords": current_pm["coords"],
                        })
                    else:
                        # Outside any detected procedure boundary: a Document with
                        # no "Waypoints" child (e.g. VVCT's VOR "SID_06.kmz"). Try to
                        # recover type + name from the folder chain below the airport
                        # folder (skipping the technology group PBN/CV/VOR/NDB);
                        # only if that fails stay UNCLASSIFIED (visible, not guessed).
                        fp = current_pm["folder_path"]
                        rel = fp[fp.index(airport_folder) + 1:] if airport_folder in fp else []
                        while rel and rel[0].strip().upper() in ("PBN", "CV", "VOR", "NDB", "RNAV"):
                            rel = rel[1:]
                        pname = None
                        ptype = None
                        for cand in rel:
                            cname = cand[: -len(".kmz")].strip() if cand.lower().endswith(".kmz") else cand.strip()
                            t = classify_type(cname, rel[: rel.index(cand)], default=None)
                            if t:
                                pname, ptype = cname, t
                                break
                        if ptype:
                            emit(ptype, pname, {"raw_name": current_pm["name"] or "", "coords": current_pm["coords"]})
                        else:
                            emit("UNCLASSIFIED", "(unclassified - outside any procedure boundary)", {
                                "raw_name": current_pm["name"] or "", "coords": current_pm["coords"],
                            })
                current_pm = None
            elif tag in ("LineString", "Point", "Polygon", "LinearRing"):
                if current_pm is not None and current_pm["geom"] is None:
                    coord_el = elem.find(f"{NS}coordinates")
                    if coord_el is not None and coord_el.text:
                        pts = []
                        for tok in coord_el.text.split():
                            parts = tok.split(",")
                            if len(parts) >= 2:
                                lon, lat = float(parts[0]), float(parts[1])
                                pts.append([lon, lat, 0.0])
                        if pts:
                            current_pm["geom"] = tag
                            current_pm["coords"] = pts
            elif tag in ("Document", "Folder"):
                info = stack.pop()
                if info["is_boundary"]:
                    doc_name = proc_stack.pop()
                    legs = legs_stack.pop()
                    flush_boundary(doc_name, legs)
                if in_target and info["name"] == airport_folder and len(stack) == 2:
                    in_target = False
                elem.clear()

    flush_pending()

    geojson = {"type": "FeatureCollection", "features": features}
    frag_plain = {pt: dict(names) for pt, names in fragment.items()}
    return geojson, frag_plain, diagnostics


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kml", required=True)
    ap.add_argument("--airport-folder", required=True, help="Exact top-level Folder name in the KML for this airport/variant")
    ap.add_argument("--icao", required=True)
    ap.add_argument("--out-geojson", required=True)
    ap.add_argument("--out-index-fragment", required=True)
    args = ap.parse_args()

    boundary_flags = scan_boundaries(args.kml, args.airport_folder)
    geojson, fragment, diagnostics = extract(args.kml, args.airport_folder, args.icao, boundary_flags)

    with open(args.out_geojson, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    with open(args.out_index_fragment, "w", encoding="utf-8") as f:
        json.dump(fragment, f, ensure_ascii=False, indent=1)

    print(f"icao={args.icao} airport_folder={args.airport_folder!r}")
    print(f"total features: {len(geojson['features'])}")
    for ptype in ("SID", "STAR", "IAP"):
        names = fragment.get(ptype, {})
        print(f"  {ptype}: {len(names)} thu tuc, {sum(len(v) for v in names.values())} feature")
        for name, ids in list(names.items())[:50]:
            print(f"    - {name!r}: {len(ids)} segment")
    if "UNCLASSIFIED" in fragment:
        print(f"  WARNING: {sum(len(v) for v in fragment['UNCLASSIFIED'].values())} feature(s) found outside any procedure boundary -- review manually")
    if diagnostics:
        print(f"\n  {len(diagnostics)} diagnostic(s) from transition splitting (review manually, nothing silently dropped):")
        for d in diagnostics:
            print(f"    {d}")


if __name__ == "__main__":
    main()
