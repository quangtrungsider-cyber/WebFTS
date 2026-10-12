import os
import json
import re
import shutil
import datetime
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission

BASE_RESULTS_DIR = Path("FTS Server/simulation_results")

# Ensure base directory exists
os.makedirs(BASE_RESULTS_DIR, exist_ok=True)

# Regex to validate recordingId
RECORDING_ID_PATTERN = re.compile(r"^recording_\d{8}_\d{6}(_[a-zA-Z0-9]+)?$")

def safe_resolve_recording_path(recording_id: str) -> Path:
    """Validate recordingId against directory traversal and secure formats."""
    if not recording_id:
        raise ValueError("Recording ID is missing.")
    if ".." in recording_id or "/" in recording_id or "\\" in recording_id:
        raise ValueError("Invalid characters detected in Recording ID.")
    if not RECORDING_ID_PATTERN.match(recording_id):
        raise ValueError("Recording ID must match the required pattern.")
    
    # Resolve and ensure it remains strictly inside the BASE_RESULTS_DIR
    target_dir = (BASE_RESULTS_DIR / recording_id).resolve()
    base_dir = BASE_RESULTS_DIR.resolve()
    
    if not str(target_dir).startswith(str(base_dir)):
        raise ValueError("Path traversal attempt detected.")
        
    return target_dir

def append_jsonl(file_path: Path, data_list: list):
    """Safely append a list of dicts to a JSONL file."""
    os.makedirs(file_path.parent, exist_ok=True)
    with open(file_path, "a", encoding="utf-8") as f:
        for item in data_list:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

def read_jsonl(file_path: Path) -> list:
    """Read a JSONL file and return as list of dicts."""
    if not file_path.exists():
        return []
    results = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return results

def count_jsonl_lines(file_path: Path) -> int:
    """Count non-empty lines in a JSONL file quickly."""
    if not file_path.exists():
        return 0
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return sum(1 for line in f if line.strip())
    except Exception:
        return 0

def register_recordings_routes(app):
    @app.route("/api/recordings", methods=["POST"])
    @require_permission("simulation.recording_start")
    def create_recording():
        try:
            body = request.json or {}
            
            # Generate YYYYMMDD_HHMMSS timestamp
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            recording_id = f"recording_{timestamp}"
            
            # Ensure uniqueness
            target_dir = BASE_RESULTS_DIR / recording_id
            counter = 1
            while target_dir.exists():
                recording_id = f"recording_{timestamp}_{counter}"
                target_dir = BASE_RESULTS_DIR / recording_id
                counter += 1
                
            os.makedirs(target_dir, exist_ok=True)
            
            started_at = datetime.datetime.now().isoformat() + "Z"
            
            metadata = {
                "recordingId": recording_id,
                "runId": f"run_{timestamp}",
                "studyId": body.get("studyId"),
                "scenarioId": body.get("scenarioId"),
                "scenarioName": body.get("scenarioName"),
                "scenarioFileName": body.get("scenarioFileName"),
                "scenarioBaseName": body.get("scenarioBaseName"),
                "icCommand": body.get("icCommand"),
                "route": body.get("route", "/simulations/live"),
                "status": "recording",
                "startedAt": started_at,
                "stoppedAt": None,
                "savedAt": None,
                "softwareVersion": "dev",
                "watermark": "Decision-support / Non-operational",
                "limitations": [
                    "Fast-time simulation recording for decision-support only.",
                    "Not an operational ATC tool.",
                    "Not for individual controller performance assessment.",
                    "Not a safety approval or automatic Means of Compliance."
                ],
                "postRunAnalyticsStatus": "not_started"
            }
            
            # Save run_metadata.json
            metadata_file = target_dir / "run_metadata.json"
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
                
            # Create empty .jsonl files
            for filename in ["replay_track.jsonl", "event_log.jsonl", "command_log.jsonl", "conflict_log.jsonl"]:
                open(target_dir / filename, "w", encoding="utf-8").close()
                
            return jsonify({
                "recordingId": recording_id,
                "metadata": metadata,
                "outputFolder": str(target_dir)
            }), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/samples", methods=["POST"])
    @require_permission("simulation.recording_start")
    def append_samples(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording session not found"}), 404
                
            body = request.json or {}
            samples = body.get("samples", [])
            
            if len(samples) > 10000:
                return jsonify({"error": "Batch exceeds maximum allowed limit of 10000 samples"}), 413
                
            if samples:
                append_jsonl(target_dir / "replay_track.jsonl", samples)
                
            return jsonify({
                "recordingId": recording_id,
                "appended": len(samples)
            }), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/events", methods=["POST"])
    @require_permission("simulation.recording_start")
    def append_events(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording session not found"}), 404
                
            body = request.json or {}
            events = body.get("events", [])
            
            if len(events) > 10000:
                return jsonify({"error": "Batch exceeds maximum allowed limit of 10000 events"}), 413
                
            if events:
                append_jsonl(target_dir / "event_log.jsonl", events)
                
            return jsonify({
                "recordingId": recording_id,
                "appended": len(events)
            }), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/commands", methods=["POST"])
    @require_permission("simulation.recording_start")
    def append_commands(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording session not found"}), 404
                
            body = request.json or {}
            commands = body.get("commands", [])
            
            if len(commands) > 10000:
                return jsonify({"error": "Batch exceeds maximum allowed limit of 10000 commands"}), 413
                
            if commands:
                append_jsonl(target_dir / "command_log.jsonl", commands)
                
            return jsonify({
                "recordingId": recording_id,
                "appended": len(commands)
            }), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/conflicts", methods=["POST"])
    @require_permission("simulation.recording_start")
    def append_conflicts(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording session not found"}), 404
                
            body = request.json or {}
            conflicts = body.get("conflicts", [])
            
            if len(conflicts) > 10000:
                return jsonify({"error": "Batch exceeds maximum allowed limit of 10000 conflicts"}), 413
                
            if conflicts:
                append_jsonl(target_dir / "conflict_log.jsonl", conflicts)
                
            return jsonify({
                "recordingId": recording_id,
                "appended": len(conflicts)
            }), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/stop", methods=["POST"])
    @require_permission("simulation.recording_stop")
    def stop_recording(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording session not found"}), 404
                
            metadata_file = target_dir / "run_metadata.json"
            if not metadata_file.exists():
                return jsonify({"error": "Metadata file not found"}), 404
                
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
                
            metadata["status"] = "stopped"
            metadata["stoppedAt"] = datetime.datetime.now().isoformat() + "Z"
            metadata["savedAt"] = datetime.datetime.now().isoformat() + "Z"
            
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
                
            return jsonify(metadata), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings", methods=["GET"])
    @require_permission("replay.read")
    def list_recordings():
        try:
            recordings = []
            for p in BASE_RESULTS_DIR.iterdir():
                if p.is_dir() and RECORDING_ID_PATTERN.match(p.name):
                    metadata_file = p / "run_metadata.json"
                    if metadata_file.exists():
                        try:
                            with open(metadata_file, "r", encoding="utf-8") as f:
                                metadata = json.load(f)
                            
                            # Count samples, events, commands, and conflicts
                            metadata["sampleCount"] = count_jsonl_lines(p / "replay_track.jsonl")
                            metadata["eventCount"] = count_jsonl_lines(p / "event_log.jsonl")
                            metadata["commandCount"] = count_jsonl_lines(p / "command_log.jsonl")
                            metadata["conflictCount"] = count_jsonl_lines(p / "conflict_log.jsonl")
                            
                            recordings.append(metadata)
                        except Exception:
                            continue
                            
            # Sort by startedAt or folder name descending (newest first)
            recordings.sort(key=lambda r: r.get("startedAt", ""), reverse=True)
            return jsonify(recordings), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>", methods=["DELETE"])
    @require_permission("simulation.recording_delete")
    def delete_recording(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            if not target_dir.exists():
                return jsonify({"error": "Recording not found"}), 404

            shutil.rmtree(target_dir)
            return jsonify({"recordingId": recording_id, "deleted": True}), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>", methods=["GET"])
    @require_permission("replay.read")
    def get_recording(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            metadata_file = target_dir / "run_metadata.json"
            if not metadata_file.exists():
                return jsonify({"error": "Recording not found"}), 404
                
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
                
            return jsonify(metadata), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/replay-track", methods=["GET"])
    @require_permission("replay.read")
    def get_replay_track(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            samples = read_jsonl(target_dir / "replay_track.jsonl")
            return jsonify(samples), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/events", methods=["GET"])
    @require_permission("replay.read")
    def get_recording_events(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            events = read_jsonl(target_dir / "event_log.jsonl")
            return jsonify(events), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/commands", methods=["GET"])
    @require_permission("replay.read")
    def get_recording_commands(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            commands = read_jsonl(target_dir / "command_log.jsonl")
            return jsonify(commands), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/conflicts", methods=["GET"])
    @require_permission("replay.read")
    def get_recording_conflicts(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            conflicts = read_jsonl(target_dir / "conflict_log.jsonl")
            return jsonify(conflicts), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recordings/<recording_id>/replay-dataset", methods=["GET"])
    @require_permission("replay.read")
    def get_replay_dataset(recording_id):
        try:
            target_dir = safe_resolve_recording_path(recording_id)
            metadata_file = target_dir / "run_metadata.json"
            if not metadata_file.exists():
                return jsonify({"error": "Recording not found"}), 404
                
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
                
            samples = read_jsonl(target_dir / "replay_track.jsonl")
            events = read_jsonl(target_dir / "event_log.jsonl")
            commands = read_jsonl(target_dir / "command_log.jsonl")
            conflicts = read_jsonl(target_dir / "conflict_log.jsonl")
            
            # Enrich metadata with counts
            metadata["sampleCount"] = len(samples)
            metadata["eventCount"] = len(events)
            metadata["commandCount"] = len(commands)
            metadata["conflictCount"] = len(conflicts)
            
            return jsonify({
                "metadata": metadata,
                "trackSamples": samples,
                "events": events,
                "commands": commands,
                "conflicts": conflicts
            }), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500
