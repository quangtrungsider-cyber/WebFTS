import os
import json
import uuid
import datetime
import jwt
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import request, jsonify, current_app

DATA_DIR = Path("FTS Server/data")
USERS_FILE = DATA_DIR / "users.json"
AUDIT_LOG_FILE = DATA_DIR / "security_audit_log.jsonl"

JWT_SECRET = os.environ.get("WEBFTS_JWT_SECRET", "dev-secret-change-me")
AUTH_ENABLED = os.environ.get("WEBFTS_AUTH_ENABLED", "true").lower() == "true"

ROLES_PERMISSIONS = {
    "admin": ["*"],  # Special case: all permissions
    "analyst": [
        "dashboard.read", "studies.read", "studies.create", "studies.update", "studies.archive",
        "scenarios.read", "scenarios.create", "scenarios.update", "scenarios.validate", "scenarios.freeze", "scenarios.export_scn", "scenarios.archive",
        "simulation.read", "simulation.command_send", "simulation.run_ic", "simulation.recording_start", "simulation.recording_stop", "simulation.recording_delete",
        "replay.read", "atwi.read", "atwi.calculate", "atwi.model_create", "atwi.model_update",
        "kpi.read", "kpi.analyze", "kpi.compare", "aixm.read", "aixm.validate",
        "monte_carlo.read", "monte_carlo.create", "monte_carlo.cancel",
        "evidence.read", "evidence.create", "settings.read", "settings.update_own"
    ],
    "reviewer": [
        "dashboard.read", "studies.read", "scenarios.read", "replay.read",
        "atwi.read", "kpi.read", "kpi.compare", "aixm.read", "monte_carlo.read",
        "evidence.read", "evidence.review", "evidence.approve_internal",
        "settings.read", "settings.update_own"
    ],
    "viewer": [
        "dashboard.read", "studies.read", "scenarios.read", "replay.read",
        "atwi.read", "kpi.read", "aixm.read", "evidence.read", "monte_carlo.read",
        "settings.read", "settings.update_own"
    ],
    "demo": [
        "dashboard.read", "studies.read", "scenarios.read", "replay.read",
        "kpi.read", "aixm.read"
    ]
}

def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)

def _init_seed_users():
    _ensure_data_dir()
    if not USERS_FILE.exists():
        now = datetime.datetime.now().isoformat() + "Z"
        seed_users = [
            {
                "id": "user-admin",
                "username": "admin",
                "displayName": "WebFTS Administrator",
                "email": "admin@webfts.local",
                "role": "admin",
                "passwordHash": generate_password_hash("admin123"),
                "status": "active",
                "createdAt": now,
                "updatedAt": now,
                "lastLoginAt": None
            },
            {
                "id": "user-analyst",
                "username": "analyst",
                "displayName": "FTS Analyst",
                "email": "analyst@webfts.local",
                "role": "analyst",
                "passwordHash": generate_password_hash("analyst123"),
                "status": "active",
                "createdAt": now,
                "updatedAt": now,
                "lastLoginAt": None
            },
            {
                "id": "user-demo",
                "username": "demo",
                "displayName": "Demo User",
                "email": "demo@webfts.local",
                "role": "demo",
                "passwordHash": generate_password_hash("demo123"),
                "status": "active",
                "createdAt": now,
                "updatedAt": now,
                "lastLoginAt": None
            }
        ]
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(seed_users, f, indent=2, ensure_ascii=False)
        print("WARNING: Default demo credentials seeded. Please change them before production deployment.")

def load_users():
    _init_seed_users()
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_users(users):
    _ensure_data_dir()
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)

def log_audit_event(event_type, user_id, username, role, ip_address, message):
    _ensure_data_dir()
    event = {
        "id": f"audit_{uuid.uuid4().hex[:12]}",
        "time": datetime.datetime.now().isoformat() + "Z",
        "type": event_type,
        "userId": user_id,
        "username": username,
        "role": role,
        "ip": ip_address,
        "message": message
    }
    with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

def get_user_permissions(role):
    if role == "admin":
        return ROLES_PERMISSIONS["admin"]
    return ROLES_PERMISSIONS.get(role, [])

def create_jwt_token(user, remember_me=False):
    exp_hours = 24 * 7 if remember_me else 8
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "permissions": get_user_permissions(user["role"]),
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=exp_hours)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_jwt_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def verify_token(req):
    if not AUTH_ENABLED:
        # Return a mock admin user if auth is disabled (for dev only, if configured)
        return {
            "sub": "mock-admin",
            "username": "admin",
            "role": "admin",
            "permissions": ["*"]
        }
        
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
        
    token = auth_header.split(" ")[1]
    return decode_jwt_token(token)

def has_permission(user_payload, required_permission):
    if not user_payload:
        return False
    permissions = user_payload.get("permissions", [])
    if "*" in permissions:
        return True
    
    # Check exact match
    if required_permission in permissions:
        return True
        
    # Check wildcard (e.g. studies.* matches studies.read)
    parts = required_permission.split(".")
    if len(parts) > 1:
        wildcard_perm = f"{parts[0]}.*"
        if wildcard_perm in permissions:
            return True
            
    return False

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload = verify_token(request)
        if not payload:
            return jsonify({"error": "Unauthorized"}), 401
        # Attach user to request
        setattr(request, "user", payload)
        return f(*args, **kwargs)
    return decorated

def require_permission(permission):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            payload = verify_token(request)
            if not payload:
                return jsonify({"error": "Unauthorized"}), 401
            
            if not has_permission(payload, permission):
                ip = request.remote_addr or ""
                log_audit_event("permission_denied", payload.get("sub"), payload.get("username"), payload.get("role"), ip, f"Permission denied for {permission}")
                return jsonify({"error": "Forbidden"}), 403
                
            setattr(request, "user", payload)
            return f(*args, **kwargs)
        return decorated
    return decorator
