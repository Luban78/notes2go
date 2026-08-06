const editorBackButton = document.getElementById("editorBackButton");

const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const taskNote = document.getElementById("taskNote");
const taskDate = document.getElementById("taskDate");

const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalDate = document.getElementById("modalDate");

const taskModal = document.getElementById("taskModal");
const karty = document.querySelector(".karty");
const addTaskButton = document.getElementById("addTaskButton");

addTaskButton.addEventListener("click", () => {
  modalTitle.textContent = "";
  modalText.textContent = "";
  modalDate.textContent = "";
  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");
});


editorBackButton.addEventListener("click", (event) => {
  taskModal.classList.remove("show");
  setTimeout(() => {
  taskModal.hidden = true;
}, 250);
  document.body.classList.remove("noScroll");
});


taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const titleValue = taskTitle.value;
  const noteValue = taskNote.value;
  const dateValue = taskDate.value;
  
  const newTask = {
    title: titleValue,
    note: noteValue,
    date: dateValue,
    completed: false
  };
  
  
  
  
  
  if (titleValue === "") {
    console.log("Název úkolu je povinný.");
    return
  }
  saveTask(newTask);
  const taskCard = document.createElement("div");
  taskCard.classList.add("taskCard");
  const taskHeading = document.createElement("h3");
  const taskNoteText = document.createElement("p");
  const taskDateText = document.createElement("p");
  const completeButton = document.createElement("button");
  const deleteButton = document.createElement("button");
  
  
  
  deleteButton.textContent = "🗑️ Smazat";
  completeButton.textContent = " ✅ Hotovo";
  taskHeading.textContent = titleValue;
  taskNoteText.textContent = noteValue;
  taskDateText.textContent = dateValue;
  
  
  taskCard.append(taskHeading);
  taskCard.append(taskNoteText);
  taskCard.append(taskDateText);
  taskCard.append(completeButton);
  taskCard.append(deleteButton);
  
  completeButton.addEventListener("click", () => {
    console.log("Ukol je dokoncem");
    taskCard.classList.toggle("completed");
  })
  deleteButton.addEventListener("click", () => {
    taskCard.remove();
  })
  
  
  
  
  
  
  karty.append(taskCard);
  
  
  taskNoteText.classList.add("taskNoteText");
  
  modalTitle.value = "";
  modalText.value = "";
  modalDate.value = "";
  /*
    taskNote.value = "";
    taskTitle.value = "";
    taskDate.value = "";
    */
  
  taskCard.addEventListener("click", () => {
    //taskNoteText.classList.toggle("expanded");
    
    modalTitle.textContent = titleValue;
    modalText.textContent = noteValue;
    modalDate.textContent = dateValue;
    taskModal.hidden = false;
    taskModal.classList.add("show");
    document.body.classList.add("noScroll");
    //console.log("Kliknutí na kartu funguje");
  })
  
});

const loadedTasks = loadTask();
loadedTasks.forEach((loadedTask, index) => {
  const loadedCompleteButton = document.createElement("button");
  const loadedDeleteButton = document.createElement("button");
  loadedCompleteButton.textContent = "hotovo";
  loadedDeleteButton.textContent = "smazat";
  
  
  
  
  
  //console.log("Uložený úkol existuje.");
  console.log(loadedTask);
  const loadedTitle = loadedTask.title;
  const loadedNote = loadedTask.note;
  const loadedDate = loadedTask.date;
  const loadedCompleted = loadedTask.completed;
  const loadedCard = document.createElement("div");
  loadedCard.classList.add("taskCard");
  const loadedHeading = document.createElement("h3");
  loadedHeading.textContent = loadedTitle;
  const loadedNoteText = document.createElement("p");
  loadedNoteText.textContent = loadedNote;
  loadedNoteText.classList.add("taskNoteText");
  const loadedDateText = document.createElement("p");
  loadedDateText.textContent = loadedDate;
  
  loadedCard.append(loadedHeading, loadedNoteText, loadedDateText,
    loadedCompleteButton,
    loadedDeleteButton
  );
  if (loadedCompleted) {
    loadedCard.classList.add("completed");
  }
  
  karty.append(loadedCard);
  loadedDeleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteTask(index);
    loadedCard.remove();
  });
  
  
  loadedCompleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    
    toggleTaskCompleted(index);
    loadedCard.classList.toggle("completed");
  });
  
  
  loadedCard.addEventListener("click", () => {
    modalTitle.value = loadedTitle;
    modalText.value = loadedNote;
    modalDate.value = loadedDate;
    taskModal.hidden = false;
    taskModal.classList.add("show");
    document.body.classList.add("noScroll");
    
    
  });
});