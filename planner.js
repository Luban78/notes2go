/* ==========================================
   LUBANOTE – PLÁNOVÁNÍ
   Samostatné plánované položky
   ========================================== */
const plannedTextLinks =
  document.getElementById("plannedTextLinks");
  
const modalTextHighlight =
  document.getElementById("modalTextHighlight");  
const PLANNER_STORAGE_KEY = "plannedItems";

/* Poznámka, ze které právě plánujeme */
let plannerSourceNoteId = null;

let plannerSourceType = "note";
let plannerSelectionStart = null;
let plannerSelectionEnd = null;

/* ==========================================
   NAČTENÍ PLÁNOVANÝCH POLOŽEK
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


/* ==========================================
   ULOŽENÍ PLÁNOVANÝCH POLOŽEK
   ========================================== */

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
    
    /* Odkaz na původní poznámku */
    sourceNoteId,
    
    /* Celá poznámka / označený text */
    sourceType,
    
    text,
    
    plannedAt,
    
    completed: false,
    
    createdAt: new Date().toISOString(),
    
    /* Pozice označeného textu v původní poznámce */
    selectionStart,
    selectionEnd
  };
}


/* ==========================================
   OTEVŘENÍ PLÁNOVÁNÍ PRO POZNÁMKU
   ========================================== */

function openPlannerForNote(note) {
  
  plannerSourceType = "note";
  plannerSelectionStart = null;
  plannerSelectionEnd = null;
  
  if (!note) {
    return;
  }
  
  plannerSourceNoteId = note.id || null;
  
  plannerTaskTitle.textContent =
    note.title || "Bez názvu";
  
  
  /* Aktuální datum a čas */
  const now = new Date();
  
  const year = now.getFullYear();
  
  const month =
    String(now.getMonth() + 1)
    .padStart(2, "0");
  
  const day =
    String(now.getDate())
    .padStart(2, "0");
  
  const hours =
    String(now.getHours())
    .padStart(2, "0");
  
  const minutes =
    String(now.getMinutes())
    .padStart(2, "0");
  
  
  plannerDate.value =
    `${year}-${month}-${day}`;
  
  plannerTime.value =
    `${hours}:${minutes}`;
  
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
  
  
  /* Bezpečnostní kontrola */
  if (!sourceNote) {
    console.error(
      "Zdrojová poznámka nebyla nalezena."
    );
    
    return;
  }
  
  
  const plannedAt =
    `${plannerDate.value}T${plannerTime.value}`;
  
  
  const text =
    sourceNote.title ||
    sourceNote.note ||
    "Bez názvu";
  
  
  const plannedItem =
  createPlannedItem(
    sourceNote.id,
    plannerSourceType === "selection" ?
    selectedPlannerText.trim() :
    text,
    plannedAt,
    plannerSourceType,
    plannerSelectionStart,
    plannerSelectionEnd
  );
  
  
  const plannedItems =
    loadPlannedItems();
  
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
   PLÁNOVÁNÍ OZNAČENÉ ČÁSTI TEXTU
   ========================================== */

const planSelectionButton =
  document.getElementById("planSelectionButton");

let selectedPlannerText = "";
let selectedPlannerStart = null;
let selectedPlannerEnd = null;


/* Zapamatujeme si označenou část textu */
function rememberPlannerSelection() {
  const start = modalText.selectionStart;
  const end = modalText.selectionEnd;
  
  if (start === end) {
    selectedPlannerText = "";
    selectedPlannerStart = null;
    selectedPlannerEnd = null;
    return;
  }
  
  selectedPlannerStart = start;
  selectedPlannerEnd = end;
  
  selectedPlannerText =
    modalText.value.slice(start, end);
}


/* Výběr textu na mobilu i PC */
modalText.addEventListener(
  "select",
  rememberPlannerSelection
);

modalText.addEventListener(
  "keyup",
  rememberPlannerSelection
);

modalText.addEventListener(
  "mouseup",
  rememberPlannerSelection
);

modalText.addEventListener(
  "touchend",
  rememberPlannerSelection
);


/* Kliknutí na 📅 ve spodní liště */
planSelectionButton.addEventListener(
  "click",
  () => {
    const text =
      selectedPlannerText.trim();
    
    if (!text) {
      console.log(
        "Nejdřív označ část textu."
      );
      
      return;
    }
    
    const tasks = loadTask();
    
    const sourceNote =
      tasks[activeTaskIndex];
    
    if (!sourceNote) {
      console.error(
        "Zdrojová poznámka nebyla nalezena."
      );
      
      return;
    }
    
    /* Starší poznámce případně doplníme ID */
    if (!sourceNote.id) {
      sourceNote.id =
        crypto.randomUUID();
      
      sourceNote.updatedAt =
        new Date().toISOString();
      
      saveAllTasks(tasks);
      
      uploadLocalNoteToSupabase(
        sourceNote
      );
    }
    
    plannerSourceNoteId =
      sourceNote.id;
    
    plannerTaskTitle.textContent =
      text;
    
    const now = new Date();
    
    const year =
      now.getFullYear();
    
    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");
    
    const day =
      String(
        now.getDate()
      ).padStart(2, "0");
    
    const hours =
      String(
        now.getHours()
      ).padStart(2, "0");
    
    const minutes =
      String(
        now.getMinutes()
      ).padStart(2, "0");
    
    plannerDate.value =
      `${year}-${month}-${day}`;
    
    plannerTime.value =
      `${hours}:${minutes}`;
    
    plannerSourceType = "selection";
    plannerSelectionStart = selectedPlannerStart;
    plannerSelectionEnd = selectedPlannerEnd;
    
    plannerModal.hidden = false;
  }
);

function renderPlannedTextLinks(noteId) {
  const items =
    loadPlannedItems().filter(
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
}function renderPlannedTextLinks(noteId) {
  const items =
    loadPlannedItems().filter(
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



function getPlannedSelectionsForNote(noteId) {
  return loadPlannedItems().filter(
    item =>
      item.sourceNoteId === noteId &&
      item.sourceType === "selection" &&
      Number.isInteger(item.selectionStart) &&
      Number.isInteger(item.selectionEnd)
  );
}


console.log(
  "PLÁN:",
  loadPlannedItems()
);

function renderPlannedTextHighlight(noteId, text) {
  const selections =
    getPlannedSelectionsForNote(noteId)
      .sort(
        (a, b) =>
          a.selectionStart - b.selectionStart
      );

  const escapeHtml = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  let html = "";
  let position = 0;

  selections.forEach((item) => {
    html += escapeHtml(
      text.slice(
        position,
        item.selectionStart
      )
    );

    html +=
      `<mark class="plannedTextMark">` +
      escapeHtml(
        text.slice(
          item.selectionStart,
          item.selectionEnd
        )
      ) +
      `</mark>`;

    position = item.selectionEnd;
  });

  html += escapeHtml(
    text.slice(position)
  );

  modalTextHighlight.innerHTML = html;
}