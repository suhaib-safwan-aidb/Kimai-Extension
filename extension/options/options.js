const form = document.getElementById("settings-form");
const apiTokenInput = document.getElementById("apiToken");
const testBtn = document.getElementById("test-btn");
const saveBtn = document.getElementById("save-btn");
const statusEl = document.getElementById("status");

let isConnectionValidated = false;
let lastTestedToken = "";
let isTesting = false;
let isSaving = false;

function createTypedError(message, code = "UNKNOWN_ERROR") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function canonicalizeToken(value) {
  return value.trim();
}

function hasValidatedCurrentInputs() {
  const current = canonicalizeToken(apiTokenInput.value);
  return isConnectionValidated && current === lastTestedToken;
}

function updateButtons() {
  testBtn.disabled = isTesting || isSaving;
  saveBtn.disabled = !hasValidatedCurrentInputs() || isTesting || isSaving;
}

function invalidateValidation({ clearStatus = false } = {}) {
  isConnectionValidated = false;
  lastTestedToken = "";
  if (clearStatus) {
    setStatus("", "info");
  }
  updateButtons();
}

async function loadSettings() {
  const { apiToken } = await chrome.storage.session.get(["apiToken"]);
  if (apiToken) {
    apiTokenInput.value = apiToken;
    setStatus("Session token is loaded. Test and save again if you changed it.", "info");
  }
  invalidateValidation({ clearStatus: !apiToken });
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
          reject(createTypedError(payload.message || "Request failed", payload.code));
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
    case "INVALID_TOKEN":
      return "API token is required.";
    case "NETWORK_ERROR":
      return "Cannot reach local Flask API at http://localhost:5000. Start flask-kimai/app.py first.";
    case "HTTP_401":
      return "Unauthorized (401). Check your API token.";
    case "MISSING_SETTINGS":
      return "Please add token first.";
    default:
      return error?.message || "Request failed";
  }
}

async function testConnection() {
  isTesting = true;
  updateButtons();
  setStatus("Testing connection to local Flask API...", "info");

  try {
    await sendMessage({
      type: "testConnection",
      apiToken: apiTokenInput.value,
    });
    const current = canonicalizeToken(apiTokenInput.value);
    isConnectionValidated = true;
    lastTestedToken = current;
    setStatus("Connection successful. You can now save token for this session.", "success");
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
  setStatus("Saving session token...", "info");

  try {
    await sendMessage({
      type: "saveToken",
      apiToken: apiTokenInput.value,
    });
    setStatus("Token saved for this browser session.", "success");
  } catch (error) {
    setStatus(getUiErrorMessage(error), "error");
  } finally {
    isSaving = false;
    updateButtons();
  }
}

function onTokenInputChange() {
  invalidateValidation();
}

testBtn.addEventListener("click", testConnection);
form.addEventListener("submit", saveSettings);
apiTokenInput.addEventListener("input", onTokenInputChange);
loadSettings();
