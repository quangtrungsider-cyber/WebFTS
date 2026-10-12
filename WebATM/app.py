"""
Flask web server and Socket.IO handlers for WebATM.

This web application provides a browser-based interface for BlueSky - The Open Air Traffic
Simulator developed by TU Delft (Delft University of Technology).

This module is separated into different focused modules in the server/ package:
- server/session_manager.py: Session tracking and capacity management
- server/routes.py: Basic Flask routes (index, commands, config, health)
- server/server_status.py: BlueSky server status
- server/socket_handlers.py: Socket.IO event handlers
"""

import logging
from pathlib import Path

from flask import Flask, jsonify, request
from flask_socketio import SocketIO

from .logger import get_logger
from .proxy import BlueSkyProxy, register_subscribers, set_bluesky_proxy
from .server import (
    SessionManager,
    register_basic_routes,
    register_server_status_routes,
    register_socket_handlers,
)
from .server.studies_api import register_studies_routes
from .server.scenarios_api import register_scenarios_routes
from .server.recordings_api import register_recordings_routes
from .server.atwi_api import register_atwi_routes
from .server.kpi_api import register_kpi_routes
from .server.monte_carlo_api import register_monte_carlo_routes
from .server.compliance_api import register_compliance_routes
from .server.aixm_api import register_aixm_routes
from .server.auth_api import register_auth_routes
from .server.users_api import register_users_routes
from .server.platform_settings_api import register_platform_settings_routes
from .server.weather_presets_api import register_weather_presets_routes
from .server.constraint_presets_api import register_constraint_presets_routes
from .server.rules_api import register_rules_routes
from .server.bada_api import register_bada_routes



def create_app():
    """Create and configure Flask application with all routes and handlers."""

    # Create Flask app
    app = Flask(
        __name__,
        template_folder=Path(__file__).parent / "templates",
        static_folder=Path(__file__).parent / "static",
    )
    app.config["SECRET_KEY"] = "WebATM_ui_secret_key"

    # Configure Flask and Werkzeug logging to use WebATM logger
    logger = get_logger("app")
    app.logger = logger

    # Configure Werkzeug (Flask's web server) to use WebATM logger for HTTP access logs
    werkzeug_logger = logging.getLogger("werkzeug")
    werkzeug_logger.handlers = []  # Clear default handlers
    werkzeug_logger.setLevel(logging.INFO)
    # Copy handlers from WebATM logger to Werkzeug logger
    for handler in logging.getLogger("WebATM").handlers:
        werkzeug_logger.addHandler(handler)

    # Initialize session manager
    session_manager = SessionManager()

    # Determine async_mode based on available libraries
    try:
        import eventlet
        async_mode = "eventlet"
    except ImportError:
        async_mode = "threading"

    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        ping_timeout=60,
        ping_interval=25,
        async_mode=async_mode,
        logger=False,
        engineio_logger=False,
    )

    # Create and configure the BlueSky proxy instance
    bluesky_proxy = BlueSkyProxy()
    bluesky_proxy.socketio = socketio
    set_bluesky_proxy(bluesky_proxy)  # Set it globally for the subscriber callbacks

    # Auto-connect if BlueSky is already running locally
    from .server.bluesky_server_status import is_port_listening
    if is_port_listening(11000, 0.2) or is_port_listening(11001, 0.2):
        logger.info("BlueSky simulator detected running locally. Auto-starting proxy client...")
        try:
            bluesky_proxy.server_ip = "localhost"
            bluesky_proxy.start_client(hostname="localhost")
            logger.info("Proxy client auto-started successfully")
        except Exception as e:
            logger.error(f"Failed to auto-start proxy client: {e}")

    # Register subscriber callbacks after client is fully initialized
    register_subscribers()

    # Store proxy reference in app for access in routes
    app.bluesky_proxy = bluesky_proxy

    # === Request Middleware ===
    @app.before_request
    def filter_requests():
        """Filter requests to skip certain endpoints."""
        # Skip processing for health, status endpoints and static files
        if request.endpoint in [
            "health_check",
            "status_check",
        ] or request.path.startswith("/static/"):
            return

        # Skip for API endpoints that don't create new sessions (existing session operations)
        if request.endpoint in [
            "get_data",
            "send_command",
            "get_server_config",
            "update_server_config",
            "disconnect_server",
        ]:
            return

    # === Error Handlers ===
    @app.errorhandler(Exception)
    def handle_exception(e):
        """Handle uncaught exceptions."""
        from werkzeug.exceptions import HTTPException

        # Let real HTTP errors (404, 403, etc. -- e.g. from abort() or unmatched
        # routes) pass through with their own status code instead of being
        # relabeled as a 500.
        if isinstance(e, HTTPException):
            return e

        import traceback
        traceback.print_exc()
        try:
            return jsonify({"error": f"Internal server error: {str(e)}"}), 500
        except Exception:
            return f"Internal server error: {str(e)}", 500

    # === Register Routes and Handlers ===

    # Register basic routes (index, commands, server config, health/status)
    register_basic_routes(app, session_manager)

    # Register BlueSky server control routes (start/stop/restart/status/logs)
    register_server_status_routes(app)

    # Register all Socket.IO event handlers
    register_socket_handlers(socketio, session_manager)

    # Register Studies API routes
    register_studies_routes(app)

    # Register Scenarios API routes
    register_scenarios_routes(app)

    # Register Recordings API routes
    register_recordings_routes(app)

    # Register ATWI Workload API routes
    register_atwi_routes(app)

    # Register KPI API routes
    register_kpi_routes(app)

    # Register Monte Carlo analysis job routes
    register_monte_carlo_routes(app)

    # Register Compliance ruleset engine / report export routes
    register_compliance_routes(app)

    # Register AIXM API routes
    register_aixm_routes(app)

    # Register Dashboard API routes
    from .server.dashboard_api import register_dashboard_routes
    register_dashboard_routes(app)

    # Register Auth API routes
    register_auth_routes(app)

    # Register Users API routes
    register_users_routes(app)

    # Register Platform Settings API routes (AI generation config)
    register_platform_settings_routes(app)

    # Register Aerodrome Layout API routes
    from .server.aerodrome_layout_api import register_aerodrome_layout_routes
    register_aerodrome_layout_routes(app)

    # Register Weather Presets API routes
    register_weather_presets_routes(app)

    # Register Constraint Presets API routes
    register_constraint_presets_routes(app)

    # Register Rules API routes (read-only)
    register_rules_routes(app)

    # Register BADA API routes (read-only)
    register_bada_routes(app)

    return app, socketio
