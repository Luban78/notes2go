if (window.Capacitor?.isNativePlatform?.()) {
  document.body.classList.add("nativeApp");
}

function updateVisualViewport() {
  const viewport = window.visualViewport;

  if (viewport) {
    document.documentElement.style.setProperty(
      "--visual-height",
      `${viewport.height}px`
    );

    document.documentElement.style.setProperty(
      "--visual-top",
      `${viewport.offsetTop}px`
    );
  }
}

updateVisualViewport();

if (window.visualViewport) {
  window.visualViewport.addEventListener(
    "resize",
    updateVisualViewport
  );

  window.visualViewport.addEventListener(
    "scroll",
    updateVisualViewport
  );
}
const mainMenuButton = document.getElementById("mainMenuButton");
const mainMenu = document.getElementById("mainMenu");

mainMenuButton.addEventListener("click", () => {
  mainMenu.hidden = !mainMenu.hidden;
});

let activeTaskIndex = null;
let reminderEnabled = false;
const exportButton = document.getElementById("exportButton");

exportButton.addEventListener("click", () => {
  exportTasks();
});
const editorBackButton = document.getElementById("editorBackButton");

const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const taskNote = document.getElementById("taskNote");
const taskDate = document.getElementById("taskDate");

const reminderButton = document.getElementById("reminderButton");

const importButton = document.getElementById("importButton");
const importFile = document.getElementById("importFile");

importButton.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", () => {
  const file = importFile.files[0];

  if (file) {
    importTasks(file);
  }
});

const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
modalText.addEventListener("scroll", () => {
  if (modalText.scrollTop > 20) {
    taskModal.classList.add("titleCollapsed");
  } else {
    taskModal.classList.remove("titleCollapsed");
  }
});

const editorTopActions = document.querySelector(".editorTopActions");
const editorBottomBar = document.querySelector(".editorBottomBar");


modalText.addEventListener("focus", () => {
  taskModal.classList.add("editing");
  
});

modalText.addEventListener("blur", () => {
  taskModal.classList.remove("editing");
});

const modalDate = document.getElementById("modalDate");

const modalTime = document.getElementById("modalTime");
const modalWeekday = document.getElementById("modalWeekday");
function updateModalWeekday() {
  if (!modalDate.value) {
    modalWeekday.textContent = "";
    return;
  }

  const date = new Date(`${modalDate.value}T12:00`);

  const weekdays = [
    "Ne",
    "Po",
    "Út",
    "St",
    "Čt",
    "Pá",
    "So"
  ];

  modalWeekday.textContent = weekdays[date.getDay()];
}
modalDate.addEventListener("change", updateModalWeekday);




const taskModal = document.getElementById("taskModal");
const karty = document.querySelector(".karty");
const addTaskButton = document.getElementById("addTaskButton");




/* ========================================
   OTEVŘENÍ NOVÉ POZNÁMKY PŘES +
======================================== */

addTaskButton.addEventListener("click", () => {
  activeTaskIndex = null;
  
  modalTitle.value = "";
  modalText.value = "";
  modalDate.value = "";
  modalTime.value = "";
  reminderEnabled = false;
updateReminderButton(false);

  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");
  
  modalTitle.focus();
});


/* ========================================
   ZAVŘENÍ EDITORU A AUTOMATICKÉ ULOŽENÍ
======================================== */

editorBackButton.addEventListener("click", () => {
  const title = modalTitle.value.trim();
  const note = modalText.value;
  const date =
  modalDate.value && modalTime.value ?
  `${modalDate.value}T${modalTime.value}` :
  "";
  
  if (activeTaskIndex !== null) {
    const tasks = loadTask();
    const currentTask = tasks[activeTaskIndex];
    
    if (currentTask) {
      const updatedTask = {
  ...currentTask,
  title,
  note,
  date,
  reminder: reminderEnabled,
  notificationId:
    currentTask.notificationId ||
    Date.now() % 2147483647,
  area: activeArea,
  tags: [...activeTags]
};
      
      updateTask(activeTaskIndex, updatedTask);
      if (updatedTask.reminder && updatedTask.date) {
  scheduleNotification(
    updatedTask.notificationId,
    updatedTask.title,
    updatedTask.date
  );
      }else {
  cancelNotification(updatedTask.notificationId);
      }
    }
  } else {
    const isEmpty =
      title === "" &&
      note.trim() === "" &&
      date === "";
    
    if (!isEmpty) {
      const newTask = {
  title,
  note,
  date,
  completed: false,
  reminder: reminderEnabled,
  notificationId: Date.now() % 2147483647,
  area: activeArea,
  tags: [...activeTags]
};
      
      saveTask(newTask);
      if (newTask.reminder && newTask.date) {
  scheduleNotification(
    newTask.notificationId,
    newTask.title,
    newTask.date
  );
      }
    }
  }
  
  renderTasks();
  
  taskModal.classList.remove("show");
  
  setTimeout(() => {
    taskModal.hidden = true;
  }, 250);
  
  document.body.classList.remove("noScroll");
  activeTaskIndex = null;
});


/* ========================================
   STARÝ FORMULÁŘ
   Zatím funguje, později ho schováme.
======================================== */

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  
  const title = taskTitle.value.trim();
  const note = taskNote.value;
  const date = taskDate.value;
  
  if (title === "") {
    return;
  }
  
  const newTask = {
    title,
    note,
    date,
    completed: false
  };
  
  saveTask(newTask);
  renderTasks();
  
  taskTitle.value = "";
  taskNote.value = "";
  taskDate.value = "";
});


/* ========================================
   VYKRESLENÍ VŠECH KARET
======================================== */

function renderTasks() {
  karty.innerHTML = "";
  
  const loadedTasks = loadTask();
  
  loadedTasks.forEach((loadedTask, index) => {
    if (!taskMatchesArea(loadedTask)) {
  return;
}
if (!taskMatchesTag(loadedTask)) {
  return;
}
    const loadedCard = document.createElement("div");
    loadedCard.classList.add("taskCard");
    
    const loadedHeading = document.createElement("h3");
    loadedHeading.textContent =
      loadedTask.title || "Bez názvu";
    const loadedArea = document.createElement("span");
loadedArea.classList.add("taskArea");

if (loadedTask.area === "work") {
  loadedArea.textContent = "💼 Pracovní";
} else {
  loadedArea.textContent = "🏠 Soukromé";
}
    const loadedNoteText = document.createElement("p");
    loadedNoteText.textContent = loadedTask.note;
    loadedNoteText.classList.add("taskNoteText");
    
    const loadedDateText = document.createElement("p");
    
    
    if (loadedTask.date) {
  const formattedDate = new Date(loadedTask.date).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  
  loadedDateText.textContent = formattedDate;
} else {
  loadedDateText.textContent = "";
}
    
    const loadedCompleteButton =
      document.createElement("button");
    
    loadedCompleteButton.textContent = "✅ Hotovo";
    
    const loadedDeleteButton =
      document.createElement("button");
    
    loadedDeleteButton.textContent = "🗑️ Smazat";
    
    loadedCompleteButton.classList.add("taskActionButton", "completeTaskButton");
loadedDeleteButton.classList.add("taskActionButton", "deleteTaskButton");
    const loadedActions = document.createElement("div");
loadedActions.classList.add("taskActions");

loadedActions.append(
  loadedCompleteButton,
  loadedDeleteButton
);
const loadedTags = document.createElement("div");
loadedCard.append(
  loadedHeading,
  loadedArea,
  loadedTags,
  loadedNoteText,
  loadedDateText,
  loadedActions
);

loadedTags.classList.add("taskTags");

const taskTags = loadedTask.tags || [];

taskTags.forEach(tag => {
  const tagBadge = document.createElement("span");
  tagBadge.classList.add("taskTag");
  tagBadge.textContent = tag;

  loadedTags.append(tagBadge);
});
    if (loadedTask.completed) {
      loadedCard.classList.add("completed");
    }
    
    karty.append(loadedCard);
    
    
    /* Otevření existující poznámky */
    
    loadedCard.addEventListener("click", () => {
      const currentTasks = loadTask();
      const currentTask = currentTasks[index];
      reminderEnabled = currentTask.reminder === true;
updateReminderButton(reminderEnabled);
activeArea = currentTask.area || "private";
activeTags = currentTask.tags || [];
updateTagMenuUI();
closeTagMenu();
      
      if (!currentTask) {
        return;
      }
      
      activeTaskIndex = index;
      
      modalTitle.value = currentTask.title;
      modalText.value = currentTask.note;
      if (currentTask.date) {
  const [savedDate, savedTime] = currentTask.date.split("T");
  
  modalDate.value = savedDate || "";
  modalTime.value = savedTime || "";
  updateModalWeekday();
} else {
  modalDate.value = "";
  modalTime.value = "";
  updateModalWeekday();
}
      
      taskModal.hidden = false;
      taskModal.classList.add("show");
      document.body.classList.add("noScroll");
    });
    
    
    /* Přepnutí stavu Hotovo */
    
    loadedCompleteButton.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        
        toggleTaskCompleted(index);
        renderTasks();
      }
    );
    
    
    /* Smazání poznámky */
    
    loadedDeleteButton.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();

    const tasks = loadTask();
    const taskToDelete = tasks[index];

    if (taskToDelete?.notificationId) {
      cancelNotification(taskToDelete.notificationId);
    }

    deleteTask(index);
    renderTasks();
  }
);
  });
}


/* ========================================
   PRVNÍ VYKRESLENÍ PO SPUŠTĚNÍ
======================================== */

renderTasks();