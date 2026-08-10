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
const deleteConfirmModal =
  document.getElementById("deleteConfirmModal");

const cancelDeleteButton =
  document.getElementById("cancelDeleteButton");

const confirmDeleteButton =
  document.getElementById("confirmDeleteButton");
  

  
  
cancelDeleteButton.addEventListener("click", () => {
  deleteConfirmModal.hidden = true;
});

confirmDeleteButton.addEventListener("click", () => {
  if (selectedCardIndex === null) {
    return;
  }

  const tasks = loadTask();
  const taskToDelete = tasks[selectedCardIndex];

  if (taskToDelete?.notificationId) {
    cancelNotification(taskToDelete.notificationId);
  }

  deleteTask(selectedCardIndex);

  deleteConfirmModal.hidden = true;
  selectedCardIndex = null;

  renderTasks();
});

const mainMenuButton = document.getElementById("mainMenuButton");
const mainMenu = document.getElementById("mainMenu");
const pinnedCards = document.getElementById("pinnedCards");
const pinnedLeft = document.getElementById("pinnedLeft");
const pinnedRight = document.getElementById("pinnedRight");

  
  
  
mainMenuButton.addEventListener("click", () => {
  mainMenu.hidden = !mainMenu.hidden;
});

let activeTaskIndex = null;
let reminderEnabled = false;
const exportButton = document.getElementById("exportButton");

//exportButton.addEventListener("click", () => {
 // exportTasks();
//});
const editorBackButton = document.getElementById("editorBackButton");

const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const taskNote = document.getElementById("taskNote");
const taskDate = document.getElementById("taskDate");

const reminderButton = document.getElementById("reminderButton");

const importButton = document.getElementById("importButton");
const importFile = document.getElementById("importFile");





importFile.addEventListener("change", () => {
  const file = importFile.files[0];

  if (file) {
    importTasks(file);
  }
});

const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
modalText.addEventListener("scroll", () => {
  if (
    !taskModal.classList.contains("titleCollapsed") &&
    modalText.scrollTop > 28
  ) {
    taskModal.classList.add("titleCollapsed");
  }
  
  if (
    taskModal.classList.contains("titleCollapsed") &&
    modalText.scrollTop < 8
  ) {
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
//const karty = document.querySelector(".karty");
const addTaskButton = document.getElementById("addTaskButton");




/* ========================================
   OTEVŘENÍ NOVÉ POZNÁMKY PŘES +
======================================== */

addTaskButton.addEventListener("click", () => {
  activeTaskIndex = null;
  resetTodos();
  
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
  pinned: currentTask.pinned === true,
  tags: [...activeTags],
  todos: [...activeTodos]
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
      date === "" &&
      activeTodos.length === 0;
    
    if (!isEmpty) {
     const newTask = {
  title,
  note,
  date,
  completed: false,
  reminder: reminderEnabled,
  notificationId: Date.now() % 2147483647,
  area: activeArea,
  pinned: false,
  tags: [...activeTags],
  todos: [...activeTodos]
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




let longPressTimer = null;
const LONG_PRESS_TIME = 600;
let selectedCardIndex = null;
let blockNextCardClick = false;

/* ========================================
   VYKRESLENÍ VŠECH KARET
======================================== */

function renderTasks() {
  if (typeof renderTagFilters === "function") {
    renderTagFilters();
    updateTagFilterUI();
  }

  //karty.innerHTML = "";
  pinnedLeft.innerHTML = "";
pinnedRight.innerHTML = "";
  pinnedCards.hidden = true;
  
  const loadedTasks = loadTask();
  const sortedTasks = loadedTasks
  .map((task, originalIndex) => ({
    task,
    originalIndex
  }))
  .sort((a, b) => {
    return Number(b.task.pinned === true) -
           Number(a.task.pinned === true);
  });
  sortedTasks.forEach(({ task: loadedTask, originalIndex: index }) => {
    if (!taskMatchesArea(loadedTask)) {
  return;
}
if (!taskMatchesTag(loadedTask)) {
  return;
}
    const loadedCard = document.createElement("div");
  loadedCard.addEventListener("pointerdown", () => {
  longPressTimer = setTimeout(() => {
    selectedCardIndex = index;
    const cardMenu = document.getElementById("cardMenu");
cardMenu.hidden = false;
  }, LONG_PRESS_TIME);
});

loadedCard.addEventListener("pointerup", () => {
  clearTimeout(longPressTimer);
});

loadedCard.addEventListener("pointercancel", () => {
  clearTimeout(longPressTimer);
});

    loadedCard.classList.add("taskCard");
    
    const loadedHeading = document.createElement("h3");

const areaIcon =
  loadedTask.area === "work" ?
  "💼" :
  "🏠";

const pinIcon =
  loadedTask.pinned === true ?
  "📌 " :
  "";

const reminderIcon =
  loadedTask.reminder === true ?
  "🔔 " :
  "";

loadedHeading.textContent =
  `${pinIcon}${areaIcon} ${reminderIcon}${loadedTask.title || "Bez názvu"}`;
    const loadedNoteText = document.createElement("p");
    loadedNoteText.textContent = loadedTask.note;
    loadedNoteText.classList.add("taskNoteText");
    
    const taskTodos = loadedTask.todos || [];

if (taskTodos.length > 0) {
  loadedNoteText.textContent = taskTodos
    .slice(0, 3)
    .map(todo =>
      `${todo.completed ? "☑" : "☐"} ${todo.text}`
    )
    .join("\n");
}
    
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


const loadedTags = document.createElement("div");
loadedCard.append(
  loadedHeading,
  loadedTags,
  loadedNoteText,
  loadedDateText
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
    
    pinnedCards.hidden = false;
const listMode =
  localStorage.getItem("cardView") === "list";

if (listMode) {
  pinnedLeft.append(loadedCard);
} else {
  const cardCount =
    pinnedLeft.children.length +
    pinnedRight.children.length;
  
  if (cardCount % 2 === 0) {
    pinnedLeft.append(loadedCard);
  } else {
    pinnedRight.append(loadedCard);
  }
}
    
    
    /* Otevření existující poznámky */
    
    loadedCard.addEventListener("click", () => {
      if (blockNextCardClick) {
  blockNextCardClick = false;
  return;
}
      const currentTasks = loadTask();
      const currentTask = currentTasks[index];

      if (!currentTask) {
        return;
      }

      reminderEnabled = currentTask.reminder === true;
      updateReminderButton(reminderEnabled);
      activeArea = currentTask.area || "private";
      activeTags = currentTask.tags || [];
      updateTagMenuUI();
      closeTagMenu();
      
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

      /* TODO se vykreslí až ve viditelném editoru,
         aby šla správně změřit výška dlouhých řádků. */
      loadTodos(currentTask.todos);
    });
    
  });
}

/* ========================================
   PRVNÍ VYKRESLENÍ PO SPUŠTĚNÍ
======================================== */

renderTasks();

const cardMenu = document.getElementById("cardMenu");

cardMenu.addEventListener("click", (event) => {
  const actionButton =
    event.target.closest("[data-card-action]");
  
  if (!actionButton) {
    return;
  }
  
  const action = actionButton.dataset.cardAction;
  
  if (action === "complete") {
    toggleTaskCompleted(selectedCardIndex);
    cardMenu.hidden = true;
    renderTasks();
  }
  
  if (action === "pin") {
    const tasks = loadTask();
    const selectedTask = tasks[selectedCardIndex];
    
    if (!selectedTask) {
      return;
    }
    
    selectedTask.pinned = !selectedTask.pinned;
    
    localStorage.setItem(
      "savedTask",
      JSON.stringify(tasks)
    );
    
    cardMenu.hidden = true;
    renderTasks();
  }
  
  if (action === "delete") {
  deleteConfirmModal.hidden = false;
  cardMenu.hidden = true;
}
  
  
});

document.addEventListener("pointerdown", (event) => {
  const cardMenu = document.getElementById("cardMenu");
  
  if (
    !cardMenu.hidden &&
    !cardMenu.contains(event.target)
  ) {
    event.preventDefault();
    event.stopPropagation();
    blockNextCardClick = true;
    cardMenu.hidden = true;
  }
}, true);