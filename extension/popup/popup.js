const setupPrompt = document.getElementById("setup-prompt");
const mainContent = document.getElementById("main-content");
const runningTaskEl = document.getElementById("running-task");
const runningTitleEl = document.getElementById("running-title");
const runningTimerEl = document.getElementById("running-timer");
const stopBtn = document.getElementById("stop-btn");
const projectSelect = document.getElementById("project-select");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const toastEl = document.getElementById("toast");
const optionsLink = document.getElementById("options-link");
const openOptionsBtn = document.getElementById("open-options-btn");
const descriptionModal = document.getElementById("description-modal");
const descriptionInput = document.getElementById("description-input");
const charCount = document.getElementById("char-count");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");

let allTasksForProject = [];
let filteredTasks = [];
let selectedIndex = -1;
let loadRequestId = 0;
let runningTask = null;
let timerInterval = null;
let pendingActivityForStart = null;

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
  if (activity.parentTitle) {
    return activity.parentTitle;
  }
  if (activity.project) {
    return `Project #${activity.project.id ?? activity.project}`;
  }
  return "Unknown project";
}

function renderResults() {
  resultsEl.innerHTML = "";

  if (!filteredTasks.length) {
    return;
  }

  filteredTasks.forEach((activity, index) => {
    const item = document.createElement("li");
    item.className = `result-item${index === selectedIndex ? " selected" : ""}`;
    item.role = "option";
    item.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = getActivityLabel(activity);

    const subtitle = document.createElement("div");
    subtitle.className = "result-subtitle";
    subtitle.textContent = `${getProjectLabel(activity)}${activity.comment ? ` | ${activity.comment}` : ""}`;

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "result-actions";

    // Check if this is the running task
    const isRunning = runningTask && runningTask.activityId === activity.id;
    
    const startBtn = document.createElement("button");
    startBtn.className = `start-btn${isRunning ? " running" : ""}`;
    startBtn.textContent = isRunning ? "Running" : "Start";
    startBtn.disabled = isRunning || (runningTask !== null);
    startBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startTaskClick(activity);
    });

    actionsDiv.appendChild(startBtn);
    item.appendChild(title);
    item.appendChild(subtitle);
    item.appendChild(actionsDiv);
    item.addEventListener("click", () => selectTask(activity));
    resultsEl.appendChild(item);
  });
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function updateRunningTimer() {
  if (!runningTask) return;
  
  const elapsedMs = Date.now() - runningTask.startTime;
  const seconds = Math.floor(elapsedMs / 1000);
  runningTimerEl.textContent = formatTime(seconds);
}

function showRunningTaskUI() {
  setupPrompt.classList.add("hidden");
  mainContent.classList.add("hidden");
  runningTaskEl.classList.remove("hidden");
  
  runningTitleEl.textContent = runningTask.taskName || `Task #${runningTask.activityId}`;
  updateRunningTimer();
  
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(updateRunningTimer, 1000);
}

function showSearchUI() {
  setupPrompt.classList.add("hidden");
  mainContent.classList.remove("hidden");
  runningTaskEl.classList.add("hidden");
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function showSetupUI() {
  setupPrompt.classList.remove("hidden");
  mainContent.classList.add("hidden");
  runningTaskEl.classList.add("hidden");
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function applySearchFilter() {
  const needle = searchInput.value.trim().toLowerCase();
  if (!needle) {
    filteredTasks = [...allTasksForProject];
  } else {
    filteredTasks = allTasksForProject.filter((task) => {
      const name = String(task?.name || "").toLowerCase();
      const comment = String(task?.comment || "").toLowerCase();
      return name.includes(needle) || comment.includes(needle);
    });
  }

  selectedIndex = filteredTasks.length ? 0 : -1;
  renderResults();
  setStatus(filteredTasks.length ? `${filteredTasks.length} task(s)` : "No matching tasks found.");
}

function selectTask(activity) {
  const text = activity.comment || activity.name || "";
  navigator.clipboard.writeText(text).catch(() => {});
  showToast(`Selected ${getActivityLabel(activity)}`);
}

async function startTaskClick(activity) {
  if (runningTask) {
    showToast("A task is already running! Stop it first.");
    return;
  }

  // Store the activity and show modal
  pendingActivityForStart = activity;
  descriptionInput.value = "";
  charCount.textContent = "0";
  descriptionModal.classList.remove("hidden");
  descriptionInput.focus();
}

function closeDescriptionModal() {
  descriptionModal.classList.add("hidden");
  pendingActivityForStart = null;
  descriptionInput.value = "";
  charCount.textContent = "0";
}

async function confirmStartTask() {
  if (!pendingActivityForStart) {
    showToast("No task selected");
    return;
  }

  const activity = pendingActivityForStart;
  const description = descriptionInput.value.trim();

  try {
    const result = await sendMessage({
      type: "startTask",
      activityId: activity.id,
      description: description || null,
    });
    
    // Store running task info with timesheet ID
    runningTask = {
      activityId: activity.id,
      timesheetId: result.id,
      taskName: getActivityLabel(activity),
      startTime: Date.now(),
    };
    
    // Save to session storage
    await chrome.storage.session.set({ runningTask });
    
    showToast(`Started: ${getActivityLabel(activity)}`);
    closeDescriptionModal();
    showRunningTaskUI();
    renderResults();
  } catch (error) {
    showToast(`Error starting task: ${error.message}`);
  }
}

async function stopTaskClick() {
  if (!runningTask) {
    showToast("No task is running");
    return;
  }

  try {
    await sendMessage({
      type: "stopTask",
      timesheetId: runningTask.timesheetId,
    });
    
    const taskName = runningTask.taskName;
    runningTask = null;
    
    // Clear from session storage
    await chrome.storage.session.remove(["runningTask"]);
    
    showToast(`Stopped: ${taskName}`);
    showSearchUI();
    await loadProjects();
  } catch (error) {
    showToast(`Error stopping task: ${error.message}`);
  }
}

async function loadProjects() {
  setStatus("Loading projects...");
  projectSelect.disabled = true;
  projectSelect.innerHTML = '<option value="">Loading projects...</option>';

  const projects = await sendMessage({ type: "getProjects" });
  projectSelect.innerHTML = "";

  if (!projects.length) {
    projectSelect.innerHTML = '<option value="">No projects found</option>';
    projectSelect.disabled = true;
    setStatus("No projects found.");
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a project";
  projectSelect.appendChild(placeholder);

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = String(project.id);
    option.textContent = `${project.name} (${project.taskCount})`;
    projectSelect.appendChild(option);
  }

  projectSelect.disabled = false;
  setStatus("Select a project to load tasks.");
}

async function loadTasksForSelectedProject() {
  const projectId = projectSelect.value;
  allTasksForProject = [];
  filteredTasks = [];
  selectedIndex = -1;
  renderResults();

  if (!projectId) {
    setStatus("Select a project to load tasks.");
    return;
  }

  const requestId = ++loadRequestId;
  setStatus("Loading tasks...");

  try {
    const tasks = await sendMessage({
      type: "getTasksByProject",
      projectId: Number(projectId),
      term: "",
    });
    if (requestId !== loadRequestId) {
      return;
    }

    allTasksForProject = tasks;
    applySearchFilter();
  } catch (error) {
    if (requestId !== loadRequestId) {
      return;
    }
    setStatus(error.message, "error");
  }
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

async function restoreRunningTask() {
  const data = await chrome.storage.session.get(["runningTask"]);
  if (data?.runningTask) {
    runningTask = data.runningTask;
    return true;
  }
  return false;
}

async function init() {
  const tokenState = await sendMessage({ type: "getSessionToken" }).catch(() => ({ hasToken: false }));
  if (!tokenState?.hasToken) {
    showSetupUI();
    openOptions();
    return;
  }

  // Check if there's a running task
  const hasRunningTask = await restoreRunningTask();
  
  if (hasRunningTask) {
    showRunningTaskUI();
  } else {
    showSearchUI();
    try {
      await loadProjects();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
}

searchInput.addEventListener("input", applySearchFilter);
projectSelect.addEventListener("change", loadTasksForSelectedProject);
stopBtn.addEventListener("click", stopTaskClick);

searchInput.addEventListener("keydown", (event) => {
  if (!filteredTasks.length) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredTasks.length - 1);
    renderResults();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderResults();
  } else if (event.key === "Enter" && selectedIndex >= 0) {
    event.preventDefault();
    selectTask(filteredTasks[selectedIndex]);
  }
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  openOptions();
});

openOptionsBtn.addEventListener("click", openOptions);

// Description modal event listeners
descriptionInput.addEventListener("input", (event) => {
  charCount.textContent = event.target.value.length;
});

modalCancelBtn.addEventListener("click", closeDescriptionModal);

modalConfirmBtn.addEventListener("click", confirmStartTask);

descriptionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.ctrlKey) {
    confirmStartTask();
  } else if (event.key === "Escape") {
    closeDescriptionModal();
  }
});

init();
