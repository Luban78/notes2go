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


let activeTaskIndex = null;

const editorBackButton = document.getElementById("editorBackButton");

const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const taskNote = document.getElementById("taskNote");
const taskDate = document.getElementById("taskDate");

const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");

const editorTopActions = document.querySelector(".editorTopActions");
const editorBottomBar = document.querySelector(".editorBottomBar");


modalText.addEventListener("focus", () => {
  taskModal.classList.add("editing");
  
});

modalText.addEventListener("blur", () => {
  taskModal.classList.remove("editing");
});

const modalDate = document.getElementById("modalDate");

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
  const date = modalDate.value;
  
  if (activeTaskIndex !== null) {
    const tasks = loadTask();
    const currentTask = tasks[activeTaskIndex];
    
    if (currentTask) {
      const updatedTask = {
        ...currentTask,
        title,
        note,
        date
      };
      
      updateTask(activeTaskIndex, updatedTask);
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
        completed: false
      };
      
      saveTask(newTask);
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
    const loadedCard = document.createElement("div");
    loadedCard.classList.add("taskCard");
    
    const loadedHeading = document.createElement("h3");
    loadedHeading.textContent =
      loadedTask.title || "Bez názvu";
    
    const loadedNoteText = document.createElement("p");
    loadedNoteText.textContent = loadedTask.note;
    loadedNoteText.classList.add("taskNoteText");
    
    const loadedDateText = document.createElement("p");
    loadedDateText.textContent = loadedTask.date;
    
    const loadedCompleteButton =
      document.createElement("button");
    
    loadedCompleteButton.textContent = "✅ Hotovo";
    
    const loadedDeleteButton =
      document.createElement("button");
    
    loadedDeleteButton.textContent = "🗑️ Smazat";
    
    loadedCard.append(
      loadedHeading,
      loadedNoteText,
      loadedDateText,
      loadedCompleteButton,
      loadedDeleteButton
    );
    
    if (loadedTask.completed) {
      loadedCard.classList.add("completed");
    }
    
    karty.append(loadedCard);
    
    
    /* Otevření existující poznámky */
    
    loadedCard.addEventListener("click", () => {
      const currentTasks = loadTask();
      const currentTask = currentTasks[index];
      
      if (!currentTask) {
        return;
      }
      
      activeTaskIndex = index;
      
      modalTitle.value = currentTask.title;
      modalText.value = currentTask.note;
      modalDate.value = currentTask.date;
      
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