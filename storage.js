function saveTask(task) {
  const tasks = loadTask();
  tasks.push(task);
  saveAllTasks(tasks);
}

function loadTask() {
  const savedTask = localStorage.getItem("savedTask");

  if (!savedTask) {
    return [];
  }

  try {
    const parsedTask = JSON.parse(savedTask);
    return Array.isArray(parsedTask) ? parsedTask : [];
  } catch (error) {
    console.error("Local data load error:", error);
    return [];
  }
}

function deleteTask(index) {
  const tasks = loadTask();
  tasks.splice(index, 1);
  saveAllTasks(tasks);
}

function toggleTaskCompleted(index) {
  const tasks = loadTask();
  const task = tasks[index];

  if (!task) {
    return null;
  }

  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  saveAllTasks(tasks);

  return task;
}

function updateTask(index, updatedTask) {
  const tasks = loadTask();
  tasks[index] = updatedTask;
  saveAllTasks(tasks);
}

function exportTasks() {
  const tasks = loadTask();
  const data = JSON.stringify(tasks, null, 2);
  const blob = new Blob([data], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "lubanote-backup.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function importTasks(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const importedTasks = JSON.parse(reader.result);

      if (!Array.isArray(importedTasks)) {
        throw new Error("Invalid backup format");
      }

      const importedAt = new Date().toISOString();
      const normalizedTasks = importedTasks.map((task) => ({
        ...task,
        id: task.id || crypto.randomUUID(),
        updatedAt: task.updatedAt || importedAt,
        todos: Array.isArray(task.todos) ? task.todos : [],
        tags: Array.isArray(task.tags) ? task.tags : []
      }));

      saveAllTasks(normalizedTasks);
      location.reload();
    } catch (error) {
      console.error("Import backup error:", error);
      zobrazZpravuAplikace(
  "Záloha a obnova",
  "Soubor není platná záloha LubaNote."
);
    }
  };

  reader.readAsText(file);
}

function saveAllTasks(tasks) {
  localStorage.setItem(
    "savedTask",
    JSON.stringify(tasks)
  );
}
