import json
from pathlib import Path

RULESETS_DIR = Path("FTS Server/data/compliance_rulesets")
GEOMETRY_DIR = Path("FTS Server/data/runway_geometry")
WAKE_CATEGORIES_FILE = Path("FTS Server/data/aircraft_wake_categories.json")


def _safe_airport_code(airport: str) -> str:
    """Uppercase, alnum-only airport code to prevent path traversal via the airport param."""
    return "".join(c for c in str(airport).upper() if c.isalnum())


def load_ruleset(airport: str) -> dict:
    """Reads FTS Server/data/compliance_rulesets/{AIRPORT}.json. Never raises; returns None if missing/invalid."""
    code = _safe_airport_code(airport)
    if not code:
        return None
    ruleset_file = RULESETS_DIR / f"{code}.json"
    if not ruleset_file.exists():
        return None
    try:
        with open(ruleset_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_runway_geometry(airport: str) -> dict:
    """Reads FTS Server/data/runway_geometry/{AIRPORT}.json. Never raises; returns None if missing/invalid."""
    code = _safe_airport_code(airport)
    if not code:
        return None
    geometry_file = GEOMETRY_DIR / f"{code}.json"
    if not geometry_file.exists():
        return None
    try:
        with open(geometry_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_wake_category_table() -> dict:
    """Reads aircraft_wake_categories.json and returns a dict keyed by upper-cased icaoType."""
    if not WAKE_CATEGORIES_FILE.exists():
        return {}
    try:
        with open(WAKE_CATEGORIES_FILE, "r", encoding="utf-8") as f:
            entries = json.load(f)
        return {str(e["icaoType"]).upper(): e["wakeCategory"] for e in entries if "icaoType" in e and "wakeCategory" in e}
    except Exception:
        return {}


def list_supported_airports() -> list:
    """Lists airports that have both a ruleset and (optionally) geometry configured, with geometryStatus."""
    result = []
    if not RULESETS_DIR.exists():
        return result
    for ruleset_file in sorted(RULESETS_DIR.glob("*.json")):
        airport = ruleset_file.stem
        geometry = load_runway_geometry(airport)
        result.append({
            "airport": airport,
            "hasRuleset": True,
            "geometryStatus": geometry.get("geometryStatus") if geometry else "unavailable"
        })
    return result
