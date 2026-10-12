import os
import json
import re
import datetime
from pathlib import Path

# Use safe path resolver and read_jsonl from recordings_api
try:
    from server.recordings_api import safe_resolve_recording_path, read_jsonl
except (ImportError, ModuleNotFoundError):
    from .recordings_api import safe_resolve_recording_path, read_jsonl

KPI_CATALOGUE_FILE = Path("FTS Server/data/kpi_catalogue.json")

def load_kpi_catalogue() -> list:
    """Reads and returns the list of KPI definitions from kpi_catalogue.json."""
    if not KPI_CATALOGUE_FILE.exists():
        return []
    try:
        with open(KPI_CATALOGUE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def load_recording_for_kpi(recording_id: str) -> dict:
    """
    Safely resolves directory for a recording, loads all logs and results,
    tracking data source availability and parse warnings.
    """
    warnings = []
    sources = []
    
    try:
        target_dir = safe_resolve_recording_path(recording_id)
    except ValueError as ve:
        return {"error": str(ve), "warnings": [{"code": "RECORDING_PATH_INVALID", "severity": "error", "message": str(ve)}]}

    if not target_dir.exists():
        return {
            "error": f"Recording directory for ID '{recording_id}' not found.",
            "warnings": [{"code": "DIRECTORY_NOT_FOUND", "severity": "error", "message": "Recording directory not found."}]
        }

    # Helper function to track source files
    def track_source(file_name, role, exists):
        sources.append({
            "fileName": file_name,
            "exists": exists,
            "role": role
        })

    # 1. Load run_metadata.json
    metadata = {}
    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            track_source("run_metadata.json", "recording metadata", True)
        except Exception as e:
            warnings.append({
                "code": "METADATA_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to parse run_metadata.json: {str(e)}"
            })
            track_source("run_metadata.json", "recording metadata", False)
    else:
        warnings.append({
            "code": "METADATA_MISSING",
            "severity": "warning",
            "message": "run_metadata.json is missing."
        })
        track_source("run_metadata.json", "recording metadata", False)

    # 2. Load replay_track.jsonl
    track_samples = []
    track_file = target_dir / "replay_track.jsonl"
    if track_file.exists():
        try:
            track_samples = read_jsonl(track_file)
            track_source("replay_track.jsonl", "trajectory samples", True)
        except Exception as e:
            warnings.append({
                "code": "TRACK_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to read replay_track.jsonl: {str(e)}"
            })
            track_source("replay_track.jsonl", "trajectory samples", False)
    else:
        warnings.append({
            "code": "TRACK_MISSING",
            "severity": "warning",
            "message": "replay_track.jsonl is missing."
        })
        track_source("replay_track.jsonl", "trajectory samples", False)

    # 3. Load event_log.jsonl
    events = []
    event_file = target_dir / "event_log.jsonl"
    if event_file.exists():
        try:
            events = read_jsonl(event_file)
            track_source("event_log.jsonl", "simulation events", True)
        except Exception as e:
            warnings.append({
                "code": "EVENT_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to read event_log.jsonl: {str(e)}"
            })
            track_source("event_log.jsonl", "simulation events", False)
    else:
        warnings.append({
            "code": "EVENT_LOG_MISSING",
            "severity": "info",
            "message": "event_log.jsonl is missing."
        })
        track_source("event_log.jsonl", "simulation events", False)

    # 4. Load command_log.jsonl
    commands = []
    command_file = target_dir / "command_log.jsonl"
    if command_file.exists():
        try:
            commands = read_jsonl(command_file)
            track_source("command_log.jsonl", "controller commands", True)
        except Exception as e:
            warnings.append({
                "code": "COMMAND_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to read command_log.jsonl: {str(e)}"
            })
            track_source("command_log.jsonl", "controller commands", False)
    else:
        warnings.append({
            "code": "COMMAND_LOG_MISSING",
            "severity": "info",
            "message": "command_log.jsonl is missing."
        })
        track_source("command_log.jsonl", "controller commands", False)

    # 5. Load conflict_log.jsonl
    conflicts = []
    conflict_file = target_dir / "conflict_log.jsonl"
    if conflict_file.exists():
        try:
            conflicts = read_jsonl(conflict_file)
            track_source("conflict_log.jsonl", "separation conflicts", True)
        except Exception as e:
            warnings.append({
                "code": "CONFLICT_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to read conflict_log.jsonl: {str(e)}"
            })
            track_source("conflict_log.jsonl", "separation conflicts", False)
    else:
        warnings.append({
            "code": "CONFLICT_LOG_MISSING",
            "severity": "info",
            "message": "conflict_log.jsonl is missing."
        })
        track_source("conflict_log.jsonl", "separation conflicts", False)

    # 6. Load atwi_result.json
    atwi_result = {}
    atwi_result_file = target_dir / "atwi_result.json"
    if atwi_result_file.exists():
        try:
            with open(atwi_result_file, "r", encoding="utf-8") as f:
                atwi_result = json.load(f)
            track_source("atwi_result.json", "ATWI workload result", True)
        except Exception as e:
            warnings.append({
                "code": "ATWI_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to parse atwi_result.json: {str(e)}"
            })
            track_source("atwi_result.json", "ATWI workload result", False)
    else:
        warnings.append({
            "code": "ATWI_RESULT_MISSING",
            "severity": "warning",
            "message": "ATWI workload analysis result is missing. Run ATWI from Recording first."
        })
        track_source("atwi_result.json", "ATWI workload result", False)

    # 7. Load atwi_timeseries.jsonl
    atwi_timeseries = []
    atwi_timeseries_file = target_dir / "atwi_timeseries.jsonl"
    if atwi_timeseries_file.exists():
        try:
            atwi_timeseries = read_jsonl(atwi_timeseries_file)
            track_source("atwi_timeseries.jsonl", "ATWI workload timeseries", True)
        except Exception as e:
            warnings.append({
                "code": "ATWI_TIMESERIES_PARSE_FAILED",
                "severity": "warning",
                "message": f"Failed to read atwi_timeseries.jsonl: {str(e)}"
            })
            track_source("atwi_timeseries.jsonl", "ATWI workload timeseries", False)
    else:
        track_source("atwi_timeseries.jsonl", "ATWI workload timeseries", False)

    return {
        "metadata": metadata,
        "trackSamples": track_samples,
        "events": events,
        "commands": commands,
        "conflicts": conflicts,
        "atwiResult": atwi_result,
        "atwiTimeseries": atwi_timeseries,
        "warnings": warnings,
        "sources": sources
    }

def compute_traffic_kpis(dataset: dict) -> dict:
    """Computes traffic & throughput metrics from replay track samples."""
    samples = dataset.get("trackSamples", [])

    unique_aircraft = set()
    t_values = []

    for s in samples:
        callsign = s.get("callsign")
        if callsign:
            unique_aircraft.add(callsign)
        t = s.get("t")
        if t is not None:
            t_values.append(t)

    # Unique aircraft count
    unique_aircraft_count = len(unique_aircraft)

    # Track sample count
    sample_count = len(samples)

    # Run duration: based ONLY on real trajectory samples, not on event_log.jsonl timestamps.
    # A "recording_stopped" event can be logged long after all aircraft activity has ended
    # (operator leaves the recording running idle before clicking Stop), which previously
    # inflated this duration far beyond the scenario's actual traffic span (confirmed real
    # case: replay_track.jsonl ended at t=4893s but event_log's recording_stopped was at
    # t=38167s, showing "636 minutes" instead of the real ~82 minutes of air traffic).
    duration = 0.0
    if t_values:
        duration = max(t_values) - min(t_values)
        
    # Active aircraft per minute bin
    # Group samples by 60s windows
    minute_bins = {}
    for s in samples:
        t = s.get("t", 0.0)
        callsign = s.get("callsign")
        if callsign:
            min_bin = int(t // 60)
            if min_bin not in minute_bins:
                minute_bins[min_bin] = set()
            minute_bins[min_bin].add(callsign)
            
    active_counts = [len(callsigns) for callsigns in minute_bins.values()]
    avg_active = round(sum(active_counts) / len(active_counts), 2) if active_counts else 0.0
    peak_active = max(active_counts) if active_counts else 0
    
    return {
        "uniqueAircraftCount": unique_aircraft_count,
        "sampleCount": sample_count,
        "runDurationSec": round(duration, 2),
        "averageActiveAircraft": avg_active,
        "peakActiveAircraft": peak_active
    }

def compute_conflict_kpis(dataset: dict) -> dict:
    """Computes conflict warning and safety proxy metrics from conflict logs."""
    conflicts = dataset.get("conflicts", [])
    
    conflict_count = len(conflicts)
    critical_count = 0
    warning_count = 0
    min_horizontal = None
    min_vertical = None
    
    for c in conflicts:
        severity = str(c.get("severity", "")).lower() or str(c.get("type", "")).lower()
        if severity in ("critical", "separation_conflict", "stca"):
            critical_count += 1
        elif severity in ("warning", "high", "caution"):
            warning_count += 1
            
        h_dist = c.get("horizontalNm") or c.get("horizontal_nm")
        if h_dist is not None:
            h_dist = float(h_dist)
            if min_horizontal is None or h_dist < min_horizontal:
                min_horizontal = h_dist
                
        v_dist = c.get("verticalFt") or c.get("vertical_ft")
        if v_dist is not None:
            v_dist = float(v_dist)
            if min_vertical is None or v_dist < min_vertical:
                min_vertical = v_dist

    # Fallbacks if horizontal/vertical metrics not explicitly stored but conflict occurred
    if conflict_count > 0:
        if min_horizontal is None:
            min_horizontal = 3.0 # Default Vietnamese terminal standard
        if min_vertical is None:
            min_vertical = 1000.0 # Standard RVSM vertical minimum
            
    return {
        "conflictEventCount": conflict_count,
        "criticalConflictCount": critical_count,
        "warningConflictCount": warning_count,
        "minHorizontalDistanceNm": round(min_horizontal, 2) if min_horizontal is not None else None,
        "minVerticalDistanceFt": round(min_vertical, 2) if min_vertical is not None else None
    }

def compute_command_kpis(dataset: dict) -> dict:
    """Computes controller tactic intervention metrics from command logs."""
    commands = dataset.get("commands", [])
    
    total_commands = 0
    ic_count = 0
    vector_count = 0
    altitude_count = 0
    speed_count = 0
    
    # Keyword patterns
    vector_re = re.compile(r"(HDG|HEADING|DCT|DIRECT|ROUTE|TURN|LNAV)", re.IGNORECASE)
    altitude_re = re.compile(r"(ALT|FL|CLB|DES|CLIMB|DESCEND|LEVEL)", re.IGNORECASE)
    speed_re = re.compile(r"(SPD|SPEED|MACH|KT)", re.IGNORECASE)
    
    for c in commands:
        # Ignore preview commands if sent=False exists
        if c.get("sent") is False:
            continue
            
        cmd_text = str(c.get("command") or "").strip()
        if not cmd_text:
            continue
            
        total_commands += 1
        
        # Check command types
        if cmd_text.upper().startswith("IC"):
            ic_count += 1
            
        if vector_re.search(cmd_text):
            vector_count += 1
        if altitude_re.search(cmd_text):
            altitude_count += 1
        if speed_re.search(cmd_text):
            speed_count += 1
            
    return {
        "commandCount": total_commands,
        "icCommandCount": ic_count,
        "vectorDirectCommandCount": vector_count,
        "altitudeCommandCount": altitude_count,
        "speedCommandCount": speed_count
    }

def compute_atwi_kpis(dataset: dict) -> dict:
    """Extracts ATWI whole-run and binned workload metrics from atwi_result.json."""
    res = dataset.get("atwiResult", {})
    timeseries = dataset.get("atwiTimeseries", [])
    
    if not res:
        return {
            "wholeRunAtwiPercent": None,
            "averageAtwiPercent": None,
            "peakAtwiPercent": None,
            "peakBand": "UNAVAILABLE",
            "criticalWindowCount": 0,
            "highWindowCount": 0,
            "available": False
        }
        
    whole_run = res.get("overallAtwiPercent")
    peak_band = res.get("overallBand") or "NORMAL"
    
    # Binned details
    atwi_vals = [t.get("atwiPercent", 0.0) for t in timeseries]
    avg_atwi = round(sum(atwi_vals) / len(atwi_vals), 2) if atwi_vals else whole_run
    peak_atwi = max(atwi_vals) if atwi_vals else whole_run
    
    critical_count = sum(1 for t in timeseries if t.get("band") == "CRITICAL")
    high_count = sum(1 for t in timeseries if t.get("band") == "HIGH")
    
    return {
        "wholeRunAtwiPercent": whole_run,
        "averageAtwiPercent": avg_atwi,
        "peakAtwiPercent": peak_atwi,
        "peakBand": peak_band,
        "criticalWindowCount": critical_count,
        "highWindowCount": high_count,
        "available": True
    }

def compute_data_quality_kpis(dataset: dict) -> dict:
    """Computes availability and logging quality indexes."""
    track_avail = len(dataset.get("trackSamples", [])) > 0
    event_avail = len(dataset.get("events", [])) > 0
    command_avail = len(dataset.get("commands", [])) > 0
    conflict_avail = len(dataset.get("conflicts", [])) > 0
    atwi_avail = len(dataset.get("atwiResult", {})) > 0
    
    warnings_count = len(dataset.get("warnings", []))
    loadable = track_avail and len(dataset.get("metadata", {})) > 0
    
    return {
        "replayTrackAvailable": track_avail,
        "eventLogAvailable": event_avail,
        "commandLogAvailable": command_avail,
        "conflictLogAvailable": conflict_avail,
        "atwiResultAvailable": atwi_avail,
        "jsonlParseWarningCount": warnings_count,
        "replayLoadable": loadable,
        "replayTimeRangeSec": round(max([s.get("t", 0.0) for s in dataset.get("trackSamples", [])]) - min([s.get("t", 0.0) for s in dataset.get("trackSamples", [])]), 2) if track_avail else 0.0
    }

def determine_kpi_status(kpi_id: str, value, requires_atwi: bool) -> str:
    """Determines analytical status band based on KPI threshold rules."""
    if value is None:
        return "unavailable"
        
    if requires_atwi and value == "UNAVAILABLE":
        return "unavailable"

    # Workload threshold bands
    if kpi_id in ("KPI_ATWI_WHOLE_RUN", "KPI_ATWI_AVERAGE_WINDOW", "KPI_ATWI_PEAK"):
        val = float(value)
        if val >= 90.0:
            return "critical"
        elif val >= 75.0:
            return "high"
        elif val >= 60.0:
            return "watch"
        else:
            return "normal"
            
    if kpi_id == "KPI_ATWI_PEAK_BAND":
        band = str(value).upper()
        if band in ("CRITICAL", "HIGH", "WATCH", "NORMAL"):
            return band.lower()
            
    # Conflict safety count bands
    if kpi_id == "KPI_CONFLICT_EVENT_COUNT":
        val = int(value)
        if val > 20:
            return "critical"
        elif val > 5:
            return "high"
        elif val > 0:
            return "watch"
        else:
            return "normal"
            
    if kpi_id == "KPI_CRITICAL_CONFLICT_COUNT":
        val = int(value)
        if val > 0:
            return "critical"
        else:
            return "normal"
            
    if kpi_id in ("KPI_REPLAY_TRACK_AVAILABLE", "KPI_EVENT_LOG_AVAILABLE", "KPI_COMMAND_LOG_AVAILABLE", "KPI_CONFLICT_LOG_AVAILABLE", "KPI_ATWI_RESULT_AVAILABLE", "KPI_REPLAY_LOADABLE"):
        if value is False:
            return "warning"
        else:
            return "normal"
            
    return "info"

def build_kpi_vector(dataset: dict, catalogue: list) -> list:
    """Assembles the full list of KPIValues matching catalog definitions."""
    # Compute metrics
    traffic = compute_traffic_kpis(dataset)
    conflicts = compute_conflict_kpis(dataset)
    commands = compute_command_kpis(dataset)
    atwi = compute_atwi_kpis(dataset)
    quality = compute_data_quality_kpis(dataset)
    
    # Helper lookup mapping
    lookup = {
        "KPI_ATWI_WHOLE_RUN": atwi["wholeRunAtwiPercent"],
        "KPI_ATWI_AVERAGE_WINDOW": atwi["averageAtwiPercent"],
        "KPI_ATWI_PEAK": atwi["peakAtwiPercent"],
        "KPI_ATWI_PEAK_BAND": atwi["peakBand"],
        "KPI_ATWI_CRITICAL_WINDOW_COUNT": atwi["criticalWindowCount"],
        "KPI_ATWI_HIGH_WINDOW_COUNT": atwi["highWindowCount"],
        
        "KPI_UNIQUE_AIRCRAFT_COUNT": traffic["uniqueAircraftCount"],
        "KPI_TRACK_SAMPLE_COUNT": traffic["sampleCount"],
        "KPI_RUN_DURATION_SEC": traffic["runDurationSec"],
        "KPI_AVERAGE_ACTIVE_AIRCRAFT": traffic["averageActiveAircraft"],
        "KPI_PEAK_ACTIVE_AIRCRAFT": traffic["peakActiveAircraft"],
        
        "KPI_CONFLICT_EVENT_COUNT": conflicts["conflictEventCount"],
        "KPI_CRITICAL_CONFLICT_COUNT": conflicts["criticalConflictCount"],
        "KPI_WARNING_CONFLICT_COUNT": conflicts["warningConflictCount"],
        "KPI_MIN_HORIZONTAL_DISTANCE_NM": conflicts["minHorizontalDistanceNm"],
        "KPI_MIN_VERTICAL_DISTANCE_FT": conflicts["minVerticalDistanceFt"],
        
        "KPI_COMMAND_COUNT": commands["commandCount"],
        "KPI_IC_COMMAND_COUNT": commands["icCommandCount"],
        "KPI_VECTOR_DIRECT_COMMAND_COUNT": commands["vectorDirectCommandCount"],
        "KPI_ALTITUDE_COMMAND_COUNT": commands["altitudeCommandCount"],
        "KPI_SPEED_COMMAND_COUNT": commands["speedCommandCount"],
        
        "KPI_REPLAY_TRACK_AVAILABLE": quality["replayTrackAvailable"],
        "KPI_EVENT_LOG_AVAILABLE": quality["eventLogAvailable"],
        "KPI_COMMAND_LOG_AVAILABLE": quality["commandLogAvailable"],
        "KPI_CONFLICT_LOG_AVAILABLE": quality["conflictLogAvailable"],
        "KPI_ATWI_RESULT_AVAILABLE": quality["atwiResultAvailable"],
        "KPI_JSONL_PARSE_WARNING_COUNT": quality["jsonlParseWarningCount"],
        
        "KPI_REPLAY_LOADABLE": quality["replayLoadable"],
        "KPI_REPLAY_TIME_RANGE_SEC": quality["replayTimeRangeSec"]
    }
    
    kpi_vector = []
    
    for defn in catalogue:
        kpi_id = defn["id"]
        val = lookup.get(kpi_id)
        
        kpi_warnings = []
        if defn.get("requiresAtwi") and not atwi["available"]:
            kpi_warnings.append("ATWI result is missing. Run ATWI from Recording first.")
            
        status = determine_kpi_status(kpi_id, val, defn.get("requiresAtwi", False))
        
        kpi_vector.append({
            "id": kpi_id,
            "name": defn["name"],
            "category": defn["category"],
            "value": val,
            "unit": defn["unit"],
            "status": status,
            "sourceFiles": defn["sourceFiles"],
            "method": defn["method"],
            "warnings": kpi_warnings
        })
        
    return kpi_vector

def analyze_kpi_from_recording(recording_id: str, options: dict = None) -> dict:
    """
    Main function that loads the recording dataset, computes all KPI variables,
    evaluates safety parameters and governance compliance, and optionally writes output files.
    """
    if options is None:
        options = {
            "includeAtwi": True,
            "includeTraffic": True,
            "includeConflict": True,
            "includeCommands": True,
            "includeDataQuality": True,
            "saveResult": True
        }
        
    dataset = load_recording_for_kpi(recording_id)
    if "error" in dataset:
        return dataset
        
    catalogue = load_kpi_catalogue()
    if not catalogue:
        return {"error": "KPI catalogue definition file is missing or empty."}
        
    # Build vector
    kpi_vector = build_kpi_vector(dataset, catalogue)
    
    # Audit additional custom warnings
    warnings_list = list(dataset.get("warnings", []))
    
    # Check for unapproved ATWI models
    atwi_res = dataset.get("atwiResult", {})
    if atwi_res:
        if not atwi_res.get("approvedForKpi"):
            warnings_list.append({
                "code": "ATWI_NOT_APPROVED",
                "severity": "warning",
                "message": "Selected ATWI model is not approved for official KPI reporting. KPI result is preview only."
            })
    else:
        warnings_list.append({
            "code": "ATWI_MISSING",
            "severity": "warning",
            "message": "ATWI result is missing. Workload KPIs are unavailable."
        })
        
    # Check for .scn extension in IC command
    commands = dataset.get("commands", [])
    for c in commands:
        cmd_text = str(c.get("command") or "").strip()
        if cmd_text.upper().startswith("IC ") and cmd_text.lower().endswith(".scn"):
            # Extract expected format
            cleaned = cmd_text[:-4]
            warnings_list.append({
                "code": "IC_SCN_EXTENSION_INVALID",
                "severity": "critical",
                "message": f"IC command contains .scn extension ('{cmd_text}'); expected clean name ('{cleaned}')."
            })
            
    # Empty conflicts or commands alerts
    if not dataset.get("conflicts"):
        warnings_list.append({
            "code": "CONFLICT_LOG_EMPTY",
            "severity": "info",
            "message": "Conflict log is empty; conflict KPI counts are zero."
        })
    if not dataset.get("commands"):
        warnings_list.append({
            "code": "COMMAND_LOG_EMPTY",
            "severity": "info",
            "message": "Command log is empty; command and intervention KPIs are zero."
        })
        
    # Determine analysisMode
    # Mode is official_candidate only if ATWI result is approved and has official candidate status
    atwi_approved = atwi_res.get("approvedForKpi") is True
    atwi_official = atwi_res.get("analysisMode") == "official_candidate" or atwi_res.get("modelStatus") == "Approved"
    
    analysis_mode = "official_candidate" if (atwi_approved and atwi_official) else "preview"
    
    # Build summaries
    traffic_metrics = compute_traffic_kpis(dataset)
    conflict_metrics = compute_conflict_kpis(dataset)
    command_metrics = compute_command_kpis(dataset)
    atwi_metrics = compute_atwi_kpis(dataset)
    quality_metrics = compute_data_quality_kpis(dataset)
    
    data_quality_status = "ok"
    if not quality_metrics["replayTrackAvailable"]:
        data_quality_status = "error"
    elif not quality_metrics["atwiResultAvailable"] or quality_metrics["jsonlParseWarningCount"] > 0:
        data_quality_status = "warning"
        
    metadata = dataset.get("metadata", {})
    
    disclaimer = (
        "KPI results are generated from saved fast-time simulation recordings for decision-support only. "
        "They are not operational ATC outputs, not training results, not safety approvals, and not automatic "
        "Means of Compliance."
    )
    
    limitations = [
        "Decision-support / Non-operational.",
        "Not an operational ATC tool.",
        "Not a training simulator.",
        "Not a safety approval.",
        "Not an automatic Means of Compliance.",
        "Not for individual controller performance assessment."
    ]
    
    result = {
        "recordingId": recording_id,
        "scenarioId": metadata.get("scenarioId") or metadata.get("id"),
        "scenarioName": metadata.get("scenarioName"),
        "scenarioFileName": metadata.get("scenarioFileName"),
        "scenarioBaseName": metadata.get("scenarioBaseName"),
        "icCommand": metadata.get("icCommand"),
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "analysisMode": analysis_mode,
        "watermark": "Decision-support / Non-operational",
        "disclaimer": disclaimer,
        "dataSources": [src["fileName"] for src in dataset.get("sources", []) if src["exists"]],
        "summary": {
            "uniqueAircraftCount": traffic_metrics["uniqueAircraftCount"],
            "runDurationSec": traffic_metrics["runDurationSec"],
            "wholeRunAtwiPercent": atwi_metrics["wholeRunAtwiPercent"],
            "peakAtwiPercent": atwi_metrics["peakAtwiPercent"],
            "conflictEventCount": conflict_metrics["conflictEventCount"],
            "criticalConflictCount": conflict_metrics["criticalConflictCount"],
            "commandCount": command_metrics["commandCount"],
            "dataQualityStatus": data_quality_status
        },
        "kpiVector": kpi_vector,
        "warnings": [w["message"] for w in warnings_list],
        "limitations": limitations
    }
    
    # Save output files if saveResult is set to True
    if options.get("saveResult", True):
        save_kpi_result(recording_id, result, dataset, warnings_list)
        
    return result

def save_kpi_result(recording_id: str, result: dict, dataset: dict, warnings_list: list):
    """Saves kpi_result.json, kpi_vector.json, kpi_warnings.json, kpi_source_index.json to recording folder."""
    try:
        target_dir = safe_resolve_recording_path(recording_id)
    except ValueError:
        return

    # A. Save kpi_result.json
    try:
        with open(target_dir / "kpi_result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    # B. Save kpi_vector.json
    try:
        with open(target_dir / "kpi_vector.json", "w", encoding="utf-8") as f:
            json.dump(result.get("kpiVector", []), f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    # C. Save kpi_source_index.json
    source_index = {
        "recordingId": recording_id,
        "sources": dataset.get("sources", []),
        "generatedAt": datetime.datetime.now().isoformat() + "Z"
    }
    try:
        with open(target_dir / "kpi_source_index.json", "w", encoding="utf-8") as f:
            json.dump(source_index, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    # D. Save kpi_warnings.json
    kpi_warnings = {
        "recordingId": recording_id,
        "warnings": warnings_list,
        "generatedAt": datetime.datetime.now().isoformat() + "Z"
    }
    try:
        with open(target_dir / "kpi_warnings.json", "w", encoding="utf-8") as f:
            json.dump(kpi_warnings, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    # E. Update run_metadata.json
    metadata_file = target_dir / "run_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["kpiAnalysisDate"] = datetime.datetime.now().isoformat() + "Z"
            meta["hasKpiResult"] = True
            meta["wholeRunAtwiPercent"] = result["summary"]["wholeRunAtwiPercent"]
            meta["conflictEventCount"] = result["summary"]["conflictEventCount"]
            meta["commandCount"] = result["summary"]["commandCount"]
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
