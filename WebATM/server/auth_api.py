from flask import Blueprint, request, jsonify
import datetime
from werkzeug.security import check_password_hash, generate_password_hash

from .auth_manager import (
    load_users, save_users, create_jwt_token, verify_token, 
    log_audit_event, get_user_permissions, require_auth
)

def register_auth_routes(app):
    @app.route("/api/auth/login", methods=["POST"])
    def login():
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")
        remember_me = data.get("rememberMe", False)
        ip_addr = request.remote_addr or ""
        
        if not username or not password:
            return jsonify({"message": "Invalid username or password"}), 401
            
        users = load_users()
        user = next((u for u in users if u["username"] == username), None)
        
        if not user:
            log_audit_event("login_failed", "unknown", username, "unknown", ip_addr, "Invalid username")
            return jsonify({"message": "Invalid username or password"}), 401
            
        if user.get("status") == "disabled":
            log_audit_event("login_failed", user["id"], username, user["role"], ip_addr, "Account disabled")
            return jsonify({"message": "Invalid username or password"}), 401
            
        if not check_password_hash(user.get("passwordHash", ""), password):
            log_audit_event("login_failed", user["id"], username, user["role"], ip_addr, "Invalid password")
            return jsonify({"message": "Invalid username or password"}), 401
            
        # Update last login
        user["lastLoginAt"] = datetime.datetime.now().isoformat() + "Z"
        save_users(users)
        
        # Generate token
        token = create_jwt_token(user, remember_me)
        
        log_audit_event("login_success", user["id"], username, user["role"], ip_addr, "User logged in")
        
        return jsonify({
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "displayName": user["displayName"],
                "email": user["email"],
                "role": user["role"],
                "permissions": get_user_permissions(user["role"])
            },
            "expiresAt": (datetime.datetime.utcnow() + datetime.timedelta(hours=24*7 if remember_me else 8)).isoformat() + "Z"
        }), 200

    @app.route("/api/auth/logout", methods=["POST"])
    @require_auth
    def logout():
        payload = request.user
        ip_addr = request.remote_addr or ""
        log_audit_event("logout", payload["sub"], payload["username"], payload["role"], ip_addr, "User logged out")
        return jsonify({"ok": True}), 200

    @app.route("/api/auth/me", methods=["GET"])
    @require_auth
    def get_me():
        payload = request.user
        users = load_users()
        user = next((u for u in users if u["id"] == payload["sub"]), None)
        
        if not user or user.get("status") == "disabled":
            return jsonify({"message": "Unauthorized"}), 401
            
        return jsonify({
            "user": {
                "id": user["id"],
                "username": user["username"],
                "displayName": user["displayName"],
                "email": user["email"],
                "role": user["role"],
                "permissions": get_user_permissions(user["role"])
            }
        }), 200

    @app.route("/api/auth/change-password", methods=["POST"])
    @require_auth
    def change_password():
        payload = request.user
        data = request.json or {}
        current_password = data.get("currentPassword")
        new_password = data.get("newPassword")
        ip_addr = request.remote_addr or ""
        
        if not current_password or not new_password or len(new_password) < 8:
            return jsonify({"message": "Invalid input. New password must be at least 8 characters."}), 400
            
        users = load_users()
        user = next((u for u in users if u["id"] == payload["sub"]), None)
        
        if not user or not check_password_hash(user.get("passwordHash", ""), current_password):
            return jsonify({"message": "Invalid current password"}), 400
            
        user["passwordHash"] = generate_password_hash(new_password)
        user["updatedAt"] = datetime.datetime.now().isoformat() + "Z"
        save_users(users)
        
        log_audit_event("password_changed", user["id"], user["username"], user["role"], ip_addr, "User changed their password")
        
        return jsonify({"ok": True}), 200
