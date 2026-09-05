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
const aboutVersion =
  document.getElementById("aboutVersion");

if (aboutVersion) {
  aboutVersion.textContent =
    `Verze ${window.LUBANOTE_VERSION || "DEV"}`;
}

const settingsVersionValue =
  document.getElementById("settingsVersionValue");

if (settingsVersionValue) {
  settingsVersionValue.textContent =
    window.LUBANOTE_VERSION || "DEV";
}

const deleteConfirmModal =
  document.getElementById("deleteConfirmModal");

const cancelDeleteButton =
  document.getElementById("cancelDeleteButton");

const confirmDeleteButton =
  document.getElementById("confirmDeleteButton");

const deleteConfirmTitle =
  deleteConfirmModal?.querySelector("h3");

const deleteConfirmText =
  deleteConfirmModal?.querySelector("p");

const puvodniNadpisPotvrzeniSmazani =
  deleteConfirmTitle?.textContent?.trim() ||
  "Přesunout do koše?";

const puvodniTextPotvrzeniSmazani =
  deleteConfirmText?.textContent?.trim() ||
  "Poznámka se přesune do Koše a můžeš ji později obnovit.";

let hromadneMazaniIds = null;

cancelDeleteButton.addEventListener("click", () => {
  deleteConfirmModal.hidden = true;
  hromadneMazaniIds = null;
  
  if (deleteConfirmTitle) {
    deleteConfirmTitle.textContent =
      puvodniNadpisPotvrzeniSmazani;
  }
  
  if (deleteConfirmText) {
    deleteConfirmText.textContent =
      puvodniTextPotvrzeniSmazani;
  }
  
  if (rezimVyberuKaret) {
    zobrazAkceVybranychKaret();
  }
});

const appMessageSecretButton =
  document.getElementById(
    "appMessageSecretButton"
  );

const appMessageNormalButton =
  document.getElementById(
    "appMessageNormalButton"
  );



confirmDeleteButton.addEventListener("click", async () => {
  /* Hromadné smazání vybraných karet. */
  if (Array.isArray(hromadneMazaniIds)) {
    const idsKeSmazani = [...hromadneMazaniIds];
    
    hromadneMazaniIds = null;
    deleteConfirmModal.hidden = true;
    
    if (deleteConfirmTitle) {
      deleteConfirmTitle.textContent =
        puvodniNadpisPotvrzeniSmazani;
    }
    
    if (deleteConfirmText) {
      deleteConfirmText.textContent =
        puvodniTextPotvrzeniSmazani;
    }
    
    const vysledek =
      await smazPoznamkyPodleId(
        idsKeSmazani
      );
    
    ukonciRezimVyberuKaret();
    
    if (vysledek?.pocet > 0) {
      zobrazPotvrzeniAkce(
        window.LubaNoteI18n?.t?.(
          "trash.movedMany",
          "Přesunuto do Koše: {count} poznámek",
          { count: vysledek.pocet }
        ) || `Přesunuto do Koše: ${vysledek.pocet} poznámek`
      );
    }
    
    if (typeof renderCalendar === "function") {
      renderCalendar();
    }
    
    if (typeof renderRemindersScreen === "function") {
      renderRemindersScreen();
    }
    
    return;
  }
  
  if (selectedCardIndex === null) {
    return;
  }
  
  await deleteTask(selectedCardIndex);
  
  deleteConfirmModal.hidden = true;
  selectedCardIndex = null;
  
  const mazanyTaskId = activeTaskId;
  uvolniVzdalenouEditorSession(
    mazanyTaskId
  );

  taskModal.hidden = true;
  taskModal.removeAttribute("data-task-id");
  ukonciDraftPoznamky();
  activeTaskIndex = null;
  activeTaskId = null;
  editorSessionId += 1;
  
  renderTasks();
  
  if (typeof renderCalendar === "function") {
    renderCalendar();
  }
  
  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }
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

/*
 * Tap mimo hlavní menu pouze menu zavře.
 * Ochranu následného syntetického clicku registrujeme JEDNOU,
 * ne při každém zavření menu. Tím se nehromadí globální listenery.
 */
document.addEventListener(
  "pointerdown",
  (event) => {
    if (mainMenu.hidden) {
      return;
    }
    
    if (
      mainMenu.contains(event.target) ||
      mainMenuButton.contains(event.target)
    ) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    blokovatKlikPoZavreniMainMenu = true;
    
    setTimeout(() => {
      blokovatKlikPoZavreniMainMenu = false;
    }, 500);
    
    mainMenu.hidden = true;
    mainMenuButton.setAttribute(
      "aria-expanded",
      "false"
    );
  },
  true
);

document.addEventListener(
  "click",
  (event) => {
    if (!blokovatKlikPoZavreniMainMenu) {
      return;
    }
    
    blokovatKlikPoZavreniMainMenu = false;
    
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true
);

let activeTaskIndex = null;
let activeTaskId = null;
let editorSessionId = 0;

let reminderEnabled = false;
let favoriteEnabled = false;
let secretTaskEnabled = false;

/* Čekající bezpečné první uložení nové poznámky vyvolané Plannerem.
   Používá se jen v odemčeném Secret režimu, kde musí zůstat zachována
   volba Uložit jako tajnou / Uložit normálně. */
let cekajiciUlozeniNoveProPlanner = null;

let puvodniOtiskEditoru = null;

/*
 * Sdílený editor (S2D.1) používá stejný vizuální editor jako vlastní
 * poznámky, ale nikdy nevkládá sdílenou poznámku do savedTask.
 * Síťovou logiku drží samostatný sharingEditor.js.
 */
let aktivniSdilenaEditace = null;

function vytvorOtiskEditoru() {
  return JSON.stringify({
    title: ziskejNazevPoznamkyZEditoru().trim(),
    richContent: modalRichText.innerHTML,
    date: modalDate.value,
    time: modalTime.value,
    reminder: reminderEnabled,
    favorite: favoriteEnabled,
    area: activeArea,
    secret: secretTaskEnabled,
    tags: [...activeTags],
    todos: [...activeTodos],
    repeat: kopirujEditorRepeat(
      editorRepeat
    )
  });
}

function bylEditorZmenen() {
  return (
    puvodniOtiskEditoru !== null &&
    vytvorOtiskEditoru() !==
    puvodniOtiskEditoru
  );
}


function uvolniSdilenyLockPriZavreni(
  noteId
) {
  if (
    !noteId ||
    aktivniSdilenaEditace?.noteId !==
      noteId
  ) {
    return;
  }

  /*
   * Shared lock nesmí po zavření editoru zůstat viset.
   * Modul si nejdřív lokálně ukončí heartbeat/session a pak
   * best-effort odešle release na server. Zavření UI na RPC
   * nečeká, aby bylo okamžité.
   */
  Promise.resolve(
    window.LubaNoteSharedEditor
      ?.uvolniSdilenyEditor?.(noteId)
  ).catch((error) => {
    console.warn(
      "Sdílený editor: release při zavření se dokončí expirací lease.",
      error
    );
  });
}

function zpracujZavreniEditoru() {
  if (bylEditorZmenen()) {
    resetujAkceZpravyAplikace();

    appMessageTitle.textContent =
      "Soubor byl změněn";
    
    appMessageText.textContent =
      "Uložit změny?";
    
    appMessageSaveButton.hidden = false;
    appMessageDiscardButton.hidden = false;
    
    closeAppMessageButton.textContent =
      "Zrušit";
    
    appMessageModal.hidden = false;
    
    return;
  }
  
  taskModal.classList.remove("show");
  document.body.classList.remove("noScroll");

  const zaviranyTaskId = activeTaskId;
  uvolniVzdalenouEditorSession(
    zaviranyTaskId
  );
  uvolniSdilenyLockPriZavreni(
    zaviranyTaskId
  );

  if (
    aktivniSdilenaEditace?.noteId ===
      zaviranyTaskId
  ) {
    aktivniSdilenaEditace = null;
    taskModal.classList.remove(
      "sharingEditorMode"
    );
    taskModal.removeAttribute(
      "data-shared-task-id"
    );
  }

  activeTaskIndex = null;
  activeTaskId = null;
  taskModal.removeAttribute("data-task-id");
  ukonciDraftPoznamky();
  editorSessionId += 1;
  
  setTimeout(() => {
    if (!taskModal.classList.contains("show")) {
      taskModal.hidden = true;
    }
  }, 250);
  
  RichTextColors.reset();
}




document.addEventListener(
  "keydown",
  (udalost) => {
    if (udalost.key !== "Escape") {
      return;
    }

    const handoffModal =
      document.getElementById(
        "editorHandoffModal"
      );

    if (handoffModal && !handoffModal.hidden) {
      udalost.preventDefault();

      const zrusit = handoffModal.querySelector(
        "#editorHandoffCancelButton"
      );

      if (
        zrusit &&
        !zrusit.hidden &&
        !zrusit.disabled
      ) {
        zrusit.click();
      }

      return;
    }

    if (!taskModal.hidden) {
      udalost.preventDefault();
      zpracujZavreniEditoru();
    }
  }
);
/* Opakování celé poznámky – jediný systém opakovaných úkolů. */
let editorRepeat = null;


/* ==========================================
   STABILNÍ IDENTITA OTEVŘENÉ POZNÁMKY
   ========================================== */

function zahajEditorSession(taskId = null) {
  editorSessionId += 1;
  activeTaskId = taskId || null;
}

function vytvorDraftIdPoznamky() {
  return (
    crypto.randomUUID?.() ||
    `draft-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  );
}

function zahajDraftNovePoznamky() {
  const draftId = vytvorDraftIdPoznamky();

  taskModal?.setAttribute(
    "data-draft-task-id",
    draftId
  );

  return draftId;
}

function ziskejDraftIdPoznamky() {
  return taskModal?.dataset?.draftTaskId || null;
}

function ukonciDraftPoznamky() {
  taskModal?.removeAttribute(
    "data-draft-task-id"
  );
}

async function zahodLokalniPrilohyDraftu() {
  const draftId = ziskejDraftIdPoznamky();

  if (!draftId) {
    return 0;
  }

  try {
    return await window.LubaNoteAttachmentsLocal
      ?.smazPrilohyPodleNoteId?.(draftId) || 0;
  } catch (error) {
    console.warn(
      "LubaNote attachments: přílohy zahozeného draftu se nepodařilo uklidit.",
      error
    );
    return 0;
  } finally {
    await smazPersistovanyDraftPoznamky(draftId);
    ukonciDraftPoznamky();
  }
}


function uvolniVzdalenouEditorSession(
  taskId = activeTaskId
) {
  if (!taskId) {
    return;
  }

  if (
    aktivniSdilenaEditace?.noteId === taskId
  ) {
    window.LubaNoteSharedEditor
      ?.uvolniSdilenyEditor?.(taskId);
    return;
  }

  window.LubaNoteEditorHandoff
    ?.uvolniEditorPoznamky?.(taskId);
}


function najdiAktivniPoznamku(tasks) {
  if (!Array.isArray(tasks)) {
    return null;
  }
  
  if (activeTaskId) {
    const index = tasks.findIndex(
      (task) => task?.id === activeTaskId
    );
    
    if (index === -1) {
      return null;
    }
    
    activeTaskIndex = index;
    
    return {
      index,
      task: tasks[index]
    };
  }
  
  if (
    activeTaskIndex !== null &&
    tasks[activeTaskIndex]
  ) {
    const task = tasks[activeTaskIndex];
    
    if (task?.id) {
      activeTaskId = task.id;
    }
    
    return {
      index: activeTaskIndex,
      task
    };
  }
  
  return null;
}

const secretTaskButton =
  document.getElementById("secretTaskButton");

function aktualizujIkonuTajnePoznamky() {
  if (!secretTaskButton) {
    return;
  }

  const nazevIkony =
    secretTaskEnabled ? "zamek" : "odemceno";

  if (window.LubaNoteIcons?.nastavJenIkonu) {
    window.LubaNoteIcons.nastavJenIkonu(
      secretTaskButton,
      nazevIkony,
      ["editorSecretSvgIcon"]
    );
  }
}

const editorBackButton = document.getElementById("editorBackButton");

const deleteTaskButton =
  document.getElementById("deleteTaskButton");
deleteTaskButton?.addEventListener("click", () => {
  const tasks = loadTask();
  const aktivni = najdiAktivniPoznamku(tasks);
  
  if (!aktivni) {
    return;
  }
  
  selectedCardIndex = aktivni.index;
  
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

const timeRepeatSection =
  document.getElementById("timeRepeatSection");

const timeRepeatWeekdays =
  document.getElementById("timeRepeatWeekdays");

const timeRepeatSummary =
  document.getElementById("timeRepeatSummary");

const timeRepeatPresetButtons =
  Array.from(
    document.querySelectorAll(
      "[data-repeat-preset]"
    )
  );

const timeRepeatDayButtons =
  Array.from(
    document.querySelectorAll(
      "[data-repeat-day]"
    )
  );

const modalDateLabel =
  document.getElementById("modalDateLabel");

const modalTimeLabel =
  document.getElementById("modalTimeLabel");
// ==========================================
// UNIVERZÁLNÍ INFORMAČNÍ MODAL
// Společné upozornění pro celou aplikaci.
// ==========================================

const appMessageModal =
  document.getElementById("appMessageModal");

const appMessageTitle =
  document.getElementById("appMessageTitle");

const appMessageText =
  document.getElementById("appMessageText");

const closeAppMessageButton =
  document.getElementById("closeAppMessageButton");

const appMessageSaveButton =
  document.getElementById(
    "appMessageSaveButton"
  );

const appMessageDiscardButton =
  document.getElementById(
    "appMessageDiscardButton"
  );

secretTaskButton?.addEventListener(
  "click",
  async () => {
    if (!tajnyRezimOdemceny) {
      return;
    }
    
    secretTaskEnabled = !secretTaskEnabled;
    
    aktualizujIkonuTajnePoznamky();
    
    secretTaskButton.classList.toggle(
      "active",
      secretTaskEnabled
    );
    
    if (secretTaskEnabled) {
      /*
       * SECRET = absolutní ticho.
       */
      reminderEnabled = false;
      editorRepeat = null;
      aktualizujPopiskyDataCasu();
      
      if (typeof updateReminderButton === "function") {
        updateReminderButton(false);
      }
      
      {
        const currentTasks = loadTask();
        const aktivni =
          najdiAktivniPoznamku(currentTasks);
        
        const currentTask =
          aktivni?.task || null;
        
        if (
          currentTask?.notificationId &&
          typeof cancelNotification === "function"
        ) {
          cancelNotification(currentTask.notificationId);
        }
      }

      if (typeof updateTagMenuUI === "function") {
        await updateTagMenuUI();
      }

      return;
    }
    
    /*
     * ODTАJNĚNÍ POZNÁMKY:
     * běžná poznámka nesmí obsahovat tajný štítek.
     */
    activeTags = activeTags.filter(
      (tagName) => {
        const tag = syncedTags.find(
          (item) =>
          item.name.trim().toLowerCase() ===
          tagName.trim().toLowerCase()
        );
        
        return tag?.is_secret !== true;
      }
    );
    
    await updateTagMenuUI();
  }
);

async function ulozOtevrenouTajnouPoznamkuPredZamknutim() {
  if (!secretTaskEnabled || taskModal?.hidden) {
    return null;
  }
  
  const title = ziskejNazevPoznamkyZEditoru().trim();
  const note = modalRichText.innerText;
  const richContent = modalRichText.innerHTML;
  const date =
    modalDate.value && modalTime.value ?
    `${modalDate.value}T${modalTime.value}` :
    "";
  
  let savedNote = null;
  
  const tasks = loadTask();
  const aktivni = najdiAktivniPoznamku(tasks);
  
  /*
   * Pokud editor patří existující poznámce, ale její ID už v datech
   * nenajdeme, NESMÍME z obsahu vytvořit novou kartu s novým UUID.
   */
  if (activeTaskId && !aktivni) {
    console.error(
      "Uložení tajné poznámky bylo zastaveno: původní poznámka nebyla nalezena."
    );
    return null;
  }
  
  if (aktivni) {
    const currentTask = aktivni.task;
    
    savedNote = {
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
      isSecret: true,
      tags: [...activeTags],
      todos: [...activeTodos],
      repeat: secretTaskEnabled ?
        null : kopirujEditorRepeat(editorRepeat)
    };
    
    if (
      window.LubaNotePlanner
      ?.synchronizujPlanovaneTodoSPoznamkou
    ) {
      await window.LubaNotePlanner
        .synchronizujPlanovaneTodoSPoznamkou(
          savedNote
        );
    }
    
    await updateTask(aktivni.index, savedNote);
  } else {
    const maVlozenyMediaObsah =
      window.LubaNoteEditorMedia
      ?.maVlozenyObsah?.() === true;
    
    const isEmpty =
      title === "" &&
      note.trim() === "" &&
      activeTodos.length === 0 &&
      !maVlozenyMediaObsah;
    
    if (!isEmpty) {
      savedNote = {
        id: ziskejDraftIdPoznamky() ||
          crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        title,
        note,
        richContent,
        date,
        completed: false,
        reminder: reminderEnabled,
        favorite: favoriteEnabled,
        notificationId: Date.now() % 2147483647,
        area: activeArea,
        pinned: false,
        isSecret: true,
        tags: [...activeTags],
        todos: [...activeTodos],
        repeat: null
      };
      
      await saveTask(savedNote);
      ukonciDraftPoznamky();
    }
  }
  
  if (!savedNote) {
    return null;
  }
  
  if (
    typeof obnovNotifikacePoznamkyPodleSoukromi === "function"
  ) {
    await obnovNotifikacePoznamkyPodleSoukromi(savedNote);
  }
  
  if (typeof cekajNaUlozeniTajnychPoznamek === "function") {
    await cekajNaUlozeniTajnychPoznamek();
  }
  
  const encryptedRecord =
    typeof nactiSifrovaneTajneZaznamy === "function" ?
    nactiSifrovaneTajneZaznamy().find(
      (record) => record.id === savedNote.id
    ) || null :
    null;
  
  return {
    noteId: savedNote.id,
    encryptedRecord
  };
}

function zavriTajnyEditorPriZamknuti() {
  if (!secretTaskEnabled || taskModal?.hidden) {
    return;
  }
  
  /*
   * Auto-lock nesmí nechat plaintext tajné poznámky v DOM.
   * Rozpracovaná tajná poznámka se při zamknutí zavře bez uložení.
   */
  nastavNazevPoznamkyVEditoru("");
  modalText.value = "";
  modalRichText.innerHTML = "";
  editorRepeat = null;
  modalDate.value = "";
  modalTime.value = "";
  
  if (typeof resetTodos === "function") {
    resetTodos();
  }
  
  document.getElementById("plannedTextLinks")?.replaceChildren();
  
  const zamykanyTaskId = activeTaskId;
  uvolniVzdalenouEditorSession(
    zamykanyTaskId
  );

  taskModal.classList.remove("show");
  taskModal.hidden = true;
  document.body.classList.remove("noScroll");
  
  activeTaskIndex = null;
  activeTaskId = null;
  ukonciDraftPoznamky();
  editorSessionId += 1;
  secretTaskEnabled = false;
  
  aktualizujIkonuTajnePoznamky();
  secretTaskButton.classList.remove("active");
  
  if (typeof RichTextColors !== "undefined") {
    RichTextColors.reset();
  }
}


function resetujAkceZpravyAplikace() {
  appMessageSaveButton.hidden = true;
  appMessageDiscardButton.hidden = true;
  appMessageSecretButton.hidden = true;
  appMessageNormalButton.hidden = true;

  closeAppMessageButton.textContent = "OK";
}


function zobrazZpravuAplikace(
  nadpis,
  zprava
) {
  /*
   * Informační zpráva nikdy nesmí zdědit tlačítka
   * z předchozího typu modalu (Uložit/Neukládat nebo
   * Uložit jako tajnou/Uložit normálně).
   */
  resetujAkceZpravyAplikace();

  const prelozDynamickyText =
    window.LubaNoteI18n?.prelozText;

  appMessageTitle.textContent =
    typeof prelozDynamickyText === "function"
      ? prelozDynamickyText(nadpis || "Upozornění")
      : (nadpis || "Upozornění");

  appMessageText.textContent =
    typeof prelozDynamickyText === "function"
      ? prelozDynamickyText(zprava || "")
      : (zprava || "");
  
  appMessageModal.hidden = false;
}


async function ulozNovouPoznamkuProPlanovani() {
  const jeNovaPoznamka =
    activeTaskId === null &&
    activeTaskIndex === null;

  if (!jeNovaPoznamka) {
    return {
      ok: true,
      noteId: activeTaskId || null
    };
  }

  const jeSecretKontext =
    document.body.classList.contains(
      "secretModeActive"
    ) && secretTaskEnabled === true;

  if (!jeSecretKontext) {
    return await ulozAZavriEditor(
      "normal",
      {
        nezavirat: true,
        tichyRezim: true
      }
    );
  }

  if (cekajiciUlozeniNoveProPlanner) {
    return await cekajiciUlozeniNoveProPlanner.promise;
  }

  let vyresit = null;

  const promise = new Promise((resolve) => {
    vyresit = resolve;
  });

  cekajiciUlozeniNoveProPlanner = {
    promise,
    vyresit
  };

  resetujAkceZpravyAplikace();

  appMessageTitle.textContent =
    "Jak uložit poznámku?";

  appMessageText.textContent =
    "Vyber způsob uložení nové poznámky. Po uložení bude plánování pokračovat.";

  appMessageSecretButton.hidden = false;
  appMessageNormalButton.hidden = false;
  appMessageSaveButton.hidden = true;
  appMessageDiscardButton.hidden = true;
  closeAppMessageButton.textContent = "Zrušit";
  appMessageModal.hidden = false;

  return await promise;
}

window.ulozNovouPoznamkuProPlanovani =
  ulozNovouPoznamkuProPlanovani;


closeAppMessageButton?.addEventListener(
  "click",
  () => {
    if (cekajiciUlozeniNoveProPlanner) {
      const cekajici =
        cekajiciUlozeniNoveProPlanner;

      cekajiciUlozeniNoveProPlanner = null;
      cekajici.vyresit?.({
        ok: false,
        reason: "cancelled"
      });
    }

    appMessageModal.hidden = true;
    resetujAkceZpravyAplikace();
  }
);
appMessageSaveButton?.addEventListener(
  "click",
  async () => {
    appMessageModal.hidden = true;
    
    appMessageSaveButton.hidden = true;
    appMessageDiscardButton.hidden = true;
    
    closeAppMessageButton.textContent = "OK";
    
    await ulozAZavriEditor();
  }
);

appMessageDiscardButton?.addEventListener(
  "click",
  async () => {
    appMessageModal.hidden = true;
    
    appMessageSaveButton.hidden = true;
    appMessageDiscardButton.hidden = true;
    
    closeAppMessageButton.textContent = "OK";
    
    taskModal.classList.remove("show");
    document.body.classList.remove("noScroll");

    const zahazovanyTaskId = activeTaskId;
    uvolniVzdalenouEditorSession(
      zahazovanyTaskId
    );
    if (
      aktivniSdilenaEditace?.noteId ===
        zahazovanyTaskId
    ) {
      aktivniSdilenaEditace = null;
      taskModal.classList.remove(
        "sharingEditorMode"
      );
      taskModal.removeAttribute(
        "data-shared-task-id"
      );
    }

    if (!zahazovanyTaskId) {
      await zahodLokalniPrilohyDraftu();
    }
    
    activeTaskIndex = null;
    activeTaskId = null;
    taskModal.removeAttribute("data-task-id");
    ukonciDraftPoznamky();
    editorSessionId += 1;
    
    setTimeout(() => {
      if (!taskModal.classList.contains("show")) {
        taskModal.hidden = true;
      }
    }, 250);
    
    RichTextColors.reset();
  }
);

// ==========================================
// VLASTNÍ VÝBĚR DATA A ČASU – SDÍLENÝ CÍL
// Stejný kalendář a ciferník používá editor,
// plánování i rychlá úprava připomínky.
// ==========================================

let aktivniDatumInput =
  document.getElementById("modalDate");
let aktivniDatumLabel = modalDateLabel;
let poVyberuData = null;

let aktivniCasInput =
  document.getElementById("modalTime");
let aktivniCasLabel = modalTimeLabel;
let poVyberuCasu = null;
let aktivniCasPovolujeOpakovani = false;
let pracovniRepeat = null;

function formatDatumProTlacitko(hodnota) {
  if (!hodnota) {
    return "Datum";
  }
  
  const [rok, mesic, den] = hodnota.split("-");
  
  if (!rok || !mesic || !den) {
    return "Datum";
  }
  
  return `${den}.${mesic}.${rok}`;
}

function aktualizujPopisekAktivnihoData() {
  if (!aktivniDatumLabel) {
    return;
  }
  
  aktivniDatumLabel.textContent =
    formatDatumProTlacitko(aktivniDatumInput?.value);
}

function aktualizujPopisekAktivnihoCasu() {
  if (!aktivniCasLabel) {
    return;
  }
  
  aktivniCasLabel.textContent =
    aktivniCasInput?.value || "Čas";
}

function nastavAktivniDatum(hodnota) {
  if (!aktivniDatumInput) {
    return;
  }
  
  aktivniDatumInput.value = hodnota;
  aktualizujPopisekAktivnihoData();
  
  if (typeof poVyberuData === "function") {
    poVyberuData(hodnota);
  }
}

function nastavAktivniCas(hodnota) {
  if (!aktivniCasInput) {
    return;
  }
  
  aktivniCasInput.value = hodnota;
  aktualizujPopisekAktivnihoCasu();
  
  if (typeof poVyberuCasu === "function") {
    poVyberuCasu(hodnota);
  }
}

function kopirujEditorRepeat(repeat) {
  return window.LubaNoteRecurring
    ?.kopirujRepeat?.(repeat) || null;
}

function denVTydnuZDataEditoru() {
  if (!modalDate?.value) {
    return new Date().getDay();
  }
  
  return new Date(
    `${modalDate.value}T12:00`
  ).getDay();
}

function vytvorRepeatZPredvolby(predvolba) {
  const startDate =
    modalDate?.value ||
    window.LubaNoteRecurring
    ?.datumovyKlic?.(new Date()) ||
    "";
  
  if (predvolba === "none") {
    return null;
  }
  
  if (predvolba === "daily") {
    return {
      enabled: true,
      type: "daily",
      interval: 1,
      days: [],
      startDate,
      endDate: null
    };
  }
  
  if (
    predvolba === "weekly1" ||
    predvolba === "weekly2"
  ) {
    const zachovaneDny =
      pracovniRepeat?.type === "weekly" &&
      Array.isArray(pracovniRepeat.days) &&
      pracovniRepeat.days.length > 0 ? [...pracovniRepeat.days] : [denVTydnuZDataEditoru()];
    
    return {
      enabled: true,
      type: "weekly",
      interval: predvolba === "weekly2" ? 2 : 1,
      days: zachovaneDny,
      startDate,
      endDate: null
    };
  }
  
  if (predvolba === "monthly") {
    const denVMesici = modalDate?.value ?
      Number(modalDate.value.slice(8, 10)) :
      new Date().getDate();
    
    return {
      enabled: true,
      type: "monthly",
      interval: 1,
      days: [],
      dayOfMonth: denVMesici,
      startDate,
      endDate: null
    };
  }
  
  return null;
}

function zjistiAktivniPredvolbuRepeat() {
  if (!pracovniRepeat?.enabled) {
    return "none";
  }
  
  if (pracovniRepeat.type === "daily") {
    return "daily";
  }
  
  if (pracovniRepeat.type === "monthly") {
    return "monthly";
  }
  
  if (pracovniRepeat.type === "weekly") {
    return Number(pracovniRepeat.interval) === 2 ?
      "weekly2" :
      "weekly1";
  }
  
  return "none";
}

function aktualizujRepeatUI() {
  if (!timeRepeatSection) {
    return;
  }
  
  timeRepeatSection.hidden = !aktivniCasPovolujeOpakovani;
  
  if (!aktivniCasPovolujeOpakovani) {
    return;
  }
  
  const aktivniPredvolba =
    zjistiAktivniPredvolbuRepeat();
  
  timeRepeatPresetButtons.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.repeatPreset ===
        aktivniPredvolba
      );
    }
  );
  
  const jeTydenni =
    pracovniRepeat?.type === "weekly";
  
  timeRepeatWeekdays.hidden = !jeTydenni;
  
  timeRepeatDayButtons.forEach(
    (button) => {
      const den = Number(
        button.dataset.repeatDay
      );
      
      button.classList.toggle(
        "active",
        jeTydenni &&
        pracovniRepeat.days?.includes(den)
      );
    }
  );
  
  if (timeRepeatSummary) {
    timeRepeatSummary.textContent =
      window.LubaNoteRecurring
      ?.formatujPravidlo?.(pracovniRepeat) ||
      "Neopakovat";
  }
}

function pripravRepeatProVyberCasu() {
  if (!aktivniCasPovolujeOpakovani) {
    pracovniRepeat = null;
    aktualizujRepeatUI();
    return;
  }
  
  pracovniRepeat =
    kopirujEditorRepeat(editorRepeat);
  
  if (pracovniRepeat?.enabled) {
    pracovniRepeat.startDate =
      modalDate.value ||
      pracovniRepeat.startDate;
  }
  
  aktualizujRepeatUI();
}

function ulozRepeatZVyberuCasu() {
  if (!aktivniCasPovolujeOpakovani) {
    return;
  }
  
  editorRepeat =
    kopirujEditorRepeat(pracovniRepeat);
  
  if (editorRepeat?.enabled) {
    editorRepeat.startDate = modalDate.value;
    
    if (editorRepeat.type === "monthly") {
      editorRepeat.dayOfMonth =
        Number(modalDate.value.slice(8, 10));
    }
    
    reminderEnabled = true;
    updateReminderButton(true);
  }
}

function synchronizujRepeatSDatemEditoru() {
  if (!editorRepeat?.enabled || !modalDate.value) {
    return;
  }
  
  editorRepeat.startDate = modalDate.value;
  
  if (editorRepeat.type === "monthly") {
    editorRepeat.dayOfMonth =
      Number(modalDate.value.slice(8, 10));
  }
}

timeRepeatPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    pracovniRepeat = vytvorRepeatZPredvolby(
      button.dataset.repeatPreset
    );
    
    aktualizujRepeatUI();
  });
});

timeRepeatDayButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (pracovniRepeat?.type !== "weekly") {
      return;
    }
    
    const den = Number(
      button.dataset.repeatDay
    );
    
    const dny = new Set(
      pracovniRepeat.days || []
    );
    
    if (dny.has(den)) {
      if (dny.size > 1) {
        dny.delete(den);
      }
    } else {
      dny.add(den);
    }
    
    pracovniRepeat.days =
      Array.from(dny).sort(
        (a, b) =>
        ((a + 6) % 7) -
        ((b + 6) % 7)
      );
    
    aktualizujRepeatUI();
  });
});

// ==========================================
// VLASTNÍ CIFERNÍK – HODINY A MINUTY
// - vnější kruh = 1–12
// - vnitřní kruh = 00 a 13–23
// - délka hodinové ručičky ukazuje aktivní kruh
// ==========================================

const HODINY_VNEJSI = [
  12, 1, 2, 3, 4, 5,
  6, 7, 8, 9, 10, 11
];

const HODINY_VNITRNI = [
  0, 13, 14, 15, 16, 17,
  18, 19, 20, 21, 22, 23
];

let hodinovyCifernikAktivni = false;
let minutovyCifernikAktivni = false;

function smazCislaCiferniku() {
  timePickerClock
    .querySelectorAll(".timePickerClockNumber")
    .forEach((prvek) => prvek.remove());
}

function jeVnitrniHodina(hodina) {
  return hodina === 0 || hodina >= 13;
}

function ziskejIndexHodiny(hodina) {
  return hodina % 12;
}

function nastavAktivniHodinovyKruh(vnitrniKruh) {
  timePickerClock.classList.add("hourMode");
  timePickerClock.classList.remove("minuteMode");
  
  timePickerClock.classList.toggle(
    "hourRingInner",
    vnitrniKruh
  );
  
  timePickerClock.classList.toggle(
    "hourRingOuter",
    !vnitrniKruh
  );
}

function zvyrazniVybranouHodinu(hodina) {
  timePickerClock
    .querySelectorAll(".timePickerClockNumber[data-hour]")
    .forEach((tlacitko) => {
      tlacitko.classList.toggle(
        "selected",
        Number(tlacitko.dataset.hour) === hodina
      );
    });
}

function nastavVybranouHodinu(hodina, vnitrniKruh) {
  const index = ziskejIndexHodiny(hodina);
  
  timePickerSelectedHour.textContent =
    String(hodina).padStart(2, "0");
  
  nastavAktivniHodinovyKruh(vnitrniKruh);
  
  /*
   * Vnější kruh potřebuje delší ručičku,
   * vnitřní kratší. Uživatel tak hned vidí,
   * kterou 12hodinovou vrstvu právě vybírá.
   */
  timePickerHourHand.style.height =
    vnitrniKruh ? "25%" : "40%";
  
  timePickerHourHand.style.transform =
    `translate(-50%, -100%) rotate(${index * 30}deg)`;
  
  zvyrazniVybranouHodinu(hodina);
}

function prepniCifernikNaMinuty() {
  hodinovyCifernikAktivni = false;
  
  timePickerSelectedHour.classList.remove("active");
  timePickerSelectedMinute.classList.add("active");
  
  timePickerHourHand.hidden = true;
  timePickerHand.hidden = false;
  
  vykresliMinutyCiferniku();
}

function vykresliHodinyCiferniku() {
  smazCislaCiferniku();
  
  timePickerSelectedHour.classList.add("active");
  timePickerSelectedMinute.classList.remove("active");
  
  timePickerHourHand.hidden = false;
  timePickerHand.hidden = true;
  
  const vybranaHodina =
    Number(timePickerSelectedHour.textContent) || 0;
  
  function vytvorHodinu(
    hodina,
    index,
    polomer,
    vnitrniKruh
  ) {
    const tlacitko =
      document.createElement("button");
    
    tlacitko.type = "button";
    tlacitko.className =
      `timePickerClockNumber ${vnitrniKruh ? "hourInner" : "hourOuter"}`;
    
    tlacitko.dataset.hour = String(hodina);
    tlacitko.textContent =
      String(hodina).padStart(2, "0");
    
    const uhel =
      (index * 30 - 90) * Math.PI / 180;
    
    const x =
      50 + Math.cos(uhel) * polomer;
    
    const y =
      50 + Math.sin(uhel) * polomer;
    
    tlacitko.style.left = `${x}%`;
    tlacitko.style.top = `${y}%`;
    
    /*
     * Pointer (prst/myš) řeší rodičovský ciferník.
     * Click zde zůstává hlavně pro klávesnici.
     */
    tlacitko.addEventListener("click", (event) => {
      if (event.detail !== 0) {
        return;
      }
      
      nastavVybranouHodinu(
        hodina,
        vnitrniKruh
      );
      
      prepniCifernikNaMinuty();
    });
    
    timePickerClock.append(tlacitko);
  }
  
  HODINY_VNEJSI.forEach(
    (hodina, index) => {
      vytvorHodinu(
        hodina,
        index,
        40,
        false
      );
    }
  );
  
  HODINY_VNITRNI.forEach(
    (hodina, index) => {
      vytvorHodinu(
        hodina,
        index,
        25,
        true
      );
    }
  );
  
  nastavVybranouHodinu(
    vybranaHodina,
    jeVnitrniHodina(vybranaHodina)
  );
}

function zvyrazniVybranouMinutu(minuta) {
  timePickerClock
    .querySelectorAll(".timePickerClockNumber[data-minute]")
    .forEach((tlacitko) => {
      tlacitko.classList.toggle(
        "selected",
        Number(tlacitko.dataset.minute) === minuta
      );
    });
}

function nastavVybranouMinutu(minuta) {
  timePickerSelectedMinute.textContent =
    String(minuta).padStart(2, "0");
  
  timePickerHand.style.transform =
    `translate(-50%, -100%) rotate(${minuta * 6}deg)`;
  
  zvyrazniVybranouMinutu(minuta);
}

function vykresliMinutyCiferniku() {
  smazCislaCiferniku();
  
  timePickerClock.classList.remove(
    "hourMode",
    "hourRingInner",
    "hourRingOuter"
  );
  timePickerClock.classList.add("minuteMode");
  
  timePickerSelectedHour.classList.remove("active");
  timePickerSelectedMinute.classList.add("active");
  
  timePickerHourHand.hidden = true;
  timePickerHand.hidden = false;
  
  const vybranaMinuta =
    Number(timePickerSelectedMinute.textContent) || 0;
  
  for (let minuta = 0; minuta < 60; minuta += 5) {
    const tlacitko =
      document.createElement("button");
    
    tlacitko.type = "button";
    tlacitko.className = "timePickerClockNumber";
    tlacitko.dataset.minute = String(minuta);
    
    tlacitko.textContent =
      String(minuta).padStart(2, "0");
    
    const index = minuta / 5;
    
    const uhel =
      (index * 30 - 90) * Math.PI / 180;
    
    const x =
      50 + Math.cos(uhel) * 40;
    
    const y =
      50 + Math.sin(uhel) * 40;
    
    tlacitko.style.left = `${x}%`;
    tlacitko.style.top = `${y}%`;
    
    tlacitko.addEventListener("click", (event) => {
      if (event.detail !== 0) {
        return;
      }
      
      nastavVybranouMinutu(minuta);
    });
    
    timePickerClock.append(tlacitko);
  }
  
  nastavVybranouMinutu(vybranaMinuta);
}

// ==========================================
// VLASTNÍ CIFERNÍK – TAŽENÍ PRSTEM / MYŠÍ
// ==========================================

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
  
  nastavVybranouMinutu(minuta);
}

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
  
  /*
   * Hranice je mezi vnitřními a vnějšími čísly.
   * Při přetažení přes hranici se okamžitě změní
   * barva kruhu i délka hodinové ručičky.
   */
  const vnitrniKruh =
    vzdalenost < polomer * 0.67;
  
  const index =
    Math.round(uhel / 30) % 12;
  
  const hodina = vnitrniKruh ?
    HODINY_VNITRNI[index] :
    HODINY_VNEJSI[index];
  
  nastavVybranouHodinu(
    hodina,
    vnitrniKruh
  );
}

timePickerClock.addEventListener(
  "pointerdown",
  (event) => {
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
      prepniCifernikNaMinuty();
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

// ==========================================
// VLASTNÍ CIFERNÍK – OTEVŘENÍ A ULOŽENÍ
// ==========================================

function pripravVyberCasu() {
  const ted = new Date();
  
  const vychoziCas =
    aktivniCasInput?.value ||
    `${String(ted.getHours()).padStart(2, "0")}:${String(ted.getMinutes()).padStart(2, "0")}`;
  
  const [hodinaText, minutaText] =
  vychoziCas.split(":");
  
  timePickerSelectedHour.textContent =
    String(Number(hodinaText) || 0).padStart(2, "0");
  
  timePickerSelectedMinute.textContent =
    String(Number(minutaText) || 0).padStart(2, "0");
  
  pripravRepeatProVyberCasu();
  vykresliHodinyCiferniku();
}

function ulozVybranyCasDoEditoru() {
  const hodina =
    timePickerSelectedHour.textContent.padStart(2, "0");
  
  const minuta =
    timePickerSelectedMinute.textContent.padStart(2, "0");
  
  nastavAktivniCas(
    `${hodina}:${minuta}`
  );
}

timePickerSelectedHour?.addEventListener(
  "click",
  () => {
    vykresliHodinyCiferniku();
  }
);

timePickerSelectedMinute?.addEventListener(
  "click",
  () => {
    vykresliMinutyCiferniku();
  }
);

timePickerSaveButton?.addEventListener(
  "click",
  () => {
    ulozRepeatZVyberuCasu();
    ulozVybranyCasDoEditoru();
    timePickerModal.hidden = true;
  }
);

timePickerNowButton?.addEventListener(
  "click",
  () => {
    const ted = new Date();
    
    timePickerSelectedHour.textContent =
      String(ted.getHours()).padStart(2, "0");
    
    timePickerSelectedMinute.textContent =
      String(ted.getMinutes()).padStart(2, "0");
    
    ulozRepeatZVyberuCasu();
    ulozVybranyCasDoEditoru();
    timePickerModal.hidden = true;
  }
);

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
  
  const locale =
    window.LubaNoteI18n?.ziskejLocale?.() ||
    "cs-CZ";

  datePickerMonthTitle.textContent =
    prvniDenMesice.toLocaleDateString(
      locale,
      { month: "long", year: "numeric" }
    );
  
  /*
   * JavaScript počítá neděli jako 0.
   * My máme kalendář od pondělí,
   * proto hodnotu převedeme na 0–6.
   */
  const pocatecniPozice =
    (prvniDenMesice.getDay() + 6) % 7;
  
  for (
    let pozice = 0; pozice < pocatecniPozice; pozice++
  ) {
    const prazdneMisto =
      document.createElement("span");
    
    datePickerGrid.append(
      prazdneMisto
    );
  }
  
  const dnes = new Date();
  
  for (
    let den = 1; den <= pocetDniVMesici; den++
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
      
      nastavAktivniDatum(
        `${datePickerYear}-${mesic}-${denText}`
      );
      
      datePickerModal.hidden = true;
    });
    
    
    
    if (
      den === dnes.getDate() &&
      datePickerMonth === dnes.getMonth() &&
      datePickerYear === dnes.getFullYear()
    ) {
      tlacitkoDne.classList.add("today");
    }
    
    if (aktivniDatumInput?.value) {
      const [vybranyRok, vybranyMesic, vybranyDen] =
      aktivniDatumInput.value.split("-").map(Number);
      
      if (
        den === vybranyDen &&
        datePickerMonth === vybranyMesic - 1 &&
        datePickerYear === vybranyRok
      ) {
        tlacitkoDne.classList.add("selected");
      }
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
  
  nastavAktivniDatum(
    `${dnes.getFullYear()}-${mesic}-${den}`
  );
  
  datePickerModal.hidden = true;
});


// ==========================================
// VLASTNÍ VÝBĚR DATA A ČASU – VEŘEJNÉ OTEVŘENÍ
// Ostatní moduly předají svůj skrytý input,
// popisek tlačítka a případnou reakci po výběru.
// ==========================================

function otevriVlastniVyberData({
  input,
  label = null,
  poVyberu = null
} = {}) {
  if (!input) {
    return;
  }
  
  aktivniDatumInput = input;
  aktivniDatumLabel = label;
  poVyberuData = poVyberu;
  
  if (input.value) {
    const [rok, mesic] =
    input.value.split("-").map(Number);
    
    datePickerYear = rok;
    datePickerMonth = mesic - 1;
  } else {
    const dnes = new Date();
    datePickerYear = dnes.getFullYear();
    datePickerMonth = dnes.getMonth();
  }
  
  aktualizujPopisekAktivnihoData();
  vykresliVyberData();
  datePickerModal.hidden = false;
}

function otevriVlastniVyberCasu({
  input,
  label = null,
  poVyberu = null,
  povolOpakovani = false
} = {}) {
  if (!input) {
    return;
  }
  
  aktivniCasInput = input;
  aktivniCasLabel = label;
  poVyberuCasu = poVyberu;
  aktivniCasPovolujeOpakovani =
    povolOpakovani === true &&
    secretTaskEnabled !== true;
  
  aktualizujPopisekAktivnihoCasu();
  pripravVyberCasu();
  timePickerModal.hidden = false;
}

window.otevriVlastniVyberData =
  otevriVlastniVyberData;

window.otevriVlastniVyberCasu =
  otevriVlastniVyberCasu;

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
  otevriVlastniVyberData({
    input: modalDate,
    label: modalDateLabel,
    poVyberu: () => {
      updateModalWeekday();
      synchronizujRepeatSDatemEditoru();
      aktualizujPopiskyDataCasu();
      zapniPripominkuPoZmeneTerminu();
    }
  });
});

closeDatePickerButton?.addEventListener("click", () => {
  datePickerModal.hidden = true;
});

modalTimeButton?.addEventListener("click", () => {
  otevriVlastniVyberCasu({
    input: modalTime,
    label: modalTimeLabel,
    povolOpakovani: true,
    poVyberu: () => {
      aktualizujPopiskyDataCasu();
      zapniPripominkuPoZmeneTerminu();
    }
  });
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

function ziskejNazevPoznamkyZEditoru() {
  return String(
    modalTitle?.textContent ?? ""
  ).replace(/[\r\n]+/g, " ");
}

function aktualizujStavPrazdnehoNazvu() {
  if (!modalTitle) {
    return;
  }
  
  modalTitle.dataset.prazdny =
    ziskejNazevPoznamkyZEditoru().length === 0 ?
    "true" :
    "false";
}

function nastavNazevPoznamkyVEditoru(hodnota) {
  if (!modalTitle) {
    return;
  }
  
  modalTitle.textContent = String(hodnota ?? "")
    .replace(/[\r\n]+/g, " ");
  
  aktualizujStavPrazdnehoNazvu();
}

function vlozTextDoNazvuNaPoziciKurzoru(
  rozsah,
  text
) {
  const textovyUzel =
    document.createTextNode(text);
  
  rozsah.deleteContents();
  rozsah.insertNode(textovyUzel);
  rozsah.setStartAfter(textovyUzel);
  rozsah.collapse(true);
  
  const vyber = window.getSelection();
  vyber?.removeAllRanges();
  vyber?.addRange(rozsah);
}

modalTitle?.addEventListener("input", () => {
  aktualizujStavPrazdnehoNazvu();
});

modalTitle?.addEventListener("keydown", (event) => {
  if (
    event.key !== "Enter" ||
    event.isComposing
  ) {
    return;
  }
  
  event.preventDefault();
  modalRichText?.focus();
});

modalTitle?.addEventListener("beforeinput", (event) => {
  if (
    event.isComposing ||
    event.inputType !== "insertParagraph" &&
    event.inputType !== "insertLineBreak"
  ) {
    return;
  }
  
  event.preventDefault();
  modalRichText?.focus();
});

modalTitle?.addEventListener("paste", (event) => {
  const vlozenyText =
    event.clipboardData
    ?.getData("text/plain")
    ?.replace(/[\r\n]+/g, " ");
  
  if (vlozenyText === undefined) {
    return;
  }
  
  event.preventDefault();
  
  const vyber = window.getSelection();
  const rozsah =
    vyber?.rangeCount ?
    vyber.getRangeAt(0) :
    null;
  
  if (
    rozsah &&
    modalTitle.contains(
      rozsah.commonAncestorContainer
    )
  ) {
    vlozTextDoNazvuNaPoziciKurzoru(
      rozsah,
      vlozenyText
    );
  } else {
    nastavNazevPoznamkyVEditoru(
      ziskejNazevPoznamkyZEditoru() +
      vlozenyText
    );
  }
  
  modalTitle.dispatchEvent(
    new Event("input", { bubbles: true })
  );
});

/* Barevné označování je oddělené v richTextColors.js. */

/*
 * NÁZEV EDITORU – stabilní sbalení bez "třepání"
 *
 * Původně se název řídil jen scrollTop. Když se začal animovaně
 * zmenšovat, změnila se výška editoru a WebView samo posunulo scrollTop
 * zpět. Tím mohlo během jedné animace opakovaně vznikat
 * sbalit -> rozbalit -> sbalit...
 *
 * Nově se po sbalení název smí znovu ukázat jen tehdy, když uživatel
 * prokazatelně roluje směrem k začátku poznámky. Layoutový posun vyvolaný
 * samotným schováním názvu tedy stav neotočí zpět.
 */
let posledniPohybKZacatkuEditoru = 0;
let posledniPointerYEditoru = null;
let chranNazevPredAutomatickymSbalenimDo = 0;

const CAS_ZAMERU_ROLOVAT_K_ZACATKU = 700;

function zachovejViditelnyNazevEditoru(trvaniMs = 900) {
  const delkaOchrany = Math.max(
    0,
    Number(trvaniMs) || 0
  );

  chranNazevPredAutomatickymSbalenimDo = Math.max(
    chranNazevPredAutomatickymSbalenimDo,
    performance.now() + delkaOchrany
  );

  document
    .getElementById("taskModal")
    ?.classList.remove("titleCollapsed");
}

window.LubaNoteEditorUI = {
  ...(window.LubaNoteEditorUI || {}),
  zachovejViditelnyNazev:
    zachovejViditelnyNazevEditoru
};

function oznacRolovaniKZacatkuEditoru() {
  posledniPohybKZacatkuEditoru = performance.now();
}

modalRichText.addEventListener(
  "pointerdown",
  (event) => {
    posledniPointerYEditoru = event.clientY;
  }, { passive: true }
);

modalRichText.addEventListener(
  "pointermove",
  (event) => {
    if (posledniPointerYEditoru === null) {
      return;
    }
    
    const rozdilY =
      event.clientY - posledniPointerYEditoru;
    
    /* Prst jde dolů -> obsah se vrací směrem k začátku. */
    if (rozdilY > 4) {
      oznacRolovaniKZacatkuEditoru();

      /*
       * Android WebView nemusí na úplném začátku vyvolat další scroll
       * událost – scrollTop už totiž nemá kam klesnout. Starší logika
       * proto někdy nechala nadpis sbalený navždy, i když uživatel na
       * horním okraji dál táhl obsah dolů. Při jasném gestu směrem k
       * začátku ho na horním okraji rozbalíme rovnou.
       */
      if (
        modalRichText.scrollTop < 8 &&
        taskModal.classList.contains(
          "titleCollapsed"
        )
      ) {
        taskModal.classList.remove(
          "titleCollapsed"
        );
      }
    }
    
    if (Math.abs(rozdilY) > 2) {
      posledniPointerYEditoru = event.clientY;
    }
  }, { passive: true }
);

["pointerup", "pointercancel"].forEach(
  (nazevUdalosti) => {
    modalRichText.addEventListener(
      nazevUdalosti,
      () => {
        posledniPointerYEditoru = null;
      }, { passive: true }
    );
  }
);

modalRichText.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaY < 0) {
      oznacRolovaniKZacatkuEditoru();
    }
  }, { passive: true }
);

modalRichText.addEventListener("keydown", (event) => {
  if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
    oznacRolovaniKZacatkuEditoru();
  }
});

modalRichText.addEventListener("scroll", () => {
  const scrollTop = modalRichText.scrollTop;
  const jeNazevSbaleny =
    taskModal.classList.contains("titleCollapsed");
  
  if (!jeNazevSbaleny && scrollTop > 28) {
    const jeNazevDocasneChraneny =
      performance.now() <
      chranNazevPredAutomatickymSbalenimDo;

    if (jeNazevDocasneChraneny) {
      return;
    }

    taskModal.classList.add("titleCollapsed");
    return;
  }
  
  if (!jeNazevSbaleny || scrollTop >= 8) {
    return;
  }
  
  const uzivatelRolujeKZacatku =
    performance.now() - posledniPohybKZacatkuEditoru <
    CAS_ZAMERU_ROLOVAT_K_ZACATKU;
  
  if (uzivatelRolujeKZacatku) {
    taskModal.classList.remove("titleCollapsed");
  }
});

function resetujSbaleniNazvuEditoru() {
  taskModal.classList.remove("titleCollapsed");
  posledniPohybKZacatkuEditoru = 0;
  posledniPointerYEditoru = null;
  chranNazevPredAutomatickymSbalenimDo = 0;
  
  requestAnimationFrame(() => {
    modalRichText.scrollTop = 0;
  });
}

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

// ==========================================
// EDITOR – POPISKY VLASTNÍHO DATA A ČASU
// Skryté inputy drží hodnoty pro ukládání,
// tlačítka ukazují jejich kompaktní podobu.
// ==========================================

function aktualizujPopiskyDataCasu() {
  if (modalDate.value) {
    const [rok, mesic, den] =
    modalDate.value.split("-");
    
    modalDateLabel.textContent =
      `${den}.${mesic}.${rok}`;
  } else {
    modalDateLabel.textContent = "Datum";
  }
  
  modalTimeLabel.textContent =
    modalTime.value || "Čas";

  if (editorRepeat?.enabled === true) {
    const repeatIcon =
      window.LubaNoteIcons?.vytvorHostitele?.(
        "opakovat",
        ["editorTimeRepeatIcon"]
      );

    if (repeatIcon) {
      modalTimeLabel.append(
        document.createTextNode(" "),
        repeatIcon
      );
    }
  }
}
modalDate.addEventListener("change", () => {
  synchronizujRepeatSDatemEditoru();
  aktualizujPopiskyDataCasu();
  updateModalWeekday();
  zapniPripominkuPoZmeneTerminu();
});

modalTime.addEventListener("change", () => {
  aktualizujPopiskyDataCasu();
  zapniPripominkuPoZmeneTerminu();
});


const taskModal = document.getElementById("taskModal");
const addTaskButton = document.getElementById("addTaskButton");


addTaskButton.addEventListener("click", () => {
  zahajEditorSession(null);
  taskModal.removeAttribute("data-task-id");
  ukonciDraftPoznamky();
  zahajDraftNovePoznamky();
  activeTaskIndex = null;
  /*
 * Pokud je Secret režim odemčený,
 * nový editor se rovnou připraví jako Secret.
 * Uživatel tak okamžitě vidí i tajné štítky.
 */
secretTaskEnabled =
  tajnyRezimOdemceny === true;

favoriteEnabled = false;

priorityTaskButton?.classList.remove(
  "active"
);

aktualizujIkonuTajnePoznamky();

secretTaskButton.classList.toggle(
  "active",
  secretTaskEnabled
);
  aktualizujIkonuTajnePoznamky();
  secretTaskButton.classList.remove("active");
  resetTodos();
  activeArea = "private";
  activeTags = [];
  updateTagMenuUI();
  closeTagMenu();
  
  nastavNazevPoznamkyVEditoru("");
  modalText.value = "";
  modalRichText.innerHTML = "";
  editorRepeat = null;
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
  
  aktualizujPopiskyDataCasu();
  updateModalWeekday();
  
  reminderEnabled = false;
  updateReminderButton(false);
  puvodniOtiskEditoru =
    vytvorOtiskEditoru();
  
  
  
  resetujSbaleniNazvuEditoru();
  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");
  
  modalTitle.focus();
});






let probihaUlozeniEditoru = false;

function spustUlohuNaPozadi(akce, popis = "Úloha na pozadí") {
  setTimeout(() => {
    Promise.resolve()
      .then(() => {
        if (typeof akce === "function") {
          return akce();
        }
        return null;
      })
      .catch((error) => {
        console.warn(`${popis} selhala:`, error);
      });
  }, 0);
}

async function ulozPoznamkuLokalneASynchronizuj(
  akce,
  poznamkaProFallback = null
) {
  if (
    window.LubaNoteSync
    ?.provedLokalniZmenuASynchronizuj
  ) {
    return await window.LubaNoteSync
      .provedLokalniZmenuASynchronizuj(akce);
  }
  
  const vysledek = await akce();
  
  if (
    navigator.onLine &&
    poznamkaProFallback &&
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    spustUlohuNaPozadi(
      () => uploadLocalNoteToSupabase(poznamkaProFallback),
      "Synchronizace poznámky"
    );
  }
  
  return vysledek;
}

function obnovNotifikaciPoznamkyNaPozadi(poznamka) {
  if (!poznamka) {
    return;
  }
  
  spustUlohuNaPozadi(
    async () => {
        if (
          typeof obnovNotifikacePoznamkyPodleSoukromi === "function"
        ) {
          await obnovNotifikacePoznamkyPodleSoukromi(
            poznamka
          );
          return;
        }
        
        if (
          poznamka.isSecret !== true &&
          poznamka.reminder &&
          poznamka.date
        ) {
          await scheduleNotification(
            poznamka.notificationId,
            poznamka.title,
            poznamka.date,
            poznamka.note,
            {
              lubanoteType: "note",
              taskId: poznamka.id
            }
          );
          return;
        }
        
        if (poznamka.notificationId) {
          await cancelNotification(
            poznamka.notificationId
          );
        }
      },
      "Aktualizace notifikace"
  );
}

function zavriEditorPoLokalnimUlozeni(
  closingSessionId
) {
  if (closingSessionId !== editorSessionId) {
    return false;
  }
  
  taskModal.classList.remove("show");
  document.body.classList.remove("noScroll");

  const zaviranyTaskId = activeTaskId;
  uvolniVzdalenouEditorSession(
    zaviranyTaskId
  );
  uvolniSdilenyLockPriZavreni(
    zaviranyTaskId
  );

  if (
    aktivniSdilenaEditace?.noteId ===
      zaviranyTaskId
  ) {
    aktivniSdilenaEditace = null;
    taskModal.classList.remove(
      "sharingEditorMode"
    );
    taskModal.removeAttribute(
      "data-shared-task-id"
    );
  }

  activeTaskIndex = null;
  activeTaskId = null;
  taskModal.removeAttribute("data-task-id");
  ukonciDraftPoznamky();
  editorSessionId += 1;
  
  setTimeout(() => {
    if (!taskModal.classList.contains("show")) {
      taskModal.hidden = true;
    }
  }, 250);
  
  RichTextColors.reset();
  
  /*
   * Nejdřív dovolíme prohlížeči vykreslit zavřený editor.
   * Překreslení seznamů proběhne až v dalším snímku.
   */
  requestAnimationFrame(() => {
    renderTasks();

    if (
      typeof renderRemindersScreen === "function"
    ) {
      renderRemindersScreen();
    }

    /* Úkol vytvořený přímo z Planneru se po uložení
       musí okamžitě objevit i v kalendáři / detailu dne. */
    if (typeof renderCalendar === "function") {
      renderCalendar();
    }

    if (
      typeof dayDetailScreen !== "undefined" &&
      !dayDetailScreen.hidden &&
      typeof dayDetailItems !== "undefined" &&
      typeof renderCalendarItems === "function"
    ) {
      renderCalendarItems(dayDetailItems);
    }
  });

  return true;
}

async function ulozAZavriEditor(
  zpusobUlozeniNove = null,
  moznosti = {}
) {
  const cekejNaCloud =
    moznosti?.cekejNaCloud === true;
  const nezavirat =
    moznosti?.nezavirat === true;
  const tichyRezim =
    moznosti?.tichyRezim === true;

  if (aktivniSdilenaEditace) {
    if (
      typeof window.LubaNoteSharedEditor
        ?.ulozAZavriSdilenyEditor !==
      "function"
    ) {
      zobrazZpravuAplikace(
        "Sdílená editace",
        "Modul sdíleného editoru není dostupný. Editor zůstal otevřený."
      );

      return {
        ok: false,
        reason: "shared_editor_module_missing"
      };
    }

    return await window.LubaNoteSharedEditor
      .ulozAZavriSdilenyEditor({
        nezavirat,
        tichyRezim
      });
  }

  if (
    document.body.classList.contains(
      "secretModeActive"
    ) &&
    activeTaskId === null &&
    activeTaskIndex === null &&
    zpusobUlozeniNove === null
  ) {
    resetujAkceZpravyAplikace();

    appMessageTitle.textContent =
      "Jak uložit poznámku?";
    
    appMessageText.textContent =
      "Vyber způsob uložení nové poznámky.";
    
    appMessageSecretButton.hidden = false;
    appMessageNormalButton.hidden = false;
    
    appMessageSaveButton.hidden = true;
    appMessageDiscardButton.hidden = true;
    
    closeAppMessageButton.textContent =
      "Zrušit";
    
    appMessageModal.hidden = false;
    
    return { ok: false, reason: "needs_save_mode" };
  }
  
  if (probihaUlozeniEditoru) {
    return { ok: false, reason: "save_in_progress" };
  }
  
  probihaUlozeniEditoru = true;
  
  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ukládám poznámku…",
      300
    ) || (() => {});
  
  try {
    if (zpusobUlozeniNove === "secret") {
      secretTaskEnabled = true;
    }
    
    if (zpusobUlozeniNove === "normal") {
      secretTaskEnabled = false;
    }
    
    const closingSessionId = editorSessionId;
    const closingTaskId = activeTaskId;
    
    const title = ziskejNazevPoznamkyZEditoru().trim();
    const note = modalRichText.innerText;
    const richContent = modalRichText.innerHTML;
    const date =
      modalDate.value && modalTime.value ?
      `${modalDate.value}T${modalTime.value}` :
      "";
    
    /*
     * Poslední bezpečnostní pojistka:
     * veřejná poznámka nesmí nikdy uložit
     * tajný štítek.
     */
    const stitkyProUlozeni =
      secretTaskEnabled ?
      [...activeTags] :
      activeTags.filter(
        (nazevStitku) =>
        !jeTajnyStitek(nazevStitku)
      );
    
    const tasks = loadTask();
    
    
    
    let aktivni = null;
    let ulozenaPoznamka = null;
    
    if (closingTaskId) {
      const index = tasks.findIndex(
        (task) => task?.id === closingTaskId
      );
      
      if (index === -1) {
        throw new Error(
          `Původní poznámka nebyla nalezena: ${closingTaskId}`
        );
      }
      
      aktivni = {
        index,
        task: tasks[index]
      };
    } else if (activeTaskIndex !== null) {
      const currentTask = tasks[activeTaskIndex];
      
      if (currentTask) {
        aktivni = {
          index: activeTaskIndex,
          task: currentTask
        };
      }
    }
    
    if (aktivni) {
      const currentTask = aktivni.task;
      
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
        isSecret: secretTaskEnabled,
        tags: [...stitkyProUlozeni],
        todos: [...activeTodos],
        repeat: secretTaskEnabled ?
          null :
          kopirujEditorRepeat(editorRepeat)
      };
      
      if (
        window.LubaNotePlanner
        ?.synchronizujPlanovaneTodoSPoznamkou
      ) {
        await window.LubaNotePlanner
          .synchronizujPlanovaneTodoSPoznamkou(
            updatedTask
          );
      }
      
      await ulozPoznamkuLokalneASynchronizuj(
        () => updateTask(
          aktivni.index,
          updatedTask
        ),
        updatedTask
      );
      
      ulozenaPoznamka = updatedTask;
    } else {
      const maVlozenyMediaObsah =
        window.LubaNoteEditorMedia
        ?.maVlozenyObsah?.() === true;
      
      const isEmpty =
        title === "" &&
        note.trim() === "" &&
        activeTodos.length === 0 &&
        !maVlozenyMediaObsah;
      
      if (!isEmpty) {
        const kontrolaLimitu =
          window.LubaNoteSupabase
            ?.zkontrolujLimitNovePoznamky?.();

        if (kontrolaLimitu?.dosazen === true) {
          window.dispatchEvent(
            new CustomEvent(
              "lubanote:note-limit-reached",
              {
                detail: {
                  source: "editor-precheck",
                  noteLimit: kontrolaLimitu.noteLimit,
                  currentCount: kontrolaLimitu.currentCount
                }
              }
            )
          );

          return {
            ok: false,
            reason: "note_limit_reached"
          };
        }

        const newTask = {
          id: ziskejDraftIdPoznamky() ||
            crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
          title,
          note,
          richContent,
          date,
          completed: false,
          reminder: reminderEnabled,
          favorite: favoriteEnabled,
          notificationId: Date.now() % 2147483647,
          area: activeArea,
          pinned: false,
          isSecret: secretTaskEnabled,
          tags: [...stitkyProUlozeni],
          todos: [...activeTodos],
          repeat: secretTaskEnabled ?
            null :
            kopirujEditorRepeat(editorRepeat)
        };
        
        await ulozPoznamkuLokalneASynchronizuj(
          () => saveTask(newTask),
          newTask
        );

        /*
         * Nová poznámka už bezpečně existuje v běžném úložišti.
         * Recovery draft můžeme odstranit až PO úspěšném save.
         */
        await smazPersistovanyDraftPoznamky(newTask.id);
        ukonciDraftPoznamky();
        ulozenaPoznamka = newTask;
      }
    }
    
    if (
      cekejNaCloud &&
      ulozenaPoznamka
    ) {
      const synchronizovano =
        await window.LubaNoteSync
          ?.synchronizujPoznamkyTed?.(
            ulozenaPoznamka.id
          );

      if (synchronizovano !== true) {
        throw new Error(
          "Cloud nepotvrdil bezpečnou synchronizaci poznámky."
        );
      }
    }

    ukonciCekani();

    if (nezavirat) {
      /*
       * Při předání editoru musí původní zařízení nejdřív
       * bezpečně uložit a potvrdit cloudovou revizi. Editor
       * zavře až synchronizační vrstva po atomickém předání
       * vlastnictví novému zařízení.
       */
      puvodniOtiskEditoru =
        vytvorOtiskEditoru();

      if (ulozenaPoznamka) {
        obnovNotifikaciPoznamkyNaPozadi(
          ulozenaPoznamka
        );
      }

      return {
        ok: true,
        noteId: ulozenaPoznamka?.id ||
          closingTaskId || null
      };
    }
    
    const editorZavren =
      zavriEditorPoLokalnimUlozeni(
        closingSessionId
      );
    
    if (editorZavren && ulozenaPoznamka) {
      obnovNotifikaciPoznamkyNaPozadi(
        ulozenaPoznamka
      );
    }

    return {
      ok: editorZavren === true,
      noteId: ulozenaPoznamka?.id ||
        closingTaskId || null
    };
  } catch (error) {
    ukonciCekani();
    
    console.error(
      "Uložení poznámky selhalo:",
      error
    );
    
    if (!tichyRezim) {
      zobrazZpravuAplikace(
        "Uložení poznámky",
        "Poznámku se nepodařilo bezpečně uložit. Editor zůstal otevřený."
      );
    }

    return {
      ok: false,
      error
    };
  } finally {
    probihaUlozeniEditoru = false;
  }

}

/* ==========================================
   BEZPEČNÉ PŘEDÁNÍ OTEVŘENÉ POZNÁMKY
   Synchronizační vrstva volá tyto dvě funkce pouze tehdy,
   když jiné zařízení požádá o převzetí stejné poznámky.
   ========================================== */

async function ulozAktivniEditorProPredani(
  noteId
) {
  if (
    !noteId ||
    taskModal.hidden ||
    activeTaskId !== noteId
  ) {
    return false;
  }

  /*
   * Modal předání zakryje editor, ale hardwarová klávesnice by
   * mohla dál posílat znaky do právě fokusovaného rich-textu.
   * Před vytvořením finálního snapshotu proto fokus ukončíme.
   */
  if (
    document.activeElement &&
    typeof document.activeElement.blur ===
      "function"
  ) {
    document.activeElement.blur();
  }

  const vysledek =
    await ulozAZavriEditor(
      null,
      {
        cekejNaCloud: true,
        nezavirat: true,
        tichyRezim: true
      }
    );

  return vysledek?.ok === true;
}

function zavriAktivniEditorPoPredani(
  noteId
) {
  if (
    !noteId ||
    taskModal.hidden ||
    activeTaskId !== noteId
  ) {
    return false;
  }

  /*
   * Předání může přijít i ve chvíli, kdy je nad editorem otevřený
   * pomocný dialog. Po bezpečném uložení nesmí takový starý dialog
   * zůstat viset nad hlavní obrazovkou.
   */
  if (appMessageModal) {
    appMessageModal.hidden = true;
    resetujAkceZpravyAplikace();
  }

  if (datePickerModal) {
    datePickerModal.hidden = true;
  }

  if (timePickerModal) {
    timePickerModal.hidden = true;
  }

  if (deleteConfirmModal) {
    deleteConfirmModal.hidden = true;
  }

  closeTagMenu?.();

  return zavriEditorPoLokalnimUlozeni(
    editorSessionId
  );
}

window.LubaNoteEditorPredani = {
  ulozAktivniEditorProPredani,
  zavriAktivniEditorPoPredani
};

window.addEventListener(
  "lubanote:editor-ownership-lost",
  () => {
    if (
      taskModal.hidden ||
      !activeTaskId
    ) {
      return;
    }

    /*
     * Pokud server potvrdí, že toto zařízení už není vlastníkem
     * editoru, starý editor nesmí později uložit svou kopii přes
     * novější stav. V běžném předání se sem nedostaneme, protože
     * původní zařízení nejdřív bezpečně uloží a teprve potom předá.
     */
    zavriEditorPoLokalnimUlozeni(
      editorSessionId
    );

    zobrazZpravuAplikace(
      "Editace byla ukončena",
      "Tuto poznámku nyní upravuje jiné zařízení. Starý editor byl z bezpečnostních důvodů zavřen."
    );
  }
);

editorBackButton.addEventListener(
  "click",
  async () => {
    /*
     * Fajfka = „uložit změny a zavřít“.
     * Když se ale obsah od otevření vůbec nezměnil, není co
     * ukládat ani synchronizovat. Použijeme stejný otisk,
     * který už používá systémový Back / Esc.
     */
    if (!bylEditorZmenen()) {
      zpracujZavreniEditoru();
      return;
    }

    await ulozAZavriEditor();
  }
);

appMessageNormalButton?.addEventListener(
  "click",
  async () => {
    appMessageModal.hidden = true;
    
    appMessageSecretButton.hidden = true;
    appMessageNormalButton.hidden = true;
    
    closeAppMessageButton.textContent = "OK";

    if (cekajiciUlozeniNoveProPlanner) {
      const cekajici =
        cekajiciUlozeniNoveProPlanner;

      cekajiciUlozeniNoveProPlanner = null;

      const vysledek = await ulozAZavriEditor(
        "normal",
        {
          nezavirat: true,
          tichyRezim: true
        }
      );

      cekajici.vyresit?.(vysledek);
      return;
    }
    
    await ulozAZavriEditor("normal");
  }
);
/* ==========================================
   ANDROID – SYSTÉMOVÉ TLAČÍTKO ZPĚT
   Native MainActivity se nejdřív zeptá této funkce,
   jestli má LubaNote stisk Back zpracovat samo.
   ========================================== */

function zpracujAndroidZpet() {
  const handoffModal =
    document.getElementById(
      "editorHandoffModal"
    );

  if (handoffModal && !handoffModal.hidden) {
    const zrusit = handoffModal.querySelector(
      "#editorHandoffCancelButton"
    );

    if (
      zrusit &&
      !zrusit.hidden &&
      !zrusit.disabled
    ) {
      zrusit.click();
    }

    /*
     * Během samotného bezpečného ukládání je Zrušit deaktivované.
     * Back pouze pohltíme, aby nemohl zavřít editor pod procesem.
     */
    return true;
  }

  /*
   * Pokud je otevřený univerzální modal, Back se chová
   * stejně jako jeho tlačítko Zrušit / OK.
   */
  if (appMessageModal && !appMessageModal.hidden) {
    closeAppMessageButton?.click();
    return true;
  }
  
  /*
   * V editoru použijeme stejnou logiku jako Esc na PC:
   * beze změny rovnou zavřít, po změně nabídnout uložení.
   */
  if (taskModal && !taskModal.hidden) {
    zpracujZavreniEditoru();
    return true;
  }
  
  /*
   * Nic z LubaNote Back nezpracovalo – Android může
   * pokračovat svým běžným chováním (zavřít aplikaci).
   */
  return false;
}

window.LubaNoteZpracujAndroidZpet =
  zpracujAndroidZpet;







let longPressTimer = null;
const LONG_PRESS_TIME = 600;
let selectedCardIndex = null;
let blockNextCardClick = false;
let blokovatKlikKartyDo = 0;
let blokovatKlikPoZavreniMainMenu = false;


let rezimVyberuKaret = false;
let vybraneKarty = new Set();

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





/* ==========================================
   S2D.1 – HOST PRO SDÍLENÝ EDITOR

   Sdílená poznámka se NIKDY nevkládá do savedTask.
   sharingEditor.js vlastní serverový lock a save RPC,
   tento blok pouze bezpečně naplní existující editor UI.
   ========================================== */

function otevriSdilenouPoznamkuVEditoru(
  note,
  sessionInfo = {}
) {
  if (!note?.id) {
    return false;
  }

  reminderEnabled = note.reminder === true;
  favoriteEnabled = note.favorite === true;
  secretTaskEnabled = false;

  updateReminderButton(reminderEnabled);
  aktualizujIkonuTajnePoznamky();

  secretTaskButton?.classList.remove("active");
  priorityTaskButton?.classList.toggle(
    "active",
    favoriteEnabled
  );

  activeArea = note.area || "private";
  activeTags = Array.isArray(note.tags)
    ? [...note.tags]
    : [];

  updateTagMenuUI();
  closeTagMenu();

  zahajEditorSession(note.id);
  ukonciDraftPoznamky();

  taskModal.dataset.taskId = note.id;
  taskModal.dataset.sharedTaskId = note.id;
  taskModal.classList.add("sharingEditorMode");

  activeTaskIndex = null;

  aktivniSdilenaEditace = {
    noteId: note.id,
    revision:
      Number(
        sessionInfo.revision ??
        note.__lubanoteSharedRevision ??
        0
      ) || 0,
    ownerUsername:
      String(
        sessionInfo.ownerUsername ??
        note.__lubanoteSharedOwnerUsername ??
        ""
      ),
    role:
      String(
        sessionInfo.role ??
        note.__lubanoteSharedRole ??
        "editor"
      ),
    note: {
      ...note,
      tags: Array.isArray(note.tags)
        ? [...note.tags]
        : [],
      todos: Array.isArray(note.todos)
        ? note.todos.map((todo) => ({ ...todo }))
        : [],
      plannedItems:
        Array.isArray(note.plannedItems)
          ? note.plannedItems.map(
              (item) => ({ ...item })
            )
          : []
    }
  };

  nastavNazevPoznamkyVEditoru(
    note.title || ""
  );

  modalText.value = note.note || "";

  if (note.richContent) {
    modalRichText.innerHTML = note.richContent;
  } else {
    modalRichText.textContent = note.note || "";
  }

  modalText.hidden = true;
  modalRichText.hidden = false;
  RichTextColors.reset();

  editorRepeat =
    kopirujEditorRepeat(note.repeat);

  if (note.date) {
    const [savedDate, savedTime] =
      String(note.date).split("T");

    modalDate.value = savedDate || "";
    modalTime.value = savedTime || "";
  } else {
    modalDate.value = "";
    modalTime.value = "";
  }

  aktualizujPopiskyDataCasu();
  updateModalWeekday();

  resetujSbaleniNazvuEditoru();

  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");

  loadTodos(
    note.todos,
    note.plannedItems
  );

  /*
   * Interní linky v S2D.1 pouze zachováme v uloženém HTML.
   * Jejich sdílené přístupové/privacy chování napojíme samostatně.
   */

  puvodniOtiskEditoru =
    vytvorOtiskEditoru();

  return true;
}


function vytvorDataSdilenehoEditoru() {
  if (!aktivniSdilenaEditace) {
    return null;
  }

  const base =
    aktivniSdilenaEditace.note || {};

  const title =
    ziskejNazevPoznamkyZEditoru().trim();

  const note =
    modalRichText.innerText;

  const richContent =
    modalRichText.innerHTML;

  const date =
    modalDate.value && modalTime.value
      ? `${modalDate.value}T${modalTime.value}`
      : "";

  const tags =
    activeTags.filter(
      (nazevStitku) =>
        !jeTajnyStitek(nazevStitku)
    );

  return {
    context: {
      noteId:
        aktivniSdilenaEditace.noteId,
      revision:
        aktivniSdilenaEditace.revision,
      ownerUsername:
        aktivniSdilenaEditace.ownerUsername,
      role:
        aktivniSdilenaEditace.role
    },

    data: {
      id:
        aktivniSdilenaEditace.noteId,
      updatedAt:
        new Date().toISOString(),

      title,
      note,
      richContent,

      date,
      completed:
        base.completed === true,
      reminder:
        reminderEnabled,
      favorite:
        favoriteEnabled,
      notificationId:
        base.notificationId ?? null,
      area:
        activeArea,
      pinned:
        base.pinned === true,
      isSecret:
        false,
      tags:
        [...tags],
      todos:
        activeTodos.map(
          (todo) => ({ ...todo })
        ),
      repeat:
        kopirujEditorRepeat(editorRepeat),
      plannedItems:
        Array.isArray(base.plannedItems)
          ? base.plannedItems.map(
              (item) => ({ ...item })
            )
          : []
    }
  };
}


function zavriSdilenyEditorPoUlozeni() {
  return zavriEditorPoLokalnimUlozeni(
    editorSessionId
  );
}


function zavriSdilenyEditorPoZtrateLocku() {
  if (!aktivniSdilenaEditace) {
    return false;
  }

  taskModal.classList.remove("show");
  document.body.classList.remove("noScroll");

  aktivniSdilenaEditace = null;
  taskModal.classList.remove(
    "sharingEditorMode"
  );
  taskModal.removeAttribute(
    "data-shared-task-id"
  );

  activeTaskIndex = null;
  activeTaskId = null;

  taskModal.removeAttribute(
    "data-task-id"
  );

  ukonciDraftPoznamky();
  editorSessionId += 1;

  setTimeout(() => {
    if (!taskModal.classList.contains("show")) {
      taskModal.hidden = true;
    }
  }, 250);

  RichTextColors.reset();

  requestAnimationFrame(() => {
    renderTasks();
  });

  return true;
}


function aktualizujRevisionSdilenehoEditoru(
  revision
) {
  if (
    !aktivniSdilenaEditace ||
    !Number.isFinite(Number(revision))
  ) {
    return;
  }

  aktivniSdilenaEditace.revision =
    Number(revision);
}


window.LubaNoteSharedEditorHost = {
  otevriSdilenouPoznamku:
    otevriSdilenouPoznamkuVEditoru,

  vytvorDataProUlozeni:
    vytvorDataSdilenehoEditoru,

  zavriPoUlozeni:
    zavriSdilenyEditorPoUlozeni,

  zavriPoZtrateLocku:
    zavriSdilenyEditorPoZtrateLocku,

  aktualizujRevision:
    aktualizujRevisionSdilenehoEditoru,

  zobrazZpravu:
    (nadpis, text) =>
      zobrazZpravuAplikace(
        nadpis,
        text
      ),

  jeAktivni:
    () => !!aktivniSdilenaEditace
};


async function openTaskEditorById(taskId) {
  /*
   * Pokud právě dorazil Realtime signál, že je v cloudu novější
   * verze této poznámky, nejdřív bezpečně dokončíme její sync.
   * Výjimka: poznámku stále vlastní editor na jiném zařízení;
   * v takovém případě pokračuje standardní handoff modal.
   */
  if (
    window.LubaNoteSyncRealtime
      ?.pockejPredOtevrenim
  ) {
    const aktualni =
      await window.LubaNoteSyncRealtime
        .pockejPredOtevrenim(taskId);

    if (aktualni !== true) {
      return;
    }
  }

  if (
    window.LubaNoteEditorHandoff
      ?.pripravOtevreniEditoru
  ) {
    const povoleno =
      await window.LubaNoteEditorHandoff
        .pripravOtevreniEditoru(taskId);

    if (povoleno !== true) {
      return;
    }
  }
  
  const currentTasks = loadTask();
  
  const index = currentTasks.findIndex(
    task => task.id === taskId
  );
  
  if (index === -1) {
    console.error("Poznámka nebyla nalezena:", taskId);
    window.LubaNoteEditorHandoff
      ?.uvolniEditorPoznamky?.(taskId);
    return;
  }
  
  const currentTask = currentTasks[index];
  
  reminderEnabled = currentTask.reminder === true;
  
  favoriteEnabled = currentTask.favorite === true;
  
  secretTaskEnabled =
    currentTask.isSecret === true;
  
  if (secretTaskEnabled) {
    reminderEnabled = false;
  }
  
  updateReminderButton(reminderEnabled);
  
  aktualizujIkonuTajnePoznamky();
  
  secretTaskButton.classList.toggle(
    "active",
    secretTaskEnabled
  );
  
  priorityTaskButton?.classList.toggle(
    "active",
    favoriteEnabled
  );
  
  activeArea = currentTask.area || "private";
  activeTags = currentTask.tags || [];
  
  updateTagMenuUI();
  closeTagMenu();
  
  zahajEditorSession(currentTask.id);
  ukonciDraftPoznamky();
  taskModal.dataset.taskId = currentTask.id;
  activeTaskIndex = index;
  
  nastavNazevPoznamkyVEditoru(
    currentTask.title || ""
  );
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
  
  editorRepeat =
    kopirujEditorRepeat(currentTask.repeat);
  
  if (currentTask.date) {
    const [savedDate, savedTime] =
    currentTask.date.split("T");
    
    modalDate.value = savedDate || "";
    modalTime.value = savedTime || "";
  } else {
    modalDate.value = "";
    modalTime.value = "";
  }
  
  aktualizujPopiskyDataCasu();
  updateModalWeekday();
  
  resetujSbaleniNazvuEditoru();
  taskModal.hidden = false;
  taskModal.classList.add("show");
  document.body.classList.add("noScroll");
  
  loadTodos(currentTask.todos, currentTask.plannedItems);

  /*
   * Interní link drží cílovou poznámku podle stabilního ID.
   * Při otevření proto obnovíme jen jeho zobrazený název.
   * Děláme to PŘED otiskem editoru, aby samotné přejmenování cíle
   * nevypadalo jako ruční změna této zdrojové poznámky.
   */
  window.LubaNoteNoteLinks
    ?.aktualizujOdkazyVEditoru?.();

  puvodniOtiskEditoru =
    vytvorOtiskEditoru();
  
  /*
   * Pokud byla karta otevřena z aktivního vyhledávání,
   * po vykreslení editoru dočasně zvýrazníme všechny shody.
   * Zvýraznění nemění uložený HTML obsah poznámky ani TODO data.
   */
  requestAnimationFrame(() => {
    if (
      typeof window.zvyrazniAktualniVyhledavaniVEditoru ===
      "function"
    ) {
      window.zvyrazniAktualniVyhledavaniVEditoru();
    }
  });
  
  //renderPlannedTextLinks(currentTask.id);
}








function ziskejSmerRazeniKaret() {
  return localStorage.getItem(
      "cardSortDirection"
    ) === "asc" ?
    "asc" :
    "desc";
}


function ziskejCasUpravyKarty(task) {
  const cas = new Date(
    task?.updatedAt || 0
  ).getTime();
  
  return Number.isFinite(cas) ?
    cas :
    0;
}


function porovnejKartyProZobrazeni(a, b) {
  const rozdilPripnuti =
    Number(b.task?.pinned === true) -
    Number(a.task?.pinned === true);
  
  if (rozdilPripnuti !== 0) {
    return rozdilPripnuti;
  }
  
  const casA =
    ziskejCasUpravyKarty(a.task);
  
  const casB =
    ziskejCasUpravyKarty(b.task);
  
  if (casA !== casB) {
    return ziskejSmerRazeniKaret() === "asc" ?
      casA - casB :
      casB - casA;
  }
  
  /*
   * Stejný čas může vzniknout při hromadné změně více karet.
   * Stabilní ID zajistí stejné pořadí i tehdy, když Supabase vrátí
   * řádky pokaždé v jiném pořadí.
   */
  const rozdilId = String(
    a.task?.id || ""
  ).localeCompare(
    String(b.task?.id || ""),
    "cs"
  );
  
  return rozdilId !== 0 ?
    rozdilId :
    a.originalIndex - b.originalIndex;
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
    .sort(porovnejKartyProZobrazeni);
  sortedTasks.forEach(({ task: loadedTask, originalIndex: index }) => {
    if (!taskMatchesArea(loadedTask)) {
      return;
    }
    if (!taskMatchesFavorite(loadedTask)) {
      return;
    }
    if (!taskMatchesSecret(loadedTask)) {
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
    
    if (
      loadedTask.id &&
      vybraneKarty.has(loadedTask.id)
    ) {
      loadedCard.classList.add("cardSelected");
    }
    
    loadedCard.addEventListener("pointerdown", (event) => {
      if (rezimVyberuKaret) {
        return;
      }
      
      cardPressStartX = event.clientX;
      cardPressStartY = event.clientY;
      
      longPressTimer = setTimeout(() => {
        selectedCardIndex = index;
        
        blockNextCardClick = true;
        
        const cardMenu =
          document.getElementById("cardMenu");
        
        zobrazHlavniAkceKarty();
        
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
    
    const hlavniStitek =
      (loadedTask.tags || [])[0];
    
    const barvaHlavnihoStitku =
      hlavniStitek ?
      ziskejBarvuStitku(hlavniStitek) :
      "system";
    
    if (barvaHlavnihoStitku !== "system") {
      loadedCard.dataset.barvaKarty =
        barvaHlavnihoStitku;
    }
    
    const loadedHeading = document.createElement("h3");
    
    const loadedHeadingIcons =
      document.createElement("span");

    loadedHeadingIcons.classList.add("taskCardIcons");

    const ikonyKarty = [
      {
        zobrazit: loadedTask.pinned === true,
        nazev: "pripnout",
        trida: "taskCardIconPin"
      },
      {
        zobrazit: loadedTask.favorite === true,
        nazev: "oblibene",
        trida: "taskCardIconFavorite"
      },
      {
        zobrazit:
          loadedTask.isSecret === true &&
          tajnyRezimOdemceny,
        nazev: "zamek",
        trida: "taskCardIconSecret"
      },
      {
        zobrazit: true,
        nazev:
          loadedTask.area === "work" ?
            "prace" :
            "soukrome",
        trida: "taskCardIconArea"
      },
      {
        zobrazit: loadedTask.reminder === true,
        nazev: "zvonek",
        trida: "taskCardIconReminder"
      },
      {
        zobrazit: loadedTask.repeat?.enabled === true,
        nazev: "opakovat",
        trida: "taskCardIconRepeat"
      }
    ];

    ikonyKarty.forEach((ikona) => {
      if (!ikona.zobrazit) {
        return;
      }

      const hostitel =
        window.LubaNoteIcons?.vytvorHostitele(
          ikona.nazev,
          ["taskCardIcon", ikona.trida]
        );

      if (hostitel) {
        loadedHeadingIcons.append(hostitel);
      }
    });
    
    loadedHeading.append(
      loadedHeadingIcons,
      document.createTextNode(
        loadedTask.title || "Bez názvu"
      )
    );
    const loadedNoteText = document.createElement("p");

    const aktualniNahledPoznamky =
      window.LubaNoteNoteLinks
        ?.ziskejTextProNahledPoznamky?.(loadedTask);

    loadedNoteText.textContent =
      aktualniNahledPoznamky ?? loadedTask.note;
    loadedNoteText.classList.add("taskNoteText");
    
    const taskTodos = loadedTask.todos || [];
    
    if (taskTodos.length > 0) {
      loadedNoteText.textContent = taskTodos
        .slice(0, 3)
        .map(todo => {
          const aktualniTodoText =
            window.LubaNoteNoteLinks
              ?.ziskejTextProNahledTodo?.(todo);

          return `${todo.completed ? "☑" : "☐"} ${
            aktualniTodoText ?? todo.text
          }`;
        })
        .join("\n");
    }
    
    const loadedDateText = document.createElement("p");
    
    
    if (loadedTask.date) {
      const formattedDate = new Date(loadedTask.date).toLocaleString(
        window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ", {
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
     * PC GRID:
     * 4 nezávislé masonry sloupce.
     * Karty se rozdávají zleva doprava 1 → 2 → 3 → 4.
     *
     * PC LIST:
     * všechny karty zůstávají přímo v pinnedLeft.
     *
     * Mobil:
     * zachováme původní 2 nezávislé sloupce.
     */
    if (
      desktopCardLayout &&
      !listMode
    ) {
      let desktopSloupce =
        pinnedLeft.querySelectorAll(
          ".desktopMasonryColumn"
        );
      
      if (desktopSloupce.length === 0) {
        for (
          let i = 0; i < 4; i++
        ) {
          const sloupec =
            document.createElement("div");
          
          sloupec.className =
            "desktopMasonryColumn";
          
          pinnedLeft.append(sloupec);
        }
        
        desktopSloupce =
          pinnedLeft.querySelectorAll(
            ".desktopMasonryColumn"
          );
      }
      
      const pocetKaret =
        pinnedLeft.querySelectorAll(
          ".taskCard"
        ).length;
      
      const cisloSloupce =
        pocetKaret % 4;
      
      desktopSloupce[
        cisloSloupce
      ].append(loadedCard);
      
    } else if (listMode) {
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
    
    loadedCard.addEventListener("click", async () => {
      if (
        Date.now() < blokovatKlikKartyDo
      ) {
        return;
      }
      
      if (blockNextCardClick) {
        blockNextCardClick = false;
        return;
      }
      
      if (rezimVyberuKaret) {
        const idKarty =
          await zajistiStabilniIdKarty(index);
        
        if (!idKarty) {
          return;
        }
        
        if (vybraneKarty.has(idKarty)) {
          vybraneKarty.delete(idKarty);
        } else {
          vybraneKarty.add(idKarty);
        }
        
        /*
         * Při každém tapu už nepřekreslujeme celý seznam poznámek.
         * Přepneme jen rámeček právě kliknuté karty.
         */
        loadedCard.classList.toggle(
          "cardSelected",
          vybraneKarty.has(idKarty)
        );
        
        console.log(
          "Vybrane karty:",
          [...vybraneKarty]
        );
        
        if (vybraneKarty.size === 0) {
          ukonciRezimVyberuKaret();
          return;
        }
        
        aktualizujListuVyberuKaret();
        zobrazAkceVybranychKaret();
        return;
      }
      
      const currentTasks = loadTask();
      const currentTask = currentTasks[index];
      
      if (!currentTask) {
        return;
      }
      
      /* Starší lokální poznámce doplníme stejné stabilní ID na všech zařízeních. */
      if (!currentTask.id) {
        currentTask.id =
          typeof vytvorStabilniIdStarePoznamky === "function" ?
          vytvorStabilniIdStarePoznamky(currentTask) :
          crypto.randomUUID();
        
        currentTask.updatedAt = new Date().toISOString();
        saveAllTasks(currentTasks);
        uploadLocalNoteToSupabase(currentTask);
      }
      
      await openTaskEditorById(currentTask.id);
    });
    
  });
}









/* První vykreslení poznámek */
renderTasks();
const cardMenu = document.getElementById("cardMenu");

window.addEventListener(
  "lubanote:icon-style-change",
  () => {
    if (cardMenu) {
      cardMenu.hidden = true;
    }
  }
);


const cardSelectionCompact =
  document.getElementById("cardSelectionCompact");

const cardSelectionCompactCount =
  document.getElementById("cardSelectionCompactCount");

const cardSelectionCompactClose =
  document.getElementById("cardSelectionCompactClose");



let casovacHlaseniHromadneAkce = null;

function aktualizujListuVyberuKaret() {
  const pocetVybranych =
    vybraneKarty.size;
  
  /*
   * Pokud uživatel začne nový výběr ještě během krátké potvrzovací
   * hlášky, starý časovač nesmí nový výběr po chvíli schovat.
   */
  if (rezimVyberuKaret && casovacHlaseniHromadneAkce) {
    clearTimeout(casovacHlaseniHromadneAkce);
    casovacHlaseniHromadneAkce = null;
  }
  
  cardSelectionCompactCount.textContent =
    `${pocetVybranych} vybraných`;
  
  cardSelectionCompactClose.hidden = false;
  cardSelectionCompact.hidden = !rezimVyberuKaret;
}

function zobrazHlaseniHromadneAkce(text) {
  if (casovacHlaseniHromadneAkce) {
    clearTimeout(casovacHlaseniHromadneAkce);
  }
  
  if (window.LubaNoteIcons?.nastavObsahSIkonou) {
    window.LubaNoteIcons.nastavObsahSIkonou(
      cardSelectionCompactCount,
      "hotovo",
      text,
      ["cardSelectionStatusIcon"]
    );
  } else {
    cardSelectionCompactCount.textContent = text;
  }
  
  cardSelectionCompactClose.hidden = true;
  cardSelectionCompact.hidden = false;
  
  casovacHlaseniHromadneAkce = setTimeout(() => {
    casovacHlaseniHromadneAkce = null;
    
    /*
     * Probíhá-li už mezitím nový výběr, vrátíme na místo hlášky
     * aktuální počet a panel rozhodně neschováme.
     */
    if (rezimVyberuKaret) {
      aktualizujListuVyberuKaret();
      return;
    }
    
    cardSelectionCompact.hidden = true;
    cardSelectionCompactClose.hidden = false;
  }, 1800);
}



cardSelectionCompactClose.addEventListener("click", () => {
  ukonciRezimVyberuKaret();
});







async function zajistiStabilniIdKarty(index) {
  const tasks = loadTask();
  const task = tasks[index];
  
  if (!task) {
    return null;
  }
  
  if (task.id) {
    return task.id;
  }
  
  task.id =
    typeof vytvorStabilniIdStarePoznamky === "function" ?
    vytvorStabilniIdStarePoznamky(task) :
    crypto.randomUUID();
  
  task.updatedAt =
    new Date().toISOString();
  
  await saveAllTasks(tasks);
  
  return task.id;
}

async function ziskejIdVybranychKaret() {
  return [...vybraneKarty]
    .filter(Boolean);
}


async function provedHromadnouZmenuVybranychKaret(
  zmenPoznamku
) {
  if (typeof zmenPoznamku !== "function") {
    return null;
  }
  
  const vybranaId =
    await ziskejIdVybranychKaret();
  
  if (!vybranaId || vybranaId.length === 0) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }
  
  const provedZmenu = async () => {
    const tasks = loadTask();
    const indexPodleId = new Map(
      tasks
      .map((task, index) => [task?.id, index])
      .filter(([id]) => Boolean(id))
    );
    
    const casZmeny =
      new Date().toISOString();
    
    let pocet = 0;
    
    for (const id of vybranaId) {
      const index = indexPodleId.get(id);
      
      if (index === undefined) {
        continue;
      }
      
      const task = tasks[index];
      
      if (!task) {
        continue;
      }
      
      zmenPoznamku(task);
      task.updatedAt = casZmeny;
      pocet += 1;
    }
    
    if (pocet === 0) {
      return {
        pocet: 0,
        lokalneUlozeno: false
      };
    }
    
    const lokalneUlozeno =
      await saveAllTasks(tasks);
    
    return {
      pocet,
      lokalneUlozeno: lokalneUlozeno !== false
    };
  };
  
  if (
    typeof window.LubaNoteSync
    ?.provedLokalniZmenuASynchronizuj ===
    "function"
  ) {
    return await window.LubaNoteSync
      .provedLokalniZmenuASynchronizuj(
        provedZmenu
      );
  }
  
  /*
   * Bez sync modulu raději bezpečně uložíme jen lokálně.
   * Přímý upload jednotlivých poznámek zde záměrně nepoužíváme.
   */
  return await provedZmenu();
}

async function smazPoznamkyPodleId(ids) {
  const bezpecnaId =
    Array.isArray(ids) ?
    ids.filter(Boolean) :
    [];
  
  const provedSmazani = async () => {
    if (typeof deleteTasksByIds === "function") {
      return await deleteTasksByIds(
        bezpecnaId
      );
    }
    
    /*
     * Záložní cesta pro starší storage.js.
     */
    let pocet = 0;
    
    for (const id of bezpecnaId) {
      const tasks = loadTask();
      const index = tasks.findIndex(
        (task) => task?.id === id
      );
      
      if (index < 0) {
        continue;
      }
      
      const uspesne =
        await deleteTask(index);
      
      if (uspesne !== false) {
        pocet += 1;
      }
    }
    
    return {
      pocet,
      lokalneUlozeno: true
    };
  };
  
  if (
    typeof window.LubaNoteSync
    ?.provedLokalniZmenuASynchronizuj ===
    "function"
  ) {
    return await window.LubaNoteSync
      .provedLokalniZmenuASynchronizuj(
        provedSmazani
      );
  }
  
  return await provedSmazani();
}

function ukonciRezimVyberuKaret() {
  rezimVyberuKaret = false;
  vybraneKarty.clear();
  
  document.body.classList.remove(
    "cardSelectionModeActive"
  );
  
  aktualizujListuVyberuKaret();
  
  cardMenu.classList.remove(
    "selectionMode"
  );
  cardMenu.hidden = true;
  
  renderTasks();
  
  if (
    navigator.onLine &&
    typeof window.LubaNoteSync
    ?.spustRychle === "function"
  ) {
    window.LubaNoteSync
      .spustRychle()
      .catch((error) => {
        console.warn(
          "Synchronizace po ukončení výběru selhala:",
          error
        );
      });
  }
}

function ziskejStavVybranychKaret() {
  const tasks = loadTask();
  const tasksPodleId = new Map(
    tasks
    .filter((task) => task?.id)
    .map((task) => [task.id, task])
  );
  
  const vybrane = [...vybraneKarty]
    .map((id) => tasksPodleId.get(id))
    .filter(Boolean);
  
  return {
    pocet: vybrane.length,
    vsePripnute: vybrane.length > 0 &&
      vybrane.every(
        (task) => task.pinned === true
      ),
    vseHotove: vybrane.length > 0 &&
      vybrane.every(
        (task) => task.completed === true
      )
  };
}

function pouzivaSvgIkonyRozhrani() {
  return (
    window.LubaNoteIcons?.pouzitSvgIkony?.() === true
  );
}

function zobrazAkceVybranychKaret() {
  if (!rezimVyberuKaret) {
    return;
  }
  
  document.body.classList.add(
    "cardSelectionModeActive"
  );
  
  const stav =
    ziskejStavVybranychKaret();
  
  if (stav.pocet === 0) {
    ukonciRezimVyberuKaret();
    return;
  }

  if (!pouzivaSvgIkonyRozhrani()) {
    cardMenu.classList.add(
      "selectionMode"
    );

    cardMenu.innerHTML = `
      <button type="button" data-card-action="bulk-pin">
        ${stav.vsePripnute ? "📍 Odepnout" : "📌 Připnout"}
      </button>

      <button type="button" data-card-action="bulk-complete">
        ${stav.vseHotove ? "↩️ Vrátit" : "✅ Hotovo"}
      </button>

      <button type="button" data-card-action="bulk-delete">
        🗑️ Smazat
      </button>

      <button type="button" data-card-action="bulk-exit">
        ✕ Konec výběru
      </button>
    `;

    cardMenu.style.top = "auto";
    cardMenu.style.bottom =
      window.innerWidth < 900 ?
      "90px" :
      "34px";
    cardMenu.style.visibility = "visible";
    cardMenu.hidden = false;
    return;
  }
  
  cardMenu.classList.add(
    "selectionMode"
  );
  
  cardMenu.innerHTML = `
    <button type="button" class="lubaHasIcon" data-card-action="bulk-pin">
      <span class="lubaActionIcon" data-luba-icon="${stav.vsePripnute ? "odepnout" : "pripnout"}" aria-hidden="true"></span>
      <span>${stav.vsePripnute ? "Odepnout" : "Připnout"}</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="bulk-complete">
      <span class="lubaActionIcon" data-luba-icon="${stav.vseHotove ? "zpet" : "hotovo"}" aria-hidden="true"></span>
      <span>${stav.vseHotove ? "Vrátit" : "Hotovo"}</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="bulk-delete">
      <span class="lubaActionIcon" data-luba-icon="smazat" aria-hidden="true"></span>
      <span>Smazat</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="bulk-exit">
      <span class="lubaActionIcon" data-luba-icon="zavrit" aria-hidden="true"></span>
      <span>Konec výběru</span>
    </button>
  `;

  window.LubaNoteIcons?.naplnDeklarovaneIkony?.(cardMenu);
  
  cardMenu.style.top = "auto";
  cardMenu.style.bottom =
    window.innerWidth < 900 ?
    "90px" :
    "34px";
  cardMenu.style.visibility = "visible";
  cardMenu.hidden = false;
}

function zobrazHlavniAkceKarty() {
  cardMenu.classList.remove(
    "selectionMode"
  );

  if (!pouzivaSvgIkonyRozhrani()) {
    if (window.innerWidth < 900) {
      cardMenu.innerHTML = `
        <button type="button" data-card-action="plan">
          🕒 Termín
        </button>

        <button type="button" data-card-action="pin">
          📌 Připnout
        </button>

        <button type="button" data-card-action="delete">
          🗑️ Smazat
        </button>

        <button type="button" data-card-action="more">
          ⋯ Více akcí
        </button>
      `;
    } else {
      cardMenu.innerHTML = `
        <button type="button" data-card-action="plan">
          🕒 Termín
        </button>

        <button type="button" data-card-action="pin">
          📌 Připnout
        </button>

        <button type="button" data-card-action="delete">
          🗑️ Smazat
        </button>

        <button type="button" data-card-action="select">
          ☑️ Označit
        </button>

        <button type="button" data-card-action="complete">
          ✅ Hotovo
        </button>

        <button type="button" data-card-action="color">
          🎨 Barva
        </button>
      `;
    }

    return;
  }
  
  if (window.innerWidth < 900) {
    cardMenu.innerHTML = `
      <button type="button" class="lubaHasIcon" data-card-action="plan">
        <span class="lubaActionIcon" data-luba-icon="hodiny" aria-hidden="true"></span><span>Termín</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="pin">
        <span class="lubaActionIcon" data-luba-icon="pripnout" aria-hidden="true"></span><span>Připnout</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="delete">
        <span class="lubaActionIcon" data-luba-icon="smazat" aria-hidden="true"></span><span>Smazat</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="more">
        <span class="lubaActionIcon" data-luba-icon="vice" aria-hidden="true"></span><span>Více akcí</span>
      </button>
    `;

    window.LubaNoteIcons?.naplnDeklarovaneIkony?.(cardMenu);
  } else {
    cardMenu.innerHTML = `
      <button type="button" class="lubaHasIcon" data-card-action="plan">
        <span class="lubaActionIcon" data-luba-icon="hodiny" aria-hidden="true"></span><span>Termín</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="pin">
        <span class="lubaActionIcon" data-luba-icon="pripnout" aria-hidden="true"></span><span>Připnout</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="delete">
        <span class="lubaActionIcon" data-luba-icon="smazat" aria-hidden="true"></span><span>Smazat</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="select">
        <span class="lubaActionIcon" data-luba-icon="oznacit" aria-hidden="true"></span><span>Označit</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="complete">
        <span class="lubaActionIcon" data-luba-icon="hotovo" aria-hidden="true"></span><span>Hotovo</span>
      </button>

      <button type="button" class="lubaHasIcon" data-card-action="color">
        <span class="lubaActionIcon" data-luba-icon="paleta" aria-hidden="true"></span><span>Barva</span>
      </button>
    `;

    window.LubaNoteIcons?.naplnDeklarovaneIkony?.(cardMenu);
  }
}


function zobrazPaletuBarevKarty() {
  const tasks = loadTask();
  
  const selectedTask =
    tasks[selectedCardIndex];
  
  const aktualniBarva =
    selectedTask?.barvaKarty ||
    "system";
  cardMenu.classList.remove(
    "selectionMode"
  );
  
  cardMenu.innerHTML = `
    <div class="cardColorPalette">
      <button
        type="button"
        class="cardColorOption cardColorSystem"
        data-card-color="system"
        aria-label="Systémová barva"
        title="Systémová barva"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="cervena"
        aria-label="Červená"
        title="Červená"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="oranzova"
        aria-label="Oranžová"
        title="Oranžová"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="zluta"
        aria-label="Žlutá"
        title="Žlutá"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="zelena"
        aria-label="Zelená"
        title="Zelená"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="tyrkysova"
        aria-label="Tyrkysová"
        title="Tyrkysová"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="modra"
        aria-label="Modrá"
        title="Modrá"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="fialova"
        aria-label="Fialová"
        title="Fialová"
      ></button>

      <button
        type="button"
        class="cardColorOption"
        data-card-color="ruzova"
        aria-label="Růžová"
        title="Růžová"
      ></button>
    </div>

    <button type="button" class="lubaHasIcon" data-card-action="back">
      <span class="lubaActionIcon" data-luba-icon="zpet" aria-hidden="true"></span><span>Zpět</span>
    </button>
  `;

  if (pouzivaSvgIkonyRozhrani()) {
    window.LubaNoteIcons?.naplnDeklarovaneIkony?.(cardMenu);
  } else {
    const tlacitkoZpet =
      cardMenu.querySelector('[data-card-action="back"]');

    if (tlacitkoZpet) {
      tlacitkoZpet.classList.remove("lubaHasIcon");
      tlacitkoZpet.textContent = "← Zpět";
    }
  }

  const aktivniBarva =
    cardMenu.querySelector(
      `[data-card-color="${aktualniBarva}"]`
    );
  
  aktivniBarva?.classList.add(
    "cardColorSelected"
  );
}


function zobrazDalsiAkceKarty() {
  cardMenu.classList.remove(
    "selectionMode"
  );

  if (!pouzivaSvgIkonyRozhrani()) {
    cardMenu.innerHTML = `
      <button type="button" data-card-action="select">
        ☑️ Označit
      </button>

      <button type="button" data-card-action="complete">
        ✅ Hotovo
      </button>

      <button type="button" data-card-action="color">
        🎨 Barva
      </button>

      <button type="button" data-card-action="back">
        ← Zpět
      </button>
    `;

    return;
  }
  
  cardMenu.innerHTML = `
    <button type="button" class="lubaHasIcon" data-card-action="select">
      <span class="lubaActionIcon" data-luba-icon="oznacit" aria-hidden="true"></span><span>Označit</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="complete">
      <span class="lubaActionIcon" data-luba-icon="hotovo" aria-hidden="true"></span><span>Hotovo</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="color">
      <span class="lubaActionIcon" data-luba-icon="paleta" aria-hidden="true"></span><span>Barva</span>
    </button>

    <button type="button" class="lubaHasIcon" data-card-action="back">
      <span class="lubaActionIcon" data-luba-icon="zpet" aria-hidden="true"></span><span>Zpět</span>
    </button>
  `;

  window.LubaNoteIcons?.naplnDeklarovaneIkony?.(cardMenu);
}

let casovacPotvrzeniAkce = null;
let casovacCekaniAkce = null;
let idCekaniAkce = 0;

function ziskejPrvkyStavuAkce() {
  const modal =
    document.getElementById("actionStatusModal");
  
  const text =
    document.getElementById("actionStatusText");
  
  const ikona =
    modal?.querySelector(".actionStatusIcon") || null;
  
  return {
    modal,
    text,
    ikona
  };
}

function vycistiCasovaceStavuAkce() {
  clearTimeout(casovacPotvrzeniAkce);
  clearTimeout(casovacCekaniAkce);
  
  casovacPotvrzeniAkce = null;
  casovacCekaniAkce = null;
}

function zobrazPotvrzeniAkce(text, doba = 1800) {
  const prvky = ziskejPrvkyStavuAkce();
  
  if (!prvky.modal || !prvky.text) {
    return;
  }
  
  idCekaniAkce += 1;
  vycistiCasovaceStavuAkce();
  
  prvky.modal.classList.remove("actionStatusWaiting");
  
  if (prvky.ikona) {
    window.LubaNoteIcons?.nastavJenIkonu?.(
      prvky.ikona,
      "hotovo",
      ["actionStatusSvgIcon"]
    );
  }
  
  prvky.text.textContent = text;
  prvky.modal.hidden = false;
  
  casovacPotvrzeniAkce = setTimeout(() => {
    prvky.modal.hidden = true;
    casovacPotvrzeniAkce = null;
  }, doba);
}

/*
 * Indikátor čekání se zobrazí až po krátkém zpoždění.
 * Rychlé akce proto neblikají, pomalejší akce ale uživatele
 * vždy informují, že aplikace skutečně pracuje.
 * Funkce vrací ukončovací callback.
 */
function zacniCekaniAkce(
  text,
  zpozdeni = 250
) {
  const prvky = ziskejPrvkyStavuAkce();
  
  if (!prvky.modal || !prvky.text) {
    return () => {};
  }
  
  const mojeId = ++idCekaniAkce;
  let ukonceno = false;
  
  vycistiCasovaceStavuAkce();
  
  casovacCekaniAkce = setTimeout(() => {
    if (
      ukonceno ||
      mojeId !== idCekaniAkce
    ) {
      return;
    }
    
    prvky.modal.classList.add(
      "actionStatusWaiting"
    );
    
    if (prvky.ikona) {
      window.LubaNoteIcons?.nastavJenIkonu?.(
        prvky.ikona,
        "obnovit",
        ["actionStatusSvgIcon", "actionStatusSpinIcon"]
      );
    }
    
    prvky.text.textContent = text;
    prvky.modal.hidden = false;
  }, Math.max(0, Number(zpozdeni) || 0));
  
  return () => {
    if (ukonceno) {
      return;
    }
    
    ukonceno = true;
    clearTimeout(casovacCekaniAkce);
    casovacCekaniAkce = null;
    
    if (mojeId !== idCekaniAkce) {
      return;
    }
    
    prvky.modal.hidden = true;
    prvky.modal.classList.remove(
      "actionStatusWaiting"
    );
    
    if (prvky.ikona) {
      window.LubaNoteIcons?.nastavJenIkonu?.(
        prvky.ikona,
        "hotovo",
        ["actionStatusSvgIcon"]
      );
    }
  };
}

window.LubaNoteUI = {
  ...(window.LubaNoteUI || {}),
  zobrazPotvrzeniAkce,
  zacniCekaniAkce
};

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





cardMenu.addEventListener("click", async (event) => {
  const actionButton =
    event.target.closest("[data-card-action]");
  
  const colorButton =
    event.target.closest("[data-card-color]");
  
  if (colorButton) {
    const tasks = loadTask();
    
    const selectedTask =
      tasks[selectedCardIndex];
    
    if (!selectedTask) {
      return;
    }
    
    const novaBarva =
      colorButton.dataset.cardColor;
    
    selectedTask.barvaKarty =
      novaBarva === "system" ?
      null :
      novaBarva;
    
    selectedTask.updatedAt =
      new Date().toISOString();
    
    saveAllTasks(tasks);
    
    await uploadLocalNoteToSupabase(
      selectedTask
    );
    
    cardMenu.hidden = true;
    
    renderTasks();
    
    return;
  }
  
  if (!actionButton) {
    return;
  }
  
  const action = actionButton.dataset.cardAction;
  
  if (action === "more") {
    zobrazDalsiAkceKarty();
    return;
  }
  
  if (action === "back") {
    zobrazHlavniAkceKarty();
    return;
  }
  
  if (action === "color") {
    zobrazPaletuBarevKarty();
    return;
  }
  
  if (action === "select") {
    const idKarty =
      await zajistiStabilniIdKarty(
        selectedCardIndex
      );
    
    if (!idKarty) {
      return;
    }
    
    rezimVyberuKaret = true;
    vybraneKarty.add(idKarty);
    
    /*
     * Long-press už svůj ochranný click spotřeboval na tlačítku
     * Označit. Další skutečný tap na kartu proto nesmí být blokovaný.
     */
    blockNextCardClick = false;
    
    aktualizujListuVyberuKaret();
    
    renderTasks();
    zobrazAkceVybranychKaret();
    
    console.log(
      "Rezim vyberu:",
      rezimVyberuKaret
    );
    
    console.log(
      "Vybrane karty:",
      [...vybraneKarty]
    );
    
    return;
  }
  
  
  
  
  if (action === "bulk-exit") {
    ukonciRezimVyberuKaret();
    return;
  }
  
  if (action === "bulk-pin") {
    const stav =
      ziskejStavVybranychKaret();
    const novaHodnota = !stav.vsePripnute;
    
    const vysledek =
      await provedHromadnouZmenuVybranychKaret(
        (task) => {
          task.pinned = novaHodnota;
        }
      );
    
    if (vysledek?.lokalneUlozeno) {
      const pocet = vysledek.pocet;
      
      ukonciRezimVyberuKaret();
      
      zobrazPotvrzeniAkce(
        novaHodnota ?
        `Připnuto ${pocet} poznámek` :
        `Odepnuto ${pocet} poznámek`
      );
    }
    
    return;
  }
  
  if (action === "bulk-complete") {
    const stav =
      ziskejStavVybranychKaret();
    const novaHodnota = !stav.vseHotove;
    
    const vysledek =
      await provedHromadnouZmenuVybranychKaret(
        (task) => {
          task.completed = novaHodnota;
        }
      );
    
    if (vysledek?.lokalneUlozeno) {
      const pocet = vysledek.pocet;
      
      ukonciRezimVyberuKaret();
      
      zobrazPotvrzeniAkce(
        novaHodnota ?
        `Hotovo u ${pocet} poznámek` :
        `Obnoveno ${pocet} poznámek`
      );
    }
    
    return;
  }
  
  if (action === "bulk-delete") {
    const ids =
      await ziskejIdVybranychKaret();
    
    if (!ids || ids.length === 0) {
      return;
    }
    
    hromadneMazaniIds = [...ids];
    
    if (deleteConfirmTitle) {
      deleteConfirmTitle.textContent =
        "Přesunout do koše?";
    }
    
    if (deleteConfirmText) {
      deleteConfirmText.textContent =
        window.LubaNoteI18n?.t?.(
          "trash.moveManyMessage",
          "Přesunout {count} vybraných poznámek do Koše?",
          { count: ids.length }
        ) || `Přesunout ${ids.length} vybraných poznámek do Koše?`;
    }
    
    cardMenu.hidden = true;
    deleteConfirmModal.hidden = false;
    return;
  }
  
  if (action === "plan") {
    const tasks = loadTask();
    const selectedTask = tasks[selectedCardIndex];
    
    if (!selectedTask) {
      return;
    }
    
    /* Starší poznámce doplníme stejné stabilní ID na všech zařízeních. */
    if (!selectedTask.id) {
      selectedTask.id =
        typeof vytvorStabilniIdStarePoznamky === "function" ?
        vytvorStabilniIdStarePoznamky(selectedTask) :
        crypto.randomUUID();
      
      selectedTask.updatedAt = new Date().toISOString();
      
      saveAllTasks(tasks);
      uploadLocalNoteToSupabase(selectedTask);
    }
    
    cardMenu.hidden = true;
    
    /* Celá poznámka se plánuje jen jedním způsobem:
       přes její vlastní datum + čas + opakování v editoru. */
    await openTaskEditorById(selectedTask.id);

    if (
      taskModal.dataset.taskId ===
      selectedTask.id
    ) {
      setTimeout(() => {
        modalTimeButton?.click();
      }, 0);
    }
    
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
    !rezimVyberuKaret &&
    !cardMenu.hidden &&
    !cardMenu.contains(event.target)
  ) {
    event.preventDefault();
    event.stopPropagation();
    
    blokovatKlikKartyDo =
      Date.now() + 400;
    cardMenu.hidden = true;
  }
}, true);

appMessageSecretButton?.addEventListener(
  "click",
  async () => {
    appMessageModal.hidden = true;
    
    appMessageSecretButton.hidden = true;
    appMessageNormalButton.hidden = true;
    
    closeAppMessageButton.textContent = "OK";

    if (cekajiciUlozeniNoveProPlanner) {
      const cekajici =
        cekajiciUlozeniNoveProPlanner;

      cekajiciUlozeniNoveProPlanner = null;

      const vysledek = await ulozAZavriEditor(
        "secret",
        {
          nezavirat: true,
          tichyRezim: true
        }
      );

      cekajici.vyresit?.(vysledek);
      return;
    }
    
    await ulozAZavriEditor("secret");
  }
);


const listaStitku =
  document.querySelector(".categoryTabs");

if (listaStitku) {
  listaStitku.addEventListener(
    "wheel",
    (event) => {
      const lzePosouvat =
        listaStitku.scrollWidth >
        listaStitku.clientWidth;

      if (!lzePosouvat) {
        return;
      }

      event.preventDefault();

      listaStitku.scrollLeft +=
        event.deltaY !== 0
          ? event.deltaY
          : event.deltaX;
    },
    {
      passive: false
    }
  );
}


/* ========================================
   UKONCENI SPLASH SCREENU
   ======================================== */

function skryjSplashScreen() {
  const splashScreen = document.getElementById("appSplash");

  if (!splashScreen) {
    return;
  }

  splashScreen.classList.add("appSplashHidden");
  splashScreen.setAttribute("aria-hidden", "true");

  splashScreen.addEventListener(
    "transitionend",
    () => {
      splashScreen.remove();
    },
    { once: true }
  );
}

let skryvaniSplashSpusteno = false;

async function skryjSplashPoDokonceniStartu() {
  if (skryvaniSplashSpusteno) {
    return;
  }

  skryvaniSplashSpusteno = true;

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.warn(
        "Čekání na písma před skrytím splash screenu selhalo:",
        error
      );
    }
  }

  /*
   * Splash mizí až po signálu z inicializace aplikace.
   * Dvě vykreslení navíc zajistí, že už jsou na obrazovce
   * finální karty i jejich barvy podle načtených štítků.
   */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      skryjSplashScreen();
    });
  });
}

window.addEventListener(
  "lubanote:splash-ready",
  skryjSplashPoDokonceniStartu,
  { once: true }
);

/*
 * Nouzová pojistka: chyba sítě nebo inicializace nesmí nechat
 * aplikaci navždy zakrytou splash screenem. Běžný start tuto
 * cestu nepoužije; splash zavře událost lubanote:splash-ready.
 */
window.addEventListener(
  "load",
  () => {
    setTimeout(() => {
      if (!skryvaniSplashSpusteno) {
        console.warn(
          "Splash screen byl skryt nouzovou pojistkou po 15 s."
        );

        skryjSplashPoDokonceniStartu();
      }
    }, 15000);
  },
  { once: true }
);

window.addEventListener(
  "lubanote:language-change",
  () => {
    if (
      typeof vykresliVyberData === "function" &&
      datePickerModal &&
      !datePickerModal.hidden
    ) {
      vykresliVyberData();
    }
  }
);



/* ==========================================
   STABILIZACE 0.0B – PERSISTENTNÍ DRAFT NOVÉ POZNÁMKY
   --------------------------------------------------
   Cíl:
   - nová NE-SECRET poznámka nesmí zmizet při reloadu / uspání WebView,
   - draft se průběžně ukládá do IndexedDB, nikoli do localStorage,
   - po návratu aplikace nabídneme Obnovit / Zahodit,
   - Secret obsah se do této plaintext recovery vrstvy NIKDY neukládá.
   ========================================== */

const LUBANOTE_DRAFT_DB_NAME =
  "LubaNoteDraftRecoveryV1";
const LUBANOTE_DRAFT_DB_VERSION = 1;
const LUBANOTE_DRAFT_STORE = "drafts";
const LUBANOTE_DRAFT_OWNER_KEY =
  "lubanoteLocalOwnerUserId";
const LUBANOTE_DRAFT_AUTH_OK_KEY =
  "lubanoteAuthOk";

let draftDbPromise = null;
let draftUlozeniTimer = null;
let posledniUlozenyOtiskDraftu = null;
let probihaObnovaDraftu = false;

function otevriDraftDb() {
  if (draftDbPromise) {
    return draftDbPromise;
  }

  draftDbPromise = new Promise(
    (resolve, reject) => {
      if (!window.indexedDB) {
        reject(
          new Error("IndexedDB není dostupné.")
        );
        return;
      }

      const request = indexedDB.open(
        LUBANOTE_DRAFT_DB_NAME,
        LUBANOTE_DRAFT_DB_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;

        if (
          !db.objectStoreNames.contains(
            LUBANOTE_DRAFT_STORE
          )
        ) {
          db.createObjectStore(
            LUBANOTE_DRAFT_STORE,
            { keyPath: "ownerUserId" }
          );
        }
      };

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ||
          new Error(
            "Draft IndexedDB se nepodařilo otevřít."
          )
        );
    }
  ).catch((error) => {
    draftDbPromise = null;
    throw error;
  });

  return draftDbPromise;
}

function ziskejVlastnikaDraftu() {
  if (
    localStorage.getItem(
      LUBANOTE_DRAFT_AUTH_OK_KEY
    ) !== "1"
  ) {
    return "";
  }

  return String(
    window.LubaNoteSupabase
      ?.ziskejAktualniPristup?.()?.user_id ||
    localStorage.getItem(
      LUBANOTE_DRAFT_OWNER_KEY
    ) ||
    ""
  ).trim();
}

async function nactiPersistovanyDraftPoznamky() {
  const ownerUserId = ziskejVlastnikaDraftu();

  if (!ownerUserId) {
    return null;
  }

  try {
    const db = await otevriDraftDb();

    return await new Promise(
      (resolve, reject) => {
        const tx = db.transaction(
          LUBANOTE_DRAFT_STORE,
          "readonly"
        );

        const request = tx
          .objectStore(LUBANOTE_DRAFT_STORE)
          .get(ownerUserId);

        request.onsuccess = () =>
          resolve(request.result || null);

        request.onerror = () =>
          reject(request.error);
      }
    );
  } catch (error) {
    console.warn(
      "LubaNote draft: recovery draft se nepodařilo načíst.",
      error
    );
    return null;
  }
}

async function smazPersistovanyDraftPoznamky(
  draftId = null
) {
  const ownerUserId = ziskejVlastnikaDraftu();

  if (!ownerUserId) {
    return false;
  }

  try {
    const existujici =
      await nactiPersistovanyDraftPoznamky();

    if (
      draftId &&
      existujici?.draftId &&
      existujici.draftId !== draftId
    ) {
      return false;
    }

    const db = await otevriDraftDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        LUBANOTE_DRAFT_STORE,
        "readwrite"
      );

      tx.objectStore(LUBANOTE_DRAFT_STORE)
        .delete(ownerUserId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    posledniUlozenyOtiskDraftu = null;
    return true;
  } catch (error) {
    console.warn(
      "LubaNote draft: recovery draft se nepodařilo odstranit.",
      error
    );
    return false;
  }
}

function vytvorSnapshotNovehoDraftu() {
  if (
    probihaObnovaDraftu ||
    !taskModal ||
    taskModal.hidden ||
    aktivniSdilenaEditace ||
    activeTaskId !== null ||
    activeTaskIndex !== null
  ) {
    return null;
  }

  const draftId = ziskejDraftIdPoznamky();

  if (!draftId) {
    return null;
  }

  /*
   * Bezpečnost: Secret obsah se nesmí dostat do plaintext recovery DB.
   * To platí i pro novou poznámku otevřenou uvnitř odemčeného
   * Secret režimu, dokud uživatel výslovně nezvolí běžné uložení.
   */
  if (
    secretTaskEnabled === true ||
    document.body.classList.contains(
      "secretModeActive"
    )
  ) {
    return null;
  }

  const ownerUserId = ziskejVlastnikaDraftu();

  if (!ownerUserId) {
    return null;
  }

  const otisk = vytvorOtiskEditoru();

  if (
    puvodniOtiskEditoru === null ||
    otisk === puvodniOtiskEditoru
  ) {
    return {
      prazdny: true,
      ownerUserId,
      draftId,
      otisk
    };
  }

  return {
    version: 1,
    ownerUserId,
    draftId,
    savedAt: new Date().toISOString(),
    puvodniOtiskEditoru,
    otisk,

    title:
      ziskejNazevPoznamkyZEditoru(),
    richContent:
      modalRichText.innerHTML,
    date: modalDate.value,
    time: modalTime.value,
    reminder: reminderEnabled === true,
    favorite: favoriteEnabled === true,
    area: activeArea || "private",
    tags: Array.isArray(activeTags)
      ? [...activeTags]
      : [],
    todos: Array.isArray(activeTodos)
      ? activeTodos.map((todo) => ({ ...todo }))
      : [],
    repeat:
      kopirujEditorRepeat(editorRepeat),
    secret: false
  };
}

async function ulozPersistovanyDraftPoznamky() {
  const snapshot = vytvorSnapshotNovehoDraftu();

  if (!snapshot) {
    return false;
  }

  if (snapshot.prazdny === true) {
    await smazPersistovanyDraftPoznamky(
      snapshot.draftId
    );
    return true;
  }

  if (
    snapshot.otisk ===
    posledniUlozenyOtiskDraftu
  ) {
    return true;
  }

  try {
    const db = await otevriDraftDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        LUBANOTE_DRAFT_STORE,
        "readwrite"
      );

      tx.objectStore(LUBANOTE_DRAFT_STORE)
        .put(snapshot);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    posledniUlozenyOtiskDraftu =
      snapshot.otisk;

    return true;
  } catch (error) {
    console.warn(
      "LubaNote draft: průběžné uložení recovery draftu selhalo.",
      error
    );
    return false;
  }
}

function naplanujUlozeniDraftu(
  zpozdeni = 1200
) {
  clearTimeout(draftUlozeniTimer);

  draftUlozeniTimer = setTimeout(() => {
    draftUlozeniTimer = null;
    void ulozPersistovanyDraftPoznamky();
  }, zpozdeni);
}

function vytvorModalObnovyDraftu() {
  let modal = document.getElementById(
    "draftRecoveryModal"
  );

  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = "draftRecoveryModal";
  modal.className = "appMessageModal";
  modal.hidden = true;

  modal.innerHTML = `
    <div class="appMessageDialog">
      <h3>Rozepsaná poznámka</h3>
      <p id="draftRecoveryText">
        LubaNote našla neuloženou rozepsanou poznámku.
      </p>
      <div class="appMessageActions">
        <button id="draftRecoveryRestoreButton" type="button">
          Obnovit
        </button>
        <button id="draftRecoveryDiscardButton" type="button">
          Zahodit
        </button>
      </div>
    </div>
  `;

  document.body.append(modal);
  return modal;
}

function obnovDraftDoEditoru(draft) {
  if (
    !draft?.draftId ||
    draft.secret === true
  ) {
    return false;
  }

  probihaObnovaDraftu = true;

  try {
    zahajEditorSession(null);
    taskModal.removeAttribute("data-task-id");
    taskModal.removeAttribute(
      "data-shared-task-id"
    );
    taskModal.classList.remove(
      "sharingEditorMode"
    );

    activeTaskIndex = null;
    activeTaskId = null;
    aktivniSdilenaEditace = null;

    taskModal.dataset.draftTaskId =
      draft.draftId;

    secretTaskEnabled = false;
    favoriteEnabled =
      draft.favorite === true;
    reminderEnabled =
      draft.reminder === true;

    aktualizujIkonuTajnePoznamky();
    secretTaskButton?.classList.remove(
      "active"
    );
    priorityTaskButton?.classList.toggle(
      "active",
      favoriteEnabled
    );
    updateReminderButton(reminderEnabled);

    activeArea = draft.area || "private";
    activeTags = Array.isArray(draft.tags)
      ? [...draft.tags]
      : [];

    updateTagMenuUI();
    closeTagMenu();

    nastavNazevPoznamkyVEditoru(
      draft.title || ""
    );

    modalText.value = "";
    modalRichText.innerHTML =
      draft.richContent || "";
    modalText.hidden = true;
    modalRichText.hidden = false;
    RichTextColors.reset();

    editorRepeat =
      kopirujEditorRepeat(draft.repeat);

    modalDate.value = draft.date || "";
    modalTime.value = draft.time || "";

    aktualizujPopiskyDataCasu();
    updateModalWeekday();

    loadTodos(
      Array.isArray(draft.todos)
        ? draft.todos
        : [],
      []
    );

    resetujSbaleniNazvuEditoru();
    taskModal.hidden = false;
    taskModal.classList.add("show");
    document.body.classList.add("noScroll");

    /*
     * DŮLEŽITÉ: původní otisk je otisk prázdné nové poznámky
     * z okamžiku jejího vytvoření, ne otisk obnoveného draftu.
     * Proto je obnovený obsah dál správně považován za neuloženou změnu
     * a fajfka jej opravdu uloží jako novou poznámku.
     */
    puvodniOtiskEditoru =
      draft.puvodniOtiskEditoru || null;

    posledniUlozenyOtiskDraftu =
      draft.otisk || null;

    return true;
  } finally {
    probihaObnovaDraftu = false;
  }
}

async function nabidniObnovuDraftuPokudExistuje() {
  if (
    localStorage.getItem(
      LUBANOTE_DRAFT_AUTH_OK_KEY
    ) !== "1" ||
    !ziskejVlastnikaDraftu()
  ) {
    return;
  }

  const draft =
    await nactiPersistovanyDraftPoznamky();

  if (!draft?.draftId) {
    return;
  }

  /*
   * Kdyby běžný save proběhl, ale následné mazání recovery záznamu
   * selhalo, nesmíme nabídnout duplikát. Existující note ID je důkaz,
   * že draft už byl bezpečně uložen jako skutečná poznámka.
   */
  const uzJeUlozeny = loadTask().some(
    (task) => task?.id === draft.draftId
  );

  if (uzJeUlozeny) {
    await smazPersistovanyDraftPoznamky(
      draft.draftId
    );
    return;
  }

  if (
    taskModal &&
    !taskModal.hidden
  ) {
    return;
  }

  const modal = vytvorModalObnovyDraftu();
  const restoreButton = modal.querySelector(
    "#draftRecoveryRestoreButton"
  );
  const discardButton = modal.querySelector(
    "#draftRecoveryDiscardButton"
  );

  restoreButton.onclick = () => {
    modal.hidden = true;
    obnovDraftDoEditoru(draft);
  };

  discardButton.onclick = async () => {
    modal.hidden = true;

    try {
      await window.LubaNoteAttachmentsLocal
        ?.smazPrilohyPodleNoteId?.(
          draft.draftId
        );
    } catch (error) {
      console.warn(
        "LubaNote draft: přílohy zahozeného recovery draftu se nepodařilo uklidit.",
        error
      );
    }

    await smazPersistovanyDraftPoznamky(
      draft.draftId
    );
  };

  modal.hidden = false;
}

/*
 * Input/change pokryje psaní, checkboxy a většinu formátovacích akcí.
 * MutationObserver zachytí i programové změny DOM – např. vložení
 * obrázku nebo převod rich textu na TODO.
 */
taskModal?.addEventListener(
  "input",
  () => naplanujUlozeniDraftu()
);

taskModal?.addEventListener(
  "change",
  () => naplanujUlozeniDraftu(500)
);

taskModal?.addEventListener(
  "click",
  () => naplanujUlozeniDraftu(700)
);

if (taskModal && window.MutationObserver) {
  const draftObserver = new MutationObserver(
    () => naplanujUlozeniDraftu()
  );

  draftObserver.observe(taskModal, {
    subtree: true,
    childList: true,
    characterData: true
  });
}

/*
 * Při odchodu aplikace do backgroundu se pokusíme uložit okamžitě.
 * Průběžný debounce už zpravidla drží čerstvou kopii; toto je poslední
 * pojistka pro Android WebView / mobilní prohlížeč.
 */
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(draftUlozeniTimer);
      draftUlozeniTimer = null;
      void ulozPersistovanyDraftPoznamky();
    }
  }
);

window.addEventListener(
  "pagehide",
  () => {
    clearTimeout(draftUlozeniTimer);
    draftUlozeniTimer = null;
    void ulozPersistovanyDraftPoznamky();
  }
);

/*
 * Po startu dáme auth/offline-first vrstvě krátký čas obnovit účet.
 * Owner ID je navíc svázané s lokálními daty účtu, takže draft jiného
 * uživatele se nenabídne.
 */
window.addEventListener("load", () => {
  setTimeout(() => {
    void nabidniObnovuDraftuPokudExistuje();
  }, 1200);
});

window.LubaNoteDraftRecovery = {
  ulozTed: ulozPersistovanyDraftPoznamky,
  nacti: nactiPersistovanyDraftPoznamky,
  smaz: smazPersistovanyDraftPoznamky,
  nabidniObnovu:
    nabidniObnovuDraftuPokudExistuje
};
