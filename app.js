
"use strict";

const $ = (id) => document.getElementById(id);

const authPage = $("authPage");
const appPage = $("appPage");
const authForm = $("authForm");
const taskForm = $("taskForm");

let authMode = "login";
let currentUser = null;
let tasks = [];
let activeFilter = "all";
let editingTaskId = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || `Error ${response.status}`);
  }

  return data;
}

function showMessage(id, message, success = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("success", success);
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);
  $("nameGroup").classList.toggle("hidden", !registering);
  $("name").required = registering;
  $("password").autocomplete = registering
    ? "new-password"
    : "current-password";
  $("authSubmit").textContent = registering
    ? "Create account"
    : "Login";

  showMessage("authMessage", "");
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("authSubmit");
  button.disabled = true;
  showMessage("authMessage", "");

  try {
    const body = {
      email: $("email").value.trim(),
      password: $("password").value
    };

    if (authMode === "register") {
      body.name = $("name").value.trim();

      await api("/api/register", {
        method: "POST",
        body: JSON.stringify(body)
      });

      $("password").value = "";
      $("name").value = "";
      setAuthMode("login");
      showMessage(
        "authMessage",
        "Account created! Please log in.",
        true
      );
      return;
    }

    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(body)
    });

    currentUser = data.user || data;

    try {
      const me = await api("/api/me");
      currentUser = me.user || me;
    } catch {
      // Continue with the user returned by the login endpoint.
    }

    showApp();
    await loadTasks();
  } catch (error) {
    showMessage("authMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

function showApp() {
  authPage.classList.add("hidden");
  appPage.classList.remove("hidden");

  const name = currentUser?.name ||
    currentUser?.email ||
    "Student";

  $("welcomeTitle").textContent =
    `Welcome back, ${name.split(" ")[0]}!`;

  $("userAvatar").textContent =
    name.charAt(0).toUpperCase();
}

function showAuth() {
  appPage.classList.add("hidden");
  authPage.classList.remove("hidden");
  currentUser = null;
  tasks = [];
  renderTasks();
  updateDashboard();
  taskForm.classList.add("hidden");
}

$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch (error) {
    console.error("Logout error:", error);
  }

  showAuth();
  setAuthMode("login");
  showMessage("authMessage", "You have logged out.", true);
});

async function loadTasks() {
  try {
    const data = await api("/api/tasks");
    tasks = Array.isArray(data) ? data : (data.tasks || []);

    renderTasks();
    updateDashboard();
  } catch (error) {
    showMessage(
      "taskMessage",
      `Unable to load assignments: ${error.message}`
    );
  }
}

function isCompleted(task) {
  return task.completed === true ||
    task.completed === 1 ||
    task.completed === "1" ||
    task.status === "completed";
}

function getDueDate(task) {
  return String(task.due_date || task.dueDate || "").slice(0, 10);
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function renderTasks() {
  const list = $("taskList");
  list.replaceChildren();

  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === "pending") return !isCompleted(task);
    if (activeFilter === "completed") return isCompleted(task);
    return true;
  });

  $("emptyState").classList.toggle(
    "hidden",
    filteredTasks.length > 0
  );

  for (const task of filteredTasks) {
    const card = document.createElement("article");
    card.className = "task-card";

    if (isCompleted(task)) {
      card.classList.add("done");
    }

    const info = document.createElement("div");
    info.className = "task-info";

    const heading = document.createElement("h3");
    heading.textContent = task.title || "Untitled assignment";
    info.appendChild(heading);

    if (task.description) {
      const description = document.createElement("p");
      description.textContent = task.description;
      info.appendChild(description);
    }

    const dueDate = getDueDate(task);

    if (dueDate) {
      const date = document.createElement("p");
      date.textContent = `Due date: ${dueDate}`;
      info.appendChild(date);
    }

    const status = document.createElement("span");
    status.className = "status-label";
    status.textContent = isCompleted(task) ? "Completed" : "Pending";

    if (isCompleted(task)) {
      status.classList.add("done-label");
    }

    info.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.className = "small-btn";
    completeButton.textContent = isCompleted(task)
      ? "Mark pending"
      : "Complete";

    completeButton.addEventListener("click", () => toggleTask(task));
    actions.appendChild(completeButton);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-btn";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openEditForm(task));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-btn danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteTask(task));
    actions.appendChild(deleteButton);

    card.append(info, actions);
    list.appendChild(card);
  }
}

function updateDashboard() {
  const total = tasks.length;
  const completed = tasks.filter(isCompleted).length;
  const pending = total - completed;
  const percent = total
    ? Math.round((completed / total) * 100)
    : 0;

  $("totalCount").textContent = total;
  $("pendingCount").textContent = pending;
  $("completedCount").textContent = completed;

  $("progressPercent").textContent = `${percent}%`;
  $("progressBar").style.width = `${percent}%`;

  $("progressText").textContent = total
    ? `${completed} of ${total} assignments completed.`
    : "Add your first assignment to track your progress.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayString = localDateString(today);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekString = localDateString(nextWeek);

  let dueToday = 0;
  let overdue = 0;
  let upcoming = 0;

  for (const task of tasks) {
    if (isCompleted(task)) continue;

    const due = getDueDate(task);
    if (!due) continue;

    if (due === todayString) dueToday++;
    if (due < todayString) overdue++;

    if (due > todayString && due <= nextWeekString) {
      upcoming++;
    }
  }

  $("dueTodayCount").textContent = dueToday;
  $("overdueCount").textContent = overdue;
  $("upcomingCount").textContent = upcoming;
}

function openNewTaskForm() {
  editingTaskId = null;
  taskForm.reset();

  $("formHeading").textContent = "Add a new task";
  $("saveTaskBtn").textContent = "Save task";
  showMessage("taskMessage", "");

  taskForm.classList.remove("hidden");
  $("taskTitle").focus();

  taskForm.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function openEditForm(task) {
  editingTaskId = task.id;

  $("taskTitle").value = task.title || "";
  $("taskDescription").value = task.description || "";
  $("taskDueDate").value = getDueDate(task);

  $("formHeading").textContent = "Edit task";
  $("saveTaskBtn").textContent = "Update task";
  showMessage("taskMessage", "");

  taskForm.classList.remove("hidden");
  $("taskTitle").focus();

  taskForm.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

$("addTaskBtn").addEventListener("click", openNewTaskForm);
$("emptyAddTaskBtn").addEventListener("click", openNewTaskForm);

$("cancelTaskBtn").addEventListener("click", () => {
  taskForm.reset();
  taskForm.classList.add("hidden");
  editingTaskId = null;
  showMessage("taskMessage", "");
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("saveTaskBtn");
  button.disabled = true;
  showMessage("taskMessage", "");

  const body = {
    title: $("taskTitle").value.trim(),
    description: $("taskDescription").value.trim(),
    due_date: $("taskDueDate").value
  };

  if (!body.title) {
    showMessage("taskMessage", "Please enter an assignment title.");
    button.disabled = false;
    return;
  }

  try {
    if (editingTaskId !== null) {
      await api(`/api/tasks/${editingTaskId}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
    } else {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify(body)
      });
    }

    taskForm.reset();
    taskForm.classList.add("hidden");
    editingTaskId = null;

    await loadTasks();
    showMessage("taskMessage", "");
  } catch (error) {
    showMessage("taskMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

async function toggleTask(task) {
  const updated = {
    title: task.title,
    description: task.description || "",
    due_date: getDueDate(task),
    completed: !isCompleted(task)
  };

  try {
    await api(`/api/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify(updated)
    });

    await loadTasks();
  } catch (error) {
    alert(`Could not update task: ${error.message}`);
  }
}

async function deleteTask(task) {
  if (!confirm(`Delete "${task.title}"?`)) return;

  try {
    await api(`/api/tasks/${task.id}`, {
      method: "DELETE"
    });

    await loadTasks();
  } catch (error) {
    alert(`Could not delete task: ${error.message}`);
  }
}

$("taskFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;

  activeFilter = button.dataset.filter;

  document.querySelectorAll("[data-filter]").forEach((filterButton) => {
    filterButton.classList.toggle(
      "active",
      filterButton === button
    );
  });

  renderTasks();
});

// Check whether an existing login session is available.
async function startApp() {
  setAuthMode("login");

  try {
    const data = await api("/api/me");
    currentUser = data.user || data;

    if (!currentUser || !currentUser.email) {
      showAuth();
      return;
    }

    showApp();
    await loadTasks();
  } catch {
    showAuth();
  }
}

startApp();
