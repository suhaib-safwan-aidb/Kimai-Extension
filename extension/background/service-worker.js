const FLASK_BASE_URL = "http://localhost:5000";

class KimaiApiError extends Error {
  constructor(message, { code = "UNKNOWN_ERROR", status, details } = {}) {
    super(message);
    this.name = "KimaiApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Clear session-scoped data whenever extension is (re)loaded/updated.
// This forces the user through settings Test + Save each reload.
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.session.remove(["apiToken", "runningTask"]);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
  return true;
});

function serializeError(error) {
  if (error && typeof error === "object") {
    return {
      message: error.message || String(error),
      code: error.code || "UNKNOWN_ERROR",
      status: typeof error.status === "number" ? error.status : undefined,
      details: error.details,
    };
  }
  return {
    message: String(error),
    code: "UNKNOWN_ERROR",
  };
}

async function handleMessage(message) {
  switch (message.type) {
    case "getProjects":
      return getProjects();
    case "getTasksByProject":
      return getTasksByProject(message.projectId, message.term);
    case "testConnection":
      return testConnection(message.apiToken);
    case "saveToken":
      return saveToken(message.apiToken);
    case "getSessionToken":
      return getSessionToken();
    case "startTask":
      return startTaskMessage(message.activityId);
    case "stopTask":
      return stopTaskMessage(message.timesheetId);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function getProjects() {
  const token = await requireSessionToken();
  return fetchProjectsFromFlask(token);
}

async function getTasksByProject(projectId, term) {
  const token = await requireSessionToken();
  const tasks = await fetchTasksByProjectFromFlask(token, projectId);

  const needle = String(term || "").trim().toLowerCase();
  if (!needle) {
    return tasks;
  }

  return tasks.filter((task) => {
    const name = String(task?.name || "").toLowerCase();
    const comment = String(task?.comment || "").toLowerCase();
    return name.includes(needle) || comment.includes(needle);
  });
}

async function testConnection(apiToken) {
  if (!apiToken || !apiToken.trim()) {
    throw new KimaiApiError("API token is required.", { code: "INVALID_TOKEN" });
  }
  const projects = await fetchProjectsFromFlask(apiToken.trim());
  return { count: projects.length };
}

async function saveToken(apiToken) {
  if (!apiToken || !apiToken.trim()) {
    throw new KimaiApiError("API token is required.", { code: "INVALID_TOKEN" });
  }
  await chrome.storage.session.set({ apiToken: apiToken.trim() });
  return { saved: true };
}

async function getSessionToken() {
  const { apiToken } = await chrome.storage.session.get(["apiToken"]);
  return { hasToken: Boolean(apiToken) };
}

async function requireSessionToken() {
  const { apiToken } = await chrome.storage.session.get(["apiToken"]);
  if (!apiToken) {
    throw new KimaiApiError("Please set your API token in extension options first.", {
      code: "MISSING_SETTINGS",
    });
  }
  return apiToken;
}

async function fetchTasksFromFlask(token) {
  let response;
  try {
    response = await fetch(`${FLASK_BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    throw new KimaiApiError(
      "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.",
      {
        code: "NETWORK_ERROR",
        details: { reason: error?.message || String(error) },
      }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KimaiApiError(payload?.error || "Flask API request failed", {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }
  return Array.isArray(payload?.tasks) ? payload.tasks : [];
}

async function fetchProjectsFromFlask(token) {
  let response;
  try {
    response = await fetch(`${FLASK_BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    throw new KimaiApiError(
      "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.",
      {
        code: "NETWORK_ERROR",
        details: { reason: error?.message || String(error) },
      }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KimaiApiError(payload?.error || "Flask API request failed", {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }
  return Array.isArray(payload?.projects) ? payload.projects : [];
}

async function fetchTasksByProjectFromFlask(token, projectId) {
  const parsedProjectId = Number(projectId);
  if (!Number.isInteger(parsedProjectId)) {
    throw new KimaiApiError("projectId must be an integer.", { code: "INVALID_PROJECT_ID" });
  }

  let response;
  try {
    response = await fetch(`${FLASK_BASE_URL}/api/tasks/by-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, projectId: parsedProjectId }),
    });
  } catch (error) {
    throw new KimaiApiError(
      "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.",
      {
        code: "NETWORK_ERROR",
        details: { reason: error?.message || String(error) },
      }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KimaiApiError(payload?.error || "Flask API request failed", {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }
  return Array.isArray(payload?.tasks) ? payload.tasks : [];
}

async function startTaskMessage(activityId) {
  const token = await requireSessionToken();
  const parsedActivityId = Number(activityId);
  if (!Number.isInteger(parsedActivityId)) {
    throw new KimaiApiError("activityId must be an integer.", { code: "INVALID_ACTIVITY_ID" });
  }

  let response;
  try {
    response = await fetch(`${FLASK_BASE_URL}/api/tasks/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, activityId: parsedActivityId }),
    });
  } catch (error) {
    throw new KimaiApiError(
      "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.",
      {
        code: "NETWORK_ERROR",
        details: { reason: error?.message || String(error) },
      }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KimaiApiError(payload?.error || "Failed to start task", {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }
  return payload?.timesheet || {};
}

async function stopTaskMessage(timesheetId) {
  const token = await requireSessionToken();
  const parsedTimesheetId = Number(timesheetId);
  if (!Number.isInteger(parsedTimesheetId)) {
    throw new KimaiApiError("timesheetId must be an integer.", { code: "INVALID_TIMESHEET_ID" });
  }

  let response;
  try {
    response = await fetch(`${FLASK_BASE_URL}/api/tasks/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, timesheetId: parsedTimesheetId }),
    });
  } catch (error) {
    throw new KimaiApiError(
      "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.",
      {
        code: "NETWORK_ERROR",
        details: { reason: error?.message || String(error) },
      }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KimaiApiError(payload?.error || "Failed to stop task", {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }
  return payload?.timesheet || {};
}
