"""
Generic, reusable rule evaluators -- one per rule 'kind', not one per rule_id.

Every evaluator returns a list of RuleEvaluation dicts:
  {rule_id, verdict, actualValue, requiredValue, margin, unit, involvedCallsigns, evidence, reason}
verdict is one of PASS / WARNING / VIOLATION / NOT_EVALUATED / NOT_APPLICABLE.

Hard rule: no evaluator may default to PASS when its inputs are missing or ambiguous --
every such path must explicitly return NOT_EVALUATED with a human-readable `reason`.
"""

# Margin-based WARNING band width, as a fraction of the required threshold value.
WARNING_MARGIN_FRACTION = 0.10

# ICAO-standard vertical separation minimum below FL290 (RVSM uses 1000ft above that too).
# Horizontal separation minima only need to be met when this vertical separation is NOT already
# achieved -- two aircraft 1000ft+ apart vertically are considered separated regardless of their
# horizontal distance, so a close horizontal pass at a safe vertical offset must NOT be flagged
# as a violation (confirmed real bug: an evaluator that ignored this flagged a departure climbing
# through 4000ft westbound and an arrival on short final at 600ft as "violating" purely because
# they were 2.8NM apart horizontally, despite ~3400ft of vertical separation between them).
VERTICAL_SEPARATION_ACHIEVED_FT = 1000.0


def _not_evaluated(rule, reason, involved=None):
    return {
        "rule_id": rule["rule_id"],
        "verdict": "NOT_EVALUATED",
        "actualValue": None,
        "requiredValue": rule["threshold"]["value"],
        "margin": None,
        "unit": rule["threshold"]["unit"],
        "involvedCallsigns": involved or [],
        "evidence": {},
        "reason": reason
    }


def _band_from_margin(margin, required_value):
    if margin is None:
        return "NOT_EVALUATED"
    if margin < 0:
        return "VIOLATION"
    warning_band = abs(required_value) * WARNING_MARGIN_FRACTION
    if margin < warning_band:
        return "WARNING"
    return "PASS"


def _margin_for_min_threshold(actual, required):
    """For '>=' style minima: positive margin means compliant."""
    return actual - required


def _margin_for_max_threshold(actual, required):
    """For '<=' style maxima: positive margin means compliant."""
    return required - actual


def evaluate_pairwise_min_distance(rule, proximity_series, wake_categories):
    """AIRCRAFT_SEPARATION kind: worst-case (minimum) horizontal distance per matching pair."""
    if not proximity_series:
        return [_not_evaluated(rule, "NO_PROXIMITY_DATA: no pairwise proximity series was derived for this recording.")]

    conditions = rule.get("conditions", {})
    lead_cat = conditions.get("leadCategory")
    trail_cat = conditions.get("trailCategory")
    same_category = lead_cat == trail_cat

    min_by_pair = {}
    for entry in proximity_series:
        c1, c2 = entry["callsign1"], entry["callsign2"]
        lead_cs, trail_cs = entry.get("leadCallsign"), entry.get("trailCallsign")
        cat1, cat2 = wake_categories.get(c1, "UNKNOWN"), wake_categories.get(c2, "UNKNOWN")

        if lead_cs is None or trail_cs is None:
            # Real geometry couldn't order this pair (e.g. unverified runway geometry). Only
            # same-category rules (order-independent) can still be matched honestly; directional
            # rules (lead != trail category) must not guess which aircraft is which.
            if not same_category or {cat1, cat2} != {lead_cat, trail_cat}:
                continue
            lead_cs, trail_cs = c1, c2
        else:
            lead_actual_cat = wake_categories.get(lead_cs, "UNKNOWN")
            trail_actual_cat = wake_categories.get(trail_cs, "UNKNOWN")
            if lead_actual_cat != lead_cat or trail_actual_cat != trail_cat:
                continue

        if entry["horizontalNm"] is None:
            continue
        vertical_ft = entry.get("verticalFt")
        if vertical_ft is not None and vertical_ft >= VERTICAL_SEPARATION_ACHIEVED_FT:
            # Vertical separation alone already satisfies real-world separation standards at this
            # instant -- this moment is not a candidate for a horizontal-separation violation.
            continue
        pair_key = (lead_cs, trail_cs)
        prev = min_by_pair.get(pair_key)
        if prev is None or entry["horizontalNm"] < prev["horizontalNm"]:
            min_by_pair[pair_key] = entry

    if not min_by_pair:
        return [_not_evaluated(
            rule,
            f"NO_MATCHING_PAIR: no aircraft pair with lead={lead_cat}/trail={trail_cat} found "
            f"(unknown wake category, or the pair's lead/trail order could not be determined "
            f"from verified runway geometry)."
        )]

    threshold = rule["threshold"]
    results = []
    for pair_key, entry in min_by_pair.items():
        lead_cs, trail_cs = pair_key
        actual = entry["horizontalNm"]
        required = threshold["value"]
        margin = _margin_for_min_threshold(actual, required) if threshold["operator"] == ">=" else _margin_for_max_threshold(actual, required)
        verdict = _band_from_margin(margin, required)
        results.append({
            "rule_id": rule["rule_id"],
            "verdict": verdict,
            "actualValue": actual,
            "requiredValue": required,
            "margin": round(margin, 4),
            "unit": threshold["unit"],
            "involvedCallsigns": [lead_cs, trail_cs],
            "leadCallsign": lead_cs,
            "trailCallsign": trail_cs,
            "leadCategory": lead_cat,
            "trailCategory": trail_cat,
            "evidence": {"t": entry["t"], "horizontalNm": actual, "verticalFt": entry.get("verticalFt")},
            "reason": None if verdict != "VIOLATION" else "Closest observed horizontal separation fell below the required minimum."
        })
    return results


def _find_event_pairs(runway_events, event_type_a, event_type_b, same_callsign=True):
    """Pairs up the nearest event_type_b following each event_type_a per callsign (or globally)."""
    events_a = [e for e in runway_events if e["eventType"] == event_type_a]
    events_b = [e for e in runway_events if e["eventType"] == event_type_b]
    pairs = []
    for a in events_a:
        candidates = [b for b in events_b if b["t"] >= a["t"] and (not same_callsign or b["callsign"] == a["callsign"])]
        if not candidates:
            continue
        nearest = min(candidates, key=lambda b: b["t"] - a["t"])
        pairs.append((a, nearest))
    return pairs


def evaluate_occupancy_duration(rule, runway_events, wake_categories=None):
    """RUNWAY_OCCUPANCY kind: elapsed time between two named runway events for the same aircraft.

    Optional conditions.requireWakeCategoryIn (e.g. ["MEDIUM", "LIGHT"]) restricts this rule to
    aircraft whose wake category is in that list -- used to encode category-split thresholds
    (e.g. VVDN's post-2026-07-24-draft 10s-for-Code-C / 15s-for-Code-D+ roll-start timing,
    approximated via wake category since this dataset has no separate ICAO aerodrome-code
    lookup: MEDIUM/LIGHT wake ~= Code C, HEAVY/SUPER wake ~= Code D+, matching the draft's own
    worked examples verbatim -- A320/A321 are MEDIUM, A350/B787 are HEAVY). Pairs for an
    UNKNOWN-category aircraft are excluded (never guessed) when this condition is set.
    """
    if not runway_events:
        return [_not_evaluated(rule, "NO_RUNWAY_EVENTS_DATA: runway geometry unavailable/unverified or no events derived from replay_track.jsonl.")]

    event_pair_name = rule.get("conditions", {}).get("eventPair")
    event_pair_map = {
        "touchdown_to_vacate": ("touchdown", "vacate"),
        "line_up_to_departure_roll_start": ("line_up", "departure_roll_start"),
        "touchdown_to_go_around_decision": ("touchdown", "vacate"),  # go-around decision not separately derived; approximated
        "surveillance_gap": None,
    }
    mapped = event_pair_map.get(event_pair_name)
    if mapped is None:
        return [_not_evaluated(rule, f"EVENT_PAIR_NOT_DERIVABLE: '{event_pair_name}' requires a data source not currently derived from replay_track.jsonl.")]

    event_type_a, event_type_b = mapped
    pairs = _find_event_pairs(runway_events, event_type_a, event_type_b)
    if not pairs:
        return [_not_evaluated(rule, f"NO_MATCHING_EVENT_PAIRS: found no '{event_type_a}' -> '{event_type_b}' event pairs.")]

    required_categories = rule.get("conditions", {}).get("requireWakeCategoryIn")
    if required_categories:
        wake_categories = wake_categories or {}
        filtered = []
        for a, b in pairs:
            category = wake_categories.get(a["callsign"], "UNKNOWN")
            if category in required_categories:
                filtered.append((a, b))
        if not filtered:
            return [_not_evaluated(rule, f"NO_PAIRS_IN_REQUIRED_WAKE_CATEGORY: no '{event_type_a}' -> '{event_type_b}' pair had a resolved wake category in {required_categories}.")]
        pairs = filtered

    threshold = rule["threshold"]
    results = []
    for a, b in pairs:
        actual = round(b["t"] - a["t"], 2)
        required = threshold["value"]
        margin = _margin_for_max_threshold(actual, required) if threshold["operator"] == "<=" else _margin_for_min_threshold(actual, required)
        verdict = _band_from_margin(margin, required)
        results.append({
            "rule_id": rule["rule_id"],
            "verdict": verdict,
            "actualValue": actual,
            "requiredValue": required,
            "margin": round(margin, 2),
            "unit": threshold["unit"],
            "involvedCallsigns": [a["callsign"]],
            "evidence": {"startEvent": a, "endEvent": b},
            "reason": None if verdict != "VIOLATION" else f"{event_type_a}->{event_type_b} elapsed time breached the configured threshold."
        })
    return results


def evaluate_dependent_parallel_release_gap(rule, runway_events):
    """RUNWAY_MODE-adjacent kind, specific to dependent-parallel-runway ops (VVDN 24.7.2026
    draft s4.2.1/4.2.2): signed gap between an arrival's touchdown on one runway and a
    departure's roll-start on the OTHER runway of a configured parallel pair
    (conditions.parallelPairs, e.g. [["35L","35R"],["17R","17L"]]).

    Unlike evaluate_occupancy_duration's event pairing, this deliberately allows a NEGATIVE
    actualValue (roll-start before touchdown) rather than filtering it out, because that is
    itself the primary safety violation this rule exists to catch -- a departure must never be
    released before the parallel arrival has touched down, regardless of time-of-day/weather.
    """
    if not runway_events:
        return [_not_evaluated(rule, "NO_RUNWAY_EVENTS_DATA: runway geometry unavailable/unverified or no events derived from replay_track.jsonl.")]

    conditions = rule.get("conditions", {})
    parallel_pairs = conditions.get("parallelPairs", [])
    pair_map = {}
    for a, b in parallel_pairs:
        pair_map[a] = b
        pair_map[b] = a
    if not pair_map:
        return [_not_evaluated(rule, "NO_PARALLEL_PAIRS_CONFIGURED: rule conditions.parallelPairs is empty.")]

    touchdowns = [e for e in runway_events if e["eventType"] == "touchdown"]
    rolls = [e for e in runway_events if e["eventType"] == "departure_roll_start"]
    if not touchdowns or not rolls:
        return [_not_evaluated(rule, "NO_MATCHING_EVENTS: no touchdown and/or departure_roll_start events derived.")]

    max_pair_window_sec = conditions.get("maxPairWindowSec", 180)
    threshold = rule["threshold"]
    results = []
    for td in touchdowns:
        parallel_rwy = pair_map.get(td["runwayDesignator"])
        if not parallel_rwy:
            continue
        candidates = [r for r in rolls if r["runwayDesignator"] == parallel_rwy and abs(r["t"] - td["t"]) <= max_pair_window_sec]
        if not candidates:
            continue
        nearest = min(candidates, key=lambda r: abs(r["t"] - td["t"]))
        actual = round(nearest["t"] - td["t"], 2)  # signed: negative => roll started BEFORE touchdown
        required = threshold["value"]
        margin = _margin_for_min_threshold(actual, required) if threshold["operator"] == ">=" else _margin_for_max_threshold(actual, required)
        verdict = _band_from_margin(margin, required if required else 1.0)
        results.append({
            "rule_id": rule["rule_id"],
            "verdict": verdict,
            "actualValue": actual,
            "requiredValue": required,
            "margin": round(margin, 2),
            "unit": threshold["unit"],
            "involvedCallsigns": [td["callsign"], nearest["callsign"]],
            "evidence": {"arrivalTouchdownEvent": td, "departureRollStartEvent": nearest},
            "reason": None if verdict != "VIOLATION" else "Departure roll-start relative to the parallel-runway arrival's touchdown breached the configured threshold."
        })
    if not results:
        return [_not_evaluated(rule, "NO_PARALLEL_RUNWAY_PAIRS_FOUND: no touchdown/departure_roll_start pair shared a configured parallel-runway relationship within the pairing window.")]
    return results


def evaluate_line_up_gap(rule, runway_events):
    """LINE_UP_WITH_ARRIVAL kind: time gap between a departure's line-up and the nearest arrival touchdown on the same runway."""
    if not runway_events:
        return [_not_evaluated(rule, "NO_RUNWAY_EVENTS_DATA: runway geometry unavailable/unverified or no events derived from replay_track.jsonl.")]

    line_ups = [e for e in runway_events if e["eventType"] == "line_up"]
    touchdowns = [e for e in runway_events if e["eventType"] == "touchdown"]
    if not line_ups or not touchdowns:
        return [_not_evaluated(rule, "NO_MATCHING_EVENTS: no line_up and/or touchdown events derived for this runway.")]

    threshold = rule["threshold"]
    results = []
    for lu in line_ups:
        same_runway_td = [td for td in touchdowns if td["runwayDesignator"] == lu["runwayDesignator"]]
        if not same_runway_td:
            continue
        nearest_td = min(same_runway_td, key=lambda td: abs(td["t"] - lu["t"]))
        actual = round(abs(nearest_td["t"] - lu["t"]), 2)
        required = threshold["value"]
        margin = _margin_for_min_threshold(actual, required) if threshold["operator"] == ">=" else _margin_for_max_threshold(actual, required)
        verdict = _band_from_margin(margin, required)
        results.append({
            "rule_id": rule["rule_id"],
            "verdict": verdict,
            "actualValue": actual,
            "requiredValue": required,
            "margin": round(margin, 2),
            "unit": threshold["unit"],
            "involvedCallsigns": [lu["callsign"], nearest_td["callsign"]],
            "evidence": {"lineUpEvent": lu, "touchdownEvent": nearest_td},
            "reason": None if verdict != "VIOLATION" else "Line-up-to-arrival-touchdown gap breached the configured threshold."
        })
    if not results:
        return [_not_evaluated(rule, "NO_SAME_RUNWAY_PAIRS: no line-up/touchdown events shared the same runway designator.")]
    return results


def evaluate_crossing_clearance_time(rule, runway_events):
    """RUNWAY_CROSSING_WITH_ARRIVAL kind -- requires a 'runway_crossing' event type not yet derived
    from replay_track.jsonl (crossing detection needs taxiway-crossing-point geometry, a Phase 2+ enhancement).
    Honestly reports NOT_EVALUATED rather than guessing."""
    return [_not_evaluated(rule, "RUNWAY_CROSSING_EVENT_TYPE_NOT_DERIVED: crossing-point detection requires taxiway geometry not yet configured in runway_geometry/*.json.")]


def evaluate_intersection_departure_distance(rule, runway_events):
    """INTERSECTION_DEPARTURE kind -- requires intersection-point geometry not yet configured. Honestly NOT_EVALUATED."""
    return [_not_evaluated(rule, "INTERSECTION_GEOMETRY_NOT_CONFIGURED: intersection-departure point geometry is not yet present in runway_geometry/*.json.")]


def evaluate_mode_consistency(rule, detected_mode):
    """RUNWAY_MODE kind: checks the detected runway mode is one of the airport's declared allowed modes."""
    if detected_mode is None:
        return [_not_evaluated(rule, "RUNWAY_MODE_UNDETECTED: could not infer an active runway mode from this recording's geometry/trajectory data.")]

    allowed_modes = rule.get("conditions", {}).get("allowedModes", [])
    in_list = detected_mode in allowed_modes
    return [{
        "rule_id": rule["rule_id"],
        "verdict": "PASS" if in_list else "WARNING",
        "actualValue": detected_mode,
        "requiredValue": allowed_modes,
        "margin": None,
        "unit": rule["threshold"]["unit"],
        "involvedCallsigns": [],
        "evidence": {"detectedMode": detected_mode},
        "reason": None if in_list else f"Detected mode '{detected_mode}' is not in the airport's declared allowed modes."
    }]


_EVALUATOR_DISPATCH = {
    "pairwise_min_distance": evaluate_pairwise_min_distance,
    "crossing_clearance_time": evaluate_crossing_clearance_time,
    "occupancy_duration": evaluate_occupancy_duration,
    "line_up_gap": evaluate_line_up_gap,
    "intersection_departure_distance": evaluate_intersection_departure_distance,
    "mode_consistency": evaluate_mode_consistency,
    "dependent_parallel_release_gap": evaluate_dependent_parallel_release_gap,
}


def evaluate_rule(rule: dict, derived_data: dict) -> list:
    """
    Dispatches a rule to its evaluator based on rule['kind']. derived_data is expected to
    contain: proximity_series, wake_categories, runway_events, detected_mode.
    Unknown kinds return NOT_EVALUATED rather than crashing.
    """
    kind = rule.get("kind")
    evaluator = _EVALUATOR_DISPATCH.get(kind)
    if evaluator is None:
        return [_not_evaluated(rule, f"UNKNOWN_RULE_KIND: '{kind}' has no registered evaluator.")]

    try:
        if kind == "pairwise_min_distance":
            return evaluator(rule, derived_data.get("proximity_series", []), derived_data.get("wake_categories", {}))
        if kind == "mode_consistency":
            return evaluator(rule, derived_data.get("detected_mode"))
        if kind == "occupancy_duration":
            return evaluator(rule, derived_data.get("runway_events", []), derived_data.get("wake_categories", {}))
        return evaluator(rule, derived_data.get("runway_events", []))
    except Exception as e:
        return [_not_evaluated(rule, f"EVALUATOR_EXCEPTION: {str(e)}")]
