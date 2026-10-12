import json
import datetime
from pathlib import Path

# Relative/absolute import fallback for safe resolution and analysis
try:
    from server.recordings_api import safe_resolve_recording_path
    from server.kpi_analyzer import analyze_kpi_from_recording
except (ImportError, ModuleNotFoundError):
    from .recordings_api import safe_resolve_recording_path
    from .kpi_analyzer import analyze_kpi_from_recording

def load_or_compute_kpi_result(recording_id: str) -> dict:
    """Loads existing kpi_result.json, or triggers a new analysis if missing."""
    try:
        target_dir = safe_resolve_recording_path(recording_id)
        kpi_file = target_dir / "kpi_result.json"
        if kpi_file.exists():
            with open(kpi_file, "r", encoding="utf-8") as f:
                return json.load(f)
        # Otherwise compute dynamically
        return analyze_kpi_from_recording(recording_id)
    except Exception as e:
        return {"error": f"Failed to load or analyze KPI for recording '{recording_id}': {str(e)}"}

def compare_kpi_results(baseline_id: str, alternative_id: str) -> dict:
    """
    Compares two recording analytical results and derives delta values, percentage
    shifts, and rigorous safety-proxy operational interpretations.
    """
    baseline = load_or_compute_kpi_result(baseline_id)
    alternative = load_or_compute_kpi_result(alternative_id)
    
    warnings = []
    
    if "error" in baseline:
        warnings.append(f"Baseline error: {baseline['error']}")
    if "error" in alternative:
        warnings.append(f"Alternative error: {alternative['error']}")
        
    if "error" in baseline or "error" in alternative:
        return {
            "baselineRecordingId": baseline_id,
            "alternativeRecordingId": alternative_id,
            "generatedAt": datetime.datetime.now().isoformat() + "Z",
            "watermark": "Decision-support / Non-operational",
            "rows": [],
            "warnings": warnings
        }

    # Extract KPI vectors
    base_vector = {k["id"]: k for k in baseline.get("kpiVector", [])}
    alt_vector = {k["id"]: k for k in alternative.get("kpiVector", [])}
    
    # Merge all unique keys
    all_keys = sorted(list(set(base_vector.keys()) | set(alt_vector.keys())))
    rows = []
    
    for kpi_id in all_keys:
        base_kpi = base_vector.get(kpi_id)
        alt_kpi = alt_vector.get(kpi_id)
        
        name = (alt_kpi or base_kpi)["name"]
        category = (alt_kpi or base_kpi)["category"]
        unit = (alt_kpi or base_kpi)["unit"]
        
        base_val = base_kpi["value"] if base_kpi else None
        alt_val = alt_kpi["value"] if alt_kpi else None
        
        delta = None
        delta_percent = None
        interpretation = "KPI unavailable for comparison."
        
        # Check if values are comparable
        if base_val is not None and alt_val is not None:
            # Case 1: Numeric comparisons
            if isinstance(base_val, (int, float)) and isinstance(alt_val, (int, float)):
                delta = round(alt_val - base_val, 2)
                if base_val != 0:
                    delta_percent = round((delta / base_val) * 100, 2)
                else:
                    delta_percent = None
                    
                # Interpretations based on metric types
                higher_is_worse = (alt_kpi or base_kpi).get("higherIsWorse", False)
                if delta < 0:
                    if category == "workload":
                        interpretation = "Alternative reduces controller workload KPI."
                    elif category == "conflict":
                        interpretation = "Alternative reduces conflict proxy count."
                    elif category == "command_intervention":
                        interpretation = "Alternative reduces tactical intervention count."
                    else:
                        interpretation = "Alternative decreases metric value (Improvement)." if higher_is_worse else "Alternative decreases metric value."
                elif delta > 0:
                    if category == "workload":
                        interpretation = "Alternative increases controller workload KPI."
                    elif category == "conflict":
                        interpretation = "Alternative increases conflict proxy count."
                    elif category == "command_intervention":
                        interpretation = "Alternative increases tactical intervention count."
                    else:
                        interpretation = "Alternative increases metric value (Worsening)." if higher_is_worse else "Alternative increases metric value."
                else:
                    interpretation = "No change observed between baseline and alternative."
                    
            # Case 2: Boolean/String comparisons
            else:
                delta = None
                delta_percent = None
                if base_val == alt_val:
                    interpretation = f"Both configurations match ('{base_val}')."
                else:
                    interpretation = f"Shift from '{base_val}' to '{alt_val}'."
        else:
            interpretation = "Metric is missing in one or both recording results."
            
        rows.append({
            "kpiId": kpi_id,
            "name": name,
            "category": category,
            "baselineValue": base_val,
            "alternativeValue": alt_val,
            "unit": unit,
            "delta": delta,
            "deltaPercent": delta_percent,
            "interpretation": interpretation
        })
        
    return {
        "baselineRecordingId": baseline_id,
        "alternativeRecordingId": alternative_id,
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "watermark": "Decision-support / Non-operational",
        "rows": rows,
        "warnings": warnings
    }
