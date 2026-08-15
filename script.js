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
  markNoteDeletedInSupabase(taskToDelete);

  deleteConfirmModal.hidden = true;
  selectedCardIndex = null;

  taskModal.hidden = true;
  activeTaskIndex = null;

  renderTasks();
});
const modalDateButton =
  document.getElementById("modalDateButton");

const datePickerModal =
  document.getElementById("datePickerModal");

const closeDatePickerButton =
  document.getElementById("closeDatePickerButton");
const mainMenuButton = document.getElementById("mainMenuButton");
const mainMenu = document.getElementById("mainMenu");
const pinnedCards = document.getElementById("pinnedCards");
const pinnedLeft = document.getElementById("pinnedLeft");
const pinnedRight = document.getElementById("pinnedRight");


const modalTimeButton =
  document.getElementById("modalTimeButton");

const timePickerModal =
  document.getElementById("timePickerModal");

const closeTimePickerButton =
  document.getElementById("closeTimePickerButton");

const timePickerCancelButton =
  document.getElementById("timePickerCancelButton");

mainMenuButton.addEventListener("click", () => {
  mainMenu.hidden = !mainMenu.hidden;
});

let activeTaskIndex = null;
let reminderEnabled = false;
let favoriteEnabled = false;

const editorBackButton = document.getElementById("editorBackButton");

const deleteTaskButton =
  document.getElementById("deleteTaskButton");
deleteTaskButton?.addEventListener("click", () => {
  if (activeTaskIndex === null) {
    return;
  }

  selectedCardIndex = activeTaskIndex;

  deleteConfirmModal.hidden = false;
});

const datePickerGrid =
  document.getElementById("datePickerGrid");

const datePickerMonthTitle =
  document.getElementById("datePickerMonthTitle");

const previousMonthButton =
  document.getElementById("previousMonthButton");

const nextMonthButton =
  document.getElementById("nextMonthButton");

const datePickerTodayButton =
  document.getElementById("datePickerTodayButton");

const timePickerClock =
  document.getElementById("timePickerClock");

const timePickerSelectedHour =
  document.getElementById("timePickerSelectedHour");

const timePickerSelectedMinute =
  document.getElementById("timePickerSelectedMinute");  

  const timePickerHand =
  document.getElementById("timePickerHand");
const timePickerHourHand =
  document.getElementById("timePickerHourHand");

 const timePickerSaveButton =
  document.getElementById("timePickerSaveButton");

const timePickerNowButton =
  document.getElementById("timePickerNowButton");

const modalTimeLabel =
  document.getElementById("modalTimeLabel"); 
  // ==========================================
// VLASTNÍ CIFERNÍK – VYKRESLENÍ HODIN
// ==========================================

function vykresliHodinyCiferniku() {
  timePickerClock
  .querySelectorAll(".timePickerClockNumber")
  .forEach((prvek) => prvek.remove());

  const vnejsiHodiny = [
    12, 1, 2, 3, 4, 5,
    6, 7, 8, 9, 10, 11
  ];

  const vnitrniHodiny = [
    0, 13, 14, 15, 16, 17,
    18, 19, 20, 21, 22, 23
  ];

  function vytvorHodinu(hodina, index, polomer) {
    const tlacitko =
      document.createElement("button");

    tlacitko.type = "button";
    tlacitko.className = "timePickerClockNumber";
    tlacitko.textContent =
      String(hodina).padStart(2, "0");

    const uhel =
      (index * 30 - 90) *
      Math.PI / 180;

    const x =
      50 + Math.cos(uhel) * polomer;

    const y =
      50 + Math.sin(uhel) * polomer;

    tlacitko.style.left = `${x}%`;
    tlacitko.style.top = `${y}%`;

    tlacitko.addEventListener("click", () => {
  timePickerSelectedHour.textContent =
    String(hodina).padStart(2, "0");

  timePickerHourHand.style.transform =
    `translate(-50%, -100%) rotate(${index * 30}deg)`;

  timePickerHourHand.hidden = true;
  timePickerHand.hidden = false;

  timePickerSelectedHour.classList.remove("active");
  timePickerSelectedMinute.classList.add("active");

  vykresliMinutyCiferniku();
});

    timePickerClock.append(tlacitko);
  }

  vnejsiHodiny.forEach(
    (hodina, index) => {
      vytvorHodinu(
        hodina,
        index,
        40
      );
    }
  );

  vnitrniHodiny.forEach(
    (hodina, index) => {
      vytvorHodinu(
        hodina,
        index,
        25
      );
    }
  );
}

// ==========================================
// VLASTNÍ CIFERNÍK – VYKRESLENÍ MINUT
// ==========================================

function vykresliMinutyCiferniku() {
  timePickerClock
  .querySelectorAll(".timePickerClockNumber")
  .forEach((prvek) => prvek.remove());

  for (let minuta = 0; minuta < 60; minuta += 5) {
    const tlacitko =
      document.createElement("button");

    tlacitko.type = "button";
    tlacitko.className = "timePickerClockNumber";

    tlacitko.textContent =
      String(minuta).padStart(2, "0");

    const index = minuta / 5;

    const uhel =
      (index * 30 - 90) *
      Math.PI / 180;

    const x =
      50 + Math.cos(uhel) * 40;

    const y =
      50 + Math.sin(uhel) * 40;

    tlacitko.style.left = `${x}%`;
    tlacitko.style.top = `${y}%`;

    tlacitko.addEventListener("click", () => {
      timePickerSelectedMinute.textContent =
        String(minuta).padStart(2, "0");
    });

    timePickerClock.append(tlacitko);
  }
}



// ==========================================
// VLASTNÍ CIFERNÍK – TAŽENÍ MINUT
// Funguje prstem na mobilu i myší na PC.
// ==========================================

let minutovyCifernikAktivni = false;

function nastavMinutuPodlePozice(event) {
  const rect =
    timePickerClock.getBoundingClientRect();

  const stredX =
    rect.left + rect.width / 2;

  const stredY =
    rect.top + rect.height / 2;

  const x =
    event.clientX - stredX;

  const y =
    event.clientY - stredY;

  let uhel =
    Math.atan2(y, x) * 180 / Math.PI;

  uhel += 90;

  if (uhel < 0) {
    uhel += 360;
  }

  const minuta =
    Math.round(uhel / 6) % 60;

  timePickerSelectedMinute.textContent =
    String(minuta).padStart(2, "0");

  timePickerHand.style.transform =
  `translate(-50%, -100%) rotate(${minuta * 6}deg)`;
}

timePickerClock.addEventListener(
  "pointerdown",
  (event) => {

    // Výběr hodin
    if (
      timePickerSelectedHour.classList.contains(
        "active"
      )
    ) {
      hodinovyCifernikAktivni = true;

      timePickerClock.setPointerCapture(
        event.pointerId
      );

      nastavHodinuPodlePozice(event);

      return;
    }

    // Výběr minut
    if (
      timePickerSelectedMinute.classList.contains(
        "active"
      )
    ) {
      minutovyCifernikAktivni = true;

      timePickerClock.setPointerCapture(
        event.pointerId
      );

      nastavMinutuPodlePozice(event);
    }
  }
);

timePickerClock.addEventListener(
  "pointermove",
  (event) => {

    if (hodinovyCifernikAktivni) {
      nastavHodinuPodlePozice(event);
      return;
    }

    if (minutovyCifernikAktivni) {
      nastavMinutuPodlePozice(event);
    }
  }
);

timePickerClock.addEventListener(
  "pointerup",
  () => {
    if (hodinovyCifernikAktivni) {
      hodinovyCifernikAktivni = false;

      timePickerHourHand.hidden = true;
      timePickerHand.hidden = false;

      timePickerSelectedHour.classList.remove(
        "active"
      );

      timePickerSelectedMinute.classList.add(
        "active"
      );

      vykresliMinutyCiferniku();

      return;
    }

    minutovyCifernikAktivni = false;
  }
);

timePickerClock.addEventListener(
  "pointercancel",
  () => {
    hodinovyCifernikAktivni = false;
    minutovyCifernikAktivni = false;
  }
);




timePickerSaveButton?.addEventListener("click", () => {
  const hodina =
    timePickerSelectedHour.textContent.padStart(2, "0");

  const minuta =
    timePickerSelectedMinute.textContent.padStart(2, "0");

  modalTime.value =
    `${hodina}:${minuta}`;

  modalTimeLabel.textContent =
    `${hodina}:${minuta}`;

  timePickerModal.hidden = true;
});
// ==========================================
// VLASTNÍ CIFERNÍK – TAŽENÍ HODIN
// Funguje prstem na mobilu i myší na PC.
// ==========================================

let hodinovyCifernikAktivni = false;

function nastavHodinuPodlePozice(event) {
  const rect =
    timePickerClock.getBoundingClientRect();

  const stredX =
    rect.left + rect.width / 2;

  const stredY =
    rect.top + rect.height / 2;

  const x =
    event.clientX - stredX;

  const y =
    event.clientY - stredY;

  let uhel =
    Math.atan2(y, x) * 180 / Math.PI;

  uhel += 90;

  if (uhel < 0) {
    uhel += 360;
  }

  const vzdalenost =
    Math.sqrt(x * x + y * y);

  const polomer =
    rect.width / 2;

  const vnitrniKruh =
    vzdalenost < polomer * 0.67;

  const index =
    Math.round(uhel / 30) % 12;

  let hodina;

  if (vnitrniKruh) {
    const vnitrniHodiny = [
      0, 13, 14, 15, 16, 17,
      18, 19, 20, 21, 22, 23
    ];

    hodina = vnitrniHodiny[index];
  } else {
    const vnejsiHodiny = [
      12, 1, 2, 3, 4, 5,
      6, 7, 8, 9, 10, 11
    ];

    hodina = vnejsiHodiny[index];
  }

  timePickerSelectedHour.textContent =
    String(hodina).padStart(2, "0");

  timePickerHourHand.style.transform =
    `translate(-50%, -100%) rotate(${index * 30}deg)`;
}
// ==========================================
// VLASTNÍ KALENDÁŘ – AKTUÁLNĚ ZOBRAZENÝ MĚSÍC
// ==========================================

let datePickerYear = new Date().getFullYear();
let datePickerMonth = new Date().getMonth();

// ==========================================
// VLASTNÍ KALENDÁŘ – VYKRESLENÍ MĚSÍCE
// ==========================================

function vykresliVyberData() {
  datePickerGrid.innerHTML = "";

  const prvniDenMesice =
    new Date(
      datePickerYear,
      datePickerMonth,
      1
    );

  const pocetDniVMesici =
    new Date(
      datePickerYear,
      datePickerMonth + 1,
      0
    ).getDate();

  const nazvyMesicu = [
    "Leden",
    "Únor",
    "Březen",
    "Duben",
    "Květen",
    "Červen",
    "Červenec",
    "Srpen",
    "Září",
    "Říjen",
    "Listopad",
    "Prosinec"
  ];

  datePickerMonthTitle.textContent =
    `${nazvyMesicu[datePickerMonth]} ${datePickerYear}`;

  /*
   * JavaScript počítá neděli jako 0.
   * My máme kalendář od pondělí,
   * proto hodnotu převedeme na 0–6.
   */
  const pocatecniPozice =
    (prvniDenMesice.getDay() + 6) % 7;

  for (
    let pozice = 0;
    pozice < pocatecniPozice;
    pozice++
  ) {
    const prazdneMisto =
      document.createElement("span");

    datePickerGrid.append(
      prazdneMisto
    );
  }

  const dnes = new Date();

  for (
    let den = 1;
    den <= pocetDniVMesici;
    den++
  ) {
    const tlacitkoDne =
      document.createElement("button");

    tlacitkoDne.type = "button";
    tlacitkoDne.textContent = den;

    tlacitkoDne.addEventListener("click", () => {
  const mesic =
    String(datePickerMonth + 1).padStart(2, "0");

  const denText =
    String(den).padStart(2, "0");

  modalDate.value =
    `${datePickerYear}-${mesic}-${denText}`;

  modalDateLabel.textContent =
    `${den}. ${datePickerMonth + 1}. ${datePickerYear}`;

  updateModalWeekday();

  datePickerModal.hidden = true;
});



    if (
      den === dnes.getDate() &&
      datePickerMonth === dnes.getMonth() &&
      datePickerYear === dnes.getFullYear()
    ) {
      tlacitkoDne.classList.add("today");
    }

    datePickerGrid.append(
      tlacitkoDne
    );
  }
}

previousMonthButton?.addEventListener("click", () => {
  datePickerMonth--;

  if (datePickerMonth < 0) {
    datePickerMonth = 11;
    datePickerYear--;
  }

  vykresliVyberData();
});

nextMonthButton?.addEventListener("click", () => {
  datePickerMonth++;

  if (datePickerMonth > 11) {
    datePickerMonth = 0;
    datePickerYear++;
  }

  vykresliVyberData();
});

datePickerTodayButton?.addEventListener("click", () => {
  const dnes = new Date();

  datePickerYear = dnes.getFullYear();
  datePickerMonth = dnes.getMonth();

  const mesic =
    String(dnes.getMonth() + 1).padStart(2, "0");

  const den =
    String(dnes.getDate()).padStart(2, "0");

  modalDate.value =
    `${dnes.getFullYear()}-${mesic}-${den}`;

  modalDateLabel.textContent =
    `${dnes.getDate()}. ${dnes.getMonth() + 1}. ${dnes.getFullYear()}`;

  updateModalWeekday();

  datePickerModal.hidden = true;
});


const reminderButton = document.getElementById("reminderButton");

const importFile = document.getElementById("importFile");

const priorityTaskButton =
  document.getElementById("priorityTaskButton");
priorityTaskButton?.addEventListener("click", () => {
  favoriteEnabled = !favoriteEnabled;

  priorityTaskButton.classList.toggle(
    "active",
    favoriteEnabled
  );
});


modalDateButton?.addEventListener("click", () => {
  vykresliVyberData();

  datePickerModal.hidden = false;
});

closeDatePickerButton?.addEventListener("click", () => {
  datePickerModal.hidden = true;
});

modalTimeButton?.addEventListener("click", () => {
  vykresliHodinyCiferniku();

  timePickerModal.hidden = false;
});

closeTimePickerButton?.addEventListener("click", () => {
  timePickerModal.hidden = true;
});

timePickerCancelButton?.addEventListener("click", () => {
  timePickerModal.hidden = true;
});

importFile.addEventListener("change", () => {
  const file = importFile.files[0];

  if (file) {
    importTasks(file);
  }
});

const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");

const modalRichText =
  document.getElementById("modalRichText");

/* Barevné označování je oddělené v richTextColors.js. */

modalRichText.addEventListener("scroll", () => {
  if (
    !taskModal.classList.contains("titleCollapsed") &&
    modalRichText.scrollTop > 28
  ) {
    taskModal.classList.add("titleCollapsed");
  }

  if (
    taskModal.classList.contains("titleCollapsed") &&
    modalRichText.scrollTop < 8
  ) {
    taskModal.classList.remove("titleCollapsed");
  }
});

modalRichText.addEventListener("focus", () => {
  taskModal.classList.add("editing");
});

modalRichText.addEventListener("blur", () => {
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
modalDate.addEventListener("change", () => {
  updateModalWeekday();
  zapniPripominkuPoZmeneTerminu();
});

modalTime.addEventListener(
  "change",
  zapniPripominkuPoZmeneTerminu
);


const taskModal = document.getElementById("taskModal");
const addTaskButton = document.getElementById("addTaskButton");


addTaskButton.addEventListener("click", () => {
  activeTaskIndex = null;
  resetTodos();
  activeArea = "private";
  activeTags = [];
  updateTagMenuUI();
  closeTagMenu();

  modalTitle.value = "";
  modalText.value = "";
  modalRichText.innerHTML = "";
  modalText.hidden = true;
  modalRichText.hidden = false;
  RichTextColors.reset();
  document.getElementById("plannedTextLinks")?.replaceChildren();
  if (document.getElementById("plannedTextLinks")) {
    document.getElementById("plannedTextLinks").hidden = true;
  }

  /* Aktuální datum a čas při vytvoření nové poznámky */
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  modalDate.value = `${year}-${month}-${day}`;
  modalTime.value = `${hours}:${minutes}`;

  updateModalWeekday();

  reminderEnabled = false;
  updateReminderButton(false);

  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");

  modalTitle.focus();
});


editorBackButton.addEventListener("click", () => {
  const title = modalTitle.value.trim();
  const note = modalRichText.innerText;
  const richContent = modalRichText.innerHTML;
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
        updatedAt: new Date().toISOString(),
        title,
        note,
        richContent,
        date,
        reminder: reminderEnabled,
        favorite: favoriteEnabled,
        notificationId: currentTask.notificationId ||
          Date.now() % 2147483647,
        area: activeArea,
        pinned: currentTask.pinned === true,
        tags: [...activeTags],
        todos: [...activeTodos]
      };

      updateTask(activeTaskIndex, updatedTask);
      uploadLocalNoteToSupabase(updatedTask);
      if (updatedTask.reminder && updatedTask.date) {
        scheduleNotification(
          updatedTask.notificationId,
          updatedTask.title,
          updatedTask.date,
          updatedTask.note,
          {
            lubanoteType: "note",
            taskId: updatedTask.id
          }
        );
      } else {
        cancelNotification(updatedTask.notificationId);
      }
    }
  } else {
    const isEmpty =
      title === "" &&
      note.trim() === "" &&
      //date === "" &&
      activeTodos.length === 0;

    if (!isEmpty) {
      const newTask = {
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        title,
        note,
        richContent,
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
      uploadLocalNoteToSupabase(newTask);
      if (newTask.reminder && newTask.date) {
        scheduleNotification(
          newTask.notificationId,
          newTask.title,
          newTask.date,
          newTask.note,
          {
            lubanoteType: "note",
            taskId: newTask.id
          }
        );
      }
    }
  }

  renderTasks();
  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }
  taskModal.classList.remove("show");

  setTimeout(() => {
    taskModal.hidden = true;
  }, 250);

  document.body.classList.remove("noScroll");
  activeTaskIndex = null;
  RichTextColors.reset();
});


let longPressTimer = null;
const LONG_PRESS_TIME = 600;
let selectedCardIndex = null;
let blockNextCardClick = false;

let cardPressStartX = 0;
let cardPressStartY = 0;
const CARD_LONG_PRESS_CANCEL_DISTANCE = 20;
const activeCardPointers = new Set();

document.addEventListener("pointerdown", (event) => {
  activeCardPointers.add(event.pointerId);

  if (activeCardPointers.size > 1) {
    clearTimeout(longPressTimer);
  }
}, true);

document.addEventListener("pointerup", (event) => {
  activeCardPointers.delete(event.pointerId);
}, true);

document.addEventListener("pointercancel", (event) => {
  activeCardPointers.delete(event.pointerId);
}, true);




function openTaskEditorById(taskId) {
  const currentTasks = loadTask();

  const index = currentTasks.findIndex(
    task => task.id === taskId
  );

  if (index === -1) {
    console.error("Poznámka nebyla nalezena:", taskId);
    return;
  }

  const currentTask = currentTasks[index];

  reminderEnabled = currentTask.reminder === true;
  updateReminderButton(reminderEnabled);

  favoriteEnabled = currentTask.favorite === true;

  priorityTaskButton?.classList.toggle(
    "active",
    favoriteEnabled
  );

  activeArea = currentTask.area || "private";
  activeTags = currentTask.tags || [];

  updateTagMenuUI();
  closeTagMenu();

  activeTaskIndex = index;

  modalTitle.value = currentTask.title || "";
  modalText.value = currentTask.note || "";

  if (currentTask.richContent) {
    modalRichText.innerHTML = currentTask.richContent;
  } else {
    /* Staré plain-text poznámky načteme bezpečně jako text. */
    modalRichText.textContent = currentTask.note || "";
  }

  modalText.hidden = true;
  modalRichText.hidden = false;
  RichTextColors.reset();

  if (currentTask.date) {
    const [savedDate, savedTime] =
      currentTask.date.split("T");

    modalDate.value = savedDate || "";
    modalTime.value = savedTime || "";
  } else {
    modalDate.value = "";
    modalTime.value = "";
  }

  updateModalWeekday();

  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");

  loadTodos(currentTask.todos);

  //renderPlannedTextLinks(currentTask.id);
}








function renderTasks() {
  if (typeof renderTagFilters === "function") {
    renderTagFilters();
    updateTagFilterUI();
  }

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
    if (!taskMatchesFavorite(loadedTask)) {
      return;
    }
    if (!taskMatchesTag(loadedTask)) {
      return;
    }
    if (
      typeof taskMatchesSearch === "function" &&
      !taskMatchesSearch(loadedTask)
    ) {
      return;
    }
    const loadedCard = document.createElement("div");
    loadedCard.addEventListener("pointerdown", (event) => {
      cardPressStartX = event.clientX;
      cardPressStartY = event.clientY;

      longPressTimer = setTimeout(() => {
        selectedCardIndex = index;

        const cardMenu =
          document.getElementById("cardMenu");

        cardMenu.hidden = false;

        if (window.innerWidth < 900) {
          cardMenu.style.visibility = "hidden";
          cardMenu.style.bottom = "auto";

          requestAnimationFrame(() => {
            const cardRect =
              loadedCard.getBoundingClientRect();

            const menuRect =
              cardMenu.getBoundingClientRect();

            const odsazeni = 10;
            const okraj = 12;

            let menuTop =
              cardRect.bottom + odsazeni;

            if (
              menuTop + menuRect.height >
              window.innerHeight - okraj
            ) {
              menuTop =
                cardRect.top -
                menuRect.height -
                odsazeni;
            }

            menuTop = Math.max(
              okraj,
              Math.min(
                menuTop,
                window.innerHeight -
                menuRect.height -
                okraj
              )
            );

            cardMenu.style.top =
              `${Math.round(menuTop)}px`;

            cardMenu.style.visibility = "visible";
          });
        } else {
          cardMenu.style.top = "auto";
          cardMenu.style.bottom = "34px";
          cardMenu.style.visibility = "visible";
        }
      }, LONG_PRESS_TIME);
    });

    loadedCard.addEventListener("pointermove", (event) => {
      const distanceX =
        Math.abs(event.clientX - cardPressStartX);

      const distanceY =
        Math.abs(event.clientY - cardPressStartY);

      if (
        distanceX > CARD_LONG_PRESS_CANCEL_DISTANCE ||
        distanceY > CARD_LONG_PRESS_CANCEL_DISTANCE
      ) {
        clearTimeout(longPressTimer);
      }
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
        "📌" :
        "";

    const favoriteIcon =
      loadedTask.favorite === true ?
        "⭐" :
        "";

    const reminderIcon =
      loadedTask.reminder === true ?
        "🔔" :
        "";

    const loadedHeadingIcons =
      document.createElement("span");

    loadedHeadingIcons.classList.add("taskCardIcons");

    loadedHeadingIcons.textContent = [
      pinIcon,
      favoriteIcon,
      areaIcon,
      reminderIcon
    ]
      .filter(Boolean)
      .join(" ");

    loadedHeading.append(
      loadedHeadingIcons,
      document.createTextNode(
        loadedTask.title || "Bez názvu"
      )
    );
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

    const desktopCardLayout =
      window.matchMedia("(min-width: 900px)").matches;

    /*
     * PC: všechny karty držíme v jednom zdrojovém sloupci.
     * CSS z něj udělá 4sloupcový masonry GRID nebo 2sloupcový LIST.
     * Mobil: zachováme původní 2 nezávislé masonry sloupce.
     */
    if (desktopCardLayout || listMode) {
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

      /* Starší lokální poznámce doplníme stabilní ID. */
      if (!currentTask.id) {
        currentTask.id = crypto.randomUUID();
        currentTask.updatedAt = new Date().toISOString();
        saveAllTasks(currentTasks);
        uploadLocalNoteToSupabase(currentTask);
      }

      openTaskEditorById(currentTask.id);
    });

  });
}









/* První vykreslení poznámek */
renderTasks();
const cardMenu = document.getElementById("cardMenu");

const plannerModal =
  document.getElementById("plannerModal");

const plannerTaskTitle =
  document.getElementById("plannerTaskTitle");

const plannerDate =
  document.getElementById("plannerDate");

const plannerTime =
  document.getElementById("plannerTime");

const closePlannerButton =
  document.getElementById("closePlannerButton");

const cancelPlannerButton =
  document.getElementById("cancelPlannerButton");

const savePlannerButton =
  document.getElementById("savePlannerButton");

cardMenu.addEventListener("click", (event) => {
  const actionButton =
    event.target.closest("[data-card-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.cardAction;

  if (action === "plan") {
    const tasks = loadTask();
    const selectedTask = tasks[selectedCardIndex];

    if (!selectedTask) {
      return;
    }

    /* Starší poznámce doplníme ID, pokud ho ještě nemá */
    if (!selectedTask.id) {
      selectedTask.id = crypto.randomUUID();
      selectedTask.updatedAt = new Date().toISOString();

      saveAllTasks(tasks);
      uploadLocalNoteToSupabase(selectedTask);
    }

    cardMenu.hidden = true;

    openPlannerForNote(selectedTask);

    return;
  }

  if (action === "complete") {
    const updatedTask =
      toggleTaskCompleted(selectedCardIndex);

    if (updatedTask) {
      uploadLocalNoteToSupabase(updatedTask);
    }

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
    selectedTask.updatedAt = new Date().toISOString();

    saveAllTasks(tasks);
    uploadLocalNoteToSupabase(selectedTask);

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