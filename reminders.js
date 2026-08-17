/* ==================================================
   LUBANOTE – PŘIPOMÍNKY
   - systémová Android upozornění
   - přehled aktivních i prošlých připomínek
   - naplánované položky z Planneru
   - filtry pracovní / soukromé
   - rychlé odložení, změna času, dokončení
================================================== */

async function requestNotificationPermission() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.requestPermissions();
  await createReminderChannel();
}


async function createReminderChannel() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.createChannel({
    id: "reminders",
    name: "Připomínky LubaNote",
    description: "Upozornění na naplánované poznámky a úkoly",
    importance: 5,
    visibility: 1,
    vibration: true
  });
}


function createUniqueNotificationId() {
  const usedIds = new Set();

  if (typeof loadTask === "function") {
    loadTask().forEach((task) => {
      if (Number.isInteger(task?.notificationId)) {
        usedIds.add(task.notificationId);
      }
    });
  }

  if (typeof loadPlannedItems === "function") {
    loadPlannedItems().forEach((item) => {
      if (Number.isInteger(item?.notificationId)) {
        usedIds.add(item.notificationId);
      }
    });
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);

    const candidate =
      (values[0] % 2147483646) + 1;

    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }

  return (Date.now() % 2147483646) + 1;
}


async function scheduleNotification(
  notificationId,
  title,
  dateTime,
  noteText = "",
  extra = {}
) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  const cleanText =
    String(noteText || "")
      .replace(/\s+/g, " ")
      .trim();

  const shortText =
    cleanText.length > 140
      ? `${cleanText.slice(0, 140)}…`
      : cleanText;

  await LocalNotifications.schedule({
    notifications: [
      {
        title: title || "LubaNote",

        body:
          shortText ||
          "Máš naplánovanou připomínku.",

        largeBody:
          cleanText ||
          "Máš naplánovanou připomínku.",

        id: notificationId,
        channelId: "reminders",
        extra,

        schedule: {
          at: new Date(dateTime)
        }
      }
    ]
  });
}




function getBezpecnyObsahNotifikacePoznamky(
  note,
  title,
  body
) {
  /*
   * Tajná poznámka NESMÍ vytvořit systémovou notifikaci vůbec.
   * Nevracíme proto ani generický text, který by prozradil existenci
   * tajného obsahu mimo odemčený Secret režim.
   */
  if (note?.isSecret === true) {
    return null;
  }

  return {
    title,
    body
  };
}

async function obnovNotifikacePoznamkyPodleSoukromi(note) {
  if (!note?.id) {
    return;
  }

  /*
   * Nejdřív bezpodmínečně zrušíme starou notifikaci poznámky.
   * To je důležité při změně běžné poznámky na tajnou.
   */
  if (note.notificationId) {
    await cancelNotification(note.notificationId);
  }

  const plannedItems = Array.isArray(note.plannedItems)
    ? note.plannedItems
    : [];

  /* Zrušíme také všechny systémové notifikace Planner položek. */
  for (const item of plannedItems) {
    if (item?.notificationId) {
      await cancelNotification(item.notificationId);
    }
  }

  /*
   * SECRET = absolutní ticho. Po zrušení starých notifikací už
   * pro tajnou poznámku nic nového neplánujeme.
   */
  if (note.isSecret === true) {
    return;
  }

  if (
    note.notificationId &&
    note.reminder === true &&
    note.date &&
    new Date(note.date) > new Date()
  ) {
    await scheduleNotification(
      note.notificationId,
      note.title,
      note.date,
      note.note,
      {
        lubanoteType: "note",
        taskId: note.id
      }
    );
  }

  for (const item of plannedItems) {
    if (
      !item?.notificationId ||
      item.completed === true ||
      !item.plannedAt ||
      new Date(item.plannedAt) <= new Date()
    ) {
      continue;
    }

    await scheduleNotification(
      item.notificationId,
      item.text || "Naplánovaný úkol",
      item.plannedAt,
      note.title
        ? `Z poznámky: ${note.title}`
        : item.text,
      {
        lubanoteType: "planned",
        plannedItemId: item.id,
        sourceNoteId: note.id
      }
    );
  }
}

/*
 * Bezpečnostní úklid po odemknutí / aktualizaci aplikace.
 * Zruší i případné staré generické "tajné" notifikace naplánované
 * před zavedením pravidla SECRET = absolutní ticho.
 */
async function zrusSystemoveNotifikaceTajnychPoznamek() {
  if (typeof loadTask !== "function") {
    return;
  }

  const tajnePoznamky = loadTask().filter(
    (note) => note?.isSecret === true
  );

  for (const note of tajnePoznamky) {
    await obnovNotifikacePoznamkyPodleSoukromi(note);
  }
}

async function cancelNotification(notificationId) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications || !notificationId) {
    return;
  }

  await LocalNotifications.cancel({
    notifications: [
      {
        id: notificationId
      }
    ]
  });
}


function updateReminderButton(enabled) {
  const button =
    document.getElementById("reminderButton");

  if (!button) {
    return;
  }

  button.hidden = !enabled;
  button.classList.toggle("active", enabled);
}



function zapniPripominkuPoZmeneTerminu() {
  if (typeof secretTaskEnabled !== "undefined" && secretTaskEnabled) {
    reminderEnabled = false;
    updateReminderButton(false);
    return;
  }

  const modalDate =
    document.getElementById("modalDate");

  const modalTime =
    document.getElementById("modalTime");

  if (!modalDate?.value || !modalTime?.value) {
    return;
  }

  reminderEnabled = true;
  updateReminderButton(true);
  requestNotificationPermission();
}


const editorReminderButton =
  document.getElementById("reminderButton");

editorReminderButton?.addEventListener("click", () => {
  if (typeof secretTaskEnabled !== "undefined" && secretTaskEnabled) {
    reminderEnabled = false;
    updateReminderButton(false);

    zobrazZpravuAplikace(
      "Tajná poznámka",
      "Tajná poznámka nepoužívá systémová upozornění."
    );

    return;
  }

  const modalDate =
    document.getElementById("modalDate");

  const modalTime =
    document.getElementById("modalTime");

  if (!modalDate?.value || !modalTime?.value) {
    zobrazZpravuAplikace(
  "Připomínky",
  "Nejdřív nastav datum a čas upozornění."
);
    return;
  }

  reminderEnabled = !reminderEnabled;

  if (reminderEnabled) {
    requestNotificationPermission();
  }

  updateReminderButton(reminderEnabled);
});


createReminderChannel();


/* ==================================================
   DATA PRO OBRAZOVKU PŘIPOMÍNEK
================================================== */

let activeReminderFilter = "all";
let selectedReminderEntry = null;
let activeReminderStatus = "active";

function getReminderEntries() {
  const notes =
    typeof loadTask === "function"
      ? loadTask()
      : [];

  const noteById = new Map(
    notes
      .filter((note) => note?.id)
      .map((note) => [note.id, note])
  );

  const entries = [];

  /* Klasické připomínky nastavené na celé poznámce. */
  notes.forEach((task) => {
    if (
      task?.reminder !== true ||
      !task?.date
    ) {
      return;
    }

    entries.push({
      kind: "note",
      id: task.id,
      sourceNoteId: task.id,
      sourceType: "note",
      date: task.date,
      title: task.title || "Bez názvu",
      preview: task.note || "",
      area: task.area || "private",
      notificationId: task.notificationId || null
    });
  });

  /* Každá nedokončená položka Planneru je samostatný úkol. */
  const plannedItems =
    typeof loadPlannedItems === "function"
      ? loadPlannedItems()
      : [];

  plannedItems.forEach((item) => {
    if (
      !item?.id ||
      !item?.plannedAt ||
      item.completed === true
    ) {
      return;
    }

    const sourceNote =
      noteById.get(item.sourceNoteId) || null;
      if (!sourceNote) {
  return;
}

    entries.push({
      kind: "planned",
      id: item.id,
      sourceNoteId: item.sourceNoteId || null,
      sourceType: item.sourceType || "note",
      date: item.plannedAt,
      title: item.text || "Naplánovaný úkol",
      preview:
        sourceNote?.title
          ? `Z poznámky: ${sourceNote.title}`
          : "",
      area: sourceNote?.area || "private",
      notificationId: item.notificationId || null
    });
  });

  return entries
    .filter((entry) => {
      if (activeReminderFilter === "all") {
        return true;
      }

      return entry.area === activeReminderFilter;
    })
    .sort((a, b) => {
      return new Date(a.date) -
        new Date(b.date);
    });
}


/* Starý název ponecháváme jako kompatibilní wrapper. */
function getActiveReminders() {
  return getReminderEntries();
}


function getReminderEntry(kind, id) {
  const previousFilter = activeReminderFilter;
  activeReminderFilter = "all";

  const entry = getReminderEntries().find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.id === id
  ) || null;

  activeReminderFilter = previousFilter;
  return entry;
}


function getReminderEntryByNotificationId(notificationId) {
  if (!notificationId) {
    return null;
  }

  const previousFilter = activeReminderFilter;
  activeReminderFilter = "all";

  const entry = getReminderEntries().find(
    (candidate) =>
      candidate.notificationId === notificationId
  ) || null;

  activeReminderFilter = previousFilter;
  return entry;
}


function formatReminderLocalDateTime(date) {
  const year = date.getFullYear();
  const month =
    String(date.getMonth() + 1).padStart(2, "0");
  const day =
    String(date.getDate()).padStart(2, "0");
  const hours =
    String(date.getHours()).padStart(2, "0");
  const minutes =
    String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}


function getReminderTaskById(taskId) {
  return loadTask().find(
    (task) => task.id === taskId
  ) || null;
}


function getPlannedItemById(itemId) {
  if (typeof loadPlannedItems !== "function") {
    return null;
  }

  return loadPlannedItems().find(
    (item) => item.id === itemId
  ) || null;
}


/* ==================================================
   KLIK NA SYSTÉMOVOU ANDROID NOTIFIKACI
================================================== */

function openReminderCenterEntry(entry) {
  if (!entry) {
    return false;
  }

  const remindersButton =
    document.getElementById("remindersModuleButton");

  if (!remindersButton) {
    return false;
  }

  remindersButton.click();

  const remindersScreen =
    document.getElementById("remindersScreen");

  /* Při studeném startu může událost z Androidu dorazit dřív,
     než navigation.js připojí click listener. V tom případě
     vrátíme false a handleNotificationOpen() pokus zopakuje. */
  if (remindersScreen?.hidden) {
    return false;
  }

  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }

  openReminderQuickMenu(entry);
  return true;
}


function handleNotificationOpen(notification) {
  if (!notification) {
    return;
  }

  const extra =
    notification.extra ||
    notification.data ||
    {};

  const notificationId =
    Number(notification.id) || null;

  let attempts = 0;

  const tryOpen = () => {
    let entry = null;

    if (
      extra.lubanoteType === "planned" &&
      extra.plannedItemId
    ) {
      entry = getReminderEntry(
        "planned",
        extra.plannedItemId
      );
    }

    if (
      !entry &&
      extra.lubanoteType === "note" &&
      extra.taskId
    ) {
      entry = getReminderEntry(
        "note",
        extra.taskId
      );
    }

    /* Zpětná kompatibilita se starými naplánovanými notifikacemi,
       které ještě neměly extra data. */
    if (!entry && notificationId) {
      entry =
        getReminderEntryByNotificationId(
          notificationId
        );
    }

    if (entry && openReminderCenterEntry(entry)) {
      return;
    }

    attempts += 1;

    if (attempts < 12) {
      setTimeout(tryOpen, 150);
    }
  };

  setTimeout(tryOpen, 100);
}


function registerNotificationOpenHandler() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (notificationAction) => {
      handleNotificationOpen(
        notificationAction?.notification
      );
    }
  );
}


registerNotificationOpenHandler();


/* ==================================================
   DOPLNĚNÍ NOTIFIKACÍ PRO STARŠÍ PLANNER POLOŽKY
================================================== */

async function ensureFuturePlannedNotifications() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (
    !LocalNotifications ||
    typeof loadPlannedItems !== "function" ||
    typeof loadTask !== "function"
  ) {
    return;
  }

  try {
    const permission =
      await LocalNotifications.checkPermissions();

    if (permission?.display !== "granted") {
      return;
    }

    const pendingResult =
      await LocalNotifications.getPending();

    const pendingIds = new Set(
      (pendingResult?.notifications || [])
        .map((notification) => notification.id)
    );

    const items = loadPlannedItems();
    const tasks = loadTask();
    const changedNoteIds = new Set();
    let plannedItemsChanged = false;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (
        !item?.id ||
        !item?.plannedAt ||
        item.completed === true ||
        new Date(item.plannedAt) <= new Date()
      ) {
        continue;
      }

      let currentItem = item;

      if (!currentItem.notificationId) {
        currentItem = {
          ...currentItem,
          notificationId: createUniqueNotificationId()
        };

        items[index] = currentItem;
        plannedItemsChanged = true;

        const noteIndex = tasks.findIndex(
          (task) => task.id === currentItem.sourceNoteId
        );

        if (noteIndex !== -1) {
          const sourceNote = tasks[noteIndex];
          sourceNote.plannedItems = Array.isArray(sourceNote.plannedItems)
            ? sourceNote.plannedItems.map(
                (candidate) =>
                  candidate.id === currentItem.id
                    ? currentItem
                    : candidate
              )
            : [];

          if (!sourceNote.plannedItems.some(
            (candidate) => candidate.id === currentItem.id
          )) {
            sourceNote.plannedItems.push(currentItem);
          }

          sourceNote.updatedAt = new Date().toISOString();
          changedNoteIds.add(sourceNote.id);
        }
      }

      if (pendingIds.has(currentItem.notificationId)) {
        continue;
      }

      const sourceNote = tasks.find(
        (task) => task.id === currentItem.sourceNoteId
      );

      /*
       * Bez zdrojové poznámky nic neplánujeme. Tajná poznámka může
       * být při zamknutém režimu z loadTask() záměrně nepřítomná.
       */
      if (!sourceNote || sourceNote.isSecret === true) {
        if (pendingIds.has(currentItem.notificationId)) {
          await cancelNotification(currentItem.notificationId);
        }
        continue;
      }

      await scheduleNotification(
        currentItem.notificationId,
        currentItem.text || "Naplánovaný úkol",
        currentItem.plannedAt,
        sourceNote.title
          ? `Z poznámky: ${sourceNote.title}`
          : currentItem.text,
        {
          lubanoteType: "planned",
          plannedItemId: currentItem.id,
          sourceNoteId: currentItem.sourceNoteId
        }
      );
    }

    if (plannedItemsChanged) {
      savePlannedItems(items);
      saveAllTasks(tasks);

      if (typeof uploadLocalNoteToSupabase === "function") {
        for (const noteId of changedNoteIds) {
          const note = tasks.find(
            (candidate) => candidate.id === noteId
          );

          if (note) {
            await uploadLocalNoteToSupabase(note);
          }
        }
      }
    }
  } catch (error) {
    console.error(
      "Planned notification migration error:",
      error
    );
  }
}


window.addEventListener("load", () => {
  setTimeout(
    ensureFuturePlannedNotifications,
    300
  );
});


/* ==================================================
   RYCHLÉ ODLOŽENÍ / ZMĚNA ČASU
================================================== */

const reminderQuickMenu =
  document.getElementById("reminderQuickMenu");

const reminderQuickTitle =
  document.getElementById("reminderQuickTitle");

const reminderQuickLabel =
  document.getElementById("reminderQuickLabel");

const reminderQuickDate =
  document.getElementById("reminderQuickDate");

const reminderQuickTime =
  document.getElementById("reminderQuickTime");

const reminderQuickDateButton =
  document.getElementById("reminderQuickDateButton");

const reminderQuickDateLabel =
  document.getElementById("reminderQuickDateLabel");

const reminderQuickTimeButton =
  document.getElementById("reminderQuickTimeButton");

const reminderQuickTimeLabel =
  document.getElementById("reminderQuickTimeLabel");

function aktualizujPopiskyRychlehoTerminu() {
  if (reminderQuickDateLabel) {
    if (reminderQuickDate?.value) {
      const [rok, mesic, den] =
        reminderQuickDate.value.split("-");

      reminderQuickDateLabel.textContent =
        `${den}.${mesic}.${rok}`;
    } else {
      reminderQuickDateLabel.textContent = "Datum";
    }
  }

  if (reminderQuickTimeLabel) {
    reminderQuickTimeLabel.textContent =
      reminderQuickTime?.value || "Čas";
  }
}

reminderQuickDateButton?.addEventListener(
  "click",
  () => {
    if (
      typeof window.otevriVlastniVyberData !==
      "function"
    ) {
      return;
    }

    window.otevriVlastniVyberData({
      input: reminderQuickDate,
      label: reminderQuickDateLabel
    });
  }
);

reminderQuickTimeButton?.addEventListener(
  "click",
  () => {
    if (
      typeof window.otevriVlastniVyberCasu !==
      "function"
    ) {
      return;
    }

    window.otevriVlastniVyberCasu({
      input: reminderQuickTime,
      label: reminderQuickTimeLabel
    });
  }
);

const completeReminderButton =
  document.getElementById("completeReminderButton");

const disableReminderButton =
  document.getElementById("disableReminderButton");


function closeReminderQuickMenu() {
  if (!reminderQuickMenu) {
    return;
  }

  reminderQuickMenu.hidden = true;
  selectedReminderEntry = null;
}


function openReminderQuickMenu(entry) {
  if (!reminderQuickMenu || !entry) {
    return;
  }

  selectedReminderEntry = {
    kind: entry.kind,
    id: entry.id
  };

  if (reminderQuickLabel) {
    reminderQuickLabel.textContent =
      entry.kind === "planned"
        ? "Naplánovaný úkol"
        : "Připomínka";
  }

  if (reminderQuickTitle) {
    reminderQuickTitle.textContent =
      entry.title || "Bez názvu";
  }

  const date = new Date(entry.date);

  if (reminderQuickDate) {
    reminderQuickDate.value =
      formatReminderLocalDateTime(date)
        .slice(0, 10);
  }

  if (reminderQuickTime) {
    reminderQuickTime.value =
      formatReminderLocalDateTime(date)
        .slice(11, 16);
  }

  aktualizujPopiskyRychlehoTerminu();

  if (completeReminderButton) {
    completeReminderButton.hidden =
      entry.kind !== "planned";
  }

  if (disableReminderButton) {
    disableReminderButton.textContent =
      entry.kind === "planned"
        ? "🗑️ Odstranit z plánu"
        : "🔕 Vypnout připomínku";
  }
const rychleOdlozeni =
  JSON.parse(
    localStorage.getItem("rychleOdlozeni")
  ) || {
    volba1: "15",
    volba2: "30",
    volba3: "60",
    volba4: "tomorrow"
  };

const formatOdlozeni = (hodnota) => {
  if (hodnota === "tomorrow") {
    return "Zítra 8:00";
  }

  const minuty = Number(hodnota);

  if (minuty === 60) {
    return "+ 1 hod";
  }

  if (minuty === 120) {
    return "+ 2 hod";
  }

  if (minuty === 180) {
    return "+ 3 hod";
  }

  return `+ ${minuty} min`;
};

const tlacitkaOdlozeni =
  document.querySelectorAll(
    "[data-reminder-delay]"
  );

const hodnotyOdlozeni = [
  rychleOdlozeni.volba1,
  rychleOdlozeni.volba2,
  rychleOdlozeni.volba3
];

tlacitkaOdlozeni.forEach(
  (tlacitko, index) => {
    const hodnota =
      hodnotyOdlozeni[index];

    if (!hodnota) {
      return;
    }

    tlacitko.dataset.reminderDelay =
      hodnota;

    tlacitko.textContent =
      formatOdlozeni(hodnota);
  }
);

const zitraTlacitko =
  document.getElementById(
    "reminderTomorrowMorningButton"
  );

if (zitraTlacitko) {
  zitraTlacitko.textContent =
    formatOdlozeni(
      rychleOdlozeni.volba4
    );
}
  reminderQuickMenu.hidden = false;
}


function getSelectedReminderEntry() {
  if (!selectedReminderEntry) {
    return null;
  }

  return getReminderEntry(
    selectedReminderEntry.kind,
    selectedReminderEntry.id
  );
}


async function saveReminderDate(taskId, newDate) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === taskId
  );

  if (index === -1) {
    return;
  }

  const currentTask = tasks[index];

  if (!currentTask.notificationId) {
    currentTask.notificationId =
      createUniqueNotificationId();
  }

  await cancelNotification(
    currentTask.notificationId
  );

  const updatedTask = {
    ...currentTask,
    date: formatReminderLocalDateTime(newDate),
    reminder: true,
    updatedAt: new Date().toISOString()
  };

  updateTask(index, updatedTask);

  if (updatedTask.isSecret !== true) {
    await scheduleNotification(
      updatedTask.notificationId,
      updatedTask.title,
      updatedTask.date,
      updatedTask.note,
      {
        lubanoteType: "note",
        taskId: updatedTask.id
      }
    );
  }

  if (
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    await uploadLocalNoteToSupabase(updatedTask);
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function savePlannedReminderDate(itemId, newDate) {
  const item = getPlannedItemById(itemId);

  if (!item) {
    return;
  }

  const updatedItem = {
    ...item,
    plannedAt: formatReminderLocalDateTime(newDate),
    notificationId:
      item.notificationId ||
      createUniqueNotificationId()
  };

  if (item.notificationId) {
    await cancelNotification(item.notificationId);
  }

  const mergedItems = loadPlannedItems().map(
    (candidate) =>
      candidate.id === itemId
        ? updatedItem
        : candidate
  );

  savePlannedItems(mergedItems);

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === updatedItem.sourceNoteId
  );

  let sourceNote = null;

  if (noteIndex !== -1) {
    sourceNote = tasks[noteIndex];
    sourceNote.plannedItems = Array.isArray(sourceNote.plannedItems)
      ? sourceNote.plannedItems.map(
          (candidate) =>
            candidate.id === itemId
              ? updatedItem
              : candidate
        )
      : [];

    if (!sourceNote.plannedItems.some(
      (candidate) => candidate.id === itemId
    )) {
      sourceNote.plannedItems.push(updatedItem);
    }

    sourceNote.updatedAt = new Date().toISOString();
    saveAllTasks(tasks);

    if (
      typeof uploadLocalNoteToSupabase === "function"
    ) {
      await uploadLocalNoteToSupabase(sourceNote);
    }
  }

  if (sourceNote && sourceNote.isSecret !== true) {
    await scheduleNotification(
      updatedItem.notificationId,
      updatedItem.text || "Naplánovaný úkol",
      updatedItem.plannedAt,
      sourceNote.title
        ? `Z poznámky: ${sourceNote.title}`
        : updatedItem.text,
      {
        lubanoteType: "planned",
        plannedItemId: updatedItem.id,
        sourceNoteId: updatedItem.sourceNoteId
      }
    );
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function postponeReminder(minutes) {
  const entry = getSelectedReminderEntry();

  if (!entry) {
    return;
  }

  const originalDate = new Date(entry.date);
  const now = new Date();

  /* U prošlé připomínky znamená +15 min patnáct minut od teď,
     ne od jejího starého času. */
  const baseDate =
    originalDate > now
      ? originalDate
      : now;

  const newDate = new Date(baseDate);

  newDate.setMinutes(
    newDate.getMinutes() + minutes
  );

  if (entry.kind === "planned") {
    await savePlannedReminderDate(
      entry.id,
      newDate
    );
  } else {
    await saveReminderDate(
      entry.id,
      newDate
    );
  }
}


async function postponeReminderToTomorrowMorning() {
  const rychleOdlozeni =
    JSON.parse(
      localStorage.getItem("rychleOdlozeni")
    ) || {
      volba4: "tomorrow"
    };
  
  const ctvrtaVolba =
    rychleOdlozeni.volba4 || "tomorrow";
  
  if (ctvrtaVolba !== "tomorrow") {
    const minuty = Number(ctvrtaVolba);
    
    if (Number.isFinite(minuty)) {
      await postponeReminder(minuty);
    }
    
    return;
  }
  
  const entry = getSelectedReminderEntry();
  
  if (!entry) {
    return;
  }
  
  const tomorrow = new Date();
  
  tomorrow.setDate(
    tomorrow.getDate() + 1
  );
  
  tomorrow.setHours(8, 0, 0, 0);
  
  if (entry.kind === "planned") {
    await savePlannedReminderDate(
      entry.id,
      tomorrow
    );
  } else {
    await saveReminderDate(
      entry.id,
      tomorrow
    );
  }
}


async function saveCustomReminderDate() {
  const entry = getSelectedReminderEntry();

  if (
    !entry ||
    !reminderQuickDate?.value ||
    !reminderQuickTime?.value
  ) {
    return;
  }

  const newDate = new Date(
    `${reminderQuickDate.value}T${reminderQuickTime.value}`
  );

  if (Number.isNaN(newDate.getTime())) {
    return;
  }

  if (newDate <= new Date()) {
    zobrazZpravuAplikace(
  "Připomínky",
  "Připomínka musí být nastavena do budoucna."
);
    return;
  }

  if (entry.kind === "planned") {
    await savePlannedReminderDate(
      entry.id,
      newDate
    );
  } else {
    await saveReminderDate(
      entry.id,
      newDate
    );
  }
}


async function disableSelectedNoteReminder(entry) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === entry.id
  );

  if (index === -1) {
    return;
  }

  const currentTask = tasks[index];

  await cancelNotification(
    currentTask.notificationId
  );

  const updatedTask = {
    ...currentTask,
    reminder: false,
    updatedAt: new Date().toISOString()
  };

  updateTask(index, updatedTask);

  if (
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    await uploadLocalNoteToSupabase(updatedTask);
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }
}


function updatePlannedLinkHtml(
  sourceNote,
  plannedItemId,
  action
) {
  if (!sourceNote?.richContent) {
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = sourceNote.richContent;

  const link = template.content.querySelector(
    `[data-planned-item-id="${plannedItemId}"]`
  );

  if (!link) {
    return;
  }

  if (action === "complete") {
    link.classList.add("plannedTextLinkCompleted");
  }

  if (action === "remove") {
    const parent = link.parentNode;

    if (parent) {
      while (link.firstChild) {
        parent.insertBefore(link.firstChild, link);
      }

      link.remove();
      parent.normalize();
    }
  }

  sourceNote.richContent = template.innerHTML;
}


async function completeSelectedPlannedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry || entry.kind !== "planned") {
    return;
  }

  const item = getPlannedItemById(entry.id);

  if (!item) {
    return;
  }

  const completedItem = {
    ...item,
    completed: true,
    completedAt: new Date().toISOString()
  };

  await cancelNotification(item.notificationId);

  savePlannedItems(
    loadPlannedItems().map(
      (candidate) =>
        candidate.id === item.id
          ? completedItem
          : candidate
    )
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === item.sourceNoteId
  );

  if (noteIndex !== -1) {
    const sourceNote = tasks[noteIndex];

    sourceNote.plannedItems = Array.isArray(sourceNote.plannedItems)
      ? sourceNote.plannedItems.map(
          (candidate) =>
            candidate.id === item.id
              ? completedItem
              : candidate
        )
      : [];

    if (!sourceNote.plannedItems.some(
      (candidate) => candidate.id === item.id
    )) {
      sourceNote.plannedItems.push(completedItem);
    }

    if (item.sourceType === "selection") {
      updatePlannedLinkHtml(
        sourceNote,
        item.id,
        "complete"
      );
    }

    sourceNote.updatedAt = new Date().toISOString();
    saveAllTasks(tasks);

    if (
      typeof uploadLocalNoteToSupabase === "function"
    ) {
      await uploadLocalNoteToSupabase(sourceNote);
    }

    /* Pokud je právě otevřená stejná poznámka, promítneme změnu i do DOM. */
    if (
      typeof activeTaskIndex !== "undefined" &&
      activeTaskIndex === noteIndex &&
      typeof modalRichText !== "undefined"
    ) {
      modalRichText
        .querySelector(
          `[data-planned-item-id="${item.id}"]`
        )
        ?.classList.add("plannedTextLinkCompleted");
    }
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function removeSelectedPlannedReminder(entry) {
  const item = getPlannedItemById(entry.id);

  if (!item) {
    return;
  }

  await cancelNotification(item.notificationId);

  savePlannedItems(
    loadPlannedItems().filter(
      (candidate) => candidate.id !== item.id
    )
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === item.sourceNoteId
  );

  if (noteIndex !== -1) {
    const sourceNote = tasks[noteIndex];

    sourceNote.plannedItems = Array.isArray(sourceNote.plannedItems)
      ? sourceNote.plannedItems.filter(
          (candidate) => candidate.id !== item.id
        )
      : [];

    if (item.sourceType === "selection") {
      updatePlannedLinkHtml(
        sourceNote,
        item.id,
        "remove"
      );
    }

    sourceNote.updatedAt = new Date().toISOString();
    saveAllTasks(tasks);

    if (
      typeof uploadLocalNoteToSupabase === "function"
    ) {
      await uploadLocalNoteToSupabase(sourceNote);
    }
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }
}


async function disableSelectedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry) {
    return;
  }

  if (entry.kind === "planned") {
    await removeSelectedPlannedReminder(entry);
  } else {
    await disableSelectedNoteReminder(entry);
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


function openPlannedSourceInEditor(itemId) {
  const item = getPlannedItemById(itemId);

  if (!item?.sourceNoteId) {
    return;
  }

  if (typeof openTaskEditorById !== "function") {
    return;
  }

  openTaskEditorById(item.sourceNoteId);

  if (item.sourceType !== "selection") {
    return;
  }

  setTimeout(() => {
    const plannedLink =
      modalRichText?.querySelector(
        `[data-planned-item-id="${item.id}"]`
      );

    if (!plannedLink) {
      return;
    }

    const editorRect =
      modalRichText.getBoundingClientRect();

    const linkRect =
      plannedLink.getBoundingClientRect();

    const targetTop =
      modalRichText.scrollTop +
      (linkRect.top - editorRect.top) -
      (modalRichText.clientHeight / 2) +
      (linkRect.height / 2);

    modalRichText.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
  }, 150);
}


/* ==================================================
   VYKRESLENÍ OBRAZOVKY PŘIPOMÍNEK
================================================== */

function createReminderRow(
  entry,
  showDate = false,
  overdue = false
) {
  const item =
    document.createElement("div");

  item.className = "reminderItem";
  item.dataset.reminderKind = entry.kind;
  item.dataset.reminderId = entry.id;

  if (overdue) {
    item.classList.add("overdue");
  }

  if (entry.kind === "planned") {
    item.classList.add("plannedReminderItem");
  }

  const date = new Date(entry.date);

  const time =
    document.createElement("div");

  time.className = "reminderItemTime";

  if (showDate) {
    const dateLine =
      document.createElement("span");

    dateLine.className =
      "reminderItemDateLine";

    dateLine.textContent =
      date.toLocaleDateString(
        "cs-CZ",
        {
          weekday: "short",
          day: "numeric",
          month: "numeric"
        }
      );

    time.append(dateLine);
  }

  const timeLine =
    document.createElement("span");

  timeLine.textContent =
    date.toLocaleTimeString(
      "cs-CZ",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  time.append(timeLine);

  const content =
    document.createElement("div");

  content.className =
    "reminderItemContent";

  const title =
    document.createElement("div");

  title.className =
    "reminderItemTitle";

  const icon =
    document.createElement("span");

  icon.className =
    "reminderItemArea";

  icon.textContent =
    entry.area === "work" ? "💼" : "🏠";

  const titleText =
    document.createElement("span");

  titleText.textContent =
    entry.title || "Bez názvu";

  title.append(icon, titleText);
  content.append(title);

  const preview =
    String(entry.preview || "")
      .replace(/\s+/g, " ")
      .trim();

  if (preview) {
    const previewElement =
      document.createElement("div");

    previewElement.className =
      "reminderItemPreview";

    previewElement.textContent = preview;
    content.append(previewElement);
  }

  const menuButton =
    document.createElement("button");

  menuButton.type = "button";
  menuButton.className =
    "reminderItemMenu";
  menuButton.setAttribute(
    "aria-label",
    `Upravit ${entry.title || "připomínku"}`
  );
  menuButton.textContent = "⋮";

  menuButton.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      openReminderQuickMenu(entry);
    }
  );

  item.addEventListener("click", () => {
    if (entry.kind === "planned") {
      openPlannedSourceInEditor(entry.id);
      return;
    }

    if (
      typeof openTaskEditorById === "function"
    ) {
      openTaskEditorById(entry.id);
    }
  });

  item.append(
    time,
    content,
    menuButton
  );

  return item;
}


function renderRemindersScreen() {
  const overdueList =
    document.getElementById("remindersOverdue");
  
  const todayList =
    document.getElementById("remindersToday");
  
  const tomorrowList =
    document.getElementById("remindersTomorrow");
  
  const laterList =
    document.getElementById("remindersLater");
  
  const overdueGroup =
    document.querySelector(".remindersOverdueGroup");
  
  const todayGroup =
    todayList?.closest(".remindersGroup");
  
  const tomorrowGroup =
    tomorrowList?.closest(".remindersGroup");
  
  const laterGroup =
    laterList?.closest(".remindersGroup");
  
  const overdueReminderCount =
    document.getElementById("overdueReminderCount");
  
  if (
    !overdueList ||
    !todayList ||
    !tomorrowList ||
    !laterList
  ) {
    return;
  }
  
  overdueList.innerHTML = "";
  todayList.innerHTML = "";
  tomorrowList.innerHTML = "";
  laterList.innerHTML = "";
  
  const reminders =
    getReminderEntries();
  
  const now = new Date();
  
  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
  
  const tomorrowStart =
    new Date(todayStart);
  
  tomorrowStart.setDate(
    tomorrowStart.getDate() + 1
  );
  
  const dayAfterTomorrow =
    new Date(todayStart);
  
  dayAfterTomorrow.setDate(
    dayAfterTomorrow.getDate() + 2
  );
  
  reminders.forEach((entry) => {
    const date = new Date(entry.date);
    
    if (date < now) {
      overdueList.append(
        createReminderRow(entry, true, true)
      );
      return;
    }
    
    if (
      date >= todayStart &&
      date < tomorrowStart
    ) {
      todayList.append(
        createReminderRow(entry)
      );
      return;
    }
    
    if (
      date >= tomorrowStart &&
      date < dayAfterTomorrow
    ) {
      tomorrowList.append(
        createReminderRow(entry)
      );
      return;
    }
    
    laterList.append(
      createReminderRow(entry, true)
    );
  });
  
  const overdueCount =
    overdueList.children.length;
  
  if (overdueReminderCount) {
    overdueReminderCount.textContent =
      overdueCount ? `(${overdueCount})` : "";
  }
  
  if (!todayList.children.length) {
    todayList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }
  
  if (!tomorrowList.children.length) {
    tomorrowList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }
  
  if (!laterList.children.length) {
    laterList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }
  
  if (!overdueList.children.length) {
    overdueList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky po termínu.</p>`;
  }
  
  if (activeReminderStatus === "overdue") {
    if (overdueGroup) {
      overdueGroup.hidden = false;
    }
    
    if (todayGroup) {
      todayGroup.hidden = true;
    }
    
    if (tomorrowGroup) {
      tomorrowGroup.hidden = true;
    }
    
    if (laterGroup) {
      laterGroup.hidden = true;
    }
  } else {
    if (overdueGroup) {
      overdueGroup.hidden = true;
    }
    
    if (todayGroup) {
      todayGroup.hidden = false;
    }
    
    if (tomorrowGroup) {
      tomorrowGroup.hidden = false;
    }
    
    if (laterGroup) {
      laterGroup.hidden = false;
    }
  }
}
/* ==================================================
   OVLÁDÁNÍ FILTRŮ A RYCHLÉHO MENU
================================================== */

document
  .querySelectorAll(".remindersFilter")
  .forEach((button) => {
    button.addEventListener("click", () => {
      activeReminderFilter =
        button.dataset.reminderFilter || "all";
      
      document
        .querySelectorAll(".remindersFilter")
        .forEach((filterButton) => {
          filterButton.classList.toggle(
            "active",
            filterButton === button
          );
        });
      
      renderRemindersScreen();
    });
  });


document
  .querySelectorAll(".remindersStatusTab")
  .forEach((button) => {
    button.addEventListener("click", () => {
      activeReminderStatus =
        button.dataset.reminderStatus || "active";
      
      document
        .querySelectorAll(".remindersStatusTab")
        .forEach((statusButton) => {
          statusButton.classList.toggle(
            "active",
            statusButton === button
          );
        });
      
      renderRemindersScreen();
    });
  });


document
  .getElementById("closeReminderQuickMenu")
  ?.addEventListener(
    "click",
    closeReminderQuickMenu
  );


reminderQuickMenu?.addEventListener(
  "click",
  (event) => {
    if (event.target === reminderQuickMenu) {
      closeReminderQuickMenu();
    }
  }
);


document
  .querySelectorAll("[data-reminder-delay]")
  .forEach((button) => {
    button.addEventListener("click", async () => {
      const minutes = Number(
        button.dataset.reminderDelay
      );
      
      if (!Number.isFinite(minutes)) {
        return;
      }
      
      const puvodniText = button.textContent;
      
      button.disabled = true;
button.textContent = "✓ Odloženo";
button.classList.add("delaySuccess");

await postponeReminder(minutes);

setTimeout(() => {
  button.classList.remove("delaySuccess");
  button.textContent = puvodniText;
  button.disabled = false;
}, 700);
      
      setTimeout(() => {
        button.textContent = puvodniText;
        button.disabled = false;
      }, 700);
    });
  });
document
  .getElementById("reminderTomorrowMorningButton")
  ?.addEventListener(
    "click",
    async (event) => {
      const button = event.currentTarget;
      const puvodniText = button.textContent;
      
      button.disabled = true;
      button.textContent = "✓ Odloženo";
      button.classList.add("delaySuccess");
      
      await postponeReminderToTomorrowMorning();
      
      setTimeout(() => {
        button.classList.remove("delaySuccess");
        button.textContent = puvodniText;
        button.disabled = false;
      }, 700);
    }
  );

document
  .getElementById("saveReminderQuickDateButton")
  ?.addEventListener(
    "click",
    saveCustomReminderDate
  );


disableReminderButton?.addEventListener(
  "click",
  disableSelectedReminder
);


completeReminderButton?.addEventListener(
  "click",
  completeSelectedPlannedReminder
);


document
  .getElementById("openReminderNoteButton")
  ?.addEventListener("click", () => {
    const entry = getSelectedReminderEntry();
    
    closeReminderQuickMenu();
    
    if (!entry) {
      return;
    }
    
    if (entry.kind === "planned") {
      openPlannedSourceInEditor(entry.id);
      return;
    }
    
    if (
      entry.id &&
      typeof openTaskEditorById === "function"
    ) {
      openTaskEditorById(entry.id);
    }
  
    const overdueCount =
  overdueList.children.length;

if (overdueReminderCount) {
  overdueReminderCount.textContent =
    overdueCount ? `(${overdueCount})` : "";
}

if (activeReminderStatus === "overdue") {
  if (overdueGroup) {
    overdueGroup.hidden = false;
  }

  if (todayGroup) {
    todayGroup.hidden = true;
  }

  if (tomorrowGroup) {
    tomorrowGroup.hidden = true;
  }

  if (laterGroup) {
    laterGroup.hidden = true;
  }
} else {
  if (overdueGroup) {
    overdueGroup.hidden = true;
  }

  if (todayGroup) {
    todayGroup.hidden = false;
  }

  if (tomorrowGroup) {
    tomorrowGroup.hidden = false;
  }

  if (laterGroup) {
    laterGroup.hidden = false;
  }
}
    
  });