const setupPrompt = document.getElementById("setup-prompt");
const mainContent = document.getElementById("main-content");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const activeTimerEl = document.getElementById("active-timer");
const toastEl = document.getElementById("toast");
const optionsLink = document.getElementById("options-link");
const openOptionsBtn = document.getElementById("open-options-btn");

let results = [];
let selectedIndex = -1;
let debounceTimer = null;
let searchRequestId = 0;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.setTimeout(() => toastEl.classList.add("hidden"), 2500);
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        if (response?.error && typeof response.error === "object") {
          reject(new Error(response.error.message || "Request failed"));
          return;
        }
        reject(new Error(response?.error || "Request failed"));
        return;
      }
      resolve(response.data);
    });
  });
}

function getActivityLabel(activity) {
  return activity.name || `Activity #${activity.id}`;
}

function getProjectLabel(activity) {
  if (activity.project?.name) {
    return activity.project.name;
  }
  if (activity.project?.customer?.name) {
    return `${activity.project.customer.name} / Project #${activity.project.id ?? activity.project}`;
  }
  if (activity.project) {
    return `Project #${activity.project.id ?? activity.project}`;
  }
  return "Unknown project";
}

function renderResults() {
  resultsEl.innerHTML = "";

  if (!results.length) {
    return;
  }

  results.forEach((activity, index) => {
    const item = document.createElement("li");
    item.className = `result-item${index === selectedIndex ? " selected" : ""}`;
    item.role = "option";
    item.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = getActivityLabel(activity);

    const subtitle = document.createElement("div");
    subtitle.className = "result-subtitle";
    subtitle.textContent = getProjectLabel(activity);

    item.appendChild(title);
    item.appendChild(subtitle);
    item.addEventListener("click", () => startTimer(activity));
    resultsEl.appendChild(item);
  });
}

async function loadActiveTimer() {
  try {
    const activeTimesheets = await sendMessage({ type: "getActiveTimesheets" });
    if (!activeTimesheets.length) {
      activeTimerEl.classList.add("hidden");
      activeTimerEl.textContent = "";
      return;
    }

    const current = activeTimesheets[0];
    const activityName =
      current.activity?.name || current.activityName || `Activity #${current.activity}`;
    activeTimerEl.textContent = `Running: ${activityName}`;
    activeTimerEl.classList.remove("hidden");
  } catch {
    activeTimerEl.classList.add("hidden");
  }
}

async function performSearch(term) {
  const requestId = ++searchRequestId;

  if (!term.trim()) {
    results = [];
    selectedIndex = -1;
    renderResults();
    setStatus("");
    return;
  }

  setStatus("Searching...");
  try {
    const data = await sendMessage({ type: "searchActivities", term });
    if (requestId !== searchRequestId) {
      return;
    }

    results = data;
    selectedIndex = results.length ? 0 : -1;
    renderResults();
    setStatus(results.length ? `${results.length} result(s)` : "No matching tasks found.");
  } catch (error) {
    if (requestId !== searchRequestId) {
      return;
    }
    results = [];
    selectedIndex = -1;
    renderResults();
    setStatus(error.message, "error");
  }
}

async function startTimer(activity) {
  setStatus("Starting timer...");
  try {
    await sendMessage({ type: "startTimer", activity });
    showToast(`Timer started for ${getActivityLabel(activity)}`);
    setStatus("");
    await loadActiveTimer();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

async function init() {
  const { kimaiBaseUrl, apiToken } = await chrome.storage.local.get([
    "kimaiBaseUrl",
    "apiToken",
  ]);

  if (!kimaiBaseUrl || !apiToken) {
    setupPrompt.classList.remove("hidden");
    mainContent.classList.add("hidden");
    return;
  }

  setupPrompt.classList.add("hidden");
  mainContent.classList.remove("hidden");
  searchInput.focus();
  await loadActiveTimer();
}

searchInput.addEventListener("input", () => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => performSearch(searchInput.value), 300);
});

searchInput.addEventListener("keydown", (event) => {
  if (!results.length) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    renderResults();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderResults();
  } else if (event.key === "Enter" && selectedIndex >= 0) {
    event.preventDefault();
    startTimer(results[selectedIndex]);
  }
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  openOptions();
});

openOptionsBtn.addEventListener("click", openOptions);
init();
