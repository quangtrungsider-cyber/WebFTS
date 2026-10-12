import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission


def get_weather_presets_file():
    root_dir = Path(__file__).parent.parent.parent
    data_dir = root_dir / "FTS Server" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "weather_presets.json"


def current_iso_time():
    return datetime.utcnow().isoformat() + "Z"


def init_seed_data():
    file_path = get_weather_presets_file()
    if file_path.exists():
        return
    now = current_iso_time()
    # Named what-if configurations for the WIND stack command + validation-
    # relevant reference fields -- NOT real METAR observations. Mirrors the
    # weatherConfig.mode categories already declared on Scenario (models.ts).
    seed = [
        {
            "id": "preset-vmc-calm",
            "name": "VMC / gió nhẹ (mặc định)",
            "description": "Điều kiện quang mây, gió nhẹ ổn định -- dùng làm baseline khi không cần mô hình hoá thời tiết.",
            "mode": "vfr",
            "windDirection": 90,
            "windSpeedKt": 5,
            "visibilityM": 10000,
            "ceilingFt": None,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "preset-monsoon-ne",
            "name": "Gió mùa Đông Bắc mạnh",
            "description": "Gió mùa Đông Bắc điển hình khu vực Bắc Bộ tháng 11-3, hướng ổn định nhưng tốc độ cao -- kiểm tra ảnh hưởng đến cấu hình đường CHC ngược gió.",
            "mode": "custom",
            "windDirection": 30,
            "windSpeedKt": 22,
            "visibilityM": 8000,
            "ceilingFt": None,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "preset-ifr-low-ceiling",
            "name": "IFR - Trần mây thấp",
            "description": "Trần mây và tầm nhìn dưới tối thiểu VFR -- kiểm tra tác động của phân cách/tốc độ tiếp cận theo IFR lên năng lực đường CHC.",
            "mode": "ifr",
            "windDirection": 250,
            "windSpeedKt": 10,
            "visibilityM": 3000,
            "ceilingFt": 600,
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "id": "preset-cb-ts",
            "name": "Dông đối lưu (CB/TS)",
            "description": "Có mây dông/giông trong khu vực TMA -- gió giật mạnh, hướng thay đổi nhanh; dùng để kiểm tra kịch bản tránh ô/deviation.",
            "mode": "cb_ts",
            "windDirection": 180,
            "windSpeedKt": 30,
            "visibilityM": 5000,
            "ceilingFt": 2000,
            "createdAt": now,
            "updatedAt": now,
        },
    ]
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)


def load_presets():
    init_seed_data()
    with open(get_weather_presets_file(), "r", encoding="utf-8") as f:
        return json.load(f)


def save_presets(presets):
    with open(get_weather_presets_file(), "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)


def register_weather_presets_routes(app):
    @app.route("/api/weather-presets", methods=["GET"])
    @require_permission("scenarios.read")
    def get_weather_presets():
        try:
            return jsonify(load_presets())
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/weather-presets/<preset_id>", methods=["GET"])
    @require_permission("scenarios.read")
    def get_weather_preset(preset_id):
        try:
            preset = next((p for p in load_presets() if p["id"] == preset_id), None)
            if preset:
                return jsonify(preset)
            return jsonify({"error": "Preset not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/weather-presets", methods=["POST"])
    @require_permission("scenarios.create")
    def create_weather_preset():
        try:
            data = request.json
            if not data or not data.get("name") or not data.get("mode"):
                return jsonify({"error": "Missing required fields: name, mode"}), 400

            presets = load_presets()
            now = current_iso_time()
            new_preset = {
                "id": str(uuid.uuid4()),
                "name": data.get("name"),
                "description": data.get("description", ""),
                "mode": data.get("mode"),
                "windDirection": data.get("windDirection"),
                "windSpeedKt": data.get("windSpeedKt"),
                "visibilityM": data.get("visibilityM"),
                "ceilingFt": data.get("ceilingFt"),
                "createdAt": now,
                "updatedAt": now,
            }
            presets.append(new_preset)
            save_presets(presets)
            return jsonify(new_preset), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/weather-presets/<preset_id>", methods=["PUT"])
    @require_permission("scenarios.update")
    def update_weather_preset(preset_id):
        try:
            data = request.json
            if not data:
                return jsonify({"error": "No data provided"}), 400

            presets = load_presets()
            index = next((i for i, p in enumerate(presets) if p["id"] == preset_id), -1)
            if index == -1:
                return jsonify({"error": "Preset not found"}), 404

            preset = presets[index]
            for field in ("name", "description", "mode", "windDirection", "windSpeedKt", "visibilityM", "ceilingFt"):
                if field in data:
                    preset[field] = data[field]
            preset["updatedAt"] = current_iso_time()

            presets[index] = preset
            save_presets(presets)
            return jsonify(preset)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/weather-presets/<preset_id>", methods=["DELETE"])
    @require_permission("scenarios.archive")
    def delete_weather_preset(preset_id):
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
