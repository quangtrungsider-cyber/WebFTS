"""Read-only view of the separation rule engine (separation_rules.py).

VVNB_DEFAULT_RULES is currently hardcoded Python, used only by the
seasonal_plan_parser -> route_resolver -> separation_rules ->
flightplan_scenario_builder pipeline (trafficDemand.source ==
"seasonal_schedule"). It has no persistence or write API yet -- this route
only serializes the existing dataclasses for display, so the "Rules" page can
show what's actually running without pretending it's editable there.
"""

from dataclasses import asdict
from flask import jsonify
from .auth_manager import require_permission
from .separation_rules import VVNB_DEFAULT_RULES


def register_rules_routes(app):
    @app.route("/api/rules", methods=["GET"])
    @require_permission("scenarios.read")
    def get_rules():
        try:
            return jsonify([asdict(r) for r in VVNB_DEFAULT_RULES])
        except Exception as e:
            return jsonify({"error": str(e)}), 500
