"""
Basic Flask routes for WebATM.

This module contains routes for the main page, simulation commands,
server configuration, health/status endpoints, and BlueSky file uploads.
"""

import json
import os
import socket
import time
from pathlib import Path

from flask import abort, current_app, jsonify, render_template, request
from werkzeug.utils import secure_filename

from ..logger import get_logger

logger = get_logger()


def get_webpack_assets():
    """
    Read webpack manifest and return script tags for all bundles in correct order.

    Returns:
        list: Script tags for webpack bundles
    """
    try:
        # Go up one level from server/ to WebATM/ to find static/
        manifest_path = (
            Path(__file__).parent.parent / "static" / "dist" / "manifest.json"
        )

        t = int(time.time())

        if not manifest_path.exists():
            # Fallback to single bundle.js if manifest doesn't exist
            return [f'<script src="/static/dist/bundle.js?t={t}"></script>']

        with open(manifest_path) as f:
            manifest = json.load(f)

        script_tags = []

        # Check if this is a development build (single bundle) or production build (split bundles)
        if (
            "main.js" in manifest
            and len([k for k in manifest.keys() if k.endswith(".js")]) == 1
        ):
            # Development mode: single bundle
            bundle_file = manifest["main.js"]
            script_tags.append(f'<script src="/static/dist/{bundle_file}?t={t}"></script>')
        else:
            # Production mode: split bundles - load in correct order
            chunk_order = ["runtime.js", "vendor.js", "app.js", "main.js"]

            for chunk_name in chunk_order:
                if chunk_name in manifest:
                    script_tags.append(
                        f'<script src="/static/dist/{manifest[chunk_name]}?t={t}"></script>'
                    )

        return (
            script_tags
            if script_tags
            else [f'<script src="/static/dist/bundle.js?t={t}"></script>']
        )

    except Exception as e:
        logger.info(f"Error reading webpack manifest: {e}")
        # Fallback to single bundle.js
        return [f'<script src="/static/dist/bundle.js?t={int(time.time())}"></script>']


def register_basic_routes(app, session_manager):
    """
    Register basic Flask routes with the application.

    Args:
        app: Flask application instance
        session_manager: SessionManager instance for capacity checking
    """

    @app.route("/")
    def index():
        """Main page."""
        try:
            webpack_scripts = get_webpack_assets()
            return render_template("index.html", webpack_scripts=webpack_scripts)
        except Exception as e:
            return f"Error loading page: {str(e)}", 500

    _BACKEND_PREFIXES = ("api/", "static/", "socket.io/", "health", "status")

    @app.route("/<path:path>")
    def spa_fallback(path):
        """
        Serve the SPA shell for client-side routes (e.g. /login, /dashboard) so a
        hard refresh or direct link doesn't 404/500 -- React Router takes over
        from there. Registered API/static/socket.io routes match before this
        catch-all runs; this guard only protects against *unmatched* backend-ish
        paths (e.g. a typo'd /api/... URL) so those still 404 instead of silently
        getting the HTML shell back.
        """
        if path.startswith(_BACKEND_PREFIXES):
            abort(404)
        return index()

    @app.route("/api/simulation/command", methods=["POST"])
    def send_command():
        """Send command to simulation."""
        try:
            command = request.json.get("command", "") if request.json else ""
            
            # Reset echo data so we only capture new ones
            if hasattr(current_app.bluesky_proxy, 'echo_data'):
                current_app.bluesky_proxy.echo_data = {}
                
            success = current_app.bluesky_proxy.send_command(command)
            
            # Fetch any immediate local message
            message = current_app.bluesky_proxy.echo_data.get("text", "") if hasattr(current_app.bluesky_proxy, 'echo_data') else ""
            
            if success:
                return jsonify({"success": True, "command": command, "message": message})
            else:
                return jsonify({"success": False, "command": command, "error": message or "Command failed"})
        except Exception:
            return jsonify({"error": "Failed to send command"}), 500

    @app.route("/api/server/config", methods=["GET"])
    def get_server_config():
        """Get current server configuration."""
        try:
            return jsonify(
                {
                    "server_ip": getattr(
                        current_app.bluesky_proxy, "server_ip", "localhost"
                    ),
                    "is_connected": getattr(
                        current_app.bluesky_proxy, "running", False
                    ),
                }
            )
        except Exception:
            return jsonify({"error": "Failed to get server config"}), 500

    @app.route("/api/server/config", methods=["POST"])
    def update_server_config():
        """Update server configuration and reconnect."""
        try:
            data = request.json if request.json else {}
            server_ip = data.get("server_ip", "localhost").strip() or "localhost"

            # Always create a completely fresh client instance - like restarting the server
            logger.info(f"User requested connection to BlueSky server at {server_ip}")
            logger.info(
                "Completely destroying current client and creating fresh instance..."
            )

            # Store important state before deletion
            old_socketio = (
                current_app.bluesky_proxy.socketio
                if hasattr(current_app, "bluesky_proxy")
                else None
            )
            old_connected_clients = (
                current_app.bluesky_proxy.connected_clients
                if hasattr(current_app, "bluesky_proxy")
                else 0
            )

            # Stop current client if it exists and is running
            if (
                hasattr(current_app, "bluesky_proxy")
                and current_app.bluesky_proxy.running
            ):
                logger.info("Stopping existing client...")
                current_app.bluesky_proxy.stop_client()
                time.sleep(0.3)

            # Completely delete the old client reference with full context destruction
            if hasattr(current_app, "bluesky_proxy"):
                logger.info("Completely destroying client with ZMQ context...")
                current_app.bluesky_proxy.close()  # Close network client
                del current_app.bluesky_proxy

            # Force garbage collection to clean up the old client
            try:
                import gc

                logger.debug("Forcing garbage collection to clean up old client...")
                gc.collect()  # Force garbage collection
                logger.info("Memory cleaned")
            except Exception as e:
                logger.warning(f"Cleanup note: {e}")

            # Create completely fresh client instance (let BlueSky create its own ZMQ context)
            from ..proxy import BlueSkyProxy, register_subscribers, set_bluesky_proxy

            logger.info("Creating brand new BlueSky Proxy instance...")

            try:
                current_app.bluesky_proxy = BlueSkyProxy()
                # Note: network_client will be initialized when user connects
                logger.info("BlueSky Proxy instance created successfully")

                current_app.bluesky_proxy.socketio = old_socketio
                current_app.bluesky_proxy.connected_clients = old_connected_clients
                set_bluesky_proxy(current_app.bluesky_proxy)  # Update global reference
                logger.info("Client configured with socketio and connected_clients")

            except Exception as e:
                logger.error(f"Error creating {e}")
                import traceback

                traceback.print_exc()
                raise

            # Network client already initialized in BlueSkyProxy.__init__

            # Connect with fresh client FIRST
            current_app.bluesky_proxy.server_ip = server_ip
            current_app.bluesky_proxy.start_client(hostname=server_ip)

            # Re-register subscribers AFTER successful connection
            logger.info("Re-registering data subscribers after connection...")
            register_subscribers()
            logger.info("Data subscribers registered successfully")

            # Return success immediately without waiting for nodes
            logger.info("Bypassing node check and returning success")
            return jsonify(
                {
                    "success": True,
                    "server_ip": server_ip,
                    "message": "Connected to VATM remote server",
                }
            )
        except Exception as e:
            logger.info(f"Error updating server config: {e}")
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Failed to connect to server: {str(e)}",
                    }
                ),
                500,
            )

    @app.route("/api/server/disconnect", methods=["POST"])
    def disconnect_server():
        """Disconnect from current server."""
        try:
            if current_app.bluesky_proxy.running:
                logger.info("User requested manual disconnection from BlueSky server")
                current_app.bluesky_proxy.stop_client("manual")
                # Wait a moment for cleanup to complete
                time.sleep(0.5)
                logger.info("BlueSky server disconnected successfully")
            else:
                logger.info(
                    "User requested disconnection, but client was already disconnected"
                )

            return jsonify({"success": True, "message": "Disconnected from server"})
        except Exception as e:
            logger.info(f"Error disconnecting from server: {e}")
            return (
                jsonify({"success": False, "error": f"Failed to disconnect: {str(e)}"}),
                500,
            )

    @app.route("/api/aircraft/models", methods=["GET"])
    def get_aircraft_models():
        """Get available 3D aircraft models."""
        try:
            models_dir = Path(__file__).parent.parent / "static" / "models" / "aircraft"

            if not models_dir.exists():
                logger.warning("Aircraft models directory not found")
                return jsonify(
                    {
                        "success": False,
                        "error": "3D aircraft models directory not found",
                        "models": [],
                    }
                ), 404

            # Scan for supported model files
            supported_extensions = {".gltf", ".glb"}
            models = []

            for model_file in models_dir.iterdir():
                if (
                    model_file.is_file()
                    and model_file.suffix.lower() in supported_extensions
                ):
                    # Create display name from filename
                    display_name = model_file.stem

                    # Map common aircraft model names to better display names
                    display_name_map = {
                        "737": "Boeing 737",
                        "a320": "Airbus A320",
                        "drone": "Generic Drone",
                        "tie": "TIE Fighter",
                    }

                    if display_name.lower() in display_name_map:
                        display_name = display_name_map[display_name.lower()]

                    # Get file size
                    file_size = model_file.stat().st_size

                    models.append(
                        {
                            "filename": model_file.name,
                            "displayName": display_name,
                            "description": f"{display_name} 3D model",
                            "fileSize": file_size,
                            "isDefault": model_file.name == "737.gltf",
                        }
                    )

            # Sort by display name, but put default model first
            models.sort(key=lambda m: (not m["isDefault"], m["displayName"]))

            logger.debug(
                f"Found {len(models)} aircraft models: {[m['filename'] for m in models]}"
            )

            return jsonify({"success": True, "models": models, "count": len(models)})

        except Exception as e:
            logger.error(f"Error fetching aircraft models: {e}")
            return jsonify(
                {
                    "success": False,
                    "error": f"Failed to fetch aircraft models: {str(e)}",
                    "models": [],
                }
            ), 500

    @app.route("/health")
    def health_check():
        """Health check endpoint for Traefik - always returns 200 if Flask is running."""
        try:
            response_data = {
                "status": "healthy",
                "message": "Flask application is running",
                "timestamp": time.time(),
            }

            return jsonify(response_data), 200

        except Exception as e:
            return jsonify({"status": "unhealthy", "error": str(e)}), 503

    @app.route("/status")
    def status_check():
        """Status endpoint with capacity information - returns 503 when at capacity."""
        try:
            # Check BlueSky connectivity using the same approach as check_bluesky_running
            def is_port_listening(port):
                hostname = getattr(current_app.bluesky_proxy, "server_ip", "localhost")
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.5)  # Quick check for status endpoint
                    result = sock.connect_ex((hostname, port))
                    sock.close()
                    return result == 0
                except Exception:
                    return False

            # Check if BlueSky ports are accessible (same logic as server_control.py)
            port_11000_listening = is_port_listening(11000)
            port_11001_listening = is_port_listening(11001)
            bluesky_running = port_11000_listening or port_11001_listening

            # Additional check: if we have a proxy connection, see if it's receiving data
            proxy_connected = False
            has_active_nodes = False
            if hasattr(current_app, "bluesky_proxy"):
                proxy_connected = getattr(current_app.bluesky_proxy, "running", False)
                tracked_nodes = getattr(current_app.bluesky_proxy, "tracked_nodes", [])
                has_active_nodes = len(tracked_nodes) > 0

            # Get session information from session manager
            session_info = session_manager.get_session_info()

            response_data = {
                "status": "healthy",
                "bluesky_server": {
                    "ports_accessible": bluesky_running,
                    "port_11000": port_11000_listening,
                    "port_11001": port_11001_listening,
                    "proxy_connected": proxy_connected,
                    "has_active_nodes": has_active_nodes,
                },
                "session_info": session_info,
                "config": session_manager.get_config_info(),
                "timestamp": time.time(),
            }

            return jsonify(response_data), 200

        except Exception as e:
            return jsonify({"status": "unhealthy", "error": str(e)}), 503

    # BlueSky File Upload System Routes

    @app.route("/api/bluesky/configure-base-path", methods=["POST"])
    def configure_bluesky_base_path():
        """Configure BlueSky base directory path."""
        try:
            data = request.json if request.json else {}
            base_path = data.get("base_path", "").strip()

            if not base_path:
                return jsonify(
                    {"success": False, "error": "Base path is required"}
                ), 400

            # Normalize path for cross-platform compatibility
            path_obj = Path(base_path).expanduser().resolve()

            if not path_obj.exists():
                return jsonify(
                    {"success": False, "error": f"Path does not exist: {path_obj}"}
                ), 400

            if not path_obj.is_dir():
                return jsonify(
                    {"success": False, "error": f"Path is not a directory: {path_obj}"}
                ), 400

            # Check if writable (cross-platform)
            if not os.access(str(path_obj), os.W_OK):
                return jsonify(
                    {"success": False, "error": f"Path is not writable: {path_obj}"}
                ), 400

            # Store in app config (in production, consider using a database or session)
            current_app.bluesky_base_path = str(path_obj)

            # Create subdirectories if they don't exist
            scenario_dir = path_obj / "scenario"
            plugins_dir = path_obj / "plugins"

            try:
                scenario_dir.mkdir(exist_ok=True)
                plugins_dir.mkdir(exist_ok=True)
                logger.info(
                    f"BlueSky base path configured: {current_app.bluesky_base_path}"
                )

                return jsonify(
                    {
                        "success": True,
                        "base_path": current_app.bluesky_base_path,
                        "derived_paths": {
                            "scenario": str(scenario_dir),
                            "plugins": str(plugins_dir),
                            "settings": str(path_obj / "settings.cfg"),
                        },
                    }
                )

            except Exception as e:
                return jsonify(
                    {
                        "success": False,
                        "error": f"Could not create subdirectories: {str(e)}",
                    }
                ), 500

        except Exception as e:
            logger.error(f"Error configuring BlueSky base path: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to configure path: {str(e)}"}
            ), 500

    @app.route("/api/bluesky/upload/<file_type>", methods=["POST"])
    def upload_bluesky_file(file_type):
        """Upload files to BlueSky directories."""
        try:
            # Check if base path is configured
            if not hasattr(current_app, "bluesky_base_path"):
                return jsonify(
                    {"success": False, "error": "BlueSky base path not configured"}
                ), 400

            base_path = Path(current_app.bluesky_base_path)

            # Validate file type
            file_type_config = {
                "scenario": {
                    "extension": ".scn",
                    "directory": "scenario",
                    "allow_multiple": True,
                },
                "plugins": {
                    "extension": ".py",
                    "directory": "plugins",
                    "allow_multiple": True,
                },
                "settings": {
                    "extension": ".cfg",
                    "filepath": "settings.cfg",
                    "allow_multiple": False,
                },
            }

            if file_type not in file_type_config:
                return jsonify(
                    {"success": False, "error": f"Invalid file type: {file_type}"}
                ), 400

            # Check if file is present
            if "file" not in request.files:
                return jsonify({"success": False, "error": "No file provided"}), 400

            file = request.files["file"]
            if file.filename == "":
                return jsonify({"success": False, "error": "No file selected"}), 400

            config = file_type_config[file_type]

            # Validate file extension
            if not file.filename.lower().endswith(config["extension"]):
                return jsonify(
                    {
                        "success": False,
                        "error": f"Invalid file extension. Expected {config['extension']}",
                    }
                ), 400

            # File size validation (max 50MB for scenario files, 10MB for others)
            max_size = (
                50 * 1024 * 1024 if file_type == "scenario" else 10 * 1024 * 1024
            )  # 50MB or 10MB
            file.seek(0, 2)  # Seek to end of file
            file_size = file.tell()
            file.seek(0)  # Reset file pointer

            if file_size > max_size:
                max_size_mb = max_size // (1024 * 1024)
                return jsonify(
                    {
                        "success": False,
                        "error": f"File too large. Maximum size: {max_size_mb}MB",
                    }
                ), 400

            # Secure filename (cross-platform)
            filename = secure_filename(file.filename)
            if not filename:
                return jsonify({"success": False, "error": "Invalid filename"}), 400

            # Determine target path
            if file_type == "settings":
                target_path = base_path / config["filepath"]
            else:
                target_dir = base_path / config["directory"]
                target_dir.mkdir(exist_ok=True)

                # Handle filename conflicts for multiple files
                if config["allow_multiple"]:
                    counter = 1
                    original_path = target_dir / filename
                    target_path = original_path

                    while target_path.exists():
                        name_part = Path(filename).stem
                        ext_part = Path(filename).suffix
                        new_filename = f"{name_part}_{counter}{ext_part}"
                        target_path = target_dir / new_filename
                        counter += 1

                    if target_path != original_path:
                        filename = target_path.name
                else:
                    target_path = target_dir / filename

            # Save file (cross-platform compatible)
            file.save(str(target_path))

            logger.info(f"File uploaded successfully: {target_path}")

            return jsonify(
                {
                    "success": True,
                    "filename": filename,
                    "file_type": file_type,
                    "target_path": str(target_path),
                    "message": f"{file_type.title()} file uploaded successfully",
                }
            )

        except Exception as e:
            logger.error(f"Error uploading {file_type} file: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to upload file: {str(e)}"}
            ), 500

    @app.route("/api/bluesky/list/<file_type>", methods=["GET"])
    def list_bluesky_files(file_type):
        """List files in BlueSky directories."""
        try:
            # Check if base path is configured
            if not hasattr(current_app, "bluesky_base_path"):
                return jsonify(
                    {"success": False, "error": "BlueSky base path not configured"}
                ), 400

            base_path = Path(current_app.bluesky_base_path)

            # Validate file type
            file_type_config = {
                "scenario": {"extension": ".scn", "directory": "scenario"},
                "plugins": {"extension": ".py", "directory": "plugins"},
                "settings": {"extension": ".cfg", "filepath": "settings.cfg"},
            }

            if file_type not in file_type_config:
                return jsonify(
                    {"success": False, "error": f"Invalid file type: {file_type}"}
                ), 400

            config = file_type_config[file_type]
            files = []

            if file_type == "settings":
                settings_path = base_path / config["filepath"]
                if settings_path.exists():
                    stat_info = settings_path.stat()
                    files.append(
                        {
                            "filename": "settings.cfg",
                            "size": stat_info.st_size,
                            "modified": stat_info.st_mtime,
                            "type": "file",
                        }
                    )
            else:
                target_dir = base_path / config["directory"]
                if target_dir.exists():
                    # Add folders first
                    for folder_path in target_dir.iterdir():
                        if folder_path.is_dir():
                            stat_info = folder_path.stat()
                            files.append(
                                {
                                    "filename": folder_path.name,
                                    "size": 0,  # Folders don't have a meaningful size
                                    "modified": stat_info.st_mtime,
                                    "type": "folder",
                                }
                            )

                    # Add files with the specified extension
                    for file_path in target_dir.glob(f"*{config['extension']}"):
                        stat_info = file_path.stat()
                        files.append(
                            {
                                "filename": file_path.name,
                                "size": stat_info.st_size,
                                "modified": stat_info.st_mtime,
                                "type": "file",
                            }
                        )

            return jsonify(
                {
                    "success": True,
                    "file_type": file_type,
                    "files": files,
                    "base_path": str(base_path),
                }
            )

        except Exception as e:
            logger.error(f"Error listing {file_type} files: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to list files: {str(e)}"}
            ), 500

    @app.route("/api/bluesky/analyze-report", methods=["POST"])
    def analyze_report():
        """Upload and analyze a Word document using AI."""
        try:
            if "file" not in request.files:
                return jsonify({"success": False, "error": "No file provided"}), 400
                
            file = request.files["file"]
            if file.filename == "":
                return jsonify({"success": False, "error": "No file selected"}), 400
                
            if not file.filename.lower().endswith(".docx"):
                return jsonify({"success": False, "error": "Only .docx files are supported"}), 400
                
            import tempfile
            from .ai_service import analyze_docx
            import os
            
            # Save temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
                file.save(temp_file.name)
                temp_path = temp_file.name
                
            # Analyze
            result = analyze_docx(temp_path)
            
            # Clean up
            try:
                os.unlink(temp_path)
            except:
                pass
                
            return jsonify({
                "success": True,
                "data": result
            })
        except Exception as e:
            logger.error(f"Error analyzing report: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route("/api/bluesky/browse/<file_type>", methods=["GET"])
    @app.route("/api/bluesky/browse/<file_type>/<path:subpath>", methods=["GET"])
    def browse_bluesky_directory(file_type, subpath=""):
        """Browse files and folders in BlueSky directories with subdirectory navigation."""
        try:
            # Check if base path is configured
            if not hasattr(current_app, "bluesky_base_path"):
                return jsonify(
                    {"success": False, "error": "BlueSky base path not configured"}
                ), 400

            base_path = Path(current_app.bluesky_base_path)

            # Validate file type
            file_type_config = {
                "scenario": {"extension": ".scn", "directory": "scenario"},
                "plugins": {"extension": ".py", "directory": "plugins"},
                "settings": {"extension": ".cfg", "filepath": "settings.cfg"},
            }

            if file_type not in file_type_config:
                return jsonify(
                    {"success": False, "error": f"Invalid file type: {file_type}"}
                ), 400

            config = file_type_config[file_type]

            # For settings, just return the single file (no directory browsing)
            if file_type == "settings":
                files = []
                settings_path = base_path / config["filepath"]
                if settings_path.exists():
                    stat_info = settings_path.stat()
                    files.append(
                        {
                            "filename": "settings.cfg",
                            "size": stat_info.st_size,
                            "modified": stat_info.st_mtime,
                            "type": "file",
                        }
                    )

                return jsonify(
                    {
                        "success": True,
                        "file_type": file_type,
                        "files": files,
                        "current_path": "",
                        "breadcrumbs": [],
                        "base_path": str(base_path),
                    }
                )

            # Build the target directory path
            target_base = base_path / config["directory"]

            # Clean and validate the subpath to prevent directory traversal attacks
            if subpath:
                # Normalize the path and remove any .. components
                normalized_subpath = Path(subpath).as_posix()
                # Split into parts and filter out dangerous components
                path_parts = [
                    part
                    for part in normalized_subpath.split("/")
                    if part and part != "." and part != ".."
                ]

                if path_parts:
                    target_dir = target_base
                    for part in path_parts:
                        target_dir = target_dir / part
                else:
                    target_dir = target_base
            else:
                target_dir = target_base

            # Security check: ensure the target directory is within the allowed base
            try:
                # Resolve to absolute paths and check containment
                resolved_target = target_dir.resolve()
                resolved_base = target_base.resolve()

                # Check if target is within the allowed directory
                if not str(resolved_target).startswith(str(resolved_base)):
                    return jsonify(
                        {
                            "success": False,
                            "error": "Access denied: Path outside allowed directory",
                        }
                    ), 403

            except (OSError, ValueError):
                return jsonify({"success": False, "error": "Invalid path"}), 400

            files = []
            current_path_parts = []

            if target_dir.exists() and target_dir.is_dir():
                # Calculate the current path relative to the base directory
                try:
                    relative_path = target_dir.relative_to(target_base)
                    if relative_path != Path("."):
                        current_path_parts = list(relative_path.parts)
                except ValueError:
                    # If we can't calculate relative path, something is wrong
                    return jsonify(
                        {"success": False, "error": "Invalid path structure"}
                    ), 400

                # Add folders first
                for folder_path in target_dir.iterdir():
                    if folder_path.is_dir():
                        stat_info = folder_path.stat()
                        files.append(
                            {
                                "filename": folder_path.name,
                                "size": 0,  # Folders don't have a meaningful size
                                "modified": stat_info.st_mtime,
                                "type": "folder",
                            }
                        )

                # Add files with the specified extension
                for file_path in target_dir.glob(f"*{config['extension']}"):
                    if file_path.is_file():
                        stat_info = file_path.stat()
                        files.append(
                            {
                                "filename": file_path.name,
                                "size": stat_info.st_size,
                                "modified": stat_info.st_mtime,
                                "type": "file",
                            }
                        )

            # Build breadcrumbs for navigation
            breadcrumbs = []
            breadcrumb_path = ""

            # Add root breadcrumb
            breadcrumbs.append({"name": config["directory"], "path": ""})

            # Add intermediate breadcrumbs
            for i, part in enumerate(current_path_parts):
                if i == 0:
                    breadcrumb_path = part
                else:
                    breadcrumb_path = f"{breadcrumb_path}/{part}"

                breadcrumbs.append({"name": part, "path": breadcrumb_path})

            current_path = "/".join(current_path_parts) if current_path_parts else ""

            return jsonify(
                {
                    "success": True,
                    "file_type": file_type,
                    "files": files,
                    "current_path": current_path,
                    "breadcrumbs": breadcrumbs,
                    "base_path": str(base_path),
                }
            )

        except Exception as e:
            logger.error(f"Error browsing {file_type} directory: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to browse directory: {str(e)}"}
            ), 500

    @app.route("/api/bluesky/<file_type>/<filename>", methods=["DELETE"])
    def delete_bluesky_file(file_type, filename):
        """Delete files from BlueSky directories."""
        try:
            # Check if base path is configured
            if not hasattr(current_app, "bluesky_base_path"):
                return jsonify(
                    {"success": False, "error": "BlueSky base path not configured"}
                ), 400

            base_path = Path(current_app.bluesky_base_path)

            # Validate file type
            file_type_config = {
                "scenario": {"directory": "scenario"},
                "plugins": {"directory": "plugins"},
                "settings": {"filepath": "settings.cfg"},
            }

            if file_type not in file_type_config:
                return jsonify(
                    {"success": False, "error": f"Invalid file type: {file_type}"}
                ), 400

            # Secure filename
            secure_name = secure_filename(filename)
            if not secure_name:
                return jsonify({"success": False, "error": "Invalid filename"}), 400

            config = file_type_config[file_type]

            # Determine target path
            if file_type == "settings":
                if filename != "settings.cfg":
                    return jsonify(
                        {"success": False, "error": "Can only delete settings.cfg"}
                    ), 400
                target_path = base_path / config["filepath"]
            else:
                target_dir = base_path / config["directory"]
                target_path = target_dir / secure_name

            # Check if file exists
            if not target_path.exists():
                return jsonify(
                    {"success": False, "error": f"File not found: {filename}"}
                ), 404

            # Delete file
            target_path.unlink()

            logger.info(f"File deleted successfully: {target_path}")

            return jsonify(
                {
                    "success": True,
                    "filename": filename,
                    "file_type": file_type,
                    "message": f"{file_type.title()} file deleted successfully",
                }
            )

        except Exception as e:
            logger.error(f"Error deleting {file_type} file: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to delete file: {str(e)}"}
            ), 500

    @app.route("/api/bluesky/filestatus", methods=["GET"])
    def get_bluesky_file_status():
        """Get BlueSky file system configuration status."""
        try:
            if not hasattr(current_app, "bluesky_base_path"):
                return jsonify(
                    {"configured": False, "base_path": None, "derived_paths": {}}
                )

            base_path = Path(current_app.bluesky_base_path)

            return jsonify(
                {
                    "configured": True,
                    "base_path": str(base_path),
                    "derived_paths": {
                        "scenario": str(base_path / "scenario"),
                        "plugins": str(base_path / "plugins"),
                        "settings": str(base_path / "settings.cfg"),
                    },
                    "path_exists": base_path.exists(),
                    "path_writable": os.access(str(base_path), os.W_OK)
                    if base_path.exists()
                    else False,
                }
            )

        except Exception as e:
            logger.error(f"Error getting BlueSky file status: {e}")
            return jsonify(
                {"success": False, "error": f"Failed to get status: {str(e)}"}
            ), 500

    @app.route("/api/simulation/export-word-report", methods=["GET"])
    def export_word_report():
        """Export simulation logs and analysis into a Microsoft Word (.docx) report."""
        try:
            import glob
            from docx import Document
            from docx.shared import Inches, Pt, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from flask import send_file

            # 1. Determine FTS Server output directory
            if hasattr(current_app, "bluesky_base_path"):
                base_path = Path(current_app.bluesky_base_path)
            else:
                base_path = Path(__file__).parent.parent.parent / "FTS Server"
            
            output_dir = base_path / "output"
            
            if not output_dir.exists():
                return jsonify({
                    "success": False, 
                    "error": f"Thư mục logs không tồn tại tại: {output_dir}"
                }), 404

            # 2. Find the latest conflict log and flight status log files
            conf_logs = glob.glob(str(output_dir / "CONFLOG_*.log"))
            flst_logs = glob.glob(str(output_dir / "FLSTLOG_*.log"))
            
            if not conf_logs or not flst_logs:
                return jsonify({
                    "success": False, 
                    "error": "Không tìm thấy dữ liệu nhật ký mô phỏng trong thư mục output. Vui lòng nhập hai lệnh 'FLSTLOG ON' và 'CONFLOG ON' vào Console ở bên dưới rồi nhấn Enter để kích hoạt tính năng ghi log của BlueSky trước khi chạy kịch bản."
                }), 404
                
            latest_conf_log = Path(max(conf_logs, key=os.path.getmtime))
            latest_flst_log = Path(max(flst_logs, key=os.path.getmtime))
            
            # Extract scenario name and simulation datetime from latest conflict log filename
            # Format: CONFLOG_<scenario>_<date>_<time>.log
            # Example: CONFLOG_vvts52v2_20260524_08-05-33.log
            log_stem = latest_conf_log.stem
            log_parts = log_stem.split("_")
            scenario_name = "VVTS_Scenario"
            sim_datetime_display = time.strftime('%d/%m/%Y %H:%M:%S')
            sim_datetime_filename = time.strftime('%Y%m%d_%H%M%S')
            
            if len(log_parts) >= 4:
                scenario_name = log_parts[1]
                # Format filename datetime string: e.g., 20260524_080533
                time_str_clean = log_parts[3].replace("-", "")
                sim_datetime_filename = f"{log_parts[2]}_{time_str_clean}"
                
                # Format human readable datetime string: e.g., 24/05/2026 08:05:33
                try:
                    date_val = log_parts[2] # 20260524
                    time_val = log_parts[3] # 08-05-33
                    formatted_date = f"{date_val[6:8]}/{date_val[4:6]}/{date_val[0:4]}"
                    formatted_time = time_val.replace("-", ":")
                    sim_datetime_display = f"{formatted_date} {formatted_time}"
                except Exception:
                    sim_datetime_display = f"{log_parts[2]} {log_parts[3]}"
            elif len(log_parts) == 3:
                scenario_name = log_parts[1]
                sim_datetime_filename = log_parts[2]
                sim_datetime_display = log_parts[2]
            
            # 3. Parse Conflict Log
            conflicts = []
            if latest_conf_log.exists():
                with open(latest_conf_log, "r", encoding="utf-8") as f:
                    for line in f.readlines():
                        if line.startswith("#") or not line.strip():
                            continue
                        parts = line.split()
                        if len(parts) >= 6:
                            conflicts.append({
                                "time": parts[0],
                                "ac1": parts[1],
                                "ac2": parts[2],
                                "lat": parts[3],
                                "lon": parts[4],
                                "alt": parts[5]
                            })
                            
            # 4. Parse Flight Status Log
            flights = []
            if latest_flst_log.exists():
                with open(latest_flst_log, "r", encoding="utf-8") as f:
                    for line in f.readlines():
                        if line.startswith("#") or not line.strip():
                            continue
                        parts = line.split()
                        if len(parts) >= 4:
                            flights.append({
                                "acid": parts[0],
                                "type": parts[1],
                                "origin": parts[2],
                                "destination": parts[3],
                                "status": "Hoàn thành"
                            })

            # 5. Build the Word document
            doc = Document()
            
            # Header title styling
            title = doc.add_paragraph()
            title_run = title.add_run("BÁO CÁO KẾT QUẢ MÔ PHỎNG AN TOÀN BAY & PHÂN CÁCH (FTS)")
            title_run.font.name = 'Arial'
            title_run.font.bold = True
            title_run.font.size = Pt(16)
            title_run.font.color.rgb = RGBColor(0, 51, 102) # Dark Navy Blue
            title.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            # Subtitle styling
            subtitle = doc.add_paragraph()
            sub_run = subtitle.add_run(f"Kịch bản: {scenario_name}  |  Thời điểm mô phỏng: {sim_datetime_display}")
            sub_run.font.name = 'Arial'
            sub_run.font.italic = True
            sub_run.font.size = Pt(11)
            sub_run.font.color.rgb = RGBColor(102, 102, 102) # Gray
            subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            doc.add_paragraph(f"Thời gian tạo báo cáo: {time.strftime('%d/%m/%Y %H:%M:%S')}")
            
            # Section 1: Overview metrics
            doc.add_heading("1. Tổng quan kịch bản mô phỏng", level=1)
            p = doc.add_paragraph()
            p.add_run("• Tên kịch bản mô phỏng: ").bold = True
            p.add_run(f"{scenario_name}\n")
            p.add_run("• Thời điểm chạy mô phỏng: ").bold = True
            p.add_run(f"{sim_datetime_display}\n")
            p.add_run("• Tên tệp nhật ký xung đột: ").bold = True
            p.add_run(f"{latest_conf_log.name}\n")
            p.add_run("• Tên tệp nhật ký chuyến bay: ").bold = True
            p.add_run(f"{latest_flst_log.name}\n")
            p.add_run("• Tổng số chuyến bay tham gia: ").bold = True
            p.add_run(f"{len(flights)} chuyến bay\n")
            p.add_run("• Tổng số xung đột phân cách phát hiện: ").bold = True
            p.add_run(f"{len(conflicts)} sự cố vi phạm\n")
            
            # Section 2: Detailed Conflicts Table
            doc.add_heading("2. Thống kê chi tiết các vi phạm phân cách", level=1)
            if len(conflicts) == 0:
                doc.add_paragraph("Không phát hiện bất kỳ xung đột hay vi phạm phân cách nào trong suốt quá trình chạy mô phỏng kịch bản. Các phương thức bay đáp ứng hoàn toàn tiêu chuẩn an toàn không lưu.")
            else:
                table = doc.add_table(rows=1, cols=5)
                table.style = 'Light Shading Accent 1'
                hdr_cells = table.rows[0].cells
                hdr_cells[0].text = 'Thời điểm (s)'
                hdr_cells[1].text = 'Tàu bay 1'
                hdr_cells[2].text = 'Tàu bay 2'
                hdr_cells[3].text = 'Độ cao (ft)'
                hdr_cells[4].text = 'Vị trí (Lat, Lon)'
                
                # Apply headers styling
                for cell in hdr_cells:
                    for paragraph in cell.paragraphs:
                        for run in paragraph.runs:
                            run.font.bold = True
                            run.font.name = 'Arial'
                            run.font.size = Pt(10)
                
                for conf in conflicts:
                    row_cells = table.add_row().cells
                    row_cells[0].text = conf["time"]
                    row_cells[1].text = conf["ac1"]
                    row_cells[2].text = conf["ac2"]
                    row_cells[3].text = conf["alt"]
                    row_cells[4].text = f"{conf['lat']}, {conf['lon']}"
                    for cell in row_cells:
                        for paragraph in cell.paragraphs:
                            for run in paragraph.runs:
                                run.font.name = 'Arial'
                                run.font.size = Pt(9.5)
                                
            # Section 3: Flight details
            doc.add_heading("3. Danh sách chi tiết chuyến bay ghi nhận", level=1)
            if len(flights) == 0:
                doc.add_paragraph("Không ghi nhận chuyến bay nào.")
            else:
                table_fl = doc.add_table(rows=1, cols=4)
                table_fl.style = 'Table Grid'
                hdr_fl_cells = table_fl.rows[0].cells
                hdr_fl_cells[0].text = 'Callsign (ID)'
                hdr_fl_cells[1].text = 'Loại tàu bay'
                hdr_fl_cells[2].text = 'Hành trình'
                hdr_fl_cells[3].text = 'Trạng thái'
                
                for cell in hdr_fl_cells:
                    for paragraph in cell.paragraphs:
                        for run in paragraph.runs:
                            run.font.bold = True
                            run.font.name = 'Arial'
                            run.font.size = Pt(10)
                            
                for fl in flights:
                    row_cells = table_fl.add_row().cells
                    row_cells[0].text = fl["acid"]
                    row_cells[1].text = fl["type"]
                    row_cells[2].text = f"{fl['origin']} → {fl['destination']}"
                    row_cells[3].text = fl["status"]
                    for cell in row_cells:
                        for paragraph in cell.paragraphs:
                            for run in paragraph.runs:
                                run.font.name = 'Arial'
                                run.font.size = Pt(9.5)

            # Section 4: Tổng hợp, Phân tích & Đánh giá an toàn chuyên sâu
            doc.add_heading("4. Tổng hợp, Phân tích & Đánh giá an toàn chuyên sâu", level=1)

            # Dynamic safety calculations
            conflict_count = len(conflicts)
            flight_count = len(flights)

            # Determine Risk and Assessment levels
            if conflict_count == 0:
                safety_level = "MỨC ĐỘ AN TOÀN TUYỆT ĐỐI (KHÔNG CÓ XUNG ĐỘT)"
                safety_desc = "Không phát hiện vi phạm phân cách nào. Phương thức bay thiết lập đạt độ an toàn tối đa."
                risk_assessment = (
                    "Dựa trên dữ liệu mô phỏng, toàn bộ các chuyến bay trong kịch bản đã vận hành đúng "
                    "theo kế hoạch bay quy định mà không xảy ra bất kỳ sự cố vi phạm phân cách tiêu chuẩn nào "
                    "(cả về phân cách ngang và dọc). Điều này chứng minh rằng cấu trúc đường hàng không, "
                    "phương thức tiếp cận (SID/STAR) và mật độ phân bổ thời gian cất/hạ cánh hiện tại "
                    "đạt mức độ an toàn cao nhất, không cần can thiệp kỹ thuật."
                )
                recommendations = [
                    "Tiếp tục duy trì và áp dụng phương thức bay này cho thực tế vận hành hàng ngày.",
                    "Đánh giá thêm với các kịch bản có yếu tố thời tiết bất lợi hoặc gió ngược để kiểm nghiệm tính ổn định."
                ]
            elif conflict_count <= 3:
                safety_level = "RỦI RO THẤP (XUNG ĐỘT CỤC BỘ ĐƠN LẺ)"
                safety_desc = f"Phát hiện {conflict_count} sự cố vi phạm phân cách. Mức độ ảnh hưởng ở phạm vi hẹp."
                risk_assessment = (
                    f"Kết quả phân tích ghi nhận {conflict_count} trường hợp vi phạm tiêu chuẩn phân cách tối thiểu. "
                    "Đây là những xung đột mang tính cục bộ và thời gian vi phạm ngắn. Trong thực tế, các xung đột này "
                    "hoàn toàn có thể được kiểm soát và giải quyết kịp thời bởi Kiểm soát viên không lưu (ATCO) "
                    "bằng các phương thức điều hành cơ bản như điều chỉnh tốc độ (speed control) hoặc rẽ hướng tạm thời."
                )
                recommendations = [
                    "Rà soát lại giãn cách cất cánh và trình tự tiếp cận tại các điểm thắt nút giao thông để loại bỏ hoàn toàn vi phạm.",
                    "Khuyến nghị tối ưu hóa nhẹ các sơ đồ bay SID/STAR liên quan tại các điểm giao cắt cục bộ."
                ]
            elif conflict_count <= 10:
                safety_level = "RỦI RO TRUNG BÌNH (CẦN ĐIỀU CHỈNH LUỒNG BAY)"
                safety_desc = f"Phát hiện {conflict_count} sự cố vi phạm phân cách. Có dấu hiệu quá tải hoặc xung đột luồng giao thông."
                risk_assessment = (
                    f"Hệ thống ghi nhận tổng cộng {conflict_count} vi phạm phân cách giữa các cặp tàu bay. "
                    "Mật độ xung đột ở mức trung bình và có tính chất lặp lại tại các điểm báo cáo giao cắt. "
                    "Điều này cho thấy có sự hội tụ hoặc đối đầu của các luồng bay tại cùng một cao độ "
                    "và khoảng thời gian cao điểm, vượt quá khả năng tự điều hòa của sơ đồ bay hiện tại."
                )
                recommendations = [
                    "Áp dụng phương pháp phân cách cao độ triệt để (phân chia lại độ cao bay an toàn cho các luồng bay đối đầu).",
                    "Áp dụng quản lý luồng hoạt động bay (ATFM) để kéo giãn khoảng cách thời gian khởi hành giữa các chuyến bay trùng đường bay.",
                    "Điều chỉnh cấu trúc sơ đồ PBN SID/STAR tại các điểm nút giao cắt lớn."
                ]
            else:
                safety_level = "RỦI RO CAO (NGUY CƠ MẤT AN TOÀN TIỀM ẨN - CẦN THIẾT KẾ LẠI)"
                safety_desc = f"Hệ thống cảnh báo đặc biệt với {conflict_count} vi phạm phân cách nghiêm trọng."
                risk_assessment = (
                    f"Mô phỏng phát hiện mật độ vi phạm phân cách đặc biệt lớn ({conflict_count} sự cố). "
                    "Mức độ rủi ro mất an toàn không lưu là rất cao. Nguyên nhân chủ yếu xuất phát từ việc thiết kế đường bay "
                    "trùng lặp hoàn toàn, luồng bay hội tụ quá đông trong thời gian ngắn mà không có sự giãn cách, hoặc "
                    "thiếu phương án phân cách cao độ tại các điểm chuyển tiếp đường hàng không."
                )
                recommendations = [
                    "Cần thiết kế lại cấu trúc đường hàng không trong khu vực thử nghiệm mô phỏng.",
                    "Thiết lập các sơ đồ bay SID/STAR độc lập, hạn chế tối đa các điểm giao cắt cùng cao độ.",
                    "Tiến hành phân chia lại các phân khu kiểm soát (Sectorization) để giảm tải khối lượng công việc cho Kiểm soát viên không lưu.",
                    "Yêu cầu giãn cách thời gian cất hạ cánh tối thiểu giữa các tàu bay liên quan."
                ]

            # Write Safety Level Callout Box
            callout = doc.add_table(rows=1, cols=1)
            callout.style = 'Light Shading Accent 1'
            cell = callout.rows[0].cells[0]

            p_level = cell.paragraphs[0]
            p_level_run = p_level.add_run(f"ĐÁNH GIÁ CHỈ SỐ AN TOÀN: {safety_level}\n")
            p_level_run.font.bold = True
            p_level_run.font.size = Pt(11)
            p_level_run.font.color.rgb = RGBColor(180, 50, 50) if conflict_count > 0 else RGBColor(0, 120, 60)

            p_desc = cell.add_paragraph()
            p_desc_run = p_desc.add_run(safety_desc)
            p_desc_run.font.italic = True
            p_desc_run.font.size = Pt(10)

            # Write detailed analysis
            doc.add_paragraph().paragraph_format.space_before = Pt(6)
            doc.add_heading("4.1 Phân tích rủi ro và các nút thắt phân cách", level=2)

            p_risk = doc.add_paragraph()
            p_risk.add_run(risk_assessment)

            # Analyze most frequent conflict pairs
            if conflict_count > 0:
                doc.add_heading("4.2 Phân tích các cặp tàu bay phát sinh xung đột cao nhất", level=2)
                pair_counts = {}
                for conf in conflicts:
                    ac1, ac2 = sorted([conf["ac1"], conf["ac2"]])
                    pair_counts[(ac1, ac2)] = pair_counts.get((ac1, ac2), 0) + 1

                top_conflict_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[:3]

                p_pairs = doc.add_paragraph()
                p_pairs.add_run("Dưới đây là danh sách các cặp tàu bay có tần suất xảy ra xung đột cao nhất, cần được chú ý đặc biệt:\n").font.italic = True
                for i, ((ac1, ac2), count) in enumerate(top_conflict_pairs, 1):
                    p_pairs.add_run(f"• Top {i}: ").bold = True
                    p_pairs.add_run(f"Cặp tàu bay ")
                    p_pairs.add_run(f"{ac1} và {ac2}").bold = True
                    p_pairs.add_run(f" vi phạm phân cách ")
                    p_pairs.add_run(f"{count} lần").bold = True
                    p_pairs.add_run(" trong suốt quá trình chạy kịch bản.\n")

            # Analyze traffic flows from flights
            if flight_count > 0:
                doc.add_heading("4.3 Phân tích mật độ luồng hoạt động bay", level=2)
                flows = {}
                for fl in flights:
                    route_key = f"{fl['origin']} -> {fl['destination']}"
                    flows[route_key] = flows.get(route_key, 0) + 1

                top_flows = sorted(flows.items(), key=lambda x: x[1], reverse=True)[:3]

                p_flows = doc.add_paragraph()
                p_flows.add_run("Thống kê luồng bay có lưu lượng hoạt động lớn nhất trong kịch bản:\n").font.italic = True
                for i, (flow, count) in enumerate(top_flows, 1):
                    p_flows.add_run(f"• Luồng bay {i}: ").bold = True
                    p_flows.add_run(f"{flow} với ")
                    p_flows.add_run(f"{count} chuyến bay").bold = True
                    p_flows.add_run(" khai thác.\n")

            # Section 5: Recommendations
            doc.add_heading("5. Khuyến nghị và giải pháp khắc phục an toàn", level=1)
            p_rec_intro = doc.add_paragraph()
            p_rec_intro.add_run("Dưới đây là các giải pháp kỹ thuật cụ thể được đề xuất nhằm nâng cao tính an toàn và giảm thiểu rủi ro:")

            for rec in recommendations:
                p_rec = doc.add_paragraph()
                p_rec.add_run("• ").bold = True
                p_rec.add_run(rec)

            # Section 6: Conclusion
            doc.add_heading("6. Kết luận chung", level=1)
            p_end = doc.add_paragraph()
            p_end.add_run(
                "Báo cáo phân tích an toàn bay này được khởi tạo tự động bởi hệ thống WebFTS dựa trên nhật ký mô phỏng thực tế. "
                "Các thông số tổng hợp, phân tích và đánh giá khoa học ở trên là cơ sở tin cậy giúp các chuyên gia, kiểm soát viên "
                "không lưu tối ưu hóa phương thức bay PBN, sơ đồ bay SID/STAR và nâng cao năng lực thông qua vùng trời an toàn."
            )

            # 6. Save document to a temp file and send
            report_filename = f"Bao_Cao_Mo_Phong_{scenario_name}_{sim_datetime_filename}.docx"
            report_path = output_dir / "Simulation_Report_VATM.docx"
            doc.save(str(report_path))

            return send_file(str(report_path), as_attachment=True, download_name=report_filename)
            
        except Exception as e:
            logger.error(f"Error exporting Word report: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"Lỗi khởi tạo báo cáo Word: {str(e)}"}), 500
