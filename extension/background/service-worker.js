import { KIMAI_BASE_URL } from "../config.js";

const REQUEST_TIMEOUT_MS = 15000;

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
  return { message: String(error), code: "UNKNOWN_ERROR" };
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
      return startTaskMessage(message.activityId, message.description);
    case "stopTask":
      return stopTaskMessage(message.timesheetId);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// ── Kimai HTTP helpers ────────────────────────────────────────────────────────

async function kimaiRequest(token, method, path, body = null) {
  const url = `${KIMAI_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: controller.signal,
  };

  if (body !== null) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new KimaiApiError(`Request timed out calling ${url}.`, { code: "NETWORK_ERROR" });
    }
    throw new KimaiApiError(
      `Cannot reach Kimai server at ${KIMAI_BASE_URL}. Check your network or VPN connection.`,
      { code: "NETWORK_ERROR", details: { reason: error?.message || String(error) } }
    );
  }
  clearTimeout(timeoutId);

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const errDetail = text ? ` Response: ${text}` : "";
    throw new KimaiApiError(`HTTP ${response.status} calling ${url}.${errDetail}`, {
      code: response.status === 401 ? "HTTP_401" : `HTTP_${response.status}`,
      status: response.status,
    });
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new KimaiApiError(`Invalid JSON response from ${url}.`, { code: "PARSE_ERROR" });
  }
}

function kimaiGet(token, path, query = null) {
  let fullPath = path;
  if (query) {
    fullPath += "?" + new URLSearchParams(query).toString();
  }
  return kimaiRequest(token, "GET", fullPath);
}

function kimaiPost(token, path, body) {
  return kimaiRequest(token, "POST", path, body);
}

function kimaiPatch(token, path, body) {
  return kimaiRequest(token, "PATCH", path, body);
}

// ── Jira key / activity helpers ───────────────────────────────────────────────

function findJiraKeys(activity) {
  const haystack = [activity.name, activity.comment, activity.description]
    .filter(Boolean)
    .join(" ");
  const matches = haystack.match(/\b[A-Z][A-Z0-9]+-\d+\b/g);
  return matches ? [...new Set(matches)].sort() : [];
}

function filterJiraActivities(activities) {
  return activities.filter((activity) => findJiraKeys(activity).length > 0);
}

function getActivityProjectId(activity) {
  const project = activity.project;
  if (typeof project === "number") return project;
  if (project && typeof project === "object" && typeof project.id === "number") return project.id;
  return null;
}

function getActivityProjectName(activity, fallbackProjectId) {
  const project = activity.project;
  if (project && typeof project === "object" && project.name) return String(project.name);
  if (activity.parentTitle) return String(activity.parentTitle);
  if (fallbackProjectId !== null) return `Project #${fallbackProjectId}`;
  return "Unknown project";
}

async function fetchAllActivities(token) {
  const allItems = [];
  const seenIds = new Set();
  let page = 1;
  const size = 100;
  const maxPages = 200;

  while (page <= maxPages) {
    const data = await kimaiGet(token, "/api/activities", { page, size, full: "true" });

    if (!Array.isArray(data)) {
      throw new KimaiApiError("Unexpected API response for /api/activities (expected list).");
    }
    if (!data.length) break;

    let newItems = 0;
    for (const item of data) {
      const itemId = item.id;
      if (typeof itemId === "number") {
        if (seenIds.has(itemId)) continue;
        seenIds.add(itemId);
      }
      allItems.push(item);
      newItems++;
    }

    // Stop if a page returns no unseen items or is not a full page (last page).
    if (newItems === 0 || data.length < size) break;
    page++;
  }

  return allItems;
}

// ── Session token helpers ─────────────────────────────────────────────────────

async function requireSessionToken() {
  const { apiToken } = await chrome.storage.session.get(["apiToken"]);
  if (!apiToken) {
    throw new KimaiApiError("Please set your API token in extension options first.", {
      code: "MISSING_SETTINGS",
    });
  }
  return apiToken;
}

// ── Message handlers ──────────────────────────────────────────────────────────

async function testConnection(apiToken) {
  if (!apiToken || !apiToken.trim()) {
    throw new KimaiApiError("API token is required.", { code: "INVALID_TOKEN" });
  }
  const data = await kimaiGet(apiToken.trim(), "/api/version");
  if (!data || typeof data !== "object") {
    throw new KimaiApiError("Unexpected API response for /api/version (expected object).");
  }
  return { version: data.version || "ok" };
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

async function getProjects() {
  const token = await requireSessionToken();
  const activities = filterJiraActivities(await fetchAllActivities(token));

  const projectMap = new Map();
  for (const activity of activities) {
    const projectId = getActivityProjectId(activity);
    if (projectId === null) continue;

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        id: projectId,
        name: getActivityProjectName(activity, projectId),
        taskCount: 0,
      });
    }
    projectMap.get(projectId).taskCount++;
  }

  return [...projectMap.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

async function getTasksByProject(projectId, term) {
  const token = await requireSessionToken();
  const parsedProjectId = Number(projectId);
  if (!Number.isInteger(parsedProjectId)) {
    throw new KimaiApiError("projectId must be an integer.", { code: "INVALID_PROJECT_ID" });
  }

  const activities = filterJiraActivities(await fetchAllActivities(token));
  const projectTasks = activities.filter(
    (activity) => getActivityProjectId(activity) === parsedProjectId
  );

  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return projectTasks;

  return projectTasks.filter((task) => {
    const name = String(task?.name || "").toLowerCase();
    const comment = String(task?.comment || "").toLowerCase();
    return name.includes(needle) || comment.includes(needle);
  });
}

async function startTaskMessage(activityId, description) {
  const token = await requireSessionToken();
  const parsedActivityId = Number(activityId);
  if (!Number.isInteger(parsedActivityId)) {
    throw new KimaiApiError("activityId must be an integer.", { code: "INVALID_ACTIVITY_ID" });
  }

  const activityData = await kimaiGet(token, `/api/activities/${parsedActivityId}`);
  if (!activityData || typeof activityData !== "object") {
    throw new KimaiApiError("Activity not found.");
  }

  const rawProject = activityData.project;
  const projectId =
    typeof rawProject === "number"
      ? rawProject
      : rawProject && typeof rawProject === "object"
      ? rawProject.id
      : null;

  if (!projectId) {
    throw new KimaiApiError("Activity does not have a project assigned.");
  }

  const timesheetData = {
    activity: parsedActivityId,
    project: projectId,
    begin: new Date().toISOString(),
  };

  if (description && description.trim()) {
    timesheetData.description = description.trim();
  }

  const response = await kimaiPost(token, "/api/timesheets", timesheetData);
  if (!response || typeof response !== "object") {
    throw new KimaiApiError("Unexpected API response for /api/timesheets (expected object).");
  }
  return response;
}

async function stopTaskMessage(timesheetId) {
  const token = await requireSessionToken();
  const parsedTimesheetId = Number(timesheetId);
  if (!Number.isInteger(parsedTimesheetId)) {
    throw new KimaiApiError("timesheetId must be an integer.", { code: "INVALID_TIMESHEET_ID" });
  }

  const response = await kimaiPatch(token, `/api/timesheets/${parsedTimesheetId}`, {
    end: new Date().toISOString(),
  });

  if (!response || typeof response !== "object") {
    throw new KimaiApiError(
      "Unexpected API response for PATCH /api/timesheets (expected object)."
    );
  }
  return response;
}
