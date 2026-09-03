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
let plannerSourceTodoId = null;
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


/*
 * Úklid osiřelých Planner položek po dokončení synchronizace.
 * Pokud už zdrojová poznámka neexistuje, nemá položka v Plánu ani její
 * Android notifikace kam vést.
 */
async function uklidOsirelychPlanovanychPolozek() {
  if (typeof loadTask !== "function") {
    return 0;
  }

  const validNoteIds = new Set(
    loadTask()
      .filter((note) => note?.id)
      .map((note) => note.id)
  );

  const localItems = getLocalPlannedItems();
  const orphanItems = localItems.filter(
    (item) =>
      item?.sourceNoteId &&
      !validNoteIds.has(item.sourceNoteId)
  );

  if (orphanItems.length === 0) {
    return 0;
  }

  for (const item of orphanItems) {
    if (
      item?.notificationId &&
      typeof cancelNotification === "function"
    ) {
      await cancelNotification(item.notificationId);
    }
  }

  savePlannedItems(
    localItems.filter(
      (item) =>
        !item?.sourceNoteId ||
        validNoteIds.has(item.sourceNoteId)
    )
  );

  return orphanItems.length;
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


/*
 * Udržuje Planner položky navázané na obsah poznámky.
 *
 * 1) Když uživatel smaže přímo TODO řádek, odstraní se jeho Planner položka.
 * 2) Když uživatel smaže naplánovaný označený text, odstraní se Planner položka,
 *    pokud už v richContent neexistuje odpovídající data-planned-item-id nebo
 *    pokud po smazání zůstal jen prázdný wrapper.
 *
 * Celá zdrojová poznámka se touto funkcí nikdy nemaže.
 */
async function synchronizujPlanovaneTodoSPoznamkou(note) {
  if (!note?.id) {
    return note;
  }

  const validTodoIds = new Set(
    (Array.isArray(note.todos) ? note.todos : [])
      .filter(todo => todo?.id)
      .map(todo => todo.id)
  );

  /*
   * Ověření selection backlinků děláme podle stabilního plannedItemId,
   * ne podle textu. Stejný text se totiž může v poznámce objevit vícekrát.
   */
  const platneSelectionIds = new Set();

  if (typeof note.richContent === "string") {
    const sablona = document.createElement("template");
    sablona.innerHTML = note.richContent;

    sablona.content
      .querySelectorAll("[data-planned-item-id]")
      .forEach((odkaz) => {
        const plannedItemId =
          String(odkaz.dataset?.plannedItemId || "").trim();

        const maObsah =
          String(odkaz.textContent || "").trim().length > 0;

        if (plannedItemId && maObsah) {
          platneSelectionIds.add(plannedItemId);
        }
      });
  }

  const plannedItemsVPoznamce =
    Array.isArray(note.plannedItems)
      ? note.plannedItems
      : [];

  const lokalniItems = getLocalPlannedItems();

  /*
   * Starší data mohla mít Planner položku jen v lokálním seznamu.
   * Proto kontrolujeme sjednocení obou zdrojů a odstraníme vazbu z obou míst.
   */
  const kandidati = new Map();

  plannedItemsVPoznamce.forEach((item) => {
    if (item?.id) {
      kandidati.set(item.id, item);
    }
  });

  lokalniItems.forEach((item) => {
    if (
      item?.id &&
      item?.sourceNoteId === note.id &&
      !kandidati.has(item.id)
    ) {
      kandidati.set(item.id, item);
    }
  });

  const removedItems = Array.from(kandidati.values())
    .filter((item) => {
      if (!item?.id || item.sourceNoteId !== note.id) {
        return false;
      }

      if (
        item.sourceType === "todo" &&
        item.sourceTodoId
      ) {
        return !validTodoIds.has(item.sourceTodoId);
      }

      if (item.sourceType === "selection") {
        /*
         * Když richContent chybí úplně (např. velmi stará poznámka),
         * nic automaticky nemažeme – nemáme důkaz, že backlink zmizel.
         */
        if (typeof note.richContent !== "string") {
          return false;
        }

        return !platneSelectionIds.has(item.id);
      }

      return false;
    });

  if (removedItems.length === 0) {
    return note;
  }

  const removedIds = new Set(
    removedItems.map(item => item.id)
  );

  for (const item of removedItems) {
    if (
      item?.notificationId &&
      typeof cancelNotification === "function"
    ) {
      Promise.resolve(
        cancelNotification(item.notificationId)
      ).catch((error) => {
        console.warn(
          "Zrušení Planner notifikace bylo odloženo:",
          error
        );
      });
    }
  }

  note.plannedItems = plannedItemsVPoznamce.filter(
    item => !removedIds.has(item?.id)
  );

  savePlannedItems(
    lokalniItems.filter(
      item => !removedIds.has(item?.id)
    )
  );

  return note;
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
  selectionEnd = null,
  sourceTodoId = null
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
    selectionEnd,
    sourceTodoId
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
   PLÁNOVACÍ DIALOG
   Používá se jen pro označený text a TODO.
   Celá poznámka používá vlastní datum + čas.
   ========================================== */

/* ==========================================
   ZAVŘENÍ PLÁNOVACÍHO DIALOGU
   ========================================== */

function closePlanner() {
  plannerModal.hidden = true;
  plannerSourceNoteId = null;
  plannerSourceType = "note";
  plannerSourceTodoId = null;
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

  let sourceTodo = null;

  if (
    plannerSourceType === "todo" &&
    window.LubaNoteTodos
  ) {
    const currentTodos =
      window.LubaNoteTodos.ziskejAktivniTodos?.() || [];

    sourceTodo = currentTodos.find(
      todo => todo?.id === plannerSourceTodoId
    ) || null;

    if (!sourceTodo) {
      console.error(
        "TODO položka pro plánování nebyla nalezena.",
        plannerSourceTodoId
      );
      return;
    }

    /*
     * TODO může být právě rozepsané a editor ještě nebyl zavřený.
     * Před uložením Planneru proto uložíme i aktuální stav checkboxů,
     * textů, stabilních ID a barev přímo do zdrojové poznámky.
     */
    sourceNote.todos = currentTodos;
  }

  const text =
    plannerSourceType === "selection"
      ? selectedPlannerText.trim()
      : plannerSourceType === "todo"
        ? String(sourceTodo?.text || "").trim()
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
    plannerSelectionEnd,
    plannerSourceTodoId
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

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ukládám plán…",
      300
    ) || (() => {});

  try {
    if (
      window.LubaNoteSync
        ?.provedLokalniZmenuASynchronizuj
    ) {
      await window.LubaNoteSync
        .provedLokalniZmenuASynchronizuj(
          () => saveAllTasks(tasks)
        );
    } else {
      await saveAllTasks(tasks);

      if (
        navigator.onLine &&
        typeof uploadLocalNoteToSupabase === "function"
      ) {
        setTimeout(() => {
          uploadLocalNoteToSupabase(sourceNote)
            .catch((error) => {
              console.warn(
                "Synchronizace Planneru byla odložena:",
                error
              );
            });
        }, 0);
      }
    }
  } catch (error) {
    ukonciCekani();
    console.error(
      "Lokální uložení Planneru selhalo:",
      error
    );
    zobrazZpravuAplikace(
      "Plán",
      "Úkol se nepodařilo bezpečně uložit."
    );
    return;
  }

  ukonciCekani();

  if (
    plannerSourceType === "todo" &&
    plannerSourceTodoId
  ) {
    window.LubaNoteTodos
      ?.nastavTodoJakoNaplanovane?.(
        plannerSourceTodoId,
        true
      );
  }

  closePlanner();

  if (typeof renderRemindersScreen === "function") {
    requestAnimationFrame(
      renderRemindersScreen
    );
  }

  /*
   * Systémová notifikace se připraví až po návratu do aplikace.
   * Uživatel na Android plugin ani síť nečeká.
   */
  if (
    sourceNote.isSecret !== true &&
    typeof requestNotificationPermission === "function" &&
    typeof scheduleNotification === "function"
  ) {
    setTimeout(() => {
      (async () => {
        try {
          await requestNotificationPermission();

          const notificationTitle =
            (
              plannedItem.sourceType === "selection" ||
              plannedItem.sourceType === "todo"
            )
              ? plannedItem.text
              : (sourceNote.title || plannedItem.text);

          const notificationBody =
            (
              plannedItem.sourceType === "selection" ||
              plannedItem.sourceType === "todo"
            )
              ? (
                  sourceNote.title
                    ? `Z poznámky: ${sourceNote.title}`
                    : plannedItem.text
                )
              : (sourceNote.note || plannedItem.text);

          if (
            new Date(plannedItem.plannedAt) >
            new Date()
          ) {
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
          console.warn(
            "Planner notifikace bude obnovena později:",
            error
          );
        }
      })();
    }, 0);
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

function najdiZdrojovouPoznamkuOtevrenehoEditoru(tasks) {
  const editorTaskId =
    document.getElementById("taskModal")?.dataset.taskId || null;

  const kandidatiId = [
    editorTaskId,
    (
      typeof activeTaskId !== "undefined"
        ? activeTaskId
        : null
    )
  ].filter(Boolean);

  for (const taskId of kandidatiId) {
    const sourceNote = tasks.find(
      task => task?.id === taskId
    );

    if (sourceNote) {
      return sourceNote;
    }
  }

  if (
    typeof activeTaskIndex !== "undefined" &&
    Number.isInteger(activeTaskIndex) &&
    activeTaskIndex >= 0
  ) {
    return tasks[activeTaskIndex] || null;
  }

  return null;
}


async function zajistiUlozenouZdrojovouPoznamkuProPlanner() {
  let tasks = loadTask();
  let sourceNote =
    najdiZdrojovouPoznamkuOtevrenehoEditoru(tasks);

  if (sourceNote?.id) {
    return { tasks, sourceNote };
  }

  /* Velmi stará uložená poznámka může ještě existovat bez ID.
     Nebereme ji jako novou – pouze jí doplníme stabilní identitu. */
  if (sourceNote && !sourceNote.id) {
    sourceNote.id =
      typeof vytvorStabilniIdStarePoznamky === "function"
        ? vytvorStabilniIdStarePoznamky(sourceNote)
        : crypto.randomUUID();

    sourceNote.updatedAt = new Date().toISOString();

    if (
      window.LubaNoteSync
        ?.provedLokalniZmenuASynchronizuj
    ) {
      await window.LubaNoteSync
        .provedLokalniZmenuASynchronizuj(
          () => saveAllTasks(tasks)
        );
    } else {
      await saveAllTasks(tasks);
    }

    const taskModal = document.getElementById("taskModal");
    if (taskModal) {
      taskModal.dataset.taskId = sourceNote.id;
    }

    if (typeof activeTaskId !== "undefined") {
      activeTaskId = sourceNote.id;
    }

    return { tasks, sourceNote };
  }

  /*
   * Nová poznámka dosud není v localStorage, takže Planner nemá
   * stabilní sourceNoteId. Plánování je samo o sobě vědomá akce,
   * proto novou poznámku nejdřív bezpečně uložíme, ale editor
   * necháme otevřený. V odemčeném Secret režimu se zachová stávající
   * volba „Uložit jako tajnou / Uložit normálně“ a po ní plánování
   * automaticky pokračuje.
   */
  if (typeof ulozAZavriEditor !== "function") {
    return null;
  }

  const vysledek =
    typeof window.ulozNovouPoznamkuProPlanovani === "function"
      ? await window.ulozNovouPoznamkuProPlanovani()
      : await ulozAZavriEditor(
          "normal",
          {
            nezavirat: true,
            tichyRezim: true
          }
        );

  if (vysledek?.ok !== true || !vysledek.noteId) {
    return null;
  }

  tasks = loadTask();
  sourceNote = tasks.find(
    task => task?.id === vysledek.noteId
  ) || null;

  if (!sourceNote) {
    return null;
  }

  /* Nově uložená poznámka se od této chvíle chová jako běžně
     otevřená uložená poznámka – včetně handoff ochrany. */
  if (
    window.LubaNoteEditorHandoff
      ?.pripravOtevreniEditoru
  ) {
    const povoleno =
      await window.LubaNoteEditorHandoff
        .pripravOtevreniEditoru(sourceNote.id);

    if (povoleno !== true) {
      return null;
    }
  }

  if (typeof zahajEditorSession === "function") {
    zahajEditorSession(sourceNote.id);
  } else if (typeof activeTaskId !== "undefined") {
    activeTaskId = sourceNote.id;
  }

  const taskModal = document.getElementById("taskModal");
  if (taskModal) {
    taskModal.dataset.taskId = sourceNote.id;
  }

  if (typeof activeTaskIndex !== "undefined") {
    activeTaskIndex = tasks.findIndex(
      task => task?.id === sourceNote.id
    );
  }

  return { tasks, sourceNote };
}


planSelectionButton.addEventListener(
  "click",
  async () => {
    const todoModeActive =
      window.LubaNoteTodos
        ?.jeTodoRezimAktivni?.() === true;

    const selectedTodo =
      window.LubaNoteTodos?.ziskejVybraneTodo?.() || null;

    if (todoModeActive) {
      if (!selectedTodo) {
        return;
      }

      const todoText =
        String(selectedTodo.text || "").trim();

      if (!todoText) {
        return;
      }

      let tasks = loadTask();
      let sourceNote =
        najdiZdrojovouPoznamkuOtevrenehoEditoru(tasks);

      if (!sourceNote?.id) {
        const zajisteno =
          await zajistiUlozenouZdrojovouPoznamkuProPlanner();

        tasks = zajisteno?.tasks || loadTask();
        sourceNote = zajisteno?.sourceNote || null;
      }

      if (!sourceNote?.id) {
        console.error(
          "Zdrojová poznámka TODO nebyla nalezena ani po bezpečném uložení."
        );
        return;
      }

      plannerSourceNoteId = sourceNote.id;
      plannerSourceType = "todo";
      plannerSourceTodoId = selectedTodo.id;
      plannerSelectionStart = null;
      plannerSelectionEnd = null;
      selectedPlannerText = todoText;

      plannerTaskTitle.textContent = todoText;

      window.LubaNoteTodos
        ?.ukonciEditaciVybranehoTodo?.();

      window.getSelection()
        ?.removeAllRanges();

      setPlannerDateTimeToNow();
      plannerModal.hidden = false;
      return;
    }

    const snapshot =
      RichTextColors.getSelectionSnapshot();

    if (!snapshot) {
      return;
    }

    const text = snapshot.text.trim();

    if (!text) {
      return;
    }

    const kontrolaBacklinku =
      window.LubaNotePlannedTextLinks
        ?.overVyberProBacklink?.(snapshot.range);

    if (
      kontrolaBacklinku &&
      kontrolaBacklinku.ok === false
    ) {
      if (
        typeof window.zobrazZpravuAplikace ===
        "function"
      ) {
        window.zobrazZpravuAplikace(
          "Backlink nelze vytvořit",
          kontrolaBacklinku.duvod
        );
      } else {
        console.warn(
          "Backlink nelze vytvořit:",
          kontrolaBacklinku.duvod
        );
      }

      return;
    }

    let tasks = loadTask();
    let sourceNote =
      najdiZdrojovouPoznamkuOtevrenehoEditoru(tasks);

    if (!sourceNote?.id) {
      const zajisteno =
        await zajistiUlozenouZdrojovouPoznamkuProPlanner();

      tasks = zajisteno?.tasks || loadTask();
      sourceNote = zajisteno?.sourceNote || null;
    }

    if (!sourceNote) {
      console.error(
        "Zdrojová poznámka nebyla nalezena ani po bezpečném uložení."
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

    /* Starším poznámkám doplníme stejné stabilní ID na všech zařízeních. */
    if (!sourceNote.id) {
      sourceNote.id =
        typeof vytvorStabilniIdStarePoznamky === "function"
          ? vytvorStabilniIdStarePoznamky(sourceNote)
          : crypto.randomUUID();

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


window.LubaNotePlanner = {
  synchronizujPlanovaneTodoSPoznamkou
};
