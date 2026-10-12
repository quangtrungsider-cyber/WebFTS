import json
import re
import datetime
from pathlib import Path
from flask import jsonify, request, Flask
from .auth_manager import require_permission

# Import analyzer and comparison services
try:
    from server.kpi_analyzer import (
        load_kpi_catalogue,
        analyze_kpi_from_recording,
        load_recording_for_kpi
    )
    from server.kpi_comparison import compare_kpi_results
    from server.recordings_api import safe_resolve_recording_path
except (ImportError, ModuleNotFoundError):
    from .kpi_analyzer import (
        load_kpi_catalogue,
        analyze_kpi_from_recording,
        load_recording_for_kpi
    )
    from .kpi_comparison import compare_kpi_results
    from .recordings_api import safe_resolve_recording_path

def validate_recording_id(recording_id: str) -> bool:
    """Defensively validates recording ID to prevent directory traversals."""
    if not recording_id:
        return False
    # Only allow safe letters, numbers, underscores, and hyphens
    return bool(re.match(r"^[a-zA-Z0-9_\-]+$", recording_id))

def register_kpi_routes(app: Flask):
    """Registers all Flask endpoints for the KPI Reports module."""

    @app.route("/api/kpi/catalogue", methods=["GET"])
    @require_permission("kpi.read")
    def get_kpi_catalogue_route():
        """Returns the full KPI definitions catalogue."""
        try:
            catalogue = load_kpi_catalogue()
            return jsonify(catalogue), 200
        except Exception as e:
            return jsonify({"error": f"Failed to load KPI catalogue: {str(e)}"}), 500

    @app.route("/api/kpi/recording/<recording_id>/summary", methods=["GET"])
    @require_permission("kpi.read")
    def get_kpi_recording_summary_route(recording_id: str):
        """Returns recording data quality availability and metadata summary."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording directory not found."}), 404

            # Evaluate file exists checks
            metadata_exists = (target_dir / "run_metadata.json").exists()
            track_exists = (target_dir / "replay_track.jsonl").exists()
            event_exists = (target_dir / "event_log.jsonl").exists()
            command_exists = (target_dir / "command_log.jsonl").exists()
            conflict_exists = (target_dir / "conflict_log.jsonl").exists()
            atwi_exists = (target_dir / "atwi_result.json").exists()
            kpi_exists = (target_dir / "kpi_result.json").exists()

            # Read metadata safely
            metadata = {}
            if metadata_exists:
                try:
                    with open(target_dir / "run_metadata.json", "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                except Exception:
                    pass

            # Read existing KPI analysis date if any
            generated_at = None
            if kpi_exists:
                try:
                    with open(target_dir / "kpi_result.json", "r", encoding="utf-8") as f:
                        kpi_res = json.load(f)
                        generated_at = kpi_res.get("generatedAt")
                except Exception:
                    pass

            summary = {
                "recordingId": recording_id,
                "metadata": metadata,
                "hasAtwiResult": atwi_exists,
                "hasKpiResult": kpi_exists,
                "generatedAt": generated_at,
                "sourcesAvailability": {
                    "run_metadata.json": metadata_exists,
                    "replay_track.jsonl": track_exists,
                    "event_log.jsonl": event_exists,
                    "command_log.jsonl": command_exists,
                    "conflict_log.jsonl": conflict_exists,
                    "atwi_result.json": atwi_exists
                }
            }
            return jsonify(summary), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/kpi/recording/<recording_id>/analyze", methods=["POST"])
    @require_permission("kpi.analyze")
    def analyze_kpi_recording_route(recording_id: str):
        """Triggers multi-dimensional KPI calculations from recording."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            payload = request.json or {}
            options = payload.get("options", {
                "includeAtwi": True,
                "includeTraffic": True,
                "includeConflict": True,
                "includeCommands": True,
                "includeDataQuality": True,
                "saveResult": True
            })

            result = analyze_kpi_from_recording(recording_id, options)
            if "error" in result:
                return jsonify(result), 500

            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": f"KPI Analysis failed: {str(e)}"}), 500

    @app.route("/api/kpi/recording/<recording_id>/result", methods=["GET"])
    @require_permission("kpi.read")
    def get_kpi_recording_result_route(recording_id: str):
        """Reads and returns the stored full kpi_result.json."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            target_dir = safe_resolve_recording_path(recording_id)
            kpi_file = target_dir / "kpi_result.json"
            if not kpi_file.exists():
                return jsonify({"error": "KPI result not found for this recording."}), 404

            with open(kpi_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/kpi/recording/<recording_id>/vector", methods=["GET"])
    @require_permission("kpi.read")
    def get_kpi_recording_vector_route(recording_id: str):
        """Reads and returns the stored array of KPIs in kpi_vector.json."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            target_dir = safe_resolve_recording_path(recording_id)
            vector_file = target_dir / "kpi_vector.json"
            if not vector_file.exists():
                return jsonify({"error": "KPI vector not found for this recording."}), 404

            with open(vector_file, "r", encoding="utf-8") as f:
                vector = json.load(f)
            return jsonify(vector), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/kpi/recording/<recording_id>/warnings", methods=["GET"])
    @require_permission("kpi.read")
    def get_kpi_recording_warnings_route(recording_id: str):
        """Reads and returns the stored KPI warnings list in kpi_warnings.json."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            target_dir = safe_resolve_recording_path(recording_id)
            warnings_file = target_dir / "kpi_warnings.json"
            if not warnings_file.exists():
                return jsonify({"error": "KPI warnings not found for this recording."}), 404

            with open(warnings_file, "r", encoding="utf-8") as f:
                warnings_data = json.load(f)
            return jsonify(warnings_data), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/kpi/compare", methods=["POST"])
    @require_permission("kpi.compare")
    def compare_kpi_recordings_route():
        """Triggers numerical and operational comparisons between baseline and alternative recordings."""
        try:
            payload = request.json or {}
            baseline_id = payload.get("baselineRecordingId")
            alternative_id = payload.get("alternativeRecordingId")

            if not baseline_id or not alternative_id:
                return jsonify({"error": "Both baselineRecordingId and alternativeRecordingId are required."}), 400

            if not validate_recording_id(baseline_id) or not validate_recording_id(alternative_id):
                return jsonify({"error": "Invalid recording ID format."}), 400

            comparison = compare_kpi_results(baseline_id, alternative_id)
            return jsonify(comparison), 200
        except Exception as e:
            return jsonify({"error": f"Comparison failed: {str(e)}"}), 500

    @app.route("/api/kpi/recording/<recording_id>/result", methods=["DELETE"])
    @require_permission("kpi.analyze")
    def delete_kpi_recording_result_route(recording_id: str):
        """Safely deletes generated KPI files without modifying trajectory track logs."""
        if not validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400

        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording directory not found."}), 404

            deleted_files = []
            files_to_delete = ["kpi_result.json", "kpi_vector.json", "kpi_warnings.json", "kpi_source_index.json"]
            for name in files_to_delete:
                file_path = target_dir / name
                if file_path.exists():
                    file_path.unlink()
                    deleted_files.append(name)

            # Update run_metadata.json
            metadata_file = target_dir / "run_metadata.json"
            if metadata_file.exists():
                try:
                    with open(metadata_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    meta.pop("kpiAnalysisDate", None)
                    meta.pop("hasKpiResult", None)
                    meta.pop("wholeRunAtwiPercent", None)
                    meta.pop("conflictEventCount", None)
                    meta.pop("commandCount", None)
                    with open(metadata_file, "w", encoding="utf-8") as f:
                        json.dump(meta, f, indent=2, ensure_ascii=False)
                except Exception:
                    pass

            return jsonify({
                "message": "KPI results deleted successfully.",
                "deletedFiles": deleted_files
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
