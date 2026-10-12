import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission

def get_studies_file():
    # FTS Server/data/studies.json
    root_dir = Path(__file__).parent.parent.parent
    data_dir = root_dir / "FTS Server" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "studies.json"

def init_seed_data():
    file_path = get_studies_file()
    if not file_path.exists():
        seed_data = [
            {
                "id": "study-vvts-25lr-capacity",
                "name": "Đánh giá năng lực VVTS 25L/25R",
                "type": "capacity",
                "status": "draft",
                "area": "VVTS / TMA Tân Sơn Nhất",
                "objective": "Đánh giá năng lực khai thác 52 chuyến/giờ với cấu hình 25L cất cánh và 25R hạ cánh.",
                "owner": "VATM FTS Team",
                "aixmDatasetId": "aixm-airac-2405",
                "airacCycle": "2405",
                "createdAt": "2026-05-01T00:00:00.000Z",
                "updatedAt": "2026-05-01T00:00:00.000Z",
                "archivedAt": None,
                "description": "Study phục vụ đánh giá năng lực, sequencing, runway occupancy và nguy cơ dồn ứ tại P5.",
                "tags": ["VVTS", "capacity", "25L/25R"]
            },
            {
                "id": "study-vvdn-rnav-trombone",
                "name": "Đánh giá RNAV/Trombone Đà Nẵng",
                "type": "procedure",
                "status": "in_analysis",
                "area": "VVDN / Đà Nẵng TMA",
                "objective": "Đánh giá tác động của RNAV/Trombone, spacing 8–10 NM và workload APP/TWR.",
                "owner": "VATM Safety / ATM",
                "aixmDatasetId": "aixm-airac-2405",
                "airacCycle": "2405",
                "createdAt": "2026-05-02T00:00:00.000Z",
                "updatedAt": "2026-05-02T00:00:00.000Z",
                "archivedAt": None,
                "description": "Study phục vụ phân tích phương thức đến/đi và kiểm tra tác động workload.",
                "tags": ["VVDN", "RNAV", "Trombone"]
            },
            {
                "id": "study-hcm-acc-sectorization",
                "name": "Sectorization HCM ACC",
                "type": "airspace",
                "status": "review",
                "area": "VVHM FIR / HCM ACC",
                "objective": "Đánh giá phương án phân khu kiểm soát và phân bổ tải điều hành.",
                "owner": "VATM ATM Planning",
                "aixmDatasetId": "aixm-airac-2405",
                "airacCycle": "2405",
                "createdAt": "2026-05-03T00:00:00.000Z",
                "updatedAt": "2026-05-03T00:00:00.000Z",
                "archivedAt": None,
                "description": "Study phục vụ đánh giá workload, sector load và phương án phân khu.",
                "tags": ["VVHM", "ACC", "Sectorization"]
            }
        ]
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(seed_data, f, ensure_ascii=False, indent=2)

def load_studies():
    init_seed_data()
    with open(get_studies_file(), "r", encoding="utf-8") as f:
        return json.load(f)

def save_studies(studies):
    with open(get_studies_file(), "w", encoding="utf-8") as f:
        json.dump(studies, f, ensure_ascii=False, indent=2)

def current_iso_time():
    return datetime.utcnow().isoformat() + "Z"

def register_studies_routes(app):
    @app.route("/api/studies", methods=["GET"])
    @require_permission("studies.read")
    def get_studies():
        try:
            status = request.args.get("status")
            study_type = request.args.get("type")
            include_archived = request.args.get("includeArchived") == "true"
            
            studies = load_studies()
            filtered = []
            for s in studies:
                if not include_archived and s.get("status") == "archived":
                    continue
                if status and s.get("status") != status:
                    continue
                if study_type and s.get("type") != study_type:
                    continue
                filtered.append(s)
                
            return jsonify(filtered)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/studies/<study_id>", methods=["GET"])
    @require_permission("studies.read")
    def get_study(study_id):
        try:
            studies = load_studies()
            study = next((s for s in studies if s["id"] == study_id), None)
            if study:
                return jsonify(study)
            return jsonify({"error": "Study not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/studies", methods=["POST"])
    @require_permission("studies.create")
    def create_study():
        try:
            data = request.json
            if not data or not data.get("name") or not data.get("area") or not data.get("objective") or not data.get("owner"):
                return jsonify({"error": "Missing required fields: name, area, objective, owner"}), 400
                
            studies = load_studies()
            
            now = current_iso_time()
            new_study = {
                "id": str(uuid.uuid4()),
                "name": data.get("name"),
                "type": data.get("type", "other"),
                "status": data.get("status", "draft"),
                "area": data.get("area"),
                "objective": data.get("objective"),
                "owner": data.get("owner"),
                "aixmDatasetId": data.get("aixmDatasetId", ""),
                "airacCycle": data.get("airacCycle", ""),
                "createdAt": now,
                "updatedAt": now,
                "archivedAt": None,
                "description": data.get("description", ""),
                "tags": data.get("tags", [])
            }
            
            studies.append(new_study)
            save_studies(studies)
            
            return jsonify(new_study), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/studies/<study_id>", methods=["PUT"])
    @require_permission("studies.update")
    def update_study(study_id):
        try:
            data = request.json
            if not data:
                return jsonify({"error": "No data provided"}), 400
                
            studies = load_studies()
            index = next((i for i, s in enumerate(studies) if s["id"] == study_id), -1)
            
            if index == -1:
                return jsonify({"error": "Study not found"}), 404
                
            study = studies[index]
            
            # Update fields, but not id, createdAt
            study["name"] = data.get("name", study["name"])
            study["type"] = data.get("type", study["type"])
            study["status"] = data.get("status", study["status"])
            study["area"] = data.get("area", study["area"])
            study["objective"] = data.get("objective", study["objective"])
            study["owner"] = data.get("owner", study["owner"])
            study["aixmDatasetId"] = data.get("aixmDatasetId", study.get("aixmDatasetId"))
            study["airacCycle"] = data.get("airacCycle", study.get("airacCycle"))
            study["description"] = data.get("description", study.get("description"))
            study["tags"] = data.get("tags", study.get("tags"))
            study["updatedAt"] = current_iso_time()
            
            studies[index] = study
            save_studies(studies)
            
            return jsonify(study)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/studies/<study_id>/archive", methods=["PATCH"])
    @require_permission("studies.archive")
    def archive_study(study_id):
        try:
            studies = load_studies()
            index = next((i for i, s in enumerate(studies) if s["id"] == study_id), -1)
            
            if index == -1:
                return jsonify({"error": "Study not found"}), 404
                
            study = studies[index]
            now = current_iso_time()
            study["status"] = "archived"
            study["archivedAt"] = now
            study["updatedAt"] = now
            
            studies[index] = study
            save_studies(studies)
            
            return jsonify(study)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/studies/<study_id>", methods=["DELETE"])
    @require_permission("studies.archive")
    def delete_study(study_id):
        # NOT FOR PRODUCTION
        try:
            studies = load_studies()
            initial_len = len(studies)
            studies = [s for s in studies if s["id"] != study_id]
            
            if len(studies) == initial_len:
                return jsonify({"error": "Study not found"}), 404
                
            save_studies(studies)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
