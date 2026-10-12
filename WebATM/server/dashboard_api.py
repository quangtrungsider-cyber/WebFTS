from flask import Flask, jsonify
import datetime
from pathlib import Path
import json

from .studies_api import load_studies
from .scenarios_api import load_scenarios
from .aixm_api import load_manifest as load_aixm_manifest, get_active_dataset_id
from .recordings_api import BASE_RESULTS_DIR
from .auth_manager import require_permission

def register_dashboard_routes(app: Flask):
    @app.route("/api/dashboard/summary", methods=["GET"])
    @require_permission("dashboard.read")
    def get_dashboard_summary():
        # Load studies
        studies = load_studies()
        sorted_studies = sorted(studies, key=lambda x: x.get("updatedAt", ""), reverse=True)
        
        # Load scenarios
        scenarios = load_scenarios()
        frozen_scenarios = [s for s in scenarios if s.get("status") == "frozen"]
        sorted_scenarios = sorted(scenarios, key=lambda x: x.get("updatedAt", ""), reverse=True)
        
        # Load recordings
        recording_count = 0
        latest_recordings = []
        try:
            if BASE_RESULTS_DIR.exists():
                for folder in sorted(BASE_RESULTS_DIR.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                    if folder.is_dir() and (folder / "run_metadata.json").exists():
                        recording_count += 1
                        if len(latest_recordings) < 5:
                            with open(folder / "run_metadata.json", "r", encoding="utf-8") as f:
                                latest_recordings.append(json.load(f))
        except Exception:
            pass

        # Load KPI count
        kpi_count = 0
        try:
            if BASE_RESULTS_DIR.exists():
                for folder in BASE_RESULTS_DIR.iterdir():
                    if folder.is_dir() and (folder / "kpi_result.json").exists():
                        kpi_count += 1
        except Exception:
            pass

        # Load AIXM active dataset
        active_aixm = get_active_dataset_id()
        manifest = load_aixm_manifest()
        active_aixm_status = "passed"
        if active_aixm:
            for ds in manifest:
                if ds["id"] == active_aixm:
                    active_aixm_status = ds.get("status", "passed")
                    break

        return jsonify({
            "studies": {
                "total": len(studies),
                "recent": sorted_studies[:5]
            },
            "scenarios": {
                "total": len(scenarios),
                "frozen": len(frozen_scenarios),
                "recent": sorted_scenarios[:5]
            },
            "recordings": {
                "total": recording_count,
                "latest": latest_recordings
            },
            "kpi": {
                "resultCount": kpi_count,
                "latest": []
            },
            "aixm": {
                "activeDatasetId": active_aixm,
                "sourceType": "aixm",
                "validationStatus": active_aixm_status
            },
            "system": {
                "apiStatus": "ok",
                "generatedAt": datetime.datetime.now().isoformat()
            }
        })
