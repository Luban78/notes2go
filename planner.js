/* ==========================================
   LUBANOTE – PLÁNOVÁNÍ
   Samostatné plánované položky
   ========================================== */

const PLANNER_STORAGE_KEY = "plannedItems";

const plannedTextLinks =
  document.getElementById("plannedTextLinks");

const planSelectionButton =
  document.getElementById("planSelectionButton");

/* Poznámka, ze které právě plánujeme. */
let plannerSourceNoteId = null;
let plannerSourceType = "note";
let plannerSelectionStart = null;
let plannerSelectionEnd = null;
let selectedPlannerText = "";


/* ==========================================
   NAČTENÍ / ULOŽENÍ PLÁNOVANÝCH POLOŽEK
   ========================================== */

function loadPlannedItems() {
  try {
    return JSON.parse(
      localStorage.getItem(PLANNER_STORAGE_KEY)
    ) || [];
  } catch (error) {
    console.error(
      "Chyba při načítání plánovaných položek:",
      error
    );

    return [];
  }
}

function savePlannedItems(items) {
  localStorage.setItem(
    PLANNER_STORAGE_KEY,
    JSON.stringify(items)
  );
}


/* ==========================================
   VYTVOŘENÍ NOVÉ PLÁNOVANÉ POLOŽKY
   ========================================== */

function createPlannedItem(
  sourceNoteId,
  text,
  plannedAt,
  sourceType = "note",
  selectionStart = null,
  selectionEnd = null
) {
  return {
    id: crypto.randomUUID(),
    sourceNoteId,
    sourceType,
    text,
    plannedAt,
    completed: false,
    createdAt: new Date().toISOString(),
    selectionStart,
    selectionEnd
  };
}


/* ==========================================
   POMOCNÁ FUNKCE – AKTUÁLNÍ DATUM A ČAS
   ========================================== */

function setPlannerDateTimeToNow() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const hours = String(
    now.getHours()
  ).padStart(2, "0");
  const minutes = String(
    now.getMinutes()
  ).padStart(2, "0");

  plannerDate.value =
    `${year}-${month}-${day}`;

  plannerTime.value =
    `${hours}:${minutes}`;
}


/* ==========================================
   OTEVŘENÍ PLÁNOVÁNÍ CELÉ POZNÁMKY
   ========================================== */

function openPlannerForNote(note) {
  if (!note) {
    return;
  }

  plannerSourceNoteId = note.id || null;
  plannerSourceType = "note";
  plannerSelectionStart = null;
  plannerSelectionEnd = null;
  selectedPlannerText = "";

  plannerTaskTitle.textContent =
    note.title || "Bez názvu";

  setPlannerDateTimeToNow();
  plannerModal.hidden = false;
}


/* ==========================================
   ZAVŘENÍ PLÁNOVACÍHO DIALOGU
   ========================================== */

function closePlanner() {
  plannerModal.hidden = true;
  plannerSourceNoteId = null;
  plannerSourceType = "note";
  plannerSelectionStart = null;
  plannerSelectionEnd = null;
  selectedPlannerText = "";

  /* Starý výběr už nesmí ovlivnit další akci. */
  savedRichTextRange = null;
}


/* ==========================================
   ULOŽENÍ NAPLÁNOVANÉHO ÚKOLU
   ========================================== */

function saveCurrentPlannedItem() {
  if (
    !plannerDate.value ||
    !plannerTime.value
  ) {
    return;
  }

  const tasks = loadTask();

  const sourceNote = tasks.find(
    task => task.id === plannerSourceNoteId
  );

  if (!sourceNote) {
    console.error(
      "Zdrojová poznámka nebyla nalezena."
    );
    return;
  }

  const plannedAt =
    `${plannerDate.value}T${plannerTime.value}`;

  const text =
    plannerSourceType === "selection"
      ? selectedPlannerText.trim()
      : (
          sourceNote.title ||
          sourceNote.note ||
          "Bez názvu"
        );

  if (!text) {
    return;
  }

  const plannedItem = createPlannedItem(
    sourceNote.id,
    text,
    plannedAt,
    plannerSourceType,
    plannerSelectionStart,
    plannerSelectionEnd
  );

  const plannedItems = loadPlannedItems();
  plannedItems.push(plannedItem);
  savePlannedItems(plannedItems);

  closePlanner();

  console.log(
    "✅ Naplánováno:",
    plannedItem
  );
}


/* ==========================================
   TLAČÍTKA PLÁNOVACÍHO DIALOGU
   ========================================== */

savePlannerButton.addEventListener(
  "click",
  saveCurrentPlannedItem
);

cancelPlannerButton.addEventListener(
  "click",
  closePlanner
);

closePlannerButton.addEventListener(
  "click",
  closePlanner
);


/* ==========================================
   PLÁNOVÁNÍ OZNAČENÉ ČÁSTI RICH TEXTU
   ========================================== */

planSelectionButton.addEventListener(
  "click",
  () => {
    const snapshot =
      getSavedRichTextSelectionSnapshot();

    if (!snapshot) {
      console.log(
        "Nejdřív označ část textu."
      );
      return;
    }

    const text = snapshot.text.trim();

    if (!text) {
      return;
    }

    const tasks = loadTask();
    const sourceNote = tasks[activeTaskIndex];

    if (!sourceNote) {
      console.error(
        "Zdrojová poznámka nebyla nalezena."
      );
      return;
    }

    /* Starším poznámkám doplníme ID. */
    if (!sourceNote.id) {
      sourceNote.id = crypto.randomUUID();
      sourceNote.updatedAt =
        new Date().toISOString();

      saveAllTasks(tasks);
      uploadLocalNoteToSupabase(sourceNote);
    }

    plannerSourceNoteId = sourceNote.id;
    plannerSourceType = "selection";
    plannerSelectionStart = snapshot.start;
    plannerSelectionEnd = snapshot.end;
    selectedPlannerText = text;

    plannerTaskTitle.textContent = text;

    setPlannerDateTimeToNow();
    plannerModal.hidden = false;
  }
);


/* ==========================================
   PŘEHLED NAPLÁNOVANÝCH ČÁSTÍ U POZNÁMKY
   ========================================== */

function renderPlannedTextLinks(noteId) {
  const items = loadPlannedItems().filter(
    item =>
      item.sourceNoteId === noteId &&
      item.sourceType === "selection"
  );

  plannedTextLinks.innerHTML = "";

  if (items.length === 0) {
    plannedTextLinks.hidden = true;
    return;
  }

  plannedTextLinks.hidden = false;

  items.forEach((item) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "plannedTextLink";
    button.textContent = `📅 ${item.text}`;

    plannedTextLinks.append(button);
  });
}
