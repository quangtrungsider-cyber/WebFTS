import os
import json
import datetime
import tempfile
import math
import re
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission

TASK_INDEX_FILE = Path("FTS Server/data/atwi_task_index.json")
MODELS_FILE = Path("FTS Server/data/atwi_models.json")
POSITIONS_FILE = Path("FTS Server/data/atwi_positions.json")

# Ensure parent directory exists
os.makedirs(TASK_INDEX_FILE.parent, exist_ok=True)


def safe_atomic_write(file_path: Path, data: list):
    """Write data to a file atomically by using a temporary file and renaming it."""
    temp_dir = file_path.parent
    with tempfile.NamedTemporaryFile("w", dir=temp_dir, delete=False, encoding="utf-8") as temp_file:
        json.dump(data, temp_file, indent=2, ensure_ascii=False)
        temp_file_name = temp_file.name
    try:
        if os.path.exists(file_path):
            os.replace(temp_file_name, file_path)
        else:
            os.rename(temp_file_name, file_path)
    except Exception as e:
        if os.path.exists(temp_file_name):
            os.remove(temp_file_name)
        raise e


def read_task_index() -> list:
    """Read ATWI task definitions from file or return seed."""
    if not TASK_INDEX_FILE.exists():
        return []
    try:
        with open(TASK_INDEX_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def read_models() -> list:
    """Read ATWI models from file or return empty."""
    if not MODELS_FILE.exists():
        return []
    try:
        with open(MODELS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def read_positions() -> list:
    """Read ATWI controller-position definitions from file or return the
    real seed positions (see _seed_positions) if the file doesn't exist yet."""
    if not POSITIONS_FILE.exists():
        seeded = _seed_positions()
        safe_atomic_write(POSITIONS_FILE, seeded)
        return seeded
    try:
        with open(POSITIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _seed_positions() -> list:
    """Real controller-position structure for VVPQ (from CONOPS APP Phu Quoc
    muc 5.5 org chart) plus a generic EC/PLC/GCU/TWR template applied to the
    4 airports with compliance rulesets (VVDN/VVCR/VVTS/VVNB). The VVPQ set
    is a real, cited org chart; the VVDN/VVCR/VVTS/VVNB sets are an honestly
    labeled generic template (each position's `description` says so) built
    from two real, cited sources: the ICAO/EUROCONTROL 2-controller EC
    (Executive, tactical) / PLC (Planning, coordination) sector-team model
    (SkyBrary, "Executive and Planner Controller") and Vietnam's 4-facility
    ATC taxonomy ACC/APP/TWR/GCU (accgroup.vn, skylead.vn) -- NOT a verified
    real org chart for those 4 airports, since no such document has been
    sourced yet. taskCodes reference WebATM/server/atwi_task_index.json's
    `code` field -- an empty list (e.g. TWR PLC) means the current 14-task
    seed model has no task that maps to this position yet, not that the
    position has zero real work; evaluate-scenario/analyze-recording report
    that honestly instead of inventing a number."""
    now = datetime.datetime.now().isoformat() + "Z"

    def pos(pid, icao, name, name_en, desc, codes, atco=1):
        return {
            "id": pid, "icao": icao, "name": name, "nameEn": name_en,
            "description": desc, "taskCodes": codes, "atcoCount": atco,
            "source": "system_seed", "createdAt": now, "updatedAt": now,
        }

    positions = [
        pos(
            "pos-vvpq-gcu", "VVPQ", "Trực điều hành GCU", "GCU (Ground Control)",
            "Phụ trách từ vị trí đỗ tàu bay đến các điểm chờ trước đường CHC 10R/28L "
            "(CONOPS APP Phú Quốc, mục 3.1.2 -- di chuyển mặt đất). Kịch bản hiện tại "
            "chưa mô phỏng giai đoạn lăn bánh nên workload đo được ở đây sẽ luôn gần 0 "
            "cho tới khi engine sinh kịch bản có dữ liệu taxi/gate thật.",
            ["AIRPORT_SURFACE_FEEDBACK"],
        ),
        pos(
            "pos-vvpq-twr", "VVPQ", "Trực điều hành TWR", "TWR (Local/Runway Control)",
            "Điều hành đường CHC 10R/28L (song song phụ thuộc) -- sắp xếp thứ tự "
            "cất/hạ cánh. Chưa đếm huấn lệnh cất/hạ cánh, băng qua CHC theo từng "
            "chuyến (mô hình 14-task hiện tại chưa có task này), nên số liệu ở đây "
            "có thể thấp hơn workload TWR thực tế.",
            ["RUNWAY_SEQUENCE"],
        ),
        pos(
            "pos-vvpq-twr-gcu-coord", "VVPQ", "Trực hiệp đồng TWR/GCU", "TWR/GCU Coordination",
            "Hiệp đồng giữa TWR và GCU (CONOPS APP Phú Quốc, mục 5.5.2). Chưa có "
            "task nào trong mô hình 14-task hiện tại ánh xạ đúng vai trò này -- "
            "workload báo cáo sẽ là 0/không xác định cho tới khi bổ sung task.",
            [],
        ),
        pos(
            "pos-vvpq-app-exec", "VVPQ", "Trực điều hành APP", "APP Executive (Tactical)",
            "Điều hành chiến thuật tiếp cận Phú Quốc (CONOPS APP Phú Quốc, mục 5.5.1) "
            "-- giám sát, huấn lệnh tốc độ/độ cao/hướng bay, phát hiện xung đột.",
            [
                "SURV_SCAN", "TRAFFIC_COUNT_MONITOR", "CONFLICT_CHECK", "STCA_RESPONSE",
                "VECTOR_OR_DIRECT", "ALTITUDE_CHANGE", "SPEED_CONTROL",
                "WEATHER_DEVIATION", "MILITARY_COORD", "SYSTEM_DEGRADED",
            ],
        ),
        pos(
            "pos-vvpq-app-coord", "VVPQ", "Trực hiệp đồng APP", "APP Coordination/Handoff",
            "Phối hợp/chuyển giao của APP Phú Quốc (CONOPS APP Phú Quốc, mục 5.5.1) "
            "-- chuyển giao với ACC HCM, ACC Phnom Penh, TWR và các phân khu lân cận.",
            ["HANDOFF_COORD", "CROSS_SECTOR_COORD"],
        ),
    ]

    template_note = (
        "Đây là mẫu vị trí kiểm soát viên mang tính đại diện (generic template), xây dựng "
        "theo mô hình 2 kiểm soát viên EC (Executive Controller -- điều hành chiến thuật) / "
        "PLC (Planning Controller -- lập kế hoạch, hiệp đồng) theo tài liệu quốc tế "
        "ICAO/EUROCONTROL (nguồn: SkyBrary, \"Executive and Planner Controller\") kết hợp "
        "phân loại 4 loại cơ sở kiểm soát không lưu tại Việt Nam: ACC/APP/TWR/GCU (nguồn: "
        "accgroup.vn, skylead.vn). CHƯA phải sơ đồ tổ chức đã được xác thực thực tế cho cơ "
        "sở này -- cần chuyên gia vận hành xác nhận trước khi dùng cho mục đích chính thức."
    )
    app_ec_tasks = [
        "SURV_SCAN", "TRAFFIC_COUNT_MONITOR", "CONFLICT_CHECK", "STCA_RESPONSE",
        "VECTOR_OR_DIRECT", "ALTITUDE_CHANGE", "SPEED_CONTROL",
        "WEATHER_DEVIATION", "MILITARY_COORD", "SYSTEM_DEGRADED",
    ]
    app_plc_tasks = ["HANDOFF_COORD", "CROSS_SECTOR_COORD"]
    twr_ec_tasks = ["RUNWAY_SEQUENCE"]
    gcu_tasks = ["AIRPORT_SURFACE_FEEDBACK"]
    runway_label = {
        "VVDN": "35L/35R (và 17L/17R) song song phụ thuộc",
        "VVCR": "02L/02R và 20L/20R song song phụ thuộc",
        "VVTS": "07L/25R và 07R/25L song song phụ thuộc",
        "VVNB": "11L/11R và 29L/29R song song phụ thuộc (8 chế độ khai thác)",
    }
    airport_name = {
        "VVDN": "Đà Nẵng", "VVCR": "Cam Ranh", "VVTS": "Tân Sơn Nhất", "VVNB": "Nội Bài",
    }

    for icao in ("VVDN", "VVCR", "VVTS", "VVNB"):
        city = airport_name[icao]
        rwy = runway_label[icao]
        icao_l = icao.lower()
        positions.append(pos(
            f"pos-{icao_l}-gcu", icao, "Trực điều hành GCU", "GCU (Ground Control)",
            f"Phụ trách di chuyển mặt đất tại {city} -- từ vị trí đỗ tàu bay đến điểm chờ "
            f"trước đường CHC {rwy}. Kịch bản hiện tại chưa mô phỏng giai đoạn lăn bánh nên "
            f"workload đo được ở đây sẽ luôn gần 0 cho tới khi engine sinh kịch bản có dữ "
            f"liệu taxi/gate thật. {template_note}",
            list(gcu_tasks),
        ))
        positions.append(pos(
            f"pos-{icao_l}-twr-ec", icao, "Trực điều hành TWR (EC)", "TWR Executive Controller (EC)",
            f"Điều hành chiến thuật đường CHC {rwy} tại {city} -- sắp xếp thứ tự cất/hạ "
            f"cánh, huấn lệnh cất/hạ cánh trên CHC. Mô hình 14-task hiện tại chưa có task "
            f"riêng cho huấn lệnh cất/hạ cánh theo từng chuyến nên số liệu ở đây có thể "
            f"thấp hơn workload TWR thực tế. {template_note}",
            list(twr_ec_tasks),
        ))
        positions.append(pos(
            f"pos-{icao_l}-twr-plc", icao, "Trực hiệp đồng TWR (PLC)", "TWR Planning Controller (PLC)",
            f"Lập kế hoạch/hiệp đồng của TWR {city} -- hiệp đồng với GCU và chuẩn bị chuyển "
            f"giao cho APP. Chưa có task nào trong mô hình 14-task hiện tại ánh xạ đúng vai "
            f"trò này -- workload báo cáo sẽ là 0/không xác định cho tới khi bổ sung task. "
            f"{template_note}",
            [],
        ))
        positions.append(pos(
            f"pos-{icao_l}-app-ec", icao, "Trực điều hành APP (EC)", "APP Executive Controller (EC)",
            f"Điều hành chiến thuật tiếp cận {city} -- giám sát, huấn lệnh tốc độ/độ "
            f"cao/hướng bay, phát hiện và xử lý xung đột trong TMA. {template_note}",
            list(app_ec_tasks),
        ))
        positions.append(pos(
            f"pos-{icao_l}-app-plc", icao, "Trực hiệp đồng APP (PLC)", "APP Planning Controller (PLC)",
            f"Lập kế hoạch/hiệp đồng của APP {city} -- chuyển giao với ACC, TWR và các phân "
            f"khu lân cận. {template_note}",
            list(app_plc_tasks),
        ))

    return positions


def clamp_number(value, min_val, max_val, fallback):
    """Clamp a numeric value between min_val and max_val."""
    try:
        val = float(value)
        return max(min_val, min(max_val, val))
    except (ValueError, TypeError):
        return fallback


def get_atwi_band(atwi_percent, thresholds) -> str:
    """Classify ATWI percent into workload bands."""
    normal_max = thresholds.get("normalMax", 60)
    watch_max = thresholds.get("watchMax", 75)
    high_max = thresholds.get("highMax", 90)

    if atwi_percent < normal_max:
        return "normal"
    elif atwi_percent < watch_max:
        return "watch"
    elif atwi_percent < high_max:
        return "high"
    else:
        return "critical"


def register_atwi_routes(app):
    """Register all ATWI routes in the Flask application."""

    @app.route("/api/atwi/task-index", methods=["GET"])
    @require_permission("atwi.read")
    def get_task_index():
        try:
            tasks = read_task_index()
            return jsonify(tasks), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/task-index", methods=["PUT"])
    @require_permission("atwi.model_update")
    def update_task_index():
        try:
            body = request.json
            if not isinstance(body, list):
                return jsonify({"error": "Task definitions must be a list"}), 400

            # Validate each task definition
            valid_categories = {
                "surveillance", "conflict_monitoring", "coordination", "communication",
                "planning", "procedure", "system", "airport_surface", "weather", "military_sua", "other"
            }
            valid_evidence_levels = {"assumed", "local_expert", "measured", "validated"}

            validated_tasks = []
            for item in body:
                code = item.get("code")
                name = item.get("name")
                category = item.get("category")
                evidence_level = item.get("evidenceLevel")
                base_effort = item.get("baseEffortSec")

                if not code or not isinstance(code, str):
                    return jsonify({"error": "Task 'code' is required and must be a string."}), 400
                if not name or not isinstance(name, str):
                    return jsonify({"error": "Task 'name' is required and must be a string."}), 400
                if category not in valid_categories:
                    return jsonify({"error": f"Invalid category '{category}' in task {code}."}), 400
                if evidence_level not in valid_evidence_levels:
                    return jsonify({"error": f"Invalid evidence level '{evidence_level}' in task {code}."}), 400
                
                try:
                    base_effort_sec = float(base_effort)
                    if base_effort_sec < 0:
                        raise ValueError()
                except (ValueError, TypeError):
                    return jsonify({"error": f"Invalid 'baseEffortSec' for task {code}. Must be a non-negative number."}), 400

                validated_tasks.append({
                    "id": item.get("id") or f"task-{code.lower().replace('_', '-')}",
                    "code": code.upper().strip(),
                    "name": name.strip(),
                    "category": category,
                    "baseEffortSec": base_effort_sec,
                    "description": item.get("description", "") or "",
                    "evidenceLevel": evidence_level,
                    "source": item.get("source", "manual") or "manual",
                    "notes": item.get("notes", "") or ""
                })

            safe_atomic_write(TASK_INDEX_FILE, validated_tasks)
            return jsonify(validated_tasks), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models", methods=["GET"])
    @require_permission("atwi.read")
    def get_models():
        try:
            models = read_models()
            # To keep it lightweight, we don't necessarily need to return taskDefinitions in list view
            # But we will include basic details
            list_view = []
            for m in models:
                list_view.append({
                    "id": m["id"],
                    "name": m["name"],
                    "description": m["description"],
                    "atcoOnPosition": m.get("atcoOnPosition", 1),
                    "availableSecondsPerAtcoPerHour": m.get("availableSecondsPerAtcoPerHour", 3600),
                    "coefficients": m.get("coefficients"),
                    "thresholds": m.get("thresholds"),
                    "metadata": m.get("metadata")
                })
            return jsonify(list_view), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>", methods=["GET"])
    @require_permission("atwi.read")
    def get_model_detail(model_id):
        try:
            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            # If taskDefinitions is empty, load from task-index seed
            if not model.get("taskDefinitions"):
                model["taskDefinitions"] = read_task_index()

            return jsonify(model), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models", methods=["POST"])
    @require_permission("atwi.model_create")
    def create_model():
        try:
            body = request.json or {}
            name = body.get("name")
            description = body.get("description", "")

            if not name:
                return jsonify({"error": "Model name is required"}), 400

            models = read_models()
            
            # Generate unique ID
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            model_id = f"atwi-model-{timestamp}"

            default_coefficients = {
                "complexityCoeff": 0.15,
                "weatherCoeff": 0.10,
                "militaryCoeff": 0.10,
                "coordinationCoeff": 0.12,
                "airportCoeff": 0.10,
                "degradedCoeff": 0.20
            }

            default_thresholds = {
                "normalMax": 60,
                "watchMax": 75,
                "highMax": 90
            }

            now_iso = datetime.datetime.now().isoformat() + "Z"

            new_model = {
                "id": model_id,
                "name": name.strip(),
                "description": description.strip(),
                "atcoOnPosition": int(body.get("atcoOnPosition", 1)),
                "availableSecondsPerAtcoPerHour": int(body.get("availableSecondsPerAtcoPerHour", 3600)),
                "coefficients": body.get("coefficients") or default_coefficients,
                "thresholds": body.get("thresholds") or default_thresholds,
                "taskDefinitions": body.get("taskDefinitions") or [],
                "metadata": {
                    "version": body.get("version") or "1.0-draft",
                    "status": "draft",
                    "source": "manual",
                    "reviewStatus": "not_reviewed",
                    "approvedForKpi": False,
                    "createdBy": body.get("createdBy") or "VATM FTS Team",
                    "reviewedBy": None,
                    "approvedBy": None,
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                    "reviewedAt": None,
                    "approvedAt": None,
                    "notes": body.get("notes", "") or ""
                }
            }

            models.append(new_model)
            safe_atomic_write(MODELS_FILE, models)

            return jsonify(new_model), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>", methods=["PUT"])
    @require_permission("atwi.model_update")
    def update_model(model_id):
        try:
            body = request.json or {}
            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            # Guard approved models
            if model["metadata"].get("status") == "approved":
                return jsonify({"error": "Approved models are locked. Please Clone as Draft to modify parameters."}), 409

            # Update core parameters
            if "name" in body:
                model["name"] = body["name"].strip()
            if "description" in body:
                model["description"] = body["description"].strip()
            if "atcoOnPosition" in body:
                model["atcoOnPosition"] = int(body["atcoOnPosition"])
            if "availableSecondsPerAtcoPerHour" in body:
                model["availableSecondsPerAtcoPerHour"] = int(body["availableSecondsPerAtcoPerHour"])
            
            if "coefficients" in body:
                model["coefficients"] = body["coefficients"]
            if "thresholds" in body:
                model["thresholds"] = body["thresholds"]
            if "taskDefinitions" in body:
                model["taskDefinitions"] = body["taskDefinitions"]

            # Update metadata
            now_iso = datetime.datetime.now().isoformat() + "Z"
            model["metadata"]["updatedAt"] = now_iso
            if "version" in body:
                model["metadata"]["version"] = body["version"]
            if "notes" in body:
                model["metadata"]["notes"] = body["notes"]

            safe_atomic_write(MODELS_FILE, models)
            return jsonify(model), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>/clone", methods=["POST"])
    @require_permission("atwi.model_create")
    def clone_model(model_id):
        try:
            body = request.json or {}
            new_name = body.get("name")

            models = read_models()
            source_model = next((m for m in models if m["id"] == model_id), None)
            if not source_model:
                return jsonify({"error": "Source model not found"}), 404

            if not new_name:
                new_name = f"Clone of {source_model['name']}"

            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            cloned_id = f"atwi-model-clone-{timestamp}"
            now_iso = datetime.datetime.now().isoformat() + "Z"

            # Create deep copy
            cloned_model = {
                "id": cloned_id,
                "name": new_name.strip(),
                "description": source_model.get("description", ""),
                "atcoOnPosition": source_model.get("atcoOnPosition", 1),
                "availableSecondsPerAtcoPerHour": source_model.get("availableSecondsPerAtcoPerHour", 3600),
                "coefficients": source_model.get("coefficients").copy(),
                "thresholds": source_model.get("thresholds").copy(),
                "taskDefinitions": source_model.get("taskDefinitions", []).copy(),
                "metadata": {
                    "version": f"{source_model['metadata'].get('version', '1.0')}-cloned",
                    "status": "draft",
                    "source": "expert_review",
                    "reviewStatus": "not_reviewed",
                    "approvedForKpi": False,
                    "createdBy": body.get("createdBy") or "VATM FTS Team",
                    "reviewedBy": None,
                    "approvedBy": None,
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                    "reviewedAt": None,
                    "approvedAt": None,
                    "notes": f"Cloned from {source_model['name']} (ID: {model_id})"
                }
            }

            models.append(cloned_model)
            safe_atomic_write(MODELS_FILE, models)

            return jsonify(cloned_model), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>/status", methods=["POST"])
    @require_permission("atwi.model_update")
    def update_model_status(model_id):
        try:
            body = request.json or {}
            target_status = body.get("status")
            user = body.get("user") or "VATM FTS Team"
            notes = body.get("notes") or ""

            valid_statuses = {"draft", "imported", "under_review", "reviewed", "approved", "retired"}
            if target_status not in valid_statuses:
                return jsonify({"error": f"Invalid status '{target_status}'"}), 400

            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            current_status = model["metadata"].get("status")

            # Validate transitions
            allowed = False
            if target_status == "under_review" and current_status in ("draft", "imported"):
                allowed = True
            elif target_status == "reviewed" and current_status == "under_review":
                allowed = True
                model["metadata"]["reviewedBy"] = user
                model["metadata"]["reviewedAt"] = datetime.datetime.now().isoformat() + "Z"
                model["metadata"]["reviewStatus"] = "reviewed"
            elif target_status == "approved" and current_status == "reviewed":
                allowed = True
                model["metadata"]["approvedBy"] = user
                model["metadata"]["approvedAt"] = datetime.datetime.now().isoformat() + "Z"
                model["metadata"]["reviewStatus"] = "approved"
                model["metadata"]["approvedForKpi"] = True
            elif target_status == "retired":
                allowed = True
                model["metadata"]["approvedForKpi"] = False
            elif target_status == "draft" and current_status == "reviewed": # Rework transition
                allowed = True
                model["metadata"]["reviewStatus"] = "not_reviewed"

            if not allowed:
                return jsonify({"error": f"Transition from '{current_status}' to '{target_status}' is not allowed."}), 400

            model["metadata"]["status"] = target_status
            model["metadata"]["updatedAt"] = datetime.datetime.now().isoformat() + "Z"
            if notes:
                model["metadata"]["notes"] = f"{model['metadata'].get('notes', '')}\n[{target_status.upper()}] {notes}".strip()

            safe_atomic_write(MODELS_FILE, models)
            return jsonify(model), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>/approve", methods=["POST"])
    @require_permission("atwi.model_approve")
    def approve_model(model_id):
        try:
            body = request.json or {}
            user = body.get("user") or "VATM FTS Team"
            notes = body.get("notes") or ""

            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            now_iso = datetime.datetime.now().isoformat() + "Z"
            model["metadata"]["status"] = "approved"
            model["metadata"]["reviewStatus"] = "approved"
            model["metadata"]["approvedForKpi"] = True
            model["metadata"]["approvedBy"] = user
            model["metadata"]["approvedAt"] = now_iso
            model["metadata"]["updatedAt"] = now_iso
            if notes:
                model["metadata"]["notes"] = f"{model['metadata'].get('notes', '')}\n[APPROVED] {notes}".strip()

            safe_atomic_write(MODELS_FILE, models)
            return jsonify(model), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>/retire", methods=["POST"])
    @require_permission("atwi.model_retire")
    def retire_model(model_id):
        try:
            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            now_iso = datetime.datetime.now().isoformat() + "Z"
            model["metadata"]["status"] = "retired"
            model["metadata"]["approvedForKpi"] = False
            model["metadata"]["updatedAt"] = now_iso

            safe_atomic_write(MODELS_FILE, models)
            return jsonify(model), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/models/<model_id>/export-json", methods=["GET"])
    @require_permission("atwi.read")
    def export_model_json(model_id):
        try:
            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Model not found"}), 404

            # If taskDefinitions is empty, load from task-index seed
            if not model.get("taskDefinitions"):
                model["taskDefinitions"] = read_task_index()

            response = jsonify(model)
            response.headers.set("Content-Disposition", f"attachment; filename={model_id}_export.json")
            return response, 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/import-json", methods=["POST"])
    @require_permission("atwi.model_create")
    def import_model_json():
        try:
            body = request.json or {}
            imported_model = body.get("model")
            source_file_name = body.get("sourceFileName") or "imported_model.json"
            created_by = body.get("createdBy") or "VATM FTS Team"

            if not imported_model or not isinstance(imported_model, dict):
                return jsonify({"error": "Invalid JSON format. Expected a 'model' object."}), 400

            name = imported_model.get("name")
            if not name:
                return jsonify({"error": "Imported model must have a 'name'."}), 400

            models = read_models()
            
            # Resolve ID clash
            orig_id = imported_model.get("id") or "imported-model"
            new_id = orig_id
            counter = 1
            while any(m["id"] == new_id for m in models):
                new_id = f"{orig_id}-{counter}"
                counter += 1

            now_iso = datetime.datetime.now().isoformat() + "Z"

            new_model = {
                "id": new_id,
                "name": name.strip(),
                "description": imported_model.get("description", "Imported via JSON interface."),
                "atcoOnPosition": int(imported_model.get("atcoOnPosition", 1)),
                "availableSecondsPerAtcoPerHour": int(imported_model.get("availableSecondsPerAtcoPerHour", 3600)),
                "coefficients": imported_model.get("coefficients") or {
                    "complexityCoeff": 0.15,
                    "weatherCoeff": 0.10,
                    "militaryCoeff": 0.10,
                    "coordinationCoeff": 0.12,
                    "airportCoeff": 0.10,
                    "degradedCoeff": 0.20
                },
                "thresholds": imported_model.get("thresholds") or {
                    "normalMax": 60,
                    "watchMax": 75,
                    "highMax": 90
                },
                "taskDefinitions": imported_model.get("taskDefinitions") or [],
                "metadata": {
                    "version": imported_model.get("metadata", {}).get("version") or "1.0-imported",
                    "status": "imported",
                    "source": "json_import",
                    "sourceFileName": source_file_name,
                    "reviewStatus": "not_reviewed",
                    "approvedForKpi": False,
                    "createdBy": created_by,
                    "reviewedBy": None,
                    "approvedBy": None,
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                    "reviewedAt": None,
                    "approvedAt": None,
                    "notes": imported_model.get("metadata", {}).get("notes", "") or "Imported JSON metadata."
                }
            }

            models.append(new_model)
            safe_atomic_write(MODELS_FILE, models)

            return jsonify(new_model), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/positions", methods=["GET"])
    @require_permission("atwi.read")
    def get_atwi_positions():
        try:
            positions = read_positions()
            icao = (request.args.get("icao") or "").strip().upper()
            if icao:
                positions = [p for p in positions if p.get("icao", "").upper() == icao]
            return jsonify(positions), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/positions", methods=["POST"])
    @require_permission("atwi.model_update")
    def create_atwi_position():
        try:
            body = request.json or {}
            icao = (body.get("icao") or "").strip().upper()
            name = (body.get("name") or "").strip()
            if not icao or not name:
                return jsonify({"error": "'icao' and 'name' are required."}), 400

            task_codes = body.get("taskCodes")
            if task_codes is None:
                task_codes = []
            if not isinstance(task_codes, list) or not all(isinstance(c, str) for c in task_codes):
                return jsonify({"error": "'taskCodes' must be a list of strings."}), 400

            positions = read_positions()
            new_id = body.get("id") or f"pos-{icao.lower()}-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}"
            if any(p["id"] == new_id for p in positions):
                return jsonify({"error": f"Position id '{new_id}' already exists."}), 400

            now_iso = datetime.datetime.now().isoformat() + "Z"
            new_position = {
                "id": new_id,
                "icao": icao,
                "name": name,
                "nameEn": body.get("nameEn") or name,
                "description": body.get("description") or "",
                "taskCodes": task_codes,
                "atcoCount": max(1, int(body.get("atcoCount", 1))),
                "source": "user_defined",
                "createdAt": now_iso,
                "updatedAt": now_iso,
            }
            positions.append(new_position)
            safe_atomic_write(POSITIONS_FILE, positions)
            return jsonify(new_position), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/positions/<position_id>", methods=["PUT"])
    @require_permission("atwi.model_update")
    def update_atwi_position(position_id):
        try:
            body = request.json or {}
            positions = read_positions()
            index = next((i for i, p in enumerate(positions) if p["id"] == position_id), -1)
            if index == -1:
                return jsonify({"error": "Position not found"}), 404

            position = positions[index]
            for field in ["name", "nameEn", "description", "icao"]:
                if field in body and body[field]:
                    position[field] = body[field].strip() if field == "icao" else body[field]
                    if field == "icao":
                        position[field] = position[field].upper()
            if "taskCodes" in body:
                task_codes = body["taskCodes"]
                if not isinstance(task_codes, list) or not all(isinstance(c, str) for c in task_codes):
                    return jsonify({"error": "'taskCodes' must be a list of strings."}), 400
                position["taskCodes"] = task_codes
            if "atcoCount" in body:
                position["atcoCount"] = max(1, int(body["atcoCount"]))
            position["updatedAt"] = datetime.datetime.now().isoformat() + "Z"

            positions[index] = position
            safe_atomic_write(POSITIONS_FILE, positions)
            return jsonify(position), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/positions/<position_id>", methods=["DELETE"])
    @require_permission("atwi.model_update")
    def delete_atwi_position(position_id):
        try:
            positions = read_positions()
            filtered = [p for p in positions if p["id"] != position_id]
            if len(filtered) == len(positions):
                return jsonify({"error": "Position not found"}), 404
            safe_atomic_write(POSITIONS_FILE, filtered)
            return jsonify({"success": True}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/calculate", methods=["POST"])
    @require_permission("atwi.calculate")
    def calculate_manual_atwi():
        try:
            body = request.json or {}
            model_id = body.get("modelId")
            task_instances = body.get("taskInstances") or []

            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": "Workload Model not found."}), 404

            # Resolve definitions
            task_definitions = model.get("taskDefinitions")
            if not task_definitions:
                task_definitions = read_task_index()

            coefficients = model.get("coefficients", {})
            warnings = []

            if not model["metadata"].get("approvedForKpi"):
                warnings.append("This ATWI model is not approved for official KPI reporting.")
            if model["metadata"].get("status") in ("draft", "imported"):
                warnings.append("Draft/imported ATWI model is for preview and calibration only.")

            task_results = []
            total_localized_load_sec = 0.0

            for instance in task_instances:
                def_id = instance.get("taskDefinitionId")
                count = int(instance.get("count", 0))
                if count < 0:
                    count = 0

                # Find task definition
                task_def = next((t for t in task_definitions if t["id"] == def_id), None)
                if not task_def:
                    warnings.append(f"Task definition with ID '{def_id}' not found in model.")
                    continue

                # Clamp context factors
                ctx = instance.get("contextFactors") or {}
                complexity = clamp_number(ctx.get("complexity", 0), 0, 3, 0)
                weather = clamp_number(ctx.get("weather", 0), 0, 3, 0)
                military = clamp_number(ctx.get("military", 0), 0, 3, 0)
                coordination = clamp_number(ctx.get("coordination", 0), 0, 3, 0)
                airport = clamp_number(ctx.get("airport", 0), 0, 3, 0)
                degraded = clamp_number(ctx.get("degraded", 0), 0, 3, 0)
                evidence_factor = clamp_number(ctx.get("evidenceFactor", 1.0), 0.5, 2.0, 1.0)

                base_effort = float(task_def.get("baseEffortSec", 0))
                if base_effort < 0:
                    base_effort = 0

                # Formula for localized task effort
                localized_single = base_effort * (
                    1.0
                    + float(coefficients.get("complexityCoeff", 0.15)) * complexity
                    + float(coefficients.get("weatherCoeff", 0.10)) * weather
                    + float(coefficients.get("militaryCoeff", 0.10)) * military
                    + float(coefficients.get("coordinationCoeff", 0.12)) * coordination
                    + float(coefficients.get("airportCoeff", 0.10)) * airport
                    + float(coefficients.get("degradedCoeff", 0.20)) * degraded
                ) * evidence_factor

                total_sec = localized_single * count
                total_localized_load_sec += total_sec

                task_results.append({
                    "taskDefinitionId": def_id,
                    "taskCode": task_def["code"],
                    "taskName": task_def["name"],
                    "category": task_def["category"],
                    "count": count,
                    "baseEffortSec": base_effort,
                    "localizedSingleTaskSec": round(localized_single, 2),
                    "totalSeconds": round(total_sec, 2),
                    "workloadSharePercent": 0.0 # will calculate below
                })

            # Calculate shares
            for tr in task_results:
                if total_localized_load_sec > 0:
                    tr["workloadSharePercent"] = round((tr["totalSeconds"] / total_localized_load_sec) * 100, 2)

            # Parse start and end times to scale available capacity by the window duration
            start_str = body.get("timeWindowStart", "00:00:00")
            end_str = body.get("timeWindowEnd", "01:00:00")
            
            def parse_time_str(t_str):
                if not t_str:
                    return 0.0
                parts = t_str.split(":")
                try:
                    if len(parts) == 3:
                        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                    elif len(parts) == 2:
                        return float(parts[0]) * 60 + float(parts[1])
                    else:
                        return float(parts[0])
                except ValueError:
                    return 0.0

            duration_sec = parse_time_str(end_str) - parse_time_str(start_str)
            if duration_sec <= 0.0:
                duration_sec = 3600.0 # fallback to 1 hour

            atco_on_pos = max(1, int(model.get("atcoOnPosition", 1)))
            avail_sec_per_hour = max(1, int(model.get("availableSecondsPerAtcoPerHour", 3600)))
            # Scale capacity by the ratio of the time window duration to 1 hour (3600 seconds)
            available_capacity_sec = (duration_sec / 3600.0) * atco_on_pos * avail_sec_per_hour

            atwi_percent = (total_localized_load_sec / available_capacity_sec) * 100
            band = get_atwi_band(atwi_percent, model.get("thresholds", {}))

            disclaimer = (
                "ATWI is a simulation workload indicator for decision-support only. It is not an operational "
                "ATC tool, not a training simulator, not a safety approval, and not for individual controller "
                "performance assessment."
            )

            controller_position_id = body.get("controllerPositionId", "COMBINED_TMA")
            controller_position_name = body.get("controllerPositionName", "Combined TSN & LT TMA")
            calculation_mode = body.get("calculationMode", "By Controller Position")

            if controller_position_id == "COMBINED_TMA":
                warnings.append("This result represents combined scenario workload, not a single operational controller position.")

            result = {
                "id": f"atwi-calc-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')}",
                "input": {
                    "modelId": model_id,
                    "studyId": body.get("studyId", ""),
                    "scenarioId": body.get("scenarioId", ""),
                    "recordingId": body.get("recordingId", ""),
                    "timeWindowStart": body.get("timeWindowStart", "00:00:00"),
                    "timeWindowEnd": body.get("timeWindowEnd", "01:00:00"),
                    "taskInstances": task_instances,
                    "controllerPositionId": controller_position_id,
                    "controllerPositionName": controller_position_name,
                    "calculationMode": calculation_mode
                },
                "modelId": model_id,
                "modelName": model["name"],
                "modelVersion": model["metadata"]["version"],
                "modelStatus": model["metadata"]["status"],
                "approvedForKpi": model["metadata"]["approvedForKpi"],
                "totalLocalizedLoadSec": round(total_localized_load_sec, 2),
                "availableCapacitySec": round(available_capacity_sec, 2),
                "atwiPercent": round(atwi_percent, 2),
                "band": band,
                "taskResults": task_results,
                "generatedAt": datetime.datetime.now().isoformat() + "Z",
                "disclaimer": disclaimer,
                "warnings": warnings,
                "controllerPositionId": controller_position_id,
                "controllerPositionName": controller_position_name,
                "calculationMode": calculation_mode,
                "durationSec": round(duration_sec, 2),
                "capacityScalingMethod": "window_duration" if duration_sec != 3600.0 else "none"
            }

            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/analyze-recording", methods=["POST"])
    @require_permission("atwi.calculate")
    def analyze_recording():
        try:
            try:
                from server.atwi_analyzer import analyze_recording_atwi
            except (ImportError, ModuleNotFoundError):
                from .atwi_analyzer import analyze_recording_atwi

            body = request.json or {}
            recording_id = body.get("recordingId")
            model_id = body.get("modelId")
            window_duration_sec = float(body.get("windowDurationSec", 300.0))

            if not recording_id:
                return jsonify({"error": "recordingId is required"}), 400
            if not model_id:
                return jsonify({"error": "modelId is required"}), 400

            result = analyze_recording_atwi(recording_id, model_id, window_duration_sec)
            if "error" in result:
                return jsonify(result), 400
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/recordings/<recording_id>/result", methods=["GET"])
    @require_permission("atwi.read")
    def get_recording_atwi_result(recording_id):
        try:
            try:
                from server.recordings_api import safe_resolve_recording_path
            except (ImportError, ModuleNotFoundError):
                from .recordings_api import safe_resolve_recording_path

            try:
                target_dir = safe_resolve_recording_path(recording_id)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

            result_file = target_dir / "atwi_result.json"
            if not result_file.exists():
                return jsonify({"status": "not_analyzed", "message": "No ATWI analysis result found for this recording."}), 404

            with open(result_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/atwi/evaluate-scenario", methods=["POST"])
    @require_permission("atwi.calculate")
    def evaluate_scenario_file():
        try:
            body = request.json or {}
            scenario_file_name = body.get("scenarioFileName")
            model_id = body.get("modelId")
            window_duration_sec = float(body.get("windowDurationSec", 300.0))

            if not scenario_file_name:
                return jsonify({"error": "scenarioFileName is required"}), 400
            if not model_id:
                return jsonify({"error": "modelId is required"}), 400

            # Safe resolve scenario path
            root_dir = Path(__file__).parent.parent.parent
            scn_path = root_dir / "FTS Server" / "scenario" / scenario_file_name
            if not scn_path.exists():
                return jsonify({"error": f"Scenario file not found: {scenario_file_name}"}), 404

            # Read scn file content
            with open(scn_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Read the model
            models = read_models()
            model = next((m for m in models if m["id"] == model_id), None)
            if not model:
                return jsonify({"error": f"Model {model_id} not found"}), 404

            # Helper functions for trajectory and math calculations
            def local_haversine(lat1, lon1, lat2, lon2):
                R = 3440.065
                phi1 = math.radians(lat1)
                phi2 = math.radians(lat2)
                delta_phi = math.radians(lat2 - lat1)
                delta_lambda = math.radians(lon2 - lon1)
                a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
                c = 2 * math.asin(math.sqrt(a))
                return R * c

            def local_parse_time(time_str):
                parts = time_str.strip().split(':')
                try:
                    if len(parts) == 3:
                        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                    elif len(parts) == 2:
                        return float(parts[0]) * 60 + float(parts[1])
                    elif len(parts) == 1:
                        return float(parts[0])
                except ValueError:
                    pass
                return 0.0

            def local_parse_altitude(alt_str):
                alt_str = alt_str.strip().upper()
                if not alt_str or alt_str == "0":
                    return 0.0
                if alt_str.startswith("FL"):
                    try:
                        return float(alt_str[2:]) * 100.0
                    except ValueError:
                        return 0.0
                try:
                    return float(alt_str)
                except ValueError:
                    return 0.0

            def local_parse_speed(spd_str):
                try:
                    return float(spd_str)
                except ValueError:
                    return 250.0

            def local_get_wake_category(ac_type):
                heavy_types = {"B744", "B77W", "B773", "A359", "A350", "A339", "B788", "B78X", "B772"}
                if ac_type.upper() in heavy_types:
                    return "H"
                return "M"

            # Parse SCN content
            waypoints = {}
            aircraft = {}
            commands_log = []
            # capacity_scenario_engine.py (VVNB/VVGB/VVPQ) never emits real
            # ORIG/DEST stack commands -- those aircraft's origin/destination
            # would otherwise stay None forever, so ALL of them read as 0
            # departures/0 arrivals below regardless of the VVTS/VVLT check.
            # It does always emit a "# --- <CS> DEP/ARR <ICAO> RWY..."
            # comment line immediately before that flight's CRE, so use that
            # as a fallback hint instead of touching the .scn's real
            # commands (ORIG/DEST actually insert a waypoint into the route
            # in BlueSky -- not safe to add blindly to already-verified
            # scenarios just to label them for this analyzer).
            dep_arr_hint_re = re.compile(r"^#\s*---\s*(\S+)\s+(DEP|ARR)\s+(\S+)\s+RWY", re.IGNORECASE)
            dep_arr_hints: dict[str, tuple[str, str]] = {}

            for line in content.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    if line.startswith("#"):
                        m = dep_arr_hint_re.match(line)
                        if m:
                            dep_arr_hints[m.group(1).upper()] = (m.group(2).upper(), m.group(3).upper())
                    continue
                if ">" not in line:
                    continue
                time_part, cmd_part = line.split(">", 1)
                t_seconds = local_parse_time(time_part)
                cmd_part = cmd_part.strip()
                if not cmd_part:
                    continue
                parts = cmd_part.split(" ", 1)
                cmd_name = parts[0].upper().strip()
                args_str = parts[1].strip() if len(parts) > 1 else ""
                args = [a.strip() for a in args_str.split(",") if a.strip()]

                commands_log.append({
                    "t": t_seconds,
                    "cmd": cmd_name,
                    "args": args
                })

                if cmd_name == "DEFWPT" and len(args) >= 3:
                    wpt_name = args[0].upper()
                    try:
                        lat = float(args[1])
                        lon = float(args[2])
                        waypoints[wpt_name] = (lat, lon)
                    except ValueError:
                        pass
                elif cmd_name == "CRE" and len(args) >= 7:
                    callsign = args[0].upper()
                    ac_type = args[1].upper()
                    try:
                        lat = float(args[2])
                        lon = float(args[3])
                        heading = float(args[4])
                        alt = local_parse_altitude(args[5])
                        spd = local_parse_speed(args[6])
                        aircraft[callsign] = {
                            "callsign": callsign,
                            "type": ac_type,
                            "spawn_time": t_seconds,
                            "lat_spawn": lat,
                            "lon_spawn": lon,
                            "heading": heading,
                            "alt_spawn": alt,
                            "spd_spawn": spd,
                            "origin": None,
                            "destination": None,
                            "waypoints": [],
                            "updates": []
                        }
                        hint = dep_arr_hints.get(callsign)
                        if hint:
                            movement, icao = hint
                            if movement == "DEP":
                                aircraft[callsign]["origin"] = icao
                            else:
                                aircraft[callsign]["destination"] = icao
                    except ValueError:
                        pass
                elif cmd_name in ("SPD", "ALT", "ORIG", "DEST", "ADDWPT") and len(args) >= 2:
                    callsign = args[0].upper()
                    if callsign in aircraft:
                        if cmd_name == "ORIG":
                            aircraft[callsign]["origin"] = args[1].upper()
                        elif cmd_name == "DEST":
                            aircraft[callsign]["destination"] = args[1].upper()
                        elif cmd_name == "SPD":
                            aircraft[callsign]["updates"].append((t_seconds, "SPD", local_parse_speed(args[1])))
                        elif cmd_name == "ALT":
                            aircraft[callsign]["updates"].append((t_seconds, "ALT", local_parse_altitude(args[1])))
                        elif cmd_name == "ADDWPT":
                            wpt_name = args[1].upper()
                            target_alt = local_parse_altitude(args[2]) if len(args) > 2 else None
                            target_spd = local_parse_speed(args[3]) if len(args) > 3 else None
                            aircraft[callsign]["waypoints"].append({
                                "t_cmd": t_seconds,
                                "name": wpt_name,
                                "alt": target_alt,
                                "spd": target_spd
                            })

            if not aircraft:
                return jsonify({"error": "No aircraft found in the scenario file"}), 400

            # Generate 4D Trajectories
            trajectories = {}
            for callsign, ac in aircraft.items():
                spawn_time = ac["spawn_time"]
                lat = ac["lat_spawn"]
                lon = ac["lon_spawn"]
                alt = ac["alt_spawn"]
                spd = ac["spd_spawn"]

                for t, utype, val in ac["updates"]:
                    if t == spawn_time:
                        if utype == "SPD":
                            spd = val
                        elif utype == "ALT":
                            alt = val

                traj = [(spawn_time, lat, lon, alt, spd)]
                current_t = spawn_time
                current_lat = lat
                current_lon = lon
                current_alt = alt
                current_spd = spd

                for wpt in ac["waypoints"]:
                    wpt_name = wpt["name"]
                    if wpt_name not in waypoints:
                        continue
                    wpt_lat, wpt_lon = waypoints[wpt_name]
                    target_spd = wpt["spd"] if wpt["spd"] is not None else current_spd
                    target_alt = wpt["alt"] if wpt["alt"] is not None else current_alt

                    dist = local_haversine(current_lat, current_lon, wpt_lat, wpt_lon)
                    if dist < 0.01:
                        continue

                    leg_spd = target_spd if target_spd > 0 else 150.0
                    dt = (dist / leg_spd) * 3600.0
                    if dt <= 0:
                        continue
                    end_t = current_t + dt
                    traj.append((end_t, wpt_lat, wpt_lon, target_alt, leg_spd))

                    current_t = end_t
                    current_lat = wpt_lat
                    current_lon = wpt_lon
                    current_alt = target_alt
                    current_spd = leg_spd

                trajectories[callsign] = traj

            def get_state_at_time(traj, t):
                if not traj:
                    return None
                start_t = traj[0][0]
                end_t = traj[-1][0]
                if t < start_t or t > end_t:
                    return None
                if start_t == end_t:
                    return traj[0][1:]
                for j in range(1, len(traj)):
                    t_prev, lat_prev, lon_prev, alt_prev, spd_prev = traj[j-1]
                    t_curr, lat_curr, lon_curr, alt_curr, spd_curr = traj[j]
                    if t_prev <= t <= t_curr:
                        if t_curr == t_prev:
                            return (lat_curr, lon_curr, alt_curr, spd_curr)
                        f = (t - t_prev) / (t_curr - t_prev)
                        lat = lat_prev + f * (lat_curr - lat_prev)
                        lon = lon_prev + f * (lon_curr - lon_prev)
                        alt = alt_prev + f * (alt_curr - alt_prev)
                        spd = spd_prev + f * (spd_curr - spd_prev)
                        return (lat, lon, alt, spd)
                return None

            all_spawn_times = [ac["spawn_time"] for ac in aircraft.values()]
            all_exit_times = [traj[-1][0] for traj in trajectories.values() if traj]

            t_min = min(all_spawn_times) if all_spawn_times else 0.0
            t_max = max(all_exit_times) if all_exit_times else 3600.0
            duration = t_max - t_min
            if duration <= 0:
                duration = 3600.0

            sample_interval = 10.0
            ticks = int(duration / sample_interval) + 1

            conflict_events = []
            wake_separation_warnings = []

            for i in range(ticks):
                t = t_min + i * sample_interval
                active_states = {}
                for cs, traj in trajectories.items():
                    state = get_state_at_time(traj, t)
                    if state:
                        active_states[cs] = state

                active_callsigns = list(active_states.keys())

                for idx1 in range(len(active_callsigns)):
                    for idx2 in range(idx1 + 1, len(active_callsigns)):
                        ac1 = active_callsigns[idx1]
                        ac2 = active_callsigns[idx2]

                        lat1, lon1, alt1, spd1 = active_states[ac1]
                        lat2, lon2, alt2, spd2 = active_states[ac2]

                        dist_nm = local_haversine(lat1, lon1, lat2, lon2)
                        sep_ft = abs(alt1 - alt2)

                        if dist_nm < 3.0 and sep_ft < 1000.0:
                            conflict_events.append({
                                "t": t,
                                "ac1": ac1,
                                "ac2": ac2,
                                "dist_nm": dist_nm,
                                "sep_ft": sep_ft
                            })

                        info1 = aircraft[ac1]
                        info2 = aircraft[ac2]

                        orig1, dest1, type1 = info1["origin"] or "", info1["destination"] or "", info1["type"]
                        orig2, dest2, type2 = info2["origin"] or "", info2["destination"] or "", info2["type"]

                        wcat1 = local_get_wake_category(type1)
                        wcat2 = local_get_wake_category(type2)

                        # A departure/arrival is "this study's airport" if it
                        # has a real origin/destination at all -- not
                        # restricted to a fixed VVTS/VVLT list, since that
                        # hardcoding meant every OTHER airport's scenario
                        # (VVNB/VVGB/VVPQ) silently got 0 here regardless of
                        # actual traffic (see the dep_arr_hints fallback
                        # above for why origin/destination can be populated
                        # at all for those generators' scenarios).
                        is_h_dep_1 = (bool(orig1) and wcat1 == "H")
                        is_m_arr_2 = (bool(dest2) and wcat2 == "M")
                        is_h_dep_2 = (bool(orig2) and wcat2 == "H")
                        is_m_arr_1 = (bool(dest1) and wcat1 == "M")

                        if (is_h_dep_1 and is_m_arr_2) or (is_h_dep_2 and is_m_arr_1):
                            if dist_nm < 6.0 and sep_ft < 1000.0:
                                wake_separation_warnings.append({
                                    "t": t,
                                    "ac1": ac1 if is_h_dep_1 else ac2,
                                    "ac2": ac2 if is_h_dep_1 else ac1,
                                    "dist_nm": dist_nm,
                                    "sep_ft": sep_ft
                                })

            # Load model coefficients and thresholds
            coefficients = model.get("coefficients", {})
            thresholds = model.get("thresholds", {})
            task_definitions = model.get("taskDefinitions", [])
            if not task_definitions:
                task_definitions = read_task_index()

            task_dict = {t["code"]: t for t in task_definitions}

            num_windows = max(1, int(math.ceil(duration / window_duration_sec)))
            timeseries_data = []
            overall_task_counts = {}

            dep_count = 0
            arr_count = 0
            heavy_count = 0
            medium_count = 0
            for cs, ac in aircraft.items():
                orig = ac["origin"] or ""
                dest = ac["destination"] or ""
                if orig:
                    dep_count += 1
                elif dest:
                    arr_count += 1
                wcat = local_get_wake_category(ac["type"])
                if wcat == "H":
                    heavy_count += 1
                else:
                    medium_count += 1

            # Per-controller-position breakdown: derive this scenario's airport
            # from whichever real ICAO code shows up most often as an
            # origin/destination (the dep_arr_hints fallback above populates
            # this for capacity_scenario_engine.py scenarios), then load any
            # positions defined for that airport. A position's workload is
            # just the SAME per-window task totals already computed above,
            # summed over whichever taskCodes belong to it -- no separate
            # simulation pass needed.
            icao_counts: dict[str, int] = {}
            for ac in aircraft.values():
                for code in (ac["origin"], ac["destination"]):
                    if code:
                        icao_counts[code] = icao_counts.get(code, 0) + 1
            scenario_icao = max(icao_counts, key=icao_counts.get) if icao_counts else None
            positions = [p for p in read_positions() if p.get("icao") == scenario_icao] if scenario_icao else []
            position_window_loads: dict[str, list[float]] = {p["id"]: [] for p in positions}

            for i in range(num_windows):
                w_start = t_min + i * window_duration_sec
                w_end = min(t_max, t_min + (i + 1) * window_duration_sec)
                w_dur = w_end - w_start
                if w_dur <= 0:
                    continue

                active_in_w = set()
                spawns_in_w = 0
                exits_in_w = 0

                for cs, traj in trajectories.items():
                    ac_start = traj[0][0]
                    ac_end = traj[-1][0]
                    if max(w_start, ac_start) <= min(w_end, ac_end):
                        active_in_w.add(cs)
                    if w_start <= ac_start < w_end:
                        spawns_in_w += 1
                    if w_start <= ac_end < w_end:
                        exits_in_w += 1

                aircraft_count = len(active_in_w)
                w_cmds = [c for c in commands_log if w_start <= c["t"] < w_end]
                alt_cmds = len([c for c in w_cmds if c["cmd"] == "ALT"])
                spd_cmds = len([c for c in w_cmds if c["cmd"] == "SPD"])
                addwpt_cmds = len([c for c in w_cmds if c["cmd"] == "ADDWPT"])

                w_conf_pairs = set()
                for c in conflict_events:
                    if w_start <= c["t"] < w_end:
                        w_conf_pairs.add(frozenset({c["ac1"], c["ac2"]}))
                conflict_count = len(w_conf_pairs)
                stca_count = max(1, int(conflict_count * 0.5)) if conflict_count > 0 else 0
                handoff_count = (spawns_in_w + exits_in_w)
                rwy_seq_count = max(1, int(aircraft_count * 0.2)) if aircraft_count > 0 else 0

                window_counts = {
                    "SURV_SCAN": aircraft_count,
                    "TRAFFIC_COUNT_MONITOR": aircraft_count,
                    "CONFLICT_CHECK": conflict_count,
                    "STCA_RESPONSE": stca_count,
                    "VECTOR_OR_DIRECT": addwpt_cmds,
                    "ALTITUDE_CHANGE": alt_cmds,
                    "SPEED_CONTROL": spd_cmds,
                    "HANDOFF_COORD": handoff_count,
                    "CROSS_SECTOR_COORD": max(1, int(handoff_count * 0.5)) if handoff_count > 0 else 0,
                    "RUNWAY_SEQUENCE": rwy_seq_count,
                    "WEATHER_DEVIATION": 0,
                    "MILITARY_COORD": 0,
                    "SYSTEM_DEGRADED": 0,
                    "AIRPORT_SURFACE_FEEDBACK": 0
                }

                # Filter keys present in task definitions
                for k in list(window_counts.keys()):
                    if k not in task_dict:
                        window_counts.pop(k, None)

                for k, v in window_counts.items():
                    overall_task_counts[k] = overall_task_counts.get(k, 0) + v

                complexity_factor = min(3.0, aircraft_count / 10.0)
                total_localized_load_sec = 0.0
                task_breakdown = []

                for code, count in window_counts.items():
                    task_def = task_dict[code]
                    base_effort = float(task_def.get("baseEffortSec", 5.0))
                    localized_single = base_effort * (
                        1.0 + coefficients.get("complexityCoeff", 0.15) * complexity_factor
                    )
                    total_sec = localized_single * count
                    total_localized_load_sec += total_sec

                    task_breakdown.append({
                        "taskDefinitionId": task_def.get("id"),
                        "taskCode": code,
                        "taskName": task_def.get("name"),
                        "category": task_def.get("category"),
                        "count": count,
                        "baseEffortSec": base_effort,
                        "localizedSingleTaskSec": round(localized_single, 2),
                        "totalSeconds": round(total_sec, 2),
                        "workloadSharePercent": 0.0
                    })

                for tb in task_breakdown:
                    if total_localized_load_sec > 0:
                        tb["workloadSharePercent"] = round((tb["totalSeconds"] / total_localized_load_sec) * 100, 2)

                atco_on_pos = model.get("atcoOnPosition", 1)
                avail_sec_per_hour = model.get("availableSecondsPerAtcoPerHour", 3600)
                available_capacity_sec = (w_dur / 3600.0) * atco_on_pos * avail_sec_per_hour

                # Same per-window task totals, just re-summed per real
                # controller position instead of one combined "1 ATCO does
                # everything" figure -- e.g. VVPQ's "Trực hiệp đồng APP"
                # only gets HANDOFF_COORD + CROSS_SECTOR_COORD, not the
                # SURV_SCAN/communication load "Trực điều hành APP" carries.
                position_results = []
                for p in positions:
                    p_load = sum(tb["totalSeconds"] for tb in task_breakdown if tb["taskCode"] in p["taskCodes"])
                    p_capacity = (w_dur / 3600.0) * p["atcoCount"] * avail_sec_per_hour
                    p_atwi = round(min(150.0, max(0.0, (p_load / p_capacity) * 100)), 2) if p_capacity > 0 else 0.0
                    position_window_loads[p["id"]].append(p_load)
                    position_results.append({
                        "positionId": p["id"],
                        "positionName": p["name"],
                        "totalSeconds": round(p_load, 2),
                        "availableCapacitySec": round(p_capacity, 2),
                        "atwiPercent": p_atwi,
                        "band": get_atwi_band(p_atwi, thresholds),
                        "hasMappedTasks": len(p["taskCodes"]) > 0,
                    })

                atwi_percent = (total_localized_load_sec / available_capacity_sec) * 100 if available_capacity_sec > 0 else 0.0
                atwi_percent = round(min(150.0, max(0.0, atwi_percent)), 2)

                normal_max = thresholds.get("normalMax", 60)
                watch_max = thresholds.get("watchMax", 75)
                high_max = thresholds.get("highMax", 90)

                if atwi_percent < normal_max:
                    band = "normal"
                elif atwi_percent < watch_max:
                    band = "watch"
                elif atwi_percent < high_max:
                    band = "high"
                else:
                    band = "critical"

                time_label = f"{int(w_start//60):02d}:{int(w_start%60):02d}"

                timeseries_data.append({
                    "windowIndex": i,
                    "startTime": round(w_start, 1),
                    "endTime": round(w_end, 1),
                    "timestampLabel": time_label,
                    "activeAircraftCount": aircraft_count,
                    "conflictCount": conflict_count,
                    "spawns": spawns_in_w,
                    "exits": exits_in_w,
                    "totalLocalizedLoadSec": round(total_localized_load_sec, 2),
                    "availableCapacitySec": round(available_capacity_sec, 2),
                    "atwiPercent": atwi_percent,
                    "band": band,
                    "taskResults": task_breakdown,
                    "positionResults": position_results
                })

            overall_available_capacity_sec = (duration / 3600.0) * atco_on_pos * avail_sec_per_hour
            overall_load_sec = sum(wd["totalLocalizedLoadSec"] for wd in timeseries_data)
            overall_atwi_percent = (overall_load_sec / overall_available_capacity_sec) * 100 if overall_available_capacity_sec > 0 else 0.0
            overall_atwi_percent = round(min(150.0, max(0.0, overall_atwi_percent)), 2)

            if overall_atwi_percent < thresholds.get("normalMax", 60):
                overall_band = "normal"
            elif overall_atwi_percent < thresholds.get("watchMax", 75):
                overall_band = "watch"
            elif overall_atwi_percent < thresholds.get("highMax", 90):
                overall_band = "high"
            else:
                overall_band = "critical"

            peak_atwi_wd = max(timeseries_data, key=lambda x: x["atwiPercent"])
            peak_atwi = peak_atwi_wd["atwiPercent"]
            peak_time_label = peak_atwi_wd["timestampLabel"]

            # Overall (whole-scenario) summary per position, same shape as
            # the combined figures above but scoped to each position's own
            # taskCodes and atcoCount -- this is the number that actually
            # answers "is THIS specific controller overloaded", which the
            # single combined ATWI% can hide (e.g. VVPQ's coordination
            # position peaking well above the combined average while the
            # tactical position stays comfortable).
            position_summaries = []
            for p in positions:
                p_total_load = sum(position_window_loads.get(p["id"], []))
                p_overall_capacity = (duration / 3600.0) * p["atcoCount"] * avail_sec_per_hour
                p_overall_atwi = round(min(150.0, max(0.0, (p_total_load / p_overall_capacity) * 100)), 2) if p_overall_capacity > 0 else 0.0
                p_peak_entry = None
                for wd in timeseries_data:
                    for pr in wd["positionResults"]:
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
                    "overallBand": get_atwi_band(p_overall_atwi, thresholds),
                    "peakAtwiPercent": p_peak_entry["atwiPercent"] if p_peak_entry else 0.0,
                    "peakTimeLabel": p_peak_entry["timestampLabel"] if p_peak_entry else None,
                })

            overall_breakdown = []
            for code, count in overall_task_counts.items():
                if count == 0:
                    continue
                total_seconds = sum(
                    next((tb["totalSeconds"] for tb in wd["taskResults"] if tb["taskCode"] == code), 0.0)
                    for wd in timeseries_data
                )
                task_def = task_dict[code]
                overall_breakdown.append({
                    "taskDefinitionId": task_def.get("id"),
                    "taskCode": code,
                    "taskName": task_def.get("name"),
                    "category": task_def.get("category"),
                    "count": count,
                    "totalSeconds": round(total_seconds, 2),
                    "workloadSharePercent": 0.0
                })

            total_shares = sum(ob["totalSeconds"] for ob in overall_breakdown)
            for ob in overall_breakdown:
                if total_shares > 0:
                    ob["workloadSharePercent"] = round((ob["totalSeconds"] / total_shares) * 100, 2)
            overall_breakdown = sorted(overall_breakdown, key=lambda x: x["workloadSharePercent"], reverse=True)

            unique_wake_warnings = set()
            for w in wake_separation_warnings:
                window_idx = int((w["t"] - t_min) // window_duration_sec)
                w_start = t_min + window_idx * window_duration_sec
                time_lbl = f"{int(w_start//60):02d}:{int(w_start%60):02d}"
                unique_wake_warnings.add((time_lbl, w["ac1"], w["ac2"]))

            wake_warnings_formatted = [
                f"Vi phạm khoảng cách phân cách dòng khí động (< 6 NM) tại thời điểm {item[0]} giữa Heavy departure {item[1]} và Medium arrival {item[2]}."
                for item in sorted(unique_wake_warnings)
            ]

            warnings = []
            if wake_warnings_formatted:
                warnings.extend(wake_warnings_formatted)

            result = {
                "modelId": model["id"],
                "modelName": model["name"],
                "modelVersion": model["metadata"]["version"],
                "modelStatus": model["metadata"]["status"],
                "approvedForKpi": model["metadata"]["approvedForKpi"],
                "simulationDurationSec": round(duration, 2),
                "windowDurationSec": window_duration_sec,
                "overallAtwiPercent": overall_atwi_percent,
                "overallBand": overall_band,
                "peakAtwiPercent": peak_atwi,
                "peakTimeLabel": peak_time_label,
                "totalLocalizedLoadSec": round(overall_load_sec, 2),
                "availableCapacitySec": round(overall_available_capacity_sec, 2),
                "aircraftCount": len(aircraft),
                "departuresCount": dep_count,
                "arrivalsCount": arr_count,
                "heavyWakeCount": heavy_count,
                "mediumWakeCount": medium_count,
                "taskResults": overall_breakdown,
                "timeseries": timeseries_data,
                "warnings": warnings,
                "scenarioIcao": scenario_icao,
                "positions": position_summaries,
                "generatedAt": datetime.datetime.now().isoformat() + "Z"
            }

            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500


