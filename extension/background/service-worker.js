import {
  createKimaiClient,
  KimaiApiError,
  loadKimaiClient,
  normalizeBaseUrl,
} from "../lib/kimai-client.js";

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
    case "getActiveTimesheets":
      return getActiveTimesheets();
    case "startTimer":
      return startTimer(message.activity);
    case "testConnection":
      return testConnection(message.kimaiBaseUrl, message.apiToken);
    case "saveSettings":
      return saveSettings(message.kimaiBaseUrl, message.apiToken);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function searchActivities(term) {
  if (!term?.trim()) {
    return [];
  }
  const client = await loadKimaiClient();
  return client.searchActivities(term);
}

async function getActiveTimesheets() {
  const client = await loadKimaiClient();
  return client.getActiveTimesheets();
}

async function startTimer(activity) {
  const client = await loadKimaiClient();
  return client.startTimerForActivity(activity);
}

async function ensureHostPermission(kimaiBaseUrl) {
  const normalizedUrl = normalizeBaseUrl(kimaiBaseUrl);
  // Check both http and https for the same host — the server may redirect between them.
  // options.js requests both schemes at permission-grant time.
  const { host } = new URL(normalizedUrl);
  const origins = [`http://${host}/*`, `https://${host}/*`];
  const hasPermission = await chrome.permissions.contains({ origins });

  if (!hasPermission) {
    throw new KimaiApiError(
      "Host permission is required. Please use Test connection and allow access.",
      {
        code: "PERMISSION_DENIED",
        details: { origins },
      }
    );
  }

  return normalizedUrl;
}

async function testConnection(kimaiBaseUrl, apiToken) {
  const normalizedUrl = await ensureHostPermission(kimaiBaseUrl);
  const client = createKimaiClient(normalizedUrl, apiToken);
  // testConnection() returns { effectiveBaseUrl } — may differ if server redirected http→https
  return client.testConnection();
}

async function saveSettings(kimaiBaseUrl, apiToken) {
  const normalizedUrl = await ensureHostPermission(kimaiBaseUrl);

  await chrome.storage.local.set({
    kimaiBaseUrl: normalizedUrl,
    apiToken: apiToken.trim(),
  });

  return { kimaiBaseUrl: normalizedUrl };
}
