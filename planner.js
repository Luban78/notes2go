/* ==========================================
   LUBANOTE – PLÁNOVÁNÍ
   Samostatné plánované položky
   ========================================== */

const PLANNER_STORAGE_KEY = "plannedItems";

/* Poznámka, ze které právě plánujeme */
let plannerSourceNoteId = null;


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
  sourceType = "note"
) {
  return {
    id: crypto.randomUUID(),
    
    /* Odkaz na původní poznámku */
    sourceNoteId,
    
    /* Celá poznámka / později označený text */
    sourceType,
    
    text,
    
    plannedAt,
    
    completed: false,
    
    createdAt: new Date().toISOString()
  };
}


/* ==========================================
   OTEVŘENÍ PLÁNOVÁNÍ PRO POZNÁMKU
   ========================================== */

function openPlannerForNote(note) {
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
      text,
      plannedAt,
      "note"
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