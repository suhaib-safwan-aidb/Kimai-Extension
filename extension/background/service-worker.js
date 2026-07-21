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
    case "searchActivities":
      return searchActivities(message.term);
    case "testConnection":
      return testConnection(message.apiToken);
    case "saveToken":
      return saveToken(message.apiToken);
    case "getSessionToken":
      return getSessionToken();
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function searchActivities(term) {
  if (!term || !term.trim()) {
    return [];
  }
  const token = await requireSessionToken();
  const tasks = await fetchTasksFromFlask(token);
  const needle = term.trim().toLowerCase();
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
  const tasks = await fetchTasksFromFlask(apiToken.trim());
  return { count: tasks.length };
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
