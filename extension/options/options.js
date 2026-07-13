const form = document.getElementById("settings-form");
const kimaiBaseUrlInput = document.getElementById("kimaiBaseUrl");
const apiTokenInput = document.getElementById("apiToken");
const testBtn = document.getElementById("test-btn");
const saveBtn = document.getElementById("save-btn");
const statusEl = document.getElementById("status");

let isConnectionValidated = false;
let lastTestedBaseUrl = "";
let lastTestedToken = "";
let isTesting = false;
let isSaving = false;

function createTypedError(message, code = "UNKNOWN_ERROR", details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function canonicalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function canonicalizeToken(value) {
  return value.trim();
}

function getCurrentCanonicalValues() {
  return {
    baseUrl: canonicalizeBaseUrl(kimaiBaseUrlInput.value),
    token: canonicalizeToken(apiTokenInput.value),
  };
}

function hasValidatedCurrentInputs() {
  const current = getCurrentCanonicalValues();
  return (
    isConnectionValidated &&
    current.baseUrl === lastTestedBaseUrl &&
    current.token === lastTestedToken
  );
}

function updateButtons() {
  testBtn.disabled = isTesting || isSaving;
  saveBtn.disabled = !hasValidatedCurrentInputs() || isTesting || isSaving;
}

function getOriginPatternFromBaseUrl(rawBaseUrl) {
  const normalized = canonicalizeBaseUrl(rawBaseUrl);
  if (!normalized) {
    throw createTypedError("Kimai server URL is required.", "INVALID_URL");
  }
  if (!/^https?:\/\//i.test(normalized)) {
    throw createTypedError(
      "Kimai server URL must start with http:// or https://",
      "INVALID_URL"
    );
  }
  return `${normalized}/*`;
}

function requestHostPermission(rawBaseUrl) {
  getOriginPatternFromBaseUrl(rawBaseUrl);
  const normalized = canonicalizeBaseUrl(rawBaseUrl);
  const parsed = new URL(normalized);
  const origins = [`http://${parsed.host}/*`, `https://${parsed.host}/*`];

  return new Promise((resolve, reject) => {
    chrome.permissions.contains({ origins }, (hasPermission) => {
      if (chrome.runtime.lastError) {
        reject(createTypedError(chrome.runtime.lastError.message, "CHROME_RUNTIME_ERROR"));
        return;
      }

      if (hasPermission) {
        resolve(true);
        return;
      }

      chrome.permissions.request({ origins }, (granted) => {
        if (chrome.runtime.lastError) {
          reject(createTypedError(chrome.runtime.lastError.message, "CHROME_RUNTIME_ERROR"));
          return;
        }
        if (!granted) {
          reject(
            createTypedError(
              "Host permission required. Please allow access to your Kimai server domain.",
              "PERMISSION_DENIED"
            )
          );
          return;
        }
        resolve(true);
      });
    });
  });
}

function invalidateValidation({ clearStatus = false } = {}) {
  isConnectionValidated = false;
  lastTestedBaseUrl = "";
  lastTestedToken = "";
  if (clearStatus) {
    setStatus("", "info");
  }
  updateButtons();
}

async function loadSettings() {
  const { kimaiBaseUrl, apiToken } = await chrome.storage.local.get([
    "kimaiBaseUrl",
    "apiToken",
  ]);

  if (kimaiBaseUrl) {
    kimaiBaseUrlInput.value = kimaiBaseUrl;
  }
  if (apiToken) {
    apiTokenInput.value = apiToken;
  }

  invalidateValidation({ clearStatus: true });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(createTypedError(chrome.runtime.lastError.message, "CHROME_RUNTIME_ERROR"));
        return;
      }
      if (!response?.ok) {
        const payload = response?.error;
        if (payload && typeof payload === "object") {
          reject(createTypedError(payload.message || "Request failed", payload.code, payload.details));
          return;
        }
        reject(createTypedError(payload || "Request failed", "UNKNOWN_ERROR"));
        return;
      }
      resolve(response.data);
    });
  });
}

function getUiErrorMessage(error) {
  switch (error?.code) {
    case "INVALID_URL":
      return "Invalid URL. Use http:// or https:// and remove trailing slash.";
    case "INVALID_TOKEN":
      return "API token is required.";
    case "PERMISSION_DENIED":
      return "Host permission required. Please allow access and test again.";
    case "NETWORK_ERROR":
      return "Cannot reach Kimai server. If this is an internal server with a private certificate, run install-ca.sh once (see README).";
    case "CERT_NOT_TRUSTED":
      return (error?.message ||
        "HTTPS certificate not trusted. Run install-ca.sh once to install the private CA, then restart the browser.");
    case "CERT_TRUST_REQUIRED":
      return (error?.message ||
        "HTTPS certificate not trusted. Run install-ca.sh once to install the private CA, then restart the browser.");
    case "TIMEOUT":
      return "Connection timeout. Kimai server is not responding.";
    case "HTTP_401":
      return "Unauthorized (401). Check your API token.";
    case "HTTP_404":
      return "API endpoint not found (404). Verify your Kimai base URL.";
    case "HTTP_5XX":
      return "Kimai server error (5xx). Please try again later.";
    case "MISSING_SETTINGS":
      return "Please configure Kimai URL and API token first.";
    default:
      return error?.message || "Request failed";
  }
}

async function testConnection() {
  isTesting = true;
  updateButtons();
  setStatus("Testing connection...", "info");

  try {
    await requestHostPermission(kimaiBaseUrlInput.value);
    const result = await sendMessage({
      type: "testConnection",
      kimaiBaseUrl: kimaiBaseUrlInput.value,
      apiToken: apiTokenInput.value,
    });
    // If server redirected http → https, update the URL field with the effective HTTPS URL
    if (result?.effectiveBaseUrl) {
      const effective = result.effectiveBaseUrl;
      if (effective !== canonicalizeBaseUrl(kimaiBaseUrlInput.value)) {
        kimaiBaseUrlInput.value = effective;
      }
    }
    const current = getCurrentCanonicalValues();
    isConnectionValidated = true;
    lastTestedBaseUrl = current.baseUrl;
    lastTestedToken = current.token;
    setStatus("Connection successful. You can now save.", "success");
  } catch (error) {
    invalidateValidation();
    setStatus(getUiErrorMessage(error), "error");
  } finally {
    isTesting = false;
    updateButtons();
  }
}

async function saveSettings(event) {
  event.preventDefault();

  if (!hasValidatedCurrentInputs()) {
    setStatus("Please test connection before saving.", "error");
    updateButtons();
    return;
  }

  isSaving = true;
  updateButtons();
  setStatus("Saving...", "info");

  try {
    await requestHostPermission(kimaiBaseUrlInput.value);
    const data = await sendMessage({
      type: "saveSettings",
      kimaiBaseUrl: kimaiBaseUrlInput.value,
      apiToken: apiTokenInput.value,
    });
    kimaiBaseUrlInput.value = data.kimaiBaseUrl;
    setStatus("Settings saved.", "success");
  } catch (error) {
    setStatus(getUiErrorMessage(error), "error");
  } finally {
    isSaving = false;
    updateButtons();
  }
}

function onSettingsInputChange() {
  invalidateValidation();
}

testBtn.addEventListener("click", testConnection);
form.addEventListener("submit", saveSettings);
kimaiBaseUrlInput.addEventListener("input", onSettingsInputChange);
apiTokenInput.addEventListener("input", onSettingsInputChange);
loadSettings();
