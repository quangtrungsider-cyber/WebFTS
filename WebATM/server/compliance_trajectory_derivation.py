import re
import math
from pathlib import Path

try:
    from server.compliance_ruleset_loader import load_wake_category_table
except (ImportError, ModuleNotFoundError):
    from .compliance_ruleset_loader import load_wake_category_table

SCENARIO_SEARCH_ROOT = Path("FTS Server/scenario")

# Time-bucket width for pairwise proximity grouping (real replay_track samples are irregular).
PROXIMITY_BUCKET_SEC = 5.0

# AIRCRAFT_SEPARATION scope thresholds: this compliance module only checks separation for
# aircraft actively in the approach/departure phase near the runway -- ground/taxiing/parked
# aircraft and en-route/cruise samples outside this envelope are excluded, since they are not
# subject to these terminal-area separation rules and produce meaningless "violations" (e.g. two
# parked aircraft a few hundred meters apart on the apron). This scoping lives ONLY in this
# compliance-report module and does not touch/replace the simulator's own TCAS/ASAS conflict
# detection logic elsewhere in the codebase.
SEPARATION_GROUND_ALTITUDE_FT = 50.0       # at/below this AGL, treat the aircraft as "on the ground"
SEPARATION_ARRIVAL_ALTITUDE_CEILING_FT = 2000.0   # descending arrivals are in scope at/below this altitude
SEPARATION_DEPARTURE_ALTITUDE_FLOOR_FT = 400.0    # climbing departures are in scope at/above this altitude


def _is_relevant_for_separation_check(sample: dict) -> bool:
    """True only for a descending arrival at/below 2000ft AGL or a climbing departure at/above
    400ft AGL. Ground/taxiing aircraft and samples outside this envelope (e.g. level cruise,
    or a departure still below 400ft) are excluded from AIRCRAFT_SEPARATION checks."""
    alt = sample.get("altitudeFt")
    vs = sample.get("verticalSpeedFpm")
    if alt is None or alt <= SEPARATION_GROUND_ALTITUDE_FT:
        return False
    if vs is None:
        return False
    if vs < 0 and alt <= SEPARATION_ARRIVAL_ALTITUDE_CEILING_FT:
        return True
    if vs > 0 and alt >= SEPARATION_DEPARTURE_ALTITUDE_FLOOR_FT:
        return True
    return False

# Runway-event derivation heuristic thresholds (named constants, implementer-tunable).
RUNWAY_EVENT_PROXIMITY_KM = 0.35          # ~0.19 NM radius around a threshold to consider "at the threshold"
RUNWAY_EVENT_HEADING_TOLERANCE_DEG = 20.0
TOUCHDOWN_MAX_AGL_FT = 50.0
LINE_UP_MAX_SPEED_KT = 5.0
DEPARTURE_ROLL_MIN_SPEED_KT = 30.0
VACATE_MIN_HEADING_DEVIATION_DEG = 30.0   # heading deviates from runway axis by more than this => vacated onto taxiway

CRE_LINE_RE = re.compile(r">CRE\s+([A-Za-z0-9_]+),([A-Za-z0-9]+),", re.IGNORECASE)


def _haversine_nm(lat1, lon1, lat2, lon2):
    r_nm = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r_nm * math.asin(math.sqrt(a))


def _resolve_scenario_file(metadata: dict):
    """Best-effort search for the .scn file referenced by this recording's metadata, under FTS Server/scenario/."""
    file_name = metadata.get("scenarioFileName")
    if not file_name:
        return None
    file_name = Path(file_name).name  # strip any path component, defense-in-depth
    if not SCENARIO_SEARCH_ROOT.exists():
        return None
    matches = list(SCENARIO_SEARCH_ROOT.rglob(file_name))
    if not matches:
        # Also try appending .scn if the metadata's name lacked the extension
        if not file_name.lower().endswith(".scn"):
            matches = list(SCENARIO_SEARCH_ROOT.rglob(file_name + ".scn"))
    return matches[0] if matches else None


def derive_wake_categories(dataset: dict, warnings: list) -> dict:
    """
    Resolves each callsign's wake category by parsing CRE lines in the recording's linked
    .scn file. Callsigns that cannot be resolved map to "UNKNOWN" -- never guessed as MEDIUM
    by default, per the never-default-to-PASS requirement (evaluators must treat UNKNOWN as
    NOT_EVALUATED, not as an assumed category).
    """
    metadata = (dataset or {}).get("metadata", {})
    wake_table = load_wake_category_table()
    result = {}

    scenario_path = None
    try:
        scenario_path = _resolve_scenario_file(metadata)
    except Exception as e:
        warnings.append({
            "code": "SCENARIO_FILE_SEARCH_FAILED",
            "severity": "warning",
            "message": f"Failed while searching for linked scenario file: {str(e)}"
        })

    if scenario_path is None:
        warnings.append({
            "code": "SCENARIO_FILE_UNRESOLVED",
            "severity": "warning",
            "message": "Could not resolve the recording's .scn file; wake categories for all aircraft are UNKNOWN."
        })
        return result

    try:
        with open(scenario_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                match = CRE_LINE_RE.search(line)
                if not match:
                    continue
                callsign, ac_type = match.group(1).upper(), match.group(2).upper()
                category = wake_table.get(ac_type, "UNKNOWN")
                result[callsign] = category
                if category == "UNKNOWN":
                    warnings.append({
                        "code": "WAKE_CATEGORY_UNKNOWN",
                        "severity": "info",
                        "message": f"Aircraft type '{ac_type}' (callsign {callsign}) is not in aircraft_wake_categories.json; wake category is UNKNOWN."
                    })
    except Exception as e:
        warnings.append({
            "code": "SCENARIO_FILE_PARSE_FAILED",
            "severity": "warning",
            "message": f"Failed to parse scenario file '{scenario_path}': {str(e)}"
        })

    return result


MIN_SPEED_FOR_ETA_KT = 20.0  # floor to avoid division-by-near-zero blowing up the ETA estimate


def _nearest_threshold_eta_sec(sample: dict, geometry: dict):
    """
    Real, data-derived proxy for 'how soon will this aircraft reach the runway': straight-line
    distance to the nearest configured runway threshold divided by current ground speed. Used
    only to order two aircraft as lead/trail for reporting -- never fabricated, always derived
    from the sample's own lat/lon/speed and the airport's verified geometry.
    """
    if not geometry or geometry.get("geometryStatus") != "verified":
        return None
    runways = geometry.get("runways", [])
    lat, lon, speed_kt = sample.get("lat"), sample.get("lon"), sample.get("speedKt")
    if lat is None or lon is None or not runways:
        return None
    best_dist_nm = min(_haversine_nm(lat, lon, r["thresholdLat"], r["thresholdLon"]) for r in runways)
    effective_speed = max(speed_kt or 0.0, MIN_SPEED_FOR_ETA_KT)
    return (best_dist_nm / effective_speed) * 3600.0


def compute_pairwise_proximity_series(track_samples: list, geometry: dict, warnings: list) -> list:
    """
    Groups replay_track samples into fixed-width time buckets and computes horizontal/vertical
    distance for every active-aircraft pair per bucket, using each pair's nearest-in-time samples
    within the bucket. Also assigns leadCallsign/trailCallsign per pair using each aircraft's
    real estimated time-to-threshold (whichever is closer in time to the runway is "lead") so
    downstream rule matching and reporting can correctly distinguish directional separation
    minima (e.g. HEAVY-leads-MEDIUM vs MEDIUM-leads-HEAVY, which have different required values).
    Returns a list of {t, callsign1, callsign2, leadCallsign, trailCallsign, horizontalNm, verticalFt}.
    """
    series = []
    if not track_samples:
        return series

    buckets = {}
    for s in track_samples:
        t = s.get("t")
        callsign = s.get("callsign")
        if t is None or not callsign:
            continue
        bucket_key = int(t // PROXIMITY_BUCKET_SEC)
        buckets.setdefault(bucket_key, {})
        # Keep the sample closest to the bucket's nominal time for each callsign.
        existing = buckets[bucket_key].get(callsign)
        if existing is None or abs(t - bucket_key * PROXIMITY_BUCKET_SEC) < abs(existing.get("t", 0) - bucket_key * PROXIMITY_BUCKET_SEC):
            buckets[bucket_key][callsign] = s

    try:
        for bucket_key, callsign_samples in buckets.items():
            callsigns = list(callsign_samples.keys())
            for i in range(len(callsigns)):
                for j in range(i + 1, len(callsigns)):
                    s1, s2 = callsign_samples[callsigns[i]], callsign_samples[callsigns[j]]
                    if not _is_relevant_for_separation_check(s1) or not _is_relevant_for_separation_check(s2):
                        continue
                    lat1, lon1 = s1.get("lat"), s1.get("lon")
                    lat2, lon2 = s2.get("lat"), s2.get("lon")
                    if None in (lat1, lon1, lat2, lon2):
                        continue
                    h_dist = _haversine_nm(lat1, lon1, lat2, lon2)
                    alt1, alt2 = s1.get("altitudeFt"), s2.get("altitudeFt")
                    v_dist = abs(alt1 - alt2) if (alt1 is not None and alt2 is not None) else None

                    eta1 = _nearest_threshold_eta_sec(s1, geometry)
                    eta2 = _nearest_threshold_eta_sec(s2, geometry)
                    if eta1 is not None and eta2 is not None and eta1 <= eta2:
                        lead_callsign, trail_callsign = callsigns[i], callsigns[j]
                    elif eta1 is not None and eta2 is not None:
                        lead_callsign, trail_callsign = callsigns[j], callsigns[i]
                    else:
                        # No verified geometry to order by -- leave lead/trail unresolved rather
                        # than guess; ordered-rule matching will report NOT_EVALUATED for this pair.
                        lead_callsign, trail_callsign = None, None

                    series.append({
                        "t": bucket_key * PROXIMITY_BUCKET_SEC,
                        "callsign1": callsigns[i],
                        "callsign2": callsigns[j],
                        "leadCallsign": lead_callsign,
                        "trailCallsign": trail_callsign,
                        "horizontalNm": round(h_dist, 4),
                        "verticalFt": round(v_dist, 1) if v_dist is not None else None
                    })
    except Exception as e:
        warnings.append({
            "code": "PROXIMITY_SERIES_COMPUTE_FAILED",
            "severity": "warning",
            "message": f"Failed to compute pairwise proximity series: {str(e)}"
        })

    return series


FLIGHT_PHASE_GROUND_ALTITUDE_FT = 50.0  # shared with SEPARATION_GROUND_ALTITUDE_FT by convention


def classify_flight_phases(track_samples: list) -> dict:
    """
    Classifies each callsign as a departure (starts on the ground, ends airborne), an arrival
    (starts airborne, ends on the ground), or "other" (airborne throughout / on the ground
    throughout, e.g. an overflight or a truncated recording window) using only the first and
    last real altitude sample for that callsign -- never guessed beyond what the trajectory shows.
    For departures/arrivals also records the real transition timestamp (first ground->airborne
    crossing, or last airborne->ground crossing) so each event is counted exactly once at the
    moment it actually happened, not once per sample the aircraft appears in.
    Returns {"departures": [{"callsign","t"}], "arrivals": [{"callsign","t"}], "other": [callsign]}.
    """
    by_callsign = {}
    for s in track_samples:
        callsign = s.get("callsign")
        t = s.get("t")
        alt = s.get("altitudeFt")
        if not callsign or t is None or alt is None:
            continue
        by_callsign.setdefault(callsign, []).append((t, alt))

    result = {"departures": [], "arrivals": [], "other": []}
    for callsign, samples in by_callsign.items():
        samples.sort(key=lambda x: x[0])
        first_alt, last_alt = samples[0][1], samples[-1][1]
        first_ground = first_alt <= FLIGHT_PHASE_GROUND_ALTITUDE_FT
        last_ground = last_alt <= FLIGHT_PHASE_GROUND_ALTITUDE_FT
        if first_ground and not last_ground:
            # Departure event time = first sample where altitude climbs above the ground threshold.
            event_t = next((t for t, alt in samples if alt > FLIGHT_PHASE_GROUND_ALTITUDE_FT), samples[-1][0])
            result["departures"].append({"callsign": callsign, "t": event_t})
        elif not first_ground and last_ground:
            # Arrival event time = last sample still airborne right before it settles on the ground.
            event_t = samples[-1][0]
            for t, alt in samples:
                if alt <= FLIGHT_PHASE_GROUND_ALTITUDE_FT:
                    event_t = t
                    break
            result["arrivals"].append({"callsign": callsign, "t": event_t})
        else:
            result["other"].append(callsign)
    return result


def _runway_axis_heading(runway: dict) -> float:
    return runway["trueHeadingDeg"]


def _heading_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


def derive_runway_events(track_samples: list, geometry: dict, warnings: list) -> list:
    """
    Detects touchdown / line_up / departure_roll_start / vacate events per callsign from raw
    position+altitude+speed+heading transitions near known runway thresholds. Only runs when
    geometry is present and 'verified' -- returns [] otherwise (callers must treat this as
    NOT_EVALUATED for geometry-dependent rules, never as "no events happened").
    """
    events = []
    if not geometry or geometry.get("geometryStatus") != "verified":
        return events
    runways = geometry.get("runways", [])
    if not runways or not track_samples:
        return events

    # Sort samples per callsign by time so we can detect state transitions.
    by_callsign = {}
    for s in track_samples:
        callsign = s.get("callsign")
        if not callsign:
            continue
        by_callsign.setdefault(callsign, []).append(s)

    try:
        for callsign, samples in by_callsign.items():
            samples.sort(key=lambda s: s.get("t", 0.0))
            was_airborne = None
            was_rolling = False
            for s in samples:
                lat, lon = s.get("lat"), s.get("lon")
                heading = s.get("headingDeg")
                alt_ft = s.get("altitudeFt")
                speed_kt = s.get("speedKt")
                t = s.get("t")
                if None in (lat, lon, heading, alt_ft, speed_kt, t):
                    continue

                for r in runways:
                    dist_nm = _haversine_nm(lat, lon, r["thresholdLat"], r["thresholdLon"])
                    if dist_nm > (RUNWAY_EVENT_PROXIMITY_KM / 1.852):
                        continue
                    axis_heading = _runway_axis_heading(r)
                    aligned = _heading_diff(heading, axis_heading) <= RUNWAY_EVENT_HEADING_TOLERANCE_DEG

                    if not aligned:
                        continue

                    is_airborne = alt_ft > TOUCHDOWN_MAX_AGL_FT

                    # Touchdown: was airborne, now at/near ground level, aligned with runway.
                    if was_airborne is True and not is_airborne:
                        events.append({
                            "callsign": callsign, "runwayDesignator": r["designator"],
                            "eventType": "touchdown", "t": t, "lat": lat, "lon": lon,
                            "altitudeFt": alt_ft, "speedKt": speed_kt, "headingDeg": heading
                        })

                    # Line-up: on ground, aligned, essentially stationary.
                    if not is_airborne and speed_kt <= LINE_UP_MAX_SPEED_KT:
                        events.append({
                            "callsign": callsign, "runwayDesignator": r["designator"],
                            "eventType": "line_up", "t": t, "lat": lat, "lon": lon,
                            "altitudeFt": alt_ft, "speedKt": speed_kt, "headingDeg": heading
                        })

                    # Departure roll start: on ground, aligned, accelerating through the threshold.
                    if not is_airborne and speed_kt >= DEPARTURE_ROLL_MIN_SPEED_KT and not was_rolling:
                        events.append({
                            "callsign": callsign, "runwayDesignator": r["designator"],
                            "eventType": "departure_roll_start", "t": t, "lat": lat, "lon": lon,
                            "altitudeFt": alt_ft, "speedKt": speed_kt, "headingDeg": heading
                        })
                        was_rolling = True

                    was_airborne = is_airborne

                # Vacate: on ground, was previously aligned near a runway, now heading deviates
                # sharply from every runway axis (turned onto a taxiway) at low altitude.
                if alt_ft <= TOUCHDOWN_MAX_AGL_FT and was_airborne is False:
                    deviates_from_all = all(
                        _heading_diff(heading, _runway_axis_heading(r)) > VACATE_MIN_HEADING_DEVIATION_DEG
                        for r in runways
                    )
                    if deviates_from_all and events and events[-1]["callsign"] == callsign and events[-1]["eventType"] in ("touchdown", "line_up"):
                        events.append({
                            "callsign": callsign, "runwayDesignator": events[-1]["runwayDesignator"],
                            "eventType": "vacate", "t": t, "lat": lat, "lon": lon,
                            "altitudeFt": alt_ft, "speedKt": speed_kt, "headingDeg": heading
                        })
    except Exception as e:
        warnings.append({
            "code": "RUNWAY_EVENT_DERIVATION_FAILED",
            "severity": "warning",
            "message": f"Failed to derive runway events: {str(e)}"
        })

    return events
