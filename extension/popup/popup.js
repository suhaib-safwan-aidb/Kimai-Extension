const setupPrompt = document.getElementById("setup-prompt");
const mainContent = document.getElementById("main-content");
const projectSelect = document.getElementById("project-select");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const toastEl = document.getElementById("toast");
const optionsLink = document.getElementById("options-link");
const openOptionsBtn = document.getElementById("open-options-btn");

let allTasksForProject = [];
let filteredTasks = [];
let selectedIndex = -1;
let loadRequestId = 0;

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

    item.appendChild(title);
    item.appendChild(subtitle);
    item.addEventListener("click", () => selectTask(activity));
    resultsEl.appendChild(item);
  });
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

async function init() {
  const tokenState = await sendMessage({ type: "getSessionToken" }).catch(() => ({ hasToken: false }));
  if (!tokenState?.hasToken) {
    setupPrompt.classList.remove("hidden");
    mainContent.classList.add("hidden");
    return;
  }

  setupPrompt.classList.add("hidden");
  mainContent.classList.remove("hidden");
  searchInput.focus();

  try {
    await loadProjects();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

searchInput.addEventListener("input", applySearchFilter);
projectSelect.addEventListener("change", loadTasksForSelectedProject);

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
init();
