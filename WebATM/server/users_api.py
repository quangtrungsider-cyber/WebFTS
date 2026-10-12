import uuid
import datetime
from flask import request, jsonify
from werkzeug.security import generate_password_hash

from .auth_manager import (
    load_users, save_users, require_permission, log_audit_event
)

def register_users_routes(app):
    @app.route("/api/users", methods=["GET"])
    @require_permission("users.read")
    def get_users():
        users = load_users()
        # Remove passwordHash from response
        sanitized_users = []
        for u in users:
            su = dict(u)
            su.pop("passwordHash", None)
            sanitized_users.append(su)
        return jsonify(sanitized_users), 200

    @app.route("/api/users", methods=["POST"])
    @require_permission("users.create")
    def create_user():
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")
        display_name = data.get("displayName", "")
        email = data.get("email", "")
        role = data.get("role", "viewer")
        ip_addr = request.remote_addr or ""
        
        if not username or not password or len(password) < 8:
            return jsonify({"message": "Invalid input. Username is required and password must be at least 8 characters."}), 400
            
        users = load_users()
        if any(u["username"] == username for u in users):
            return jsonify({"message": "Username already exists."}), 400
            
        now = datetime.datetime.now().isoformat() + "Z"
        new_user = {
            "id": f"user-{uuid.uuid4().hex[:8]}",
            "username": username,
            "displayName": display_name,
            "email": email,
            "role": role,
            "passwordHash": generate_password_hash(password),
            "status": "active",
            "createdAt": now,
            "updatedAt": now,
            "lastLoginAt": None
        }
        
        users.append(new_user)
        save_users(users)
        
        payload = request.user
        log_audit_event("user_created", payload["sub"], payload["username"], payload["role"], ip_addr, f"Created user {username} with role {role}")
        
        # Return without passwordHash
        new_user.pop("passwordHash", None)
        return jsonify(new_user), 201

    @app.route("/api/users/<user_id>", methods=["PUT"])
    @require_permission("users.update")
    def update_user(user_id):
        data = request.json or {}
        users = load_users()
        user = next((u for u in users if u["id"] == user_id), None)
        
        if not user:
            return jsonify({"message": "User not found"}), 404
            
        old_role = user["role"]
        
        if "displayName" in data:
            user["displayName"] = data["displayName"]
        if "email" in data:
            user["email"] = data["email"]
        if "role" in data:
            user["role"] = data["role"]
        if "status" in data:
            user["status"] = data["status"]
            
        user["updatedAt"] = datetime.datetime.now().isoformat() + "Z"
        save_users(users)
        
        payload = request.user
        ip_addr = request.remote_addr or ""
        log_audit_event("user_updated", payload["sub"], payload["username"], payload["role"], ip_addr, f"Updated user {user['username']}")
        if old_role != user["role"]:
            log_audit_event("role_changed", payload["sub"], payload["username"], payload["role"], ip_addr, f"Changed role for {user['username']} from {old_role} to {user['role']}")
            
        user_copy = dict(user)
        user_copy.pop("passwordHash", None)
        return jsonify(user_copy), 200

    @app.route("/api/users/<user_id>/disable", methods=["POST"])
    @require_permission("users.disable")
    def disable_user(user_id):
        users = load_users()
        user = next((u for u in users if u["id"] == user_id), None)
        
        if not user:
            return jsonify({"message": "User not found"}), 404
            
        # Prevent disabling the last admin or yourself if you're the only admin
        # Simplify: just disable
        user["status"] = "disabled"
        user["updatedAt"] = datetime.datetime.now().isoformat() + "Z"
        save_users(users)
        
        payload = request.user
        ip_addr = request.remote_addr or ""
        log_audit_event("user_disabled", payload["sub"], payload["username"], payload["role"], ip_addr, f"Disabled user {user['username']}")
        
        return jsonify({"ok": True}), 200

    @app.route("/api/users/<user_id>/reset-password", methods=["POST"])
    @require_permission("users.update")
    def reset_password(user_id):
        data = request.json or {}
        new_password = data.get("newPassword")
        
        if not new_password or len(new_password) < 8:
            return jsonify({"message": "New password must be at least 8 characters."}), 400
            
        users = load_users()
        user = next((u for u in users if u["id"] == user_id), None)
        
        if not user:
            return jsonify({"message": "User not found"}), 404
            
        user["passwordHash"] = generate_password_hash(new_password)
        user["updatedAt"] = datetime.datetime.now().isoformat() + "Z"
        save_users(users)
        
        payload = request.user
        ip_addr = request.remote_addr or ""
        log_audit_event("password_changed", payload["sub"], payload["username"], payload["role"], ip_addr, f"Reset password for user {user['username']}")
        
        return jsonify({"ok": True}), 200
