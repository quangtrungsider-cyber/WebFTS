import re
import json
from flask import jsonify, request, Flask, send_file
from .auth_manager import require_permission

try:
    from server.compliance_ruleset_loader import list_supported_airports, load_ruleset
    from server.compliance_engine import evaluate_compliance_for_recording, delete_compliance_result
    from server.compliance_docx_export import render_compliance_docx
    from server.recordings_api import safe_resolve_recording_path
except (ImportError, ModuleNotFoundError):
    from .compliance_ruleset_loader import list_supported_airports, load_ruleset
    from .compliance_engine import evaluate_compliance_for_recording, delete_compliance_result
    from .compliance_docx_export import render_compliance_docx
    from .recordings_api import safe_resolve_recording_path

_RECORDING_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _validate_recording_id(recording_id: str) -> bool:
    return bool(recording_id) and bool(_RECORDING_ID_RE.match(recording_id))


def register_compliance_routes(app: Flask):
    """Registers Flask endpoints for the runway/separation compliance ruleset engine and report export."""

    @app.route("/api/compliance/airports", methods=["GET"])
    @require_permission("kpi.read")
    def get_compliance_airports_route():
        try:
            return jsonify(list_supported_airports()), 200
        except Exception as e:
            return jsonify({"error": f"Failed to list supported airports: {str(e)}"}), 500

    @app.route("/api/compliance/ruleset/<airport>", methods=["GET"])
    @require_permission("kpi.read")
    def get_compliance_ruleset_route(airport: str):
        try:
            ruleset = load_ruleset(airport)
            if not ruleset:
                return jsonify({"error": f"No ruleset configured for airport '{airport}'."}), 404
            return jsonify(ruleset), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/compliance/recording/<recording_id>/evaluate", methods=["POST"])
    @require_permission("kpi.analyze")
    def evaluate_compliance_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        try:
            payload = request.json or {}
            options = payload.get("options", {"saveResult": True})
            result = evaluate_compliance_for_recording(recording_id, options)
            if "error" in result:
                return jsonify(result), 500
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": f"Compliance evaluation failed: {str(e)}"}), 500

    @app.route("/api/compliance/recording/<recording_id>/result", methods=["GET"])
    @require_permission("kpi.read")
    def get_compliance_result_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            result_file = target_dir / "compliance_result.json"
            if not result_file.exists():
                return jsonify({"error": "Compliance result not found for this recording."}), 404
            with open(result_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/compliance/recording/<recording_id>/result", methods=["DELETE"])
    @require_permission("kpi.analyze")
    def delete_compliance_result_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        try:
            deleted_files = delete_compliance_result(recording_id)
            return jsonify({"message": "Compliance result deleted successfully.", "deletedFiles": deleted_files}), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/compliance/recording/<recording_id>/export.json", methods=["GET"])
    @require_permission("kpi.read")
    def export_compliance_json_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            result_file = target_dir / "compliance_result.json"
            if not result_file.exists():
                return jsonify({"error": "Compliance result not found; run evaluation first."}), 404
            return send_file(
                str(result_file), mimetype="application/json", as_attachment=True,
                download_name=f"compliance_report_{recording_id}.json"
            )
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/compliance/recording/<recording_id>/export.docx", methods=["GET"])
    @require_permission("kpi.read")
    def export_compliance_docx_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            result_file = target_dir / "compliance_result.json"
            if not result_file.exists():
                return jsonify({"error": "Compliance result not found; run evaluation first."}), 404
            with open(result_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            docx_path = render_compliance_docx(result)
            return send_file(
                str(docx_path), mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                as_attachment=True, download_name=f"compliance_report_{recording_id}.docx"
            )
        except Exception as e:
            return jsonify({"error": f"DOCX export failed: {str(e)}"}), 500

    @app.route("/api/compliance/recording/<recording_id>/export.pdf", methods=["GET"])
    @require_permission("kpi.read")
    def export_compliance_pdf_route(recording_id: str):
        if not _validate_recording_id(recording_id):
            return jsonify({"error": "Invalid recording ID format."}), 400
        return jsonify({
            "error": "PDF export not yet implemented; use DOCX or JSON export.",
            "status": "not_implemented"
        }), 501
