import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from flask import jsonify, request, send_file
from .scn_generator import generate_scn_content, sanitize_scenario_filename
from .auth_manager import require_permission
from .platform_settings_api import get_raw_ai_config
from .ai_scenario_generator import generate_scenario_config
from .capacity_scenario_engine import PROCEDURE_REGISTRY, get_procedures
from . import airways_data

def get_scenarios_file():
    root_dir = Path(__file__).parent.parent.parent
    data_dir = root_dir / "FTS Server" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "scenarios.json"

def init_seed_data():
    file_path = get_scenarios_file()
    now = datetime.utcnow().isoformat() + "Z"
    
    # Load existing or create empty
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                scenarios = json.load(f)
        except Exception:
            scenarios = []
    else:
        scenarios = []
        
    # Check if we have the baseline and alt seed scenarios, if not add them
    seed_ids = [s["id"] for s in scenarios]
    
    # Seed scenario-vvts52v3nm
    sample_scenario = {
        "id": "scenario-vvts52v3nm",
        "studyId": "study-vvts-25lr-capacity",
        "name": "VVTS 52 Movements 3NM Separation Test",
        "type": "baseline",
        "status": "frozen",
        "description": "Scenario mẫu VVTS 52 movements/hour, RWY 25L departures / 25R arrivals, dùng để test protected-zone horizontal threshold 3 NM và conflict/STCA proxy.",
        "aixmDatasetId": "aixm-airac-2405",
        "airacCycle": "2405",
        "airport": "VVTS",
        "airspace": "TMA Tân Sơn Nhất",
        "runwayConfig": {
            "airport": "VVTS",
            "arrivalRunway": "25R",
            "departureRunway": "25L",
            "mode": "25L DEP / 25R ARR",
            "notes": "Arrivals vacate via P5 to apron."
        },
        "weatherConfig": {
            "mode": "none",
            "description": "Baseline weather condition for test scenario."
        },
        "procedureConfig": {
            "sidStarMode": "manual",
            "selectedSids": [
                "SAPEN 5K",
                "PATMA 5P",
                "BIXEX 5U",
                "ELSAS 5A",
                "ANHOA 5A",
                "BACHU 5A",
                "NIXIV 5A"
            ],
            "selectedStars": [
                "SAPEN 5B",
                "DOVIN 5E",
                "VETOM 5A",
                "PTH 5D",
                "ELSAS 5C",
                "TRN 5B",
                "ANBOV 5A",
                "NIXIV 5B"
            ],
            "selectedIaps": [],
            "notes": "Multiple PBN entry/exit procedures for VVTS 25L/25R test."
        },
        "trafficDemand": {
            "source": "template",
            "movementCount": 52,
            "timeWindowStart": "00:00:00",
            "timeWindowEnd": "01:00:00",
            "notes": "52 movements/hour sample scenario."
        },
        "validationStatus": "passed",
        "validationMessages": [
            "Scenario sample is prevalidated for demonstration.",
            "SCN file exists in FTS Server/scenario/vvts52v3nm.scn.",
            "Run command: IC vvts52v3nm."
        ],
        "scnFileName": "vvts52v3nm.scn",
        "scenarioBaseName": "vvts52v3nm",
        "icCommand": "IC vvts52v3nm",
        "createdAt": "2026-05-27T00:00:00.000Z",
        "updatedAt": "2026-05-27T00:00:00.000Z",
        "frozenAt": "2026-05-27T00:00:00.000Z",
        "submittedAt": None,
        "archivedAt": None
    }
    
    # Insert or update
    index = next((i for i, s in enumerate(scenarios) if s["id"] == "scenario-vvts52v3nm"), -1)
    if index != -1:
        # Update existing fields
        scenarios[index].update({
            "scnFileName": sample_scenario["scnFileName"],
            "scenarioBaseName": sample_scenario["scenarioBaseName"],
            "icCommand": sample_scenario["icCommand"],
            "validationMessages": sample_scenario["validationMessages"],
            "status": "frozen",
            "frozenAt": sample_scenario["frozenAt"],
            "name": sample_scenario["name"],
            "description": sample_scenario["description"],
            "runwayConfig": sample_scenario["runwayConfig"],
            "weatherConfig": sample_scenario["weatherConfig"],
            "procedureConfig": sample_scenario["procedureConfig"],
            "trafficDemand": sample_scenario["trafficDemand"],
            "airport": sample_scenario["airport"],
            "airspace": sample_scenario["airspace"]
        })
    else:
        scenarios.append(sample_scenario)
        
    # Standard initial seeds if they don't exist
    if "scenario-vvts-base" not in seed_ids:
        scenarios.append({
            "id": "scenario-vvts-base",
            "studyId": "study-vvts-25lr-capacity",
            "name": "Baseline VVTS 25L/25R",
            "type": "baseline",
            "status": "draft",
            "description": "Baseline scenario for VVTS with 25L dep / 25R arr",
            "aixmDatasetId": "aixm-airac-2405",
            "airacCycle": "2405",
            "fplDatasetId": "fpl-vvts-baseline",
            "airport": "VVTS",
            "airspace": "VVTS TMA",
            "runwayConfig": {
                "airport": "VVTS",
                "arrivalRunway": "25R",
                "departureRunway": "25L",
                "mode": "mixed",
                "notes": "Standard dual runway operations"
            },
            "weatherConfig": {
                "mode": "none"
            },
            "procedureConfig": {
                "sidStarMode": "auto"
            },
            "trafficDemand": {
                "source": "fpl_dataset",
                "fplDatasetId": "fpl-vvts-baseline",
                "movementCount": 45
            },
            "validationStatus": "not_checked",
            "validationMessages": [],
            "createdAt": now,
            "updatedAt": now,
            "frozenAt": None,
            "submittedAt": None,
            "archivedAt": None
        })
        
    if "scenario-vvts-alt1" not in seed_ids:
        scenarios.append({
            "id": "scenario-vvts-alt1",
            "studyId": "study-vvts-25lr-capacity",
            "name": "Alternative VVTS 52 movements",
            "type": "alternative",
            "status": "draft",
            "description": "Alternative scenario testing 52 movements/hr",
            "aixmDatasetId": "aixm-airac-2405",
            "airacCycle": "2405",
            "fplDatasetId": "fpl-vvts-alt1",
            "airport": "VVTS",
            "airspace": "VVTS TMA",
            "runwayConfig": {
                "airport": "VVTS",
                "arrivalRunway": "25R",
                "departureRunway": "25L",
                "mode": "mixed"
            },
            "weatherConfig": {
                "mode": "none"
            },
            "procedureConfig": {
                "sidStarMode": "auto"
            },
            "trafficDemand": {
                "source": "fpl_dataset",
                "fplDatasetId": "fpl-vvts-alt1",
                "movementCount": 52
            },
            "validationStatus": "not_checked",
            "validationMessages": [],
            "createdAt": now,
            "updatedAt": now,
            "frozenAt": None,
            "submittedAt": None,
            "archivedAt": None
        })
        
    if "scenario-vvdn-base" not in seed_ids:
        scenarios.append({
            "id": "scenario-vvdn-base",
            "studyId": "study-vvdn-rnav-trombone",
            "name": "Baseline VVDN RNAV",
            "type": "baseline",
            "status": "draft",
            "description": "Baseline RNAV approach at VVDN",
            "aixmDatasetId": "aixm-airac-2405",
            "airacCycle": "2405",
            "airport": "VVDN",
            "airspace": "VVDN TMA",
            "runwayConfig": {
                "airport": "VVDN",
                "arrivalRunway": "35R"
            },
            "weatherConfig": {
                "mode": "none"
            },
            "procedureConfig": {
                "sidStarMode": "auto"
            },
            "trafficDemand": {
                "source": "manual",
                "movementCount": 15
            },
            "validationStatus": "not_checked",
            "validationMessages": [],
            "createdAt": now,
            "updatedAt": now,
            "frozenAt": None,
            "submittedAt": None,
            "archivedAt": None
        })
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)

def load_scenarios():
    init_seed_data()
    with open(get_scenarios_file(), "r", encoding="utf-8") as f:
        return json.load(f)

def save_scenarios(scenarios):
    with open(get_scenarios_file(), "w", encoding="utf-8") as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)

def current_iso_time():
    return datetime.utcnow().isoformat() + "Z"

def register_scenarios_routes(app):
    @app.route("/api/airports/<icao>/procedures", methods=["GET"])
    @require_permission("scenarios.read")
    def get_airport_procedures(icao):
        """Read-only lookup powering the 'procedure_capacity' traffic-demand
        source's SID/STAR mix editor: which transitions exist for this
        airport, and a reasonable default count for each (the same mix this
        project's own VVNB/VVGB capacity scenarios were tuned against)."""
        try:
            procs = get_procedures(icao)
        except ValueError:
            return jsonify({"error": f"No procedure data for airport {icao.upper()!r}",
                             "knownAirports": sorted(PROCEDURE_REGISTRY)}), 404
        return jsonify({
            "icao": procs.icao,
            "depRunway": procs.dep_runway,
            "arrRunway": procs.arr_runway,
            # Per-transition override, only non-empty for airports with more
            # than one independent runway pair (e.g. VVPQ/VVLT) -- absent/empty
            # means every transition uses the single depRunway/arrRunway above.
            "depRunwayByTransition": procs.dep_runway_by_transition,
            "arrRunwayByTransition": procs.arr_runway_by_transition,
            "sidTransitions": procs.sid_transition_names,
            "starTransitions": procs.star_transition_names,
            "defaultSidMix": procs.default_sid_mix,
            "defaultStarMix": procs.default_star_mix,
            "iapOptions": getattr(procs, "iap_options", []),
        })

    @app.route("/api/airports", methods=["GET"])
    @require_permission("scenarios.read")
    def list_airports_with_procedures():
        return jsonify({"airports": sorted(PROCEDURE_REGISTRY)})

    @app.route("/api/airports/<icao>/waypoints", methods=["GET"])
    @require_permission("scenarios.read")
    def get_airport_waypoints(icao):
        """Every real named fix this airport's procedure data references
        (not just the ones on a specific SID/STAR) -- powers the Waypoints
        data page."""
        try:
            procs = get_procedures(icao)
        except ValueError:
            return jsonify({"error": f"No procedure data for airport {icao.upper()!r}",
                             "knownAirports": sorted(PROCEDURE_REGISTRY)}), 404
        waypoints = [
            {"name": name, "lat": lat, "lon": lon}
            for name, (lat, lon) in sorted(procs.waypoints.items())
        ]
        return jsonify({"icao": procs.icao, "waypoints": waypoints})

    def _serialize_route(route):
        return [
            {
                "name": wp.name, "lat": wp.lat, "lon": wp.lon,
                "altFt": wp.alt_ft,
                "spdKt": getattr(wp, "spd_kt", None),
            }
            for wp in route
        ]

    @app.route("/api/airports/<icao>/routes", methods=["GET"])
    @require_permission("scenarios.read")
    def get_airport_routes(icao):
        """Full waypoint sequence (with published altitude/speed) for every
        real SID/STAR transition -- powers the Routes/Airways data page."""
        try:
            procs = get_procedures(icao)
        except ValueError:
            return jsonify({"error": f"No procedure data for airport {icao.upper()!r}",
                             "knownAirports": sorted(PROCEDURE_REGISTRY)}), 404
        return jsonify({
            "icao": procs.icao,
            "sidRoutes": {name: _serialize_route(procs.sid_route(name)) for name in procs.sid_transition_names},
            "starRoutes": {name: _serialize_route(procs.star_route(name)) for name in procs.star_transition_names},
        })

    @app.route("/api/airways", methods=["GET"])
    @require_permission("scenarios.read")
    def list_airways_with_structured_data():
        """En-route airways that have a structured waypoint chain (Phase 1
        RNAV2 draft + Phase 2 ENR3.1 legacy) -- powers airway selection when
        building a scenario's route. Airways with geometry only (no chain
        yet) aren't listed here; they're still visible on the Airways data
        page via the raw KMZ geometry endpoint, just not usable as a route
        source."""
        return jsonify({"airways": [
            {
                "code": a.code, "source": a.source,
                "waypointCount": a.waypoint_count, "segmentCount": a.segment_count,
                "isDraft": a.is_draft,
            }
            for a in airways_data.list_airways()
        ]})

    @app.route("/api/airways/<code>/route", methods=["GET"])
    @require_permission("scenarios.read")
    def get_airway_route(code):
        """Ordered waypoint chain for one airway, for dropping into a
        scenario's ADDWPT sequence. Optional query params:
          direction=forward|reverse (default forward, as published)
          cruiseFl=<int> -- sets a single constant altitude for the whole
            route. Every leg's own published [lowerFL, upperFL] band is
            checked first; a level outside any leg's band is rejected (400)
            rather than silently clamped or emitted anyway. Omit cruiseFl to
            get pure geometry (altFt/spdKt null) -- an airway publishes a
            band per leg, not a target per fix, so no altitude is invented
            when the caller doesn't specify one."""
        direction = request.args.get("direction", "forward")
        if direction not in ("forward", "reverse"):
            return jsonify({"error": "direction must be 'forward' or 'reverse'"}), 400
        cruise_fl_raw = request.args.get("cruiseFl")
        cruise_fl = None
        if cruise_fl_raw is not None:
            try:
                cruise_fl = int(cruise_fl_raw)
            except ValueError:
                return jsonify({"error": f"cruiseFl must be an integer, got {cruise_fl_raw!r}"}), 400
        try:
            route = airways_data.get_airway_route(code, direction=direction, cruise_fl=cruise_fl)
        except airways_data.AirwayNotFoundError as e:
            return jsonify({"error": str(e)}), 404
        except airways_data.AirwayLevelOutOfRangeError as e:
            return jsonify({
                "error": str(e), "code": e.code, "cruiseFl": e.cruise_fl,
                "offendingLegs": e.offending,
            }), 400
        return jsonify({
            "code": code, "direction": direction, "cruiseFl": cruise_fl,
            "waypoints": _serialize_route(route),
        })

    @app.route("/api/scenarios", methods=["GET"])
    @require_permission("scenarios.read")
    def get_scenarios():
        try:
            study_id = request.args.get("studyId")
            status = request.args.get("status")
            scenario_type = request.args.get("type")
            include_archived = request.args.get("includeArchived") == "true"
            
            scenarios = load_scenarios()
            filtered = []
            
            for s in scenarios:
                if not include_archived and s.get("status") == "archived":
                    continue
                if study_id and s.get("studyId") != study_id:
                    continue
                if status and s.get("status") != status:
                    continue
                if scenario_type and s.get("type") != scenario_type:
                    continue
                filtered.append(s)
                
            return jsonify(filtered)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>", methods=["GET"])
    @require_permission("scenarios.read")
    def get_scenario(scenario_id):
        try:
            scenarios = load_scenarios()
            scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
            if scenario:
                return jsonify(scenario)
            return jsonify({"error": "Scenario not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios", methods=["POST"])
    @require_permission("scenarios.create")
    def create_scenario():
        try:
            data = request.json
            if not data or not data.get("studyId") or not data.get("name") or not data.get("type"):
                return jsonify({"error": "Missing required fields: studyId, name, type"}), 400
                
            scenarios = load_scenarios()
            now = current_iso_time()
            
            new_scenario = {
                "id": str(uuid.uuid4()),
                "studyId": data.get("studyId"),
                "name": data.get("name"),
                "type": data.get("type"),
                "status": data.get("status", "draft"),
                "description": data.get("description", ""),
                
                "aixmDatasetId": data.get("aixmDatasetId", ""),
                "airacCycle": data.get("airacCycle", ""),
                "fplDatasetId": data.get("fplDatasetId", ""),
                
                "airport": data.get("airport", ""),
                "airspace": data.get("airspace", ""),
                
                "runwayConfig": data.get("runwayConfig", {}),
                "weatherConfig": data.get("weatherConfig", {}),
                "procedureConfig": data.get("procedureConfig", {}),
                "trafficDemand": data.get("trafficDemand", {}),
                
                "validationStatus": "not_checked",
                "validationMessages": [],
                
                "createdAt": now,
                "updatedAt": now,
                "frozenAt": None,
                "submittedAt": None,
                "archivedAt": None
            }
            
            scenarios.append(new_scenario)
            save_scenarios(scenarios)
            
            return jsonify(new_scenario), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>", methods=["PUT"])
    @require_permission("scenarios.update")
    def update_scenario(scenario_id):
        try:
            data = request.json
            if not data:
                return jsonify({"error": "No data provided"}), 400
                
            scenarios = load_scenarios()
            index = next((i for i, s in enumerate(scenarios) if s["id"] == scenario_id), -1)
            
            if index == -1:
                return jsonify({"error": "Scenario not found"}), 404
                
            scenario = scenarios[index]
            
            if scenario.get("status") == "frozen":
                return jsonify({"error": "Cannot edit a frozen scenario"}), 400
                
            # Update mutable fields
            for field in ["name", "type", "description", "aixmDatasetId", "airacCycle", "fplDatasetId", "airport", "airspace", "runwayConfig", "weatherConfig", "procedureConfig", "trafficDemand"]:
                if field in data:
                    scenario[field] = data[field]
                    
            scenario["updatedAt"] = current_iso_time()
            # Reset validation status since it changed
            scenario["validationStatus"] = "not_checked"
            scenario["validationMessages"] = []
            
            scenarios[index] = scenario
            save_scenarios(scenarios)
            
            return jsonify(scenario)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/archive", methods=["PATCH"])
    @require_permission("scenarios.archive")
    def archive_scenario(scenario_id):
        try:
            scenarios = load_scenarios()
            index = next((i for i, s in enumerate(scenarios) if s["id"] == scenario_id), -1)
            
            if index == -1:
                return jsonify({"error": "Scenario not found"}), 404
                
            scenario = scenarios[index]
            now = current_iso_time()
            scenario["status"] = "archived"
            scenario["archivedAt"] = now
            scenario["updatedAt"] = now
            
            scenarios[index] = scenario
            save_scenarios(scenarios)
            
            return jsonify(scenario)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/clone", methods=["POST"])
    @require_permission("scenarios.create")
    def clone_scenario(scenario_id):
        try:
            data = request.json or {}
            scenarios = load_scenarios()
            original = next((s for s in scenarios if s["id"] == scenario_id), None)
            
            if not original:
                return jsonify({"error": "Original scenario not found"}), 404
                
            now = current_iso_time()
            
            new_scenario = original.copy()
            new_scenario["id"] = str(uuid.uuid4())
            new_scenario["name"] = data.get("name", f"Copy of {original.get('name')}")
            new_scenario["type"] = data.get("type", "alternative")
            new_scenario["status"] = "draft"
            new_scenario["validationStatus"] = "not_checked"
            new_scenario["validationMessages"] = []
            new_scenario["createdAt"] = now
            new_scenario["updatedAt"] = now
            new_scenario["frozenAt"] = None
            new_scenario["submittedAt"] = None
            new_scenario["archivedAt"] = None
            
            scenarios.append(new_scenario)
            save_scenarios(scenarios)
            
            return jsonify(new_scenario), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/validate", methods=["POST"])
    @require_permission("scenarios.validate")
    def validate_scenario(scenario_id):
        try:
            scenarios = load_scenarios()
            index = next((i for i, s in enumerate(scenarios) if s["id"] == scenario_id), -1)
            
            if index == -1:
                return jsonify({"error": "Scenario not found"}), 404
                
            scenario = scenarios[index]
            
            messages = []
            status = "passed"
            
            # Simple validation logic
            if not scenario.get("studyId"):
                messages.append("Missing studyId")
                status = "failed"
            if not scenario.get("name"):
                messages.append("Missing name")
                status = "failed"
            if not scenario.get("type"):
                messages.append("Missing type")
                status = "failed"
                
            if not scenario.get("aixmDatasetId") and not scenario.get("airacCycle"):
                messages.append("Need either AIXM dataset or AIRAC cycle")
                status = "failed"
                
            if not scenario.get("airport") and not scenario.get("airspace"):
                messages.append("Need either Airport or Airspace defined")
                status = "failed"
                
            if scenario.get("airport") and not scenario.get("runwayConfig"):
                messages.append("Airport defined but Runway Config is missing")
                if status != "failed": status = "warning"
                
            if not scenario.get("trafficDemand"):
                messages.append("Traffic Demand is missing")
                if status != "failed": status = "warning"
                
            scenario["validationStatus"] = status
            scenario["validationMessages"] = messages
            scenario["updatedAt"] = current_iso_time()
            
            scenarios[index] = scenario
            save_scenarios(scenarios)
            
            return jsonify(scenario)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/freeze", methods=["POST"])
    @require_permission("scenarios.freeze")
    def freeze_scenario(scenario_id):
        try:
            scenarios = load_scenarios()
            index = next((i for i, s in enumerate(scenarios) if s["id"] == scenario_id), -1)
            
            if index == -1:
                return jsonify({"error": "Scenario not found"}), 404
                
            scenario = scenarios[index]
            
            if scenario.get("validationStatus") == "failed":
                return jsonify({"error": "Cannot freeze a scenario that failed validation"}), 400
                
            now = current_iso_time()
            scenario["status"] = "frozen"
            scenario["frozenAt"] = now
            scenario["updatedAt"] = now
            
            scenarios[index] = scenario
            save_scenarios(scenarios)
            
            return jsonify(scenario)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    def get_scenario_dir():
        root_dir = Path(__file__).parent.parent.parent
        scen_dir = root_dir / "FTS Server" / "scenario"
        scen_dir.mkdir(parents=True, exist_ok=True)
        return scen_dir

    def resolve_scenario_file_path(scen_dir, file_name):
        """Safely resolves a (possibly nested, e.g. 'FOLDER/FOLDER.scn') scenario file path
        inside scen_dir. Raises ValueError on any invalid/traversal-attempt name."""
        if not file_name or ".." in file_name or file_name.startswith("/") or file_name.startswith("\\"):
            raise ValueError("Invalid file name")
        if not file_name.lower().endswith(".scn"):
            raise ValueError("Only .scn files are allowed")
        scen_dir_resolved = scen_dir.resolve()
        candidate = (scen_dir / file_name).resolve()
        if not str(candidate).startswith(str(scen_dir_resolved)):
            raise ValueError("Path traversal attempt detected")
        return candidate

    @app.route("/api/scenarios/<scenario_id>/export-scn", methods=["POST"])
    @require_permission("scenarios.export_scn")
    def export_scenario_scn(scenario_id):
        try:
            scenarios = load_scenarios()
            index = next((i for i, s in enumerate(scenarios) if s["id"] == scenario_id), -1)
            
            if index == -1:
                return jsonify({"error": "Scenario not found"}), 404
                
            scenario = scenarios[index]
            
            if scenario.get("status") != "frozen":
                return jsonify({"error": "Scenario must be frozen before exporting .scn"}), 400
                
            filename = sanitize_scenario_filename(scenario.get("name", ""), scenario.get("id", ""))
            scn_content = generate_scn_content(scenario)
            
            scen_dir = get_scenario_dir()
            file_path = scen_dir / filename
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(scn_content)
                
            # Persist filename, baseName, and icCommand into the scenario
            scenario["scnFileName"] = filename
            scenario["scenarioBaseName"] = Path(filename).stem
            scenario["icCommand"] = f"IC {Path(filename).stem}"
            
            scenarios[index] = scenario
            save_scenarios(scenarios)
            
            return jsonify({
                "scenarioId": scenario["id"],
                "studyId": scenario.get("studyId"),
                "scenarioName": scenario.get("name"),
                "scenarioFileName": filename,
                "scenarioBaseName": Path(filename).stem,
                "scenarioPath": f"FTS Server/scenario/{filename}",
                "icCommand": f"IC {Path(filename).stem}",
                "scnContent": scn_content,
                "exportedAt": current_iso_time()
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/scn", methods=["GET"])
    @require_permission("scenarios.read")
    def get_scenario_scn(scenario_id):
        try:
            scenarios = load_scenarios()
            scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
            
            if not scenario:
                return jsonify({"error": "Scenario not found"}), 404
                
            filename = sanitize_scenario_filename(scenario.get("name", ""), scenario.get("id", ""))
            scen_dir = get_scenario_dir()
            file_path = scen_dir / filename
            
            if not file_path.exists():
                return jsonify({"error": "SCN file not found. Please export it first."}), 404
                
            with open(file_path, "r", encoding="utf-8") as f:
                scn_content = f.read()
                
            return jsonify({
                "scenarioId": scenario["id"],
                "scenarioFileName": filename,
                "scenarioBaseName": Path(filename).stem,
                "icCommand": f"IC {Path(filename).stem}",
                "scnContent": scn_content
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/<scenario_id>/scn/download", methods=["GET"])
    @require_permission("scenarios.read")
    def download_scenario_scn(scenario_id):
        try:
            scenarios = load_scenarios()
            scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
            
            if not scenario:
                return jsonify({"error": "Scenario not found"}), 404
                
            filename = sanitize_scenario_filename(scenario.get("name", ""), scenario.get("id", ""))
            scen_dir = get_scenario_dir()
            file_path = scen_dir / filename
            
            if not file_path.exists():
                return jsonify({"error": "SCN file not found. Please export it first."}), 404
                
            return send_file(
                file_path,
                as_attachment=True,
                download_name=filename,
                mimetype="text/plain"
            )
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]+")

    # Cache for list_scenario_files(): the scenario folder holds thousands
    # of .scn files once subfolders are included, so re-reading every
    # file's full content and re-running the O(n^2) PCALL scan on every
    # launcher open was taking a very long time. The fingerprint below is
    # cheap (stat-only, no content reads) and changes whenever any .scn is
    # added/removed/modified, so the expensive scan only reruns when the
    # directory actually changed.
    _scenario_files_cache = {"fingerprint": None, "data": None}

    def _scenario_dir_fingerprint(scen_dir):
        count = 0
        newest_mtime = 0.0
        for file_path in scen_dir.rglob("*.scn"):
            try:
                st = file_path.stat()
            except OSError:
                continue
            count += 1
            if st.st_mtime > newest_mtime:
                newest_mtime = st.st_mtime
        return (count, newest_mtime)

    def find_pcalled_files(scen_dir, candidate_paths):
        """Returns the set of relative .scn paths (posix, relative to scen_dir)
        that are referenced as a PCALL target by some OTHER scenario file in
        the same folder -- these are component files (taxi routes, per-aircraft
        approach legs, pushback wrappers, etc.) meant to be pulled in by a
        main scenario, never launched directly via IC, so the launcher list
        should hide them.

        A plain "first token after PCALL" regex misses indirect references:
        this project's generated scenarios have wrapper files like
        "PCALL _KB5GEN_PUSHBACK_G24 DEP001 _KB5GEN_TAXI_G24_RWYHOLD 58.8"
        where the wrapper (_KB5GEN_PUSHBACK_G24) itself PCALLs the taxi file
        passed to it as a parameter, so the taxi file's name only appears as
        a later argument, not immediately after the PCALL keyword. Instead,
        treat any other file's stem appearing as a bare token ANYWHERE in a
        sibling (same-folder) file's content as a reference -- PCALL targets
        are resolved relative to the calling file's own folder, so scoping
        the scan per-folder keeps this from over-matching across unrelated
        scenario sets that happen to reuse a generic stem."""
        by_folder = {}
        for rel_path in candidate_paths:
            folder = str(Path(rel_path).parent).replace("\\", "/")
            by_folder.setdefault(folder, []).append(rel_path)

        # "ic.scn" is BlueSky's own auto-generated pointer to whichever
        # scenario was last run (literally "IC <last scenario name>"), not an
        # authored scenario -- if left in as a token-scan source, the most
        # recently launched scenario would always name-match inside it and
        # get incorrectly hidden as if ic.scn had PCALL'd it.
        tokens_by_file = {}
        for rel_path in candidate_paths:
            if Path(rel_path).name.lower() == "ic.scn":
                tokens_by_file[rel_path] = set()
                continue
            try:
                content = (scen_dir / rel_path).read_text(encoding="utf-8", errors="ignore")
            except OSError:
                content = ""
            tokens_by_file[rel_path] = {t.lower() for t in TOKEN_PATTERN.findall(content)}

        pcalled = set()
        for folder, rel_paths in by_folder.items():
            for candidate in rel_paths:
                candidate_stem = Path(candidate).stem.lower()
                referenced = any(
                    candidate_stem in tokens_by_file[other]
                    for other in rel_paths
                    if other != candidate
                )
                if referenced:
                    pcalled.add(candidate)
        return pcalled

    @app.route("/api/scenario-files", methods=["GET"])
    @require_permission("scenarios.read")
    def list_scenario_files():
        try:
            scen_dir = get_scenario_dir()

            fingerprint = _scenario_dir_fingerprint(scen_dir)
            if (
                _scenario_files_cache["data"] is not None
                and _scenario_files_cache["fingerprint"] == fingerprint
            ):
                return jsonify(_scenario_files_cache["data"])

            entries = []

            # Recurse into subfolders too (e.g. "VVDN_2A2D_1HOUR_35R/VVDN_2A2D_1HOUR_35R.scn") --
            # relativePath preserves the subfolder so IC commands and file lookups stay correct;
            # baseName/displayName stay just the file's own stem for a readable list.
            # "Backup/" is excluded: it only holds timestamped safety copies made before hand-edits,
            # never meant to be browsed/launched as scenarios in their own right.
            for file_path in scen_dir.rglob("*.scn"):
                if file_path.is_file():
                    rel_path = file_path.relative_to(scen_dir).as_posix()
                    # Match "Backup" as ANY path segment, not just a
                    # top-level prefix -- scenario subfolders sometimes have
                    # their own nested "Backup/" holding safety copies made
                    # before hand-edits, which should be excluded the same
                    # way as the top-level one.
                    if "Backup" in rel_path.split("/")[:-1]:
                        continue
                    # Files named with a leading underscore (e.g.
                    # "_KB5GEN_ARR_APPROACH_B738.scn", "_ARR_RESUME_G4_GATE26.scn")
                    # are this project's own convention for component/helper
                    # files -- taxi routes, per-aircraft approach legs, gate
                    # taxi-in continuations, etc. -- meant to be pulled in via
                    # PCALL, never launched directly. Hide these regardless of
                    # whether anything currently PCALLs them: some become
                    # orphaned when a scenario is regenerated to reference a
                    # newer helper file (e.g. gate26 -> gate28), but they're
                    # still not launcher entries in their own right.
                    if file_path.stem.startswith("_"):
                        continue
                    entries.append((rel_path, file_path))

            # Component scenarios PCALL'd by a main scenario but NOT already
            # excluded by the leading-underscore convention above (e.g. a
            # helper that doesn't happen to follow that naming pattern)
            # aren't independently runnable -- exclude them too so the
            # launcher only lists scenarios that can actually be clicked and
            # run via IC.
            pcalled = find_pcalled_files(scen_dir, [rel for rel, _ in entries])

            files_data = []
            for rel_path, file_path in entries:
                if rel_path in pcalled:
                    continue
                stat = file_path.stat()
                updated_at = datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z"
                ic_base = str(Path(rel_path).with_suffix("")).replace("\\", "/")
                files_data.append({
                    "fileName": rel_path,
                    "baseName": file_path.stem,
                    "displayName": file_path.stem,
                    "sizeBytes": stat.st_size,
                    "updatedAt": updated_at,
                    "icCommand": f"IC {ic_base}"
                })

            files_data.sort(key=lambda x: x["updatedAt"], reverse=True)
            _scenario_files_cache["fingerprint"] = fingerprint
            _scenario_files_cache["data"] = files_data
            return jsonify(files_data)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenario-files", methods=["POST"])
    @require_permission("scenarios.write")
    def upload_scenario_file():
        try:
            upload = request.files.get("file")
            if upload is None or not upload.filename:
                return jsonify({"error": "No file provided"}), 400

            file_name = Path(upload.filename).name
            if ".." in file_name or "/" in file_name or "\\" in file_name:
                return jsonify({"error": "Invalid file name"}), 400
            if not file_name.lower().endswith(".scn"):
                return jsonify({"error": "Only .scn files are allowed"}), 400

            scen_dir = get_scenario_dir()
            file_path = scen_dir / file_name
            overwritten = file_path.exists()

            upload.save(file_path)

            stat = file_path.stat()
            updated_at = datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z"
            return jsonify({
                "success": True,
                "overwritten": overwritten,
                "file": {
                    "fileName": file_path.name,
                    "baseName": file_path.stem,
                    "displayName": file_path.stem,
                    "sizeBytes": stat.st_size,
                    "updatedAt": updated_at,
                    "icCommand": f"IC {file_path.stem}"
                }
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenario-files/<path:file_name>", methods=["GET"])
    @require_permission("scenarios.read")
    def get_scenario_file_content(file_name):
        try:
            scen_dir = get_scenario_dir()
            try:
                file_path = resolve_scenario_file_path(scen_dir, file_name)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

            if not file_path.exists():
                return jsonify({"error": "File not found"}), 404

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            ic_base = str(Path(file_name).with_suffix("")).replace("\\", "/")
            return jsonify({
                "fileName": file_name,
                "baseName": file_path.stem,
                "icCommand": f"IC {ic_base}",
                "scnContent": content
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenario-files/<path:file_name>", methods=["PUT"])
    @require_permission("scenarios.write")
    def update_scenario_file_content(file_name):
        try:
            scen_dir = get_scenario_dir()
            try:
                file_path = resolve_scenario_file_path(scen_dir, file_name)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

            if not file_path.exists():
                return jsonify({"error": "File not found"}), 404

            data = request.json or {}
            content = data.get("scnContent", "")
            if not isinstance(content, str):
                return jsonify({"error": "scnContent must be a string"}), 400

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

            return jsonify({"success": True, "fileName": file_name})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenario-files/<path:file_name>", methods=["DELETE"])
    @require_permission("scenarios.write")
    def delete_scenario_file(file_name):
        try:
            scen_dir = get_scenario_dir()
            try:
                file_path = resolve_scenario_file_path(scen_dir, file_name)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

            if not file_path.exists():
                return jsonify({"error": "File not found"}), 404

            file_path.unlink()
            return jsonify({"success": True, "deleted": file_name})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scenarios/ai-generate", methods=["POST"])
    @require_permission("scenarios.create")
    def ai_generate_scenario():
        data = request.json or {}

        study_id = data.get("studyId", "")
        if not study_id:
            return jsonify({"error": "studyId is required"}), 400

        ai_cfg = get_raw_ai_config()
        provider = ai_cfg.get("provider", "rule_based")
        api_key = ai_cfg.get("claudeApiKey", "") if provider == "claude" else ai_cfg.get("geminiApiKey", "")

        try:
            scenario = generate_scenario_config(
                provider=provider,
                api_key=api_key,
                airport=data.get("airport", "VVDN"),
                arr_runway=data.get("arrRunway", ""),
                dep_runway=data.get("depRunway", ""),
                movement_count=int(data.get("movementCount", 10)),
                duration_minutes=int(data.get("durationMinutes", 60)),
                prompt=data.get("prompt", ""),
                study_id=study_id,
                airac_cycle=data.get("airacCycle", "01/26"),
            )
        except Exception as e:
            return jsonify({"error": str(e)}), 500

        # Persist as a new draft scenario
        scenarios = load_scenarios()
        scenarios.append(scenario)
        save_scenarios(scenarios)

        return jsonify({"success": True, "scenario": scenario}), 201
