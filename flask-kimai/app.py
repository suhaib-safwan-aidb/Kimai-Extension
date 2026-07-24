#!/usr/bin/env python3
"""Flask API for fetching Kimai Jira tasks."""

from flask import Flask, request, jsonify
from kimai_tasks import (
    get_jira_tasks,
    get_jira_tasks_by_project,
    get_projects,
    start_task,
    stop_task,
    KimaiApiError,
)

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


@app.route("/api/projects", methods=["POST"])
def get_projects_api():
    """Fetch Jira projects. Expects JSON body with 'token' field."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required in request body"}), 400

    try:
        projects = get_projects(token)
        return jsonify({
            "success": True,
            "count": len(projects),
            "projects": projects,
        })
    except KimaiApiError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": f"Unexpected error: {error}"}), 500


@app.route("/api/tasks/by-project", methods=["POST"])
def get_tasks_by_project_api():
    """Fetch Jira tasks for a selected project."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required in request body"}), 400

    project_id_raw = data.get("projectId")
    try:
        project_id = int(project_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "projectId is required and must be an integer"}), 400

    try:
        tasks = get_jira_tasks_by_project(token, project_id)
        return jsonify({
            "success": True,
            "count": len(tasks),
            "tasks": tasks,
        })
    except KimaiApiError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": f"Unexpected error: {error}"}), 500


@app.route("/api/tasks/start", methods=["POST"])
def start_task_api():
    """Start a task (create timesheet entry). Expects JSON body with 'token' and 'activityId' fields."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required in request body"}), 400

    activity_id_raw = data.get("activityId")
    try:
        activity_id = int(activity_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "activityId is required and must be an integer"}), 400

    try:
        timesheet = start_task(token, activity_id)
        return jsonify({
            "success": True,
            "timesheet": timesheet,
        })
    except KimaiApiError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": f"Unexpected error: {error}"}), 500


@app.route("/api/tasks/stop", methods=["POST"])
def stop_task_api():
    """Stop a task (end timesheet entry). Expects JSON body with 'token' and 'timesheetId' fields."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required in request body"}), 400

    timesheet_id_raw = data.get("timesheetId")
    try:
        timesheet_id = int(timesheet_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "timesheetId is required and must be an integer"}), 400

    try:
        timesheet = stop_task(token, timesheet_id)
        return jsonify({
            "success": True,
            "timesheet": timesheet,
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
