"""Aerodrome Layout API — serves ground layout GeoJSON for airports."""

import json
from pathlib import Path

from flask import jsonify

# Root of the project (two levels up from this file: server/ → WebATM/ → project root)
_PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = _PROJECT_ROOT / "FTS Server" / "data" / "aerodrome_layout" / "datasets"
ACTIVE_FILE = _PROJECT_ROOT / "FTS Server" / "data" / "aerodrome_layout" / "active.json"

# Layer name mappings per dataset format
KML_LAYER_MAP = {
    "runways": "runways.geojson",
    "runway_centerlines": "lines.geojson",
    "runway_labels": "labels.geojson",
    "pavements": "aprons.geojson",
    "taxiway_centerlines": "taxiways.geojson",
    "taxiway_labels": "labels.geojson",
    "gates": "stands.geojson",
    "ground_markings": "lines.geojson",
    "taxiway_signs": None,
    "boundaries": None,
    "helipads": None,
}

NORMALIZED_LAYERS = [
    "runways", "runway_centerlines", "runway_labels",
    "pavements", "taxiway_centerlines", "taxiway_labels",
    "gates", "ground_markings", "taxiway_signs", "boundaries", "helipads",
]


def _load_json(path: Path) -> dict:
    if path and path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


def _get_active_dataset_id() -> str | None:
    if ACTIVE_FILE.exists():
        try:
            with open(ACTIVE_FILE) as f:
                return json.load(f).get("activeDatasetId")
        except Exception:
            pass
    # Default to first available dataset
    if DATA_DIR.exists():
        for d in DATA_DIR.iterdir():
            if d.is_dir():
                return d.name
    return None


def _set_active_dataset_id(dataset_id: str):
    ACTIVE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ACTIVE_FILE, "w") as f:
        json.dump({"activeDatasetId": dataset_id}, f)


def _list_airports(dataset_path: Path, _fmt: str = "") -> list[str]:
    """List all 4-char ICAO directories at root of dataset."""
    candidates = [
        p.name for p in dataset_path.iterdir()
        if p.is_dir() and len(p.name) == 4 and p.name.isalpha()
    ]
    # Also include airports only in normalized/airports (pure normalized datasets)
    norm_dir = dataset_path / "normalized" / "airports"
    if norm_dir.exists() and not candidates:
        candidates = [p.name for p in norm_dir.iterdir() if p.is_dir() and len(p.name) == 4]
    return sorted(candidates)


def _get_layers(dataset_path: Path, _fmt: str, icao: str) -> dict:
    layers: dict = {name: {"type": "FeatureCollection", "features": []} for name in NORMALIZED_LAYERS}

    # Prefer normalized layers if available
    norm_dir = dataset_path / "normalized" / "airports" / icao
    if norm_dir.exists():
        for layer_name in NORMALIZED_LAYERS:
            layers[layer_name] = _load_json(norm_dir / f"{layer_name}.geojson")
    else:
        # KML format fallback
        apt_dir = dataset_path / icao
        for layer_name, filename in KML_LAYER_MAP.items():
            if filename:
                layers[layer_name] = _load_json(apt_dir / filename)

    return layers


def _build_dataset_info(dataset_id: str, dataset_path: Path) -> dict:
    airports = _list_airports(dataset_path)
    vn_airports = [a for a in airports if a.startswith("VV")]
    return {
        "id": dataset_id,
        "name": dataset_id.replace("_", " ").title(),
        "status": "ready",
        "airportCount": len(airports),
        "vietnamAirportCount": len(vn_airports),
        "featureCounts": {"runways": 0, "taxiways": 0},
        "warnings": [],
        "updatedAt": "2026-01-01T00:00:00Z",
    }


def register_aerodrome_layout_routes(app):
    """Register all /api/aerodrome-layout/* routes."""

    @app.route("/api/aerodrome-layout/datasets", methods=["GET"])
    def list_aerodrome_datasets():
        datasets = []
        if DATA_DIR.exists():
            for d in sorted(DATA_DIR.iterdir()):
                if d.is_dir():
                    datasets.append(_build_dataset_info(d.name, d))
        return jsonify(datasets)

    @app.route("/api/aerodrome-layout/active", methods=["GET"])
    def get_active_aerodrome_dataset():
        return jsonify({"activeDatasetId": _get_active_dataset_id()})

    @app.route("/api/aerodrome-layout/datasets/<dataset_id>/activate", methods=["POST"])
    def activate_aerodrome_dataset(dataset_id):
        dataset_path = DATA_DIR / dataset_id
        if not dataset_path.exists():
            return jsonify({"error": "Dataset not found"}), 404
        _set_active_dataset_id(dataset_id)
        return jsonify({"success": True, "activeDatasetId": dataset_id})

    @app.route("/api/aerodrome-layout/datasets/<dataset_id>/airports", methods=["GET"])
    def list_aerodrome_airports(dataset_id):
        dataset_path = DATA_DIR / dataset_id
        if not dataset_path.exists():
            return jsonify({"error": "Dataset not found"}), 404
        airports = _list_airports(dataset_path)
        result = []
        for icao in airports:
            norm_dir = dataset_path / "normalized" / "airports" / icao
            kml_dir = dataset_path / icao
            apt_dir = norm_dir if norm_dir.exists() else kml_dir
            is_norm = norm_dir.exists()
            features = {
                "runways": len(_load_json(apt_dir / "runways.geojson").get("features", [])),
                "aprons": len(_load_json(apt_dir / ("pavements.geojson" if is_norm else "aprons.geojson")).get("features", [])),
                "taxiways": len(_load_json(apt_dir / ("taxiway_centerlines.geojson" if is_norm else "taxiways.geojson")).get("features", [])),
            }
            result.append({"icao": icao, "name": icao, "features": features})
        return jsonify(result)

    @app.route("/api/aerodrome-layout/active/airports/<icao>/layers", methods=["GET"])
    def get_aerodrome_layers(icao):
        dataset_id = _get_active_dataset_id()
        if not dataset_id:
            return jsonify({"error": "No active dataset"}), 404
        dataset_path = DATA_DIR / dataset_id
        if not dataset_path.exists():
            return jsonify({"error": "Dataset not found"}), 404
        layers = _get_layers(dataset_path, "", icao.upper())
        return jsonify({"icao": icao.upper(), "layers": layers})

    @app.route("/api/aerodrome-layout/discover", methods=["GET"])
    def discover_aerodrome_data():
        return jsonify({"candidatePaths": [], "selectedPath": ""})

    @app.route("/api/aerodrome-layout/import-xplane", methods=["POST"])
    def import_xplane_aerodrome():
        return jsonify({"error": "X-Plane import not supported in this version"}), 400
