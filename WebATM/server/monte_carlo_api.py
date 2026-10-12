"""Monte Carlo analysis module: launches one of two independent headless-
BlueSky batch pipelines (FTS Server/analysis/monte_carlo/ for the P_wake
wake-turbulence study, FTS Server/analysis/monte_carlo_3nm/ for the 3NM/DER
consecutive-departure study) as a separate OS process per job, tracks
progress/results in per-job JSON files, and serves a small REST API for the
web UI. Every function that branches on study type does so via
config["studyType"] ("p_wake" | "3nm_der") -- the job/queue/file mechanics
below are study-type-agnostic so a third study type only needs a new branch
in _validate_and_clamp_payload/_launch_job/the results route, not a new
job-management layer.

Design notes (see plan for full rationale):
- The app runs under gunicorn with the eventlet worker class (WebATM/main.py
  calls eventlet.monkey_patch()), so a real OS subprocess.Popen() is used
  instead of a Python thread -- CPU-bound BlueSky simulation in a
  monkey-patched thread would block the whole server.
- No job queue infra exists elsewhere in this codebase; jobs are dispatched
  lazily ("dispatch-on-read": every GET route call checks whether a queued
  job can start) instead of adding a background scheduler/thread.
- Persistence follows the same file-per-item + atomic-write convention used
  by WebATM/server/atwi_api.py (no database).
"""
import os
import sys
import json
import shutil
import signal
import tempfile
import subprocess
import datetime
import uuid
import importlib.util
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MONTE_CARLO_DIR = _PROJECT_ROOT / "FTS Server" / "analysis" / "monte_carlo"
THREE_NM_DIR = _PROJECT_ROOT / "FTS Server" / "analysis" / "monte_carlo_3nm"
JOBS_DIR = _PROJECT_ROOT / "FTS Server" / "data" / "monte_carlo_jobs"

os.makedirs(JOBS_DIR, exist_ok=True)


def _load_module(unique_name, path):
    """Load a .py file as an isolated module under a unique name, bypassing
    sys.modules -- both study pipelines have their own aggregate.py/
    run_batch.py, and a plain `import aggregate` after inserting both
    directories into sys.path would silently return whichever one was
    imported first for both call sites."""
    spec = importlib.util.spec_from_file_location(unique_name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_pwake_aggregate = _load_module("_mc_pwake_aggregate", MONTE_CARLO_DIR / "aggregate.py")
_3nm_aggregate = _load_module("_mc_3nm_aggregate", THREE_NM_DIR / "aggregate.py")

# job_id -> subprocess.Popen, for the (common) case where the job was
# launched by this same server process and hasn't been polled to
# completion yet. Lost across a server restart -- see _reconcile_job().
_RUNNING_PROCESSES = {}


def _now_iso():
    return datetime.datetime.now().isoformat() + "Z"


def _new_job_id():
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"mc-{ts}-{uuid.uuid4().hex[:6]}"


def _job_dir(job_id):
    return JOBS_DIR / job_id


def _atomic_write_json(path, data):
    d = os.path.dirname(str(path)) or "."
    with tempfile.NamedTemporaryFile("w", dir=d, delete=False, encoding="utf-8") as tf:
        json.dump(data, tf, ensure_ascii=False, indent=2)
        tmp_name = tf.name
    os.replace(tmp_name, str(path))


def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _validate_and_clamp_payload(body):
    label = (body.get("label") or "").strip() or "Untitled run"
    study_type = (body.get("studyType") or "p_wake").strip()
    if study_type not in ("p_wake", "3nm_der"):
        return None, "studyType must be 'p_wake' or '3nm_der'"

    try:
        n_runs = int(body.get("nRuns", 1000))
    except (TypeError, ValueError):
        return None, "nRuns must be an integer"
    n_runs = max(10, min(5000, n_runs))

    try:
        n_workers = int(body.get("nWorkers", 8))
    except (TypeError, ValueError):
        return None, "nWorkers must be an integer"
    n_workers = max(1, min(os.cpu_count() or 8, n_workers))

    config = {"label": label, "studyType": study_type, "nRuns": n_runs, "nWorkers": n_workers}

    if study_type == "p_wake":
        aircraft_type = (body.get("aircraftType") or "").strip().upper()
        if not aircraft_type:
            return None, "aircraftType is required"

        try:
            p_wake_nm = float(body.get("pWakeNm", 6.065))
        except (TypeError, ValueError):
            return None, "pWakeNm must be a number"
        if not (0 < p_wake_nm <= 50):
            return None, "pWakeNm must be between 0 and 50 NM"

        config["aircraftType"] = aircraft_type
        config["pWakeNm"] = p_wake_nm
    else:  # 3nm_der
        raw_m = body.get("mCandidates", [0.8, 1.2, 1.6])
        try:
            m_candidates = [float(x) for x in raw_m]
        except (TypeError, ValueError):
            return None, "mCandidates must be a list of numbers"
        if not m_candidates or any(not (0 < m <= 10) for m in m_candidates):
            return None, "mCandidates must be 1-10 positive values (NM from DER), each <=10"

        try:
            t_delay_min = float(body.get("tDelayMinS", 3.0))
            t_delay_max = float(body.get("tDelayMaxS", 8.0))
        except (TypeError, ValueError):
            return None, "tDelayMinS/tDelayMaxS must be numbers"
        if not (0 <= t_delay_min < t_delay_max <= 60):
            return None, "T_delay range must satisfy 0 <= min < max <= 60 seconds"

        if not (THREE_NM_DIR / "results" / "fleet_ranking.json").exists():
            return None, (
                "Fleet ranking not yet computed for the 3NM/DER study -- "
                "run 'python fleet_ranking.py' once via CLI in analysis/monte_carlo_3nm/ first"
            )

        config["mCandidates"] = sorted(m_candidates)
        config["tDelayMinS"] = t_delay_min
        config["tDelayMaxS"] = t_delay_max

    return config, None


def _list_job_ids_sorted():
    """Job ids sort chronologically because the id is timestamp-prefixed."""
    if not JOBS_DIR.exists():
        return []
    return sorted(p.name for p in JOBS_DIR.iterdir() if p.is_dir())


def _reconcile_job(job_id, status):
    """If status.json still says 'running', check whether the underlying
    process has actually finished (or died/orphaned) and update status.json
    accordingly. Returns the (possibly updated) status dict."""
    if status.get("status") != "running":
        return status

    jdir = _job_dir(job_id)
    proc = _RUNNING_PROCESSES.get(job_id)
    still_running = False
    if proc is not None:
        still_running = proc.poll() is None
        if not still_running:
            _RUNNING_PROCESSES.pop(job_id, None)

    if still_running:
        return status

    # Process is not tracked in memory (e.g. server restarted) or has
    # exited. Either way, decide completed vs failed by whether results
    # were actually written.
    if (jdir / "results.json").exists():
        status["status"] = "completed"
    else:
        status["status"] = "failed"
        status["error"] = status.get("error") or (
            "Process exited without producing results.json "
            "(orphaned by a server restart, or crashed -- check stdout.log)"
        )
    status["completedAt"] = status.get("completedAt") or _now_iso()
    _atomic_write_json(jdir / "status.json", status)
    return status


def _launch_job(job_id):
    jdir = _job_dir(job_id)
    config = _read_json(jdir / "config.json", {})
    results_path = jdir / "results.json"
    progress_path = jdir / "progress.json"
    stdout_path = jdir / "stdout.log"
    study_type = config.get("studyType", "p_wake")

    if study_type == "3nm_der":
        cwd = THREE_NM_DIR
        m_candidates = config.get("mCandidates", [0.8, 1.2, 1.6])
        argv = [
            sys.executable, "run_batch.py",
            "--n-runs", str(config.get("nRuns", 1000)),
            "--n-workers", str(config.get("nWorkers", 8)),
            "--out-file", str(results_path),
            "--status-file", str(progress_path),
            "--m-candidates", ",".join(str(m) for m in m_candidates),
            "--t-delay-min", str(config.get("tDelayMinS", 3.0)),
            "--t-delay-max", str(config.get("tDelayMaxS", 8.0)),
        ]
    else:
        cwd = MONTE_CARLO_DIR
        argv = [
            sys.executable, "run_batch.py",
            "--n-runs", str(config.get("nRuns", 1000)),
            "--n-workers", str(config.get("nWorkers", 8)),
            "--out-file", str(results_path),
            "--status-file", str(progress_path),
            "--aircraft-type", str(config.get("aircraftType", "B773")),
            "--p-wake-nm", str(config.get("pWakeNm", 6.065)),
        ]

    log_f = open(stdout_path, "w", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            argv, cwd=str(cwd), stdout=log_f, stderr=subprocess.STDOUT,
        )
    finally:
        log_f.close()  # child holds its own duplicated fd

    _RUNNING_PROCESSES[job_id] = proc

    status = _read_json(jdir / "status.json", {})
    status["status"] = "running"
    status["startedAt"] = _now_iso()
    status["pid"] = proc.pid
    _atomic_write_json(jdir / "status.json", status)


def _dispatch_next_if_idle():
    """Reconcile every job's status, then -- if nothing is currently
    running -- launch the oldest queued job. Called at the top of every
    GET/POST route so the FIFO queue advances purely from normal polling
    traffic, with no separate background scheduler thread."""
    job_ids = _list_job_ids_sorted()
    running_exists = False
    queued_ids = []
    for job_id in job_ids:
        status = _read_json(_job_dir(job_id) / "status.json", None)
        if status is None:
            continue
        status = _reconcile_job(job_id, status)
        if status.get("status") == "running":
            running_exists = True
        elif status.get("status") == "queued":
            queued_ids.append(job_id)

    if running_exists or not queued_ids:
        return
    _launch_job(queued_ids[0])


def _queue_position(job_id):
    """1-based position of a queued job among other queued jobs (oldest
    queued job = position 1, i.e. next to run)."""
    job_ids = _list_job_ids_sorted()
    queued_ids = [
        jid for jid in job_ids
        if _read_json(_job_dir(jid) / "status.json", {}).get("status") == "queued"
    ]
    try:
        return queued_ids.index(job_id) + 1
    except ValueError:
        return None


def _job_summary(job_id):
    jdir = _job_dir(job_id)
    config = _read_json(jdir / "config.json", {})
    status = _read_json(jdir / "status.json", {})
    progress = _read_json(jdir / "progress.json", {"done": 0, "total": config.get("nRuns", 0)})
    return {
        "jobId": job_id,
        "label": config.get("label"),
        "studyType": config.get("studyType", "p_wake"),
        "aircraftType": config.get("aircraftType"),  # only set for p_wake jobs
        "mCandidates": config.get("mCandidates"),  # only set for 3nm_der jobs
        "nRuns": config.get("nRuns"),
        "status": status.get("status"),
        "createdAt": status.get("createdAt"),
        "startedAt": status.get("startedAt"),
        "completedAt": status.get("completedAt"),
        "progress": progress,
    }


def register_monte_carlo_routes(app):
    """Register all Monte Carlo routes in the Flask application."""

    @app.route("/api/monte-carlo/jobs", methods=["GET"])
    @require_permission("monte_carlo.read")
    def list_monte_carlo_jobs():
        try:
            _dispatch_next_if_idle()
            job_ids = _list_job_ids_sorted()
            job_ids.reverse()  # newest first for history display
            return jsonify([_job_summary(jid) for jid in job_ids]), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/monte-carlo/jobs", methods=["POST"])
    @require_permission("monte_carlo.create")
    def create_monte_carlo_job():
        try:
            body = request.json or {}
            config, err = _validate_and_clamp_payload(body)
            if err:
                return jsonify({"error": err}), 400

            job_id = _new_job_id()
            jdir = _job_dir(job_id)
            os.makedirs(jdir, exist_ok=True)

            now = _now_iso()
            config["jobId"] = job_id
            _atomic_write_json(jdir / "config.json", config)
            _atomic_write_json(jdir / "status.json", {
                "status": "queued", "createdAt": now,
                "startedAt": None, "completedAt": None, "pid": None, "error": None,
            })

            _dispatch_next_if_idle()

            final_status = _read_json(jdir / "status.json", {})
            return jsonify({"jobId": job_id, "status": final_status.get("status")}), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/monte-carlo/jobs/<job_id>", methods=["GET"])
    @require_permission("monte_carlo.read")
    def get_monte_carlo_job(job_id):
        try:
            _dispatch_next_if_idle()
            jdir = _job_dir(job_id)
            if not jdir.exists():
                return jsonify({"error": "Job not found"}), 404

            config = _read_json(jdir / "config.json", {})
            status = _read_json(jdir / "status.json", {})
            progress = _read_json(jdir / "progress.json", {"done": 0, "total": config.get("nRuns", 0)})
            queue_position = _queue_position(job_id) if status.get("status") == "queued" else None

            return jsonify({
                "jobId": job_id,
                "config": config,
                "status": status.get("status"),
                "createdAt": status.get("createdAt"),
                "startedAt": status.get("startedAt"),
                "completedAt": status.get("completedAt"),
                "error": status.get("error"),
                "progress": progress,
                "queuePosition": queue_position,
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/monte-carlo/jobs/<job_id>/results", methods=["GET"])
    @require_permission("monte_carlo.read")
    def get_monte_carlo_job_results(job_id):
        try:
            jdir = _job_dir(job_id)
            if not jdir.exists():
                return jsonify({"error": "Job not found"}), 404

            status = _read_json(jdir / "status.json", {})
            if status.get("status") != "completed":
                return jsonify({"error": f"Job status is '{status.get('status')}', not completed yet"}), 404

            results_path = jdir / "results.json"
            if not results_path.exists():
                return jsonify({"error": "Results file missing"}), 404

            config = _read_json(jdir / "config.json", {})
            study_type = config.get("studyType", "p_wake")

            with open(results_path, "r", encoding="utf-8") as f:
                results = json.load(f)

            if study_type == "3nm_der":
                summary = _3nm_aggregate.summarize(results)
            else:
                summary = _pwake_aggregate.summarize_results(results)

            return jsonify({
                "jobId": job_id,
                "config": config,
                "studyType": study_type,
                "summary": summary,
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/monte-carlo/jobs/<job_id>/cancel", methods=["POST"])
    @require_permission("monte_carlo.cancel")
    def cancel_monte_carlo_job(job_id):
        try:
            jdir = _job_dir(job_id)
            if not jdir.exists():
                return jsonify({"error": "Job not found"}), 404

            status = _read_json(jdir / "status.json", {})
            if status.get("status") not in ("running", "queued"):
                return jsonify({"jobId": job_id, "status": status.get("status")}), 200  # idempotent

            proc = _RUNNING_PROCESSES.pop(job_id, None)
            if proc is not None:
                try:
                    proc.terminate()
                except Exception:
                    pass
            elif status.get("pid"):
                try:
                    os.kill(status["pid"], signal.SIGTERM)
                except Exception:
                    pass

            status["status"] = "cancelled"
            status["completedAt"] = _now_iso()
            _atomic_write_json(jdir / "status.json", status)

            _dispatch_next_if_idle()
            return jsonify({"jobId": job_id, "status": "cancelled"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/monte-carlo/jobs/<job_id>", methods=["DELETE"])
    @require_permission("monte_carlo.cancel")
    def delete_monte_carlo_job(job_id):
        try:
            jdir = _job_dir(job_id)
            if not jdir.exists():
                return jsonify({"error": "Job not found"}), 404

            status = _read_json(jdir / "status.json", {})
            if status.get("status") == "running":
                return jsonify({"error": "Cannot delete a running job. Cancel it first."}), 409

            shutil.rmtree(jdir)
            return jsonify({"success": True}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
