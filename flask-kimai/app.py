#!/usr/bin/env python3
"""Flask API for fetching Kimai Jira tasks."""

from flask import Flask, request, jsonify
from kimai_tasks import get_jira_tasks, KimaiApiError

app = Flask(__name__)


@app.route("/api/tasks", methods=["POST"])
def get_tasks():
    """Fetch Jira tasks from Kimai. Expects JSON body with 'token' field."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required in request body"}), 400

    try:
        tasks = get_jira_tasks(token)
        return jsonify({
            "success": True,
            "count": len(tasks),
            "tasks": tasks,
        })
    except KimaiApiError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": f"Unexpected error: {error}"}), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
