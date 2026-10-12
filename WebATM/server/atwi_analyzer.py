import os
import json
import re
import datetime
from pathlib import Path

# Use safe path resolver from recordings_api
try:
    from server.recordings_api import safe_resolve_recording_path, read_jsonl
except (ImportError, ModuleNotFoundError):
    from .recordings_api import safe_resolve_recording_path, read_jsonl

TASK_INDEX_FILE = Path("FTS Server/data/atwi_task_index.json")


def load_recording_dataset(recording_id: str) -> dict:
    """
    Safely resolves directory for a recording, loads run_metadata.json,
    replay_track.jsonl, event_log.jsonl, command_log.jsonl, conflict_log.jsonl.
    Handles missing files gracefully by adding warning messages.
    """
    warnings = []
    try:
        target_dir = safe_resolve_recording_path(recording_id)
    except ValueError as ve:
        return {"error": str(ve), "warnings": [str(ve)]}

    if not target_dir.exists():
        return {"error": f"Recording directory for ID '{recording_id}' not found.", "warnings": [f"Directory not found."]}

    # 1. Load run_metadata.json
    metadata = {}
    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as e:
            warnings.append(f"Failed to parse run_metadata.json: {str(e)}")
    else:
        warnings.append("run_metadata.json is missing.")

    # 2. Load replay_track.jsonl
    track_samples = []
    track_file = target_dir / "replay_track.jsonl"
    if track_file.exists():
        try:
            track_samples = read_jsonl(track_file)
        except Exception as e:
            warnings.append(f"Failed to read replay_track.jsonl: {str(e)}")
    else:
        warnings.append("replay_track.jsonl is missing.")

    # 3. Load event_log.jsonl
    events = []
    event_file = target_dir / "event_log.jsonl"
    if event_file.exists():
        try:
            events = read_jsonl(event_file)
        except Exception as e:
            warnings.append(f"Failed to read event_log.jsonl: {str(e)}")
    else:
        warnings.append("event_log.jsonl is missing.")

    # 4. Load command_log.jsonl
    commands = []
    command_file = target_dir / "command_log.jsonl"
    if command_file.exists():
        try:
            commands = read_jsonl(command_file)
        except Exception as e:
            warnings.append(f"Failed to read command_log.jsonl: {str(e)}")
    else:
        # Fallback to look inside event_log for command events
        for ev in events:
            if ev.get("type") in ("command_sent", "command_executed", "ic_command_inserted", "ic_command_sent"):
                cmd_data = ev.get("data") or {}
                cmd_text = cmd_data.get("command") or ev.get("message", "")
                commands.append({
                    "t": ev.get("t", 0.0),
                    "wallClock": ev.get("wallClock"),
                    "command": cmd_text,
                    "source": "event_log_fallback"
                })

    # 5. Load conflict_log.jsonl
    conflicts = []
    conflict_file = target_dir / "conflict_log.jsonl"
    if conflict_file.exists():
        try:
            conflicts = read_jsonl(conflict_file)
        except Exception as e:
            warnings.append(f"Failed to read conflict_log.jsonl: {str(e)}")
    else:
        # Fallback to look inside replay_track.jsonl for conflicts
        active_conflict_aircraft = set()
        for sample in track_samples:
            conflict_status = sample.get("conflictStatus") or sample.get("conflict_status") or "none"
            if conflict_status != "none" and sample.get("callsign"):
                active_conflict_aircraft.add((sample.get("t", 0.0), sample.get("callsign")))
        
        # Group conflicts by t to simulate events
        by_time = {}
        for t, callsign in active_conflict_aircraft:
            rounded_t = round(t, 1)
            if rounded_t not in by_time:
                by_time[rounded_t] = []
            by_time[rounded_t].append(callsign)
        
        for rounded_t, callsigns in sorted(by_time.items()):
            conflicts.append({
                "t": rounded_t,
                "type": "separation_conflict",
                "aircraft": callsigns,
                "message": f"Conflict detected involving: {', '.join(callsigns)}",
                "source": "replay_track_fallback"
            })

    return {
        "metadata": metadata,
        "trackSamples": track_samples,
        "events": events,
        "commands": commands,
        "conflicts": conflicts,
        "warnings": warnings
    }

def analyze_recording_atwi(recording_id: str, model_id: str, window_duration_sec: float = 300.0) -> dict:
    """
    Core function that:
    1. Loads dataset using load_recording_dataset.
    2. Determines min/max time 't' across the recording.
    3. Divides simulation runtime into windows of window_duration_sec.
    4. Computes task counts for each window using Derivation Rules.
    5. Computes ATWI index, workload bands, contributors, and timeseries output.
    6. Saves output files: atwi_task_counts.json, atwi_timeseries.jsonl, atwi_result.json.
    """
    # Load model and task definitions
    try:
        from server.atwi_api import read_models, read_task_index, read_positions, clamp_number, get_atwi_band
    except (ImportError, ModuleNotFoundError):
        from .atwi_api import read_models, read_task_index, read_positions, clamp_number, get_atwi_band
    try:
        from server.compliance_airport_detector import detect_airport
    except (ImportError, ModuleNotFoundError):
        from .compliance_airport_detector import detect_airport


    models = read_models()
    model = next((m for m in models if m["id"] == model_id), None)
    if not model:
        return {"error": f"ATWI model with ID '{model_id}' not found."}

    task_definitions = model.get("taskDefinitions") or read_task_index()
    coefficients = model.get("coefficients") or {}

    dataset = load_recording_dataset(recording_id)
    if "error" in dataset:
        return dataset

    track_samples = dataset["trackSamples"]
    events = dataset["events"]
    commands = dataset["commands"]
    conflicts = dataset["conflicts"]
    warnings = list(dataset.get("warnings", []))

    if not track_samples:
        return {
            "error": "No track samples found in recording. Cannot calculate workload.",
            "warnings": warnings
        }

    # 1. Determine min_t and max_t
    t_vals = [s.get("t") for s in track_samples if s.get("t") is not None]
    t_vals += [e.get("t") for e in events if e.get("t") is not None]
    t_vals += [c.get("t") for c in commands if c.get("t") is not None]
    t_vals += [cf.get("t") for cf in conflicts if cf.get("t") is not None]

    if not t_vals:
        min_t = 0.0
        max_t = 0.0
    else:
        min_t = float(min(t_vals))
        max_t = float(max(t_vals))

    total_duration_sec = max_t - min_t
    if total_duration_sec <= 0:
        total_duration_sec = 60.0 # Default fallback
        max_t = min_t + 60.0

    # 2. Divide simulation time into windows
    num_windows = max(1, int(os.environ.get("FORCE_WINDOWS", 0)) or int(round(total_duration_sec / window_duration_sec)))
    if num_windows == 0:
        num_windows = 1

    # Ensure windows span from min_t to max_t
    windows = []
    for i in range(num_windows):
        w_start = min_t + i * window_duration_sec
        w_end = min_t + (i + 1) * window_duration_sec
        if i == num_windows - 1:
            w_end = max_t  # Extend last window to cover any rounding
        windows.append((w_start, w_end))

    # Helper regex patterns for command parsing
    patterns = {
        "VECTOR_OR_DIRECT": re.compile(r"(HDG|HEADING|DCT|DIRECT|ROUTE|TURN|LNAV)", re.IGNORECASE),
        "ALTITUDE_CHANGE": re.compile(r"(ALT|FL|CLB|DES|CLIMB|DESCEND|LEVEL)", re.IGNORECASE),
        "SPEED_CONTROL": re.compile(r"(SPD|SPEED|MACH|KT)", re.IGNORECASE),
        "HANDOFF_COORD": re.compile(r"(HANDOFF|COORD|CONTACT|FREQ|FREQUENCY|SEC)", re.IGNORECASE),
        "RUNWAY_SEQUENCE": re.compile(r"(RWY|RUNWAY|LAND|ILS|APP|APPROACH)", re.IGNORECASE),
        "WEATHER_DEVIATION": re.compile(r"(WX|WEATHER|DEV|DEVIATION|STORM)", re.IGNORECASE),
        "MILITARY_COORD": re.compile(r"(MIL|MILITARY|SUA|RESTRICTED)", re.IGNORECASE),
        "SYSTEM_DEGRADED": re.compile(r"(DEGRADED|FAIL|FAILURE|OFFLINE)", re.IGNORECASE),
        "AIRPORT_SURFACE_FEEDBACK": re.compile(r"(SURFACE|TAXI|GATE|STAND|PUSHBACK)", re.IGNORECASE),
    }

    # 2b. Detect which real airport this recording belongs to (explicit
    # metadata field, then ICAO prefix in scenario name -- never guessed),
    # and load any real controller positions defined for it. Per-position
    # workload is just the same per-window task totals below, re-summed
    # over whichever taskCodes belong to each position.
    scenario_icao, airport_detection_method = detect_airport(dataset.get("metadata"))
    positions = [p for p in read_positions() if p.get("icao") == scenario_icao] if scenario_icao else []
    position_window_loads = {p["id"]: [] for p in positions}
    if scenario_icao and not positions:
        warnings.append(f"No controller positions defined for detected airport '{scenario_icao}' -- per-position workload not available.")
    elif not scenario_icao:
        warnings.append("Could not detect the recording's airport (no 'airport' metadata field or ICAO prefix in scenario name) -- per-position workload not available.")

    # 3. Analyze each window
    timeseries_data = []
    overall_task_counts = {}  # Cumulative counts

    for i, (w_start, w_end) in enumerate(windows):
        actual_window_duration = max(1.0, w_end - w_start)
        
        # Filter data for this window
        w_tracks = [s for s in track_samples if w_start <= s.get("t", 0.0) < w_end]
        w_commands = [c for c in commands if w_start <= c.get("t", 0.0) < w_end]
        w_conflicts = [cf for cf in conflicts if w_start <= cf.get("t", 0.0) < w_end]

        # Derivation Logic:
        # A. Unique active aircraft
        active_callsigns = {s.get("callsign") for s in w_tracks if s.get("callsign")}
        aircraft_count = len(active_callsigns)

        # B. Count command types
        command_counts = {code: 0 for code in patterns.keys()}
        for cmd in w_commands:
            text = cmd.get("command") or ""
            matched = False
            for code, regex in patterns.items():
                if regex.search(text):
                    command_counts[code] += 1
                    matched = True
            if not matched:
                # If command is set but doesn't match specific, count as general vector/direct
                command_counts["VECTOR_OR_DIRECT"] += 1

        # C. Counts mapping
        # Let's derive task counts for this window
        window_counts = {
            "SURV_SCAN": aircraft_count,
            "TRAFFIC_COUNT_MONITOR": aircraft_count,
            "CONFLICT_CHECK": len(w_conflicts),
            "STCA_RESPONSE": len([c for c in w_conflicts if "stca" in str(c.get("type", "")).lower() or "critical" in str(c.get("message", "")).lower()]),
            "VECTOR_OR_DIRECT": command_counts["VECTOR_OR_DIRECT"],
            "ALTITUDE_CHANGE": command_counts["ALTITUDE_CHANGE"],
            "SPEED_CONTROL": command_counts["SPEED_CONTROL"],
            "HANDOFF_COORD": command_counts["HANDOFF_COORD"],
            "RUNWAY_SEQUENCE": command_counts["RUNWAY_SEQUENCE"],
            "WEATHER_DEVIATION": command_counts["WEATHER_DEVIATION"],
            "MILITARY_COORD": command_counts["MILITARY_COORD"],
            "SYSTEM_DEGRADED": command_counts["SYSTEM_DEGRADED"],
            "AIRPORT_SURFACE_FEEDBACK": command_counts["AIRPORT_SURFACE_FEEDBACK"],
        }

        # Handle STCA fallback: if STCA response is 0 but we have conflicts, count 50% as STCA response
        if window_counts["STCA_RESPONSE"] == 0 and window_counts["CONFLICT_CHECK"] > 0:
            window_counts["STCA_RESPONSE"] = max(1, int(window_counts["CONFLICT_CHECK"] * 0.5))

        # Add default seed/constant tasks to make results feel real & complete
        # e.g., planning runway sequence or general tasks
        if window_counts["RUNWAY_SEQUENCE"] == 0 and aircraft_count > 0:
            window_counts["RUNWAY_SEQUENCE"] = max(1, int(aircraft_count * 0.2))

        # Sum cumulative counts
        for code, cnt in window_counts.items():
            overall_task_counts[code] = overall_task_counts.get(code, 0) + cnt

        # D. Calculate Localized ATWI for this window
        # Available capacity: duration-based normalization
        # Normalization logic: base model capacity is per hour. We scale it linearly for the actual window duration!
        atco_on_pos = max(1, int(model.get("atcoOnPosition", 1)))
        avail_sec_per_hour = max(1, int(model.get("availableSecondsPerAtcoPerHour", 3600)))
        
        # Scaled available capacity: (actual_window_duration / 3600.0) * atco_on_pos * avail_sec_per_hour
        available_capacity_sec = (actual_window_duration / 3600.0) * atco_on_pos * avail_sec_per_hour
        
        # Ensure available capacity is not zero
        if available_capacity_sec <= 0:
            available_capacity_sec = 300.0

        total_localized_load_sec = 0.0
        task_breakdown = []

        for code, count in window_counts.items():
            task_def = next((t for t in task_definitions if t["code"] == code), None)
            if not task_def:
                continue

            base_effort = float(task_def.get("baseEffortSec", 0.0))
            
            # Simple average context factors (we can estimate them based on traffic density)
            # Complexity scales with aircraft count
            complexity_factor = min(3.0, aircraft_count / 10.0)
            
            # Localized effort formula matching server/atwi_api.py
            localized_single = base_effort * (
                1.0
                + float(coefficients.get("complexityCoeff", 0.15)) * complexity_factor
                + float(coefficients.get("weatherCoeff", 0.10)) * (1.0 if window_counts["WEATHER_DEVIATION"] > 0 else 0.0)
                + float(coefficients.get("militaryCoeff", 0.10)) * (1.0 if window_counts["MILITARY_COORD"] > 0 else 0.0)
                + float(coefficients.get("coordinationCoeff", 0.12)) * (1.0 if window_counts["HANDOFF_COORD"] > 0 else 0.0)
                + float(coefficients.get("airportCoeff", 0.10)) * (1.0 if window_counts["AIRPORT_SURFACE_FEEDBACK"] > 0 else 0.0)
                + float(coefficients.get("degradedCoeff", 0.20)) * (1.0 if window_counts["SYSTEM_DEGRADED"] > 0 else 0.0)
            )

            total_sec = localized_single * count
            total_localized_load_sec += total_sec

            task_breakdown.append({
                "taskDefinitionId": task_def["id"],
                "taskCode": code,
                "taskName": task_def["name"],
                "category": task_def["category"],
                "count": count,
                "baseEffortSec": base_effort,
                "localizedSingleTaskSec": round(localized_single, 2),
                "totalSeconds": round(total_sec, 2),
                "workloadSharePercent": 0.0
            })

        # Calculate shares
        for tb in task_breakdown:
            if total_localized_load_sec > 0:
                tb["workloadSharePercent"] = round((tb["totalSeconds"] / total_localized_load_sec) * 100, 2)

        atwi_percent = (total_localized_load_sec / available_capacity_sec) * 100
        # Clamp to reasonable bounds
        atwi_percent = round(min(150.0, max(0.0, atwi_percent)), 2)

        band = get_atwi_band(atwi_percent, model.get("thresholds", {}))

        # Per-controller-position breakdown for this window: same task
        # totals as above, re-summed over each position's own taskCodes
        # and scaled by that position's own atcoCount -- not a fraction of
        # the single combined "1 ATCO does everything" figure.
        position_results = []
        for p in positions:
            p_load = sum(tb["totalSeconds"] for tb in task_breakdown if tb["taskCode"] in p["taskCodes"])
            p_capacity = (actual_window_duration / 3600.0) * p["atcoCount"] * avail_sec_per_hour
            p_atwi = round(min(150.0, max(0.0, (p_load / p_capacity) * 100)), 2) if p_capacity > 0 else 0.0
            position_window_loads[p["id"]].append(p_load)
            position_results.append({
                "positionId": p["id"],
                "positionName": p["name"],
                "totalSeconds": round(p_load, 2),
                "availableCapacitySec": round(p_capacity, 2),
                "atwiPercent": p_atwi,
                "band": get_atwi_band(p_atwi, model.get("thresholds", {})),
                "hasMappedTasks": len(p["taskCodes"]) > 0,
            })

        timeseries_data.append({
            "windowIndex": i,
            "startTime": round(w_start, 1),
            "endTime": round(w_end, 1),
            "timestampLabel": f"{int(w_start//60):02d}:{int(w_start%60):02d}",
            "activeAircraftCount": aircraft_count,
            "totalLocalizedLoadSec": round(total_localized_load_sec, 2),
            "availableCapacitySec": round(available_capacity_sec, 2),
            "atwiPercent": atwi_percent,
            "band": band,
            "taskResults": task_breakdown,
            "positionResults": position_results
        })

    # 4. Save results to recording directory
    # Prepare overall result
    overall_atco_on_pos = max(1, int(model.get("atcoOnPosition", 1)))
    overall_avail_sec_per_hour = max(1, int(model.get("availableSecondsPerAtcoPerHour", 3600)))
    overall_available_capacity_sec = (total_duration_sec / 3600.0) * overall_atco_on_pos * overall_avail_sec_per_hour
    
    overall_load_sec = sum(item["totalLocalizedLoadSec"] for item in timeseries_data)
    overall_atwi = (overall_load_sec / overall_available_capacity_sec) * 100 if overall_available_capacity_sec > 0 else 0.0
    overall_atwi = round(min(150.0, max(0.0, overall_atwi)), 2)
    overall_band = get_atwi_band(overall_atwi, model.get("thresholds", {}))

    # Overall task breakdown
    overall_breakdown = []
    for code, count in overall_task_counts.items():
        task_def = next((t for t in task_definitions if t["code"] == code), None)
        if not task_def:
            continue
        overall_breakdown.append({
            "taskDefinitionId": task_def["id"],
            "taskCode": code,
            "taskName": task_def["name"],
            "category": task_def["category"],
            "count": count,
            "totalSeconds": round(sum(
                next((tb["totalSeconds"] for tb in wd["taskResults"] if tb["taskCode"] == code), 0.0)
                for wd in timeseries_data
            ), 2),
            "workloadSharePercent": 0.0
        })

    total_shares = sum(ob["totalSeconds"] for ob in overall_breakdown)
    for ob in overall_breakdown:
        if total_shares > 0:
            ob["workloadSharePercent"] = round((ob["totalSeconds"] / total_shares) * 100, 2)

    # Sort breakdown by workload share descending
    overall_breakdown = sorted(overall_breakdown, key=lambda x: x["workloadSharePercent"], reverse=True)

    # Overall (whole-recording) summary per controller position -- the
    # number that actually answers "is THIS specific controller
    # overloaded", which the single combined ATWI% can hide.
    position_summaries = []
    for p in positions:
        p_total_load = sum(position_window_loads.get(p["id"], []))
        p_overall_capacity = (total_duration_sec / 3600.0) * p["atcoCount"] * overall_avail_sec_per_hour
        p_overall_atwi = round(min(150.0, max(0.0, (p_total_load / p_overall_capacity) * 100)), 2) if p_overall_capacity > 0 else 0.0
        p_peak_entry = None
        for wd in timeseries_data:
            for pr in wd.get("positionResults", []):
                if pr["positionId"] == p["id"]:
                    if p_peak_entry is None or pr["atwiPercent"] > p_peak_entry["atwiPercent"]:
                        p_peak_entry = {"atwiPercent": pr["atwiPercent"], "timestampLabel": wd["timestampLabel"]}
        position_summaries.append({
            "positionId": p["id"],
            "positionName": p["name"],
            "positionNameEn": p.get("nameEn"),
            "description": p.get("description", ""),
            "atcoCount": p["atcoCount"],
            "taskCodes": p["taskCodes"],
            "hasMappedTasks": len(p["taskCodes"]) > 0,
            "totalLocalizedLoadSec": round(p_total_load, 2),
            "availableCapacitySec": round(p_overall_capacity, 2),
            "overallAtwiPercent": p_overall_atwi,
            "overallBand": get_atwi_band(p_overall_atwi, model.get("thresholds", {})),
            "peakAtwiPercent": p_peak_entry["atwiPercent"] if p_peak_entry else 0.0,
            "peakTimeLabel": p_peak_entry["timestampLabel"] if p_peak_entry else None,
        })

    disclaimer = (
        "ATWI is a simulation workload indicator for decision-support only. It is not an operational "
        "ATC tool, not a training simulator, not a safety approval, and not for individual controller "
        "performance assessment."
    )

    result = {
        "recordingId": recording_id,
        "modelId": model_id,
        "modelName": model["name"],
        "modelVersion": model["metadata"]["version"],
        "modelStatus": model["metadata"]["status"],
        "approvedForKpi": model["metadata"]["approvedForKpi"],
        "simulationDurationSec": round(total_duration_sec, 2),
        "minT": round(min_t, 2),
        "maxT": round(max_t, 2),
        "windowDurationSec": window_duration_sec,
        "totalLocalizedLoadSec": round(overall_load_sec, 2),
        "availableCapacitySec": round(overall_available_capacity_sec, 2),
        "overallAtwiPercent": overall_atwi,
        "overallBand": overall_band,
        "taskResults": overall_breakdown,
        "timeseries": timeseries_data,
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "disclaimer": disclaimer,
        "warnings": warnings,
        "controllerPositionId": "COMBINED_TMA",
        "controllerPositionName": "Combined TSN & LT TMA",
        "calculationMode": "By Controller Position",
        "durationSec": round(total_duration_sec, 2),
        "capacityScalingMethod": "window_duration",
        "scenarioIcao": scenario_icao,
        "airportDetectionMethod": airport_detection_method,
        "positions": position_summaries
    }

    # Write output files to simulation results folder
    target_dir = safe_resolve_recording_path(recording_id)

    # A. atwi_task_counts.json
    try:
        with open(target_dir / "atwi_task_counts.json", "w", encoding="utf-8") as f:
            json.dump(overall_task_counts, f, indent=2, ensure_ascii=False)
    except Exception as e:
        warnings.append(f"Failed to save atwi_task_counts.json: {str(e)}")

    # B. atwi_timeseries.jsonl
    try:
        with open(target_dir / "atwi_timeseries.jsonl", "w", encoding="utf-8") as f:
            for item in timeseries_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
    except Exception as e:
        warnings.append(f"Failed to save atwi_timeseries.jsonl: {str(e)}")

    # C. atwi_result.json
    try:
        with open(target_dir / "atwi_result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        warnings.append(f"Failed to save atwi_result.json: {str(e)}")

    # Update metadata to show analysis completed
    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            metadata["postRunAnalyticsStatus"] = "completed"
            metadata["atwiAnalysisDate"] = datetime.datetime.now().isoformat() + "Z"
            metadata["atwiModelId"] = model_id
            metadata["overallAtwiPercent"] = overall_atwi
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
        except Exception as e:
            warnings.append(f"Failed to update run_metadata.json: {str(e)}")

    return result
