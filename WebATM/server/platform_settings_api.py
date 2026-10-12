import json
from pathlib import Path
from flask import jsonify, request
from .auth_manager import require_permission

_SETTINGS_FILE = Path(__file__).parent.parent.parent / "FTS Server" / "data" / "platform_settings.json"

_DEFAULTS = {
    "aiGeneration": {
        "provider": "rule_based",
        "claudeApiKey": "",
        "geminiApiKey": "",
    }
}


def _load() -> dict:
    if not _SETTINGS_FILE.exists():
        return json.loads(json.dumps(_DEFAULTS))
    try:
        with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
        result = json.loads(json.dumps(_DEFAULTS))
        if "aiGeneration" in saved:
            result["aiGeneration"].update(saved["aiGeneration"])
        return result
    except Exception:
        return json.loads(json.dumps(_DEFAULTS))


def _save(settings: dict) -> None:
    _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)


def _mask(key: str) -> str:
    """Return masked API key — only last 4 chars visible."""
    if not key or len(key) < 8:
        return "****" if key else ""
    return "****" + key[-4:]


def get_raw_ai_config() -> dict:
    """Return unmasked AI config for server-side use."""
    return _load().get("aiGeneration", {})


def register_platform_settings_routes(app):
    @app.route("/api/settings/platform", methods=["GET"])
    def get_platform_settings():
        settings = _load()
        # Mask keys before sending to frontend
        masked = json.loads(json.dumps(settings))
        ai = masked.get("aiGeneration", {})
        for field in ("claudeApiKey", "geminiApiKey"):
            if ai.get(field):
                ai[field] = _mask(ai[field])
        return jsonify(masked)

    @app.route("/api/settings/platform", methods=["PUT"])
    @require_permission("settings.manage_platform")
    def save_platform_settings():
        data = request.json or {}
        current = _load()

        if "aiGeneration" in data:
            ai_in = data["aiGeneration"]
            ai_cur = current.setdefault("aiGeneration", {})

            if "provider" in ai_in:
                ai_cur["provider"] = ai_in["provider"]

            # Only overwrite key if caller sent a real (unmasked) value
            for field in ("claudeApiKey", "geminiApiKey"):
                val = ai_in.get(field, "")
                if val and not val.startswith("****"):
                    ai_cur[field] = val
                elif not val:
                    # Explicit blank = clear the key
                    ai_cur[field] = ""

        _save(current)
        return jsonify({"success": True})

    @app.route("/api/settings/platform/ai-status", methods=["GET"])
    def get_ai_status():
        """Return which providers are configured (for UI indicator)."""
        ai = _load().get("aiGeneration", {})
        return jsonify({
            "provider": ai.get("provider", "rule_based"),
            "claudeConfigured": bool(ai.get("claudeApiKey", "")),
            "geminiConfigured": bool(ai.get("geminiApiKey", "")),
        })
