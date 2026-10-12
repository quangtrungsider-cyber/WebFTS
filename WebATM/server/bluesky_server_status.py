"""
BlueSky server status routes.

This module handles the  monitoring BlueSky servers.
"""

import os
import platform
import socket
import subprocess
import sys
import time

from flask import current_app, jsonify, request

from ..logger import get_logger

logger = get_logger()

# Same two ports used throughout the project's network layer (see CLAUDE.md).
_ENGINE_PORTS = (11000, 11001)


def is_port_listening(port: int, timeout: float = 1.0, hostname: str = None) -> bool:
    """
    Check if a port is listening for connections.

    Args:
        port: Port number to check
        hostname: Hostname to check (defaults to localhost)
        timeout: Connection timeout in seconds

    Returns:
        bool: True if port is listening, False otherwise
    """
    if hostname is None:
        hostname = "localhost"

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((hostname, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def check_bluesky_running() -> tuple[bool, str]:
    """
    Check if BlueSky server is running with improved reliability.

    Returns:
        tuple: (is_running, status_message)
    """

    # Check if BlueSky ports are accessible (same logic as routes.py)
    port_11000_listening = is_port_listening(11000, 0.5)  # Use consistent timeout
    port_11001_listening = is_port_listening(11001, 0.5)  # Use consistent timeout

    if port_11000_listening or port_11001_listening:
        # At least one BlueSky port is listening - server is functional
        ports_info = []
        if port_11000_listening:
            ports_info.append("11000")
        if port_11001_listening:
            ports_info.append("11001")

        return True, f"Server running (Ports: {', '.join(ports_info)})"
    else:
        # No ports are accessible - server is not running or not ready
        return False, "Server not accessible (Ports not listening)"


def _kill_process_on_ports(ports) -> None:
    """Best-effort: terminate whatever process is bound to any of `ports` on
    THIS machine. Only meaningful for a locally auto-managed engine -- never
    called against a remote hostname. Cross-platform (Windows via netstat/
    taskkill, Linux/Mac via fuser -- falls back to lsof if fuser is absent)."""
    if platform.system() == "Windows":
        try:
            out = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True, timeout=5
            ).stdout
        except Exception as e:
            logger.warning(f"netstat failed while looking up engine ports: {e}")
            return
        pids = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0].upper() != "TCP":
                continue
            local = parts[1]
            if any(local.endswith(f":{p}") for p in ports) and parts[3].upper() == "LISTENING":
                pids.add(parts[-1])
        for pid in pids:
            try:
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, timeout=5)
                logger.info(f"Killed engine process PID {pid} (was bound to {ports})")
            except Exception as e:
                logger.warning(f"Failed to kill PID {pid}: {e}")
    else:
        for p in ports:
            try:
                result = subprocess.run(
                    ["fuser", "-k", f"{p}/tcp"], capture_output=True, timeout=5
                )
                if result.returncode == 0:
                    logger.info(f"Killed engine process bound to port {p} (fuser)")
                    continue
            except FileNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"fuser failed for port {p}: {e}")
            try:
                pids = subprocess.run(
                    ["lsof", "-ti", f":{p}"], capture_output=True, text=True, timeout=5
                ).stdout.split()
                for pid in pids:
                    os.kill(int(pid), 9)
                    logger.info(f"Killed engine process PID {pid} (was bound to port {p})")
            except Exception as e:
                logger.warning(f"Failed to kill process on port {p}: {e}")


def _spawn_engine_headless() -> tuple[bool, str]:
    """Launch a fresh `BlueSky.py --headless` the same way main.py's
    auto-start does. Returns (started, message)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    engine_dir = os.path.join(base_dir, "FTS Server")
    engine_script = os.path.join(engine_dir, "BlueSky.py")
    if not os.path.exists(engine_script):
        return False, f"BlueSky.py not found in {engine_dir}"

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        subprocess.Popen([sys.executable, "BlueSky.py", "--headless"], cwd=engine_dir, env=env)
    except Exception as e:
        return False, f"Failed to start engine process: {e}"
    return True, "Engine process started"


def _wait_for_port(port: int, timeout_s: float = 15.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if is_port_listening(port, 1.0):
            return True
        time.sleep(0.5)
    return False


def _reconnect_proxy(server_ip: str) -> tuple[bool, str]:
    """Destroy the current proxy (if any) and build a fresh one connected to
    `server_ip` -- the same teardown/rebuild sequence as
    routes.py::update_server_config, factored out here so both the manual
    Connect flow and the new self-service repair buttons share one
    implementation instead of drifting apart."""
    from ..proxy import BlueSkyProxy, register_subscribers, set_bluesky_proxy

    old_socketio = getattr(current_app, "bluesky_proxy", None) and current_app.bluesky_proxy.socketio
    old_clients = getattr(current_app, "bluesky_proxy", None) and current_app.bluesky_proxy.connected_clients

    if hasattr(current_app, "bluesky_proxy") and current_app.bluesky_proxy.running:
        current_app.bluesky_proxy.stop_client()
        time.sleep(0.3)
    if hasattr(current_app, "bluesky_proxy"):
        current_app.bluesky_proxy.close()
        del current_app.bluesky_proxy

    try:
        current_app.bluesky_proxy = BlueSkyProxy()
        current_app.bluesky_proxy.socketio = old_socketio
        current_app.bluesky_proxy.connected_clients = old_clients or 0
        set_bluesky_proxy(current_app.bluesky_proxy)
    except Exception as e:
        return False, f"Failed to create proxy: {e}"

    current_app.bluesky_proxy.server_ip = server_ip
    try:
        current_app.bluesky_proxy.start_client(hostname=server_ip)
        register_subscribers()
    except Exception as e:
        return False, f"Failed to connect: {e}"
    return True, "Connected"


def register_server_status_routes(app):
    """
    Register BlueSky server status routes with the Flask app.

    Args:
        app: Flask application instance
    """

    @app.route("/api/server/status", methods=["GET", "POST"])
    def get_server_status():
        """
        Get current server status with improved reliability.
        Accepts optional hostname parameter via query string (GET) or JSON body (POST).
        If no hostname provided, uses the currently configured server.
        """
        try:
            # Get hostname from request (supports both GET query param and POST JSON body)
            hostname = None

            if request.method == "POST" and request.json:
                hostname = request.json.get("hostname")
            elif request.method == "GET":
                hostname = request.args.get("hostname")

            # If no hostname specified, use current server IP from proxy
            if not hostname:
                from flask import current_app

                hostname = getattr(current_app.bluesky_proxy, "server_ip", None)

            # If still no hostname, default to localhost
            if not hostname:
                hostname = "localhost"

            # Check both BlueSky ports
            port_11000_listening = is_port_listening(11000, 2.0, hostname)
            port_11001_listening = is_port_listening(11001, 2.0, hostname)
            running = port_11000_listening or port_11001_listening

            if running:
                # At least one BlueSky port is listening - server is functional
                ports_info = []
                if port_11000_listening:
                    ports_info.append("11000")
                if port_11001_listening:
                    ports_info.append("11001")
                message = f"Server running (Ports: {', '.join(ports_info)})"
            else:
                # No ports are accessible - server is not running or not ready
                message = "Server not accessible (Ports not listening)"

            return jsonify(
                {
                    "status": "success",
                    "running": running,
                    "message": message,
                    "hostname": hostname,
                }
            )
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route("/api/server/reconnect", methods=["POST"])
    def reconnect_engine():
        """Lightweight self-service repair: rebuild just the WebATM<->engine
        client/proxy and reconnect, WITHOUT touching the engine process
        itself. Safe to click at any time -- does not affect a running
        simulation on the engine side, only the web app's own connection to
        it. Fixes cases where the client-side proxy got into a bad state
        (e.g. a race between the app's own auto-connect and a manual
        Connect click) but the engine itself is fine."""
        try:
            data = request.json if request.json else {}
            server_ip = (
                data.get("server_ip")
                or getattr(current_app.bluesky_proxy, "server_ip", None)
                or "localhost"
            )
            ok, message = _reconnect_proxy(server_ip)
            return jsonify({"success": ok, "server_ip": server_ip, "message": message}), (200 if ok else 500)
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route("/api/server/restart-engine", methods=["POST"])
    def restart_engine():
        """Stronger self-service repair: kill and relaunch the Vatm-Engine
        (BlueSky) process itself, then reconnect. DESTROYS any scenario
        currently running on the engine -- meant for the case where the
        engine process is genuinely dead/stuck and a lightweight reconnect
        (see /api/server/reconnect) won't help. Only works for an engine
        running on THIS machine (same host as WebATM) -- refuses for a
        remote hostname, since there is no way to kill/relaunch a process on
        a machine WebATM doesn't have access to."""
        try:
            data = request.json if request.json else {}
            server_ip = (
                data.get("server_ip")
                or getattr(current_app.bluesky_proxy, "server_ip", None)
                or "localhost"
            )
            if server_ip not in ("localhost", "127.0.0.1"):
                return jsonify({
                    "success": False,
                    "error": f"Can't restart the engine on a remote host ({server_ip}) -- "
                             "only a locally auto-managed engine can be restarted this way.",
                }), 400

            logger.info("User requested Vatm-Engine restart (destructive: any running scenario is lost)")
            _kill_process_on_ports(_ENGINE_PORTS)
            time.sleep(1.0)

            started, spawn_message = _spawn_engine_headless()
            if not started:
                return jsonify({"success": False, "error": spawn_message}), 500

            if not _wait_for_port(11000, timeout_s=15.0):
                return jsonify({
                    "success": False,
                    "error": "Engine process started but port 11000 never came up within 15s",
                }), 500

            ok, message = _reconnect_proxy(server_ip)
            return jsonify({"success": ok, "server_ip": server_ip, "message": message}), (200 if ok else 500)
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
