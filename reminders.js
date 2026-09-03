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

// ==========================================
// UX STATISTIKY TLAČÍTEK
// Ukládají se pouze lokálně v zařízení.
// Slouží pro pozdější rozhodování o ergonomii.
// ==========================================

const UX_REMINDER_STATS_KEY =
  "lubanoteReminderButtonStats";


function nactiStatistikyTlacitekPripominek() {
  try {
    return JSON.parse(
      localStorage.getItem(
        UX_REMINDER_STATS_KEY
      ) || "{}"
    );
  } catch (error) {
    console.error(
      "Načtení UX statistik se nepodařilo:",
      error
    );

    return {};
  }
}


function zapocitejPouzitiTlacitkaPripominky(
  akce,
  typPolozky
) {
  const statistiky =
    nactiStatistikyTlacitekPripominek();

  const klic =
    `${typPolozky}:${akce}`;

  statistiky[klic] =
    (statistiky[klic] || 0) + 1;

  localStorage.setItem(
    UX_REMINDER_STATS_KEY,
    JSON.stringify(statistiky)
  );
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

function vytvorIdOpakovaneNotifikace(noteId, datumCas) {
  const text = `${noteId}|${datumCas}`;
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 2147483646) + 1;
}


async function zrusCekajiciOpakovaneNotifikacePoznamky(noteId) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (
    !LocalNotifications ||
    !noteId ||
    typeof LocalNotifications.getPending !== "function"
  ) {
    return;
  }

  try {
    const pending =
      await LocalNotifications.getPending();

    const notifications =
      (pending?.notifications || [])
        .filter(
          (notification) =>
            notification?.extra?.taskId === noteId &&
            notification?.extra?.recurring === true
        )
        .map((notification) => ({
          id: notification.id
        }));

    if (notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications
      });
    }
  } catch (error) {
    console.error(
      "Zrušení opakovaných notifikací se nepodařilo:",
      error
    );
  }
}


async function naplanujOpakovaneNotifikacePoznamky(note) {
  if (
    !note?.id ||
    !note.date ||
    note.repeat?.enabled !== true ||
    note.reminder !== true ||
    note.isSecret === true ||
    !window.LubaNoteRecurring
  ) {
    return;
  }

  const terminy =
    window.LubaNoteRecurring
      .vypocitejBudouciTerminy(
        note.date,
        note.repeat,
        32,
        new Date()
      );

  for (let index = 0; index < terminy.length; index++) {
    const termin = terminy[index];
    const notificationId =
      index === 0 && note.notificationId
        ? note.notificationId
        : vytvorIdOpakovaneNotifikace(
            note.id,
            termin.toISOString()
          );

    await scheduleNotification(
      notificationId,
      note.title,
      termin,
      note.note,
      {
        lubanoteType: "note",
        taskId: note.id,
        recurring: true
      }
    );
  }
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

  await zrusCekajiciOpakovaneNotifikacePoznamky(
    note.id
  );

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
    note.repeat?.enabled === true &&
    note.reminder === true &&
    note.date
  ) {
    await naplanujOpakovaneNotifikacePoznamky(
      note
    );
  } else if (
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

async function obnovNotifikaceOpakovanychPoznamek() {
  if (typeof loadTask !== "function") {
    return;
  }

  const opakovanePoznamky =
    loadTask().filter(
      (note) =>
        note?.id &&
        note.isSecret !== true &&
        note.completed !== true &&
        note.reminder === true &&
        note.date &&
        note.repeat?.enabled === true
    );

  for (const note of opakovanePoznamky) {
    await obnovNotifikacePoznamkyPodleSoukromi(
      note
    );
  }
}


async function obnovSystemoveNotifikacePoKompletniObnove(
  poznamky
) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return true;
  }

  const permission =
    await LocalNotifications.checkPermissions();

  if (permission?.display !== "granted") {
    return false;
  }

  await createReminderChannel();

  if (
    typeof LocalNotifications.getPending ===
    "function"
  ) {
    const pending =
      await LocalNotifications.getPending();

    const notifications =
      (pending?.notifications || [])
        .filter(
          (notification) =>
            Number.isInteger(notification?.id)
        )
        .map((notification) => ({
          id: notification.id
        }));

    if (notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications
      });
    }
  }

  const beznePoznamky =
    (Array.isArray(poznamky)
      ? poznamky
      : []
    ).filter(
      (note) =>
        note?.id &&
        note.isSecret !== true &&
        note.completed !== true
    );

  for (const note of beznePoznamky) {
    await obnovNotifikacePoznamkyPodleSoukromi(
      note
    );
  }

  return true;
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

  /* Zrušíme případný budoucí alarm. */
  try {
    await LocalNotifications.cancel({
      notifications: [
        {
          id: notificationId
        }
      ]
    });
  } catch (error) {
    console.error(
      "Zrušení čekající notifikace se nepodařilo:",
      error
    );
  }

  /*
   * cancel() ruší jen čekající notifikace. Pokud už notifikace jednou
   * zazvonila, může stále existovat mezi doručenými. Tu odstraníme také,
   * aby bylo možné připomínku bezpečně naplánovat znovu.
   */
  try {
    if (
      typeof LocalNotifications.getDeliveredNotifications === "function" &&
      typeof LocalNotifications.removeDeliveredNotifications === "function"
    ) {
      const delivered =
        await LocalNotifications.getDeliveredNotifications();

      const matching =
        (delivered?.notifications || []).filter(
          (notification) => notification.id === notificationId
        );

      if (matching.length > 0) {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: matching
        });
      }
    }
  } catch (error) {
    console.error(
      "Odstranění doručené notifikace se nepodařilo:",
      error
    );
  }
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

const REMINDER_OVERDUE_RETENTION_KEY =
  "reminderOverdueRetentionDays";
const REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY =
  "reminderOverdueRetentionConfirmed";

let probihaAutomatickyUklidPoTerminu = false;
let posledniAutomatickyUklidPoTerminu = 0;

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

  /* Připomínky celé poznámky. U opakované poznámky zobrazíme
     vždy jen nejbližší budoucí výskyt – ne desítky kopií. */
  notes.forEach((task) => {
    if (
      task?.reminder !== true ||
      !task?.date ||
      task.isSecret === true ||
      task.completed === true
    ) {
      return;
    }

    let datumPripominky = task.date;

    if (
      task.repeat?.enabled === true &&
      window.LubaNoteRecurring
    ) {
      const pristiTermin =
        window.LubaNoteRecurring
          .vypocitejPristiTermin(
            task.date,
            task.repeat,
            new Date()
          );

      if (!pristiTermin) {
        return;
      }

      datumPripominky =
        formatReminderLocalDateTime(
          pristiTermin
        );
    }

    entries.push({
      kind: "note",
      id: task.id,
      sourceNoteId: task.id,
      sourceType:
        task.repeat?.enabled === true
          ? "recurring-note"
          : "note",
      date: datumPripominky,
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
      sourceTodoId: item.sourceTodoId || null,
      date: item.plannedAt,
      title: item.text || "Naplánovaný úkol",
      preview:
        item.sourceType === "todo"
          ? (sourceNote?.title || "")
          : (sourceNote?.note || ""),
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

  /*
   * Dříve tato technická migrace startovala 300 ms po načtení stránky
   * souběžně s úvodním syncem. Mohla tak změnit updatedAt lokální
   * poznámky ve chvíli, kdy už jiné zařízení mělo v cloudu novější
   * revizi. Výsledkem byla falešná „konfliktní kopie“.
   *
   * Online proto nejdřív vždy počkáme na centrální bezpečný start sync.
   * Teprve nad čerstvým lokálním stavem doplníme chybějící notificationId.
   */
  if (
    navigator.onLine &&
    window.LubaNoteSync?.spustBezpecne
  ) {
    const synchronizovano =
      await window.LubaNoteSync.spustBezpecne();

    if (!synchronizovano) {
      console.warn(
        "Doplnění Planner notifikací bylo odloženo: úvodní sync ještě není bezpečně hotový."
      );
      return;
    }
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

    /*
     * Tento snapshot používáme jen pro text notifikace. Nikdy ho později
     * celý neukládáme zpět – během awaitů by totiž mohl zastarat.
     */
    const tasksProNotifikace = loadTask();

    const polozkySNovymNotificationId = new Map();
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

        polozkySNovymNotificationId.set(
          currentItem.id,
          currentItem
        );
      }

      if (pendingIds.has(currentItem.notificationId)) {
        continue;
      }

      const sourceNote = tasksProNotifikace.find(
        (task) => task.id === currentItem.sourceNoteId
      );

      /*
       * Bez zdrojové poznámky nic neplánujeme. Tajná poznámka může
       * být při zamknutém režimu z loadTask() záměrně nepřítomná.
       */
      if (!sourceNote || sourceNote.isSecret === true) {
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

    if (!plannedItemsChanged) {
      return;
    }

    /*
     * Offline uložíme pouze lokální Planner cache. Do samotných poznámek
     * bez čerstvé serverové revize nesaháme – technická migrace nesmí
     * vytvořit zdánlivou uživatelskou změnu proti novějšímu cloudu.
     */
    if (!navigator.onLine) {
      savePlannedItems(items);
      return;
    }

    const ulozBezpecnouMigraci = async () => {
      savePlannedItems(items);

      /*
       * Načteme ČERSTVÉ poznámky až těsně před zápisem. Pokud uživatel
       * během plánování notifikací něco editoval, jeho změna se tím
       * nepřepíše starým snapshotem.
       */
      const aktualniTasks = loadTask();
      let zmenenaPoznamka = false;
      const casZmeny = new Date().toISOString();

      for (const currentItem of
        polozkySNovymNotificationId.values()) {
        const sourceNote = aktualniTasks.find(
          (task) =>
            task?.id === currentItem.sourceNoteId &&
            task.isSecret !== true
        );

        if (!sourceNote || !Array.isArray(sourceNote.plannedItems)) {
          continue;
        }

        const indexPolozky = sourceNote.plannedItems.findIndex(
          (candidate) => candidate?.id === currentItem.id
        );

        /*
         * Důležité: chybějící položku do moderní synchronizované poznámky
         * NEVRACÍME ze staré lokální cache. Tím se nemůže znovu objevit
         * již smazaný Planner úkol. Doplňujeme pouze notificationId do
         * položky, která v poznámce skutečně stále existuje.
         */
        if (indexPolozky === -1) {
          continue;
        }

        const puvodni = sourceNote.plannedItems[indexPolozky];

        if (
          puvodni?.notificationId ===
          currentItem.notificationId
        ) {
          continue;
        }

        sourceNote.plannedItems[indexPolozky] = {
          ...puvodni,
          notificationId: currentItem.notificationId
        };

        sourceNote.updatedAt = casZmeny;
        zmenenaPoznamka = true;
      }

      if (zmenenaPoznamka) {
        await saveAllTasks(aktualniTasks);
      }

      return true;
    };

    if (
      window.LubaNoteSync
        ?.provedLokalniZmenuASynchronizuj
    ) {
      await window.LubaNoteSync
        .provedLokalniZmenuASynchronizuj(
          ulozBezpecnouMigraci
        );
    } else {
      await ulozBezpecnouMigraci();
    }
  } catch (error) {
    console.error(
      "Planned notification migration error:",
      error
    );
  }
}

let casovacBezpecnehoDoplneniNotifikaci = null;

function naplanujBezpecneDoplneniPlanovanychNotifikaci(
  zpozdeni = 300
) {
  clearTimeout(casovacBezpecnehoDoplneniNotifikaci);

  casovacBezpecnehoDoplneniNotifikaci = setTimeout(
    () => {
      casovacBezpecnehoDoplneniNotifikaci = null;

      ensureFuturePlannedNotifications()
        .catch((error) => {
          console.warn(
            "Doplnění Planner notifikací bylo odloženo:",
            error
          );
        });
    },
    Math.max(0, Number(zpozdeni) || 0)
  );
}

window.addEventListener("load", () => {
  naplanujBezpecneDoplneniPlanovanychNotifikaci(300);
});

/*
 * Pokud první pokus proběhl dřív než obnovení Supabase session,
 * auth-valid ho zopakuje až po připraveném účtu. Po návratu internetu
 * se totéž provede nad čerstvým cloudovým stavem.
 */
window.addEventListener(
  "lubanote:auth-valid",
  () => {
    naplanujBezpecneDoplneniPlanovanychNotifikaci(500);
  }
);

window.addEventListener(
  "online",
  () => {
    naplanujBezpecneDoplneniPlanovanychNotifikaci(700);
  }
);


/* ==================================================
   RYCHLÉ ODLOŽENÍ / ZMĚNA ČASU
================================================== */

const reminderQuickMenu =
  document.getElementById("reminderQuickMenu");

const reminderQuickTitle =
  document.getElementById("reminderQuickTitle");

const reminderQuickLabel =
  document.getElementById("reminderQuickLabel");

const reminderQuickPreview =
  document.getElementById("reminderQuickPreview");

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

const deleteReminderButton =
  document.getElementById("deleteReminderButton");

const disableReminderButton =
  document.getElementById("disableReminderButton");


function closeReminderQuickMenu() {
  if (!reminderQuickMenu) {
    return;
  }

  reminderQuickMenu.hidden = true;
  selectedReminderEntry = null;

  /* Skrytý modal nesmí v DOM držet náhled případné tajné poznámky. */
  if (reminderQuickPreview) {
    reminderQuickPreview.textContent = "";
    reminderQuickPreview.hidden = true;
  }
}


function openReminderQuickMenu(entry) {
  if (!reminderQuickMenu || !entry) {
    return;
  }

  selectedReminderEntry = {
    kind: entry.kind,
    id: entry.id
  };

  const termin = new Date(entry.date);
  const jePoTerminu =
    !Number.isNaN(termin.getTime()) &&
    termin.getTime() < Date.now();

  if (reminderQuickLabel) {
    if (entry.kind === "planned") {
      reminderQuickLabel.textContent =
        jePoTerminu
          ? "NAPLÁNOVANÝ ÚKOL PO TERMÍNU"
          : "AKTIVNÍ NAPLÁNOVANÝ ÚKOL";
    } else {
      reminderQuickLabel.textContent =
        jePoTerminu
          ? "PŘIPOMÍNKA PO TERMÍNU"
          : "AKTIVNÍ PŘIPOMÍNKA";
    }
  }

  if (reminderQuickTitle) {
    reminderQuickTitle.textContent =
      entry.title || "Bez názvu";
  }

  if (reminderQuickPreview) {
    const preview =
      String(entry.preview || "").trim();

    reminderQuickPreview.textContent = preview;
    reminderQuickPreview.hidden = !preview;
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
    completeReminderButton.hidden = false;
  }

  if (disableReminderButton) {
    const jePlan = entry.kind === "planned";
    const popisek = jePlan
      ? "Zrušit plán"
      : "Vypnout připomínku";

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        disableReminderButton,
        jePlan ? "kalendar" : "vypnoutZvonek",
        popisek
      );
    } else {
      disableReminderButton.textContent = popisek;
    }
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

function spustPripominkovouUlohuNaPozadi(
  akce,
  popis = "Úloha připomínky"
) {
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

async function ulozZmenuPripominkyLokalne(
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
    spustPripominkovouUlohuNaPozadi(
      () => uploadLocalNoteToSupabase(
        poznamkaProFallback
      ),
      "Synchronizace připomínky"
    );
  }

  return vysledek;
}

function zobrazPotvrzeniPripominky(text) {
  if (
    typeof zobrazPotvrzeniAkce === "function"
  ) {
    zobrazPotvrzeniAkce(text, 1400);
  }
}


async function saveReminderDate(taskId, newDate) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === taskId
  );

  if (index === -1) {
    return false;
  }

  const currentTask = tasks[index];
  const oldNotificationId =
    currentTask.notificationId || null;

  /*
   * Po již doručené Android notifikaci nepoužíváme znovu stejné ID.
   * Každé přeplánování dostane čerstvé ID.
   */
  const newNotificationId =
    createUniqueNotificationId();

  const noveDatum =
    formatReminderLocalDateTime(newDate);

  const aktualizovaneRepeat =
    currentTask.repeat?.enabled === true
      ? {
          ...currentTask.repeat,
          startDate: noveDatum.slice(0, 10),
          dayOfMonth:
            currentTask.repeat.type === "monthly"
              ? Number(noveDatum.slice(8, 10))
              : currentTask.repeat.dayOfMonth
        }
      : currentTask.repeat || null;

  const updatedTask = {
    ...currentTask,
    date: noveDatum,
    repeat: aktualizovaneRepeat,
    reminder: true,
    notificationId: newNotificationId,
    updatedAt: new Date().toISOString()
  };

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Odkládám připomínku…",
      300
    ) || (() => {});

  try {
    await ulozZmenuPripominkyLokalne(
      () => updateTask(index, updatedTask),
      updatedTask
    );
  } catch (error) {
    ukonciCekani();
    console.error(
      "Lokální odložení připomínky selhalo:",
      error
    );
    zobrazZpravuAplikace(
      "Připomínky",
      "Připomínku se nepodařilo bezpečně uložit."
    );
    return false;
  }

  ukonciCekani();

  /*
   * UI se vrátí okamžitě. Android alarm a cloud se dorovnají
   * na pozadí a už neblokují kliknutí uživatele.
   */
  closeReminderQuickMenu();

  if (typeof renderTasks === "function") {
    requestAnimationFrame(renderTasks);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky(
    "Připomínka odložena"
  );

  spustPripominkovouUlohuNaPozadi(
    async () => {
      if (oldNotificationId) {
        await cancelNotification(
          oldNotificationId
        );
      }

      await obnovNotifikacePoznamkyPodleSoukromi(
        updatedTask
      );
    },
    "Aktualizace Android připomínky"
  );

  return true;
}


async function savePlannedReminderDate(itemId, newDate) {
  const item = getPlannedItemById(itemId);

  if (!item) {
    return false;
  }

  const oldNotificationId =
    item.notificationId || null;

  const updatedItem = {
    ...item,
    plannedAt: formatReminderLocalDateTime(newDate),
    notificationId: createUniqueNotificationId()
  };

  const mergedItems = loadPlannedItems().map(
    (candidate) =>
      candidate.id === itemId
        ? updatedItem
        : candidate
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === updatedItem.sourceNoteId
  );

  let sourceNote = null;

  if (noteIndex !== -1) {
    sourceNote = tasks[noteIndex];

    sourceNote.plannedItems =
      Array.isArray(sourceNote.plannedItems)
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

    sourceNote.updatedAt =
      new Date().toISOString();
  }

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Odkládám úkol…",
      300
    ) || (() => {});

  try {
    await ulozZmenuPripominkyLokalne(
      async () => {
        savePlannedItems(mergedItems);

        if (sourceNote) {
          await saveAllTasks(tasks);
        }
      },
      sourceNote
    );
  } catch (error) {
    ukonciCekani();
    console.error(
      "Lokální odložení Planner úkolu selhalo:",
      error
    );
    zobrazZpravuAplikace(
      "Připomínky",
      "Úkol se nepodařilo bezpečně uložit."
    );
    return false;
  }

  ukonciCekani();
  closeReminderQuickMenu();

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky(
    "Úkol byl odložen"
  );

  spustPripominkovouUlohuNaPozadi(
    async () => {
      if (oldNotificationId) {
        await cancelNotification(
          oldNotificationId
        );
      }

      if (
        sourceNote &&
        sourceNote.isSecret !== true
      ) {
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
    },
    "Aktualizace Planner notifikace"
  );

  return true;
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
    return false;
  }

  const currentTask = tasks[index];
  const oldNotificationId =
    currentTask.notificationId || null;

  const updatedTask = {
    ...currentTask,
    reminder: false,
    updatedAt: new Date().toISOString()
  };

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Vypínám připomínku…",
      300
    ) || (() => {});

  try {
    await ulozZmenuPripominkyLokalne(
      () => updateTask(index, updatedTask),
      updatedTask
    );
  } catch (error) {
    ukonciCekani();
    console.error(
      "Vypnutí připomínky selhalo:",
      error
    );
    zobrazZpravuAplikace(
      "Připomínky",
      "Připomínku se nepodařilo bezpečně vypnout."
    );
    return false;
  }

  ukonciCekani();

  if (typeof renderTasks === "function") {
    requestAnimationFrame(renderTasks);
  }

  spustPripominkovouUlohuNaPozadi(
    async () => {
      if (oldNotificationId) {
        await cancelNotification(
          oldNotificationId
        );
      }

      await obnovNotifikacePoznamkyPodleSoukromi(
        updatedTask
      );
    },
    "Vypnutí Android připomínky"
  );

  return true;
}


function najdiPlannedLinkVHtml(
  sourceNote,
  plannedItemId
) {
  if (!sourceNote?.richContent || !plannedItemId) {
    return null;
  }

  const template = document.createElement("template");
  template.innerHTML = sourceNote.richContent;

  return template.content.querySelector(
    `[data-planned-item-id="${plannedItemId}"]`
  );
}


function ziskejBezpecnyTypPlanovanePolozky(
  item,
  sourceNote
) {
  if (!item) {
    return "note";
  }

  /*
   * Stabilní vazba na konkrétní TODO má přednost před historickým
   * sourceType. Starší synchronizovaná data totiž mohou mít sourceType
   * chybějící nebo chybně "note".
   */
  if (item.sourceTodoId) {
    return "todo";
  }

  /*
   * Backlink data-planned-item-id je nejsilnější důkaz, že Planner
   * položka vznikla z označeného textu. Díky tomu nikdy nesmažeme ani
   * nedokončíme celou zdrojovou poznámku jen kvůli starému sourceType.
   */
  if (najdiPlannedLinkVHtml(sourceNote, item.id)) {
    return "selection";
  }

  return item.sourceType || "note";
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
    return false;
  }

  const item = getPlannedItemById(entry.id);

  if (!item) {
    return false;
  }

  zapocitejPouzitiTlacitkaPripominky(
    "complete",
    "planned"
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === item.sourceNoteId
  );

  let sourceNote = null;

  if (noteIndex !== -1) {
    sourceNote = tasks[noteIndex];
  }

  /*
   * Typ úkolu neurčujeme jen podle historického sourceType. Pokud má
   * položka konkrétní TODO ID nebo backlink v rich-textu, jde bezpečně
   * poznat její skutečný původ i u starších / neúplných dat.
   */
  const bezpecnySourceType =
    ziskejBezpecnyTypPlanovanePolozky(
      item,
      sourceNote
    );

  const completedItem = {
    ...item,
    sourceType: bezpecnySourceType,
    completed: true,
    completedAt: new Date().toISOString()
  };

  const notificationIdsKeZruseni = new Set();

  if (item.notificationId) {
    notificationIdsKeZruseni.add(
      item.notificationId
    );
  }

  savePlannedItems(
    loadPlannedItems().map(
      (candidate) =>
        candidate.id === item.id
          ? completedItem
          : candidate
    )
  );

  if (sourceNote) {
    if (bezpecnySourceType === "note") {
      sourceNote.completed = true;
      sourceNote.reminder = false;

      if (sourceNote.notificationId) {
        notificationIdsKeZruseni.add(
          sourceNote.notificationId
        );
      }
    }

    if (
      bezpecnySourceType === "todo" &&
      item.sourceTodoId
    ) {
      window.LubaNoteTodos
        ?.nastavTodoJakoNaplanovane?.(
          item.sourceTodoId,
          false
        );

      sourceNote.todos = Array.isArray(sourceNote.todos)
        ? sourceNote.todos.map(
            (todo) =>
              todo?.id === item.sourceTodoId
                ? {
                    ...todo,
                    completed: true
                  }
                : todo
          )
        : [];

      window.LubaNoteTodos
        ?.oznacTodoJakoHotove?.(
          item.sourceTodoId,
          true
        );
    }

    sourceNote.plannedItems =
      Array.isArray(sourceNote.plannedItems)
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

    if (bezpecnySourceType === "selection") {
      updatePlannedLinkHtml(
        sourceNote,
        item.id,
        "complete"
      );
    }

    sourceNote.updatedAt =
      new Date().toISOString();

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        "Dokončuji úkol…",
        300
      ) || (() => {});

    try {
      await ulozZmenuPripominkyLokalne(
        () => saveAllTasks(tasks),
        sourceNote
      );
    } catch (error) {
      ukonciCekani();
      console.error(
        "Dokončení Planner úkolu selhalo:",
        error
      );
      return false;
    }

    ukonciCekani();

    if (
      bezpecnySourceType === "selection" &&
      typeof modalRichText !== "undefined" &&
      (
        (
          typeof activeTaskId !== "undefined" &&
          activeTaskId === sourceNote.id
        ) ||
        (
          typeof activeTaskId === "undefined" &&
          typeof activeTaskIndex !== "undefined" &&
          activeTaskIndex === noteIndex
        )
      )
    ) {
      modalRichText
        .querySelector(
          `[data-planned-item-id="${item.id}"]`
        )
        ?.classList.add(
          "plannedTextLinkCompleted"
        );
    }
  }

  closeReminderQuickMenu();

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  if (typeof renderTasks === "function") {
    requestAnimationFrame(renderTasks);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky("Úkol dokončen");

  spustPripominkovouUlohuNaPozadi(
    async () => {
      for (const notificationId of notificationIdsKeZruseni) {
        await cancelNotification(notificationId);
      }
    },
    "Zrušení dokončených notifikací"
  );

  return true;
}


async function removeSelectedPlannedReminder(entry) {
  const item = getPlannedItemById(entry.id);

  if (!item) {
    return false;
  }

  savePlannedItems(
    loadPlannedItems().filter(
      (candidate) => candidate.id !== item.id
    )
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === item.sourceNoteId
  );

  let sourceNote = null;

  if (noteIndex !== -1) {
    sourceNote = tasks[noteIndex];

    const bezpecnySourceType =
      ziskejBezpecnyTypPlanovanePolozky(
        item,
        sourceNote
      );

    if (
      bezpecnySourceType === "todo" &&
      item.sourceTodoId
    ) {
      window.LubaNoteTodos
        ?.nastavTodoJakoNaplanovane?.(
          item.sourceTodoId,
          false
        );
    }

    sourceNote.plannedItems =
      Array.isArray(sourceNote.plannedItems)
        ? sourceNote.plannedItems.filter(
            (candidate) => candidate.id !== item.id
          )
        : [];

    /*
     * Odebrání odkazu z rich-textu je bezpečný no-op, pokud žádný
     * backlink neexistuje. Voláme ho proto vždy – opraví i staré
     * Planner položky, kterým chybí sourceType="selection".
     */
    updatePlannedLinkHtml(
      sourceNote,
      item.id,
      "remove"
    );

    sourceNote.updatedAt =
      new Date().toISOString();

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        "Odebírám připomínku…",
        300
      ) || (() => {});

    try {
      await ulozZmenuPripominkyLokalne(
        () => saveAllTasks(tasks),
        sourceNote
      );
    } catch (error) {
      ukonciCekani();
      console.error(
        "Odebrání Planner připomínky selhalo:",
        error
      );
      return false;
    }

    ukonciCekani();
  }

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  if (item.notificationId) {
    spustPripominkovouUlohuNaPozadi(
      () => cancelNotification(
        item.notificationId
      ),
      "Zrušení Planner notifikace"
    );
  }

  return true;
}


async function disableSelectedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry) {
    return;
  }

  if (entry.kind === "planned") {
    zapocitejPouzitiTlacitkaPripominky(
      "unplan",
      "planned"
    );

    await removeSelectedPlannedReminder(entry);
  } else {
    zapocitejPouzitiTlacitkaPripominky(
      "disable",
      "note"
    );

    await disableSelectedNoteReminder(entry);
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function smazCelouPoznamkuZPripominek(noteId) {
  if (!noteId) {
    return false;
  }

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task?.id === noteId
  );

  if (noteIndex === -1) {
    return false;
  }

  /* Veškerý úklid Planneru, notifikací i Supabase je centralizovaný. */
  return await deleteTask(noteIndex);
}


async function deleteSelectedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry) {
    return;
  }

  /*
   * Zásadní bezpečnostní pravidlo:
   * položka kind="planned" je VŽDY samostatný Planner úkol. Tlačítko
   * Smazat v Připomínkách proto nikdy nesmí smazat její zdrojovou kartu,
   * ani když stará synchronizovaná data nemají sourceType nebo ho mají
   * chybně jako "note".
   */
  if (entry.kind === "planned") {
    zapocitejPouzitiTlacitkaPripominky(
      "delete",
      "planned"
    );

    await removeSelectedPlannedReminder(entry);
  } else {
    /*
     * Bezpečnostní pravidlo pro celou obrazovku Připomínky:
     * Smazat zde znamená odstranit připomínku, NIKDY zdrojovou kartu.
     * Celá poznámka se maže pouze v Poznámkách / editoru.
     * Tím jsou bezpečná i stará historická data, která se dříve mohla
     * tvářit jako běžná note připomínka místo Planner položky.
     */
    zapocitejPouzitiTlacitkaPripominky(
      "delete",
      "note"
    );

    await disableSelectedNoteReminder(entry);
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function openPlannedSourceInEditor(itemId) {
  const item = getPlannedItemById(itemId);

  if (!item?.sourceNoteId) {
    return;
  }

  if (typeof openTaskEditorById !== "function") {
    return;
  }

  await openTaskEditorById(item.sourceNoteId);

  if (
    document.getElementById("taskModal")
      ?.dataset?.taskId !==
      String(item.sourceNoteId)
  ) {
    return;
  }

  if (item.sourceType === "todo") {
    setTimeout(() => {
      window.LubaNoteTodos
        ?.zobrazTodoPodleId?.(
          item.sourceTodoId
        );
    }, 150);

    return;
  }

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

function ziskejRetenciPoTerminu() {
  const hodnota =
    localStorage.getItem(
      REMINDER_OVERDUE_RETENTION_KEY
    ) || "30";

  if (hodnota === "never") {
    return null;
  }

  const dny = Number(hodnota);

  return Number.isFinite(dny) && dny > 0
    ? dny
    : 30;
}


async function vycistiStarePripominkyPoTerminu(
  { vynutit = false } = {}
) {
  if (probihaAutomatickyUklidPoTerminu) {
    return false;
  }

  const potvrzeno =
    localStorage.getItem(
      REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY
    ) === "true";

  /* Po upgradu nic starého nemažeme, dokud uživatel nastavení
     jednou výslovně nepotvrdí. */
  if (!potvrzeno) {
    return false;
  }

  const retenceDni = ziskejRetenciPoTerminu();

  if (retenceDni === null) {
    return false;
  }

  const ted = Date.now();

  if (
    !vynutit &&
    ted - posledniAutomatickyUklidPoTerminu <
      60 * 60 * 1000
  ) {
    return false;
  }

  posledniAutomatickyUklidPoTerminu = ted;
  probihaAutomatickyUklidPoTerminu = true;

  try {
    const limit =
      ted - retenceDni * 24 * 60 * 60 * 1000;

    const tasks = loadTask();
    const plannedItems = loadPlannedItems();

    const starePlannedItems = plannedItems.filter(
      item =>
        item?.completed !== true &&
        item?.plannedAt &&
        new Date(item.plannedAt).getTime() < limit
    );

    const idsStarychPlanu = new Set(
      starePlannedItems
        .filter(item => item?.id)
        .map(item => item.id)
    );

    const notificationIds = new Set(
      starePlannedItems
        .map(item => item?.notificationId)
        .filter(Boolean)
    );

    let zmenenyTasks = false;

    tasks.forEach((task) => {
      if (!task || task.isSecret === true) {
        return;
      }

      let zmenenaPoznamka = false;

      /* Opakovaná poznámka má vlastní výpočet dalšího výskytu a
         automatickým úklidem ji nesmíme vypnout. */
      if (
        task.reminder === true &&
        task.date &&
        task.repeat?.enabled !== true &&
        new Date(task.date).getTime() < limit
      ) {
        task.reminder = false;

        if (task.notificationId) {
          notificationIds.add(task.notificationId);
        }

        zmenenaPoznamka = true;
      }

      if (
        idsStarychPlanu.size > 0 &&
        Array.isArray(task.plannedItems)
      ) {
        const puvodniDelka = task.plannedItems.length;

        task.plannedItems.forEach((item) => {
          if (!idsStarychPlanu.has(item?.id)) {
            return;
          }

          const bezpecnyTyp =
            ziskejBezpecnyTypPlanovanePolozky(
              item,
              task
            );

          if (
            bezpecnyTyp === "todo" &&
            item?.sourceTodoId
          ) {
            window.LubaNoteTodos
              ?.nastavTodoJakoNaplanovane?.(
                item.sourceTodoId,
                false
              );
          }

          updatePlannedLinkHtml(
            task,
            item.id,
            "remove"
          );
        });

        task.plannedItems = task.plannedItems.filter(
          item => !idsStarychPlanu.has(item?.id)
        );

        if (task.plannedItems.length !== puvodniDelka) {
          zmenenaPoznamka = true;
        }
      }

      if (zmenenaPoznamka) {
        task.updatedAt = new Date().toISOString();
        zmenenyTasks = true;
      }
    });

    if (idsStarychPlanu.size > 0) {
      savePlannedItems(
        plannedItems.filter(
          item => !idsStarychPlanu.has(item?.id)
        )
      );
    }

    if (zmenenyTasks) {
      await ulozZmenuPripominkyLokalne(
        () => saveAllTasks(tasks)
      );
    }

    for (const notificationId of notificationIds) {
      if (typeof cancelNotification === "function") {
        await Promise.resolve(
          cancelNotification(notificationId)
        ).catch(() => {});
      }
    }

    if (zmenenyTasks || idsStarychPlanu.size > 0) {
      if (typeof renderTasks === "function") {
        requestAnimationFrame(renderTasks);
      }

      if (typeof renderCalendar === "function") {
        requestAnimationFrame(renderCalendar);
      }

      requestAnimationFrame(renderRemindersScreen);
      return true;
    }

    return false;
  } catch (error) {
    console.warn(
      "Automatický úklid připomínek po termínu selhal:",
      error
    );
    return false;
  } finally {
    probihaAutomatickyUklidPoTerminu = false;
  }
}


function naplanujUklidPoTerminu() {
  if (
    localStorage.getItem(
      REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY
    ) !== "true"
  ) {
    return;
  }

  spustPripominkovouUlohuNaPozadi(
    () => vycistiStarePripominkyPoTerminu(),
    "Automatický úklid připomínek po termínu"
  );
}


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
        window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
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
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
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

  const ikonaOblasti =
    entry.area === "work" ? "prace" : "soukrome";

  if (window.LubaNoteIcons?.vlozIkonu) {
    window.LubaNoteIcons.vlozIkonu(
      icon,
      ikonaOblasti,
      ["reminderItemAreaIcon"]
    );
  }

  const titleText =
    document.createElement("span");

  titleText.textContent =
    entry.title || "Bez názvu";

  title.append(icon, titleText);

  if (entry.kind === "planned") {
    const planIcon =
      window.LubaNoteIcons?.vytvorHostitele?.(
        "kalendar",
        ["reminderPlannedIcon"]
      );

    if (planIcon) {
      title.append(planIcon);
    }
  }

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
  if (window.LubaNoteIcons?.nastavJenIkonu) {
    window.LubaNoteIcons.nastavJenIkonu(
      menuButton,
      "vice",
      ["reminderMenuSvgIcon"]
    );
  }

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

  naplanujUklidPoTerminu();
  
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
  
  const overdueEntries = reminders
    .filter(
      entry => new Date(entry.date) < now
    )
    .sort(
      (a, b) =>
        new Date(b.date) - new Date(a.date)
    );

  const activeEntries = reminders.filter(
    entry => new Date(entry.date) >= now
  );

  overdueEntries.forEach((entry) => {
    overdueList.append(
      createReminderRow(entry, true, true)
    );
  });

  activeEntries.forEach((entry) => {
    const date = new Date(entry.date);

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
      `<p class="remindersEmpty">${
        window.LubaNoteI18n?.t?.(
          "reminders.none",
          "Žádné připomínky."
        ) || "Žádné připomínky."
      }</p>`;
  }
  
  if (!tomorrowList.children.length) {
    tomorrowList.innerHTML =
      `<p class="remindersEmpty">${
        window.LubaNoteI18n?.t?.(
          "reminders.none",
          "Žádné připomínky."
        ) || "Žádné připomínky."
      }</p>`;
  }
  
  if (!laterList.children.length) {
    laterList.innerHTML =
      `<p class="remindersEmpty">${
        window.LubaNoteI18n?.t?.(
          "reminders.none",
          "Žádné připomínky."
        ) || "Žádné připomínky."
      }</p>`;
  }
  
  if (!overdueList.children.length) {
    overdueList.innerHTML =
      `<p class="remindersEmpty">${
        window.LubaNoteI18n?.t?.(
          "reminders.noneOverdue",
          "Žádné připomínky po termínu."
        ) || "Žádné připomínky po termínu."
      }</p>`;
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
      button.textContent = "Odkládám…";

      try {
        await postponeReminder(minutes);
      } finally {
        button.textContent = puvodniText;
        button.disabled = false;
      }
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
      button.textContent = "Odkládám…";

      try {
        await postponeReminderToTomorrowMorning();
      } finally {
        button.textContent = puvodniText;
        button.disabled = false;
      }
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


deleteReminderButton?.addEventListener(
  "click",
  deleteSelectedReminder
);


completeReminderButton?.addEventListener(
  "click",
  async () => {
    const entry = getSelectedReminderEntry();

    if (!entry) {
      return;
    }

    if (entry.kind === "planned") {
      await completeSelectedPlannedReminder();
      return;
    }

    if (entry.kind === "note") {
      const tasks = loadTask();

      const noteIndex = tasks.findIndex(
        (task) => task.id === entry.id
      );

      if (noteIndex === -1) {
        return;
      }

      const note = tasks[noteIndex];
      const notificationId =
        note.notificationId || null;

      zapocitejPouzitiTlacitkaPripominky(
        "complete",
        "note"
      );

      note.completed = true;
      note.reminder = false;
      note.updatedAt = new Date().toISOString();

      const ukonciCekani =
        window.LubaNoteUI?.zacniCekaniAkce?.(
          "Dokončuji poznámku…",
          300
        ) || (() => {});

      try {
        await ulozZmenuPripominkyLokalne(
          () => saveAllTasks(tasks),
          note
        );
      } catch (error) {
        ukonciCekani();
        console.error(
          "Dokončení poznámky selhalo:",
          error
        );
        return;
      }

      ukonciCekani();
      closeReminderQuickMenu();

      requestAnimationFrame(
        renderRemindersScreen
      );

      if (typeof renderTasks === "function") {
        requestAnimationFrame(renderTasks);
      }

      zobrazPotvrzeniPripominky(
        "Poznámka dokončena"
      );

      if (
        notificationId &&
        typeof cancelNotification === "function"
      ) {
        spustPripominkovouUlohuNaPozadi(
          () => cancelNotification(
            notificationId
          ),
          "Zrušení dokončené notifikace"
        );
      }
    }
  }
);


document
  .getElementById("openReminderNoteButton")
  ?.addEventListener("click", () => {
    const entry = getSelectedReminderEntry();

    closeReminderQuickMenu();

    if (!entry) {
      return;
    }

    zapocitejPouzitiTlacitkaPripominky(
      "open",
      entry.kind === "planned"
        ? "planned"
        : "note"
    );

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
  });


window.LubaNoteReminders = {
  ...(window.LubaNoteReminders || {}),
  vycistiStarePoTerminu: (moznosti = {}) =>
    vycistiStarePripominkyPoTerminu(moznosti)
};


/* Po startu uklízíme pouze tehdy, pokud už uživatel retenci
   v Nastavení dříve výslovně potvrdil. */
setTimeout(
  naplanujUklidPoTerminu,
  1500
);


window.addEventListener(
  "lubanote:language-change",
  () => {
    if (typeof renderRemindersScreen === "function") {
      renderRemindersScreen();
    }
  }
);
