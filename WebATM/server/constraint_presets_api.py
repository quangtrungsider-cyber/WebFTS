import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission


def get_constraint_presets_file():
    root_dir = Path(__file__).parent.parent.parent
    data_dir = root_dir / "FTS Server" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "constraint_presets.json"


def current_iso_time():
    return datetime.utcnow().isoformat() + "Z"


def init_seed_data():
    file_path = get_constraint_presets_file()
    if file_path.exists():
        return
    now = current_iso_time()
    # Reusable separation-parameter presets for CapacityConfigEditor's three
    # real fields (minArrArrGapSec/depAfterArrGapSec/minRunwayGapSec) --
    # modeled on the 3-tier lambda-S1/S2/SU saturation-capacity concept from
    # the TAAM research (full current constraints / relaxed with improved
    # technology-procedures / theoretical unconstrained ceiling), not a
    # measured/observed value.
    seed = [
        {
            "id": "preset-full-constraints",
            "name": "Ràng buộc đầy đủ hiện tại (λS1)",
            "description": "Phân cách vận hành hiện hành -- 3NM/3 phút giữa các lượt đến, 30 giây cất cánh sau hạ cánh. Dùng làm baseline năng lực thực tế.",
            "minArrArrGapSec": 180,
            "depAfterArrGapSec": 30,
            "minRunwayGapSec": 60,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "preset-semi-constrained",
            "name": "Bán ràng buộc - công nghệ mới (λS2)",
            "description": "Giả định triển khai công nghệ/thủ tục mới (VD: giám sát tăng cường, RECAT) cho phép rút ngắn phân cách -- dùng để kiểm tra độ nhạy năng lực khi cải tiến vận hành.",
            "minArrArrGapSec": 120,
            "depAfterArrGapSec": 20,
            "minRunwayGapSec": 45,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "preset-unconstrained",
            "name": "Không ràng buộc mặt đất (λSU)",
            "description": "Trần năng lực lý thuyết, chỉ giới hạn bởi runway occupancy tối thiểu -- KHÔNG phải mục tiêu vận hành thật, dùng để xác định giới hạn trên khi so sánh với λS1/λS2.",
            "minArrArrGapSec": 60,
            "depAfterArrGapSec": 10,
            "minRunwayGapSec": 30,
            "createdAt": now,
            "updatedAt": now,
        },
    ]
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)


def load_presets():
    init_seed_data()
    with open(get_constraint_presets_file(), "r", encoding="utf-8") as f:
        return json.load(f)


def save_presets(presets):
    with open(get_constraint_presets_file(), "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)


def register_constraint_presets_routes(app):
    @app.route("/api/constraint-presets", methods=["GET"])
    @require_permission("scenarios.read")
    def get_constraint_presets():
        try:
            return jsonify(load_presets())
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/constraint-presets/<preset_id>", methods=["GET"])
    @require_permission("scenarios.read")
    def get_constraint_preset(preset_id):
        try:
            preset = next((p for p in load_presets() if p["id"] == preset_id), None)
            if preset:
                return jsonify(preset)
            return jsonify({"error": "Preset not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/constraint-presets", methods=["POST"])
    @require_permission("scenarios.create")
    def create_constraint_preset():
        try:
            data = request.json
            if not data or not data.get("name"):
                return jsonify({"error": "Missing required field: name"}), 400

            presets = load_presets()
            now = current_iso_time()
            new_preset = {
                "id": str(uuid.uuid4()),
                "name": data.get("name"),
                "description": data.get("description", ""),
                "minArrArrGapSec": data.get("minArrArrGapSec", 180),
                "depAfterArrGapSec": data.get("depAfterArrGapSec", 30),
                "minRunwayGapSec": data.get("minRunwayGapSec", 60),
                "createdAt": now,
                "updatedAt": now,
            }
            presets.append(new_preset)
            save_presets(presets)
            return jsonify(new_preset), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/constraint-presets/<preset_id>", methods=["PUT"])
    @require_permission("scenarios.update")
    def update_constraint_preset(preset_id):
        try:
            data = request.json
            if not data:
                return jsonify({"error": "No data provided"}), 400

            presets = load_presets()
            index = next((i for i, p in enumerate(presets) if p["id"] == preset_id), -1)
            if index == -1:
                return jsonify({"error": "Preset not found"}), 404

            preset = presets[index]
            for field in ("name", "description", "minArrArrGapSec", "depAfterArrGapSec", "minRunwayGapSec"):
                if field in data:
                    preset[field] = data[field]
            preset["updatedAt"] = current_iso_time()

            presets[index] = preset
            save_presets(presets)
            return jsonify(preset)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/constraint-presets/<preset_id>", methods=["DELETE"])
    @require_permission("scenarios.archive")
    def delete_constraint_preset(preset_id):
        try:
            presets = load_presets()
            initial_len = len(presets)
            presets = [p for p in presets if p["id"] != preset_id]
            if len(presets) == initial_len:
                return jsonify({"error": "Preset not found"}), 404

            save_presets(presets)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
