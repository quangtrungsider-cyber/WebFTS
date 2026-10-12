import re
import math

ICAO_PREFIX_RE = re.compile(r"(VV[A-Z]{2})", re.IGNORECASE)

# Runway mode detection tuning constants.
MODE_HEADING_TOLERANCE_DEG = 20.0
MODE_THRESHOLD_PROXIMITY_KM = 3.0
MODE_MIN_ALIGNED_SAMPLES = 3


def detect_airport(metadata: dict):
    """
    Fallback chain to resolve which airport a recording belongs to:
      1. explicit metadata["airport"] field (future recordings)
      2. ICAO prefix parsed from scenarioBaseName
      3. ICAO prefix parsed from scenarioFileName
      4. unresolved -> (None, "unresolved")
    Never guesses beyond these three real signals.
    """
    metadata = metadata or {}

    explicit = metadata.get("airport")
    if explicit and isinstance(explicit, str) and explicit.strip():
        return explicit.strip().upper(), "field"

    for field_name in ("scenarioBaseName", "scenarioFileName"):
        value = metadata.get(field_name)
        if value and isinstance(value, str):
            match = ICAO_PREFIX_RE.search(value)
            if match:
                return match.group(1).upper(), "filename_pattern"

    return None, "unresolved"


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _heading_diff(a, b):
    diff = abs((a - b + 180) % 360 - 180)
    return diff


def detect_runway_mode(dataset: dict, geometry: dict):
    """
    Attempts to infer the active runway mode from replay_track samples' heading/position
    clustering near known thresholds. Only runs when geometry is present and 'verified' --
    never guesses when geometry is missing/unverified; returns (None, []) in that case with
    the caller expected to treat this as a real data gap, not an inferred mode.

    Returns (mode_name_or_None, timeline_segments). This first implementation returns a
    single segment covering the whole run when a mode is confidently detected (dwell-time
    based multi-segment splitting is a documented future enhancement).
    """
    if not geometry or geometry.get("geometryStatus") != "verified":
        return None, []

    runways = geometry.get("runways", [])
    modes = geometry.get("runwayModes", [])
    if not runways or not modes:
        return None, []

    samples = (dataset or {}).get("trackSamples", [])
    if not samples:
        return None, []

    # Count, for each runway designator, how many low-altitude samples are near its threshold
    # with heading aligned to either the arrival (inbound) or departure (outbound) direction.
    arrival_votes = {r["designator"]: 0 for r in runways}
    departure_votes = {r["designator"]: 0 for r in runways}

    for s in samples:
        lat, lon = s.get("lat"), s.get("lon")
        heading = s.get("headingDeg")
        alt_ft = s.get("altitudeFt")
        if lat is None or lon is None or heading is None or alt_ft is None:
            continue
        if alt_ft > 3000.0:
            continue
        for r in runways:
            dist_km = _haversine_km(lat, lon, r["thresholdLat"], r["thresholdLon"])
            if dist_km > MODE_THRESHOLD_PROXIMITY_KM:
                continue
            inbound_heading = r["trueHeadingDeg"]
            if _heading_diff(heading, inbound_heading) <= MODE_HEADING_TOLERANCE_DEG:
                arrival_votes[r["designator"]] += 1
            elif _heading_diff(heading, (inbound_heading + 180) % 360) <= MODE_HEADING_TOLERANCE_DEG:
                departure_votes[r["designator"]] += 1

    best_mode = None
    best_score = 0
    for m in modes:
        arr_rwy = m.get("arrivalRunway")
        dep_rwy = m.get("departureRunway")
        score = arrival_votes.get(arr_rwy, 0) + departure_votes.get(dep_rwy, 0)
        if score > best_score:
            best_score = score
            best_mode = m.get("mode")

    if best_mode is None or best_score < MODE_MIN_ALIGNED_SAMPLES:
        return None, []

    t_values = [s.get("t") for s in samples if s.get("t") is not None]
    segment = {
        "startT": min(t_values) if t_values else 0.0,
        "endT": max(t_values) if t_values else 0.0,
        "mode": best_mode
    }
    return best_mode, [segment]
