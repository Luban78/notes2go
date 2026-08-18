/* ==========================================
   LUBANOTE – PLÁNOVÁNÍ
   Samostatné plánované položky
   ========================================== */

const PLANNER_STORAGE_KEY = "plannedItems";

const planSelectionButton =
  document.getElementById("planSelectionButton");

const plannerDateButton =
  document.getElementById("plannerDateButton");

const plannerDateLabel =
  document.getElementById("plannerDateLabel");

const plannerTimeButton =
  document.getElementById("plannerTimeButton");

const plannerTimeLabel =
  document.getElementById("plannerTimeLabel");

function aktualizujPopiskyPlanovanehoTerminu() {
  if (plannerDateLabel) {
    if (plannerDate?.value) {
      const [rok, mesic, den] =
        plannerDate.value.split("-");

      plannerDateLabel.textContent =
        `${den}.${mesic}.${rok}`;
    } else {
      plannerDateLabel.textContent = "Datum";
    }
  }

  if (plannerTimeLabel) {
    plannerTimeLabel.textContent =
      plannerTime?.value || "Čas";
  }
}

plannerDateButton?.addEventListener(
  "click",
  () => {
    if (
      typeof window.otevriVlastniVyberData !==
      "function"
    ) {
      return;
    }

    window.otevriVlastniVyberData({
      input: plannerDate,
      label: plannerDateLabel
    });
  }
);

plannerTimeButton?.addEventListener(
  "click",
  () => {
    if (
      typeof window.otevriVlastniVyberCasu !==
      "function"
    ) {
      return;
    }

    window.otevriVlastniVyberCasu({
      input: plannerTime,
      label: plannerTimeLabel
    });
  }
);

/* Poznámka, ze které právě plánujeme. */
let plannerSourceNoteId = null;
let plannerSourceType = "note";
let plannerSelectionStart = null;
let plannerSelectionEnd = null;
let selectedPlannerText = "";


/* ==========================================
   NAČTENÍ / ULOŽENÍ PLÁNOVANÝCH POLOŽEK
   ========================================== */

function getLocalPlannedItems() {
  try {
    const items = JSON.parse(
      localStorage.getItem(PLANNER_STORAGE_KEY)
    ) || [];

    const secretIds =
      typeof getSecretNoteIds === "function"
        ? getSecretNoteIds()
        : new Set();

    const safeItems = Array.isArray(items)
      ? items.filter(
          (item) => !secretIds.has(item?.sourceNoteId)
        )
      : [];

    /* Starý plaintext Planner z tajné poznámky rovnou odstraníme. */
    if (safeItems.length !== items.length) {
      localStorage.setItem(
        PLANNER_STORAGE_KEY,
        JSON.stringify(safeItems)
      );
    }

    return safeItems;
  } catch (error) {
    console.error(
      "Chyba při načítání plánovaných položek:",
      error
    );

    return [];
  }
}

function loadPlannedItems() {
  const merged = new Map();

  /* Starší položky uložené jen lokálně. */
  getLocalPlannedItems().forEach((item) => {
    if (item?.id) {
      merged.set(item.id, item);
    }
  });

  /* Nově jsou položky uložené také uvnitř poznámky,
     takže se přenesou přes existující Supabase sync poznámek. */
  loadTask().forEach((note) => {
    (note.plannedItems || []).forEach((item) => {
      if (item?.id) {
        merged.set(item.id, item);
      }
    });
  });

  return Array.from(merged.values());
}

function savePlannedItems(items) {
  const secretIds =
    typeof getSecretNoteIds === "function"
      ? getSecretNoteIds()
      : new Set();

  const safeItems = (Array.isArray(items) ? items : [])
    .filter(
      (item) => !secretIds.has(item?.sourceNoteId)
    );

  localStorage.setItem(
    PLANNER_STORAGE_KEY,
    JSON.stringify(safeItems)
  );
}

/* Jednorázově připne staré lokální položky k jejich zdrojovým
   poznámkám. Díky tomu se nahrají do Supabase bez nové DB tabulky. */
function migrateLocalPlannedItemsIntoNotes(notes) {
  const localItems = getLocalPlannedItems();
  let changed = false;

  localItems.forEach((item) => {
    if (!item?.id || !item.sourceNoteId) {
      return;
    }

    const note = notes.find(
      candidate => candidate.id === item.sourceNoteId
    );

    if (!note) {
      return;
    }

    note.plannedItems = Array.isArray(note.plannedItems)
      ? note.plannedItems
      : [];

    const alreadyStored = note.plannedItems.some(
      stored => stored.id === item.id
    );

    if (!alreadyStored) {
      note.plannedItems.push(item);
      note.updatedAt = new Date().toISOString();
      changed = true;
    }
  });

  return changed;
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
    notificationId:
      typeof createUniqueNotificationId === "function"
        ? createUniqueNotificationId()
        : ((Date.now() % 2147483646) + 1),
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

  aktualizujPopiskyPlanovanehoTerminu();
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

  if (plannerTaskTitle) {
    plannerTaskTitle.textContent = "";
  }

  /* Starý výběr už nesmí ovlivnit další akci. */
  RichTextColors.clearSelection();
}


/* ==========================================
   ULOŽENÍ NAPLÁNOVANÉHO ÚKOLU
   ========================================== */

async function saveCurrentPlannedItem() {
  if (
    !plannerDate.value ||
    !plannerTime.value
  ) {
    return;
  }

  const tasks = loadTask();

  let sourceNote = tasks.find(
    task => task.id === plannerSourceNoteId
  );

  if (!sourceNote) {
    const editorTaskId =
      document.getElementById("taskModal")?.dataset.taskId || null;

    if (editorTaskId) {
      sourceNote = tasks.find(
        task => task?.id === editorTaskId
      );

      if (sourceNote) {
        plannerSourceNoteId = sourceNote.id;
      }
    }
  }

  if (!sourceNote) {
    console.error(
      "Zdrojová poznámka nebyla nalezena.",
      {
        plannerSourceNoteId,
        editorTaskId:
          document.getElementById("taskModal")?.dataset.taskId || null,
        taskCount: tasks.length
      }
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
  
  window.lastCreatedPlannedItemId =
  plannedItem.id;
  
  if (plannerSourceType === "selection") {
    const backlinkVytvoren =
      wrapCurrentSelectionAsPlannedLink(
        plannedItem.id
      );

    if (!backlinkVytvoren) {
      console.error(
        "Plánování bylo zastaveno: nepodařilo se vytvořit backlink v poznámce."
      );
      return;
    }
  }

  const plannedItems = loadPlannedItems();
  plannedItems.push(plannedItem);
  savePlannedItems(plannedItems);

  /* Plán i backlink uložíme přímo do zdrojové poznámky.
     Celý objekt poznámky se už synchronizuje v Supabase jako JSON. */
  sourceNote.plannedItems = Array.isArray(sourceNote.plannedItems)
    ? sourceNote.plannedItems
    : [];

  if (!sourceNote.plannedItems.some(item => item.id === plannedItem.id)) {
    sourceNote.plannedItems.push(plannedItem);
  }

  if (plannerSourceType === "selection") {
    sourceNote.note = modalRichText.innerText;
    sourceNote.richContent = modalRichText.innerHTML;
  }

  sourceNote.updatedAt = new Date().toISOString();

  await saveAllTasks(tasks);

  if (typeof uploadLocalNoteToSupabase === "function") {
    await uploadLocalNoteToSupabase(sourceNote);
  }

  /* Každá položka Planneru je současně samostatný úkol v Připomínkách.
     V APK jí proto naplánujeme vlastní systémovou notifikaci. */
  if (
    sourceNote.isSecret !== true &&
    typeof requestNotificationPermission === "function" &&
    typeof scheduleNotification === "function"
  ) {
    try {
      await requestNotificationPermission();

      const notificationTitle =
        plannerSourceType === "selection"
          ? plannedItem.text
          : (sourceNote.title || plannedItem.text);

      const notificationBody =
        plannerSourceType === "selection"
          ? (
              sourceNote.title
                ? `Z poznámky: ${sourceNote.title}`
                : plannedItem.text
            )
          : (sourceNote.note || plannedItem.text);

      if (new Date(plannedItem.plannedAt) > new Date()) {
        await scheduleNotification(
          plannedItem.notificationId,
          notificationTitle,
          plannedItem.plannedAt,
          notificationBody,
          {
            lubanoteType: "planned",
            plannedItemId: plannedItem.id,
            sourceNoteId: sourceNote.id
          }
        );
      }
    } catch (error) {
      console.error(
        "Planned notification schedule error:",
        error
      );
    }
  }

  closePlanner();

  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }

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
      RichTextColors.getSelectionSnapshot();

    if (!snapshot) {
      return;
    }

    const text = snapshot.text.trim();

    if (!text) {
      return;
    }

    const tasks = loadTask();

    /*
     * Aktivní poznámku hledáme primárně podle stabilního ID.
     * Pokud ale ID po předchozí asynchronní akci už nesedí,
     * bezpečně použijeme aktuální index otevřeného editoru.
     * Tím plánování nespadne jen kvůli zastaralému activeTaskId.
     */
    let sourceNote = null;

    /*
     * Nejspolehlivější identita otevřené poznámky je uložená
     * přímo na editoru. Díky tomu plánování přežije i situaci,
     * kdy jiný asynchronní kód mezitím změní activeTaskId/index.
     */
    const editorTaskId =
      document.getElementById("taskModal")?.dataset.taskId || null;

    const kandidatiId = [
      editorTaskId,
      (typeof activeTaskId !== "undefined" ? activeTaskId : null)
    ].filter(Boolean);

    for (const taskId of kandidatiId) {
      sourceNote = tasks.find(
        (task) => task?.id === taskId
      );

      if (sourceNote) {
        break;
      }
    }

    if (
      !sourceNote &&
      typeof activeTaskIndex !== "undefined" &&
      Number.isInteger(activeTaskIndex) &&
      activeTaskIndex >= 0
    ) {
      sourceNote = tasks[activeTaskIndex] || null;
    }

    if (!sourceNote) {
      console.error(
        "Zdrojová poznámka nebyla nalezena.",
        {
          editorTaskId,
          activeTaskId:
            typeof activeTaskId !== "undefined" ? activeTaskId : null,
          activeTaskIndex:
            typeof activeTaskIndex !== "undefined" ? activeTaskIndex : null,
          taskCount: tasks.length
        }
      );
      return;
    }

    /* Srovnáme všechny identity editoru s právě nalezenou poznámkou. */
    if (sourceNote.id) {
      const taskModal = document.getElementById("taskModal");

      if (taskModal) {
        taskModal.dataset.taskId = sourceNote.id;
      }

      if (typeof activeTaskId !== "undefined") {
        activeTaskId = sourceNote.id;
      }

      if (typeof activeTaskIndex !== "undefined") {
        activeTaskIndex = tasks.findIndex(
          (task) => task?.id === sourceNote.id
        );
      }
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
    /*
 * Výběr už máme bezpečně uložený v RichTextColors.
 * Zrušíme pouze nativní Android označení, aby jeho
 * nabídka Vyjmout/Kopírovat/Vložit nelezla přes Planner.
 */
const androidSelection =
  window.getSelection();

if (androidSelection) {
  androidSelection.removeAllRanges();
}

modalRichText.blur();

    setPlannerDateTimeToNow();
    plannerModal.hidden = false;
  }
);
