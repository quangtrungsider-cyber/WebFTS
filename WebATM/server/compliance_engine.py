import json
import datetime

try:
    from server.kpi_analyzer import load_recording_for_kpi, compute_traffic_kpis
    from server.recordings_api import safe_resolve_recording_path
    from server.compliance_ruleset_loader import load_ruleset, load_runway_geometry
    from server.compliance_airport_detector import detect_airport, detect_runway_mode
    from server.compliance_trajectory_derivation import derive_wake_categories, compute_pairwise_proximity_series, derive_runway_events, classify_flight_phases
    from server.compliance_evaluators import evaluate_rule
    from server.compliance_report_builder import assemble_full_report
except (ImportError, ModuleNotFoundError):
    from .kpi_analyzer import load_recording_for_kpi, compute_traffic_kpis
    from .recordings_api import safe_resolve_recording_path
    from .compliance_ruleset_loader import load_ruleset, load_runway_geometry
    from .compliance_airport_detector import detect_airport, detect_runway_mode
    from .compliance_trajectory_derivation import derive_wake_categories, compute_pairwise_proximity_series, derive_runway_events, classify_flight_phases
    from .compliance_evaluators import evaluate_rule
    from .compliance_report_builder import assemble_full_report

# Contexts partitioned into the 3 independent sub-verdict domains.
SEPARATION_CONTEXTS = {"AIRCRAFT_SEPARATION"}
RUNWAY_PROCEDURE_CONTEXTS = {
    "ARRIVAL_DEPARTURE_PARALLEL", "RUNWAY_CROSSING_WITH_ARRIVAL", "LINE_UP_WITH_ARRIVAL",
    "INTERSECTION_DEPARTURE", "RUNWAY_OCCUPANCY", "REDUCED_SEPARATION", "RUNWAY_MODE"
}

DISCLAIMER = (
    "Compliance evaluation results are generated from saved fast-time simulation recordings for "
    "decision-support only. They are not operational ATC outputs, not training results, not safety "
    "approvals, and not automatic Means of Compliance."
)

LIMITATIONS = [
    "Decision-support / Non-operational.",
    "Not an operational ATC tool.",
    "Not a training simulator.",
    "Not a safety approval.",
    "Not an automatic Means of Compliance.",
    "Separation/runway-event detection is derived from replay_track.jsonl samples, not from a dedicated "
    "conflict/command log (those logs are not populated by the live recording pipeline in practice).",
    "Rules are never defaulted to PASS when required data is missing; such rules report NOT_EVALUATED."
]


def _unsupported_ruleset_result(recording_id, dataset, airport, detection_method, reason_code, reason_message, options=None):
    result = {
        "recordingId": recording_id,
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "watermark": "Decision-support / Non-operational",
        "disclaimer": DISCLAIMER,
        "airport": airport,
        "airportDetectionMethod": detection_method,
        "rulesetVersion": None,
        "geometryStatus": "unavailable",
        "runwayMode": None,
        "timelineSegments": [],
        "overallVerdict": "UNSUPPORTED_RULESET",
        "subVerdicts": {
            "separation": "UNSUPPORTED_RULESET",
            "runwayProcedure": "UNSUPPORTED_RULESET",
            "capacityThroughput": "UNSUPPORTED_RULESET"
        },
        "evaluations": [],
        "report": {"conclusion": {"overallVerdict": "UNSUPPORTED_RULESET", "text": reason_message}},
        "warnings": list(dataset.get("warnings", [])) + [{"code": reason_code, "severity": "critical", "message": reason_message}],
        "dataSources": [src["fileName"] for src in dataset.get("sources", []) if src.get("exists")],
        "limitations": LIMITATIONS
    }
    # Previously this branch never persisted anything: the caller got a valid
    # 200 response once, but revisiting the page or trying to download
    # JSON/DOCX afterwards hit GET .../result -> 404 ("Compliance result not
    # found; run evaluation first"), which reads as a bug rather than the
    # real, honest reason (no ruleset configured for this airport yet).
    if (options or {}).get("saveResult", True):
        save_compliance_result(recording_id, result)
    return result


def _compute_sub_verdict(evaluations):
    if not evaluations:
        return "UNSUPPORTED_RULESET"
    verdicts = {e["verdict"] for e in evaluations}
    if "VIOLATION" in verdicts:
        return "FAIL"
    if "NOT_EVALUATED" in verdicts:
        return "INCOMPLETE"
    return "PASS"


def evaluate_compliance_for_recording(recording_id: str, options: dict = None) -> dict:
    """Top-level entrypoint: evaluate a recording against its airport's compliance ruleset."""
    dataset = load_recording_for_kpi(recording_id)
    if "error" in dataset:
        return dataset

    metadata = dataset.get("metadata", {})
    airport, detection_method = detect_airport(metadata)
    if airport is None:
        return _unsupported_ruleset_result(
            recording_id, dataset, None, detection_method,
            "AIRPORT_UNRESOLVED",
            "Could not determine which airport this recording belongs to (no explicit 'airport' field "
            "and no recognizable ICAO prefix in the scenario file name).",
            options
        )

    ruleset = load_ruleset(airport)
    if not ruleset or not ruleset.get("rules"):
        return _unsupported_ruleset_result(
            recording_id, dataset, airport, detection_method,
            "RULESET_MISSING_FOR_AIRPORT",
            f"No compliance ruleset is configured for airport '{airport}'.",
            options
        )

    geometry = load_runway_geometry(airport)
    geometry_status = (geometry or {}).get("geometryStatus", "unavailable")

    detected_mode, timeline_segments = detect_runway_mode(dataset, geometry)

    warnings_list = list(dataset.get("warnings", []))

    wake_categories = derive_wake_categories(dataset, warnings_list)
    proximity_series = compute_pairwise_proximity_series(dataset.get("trackSamples", []), geometry, warnings_list)
    flight_phases = classify_flight_phases(dataset.get("trackSamples", []))

    if geometry_status == "verified":
        runway_events = derive_runway_events(dataset.get("trackSamples", []), geometry, warnings_list)
    else:
        runway_events = []
        warnings_list.append({
            "code": "GEOMETRY_UNVERIFIED_RUNWAY_RULES_SKIPPED",
            "severity": "warning",
            "message": f"Runway geometry for '{airport}' is not 'verified' (status: {geometry_status}); "
                        f"geometry-dependent runway-operation rules will report NOT_EVALUATED."
        })

    derived_data = {
        "proximity_series": proximity_series,
        "wake_categories": wake_categories,
        "runway_events": runway_events,
        "detected_mode": detected_mode
    }

    all_evaluations = []
    for rule in ruleset.get("rules", []):
        if rule.get("airport") and rule["airport"] != airport:
            continue
        if rule.get("runway_mode") and detected_mode and rule["runway_mode"] != detected_mode:
            continue
        rule_results = evaluate_rule(rule, derived_data)
        for r in rule_results:
            r["operation_context"] = rule["operation_context"]
            all_evaluations.append(r)

    separation_evaluations = [e for e in all_evaluations if e["operation_context"] in SEPARATION_CONTEXTS]
    runway_procedure_evaluations = [e for e in all_evaluations if e["operation_context"] in RUNWAY_PROCEDURE_CONTEXTS]

    traffic_metrics = compute_traffic_kpis(dataset)
    capacity_evaluations = [{
        "rule_id": "CAPACITY_THROUGHPUT_INFO",
        "verdict": "NOT_EVALUATED",
        "actualValue": traffic_metrics.get("peakActiveAircraft"),
        "requiredValue": None,
        "margin": None,
        "unit": "aircraft",
        "involvedCallsigns": [],
        "evidence": traffic_metrics,
        "reason": "No airport-specific capacity/throughput ruleset is configured yet; peak/average active "
                  "aircraft counts are reported for reference only, not as a pass/fail rule.",
        "operation_context": "CAPACITY_THROUGHPUT"
    }]

    sub_verdicts = {
        "separation": _compute_sub_verdict(separation_evaluations),
        "runwayProcedure": _compute_sub_verdict(runway_procedure_evaluations),
        "capacityThroughput": "INCOMPLETE"
    }

    if sub_verdicts["separation"] == "FAIL" or sub_verdicts["runwayProcedure"] == "FAIL":
        overall_verdict = "FAIL"
    elif "INCOMPLETE" in sub_verdicts.values() or "UNSUPPORTED_RULESET" in sub_verdicts.values():
        overall_verdict = "INCOMPLETE"
    else:
        overall_verdict = "PASS"

    report = assemble_full_report(
        dataset, airport, detected_mode, timeline_segments, ruleset, geometry,
        overall_verdict, sub_verdicts, all_evaluations + capacity_evaluations,
        separation_evaluations, runway_procedure_evaluations, dataset.get("trackSamples", []),
        wake_categories, flight_phases
    )

    result = {
        "recordingId": recording_id,
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "watermark": "Decision-support / Non-operational",
        "disclaimer": DISCLAIMER,
        "airport": airport,
        "airportDetectionMethod": detection_method,
        "rulesetVersion": ruleset.get("version"),
        "geometryStatus": geometry_status,
        "runwayMode": detected_mode,
        "timelineSegments": timeline_segments,
        "overallVerdict": overall_verdict,
        "subVerdicts": sub_verdicts,
        "evaluations": all_evaluations + capacity_evaluations,
        "report": report,
        "warnings": warnings_list,
        "dataSources": [src["fileName"] for src in dataset.get("sources", []) if src.get("exists")],
        "limitations": LIMITATIONS
    }

    if (options or {}).get("saveResult", True):
        save_compliance_result(recording_id, result)

    return result


def save_compliance_result(recording_id: str, result: dict):
    """Saves compliance_result.json into the recording folder; additively patches run_metadata.json."""
    try:
        target_dir = safe_resolve_recording_path(recording_id)
    except ValueError:
        return

    try:
        with open(target_dir / "compliance_result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["hasComplianceResult"] = True
            meta["complianceAnalysisDate"] = result["generatedAt"]
            meta["complianceOverallVerdict"] = result["overallVerdict"]
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
        except Exception:
            pass


def delete_compliance_result(recording_id: str):
    """Deletes compliance_result.json and clears the additive run_metadata.json fields."""
    target_dir = safe_resolve_recording_path(recording_id)
    deleted_files = []
    result_file = target_dir / "compliance_result.json"
    if result_file.exists():
        result_file.unlink()
        deleted_files.append("compliance_result.json")

    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta.pop("hasComplianceResult", None)
            meta.pop("complianceAnalysisDate", None)
            meta.pop("complianceOverallVerdict", None)
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    return deleted_files
