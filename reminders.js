/* ==================================================
   LUBANOTE – PŘIPOMÍNKY
   - systémová Android upozornění
   - přehled aktivních i prošlých připomínek
   - naplánované položky z Planneru
   - filtry pracovní / soukromé
   - rychlé odložení, změna času, dokončení
================================================== */

const remindersT = (klic, zaloha, hodnoty = {}) =>
  window.LubaNoteI18n?.t?.(klic, zaloha, hodnoty) || zaloha;

async function requestNotificationPermission() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;
  
  if (!LocalNotifications) {
    return false;
  }
  
  const permission =
    await LocalNotifications.requestPermissions();
  
  if (permission?.display !== "granted") {
    return false;
  }
  
  await createReminderChannel();
  
  const jeAndroid =
    window.Capacitor?.getPlatform?.() === "android";
  
  if (
    jeAndroid &&
    typeof LocalNotifications.checkExactNotificationSetting ===
    "function"
  ) {
    try {
      let stavPresnychAlarmu =
        await LocalNotifications
        .checkExactNotificationSetting();
      
      if (
        stavPresnychAlarmu?.exact_alarm !== "granted" &&
        typeof LocalNotifications
        .changeExactNotificationSetting === "function"
      ) {
        stavPresnychAlarmu =
          await LocalNotifications
          .changeExactNotificationSetting();
      }
      
      if (
        stavPresnychAlarmu?.exact_alarm !== "granted"
      ) {
        if (
          typeof zobrazZpravuAplikace === "function"
        ) {
          zobrazZpravuAplikace(
            remindersT("reminders.exactTitle", "Přesné připomínky"),
            remindersT("reminders.exactMessage", "Povol v Androidu přesné alarmy, jinak může systém upozornění zpozdit.")
          );
        }
        
        return false;
      }
    } catch (error) {
      console.warn(
        "Kontrola přesných alarmů se nepodařila:",
        error
      );
      
      return false;
    }
  }
  
  return true;
}


async function createReminderChannel() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.createChannel({
    id: "reminders",
    name: remindersT("reminders.channelName", "Připomínky LubaNote"),
    description: remindersT("reminders.channelDescription", "Upozornění na naplánované poznámky a úkoly"),
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


/* 683AU: Id aktivni pripominky drzi i nativni receiver pri vypnutem WebView. */
async function oznacAndroidPripominku683AU(id, aktivni) {
  if (
    !Number.isInteger(id) || id <= 0 ||
    window.Capacitor?.getPlatform?.() !== "android"
  ) return;

  const plugin = window.Capacitor?.Plugins?.LubaNoteSticky;
  const metoda = aktivni ? "activate" : "deactivate";
  if (typeof plugin?.[metoda] !== "function") return;
  try {
    await plugin[metoda]({ id });
  } catch (error) {
    console.warn("683AU: Nativni registr pripominky neni dostupny:", error);
  }
}

async function oznacAndroidPripominky683AU(ids, aktivni) {
  for (const id of ids || []) {
    await oznacAndroidPripominku683AU(id, aktivni);
  }
}

/* 692V – Native index of the ACTUAL scheduled APK notifications.
   The FCM receiver must not infer this phone's numeric IDs from the web.
   A native read failure leaves the previous index untouched. */
async function obnovIndexLokalnichAlarmu692V() {
  const local = window.Capacitor?.Plugins?.LocalNotifications;
  const native = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  if (typeof local?.getPending !== "function" ||
      typeof native?.replaceLocalSnapshot692V !== "function") return;
  try {
    const pending = await local.getPending();
    if (!Array.isArray(pending?.notifications)) return;
    const alarms = [];
    for (const item of pending.notifications) {
      const extra = item?.extra || {};
      const noteId = extra.lubanoteType === "planned"
        ? extra.sourceNoteId : (extra.lubanoteType === "note" ? extra.taskId : "");
      const id = Number(item?.id);
      const at = new Date(item?.schedule?.at).getTime();
      if (!/^[\w:-]{1,128}$/.test(String(noteId || "")) ||
          !Number.isInteger(id) || id <= 0 ||
          !Number.isSafeInteger(at) || at <= Date.now()) continue;
      alarms.push({noteId: String(noteId), id, at: String(at)});
    }
    // Never overwrite a valid registry with a truncated snapshot.
    if (alarms.length > 4096) return;
    await native.replaceLocalSnapshot692V({alarms});
  } catch (_) { /* no-op on native read failure */ }
}

/* 692Z-A: Keep Capacitor for Planner and repeating reminders while ordinary
 * notes use the same exact native slot as FCM. All reads/cancels also include
 * native ordinary-note pending entries. Old APK/plugin failures remain safe. */
async function nactiCekajiciSNative692Z(LocalNotifications) {
  const raw=await LocalNotifications.getPending();
  const native=window.Capacitor?.Plugins?.LubaNoteFcmToken;
  if(typeof native?.getLocalNotePending692Z!=="function") return raw;
  try {
    const data=await native.getLocalNotePending692Z();
    const original=Array.isArray(raw?.notifications)?raw.notifications:[];
    const additional=Array.isArray(data?.notifications)?data.notifications:[];
    const ids=new Set(original.map(row=>Number(row?.id)));
    return {notifications:[...original,...additional.filter(row=>!ids.has(Number(row?.id)))]};
  } catch (_) {return raw;}
}

async function zrusCekajiciSNative692Z(LocalNotifications,request) {
  const notifications=Array.isArray(request?.notifications)?request.notifications:[];
  // Never cancel a native alarm *instead* of calling the proven Capacitor API;
  // both may coexist during a transition from an older APK build.
  const native=window.Capacitor?.Plugins?.LubaNoteFcmToken;
  for(const item of notifications) {
    const id=Number(item?.id);
    if(Number.isInteger(id)&&id>0) {
      try {await native?.cancelLocalNote692Z?.({id});} catch (_) {}
    }
  }
  return await LocalNotifications.cancel(request);
}

function muzePouzitSpolecnyAlarm692Z(extra,at) {
  if(extra?.lubanoteType!=="note" || extra?.recurring===true ||
      !Number.isSafeInteger(at) || at<=Date.now()+500) return false;
  try {
    const note=typeof loadTask==="function"
      ? loadTask().find(n=>String(n?.id)===String(extra.taskId)):null;
    if(!note || note.isSecret===true || note.completed===true ||
        note.reminder!==true || new Date(note.date).getTime()!==at) return false;
    // A parent note and its Planner item must not be collapsed when due
    // at exactly the same instant. The legacy route is used for ambiguity.
    return !(Array.isArray(note.plannedItems) && note.plannedItems.some(item=>
      item && item.completed!==true && item.reminder!==false &&
      new Date(item.plannedAt).getTime()===at));
  } catch (_) {return false;}
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

  const native692Z=window.Capacitor?.isNativePlatform?.()
    ? window.Capacitor?.Plugins?.LubaNoteFcmToken:null;
  const at692Z=new Date(dateTime).getTime();
  if (typeof native692Z?.scheduleLocalNote692Z==="function" &&
      muzePouzitSpolecnyAlarm692Z(extra,at692Z)) {
    try {
      const result=await native692Z.scheduleLocalNote692Z({
        id:notificationId,noteId:String(extra.taskId),at:String(at692Z),
        title:title||"LubaNote",preview:shortText||"Máš naplánovanou připomínku."
      });
      if(result?.ok===true) {
        // The exact native PendingIntent is now persistent. Only afterwards
        // remove an old Capacitor copy of this notification ID.
        let migrated=false;
        try {
          // Most new notes have no Capacitor PendingIntent. Cancellation is
          // nonetheless required for alarms from a previous APK version.
          await LocalNotifications.cancel({notifications:[{id:notificationId}]});
          migrated=true;
        } catch (_) {
          // Never leave two active routes after a migration failure.
          try {await native692Z.cancelLocalNote692Z?.({id:notificationId});}
          catch (_) {}
        }
        if(migrated) {
          await oznacAndroidPripominku683AU(notificationId,false);
          try {await native692Z.forgetLocalAlarm692V?.({id:notificationId});}
          catch (_) {}
          return;
        }
        // Original scheduler below remains the emergency fallback.

      }
    } catch (_) { /* keep original scheduler as fallback */ }
  }

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
        /*
         * 683AZ: Prvni doruceni musi byt BEZ ongoing flagu, aby jej
         * ctecky beznych upozorneni (napr. Mi Fitness) mohly predat hodinkam.
         * autoCancel:false zachovava po klepnuti; nativni 683AU/683AZ
         * ochrana pres deleteIntent jej po smazani vrati POTICHU.
         */
        ongoing: false,
        autoCancel: false,
        extra,

        schedule: {
  at: new Date(dateTime),
  allowWhileIdle: true
}
      }
    ]
  });

  await oznacAndroidPripominku683AU(notificationId, true);

  // 692V: Let background FCM know that this APK already owns this exact
  // reminder. Do not disclose content or depend on another device's ID.
  const native692V = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  const noteId692V = extra?.lubanoteType === "planned"
    ? extra.sourceNoteId : extra?.taskId;
  const at692V = new Date(dateTime).getTime();
  if (noteId692V && Number.isSafeInteger(at692V) &&
      typeof native692V?.trackLocalAlarm692V === "function") {
    try {
      await native692V.trackLocalAlarm692V({
        noteId: String(noteId692V), id: notificationId, at: String(at692V)
      });
    } catch (_) { /* old APK or plugin unavailable: preserve local alarm */ }
  }
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
      await nactiCekajiciSNative692Z(LocalNotifications);

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
      await oznacAndroidPripominky683AU(notifications.map(n => n.id), false);
      await zrusCekajiciSNative692Z(LocalNotifications,{
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


/* 691AX – Capacitor Android getPending() exposes title/body/id/schedule/extra,
 * NOT largeBody/channelId/allowWhileIdle (those are only input fields).
 * Bind full payload and native scheduling flags to an opaque SHA-256 proof.
 * A legacy or unverifiable alarm is always restored via the old code path.
 * No note contents or proof values are logged to Debug Hub. */
async function vytvorOtiskOpakovanehoAlarmu691AX(note) {
  try {
    if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") return null;
    const data = JSON.stringify([
      "691AX-recurring-notification-v1",
      String(note?.id || ""),
      String(note?.title || "LubaNote"),
      String(note?.note || "").replace(/\s+/g, " ").trim(),
      String(note?.date || ""),
      note?.repeat || null,
      note?.notificationId ?? null,
      "reminders", true, false, false
    ]);
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return "v1:" + Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, "0")).join("");
  } catch (_error) {
    return null;
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

  const dokaz691AX = await vytvorOtiskOpakovanehoAlarmu691AX(note);

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
        recurring: true,
        ...(dokaz691AX ? { lubanoteRecurringProof691AX: dokaz691AX } : {})
      }
    );
  }
}


async function obnovNotifikacePoznamkyPodleSoukromi(note) {
  if (!note?.id) {
    return;
  }

  /*
   * 683AT: Pokud pripominka uz mela zazvonit a stale je aktivni,
   * bezna synchronizace ji nesmi smazat z Android listy.
   * Pri dokončení, vypnuti pripominky, presunu terminu nebo pri
   * prepnuti na SECRET se stara notifikace dale spravne zrusi.
   */
  const zachovatDorucenouPripominku =
    note.isSecret !== true &&
    note.completed !== true &&
    note.reminder === true &&
    note.repeat?.enabled !== true &&
    Boolean(note.date) &&
    Number.isFinite(new Date(note.date).getTime()) &&
    new Date(note.date).getTime() <= Date.now();

  if (note.notificationId && !zachovatDorucenouPripominku) {
    await cancelNotification(note.notificationId);
  }

  await zrusCekajiciOpakovaneNotifikacePoznamky(
    note.id
  );

  const plannedItems = Array.isArray(note.plannedItems)
    ? note.plannedItems
    : [];

  /*
   * U doruceneho, dosud nesplneneho Planner ukolu plati stejna
   * ochrana. Budouci, dokončene a vypnute pripominky se nadale
   * obnovuji / rusi puvodnim zpusobem.
   */
  for (const item of plannedItems) {
    if (!item?.notificationId) continue;

    const casUkolu = new Date(item.plannedAt).getTime();
    const zachovatDorucenyPlanner =
      note.isSecret !== true &&
      note.completed !== true &&
      item.completed !== true &&
      jePlanovanaPripominkaZapnuta(item) &&
      Boolean(item.plannedAt) &&
      Number.isFinite(casUkolu) &&
      casUkolu <= Date.now();

    if (!zachovatDorucenyPlanner) {
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
      !jePlanovanaPripominkaZapnuta(item) ||
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
 * 683AT: Pokud uzivatel vyridi pripominku na druhem zarizeni,
 * dorucena "ongoing" notifikace se musi uklidit i zde po syncu.
 * Nikdy nesahame na nesouvisejici notifikace nebo jiny ucet.
 */
async function uklidNeplatneDorucenePripominkyPoSync(noteIds, poznamky) {
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (
    !plugin?.getDeliveredNotifications ||
    !plugin?.removeDeliveredNotifications ||
    !noteIds?.size
  ) return;

  try {
    const dorucene = await plugin.getDeliveredNotifications();
    const podleId = new Map(
      (poznamky || []).filter(note => note?.id)
        .map(note => [note.id, note])
    );

    const keZruseni = (dorucene?.notifications || []).filter(notification => {
      const extra = notification?.extra || {};
      const noteId = extra.taskId || extra.sourceNoteId;
      if (!noteId || !noteIds.has(noteId)) return false;
      if (!Number.isInteger(notification.id)) return false;

      const note = podleId.get(noteId);
      if (!note || note.isSecret === true || note.completed === true) {
        return true;
      }

      if (extra.lubanoteType === "planned") {
        const item = (note.plannedItems || []).find(
          candidate => candidate?.id === extra.plannedItemId
        );
        return !item ||
          item.notificationId !== notification.id ||
          item.completed === true ||
          !jePlanovanaPripominkaZapnuta(item) ||
          !item.plannedAt ||
          new Date(item.plannedAt).getTime() > Date.now();
      }

      if (extra.lubanoteType === "note") {
        if (extra.recurring === true) {
          return note.reminder !== true || note.repeat?.enabled !== true;
        }
        return note.repeat?.enabled === true ||
          note.reminder !== true ||
          note.notificationId !== notification.id ||
          !note.date ||
          new Date(note.date).getTime() > Date.now();
      }

      return false;
    });

    if (keZruseni.length) {
      await oznacAndroidPripominky683AU(keZruseni.map(n => n.id), false);
      await plugin.removeDeliveredNotifications({
        notifications: keZruseni
      });
    }
  } catch (error) {
    console.warn("Uklid dorucenych pripominek po syncu se odlozil:", error);
  }
}

async function obnovSystemoveNotifikacePoSynchronizaci(
  noteIds = null
) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (
    !LocalNotifications ||
    typeof loadTask !== "function"
  ) {
    return true;
  }

  const permission =
    await LocalNotifications.checkPermissions();

  if (permission?.display !== "granted") {
    return false;
  }

  /*
   * Start / návrat aplikace: srovnáme celý systémový stav s čerstvě
   * synchronizovanými daty. Tato cesta se nepouští při každé lokální
   * editaci, jen při startu/online dorovnání.
   */
  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    return await obnovSystemoveNotifikacePoKompletniObnove(
      loadTask()
    );
  }

  const cilovaId = new Set(
    noteIds.filter(Boolean)
  );

  if (cilovaId.size === 0) {
    return true;
  }

  await createReminderChannel();

  /*
   * Realtime sync zná přesná ID změněných poznámek. Zrušíme proto
   * pouze jejich staré alarmy (včetně Planner položek) a z čerstvého
   * lokálního stavu je znovu vytvoříme. Ostatní notifikace se vůbec
   * nedotknou.
   */
  if (typeof LocalNotifications.getPending === "function") {
    const pending =
      await nactiCekajiciSNative692Z(LocalNotifications);

    const keZruseni =
      (pending?.notifications || [])
        .filter((notification) => {
          const extra = notification?.extra || {};

          return (
            cilovaId.has(extra.taskId) ||
            cilovaId.has(extra.sourceNoteId)
          );
        })
        .filter(
          (notification) =>
            Number.isInteger(notification?.id)
        )
        .map((notification) => ({
          id: notification.id
        }));

    if (keZruseni.length > 0) {
      await zrusCekajiciSNative692Z(LocalNotifications,{
        notifications: keZruseni
      });
    }
  }

  const poznamky = loadTask();
  await uklidNeplatneDorucenePripominkyPoSync(cilovaId, poznamky);

  for (const noteId of cilovaId) {
    const note = poznamky.find(
      (candidate) => candidate?.id === noteId
    );

    /*
     * Smazaná / tajná / dokončená poznámka po zrušení starých alarmů
     * už žádnou novou systémovou notifikaci vytvořit nesmí.
     */
    if (
      !note ||
      note.isSecret === true ||
      note.completed === true
    ) {
      continue;
    }

    await obnovNotifikacePoznamkyPodleSoukromi(
      note
    );
  }

  await obnovIndexLokalnichAlarmu692V();
  return true;
}


/* 691AW – idempotent recurring reminder startup verification.
 * When Android ALREADY has exactly the next 32 correct alarms for a note,
 * do not cancel/re-register them at every launch. Any doubt or unexpected
 * native shape falls back to the original full restore. No notes are edited.
 * The sticky native registry remains unchanged when pending alarms match;
 * it was activated when those alarms were originally scheduled.
 */
async function overCekajiciOpakovaneAlarmy691AW(note, pending, ted) {
  if (!note?.id || !window.LubaNoteRecurring?.vypocitejBudouciTerminy ||
      !Array.isArray(pending) ||
      (Array.isArray(note.plannedItems) && note.plannedItems.length > 0)) {
    return { ok: false, reason: "scope-or-planner" };
  }
  const terminy = window.LubaNoteRecurring.vypocitejBudouciTerminy(
    note.date, note.repeat, 32, ted
  );
  if (!Array.isArray(terminy) || !terminy.length || terminy.length > 32) {
    return { ok: false, reason: "no-future-terms" };
  }
  const vlastni = pending.filter((item) =>
    item?.extra?.taskId === note.id && item?.extra?.recurring === true
  );
  if (vlastni.length !== terminy.length) {
    return { ok: false, reason: "count-changed" };
  }
  const byId = new Map(vlastni.map((item) => [Number(item?.id), item]));
  if (byId.size !== vlastni.length) {
    return { ok: false, reason: "duplicate-native-ids" };
  }
  const proof = await vytvorOtiskOpakovanehoAlarmu691AX(note);
  if (!proof) return { ok: false, reason: "proof-crypto-unavailable" };
  const obsah = String(note.note || "").replace(/\s+/g, " ").trim();
  const kratky = obsah.length > 140 ? obsah.slice(0, 140) + "…" : obsah;
  const body = kratky || "Máš naplánovanou připomínku.";
  const largeBody = obsah || "Máš naplánovanou připomínku.";
  const title = note.title || "LubaNote";
  for (let i = 0; i < terminy.length; i++) {
    const termin = terminy[i];
    const when = termin instanceof Date ? termin.getTime() : NaN;
    const id = i === 0 && note.notificationId
      ? Number(note.notificationId)
      : vytvorIdOpakovaneNotifikace(note.id, termin.toISOString());
    const item = byId.get(id);
    if (!item || !Number.isFinite(when) || when <= ted.getTime())
      return { ok: false, reason: "id-or-term-missing" };
    if (item.title !== title || item.body !== body)
      return { ok: false, reason: "native-title-or-body-different" };
    if (item?.extra?.lubanoteType !== "note" ||
        item?.extra?.taskId !== note.id || item?.extra?.recurring !== true)
      return { ok: false, reason: "native-type-or-owner-different" };
    if (item?.extra?.lubanoteRecurringProof691AX !== proof)
      return { ok: false, reason: "proof-missing-or-stale" };
    // Only compare optional fields if the native plugin actually returns them.
    if (item.largeBody !== undefined && item.largeBody !== largeBody)
      return { ok: false, reason: "native-large-body-different" };
    if (item.channelId !== undefined && item.channelId !== "reminders")
      return { ok: false, reason: "native-channel-different" };
    const at = item?.schedule?.at;
    if (at == null || new Date(at).getTime() !== when)
      return { ok: false, reason: "native-schedule-missing-or-different" };
    if (item.schedule.allowWhileIdle !== undefined && item.schedule.allowWhileIdle !== true)
      return { ok: false, reason: "native-idle-flag-different" };
    if (item.schedule.repeats === true || item.schedule.every || item.schedule.on)
      return { ok: false, reason: "unexpected-native-recurring-rule" };
  }
  return { ok: true, reason: "native-confirmed-with-full-payload-proof" };
}

/* 691AY – pouze ciselna diagnostika bez ID, nazvu, textu a datumu.
 * Srovnava pocet nativnich zaznamu s presnymi identifikatory generovanych
 * terminu a signalizuje, kdy by byla bezpecna parcialni obnova.
 * Neovlivnuje overovani 691AX, nerusi ani neplanuje zadny alarm. */
function spocitejOpakovaneAlarmy691AY(note, pending, ted) {
  if (!note?.id || !Array.isArray(pending) ||
      typeof window.LubaNoteRecurring?.vypocitejBudouciTerminy !== "function") return null;
  let terminy;
  try {
    terminy = window.LubaNoteRecurring.vypocitejBudouciTerminy(note.date, note.repeat, 32, ted);
  } catch (_) { return null; }
  if (!Array.isArray(terminy)) return null;
  const vlastni = pending.filter(n => n?.extra?.recurring === true && n?.extra?.taskId === note.id);
  const normalizovane = pending.filter(n => n?.extra?.recurring === true &&
    n?.extra?.taskId != null && String(n.extra.taskId) === String(note.id));
  const expected = new Set();
  for (let i = 0; i < terminy.length; i++) {
    const t = terminy[i];
    if (!(t instanceof Date) || !Number.isFinite(t.getTime())) return null;
    expected.add(Number(i === 0 && note.notificationId
      ? note.notificationId : vytvorIdOpakovaneNotifikace(note.id, t.toISOString())));
  }
  const nativeIds = new Set(normalizovane.map(n => Number(n.id)));
  const overlap = [...expected].filter(id => nativeIds.has(id)).length;
  const extra = [...nativeIds].filter(id => !expected.has(id)).length;
  const expired = normalizovane.filter(n => {
    const t = new Date(n?.schedule?.at).getTime();
    return Number.isFinite(t) && t <= ted.getTime();
  }).length;
  return { e: terminy.length, n: vlastni.length, l: normalizovane.length,
    o: overlap, m: expected.size - overlap, x: extra, a: expired,
    d: terminy.length - expected.size };
}
function prehledPocetnichShod691AY(notes, pending, ted) {
  if (!Array.isArray(pending)) return "native-unavailable";
  const counts = Object.create(null);
  for (const n of notes) {
    const s = spocitejOpakovaneAlarmy691AY(n, pending, ted);
    const key = s ? `E${s.e}-N${s.n}-L${s.l}-O${s.o}-M${s.m}-X${s.x}-A${s.a}-D${s.d}` : "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return `pendingTotal=${pending.length} groups=` +
    (Object.entries(counts).map(([k,v]) => `${k}x${v}`).join(",") || "none");
}

async function obnovNotifikaceOpakovanychPoznamek() {
  if (typeof loadTask !== "function") return;

  const opakovanePoznamky = loadTask().filter((note) =>
    note?.id && note.isSecret !== true && note.completed !== true &&
    note.reminder === true && note.date && note.repeat?.enabled === true
  );
  if (!opakovanePoznamky.length) return;

  let pending = null;
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (typeof plugin?.getPending === "function") {
    try {
      const odpoved = await plugin.getPending();
      if (Array.isArray(odpoved?.notifications)) pending = odpoved.notifications;
    } catch (_error) {
      // Native read failure must NEVER stop the established restore path.
    }
  }

  // Pocetni prehled jen pro diagnostiku; zadna data ani ID neodesila.
  const predObnovou691AY = prehledPocetnichShod691AY(opakovanePoznamky, pending, new Date());
  const zacatek = performance.now();
  let overeno = 0, obnoveno = 0;
  const duvody = Object.create(null);
  const ted = new Date();
  for (const note of opakovanePoznamky) {
    let shoda = false, duvod = pending ? "unverified" : "native-pending-unavailable";
    if (pending) {
      try {
        const overeni = await overCekajiciOpakovaneAlarmy691AW(note, pending, ted);
        shoda = overeni.ok;
        duvod = overeni.reason;
      } catch (_error) {
        duvod = "verification-error";
      }
    }
    if (shoda) {
      overeno++;
      continue;
    }
    duvody[duvod] = (duvody[duvod] || 0) + 1;
    obnoveno++;
    // Original implementation unchanged for missing/stale/unverifiable alarms.
    await obnovNotifikacePoznamkyPodleSoukromi(note);
  }
  const prehled = Object.entries(duvody).map(([k, v]) => k + ":" + v).join(",") || "none";
  window.LubaNoteStartupDiag?.zapis?.(
    "REM-FAST",
    `691AX recurring notes=${opakovanePoznamky.length} alreadyExact=${overeno} restored=${obnoveno} reasons=${prehled} elapsedMs=${Math.round(performance.now() - zacatek)}`
  );
  if (duvody["count-changed"] && pending) {
    window.LubaNoteStartupDiag?.zapis?.("REM-COUNT", `691AY BEFORE ${predObnovou691AY}`);
    // Read-only native post-check az PO dokonceni startu; ceka jen samostatna diagnostika,
    // nikdy synchronizace, E2E ani notifikacni planovani.
    setTimeout(() => {
      Promise.resolve()
        .then(() => plugin.getPending())
        .then((value) => {
          const native = Array.isArray(value?.notifications) ? value.notifications : null;
          window.LubaNoteStartupDiag?.zapis?.(
            "REM-COUNT", `691AY AFTER ${prehledPocetnichShod691AY(opakovanePoznamky, native, new Date())}`
          );
        })
        .catch(() => window.LubaNoteStartupDiag?.zapis?.("REM-COUNT", "691AY AFTER native-read-error"));
    }, 0);
  }
}


/* 691AZ – pred kompletni obnovou overit skutecne CELE pending.
 * Kontrolni bod nikdy nemeni notifikace. Jakakoli nejistota vraci false
 * a stavajici obnovovaci algoritmus zustane v platnosti.
 * Neni pouzita lokalni znacka "hotovo" ani pocet alarmu bez identit.
 */
async function overKompletniNativniAlarmy691AZ(poznamky, pending) {
  if (!Array.isArray(poznamky) || !Array.isArray(pending)) {
    return { ok: false, reason: "snapshot-unavailable" };
  }
  if (typeof window.LubaNoteRecurring?.vypocitejBudouciTerminy !== "function") {
    return { ok: false, reason: "recurring-module-unavailable" };
  }

  const ted = new Date();
  const pendingById = new Map();
  for (const item of pending) {
    const id = Number(item?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || pendingById.has(id)) {
      return { ok: false, reason: "invalid-or-duplicate-native-id" };
    }
    pendingById.set(id, item);
  }

  const zkontrolovane = new Set();
  const kratkyText = (s) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  };
  const overJeden = (id, title, body, at, extra) => {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id <= 0 || zkontrolovane.has(id)) return false;
    const item = pendingById.get(id);
    if (!item || !Number.isFinite(at) || at <= ted.getTime()) return false;
    if (item.title !== title || item.body !== body) return false;
    const realDate = new Date(item?.schedule?.at).getTime();
    if (realDate !== at || item?.schedule?.repeats === true ||
        item?.schedule?.every || item?.schedule?.on) return false;
    if (item?.extra?.lubanoteType !== extra.type) return false;
    if (extra.type === "note") {
      if (item.extra.taskId !== extra.noteId || item.extra.recurring === true) return false;
    } else if (item.extra.sourceNoteId !== extra.noteId ||
               item.extra.plannedItemId !== extra.plannedItemId) return false;
    zkontrolovane.add(id);
    return true;
  };

  const noteIds = new Set();
  for (const note of poznamky) {
    if (!note?.id) continue;
    if (noteIds.has(note.id)) return { ok: false, reason: "duplicate-note-id" };
    noteIds.add(note.id);
    if (note.isSecret === true || note.completed === true) continue;

    if (note.reminder === true && note.date) {
      if (note.repeat?.enabled === true) {
        // 691AX proof kontroluje i cely text, metadata, presny termin a vlastnika.
        // Planner polozky overime nezavisle pod timto blokem.
        const overeni = await overCekajiciOpakovaneAlarmy691AW(
          { ...note, plannedItems: [] }, pending, ted
        );
        if (!overeni.ok) return { ok: false, reason: "recurring-" + overeni.reason };
        for (const item of pending) {
          if (item?.extra?.taskId === note.id && item?.extra?.recurring === true) {
            if (zkontrolovane.has(Number(item.id))) return { ok: false, reason: "shared-notification-id" };
            zkontrolovane.add(Number(item.id));
          }
        }
      } else if (new Date(note.date).getTime() > ted.getTime()) {
        if (!note.notificationId) return { ok: false, reason: "note-id-missing" };
        const fullText = String(note.note || "").replace(/\s+/g, " ").trim();
        // Nativni getPending nezverejnuje largeBody; dlouhy text nelze uplne dokazat.
        if (fullText.length > 140) return { ok: false, reason: "note-fulltext-unverifiable" };
        if (!overJeden(note.notificationId, note.title || "LubaNote",
          kratkyText(note.note) || "Máš naplánovanou připomínku.",
          new Date(note.date).getTime(), { type: "note", noteId: note.id })) {
          // 695B: A single ordinary-note mismatch must not invalidate/cancel
          // hundreds of independently verified recurring alarms. The ID is
          // used only in memory for a scoped repair; never expose it in logs.
          return { ok: false, reason: "note-alarm-different", targetedNoteId695B: note.id };
        }
      }
    }

    for (const plan of (Array.isArray(note.plannedItems) ? note.plannedItems : [])) {
      if (!plan?.plannedAt || plan.completed === true ||
          !jePlanovanaPripominkaZapnuta(plan) ||
          new Date(plan.plannedAt).getTime() <= ted.getTime()) continue;
      if (!plan.notificationId) return { ok: false, reason: "planner-id-missing" };
      const body = note.title ? `Z poznámky: ${note.title}` : plan.text;
      const fullBody = String(body || "").replace(/\s+/g, " ").trim();
      if (fullBody.length > 140) return { ok: false, reason: "planner-fulltext-unverifiable" };
      if (!overJeden(plan.notificationId, plan.text || "Naplánovaný úkol",
        kratkyText(body) || "Máš naplánovanou připomínku.",
        new Date(plan.plannedAt).getTime(),
        { type: "planned", noteId: note.id, plannedItemId: plan.id })) {
        // 695B: The affected parent note can restore this Planner alarm
        // without clearing any other note's pending Android alarms.
        return { ok: false, reason: "planner-alarm-different", targetedNoteId695B: note.id };
      }
    }
  }

  // Kazdy native pending musi mit presne jednoho platneho vlastnika. Zbyvajici
  // stary, cizi, tajny ci smazany alarm znamena originalni bezpecny full restore.
  if (zkontrolovane.size !== pending.length) {
    return { ok: false, reason: "orphan-or-unexpected-native-alarm" };
  }
  return { ok: true, checked: zkontrolovane.size };
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

  // 691AZ: Zabranime zbytecnemu globalnimu cancel/reschedule pri kazdem
  // load/auth-valid, pokud jsou *vsechny* aktualni alarmy dokazatelne spravne.
  // Jde o read-only preflight, nikoli cache ci domnenku o stavu Androidu.
  let pendingPredObnovou691AZ = null;
  if (typeof LocalNotifications.getPending === "function") {
    try {
      const stav = await nactiCekajiciSNative692Z(LocalNotifications);
      if (Array.isArray(stav?.notifications)) pendingPredObnovou691AZ = stav.notifications;
    } catch (_error) { /* fallback puvodni obnovy */ }
  }
  if (pendingPredObnovou691AZ) {
    try {
      const kontrola = await overKompletniNativniAlarmy691AZ(
        poznamky, pendingPredObnovou691AZ
      );
      if (kontrola.ok) {
        window.LubaNoteStartupDiag?.zapis?.(
          "REM-GUARD", `691AZ PRESERVED | checked=${kontrola.checked} | no-global-reset`
        );
        await obnovIndexLokalnichAlarmu692V();
        return true;
      }
      // 695B: For a VERIFIED single-note/Planner mismatch, repair only its
      // owning note. Never global-cancel all 32x recurring alarms because
      // one ordinary native alarm differs. All other guard failures still
      // retain the established conservative full-restore fallback.
      if ((kontrola.reason === "note-alarm-different" ||
           kontrola.reason === "planner-alarm-different") &&
          kontrola.targetedNoteId695B != null) {
        const vlastnik695B = Array.isArray(poznamky)
          ? poznamky.find(n => n?.id === kontrola.targetedNoteId695B &&
              n?.isSecret !== true && n?.completed !== true)
          : null;
        if (vlastnik695B) {
          await obnovNotifikacePoznamkyPodleSoukromi(vlastnik695B);
          await obnovIndexLokalnichAlarmu692V();
          window.LubaNoteStartupDiag?.zapis?.(
            "REM-GUARD", `695B TARGETED | ${kontrola.reason} | no-global-reset`
          );
          return true;
        }
      }
      window.LubaNoteStartupDiag?.zapis?.(
        "REM-GUARD", `691AZ FALLBACK | ${kontrola.reason} | native=${pendingPredObnovou691AZ.length}`
      );
    } catch (_error) {
      window.LubaNoteStartupDiag?.zapis?.("REM-GUARD", "691AZ FALLBACK | proof-error");
    }
  } else {
    window.LubaNoteStartupDiag?.zapis?.("REM-GUARD", "691AZ FALLBACK | native-unavailable");
  }

  // Puvodni globalni obnovení zustava beze zmen pri kazde nejistote.
  if (
    typeof LocalNotifications.getPending ===
    "function"
  ) {
    const pending = await nactiCekajiciSNative692Z(LocalNotifications);

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
      await zrusCekajiciSNative692Z(LocalNotifications,{
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

  await obnovIndexLokalnichAlarmu692V();
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

  /* Pred app cancel() nejdriv zneplatnime nativni ochranu. */
  await oznacAndroidPripominku683AU(notificationId, false);

  /* Zrušíme případný budoucí alarm. */
  try {
    await zrusCekajiciSNative692Z(LocalNotifications,{
      notifications: [
        {
          id: notificationId
        }
      ]
    });
    // 692V: Invalidate the APK-local ownership index only AFTER the native
    // cancel succeeded. Do not leave a stale entry suppressing FCM delivery.
    try {
      await window.Capacitor?.Plugins?.LubaNoteFcmToken
        ?.forgetLocalAlarm692V?.({id: notificationId});
    } catch (_) { /* preserve established cancel behavior */ }
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
    if (typeof plannedEnabled !== "undefined") {
      plannedEnabled = false;
    }
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
  if (typeof plannedEnabled !== "undefined") {
    plannedEnabled = true;
  }
  updateReminderButton(true);
  requestNotificationPermission();
}


const editorReminderButton =
  document.getElementById("reminderButton");

editorReminderButton?.addEventListener("click", () => {
  if (typeof secretTaskEnabled !== "undefined" && secretTaskEnabled) {
    reminderEnabled = false;
    if (typeof plannedEnabled !== "undefined") {
      plannedEnabled = false;
    }
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

  if (typeof plannedEnabled !== "undefined") {
    plannedEnabled = true;
  }

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
let selectedReminderContext = "reminders";
let selectedReminderDateOverride = null;
let activeReminderStatus = "active";

const REMINDER_OVERDUE_RETENTION_KEY =
  "reminderOverdueRetentionDays";
const REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY =
  "reminderOverdueRetentionConfirmed";

let probihaAutomatickyUklidPoTerminu = false;
let posledniAutomatickyUklidPoTerminu = 0;

function jePlanovanaPripominkaZapnuta(item) {
  if (item?.reminder === true) {
    return true;
  }

  if (item?.reminder === false) {
    return false;
  }

  /* Starší Planner položky vznikaly vždy jako připomínky. */
  return Boolean(item?.notificationId);
}

function getReminderEntries(filterOverride692C = null) {
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
      notificationId: task.notificationId || null,
      reminder: true
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
      item.completed === true ||
      !jePlanovanaPripominkaZapnuta(item)
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
      notificationId: item.notificationId || null,
      reminder: true
    });
  });

  return entries
    .filter((entry) => {
      /* 692C: PC zvonek vidi oba typy oblasti, bez zmeny stavajiciho UI filtru. */
      const filtr = filterOverride692C === "all"
        ? "all"
        : activeReminderFilter;
      if (filtr === "all") return true;
      return entry.area === filtr;
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
  if (kind === "planned") {
    const item = getPlannedItemById(id);

    if (!item) {
      return null;
    }

    const sourceNote =
      loadTask().find(
        (task) => task?.id === item.sourceNoteId
      ) || null;

    if (!sourceNote || sourceNote.isSecret === true) {
      return null;
    }

    return {
      kind: "planned",
      id: item.id,
      sourceNoteId: item.sourceNoteId || null,
      sourceType: item.sourceType || "note",
      sourceTodoId: item.sourceTodoId || null,
      date: item.plannedAt,
      title: item.text || "Naplánovaný úkol",
      preview:
        item.sourceType === "todo"
          ? (sourceNote.title || "")
          : (sourceNote.note || ""),
      area: sourceNote.area || "private",
      notificationId: item.notificationId || null,
      reminder: jePlanovanaPripominkaZapnuta(item),
      completed: item.completed === true
    };
  }

  if (kind === "note") {
    const task = getReminderTaskById(id);

    if (!task || task.isSecret === true || !task.date) {
      return null;
    }

    return {
      kind: "note",
      id: task.id,
      sourceNoteId: task.id,
      sourceType:
        task.repeat?.enabled === true
          ? "recurring-note"
          : "note",
      date: task.date,
      title: task.title || "Bez názvu",
      preview: task.note || "",
      area: task.area || "private",
      notificationId: task.notificationId || null,
      reminder: task.reminder === true,
      completed: task.completed === true
    };
  }

  return null;
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

  const remindersScreen =
    document.getElementById("remindersScreen");

  /* 693F: Navigace už renderRemindersScreen() sama volá. Podruhé
     nepočítej celý seznam ještě před modálem. Pokud obrazovka
     už běží, další kliknutí ani render vůbec nepotřebujeme. */
  if (remindersScreen?.hidden) {
    remindersButton.click();
  }

  /* Za studeného startu nemusí být navigace ještě zaregistrovaná.
     V tom případě nesmí být nativní tap ACKnutý jako vyřízený. */
  if (!remindersScreen || remindersScreen.hidden) {
    return false;
  }

  try {
    openReminderQuickMenu(entry);
  } catch (error) {
    // Závada nepovinného obsahu nesmí opakovaně překreslovat obrazovku.
    console.warn("693F: Otevření odkládacího modalu:", error);
  }

  /* 693F: Za úspěch považuj až opravdu zobrazený modal pro
     správnou položku. Jinak původní 692T zopakuje pokus. */
  return reminderQuickMenu?.hidden === false &&
    selectedReminderEntry?.kind === entry.kind &&
    String(selectedReminderEntry.id) === String(entry.id);
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


/* 692T: Reuse the original reminder quick menu for an FCM/native alarm tap.
   Note and Planner alarms share one remote noteId, so disambiguate by the
   exact scheduled timestamp; do not guess the Planner item from its title. */
const zpracovavaneRemoteKliky692T = new Set();
window.addEventListener('lubanote:remote-reminder-open', (event) => {
  const data = event?.detail || {};
  const noteId = String(data.noteId || '');
  const at = Number(data.at);
  const token = String(data.token || '');
  if (!/^[\w:-]{1,128}$/.test(noteId) || !Number.isSafeInteger(at) || at <= 0 ||
      !/^[\w-]{8,80}$/.test(token) || zpracovavaneRemoteKliky692T.has(token)) return;
  zpracovavaneRemoteKliky692T.add(token);
  let attempts = 0;
  const openWhenReady = async () => {
    let entry = null;
    try {
      const note = getReminderEntry('note', noteId);
      if (note?.reminder && Math.abs(new Date(note.date).getTime() - at) <= 60000) {
      entry = note;
    }
    if (!entry && typeof loadPlannedItems === 'function') {
      const match = (loadPlannedItems() || []).find(item =>
        String(item?.sourceNoteId || '') === noteId &&
        item?.completed !== true &&
        Math.abs(new Date(item.plannedAt).getTime() - at) <= 60000);
      if (match) entry = getReminderEntry('planned', match.id);
    }
    // Recurring note occurrences can differ from the note's original date.
    if (!entry && note?.reminder && note.sourceType === 'recurring-note') entry = note;
    } catch { /* app data may not be loaded yet */ }
    let opened = false;
    try { if (entry) opened = openReminderCenterEntry(entry); } catch { /* retry after UI init */ }
    if (opened) {
      remoteQuickMenu692T = {kind: entry.kind, id: entry.id, noteId, at};
      try {
        await window.Capacitor?.Plugins?.LubaNoteFcmToken?.ackRemoteOpen?.({token});
      } catch { /* still stored in native prefs, next resume can retry */ }
      zpracovavaneRemoteKliky692T.delete(token);
      return;
    }
    if (++attempts < 100) {
      setTimeout(() => {void openWhenReady();}, 250);
    } else {
      zpracovavaneRemoteKliky692T.delete(token);
    }
  };
  setTimeout(() => {void openWhenReady();}, 100);
});

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
      await nactiCekajiciSNative692Z(LocalNotifications);

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
        !jePlanovanaPripominkaZapnuta(item) ||
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

      (async () => {
        await ensureFuturePlannedNotifications();

        await obnovSystemoveNotifikacePoSynchronizaci();
      })().catch((error) => {
        console.warn(
          "Doplnění systémových notifikací bylo odloženo:",
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

const editReminderRepeatButton =
  document.getElementById("editReminderRepeatButton");

const reminderDelayGrid =
  document.querySelector(".reminderDelayGrid");

const reminderQuickDateTime =
  document.querySelector(".reminderQuickDateTime");

const saveReminderQuickDateButton =
  document.getElementById("saveReminderQuickDateButton");

const rychleOpakovaniPravidlo =
  document.getElementById("reminderQuickRepeatRule");

const rychleOpakovaniDalsi =
  document.getElementById("reminderQuickRepeatNext");

const rychleOpakovaniPredchozi =
  document.getElementById("reminderQuickRepeatPrevious");

const rychleOpakovaniPredchoziPopisek =
  document.getElementById("reminderQuickRepeatPreviousLabel");

const rychleOpakovaniPredchoziHodnota =
  document.getElementById("reminderQuickRepeatPreviousValue");

const recurringDeleteConfirmModal =
  document.getElementById("recurringDeleteConfirmModal");

const cancelRecurringDeleteButton =
  document.getElementById("cancelRecurringDeleteButton");

const confirmRecurringDeleteButton =
  document.getElementById("confirmRecurringDeleteButton");

const recurringCompleteConfirmModal =
  document.getElementById("recurringCompleteConfirmModal");

const recurringCompleteConfirmText =
  document.getElementById("recurringCompleteConfirmText");

const cancelRecurringCompleteButton =
  document.getElementById("cancelRecurringCompleteButton");

const confirmRecurringCompleteButton =
  document.getElementById("confirmRecurringCompleteButton");

let cekajiciSmazaniOpakovanePoznamkyId = null;
let cekajiciDokonceniOpakovanePoznamky = null;
let preskocitPotvrzeniOpakovanehoDokonceniJednou = false;


function formatujDatumCasRychlehoOpakovani(hodnota) {
  const datum = hodnota instanceof Date
    ? hodnota
    : new Date(hodnota);

  if (Number.isNaN(datum.getTime())) {
    return "—";
  }

  const jazyk =
    window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ";

  const textData = datum.toLocaleDateString(jazyk, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short"
  });

  const textCasu = datum.toLocaleTimeString(jazyk, {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${textData} v ${textCasu}`;
}

function najdiPredchoziTerminRychlehoOpakovani(
  poznamka,
  referencniHodnota
) {
  if (
    poznamka?.repeat?.enabled !== true ||
    !window.LubaNoteRecurring?.jeDatumVOpakovani
  ) {
    return null;
  }

  const referencniDatum = new Date(
    referencniHodnota || poznamka.date
  );

  if (Number.isNaN(referencniDatum.getTime())) {
    return null;
  }

  const zaklad = new Date(
    poznamka.date || referencniDatum
  );
  const hodiny = Number.isNaN(zaklad.getTime())
    ? referencniDatum.getHours()
    : zaklad.getHours();
  const minuty = Number.isNaN(zaklad.getTime())
    ? referencniDatum.getMinutes()
    : zaklad.getMinutes();

  for (let i = 1; i <= 370; i++) {
    const kandidat = new Date(
      referencniDatum.getFullYear(),
      referencniDatum.getMonth(),
      referencniDatum.getDate() - i,
      hodiny,
      minuty,
      0,
      0
    );

    if (
      window.LubaNoteRecurring.jeDatumVOpakovani(
        kandidat,
        poznamka.repeat
      )
    ) {
      return kandidat;
    }
  }

  return null;
}

function aktualizujSouhrnRychlehoOpakovani(
  polozka,
  zobrazeneDatum
) {
  if (!editReminderRepeatButton) {
    return;
  }

  const poznamka =
    polozka?.sourceNoteId && typeof loadTask === "function"
      ? loadTask().find(
          (kandidat) =>
            kandidat?.id === polozka.sourceNoteId
        ) || null
      : null;

  if (poznamka?.repeat?.enabled !== true) {
    if (rychleOpakovaniPredchozi) {
      rychleOpakovaniPredchozi.hidden = true;
    }
    return;
  }

  const pravidlo =
    window.LubaNoteRecurring?.formatujPravidlo?.(
      poznamka.repeat
    ) || remindersT("recurring.repeat", "Opakování");

  const zakladniDatum = new Date(
    poznamka.date || zobrazeneDatum
  );
  const textCasu = Number.isNaN(zakladniDatum.getTime())
    ? ""
    : zakladniDatum.toLocaleTimeString(
        window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  if (rychleOpakovaniPravidlo) {
    rychleOpakovaniPravidlo.textContent = textCasu
      ? remindersT("recurring.ruleAt", `${pravidlo} v ${textCasu}`, { rule: pravidlo, time: textCasu })
      : pravidlo;
  }

  if (rychleOpakovaniDalsi) {
    const textDalsihoVyskytu =
      formatujDatumCasRychlehoOpakovani(
        zobrazeneDatum
      );

    rychleOpakovaniDalsi.textContent =
      remindersT("recurring.nextOccurrence", `Další výskyt: ${textDalsihoVyskytu}`, { value: textDalsihoVyskytu });
  }

  const predchoziDatum =
    najdiPredchoziTerminRychlehoOpakovani(
      poznamka,
      zobrazeneDatum
    );

  if (rychleOpakovaniPredchozi) {
    rychleOpakovaniPredchozi.hidden = false;
  }

  if (predchoziDatum) {
    if (rychleOpakovaniPredchoziPopisek) {
      rychleOpakovaniPredchoziPopisek.textContent =
        remindersT("recurring.previousOccurrence", "Předchozí výskyt");
    }

    if (rychleOpakovaniPredchoziHodnota) {
      rychleOpakovaniPredchoziHodnota.textContent =
        formatujDatumCasRychlehoOpakovani(
          predchoziDatum
        );
    }
  } else {
    const pocatecniDatum = poznamka.repeat?.startDate;
    const pocatecniHodnota = pocatecniDatum
      ? new Date(
          `${pocatecniDatum}T${textCasu || "00:00"}:00`
        )
      : null;

    if (rychleOpakovaniPredchoziPopisek) {
      rychleOpakovaniPredchoziPopisek.textContent =
        remindersT("recurring.start", "Začátek opakování");
    }

    if (rychleOpakovaniPredchoziHodnota) {
      rychleOpakovaniPredchoziHodnota.textContent =
        pocatecniHodnota
          ? formatujDatumCasRychlehoOpakovani(
              pocatecniHodnota
            )
          : "—";
    }
  }

  window.LubaNoteIcons?.naplnDeklarovaneIkony?.(
    editReminderRepeatButton
  );

  if (rychleOpakovaniPredchozi) {
    window.LubaNoteIcons?.naplnDeklarovaneIkony?.(
      rychleOpakovaniPredchozi
    );
  }
}

// The original reminder menu owns this state. Only a successful action
// resolves the delivered native notification; simply closing does not.
let remoteQuickMenu692T = null;
function resolveRemoteAfterSave692T(entry) {
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  const noteId = String(entry?.sourceNoteId || entry?.id || '');
  if (!/^[\w:-]{1,128}$/.test(noteId) || typeof plugin?.resolveRemoteAlarm !== 'function') return;
  const opened = remoteQuickMenu692T;
  const matchingOpen = opened && opened.noteId === noteId &&
    opened.kind === entry.kind && String(opened.id) === String(entry.id);
  const at = matchingOpen ? opened.at : new Date(entry.date).getTime();
  if (!Number.isSafeInteger(at) || at <= 0) return;
  // Never block the existing save/navigation flow on a native UI cleanup.
  try {
    Promise.resolve(plugin.resolveRemoteAlarm({noteId, at:String(at)})).catch(() => {});
  } catch { /* notification cleanup must never undo a saved action */ }
}

function closeReminderQuickMenu() {
  remoteQuickMenu692T = null;
  if (!reminderQuickMenu) {
    return;
  }

  reminderQuickMenu.hidden = true;
  selectedReminderEntry = null;
  selectedReminderContext = "reminders";
  selectedReminderDateOverride = null;

  /* Skrytý modal nesmí v DOM držet náhled případné tajné poznámky. */
  if (reminderQuickPreview) {
    reminderQuickPreview.textContent = "";
    reminderQuickPreview.hidden = true;
  }
}


function openReminderQuickMenu(
  entry,
  { context = "reminders", dateOverride = null } = {}
) {
  if (!reminderQuickMenu || !entry) {
    return;
  }

  remoteQuickMenu692T = null;
  selectedReminderEntry = {
    kind: entry.kind,
    id: entry.id
  };
  selectedReminderContext =
    context === "planner" ? "planner" : "reminders";
  selectedReminderDateOverride = dateOverride || null;

  /* 693F: Zpřístupni modal ihned po výběru položky. Další kroky
     pouze doplňují štítky, datum a ikony; chybná nepovinná ikona
     tak už nemůže zcela zabránit jeho zobrazení. Prohlížeč vykreslí
     vše až po dokončení této synchronní funkce. */
  reminderQuickMenu.hidden = false;

  const zobrazeneDatum =
    selectedReminderDateOverride || entry.date;
  const termin = new Date(zobrazeneDatum);
  const jePoTerminu =
    !Number.isNaN(termin.getTime()) &&
    termin.getTime() < Date.now();

  const jePlannerMenu =
    selectedReminderContext === "planner";

  if (reminderQuickLabel) {
    reminderQuickLabel.classList.toggle(
      "reminderQuickTaskLabel",
      jePlannerMenu || entry.kind === "planned"
    );

    if (jePlannerMenu || entry.kind === "planned") {
      reminderQuickLabel.textContent = "Úkol:";
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
    if (jePlannerMenu || entry.kind === "planned") {
      const zdrojovaPoznamka =
        entry.sourceNoteId &&
        typeof loadTask === "function"
          ? loadTask().find(
              (task) => task?.id === entry.sourceNoteId
            ) || null
          : null;

      const nazevZdrojoveKarty =
        String(zdrojovaPoznamka?.title || "").trim();
      const nazevUkolu =
        String(entry.title || "").trim();
      const zobrazitZdroj =
        nazevZdrojoveKarty &&
        nazevZdrojoveKarty !== nazevUkolu;

      reminderQuickPreview.replaceChildren();

      if (zobrazitZdroj) {
        const zdrojLabel =
          document.createElement("span");
        zdrojLabel.className =
          "reminderQuickSourceLabel";
        zdrojLabel.textContent = "Z karty:";

        const zdrojTitle =
          document.createElement("span");
        zdrojTitle.className =
          "reminderQuickSourceTitle";
        zdrojTitle.textContent = nazevZdrojoveKarty;

        reminderQuickPreview.append(
          zdrojLabel,
          document.createTextNode(" "),
          zdrojTitle
        );
      }

      reminderQuickPreview.hidden = !zobrazitZdroj;
    } else {
      const preview =
        String(entry.preview || "").trim();

      reminderQuickPreview.textContent = preview;
      reminderQuickPreview.hidden = !preview;
    }
  }

  const date = new Date(zobrazeneDatum);

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

  const jePlanner =
    selectedReminderContext === "planner";
  const jeOpakovana =
    entry.kind === "note" &&
    entry.sourceType === "recurring-note";
  const pripominkaZapnuta =
    entry.reminder === true;

  const panelRychlehoMenu =
    reminderQuickMenu?.querySelector?.(
      ".reminderQuickSheet"
    );

  panelRychlehoMenu?.classList.toggle(
    "reminderQuickPlannerTask",
    jePlanner
  );
  panelRychlehoMenu?.classList.toggle(
    "reminderQuickRecurringTask",
    jePlanner && jeOpakovana
  );

  const lzeVratitPlanovanyUkol =
    jePlanner &&
    entry.kind === "planned" &&
    entry.completed === true;

  if (completeReminderButton) {
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        completeReminderButton,
        lzeVratitPlanovanyUkol ? "zpet" : "hotovo",
        lzeVratitPlanovanyUkol ? "Vrátit" : "Hotovo"
      );
    } else {
      completeReminderButton.textContent =
        lzeVratitPlanovanyUkol ? "Vrátit" : "Hotovo";
    }
  }

  if (reminderDelayGrid) {
    reminderDelayGrid.hidden = jePlanner;
  }

  if (reminderQuickDateTime) {
    reminderQuickDateTime.hidden =
      jePlanner && jeOpakovana;
  }

  if (saveReminderQuickDateButton) {
    saveReminderQuickDateButton.hidden =
      jePlanner && jeOpakovana;

    if (!saveReminderQuickDateButton.hidden) {
      if (window.LubaNoteIcons?.nastavObsahSIkonou) {
        window.LubaNoteIcons.nastavObsahSIkonou(
          saveReminderQuickDateButton,
          "kalendar",
          "Termín"
        );
      } else {
        saveReminderQuickDateButton.textContent =
          "Termín";
      }
    }
  }

  if (editReminderRepeatButton) {
    editReminderRepeatButton.hidden =
      !(jePlanner && jeOpakovana);

    if (!editReminderRepeatButton.hidden) {
      aktualizujSouhrnRychlehoOpakovani(
        entry,
        zobrazeneDatum
      );
    } else if (rychleOpakovaniPredchozi) {
      rychleOpakovaniPredchozi.hidden = true;
    }
  }

  const openReminderNoteButton =
    document.getElementById("openReminderNoteButton");

  if (openReminderNoteButton) {
    const popisekOtevrit = remindersT("actions.open", "Otevřít");

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        openReminderNoteButton,
        "poznamky",
        popisekOtevrit
      );
    } else {
      openReminderNoteButton.textContent = popisekOtevrit;
    }
  }

  if (deleteReminderButton) {
    const popisekSmazat = remindersT("actions.delete", "Smazat");

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        deleteReminderButton,
        "smazat",
        popisekSmazat
      );
    } else {
      deleteReminderButton.textContent = popisekSmazat;
    }
  }

  if (disableReminderButton) {
    const popisek = pripominkaZapnuta
      ? (jePlanner && jeOpakovana
          ? remindersT("recurring.turnOff", "Vypnout opakování")
          : remindersT("reminders.turnOffShort", "Vypnout"))
      : remindersT("reminders.remind", "Připomenout");

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        disableReminderButton,
        pripominkaZapnuta ? "vypnoutZvonek" : "zvonek",
        popisek
      );
    } else {
      disableReminderButton.textContent = popisek;
    }

    disableReminderButton.classList.toggle(
      "danger",
      pripominkaZapnuta
    );
  }

const vychoziRychleOdlozeni = {
  volba1: "15", volba2: "30", volba3: "60", volba4: "tomorrow@08:00"
};
let ulozeneRychleOdlozeni = {};
try {
  const raw = JSON.parse(localStorage.getItem("rychleOdlozeni") || "null");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    ulozeneRychleOdlozeni = raw;
  }
} catch (_) {}
const platnyInterval = (hodnota) => {
  const minuty = Number(hodnota);
  return String(hodnota).trim() !== "" && Number.isInteger(minuty) &&
    minuty >= 1 && minuty <= 10080;
};
const rychleOdlozeni = {};
Object.keys(vychoziRychleOdlozeni).forEach((klic) => {
  const hodnota = String(ulozeneRychleOdlozeni[klic] ?? "");
  rychleOdlozeni[klic] = klic === "volba4"
    ? (window.LubaNoteTomorrowSnooze683BT?.parse(hodnota) || vychoziRychleOdlozeni[klic])
    : (platnyInterval(hodnota) ? hodnota : vychoziRychleOdlozeni[klic]);
});
const formatOdlozeni = (hodnota) => {
  if (window.LubaNoteTomorrowSnooze683BT?.parse(hodnota)) {
    return window.LubaNoteTomorrowSnooze683BT.format(hodnota);
  }
  const minuty = Number(hodnota);
  if (!platnyInterval(hodnota)) return "—";
  if (minuty < 60) return `+ ${minuty} min`;
  const dny = Math.floor(minuty / 1440);
  const hodiny = Math.floor((minuty % 1440) / 60);
  const zbytek = minuty % 60;
  return "+ " + [
    dny ? `${dny} d` : "",
    hodiny ? `${hodiny} h` : "",
    zbytek ? `${zbytek} min` : ""
  ].filter(Boolean).join(" ");
};

const tlacitkaOdlozeni = document.querySelectorAll("[data-reminder-delay]");
const hodnotyOdlozeni = [
  rychleOdlozeni.volba1,
  rychleOdlozeni.volba2,
  rychleOdlozeni.volba3
];
tlacitkaOdlozeni.forEach((tlacitko, index) => {
  const hodnota = hodnotyOdlozeni[index];
  if (!hodnota) return;
  tlacitko.dataset.reminderDelay = hodnota;
  tlacitko.textContent = formatOdlozeni(hodnota);
});
const zitraTlacitko = document.getElementById("reminderTomorrowMorningButton");
if (zitraTlacitko) {
  zitraTlacitko.textContent = formatOdlozeni(rychleOdlozeni.volba4);
}
}


function getSelectedReminderEntry() {
  if (!selectedReminderEntry) {
    return null;
  }

  const entry = getReminderEntry(
    selectedReminderEntry.kind,
    selectedReminderEntry.id
  );

  if (!entry || !selectedReminderDateOverride) {
    return entry;
  }

  return {
    ...entry,
    date: selectedReminderDateOverride
  };
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


async function saveReminderDate(
  taskId,
  newDate,
  { zachovatStavPripominky = false } = {}
) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === taskId
  );

  if (index === -1) {
    return false;
  }

  const currentTask = tasks[index];
  const jePlannerZmenaTerminu =
    selectedReminderContext === "planner";
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

  const zustanePripominka =
    zachovatStavPripominky
      ? currentTask.reminder === true
      : true;

  const updatedTask = {
    ...currentTask,
    date: noveDatum,
    repeat: aktualizovaneRepeat,
    planned: true,
    reminder: zustanePripominka,
    notificationId:
      zustanePripominka
        ? newNotificationId
        : currentTask.notificationId,
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
  resolveRemoteAfterSave692T({kind:'note', id:taskId, sourceNoteId:taskId, date:currentTask.date});

  /*
   * UI se vrátí okamžitě. Android alarm a cloud se dorovnají
   * na pozadí a už neblokují kliknutí uživatele.
   */
  closeReminderQuickMenu();

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  if (typeof renderTasks === "function") {
    requestAnimationFrame(renderTasks);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky(
    jePlannerZmenaTerminu
      ? "Termín změněn"
      : "Připomínka odložena"
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

  const jePlannerZmenaTerminu =
    selectedReminderContext === "planner";
  const oldNotificationId =
    item.notificationId || null;
  const reminderZapnuta =
    jePlanovanaPripominkaZapnuta(item);

  const updatedItem = {
    ...item,
    plannedAt: formatReminderLocalDateTime(newDate),
    reminder: reminderZapnuta,
    notificationId:
      reminderZapnuta
        ? createUniqueNotificationId()
        : item.notificationId
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
  resolveRemoteAfterSave692T({kind:'planned', id:itemId, sourceNoteId:item.sourceNoteId, date:item.plannedAt});
  closeReminderQuickMenu();

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky(
    jePlannerZmenaTerminu
      ? "Termín změněn"
      : "Úkol byl odložen"
  );

  spustPripominkovouUlohuNaPozadi(
    async () => {
      if (oldNotificationId) {
        await cancelNotification(
          oldNotificationId
        );
      }

      if (
        reminderZapnuta &&
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
  const entry = getSelectedReminderEntry();
  if (!entry) return;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem("rychleOdlozeni") || "null")?.volba4;
  } catch (_) {}
  // 683BT: fourth button never means minutes, even with legacy saved settings.
  const tomorrow = window.LubaNoteTomorrowSnooze683BT.nextDate(stored);
  if (entry.kind === "planned") {
    await savePlannedReminderDate(entry.id, tomorrow);
  } else {
    await saveReminderDate(entry.id, tomorrow);
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
      selectedReminderContext === "planner"
        ? remindersT("modules.planner", "Plán")
        : remindersT("modules.reminders", "Připomínky"),
      selectedReminderContext === "planner"
        ? remindersT("planner.futureRequired", "Termín musí být nastaven do budoucna.")
        : remindersT("reminders.futureRequired", "Připomínka musí být nastavena do budoucna.")
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
      newDate,
      {
        zachovatStavPripominky:
          selectedReminderContext === "planner"
      }
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
    planned:
      currentTask.planned === true ||
      currentTask.reminder === true ||
      currentTask.repeat?.enabled === true,
    reminder: false,
    updatedAt: new Date().toISOString()
  };

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      remindersT("reminders.turningOff", "Vypínám připomínku…"),
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
      remindersT("modules.reminders", "Připomínky"),
      remindersT("reminders.turnOffFailed", "Připomínku se nepodařilo bezpečně vypnout.")
    );
    return false;
  }

  ukonciCekani();
  resolveRemoteAfterSave692T(entry);

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
   * Označený text má kromě backlinku uložený i rozsah výběru.
   * Ten použijeme jako druhý nezávislý důkaz původu položky.
   * Chrání to starší / neúplně synchronizovaná data, kde mohl být
   * sourceType chybně "note" nebo backlink dočasně chybět.
   * Takový Planner úkol pak nikdy nesmí dokončit ani vypnout reminder
   * celé zdrojové poznámky.
   */
  const maSelectionRozsah =
    item.selectionStart !== null &&
    item.selectionStart !== undefined &&
    item.selectionEnd !== null &&
    item.selectionEnd !== undefined &&
    Number(item.selectionEnd) >
      Number(item.selectionStart);

  if (
    item.sourceType === "selection" ||
    maSelectionRozsah
  ) {
    return "selection";
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


function jePoznamkaOtevrenaVCoreV2(noteId) {
  const modal = document.getElementById("taskModal");
  return Boolean(
    noteId &&
    modal?.classList?.contains("show") &&
    String(modal?.dataset?.taskId || "") === String(noteId) &&
    window.LubaNoteEditorV2Bridge?.jeAktivni?.() === true
  );
}

function aktualizujOtevreneTodoCoreV2(noteId, todoId, { hotovo, naplanovano } = {}) {
  if (!jePoznamkaOtevrenaVCoreV2(noteId) || !todoId) return;
  const bridge = window.LubaNoteEditorV2Bridge;
  if (typeof hotovo === "boolean") bridge?.nastavTodoHotovo?.(todoId, hotovo);
  if (typeof naplanovano === "boolean") bridge?.nastavTodoNaplanovane?.(todoId, naplanovano);
}

function aktualizujOtevrenyPlanLinkCoreV2(noteId, plannedItemId, akce) {
  if (!jePoznamkaOtevrenaVCoreV2(noteId) || !plannedItemId) return;
  window.LubaNoteEditorV2Bridge?.aktualizujPlanovanyOdkaz?.(plannedItemId, akce);
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

  if (action === "restore") {
    link.classList.remove("plannedTextLinkCompleted");
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

      aktualizujOtevreneTodoCoreV2(
        sourceNote.id,
        item.sourceTodoId,
        { hotovo: true, naplanovano: false }
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
      aktualizujOtevrenyPlanLinkCoreV2(sourceNote.id, item.id, "complete");
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

    if (bezpecnySourceType === "selection") {
      aktualizujOtevrenyPlanLinkCoreV2(sourceNote.id, item.id, "complete");
    }
  }

  resolveRemoteAfterSave692T(entry);
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


async function restoreSelectedPlannedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry || entry.kind !== "planned") {
    return false;
  }

  const item = getPlannedItemById(entry.id);

  if (!item || item.completed !== true) {
    return false;
  }

  zapocitejPouzitiTlacitkaPripominky(
    "restore",
    "planned"
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task.id === item.sourceNoteId
  );
  const sourceNote =
    noteIndex !== -1 ? tasks[noteIndex] : null;
  const bezpecnySourceType =
    ziskejBezpecnyTypPlanovanePolozky(
      item,
      sourceNote
    );
  const pripominkaZapnuta =
    jePlanovanaPripominkaZapnuta(item);
  const terminJeVBudoucnu =
    Boolean(item.plannedAt) &&
    new Date(item.plannedAt) > new Date();

  const restoredItem = {
    ...item,
    sourceType: bezpecnySourceType,
    completed: false,
    completedAt: null,
    notificationId:
      pripominkaZapnuta && terminJeVBudoucnu
        ? createUniqueNotificationId()
        : item.notificationId || null
  };

  const allItems = loadPlannedItems().map(
    (candidate) =>
      candidate.id === item.id
        ? restoredItem
        : candidate
  );

  if (sourceNote) {
    if (bezpecnySourceType === "note") {
      sourceNote.completed = false;
      sourceNote.planned = true;

      if (pripominkaZapnuta && terminJeVBudoucnu) {
        sourceNote.reminder = true;
        sourceNote.notificationId =
          sourceNote.notificationId ||
          createUniqueNotificationId();
      }
    }

    if (
      bezpecnySourceType === "todo" &&
      item.sourceTodoId
    ) {
      sourceNote.todos = Array.isArray(sourceNote.todos)
        ? sourceNote.todos.map(
            (todo) =>
              todo?.id === item.sourceTodoId
                ? {
                    ...todo,
                    completed: false
                  }
                : todo
          )
        : [];

      aktualizujOtevreneTodoCoreV2(
        sourceNote.id,
        item.sourceTodoId,
        { hotovo: false, naplanovano: true }
      );
    }

    sourceNote.plannedItems =
      Array.isArray(sourceNote.plannedItems)
        ? sourceNote.plannedItems.map(
            (candidate) =>
              candidate.id === item.id
                ? restoredItem
                : candidate
          )
        : [restoredItem];

    if (!sourceNote.plannedItems.some(
      (candidate) => candidate.id === item.id
    )) {
      sourceNote.plannedItems.push(restoredItem);
    }

    if (bezpecnySourceType === "selection") {
      updatePlannedLinkHtml(
        sourceNote,
        item.id,
        "restore"
      );
      aktualizujOtevrenyPlanLinkCoreV2(sourceNote.id, item.id, "restore");
    }

    sourceNote.updatedAt =
      new Date().toISOString();
  }

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Vracím úkol…",
      300
    ) || (() => {});

  try {
    await ulozZmenuPripominkyLokalne(
      async () => {
        savePlannedItems(allItems);

        if (sourceNote) {
          await saveAllTasks(tasks);
        }
      },
      sourceNote
    );
  } catch (error) {
    ukonciCekani();
    console.error(
      "Vrácení Planner úkolu selhalo:",
      error
    );
    return false;
  }

  ukonciCekani();
  closeReminderQuickMenu();

  if (
    sourceNote &&
    pripominkaZapnuta &&
    terminJeVBudoucnu
  ) {
    spustPripominkovouUlohuNaPozadi(
      () =>
        obnovNotifikacePoznamkyPodleSoukromi(
          sourceNote
        ),
      "Obnovení připomínky vráceného úkolu"
    );
  }

  if (bezpecnySourceType === "selection" && sourceNote) {
    aktualizujOtevrenyPlanLinkCoreV2(sourceNote.id, item.id, "restore");
  }

  if (typeof renderCalendar === "function") {
    requestAnimationFrame(renderCalendar);
  }

  if (typeof renderTasks === "function") {
    requestAnimationFrame(renderTasks);
  }

  requestAnimationFrame(renderRemindersScreen);
  zobrazPotvrzeniPripominky("Úkol vrácen");
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
    aktualizujOtevrenyPlanLinkCoreV2(sourceNote.id, item.id, "remove");

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

  resolveRemoteAfterSave692T(entry);
  return true;
}


async function nastavPripominkuPlanovanePolozky(
  entry,
  enabled
) {
  const item = getPlannedItemById(entry.id);

  if (!item) {
    return false;
  }

  if (
    enabled &&
    new Date(item.plannedAt) <= new Date()
  ) {
    zobrazZpravuAplikace(
      remindersT("modules.planner", "Plán"),
      remindersT("planner.changeFutureFirst", "Nejdřív změň termín úkolu do budoucna.")
    );
    return false;
  }

  const oldNotificationId =
    item.notificationId || null;
  const updatedItem = {
    ...item,
    reminder: enabled === true,
    notificationId:
      enabled === true
        ? createUniqueNotificationId()
        : item.notificationId
  };

  const allItems = loadPlannedItems().map(
    (candidate) =>
      candidate.id === item.id
        ? updatedItem
        : candidate
  );

  const tasks = loadTask();
  const noteIndex = tasks.findIndex(
    (task) => task?.id === item.sourceNoteId
  );
  const sourceNote =
    noteIndex >= 0 ? tasks[noteIndex] : null;

  if (sourceNote) {
    sourceNote.plannedItems =
      Array.isArray(sourceNote.plannedItems)
        ? sourceNote.plannedItems.map(
            (candidate) =>
              candidate.id === item.id
                ? updatedItem
                : candidate
          )
        : [updatedItem];

    if (!sourceNote.plannedItems.some(
      (candidate) => candidate.id === item.id
    )) {
      sourceNote.plannedItems.push(updatedItem);
    }

    sourceNote.updatedAt = new Date().toISOString();
  }

  try {
    await ulozZmenuPripominkyLokalne(
      async () => {
        savePlannedItems(allItems);
        if (sourceNote) {
          await saveAllTasks(tasks);
        }
      },
      sourceNote
    );
  } catch (error) {
    console.error(
      "Změna připomenutí Planner úkolu selhala:",
      error
    );
    return false;
  }

  if (sourceNote) {
    spustPripominkovouUlohuNaPozadi(
      () =>
        obnovNotifikacePoznamkyPodleSoukromi(
          sourceNote
        ),
      "Změna Planner připomenutí"
    );
  } else if (!enabled && oldNotificationId) {
    spustPripominkovouUlohuNaPozadi(
      () => cancelNotification(oldNotificationId),
      "Vypnutí Planner připomenutí"
    );
  }

  if (!enabled) resolveRemoteAfterSave692T(entry);
  zobrazPotvrzeniPripominky(
    enabled
      ? remindersT("reminders.enabled", "Připomenutí zapnuto")
      : remindersT("reminders.disabled", "Připomenutí vypnuto")
  );

  return true;
}

async function zapniSelectedNoteReminder(entry) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task?.id === entry.id
  );

  if (index === -1) {
    return false;
  }

  const currentTask = tasks[index];

  if (new Date(currentTask.date) <= new Date()) {
    zobrazZpravuAplikace(
      remindersT("modules.planner", "Plán"),
      remindersT("planner.changeFutureFirst", "Nejdřív změň termín úkolu do budoucna.")
    );
    return false;
  }

  const updatedTask = {
    ...currentTask,
    planned: true,
    reminder: true,
    notificationId: createUniqueNotificationId(),
    updatedAt: new Date().toISOString()
  };

  try {
    await ulozZmenuPripominkyLokalne(
      () => updateTask(index, updatedTask),
      updatedTask
    );
  } catch (error) {
    console.error(
      "Zapnutí připomínky poznámky selhalo:",
      error
    );
    return false;
  }

  spustPripominkovouUlohuNaPozadi(
    () =>
      obnovNotifikacePoznamkyPodleSoukromi(
        updatedTask
      ),
    "Zapnutí Android připomínky"
  );

  zobrazPotvrzeniPripominky(
    remindersT("reminders.enabled", "Připomenutí zapnuto")
  );
  return true;
}

async function disableSelectedReminder() {
  const entry = getSelectedReminderEntry();

  if (!entry) {
    return;
  }

  let uspesne = false;

  if (entry.kind === "planned") {
    uspesne = await nastavPripominkuPlanovanePolozky(
      entry,
      entry.reminder !== true
    );
  } else if (entry.reminder === true) {
    uspesne = await disableSelectedNoteReminder(entry);
  } else {
    uspesne = await zapniSelectedNoteReminder(entry);
  }

  if (!uspesne) {
    return;
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }
  if (typeof renderCalendarAgenda === "function") {
    renderCalendarAgenda();
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


function zavriPotvrzeniSmazaniOpakovanePoznamky() {
  if (recurringDeleteConfirmModal) {
    recurringDeleteConfirmModal.hidden = true;
  }

  cekajiciSmazaniOpakovanePoznamkyId = null;
}


function otevriPotvrzeniSmazaniOpakovanePoznamky(noteId) {
  if (!recurringDeleteConfirmModal || !noteId) {
    return false;
  }

  cekajiciSmazaniOpakovanePoznamkyId = noteId;
  recurringDeleteConfirmModal.hidden = false;
  return true;
}


cancelRecurringDeleteButton?.addEventListener(
  "click",
  zavriPotvrzeniSmazaniOpakovanePoznamky
);

recurringDeleteConfirmModal?.addEventListener(
  "click",
  (event) => {
    if (event.target === recurringDeleteConfirmModal) {
      zavriPotvrzeniSmazaniOpakovanePoznamky();
    }
  }
);

confirmRecurringDeleteButton?.addEventListener(
  "click",
  async () => {
    const noteId =
      cekajiciSmazaniOpakovanePoznamkyId;

    if (!noteId) {
      zavriPotvrzeniSmazaniOpakovanePoznamky();
      return;
    }

    /*
     * Opakovaná poznámka může mít v Androidu několik budoucích alarmů.
     * Před přesunem celé karty do Koše je zrušíme podle taskId.
     * Samotný přesun pak vždy vede přes existující deleteTask(), aby
     * zůstal zachovaný Koš, Planner cleanup i cloudová synchronizace.
     */
    if (
      typeof zrusCekajiciOpakovaneNotifikacePoznamky ===
        "function"
    ) {
      await zrusCekajiciOpakovaneNotifikacePoznamky(
        noteId
      );
    }

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        "Přesouvám opakovaný úkol do Koše…",
        300
      ) || (() => {});

    let smazano = false;

    try {
      smazano =
        await smazCelouPoznamkuZPripominek(
          noteId
        );
    } catch (error) {
      console.error(
        "Smazání opakovaného úkolu selhalo:",
        error
      );
    } finally {
      ukonciCekani();
      zavriPotvrzeniSmazaniOpakovanePoznamky();
    }

    if (!smazano) {
      return;
    }

    if (typeof renderCalendar === "function") {
      renderCalendar();
    }

    if (typeof renderRecurringOverview === "function") {
      renderRecurringOverview();
    }

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    renderRemindersScreen();
    zobrazPotvrzeniPripominky(
      "Opakovaný úkol přesunut do Koše"
    );
  }
);


function vypocitejDalsiTerminOpakovanePoznamky(
  note,
  datumVyskytu = null
) {
  if (
    note?.repeat?.enabled !== true ||
    !note?.date ||
    !window.LubaNoteRecurring
  ) {
    return null;
  }

  const aktualniVyskyt = new Date(
    datumVyskytu || note.date
  );

  const hledatOd = Number.isNaN(
    aktualniVyskyt.getTime()
  )
    ? new Date()
    : new Date(
        aktualniVyskyt.getTime() + 60000
      );

  return window.LubaNoteRecurring
    ?.vypocitejPristiTermin?.(
      note.date,
      note.repeat,
      hledatOd
    ) || null;
}


function formatujTerminOpakovaniProPotvrzeni(datum) {
  const hodnota = datum instanceof Date
    ? datum
    : new Date(datum);

  if (Number.isNaN(hodnota.getTime())) {
    return "neznámý termín";
  }

  return hodnota.toLocaleString(
    window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
    {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


function zavriPotvrzeniDokonceniOpakovanePoznamky() {
  if (recurringCompleteConfirmModal) {
    recurringCompleteConfirmModal.hidden = true;
  }

  cekajiciDokonceniOpakovanePoznamky = null;
}


function otevriPotvrzeniDokonceniOpakovanePoznamky(
  entry,
  note
) {
  if (
    !recurringCompleteConfirmModal ||
    !entry ||
    !note?.id ||
    note.repeat?.enabled !== true
  ) {
    return false;
  }

  const aktualniTermin = new Date(
    entry.date || note.date
  );
  const dalsiTermin =
    vypocitejDalsiTerminOpakovanePoznamky(
      note,
      entry.date
    );

  cekajiciDokonceniOpakovanePoznamky = {
    noteId: note.id,
    context: selectedReminderContext,
    dateOverride: entry.date || note.date
  };

  if (recurringCompleteConfirmText) {
    const aktualniText =
      formatujTerminOpakovaniProPotvrzeni(
        aktualniTermin
      );

    if (dalsiTermin) {
      const dalsiText =
        formatujTerminOpakovaniProPotvrzeni(
          dalsiTermin
        );

      recurringCompleteConfirmText.textContent =
        `Výskyt ${aktualniText} bude označen jako hotový. ` +
        `Další plánování série se posune na ${dalsiText}.`;
    } else {
      recurringCompleteConfirmText.textContent =
        `Výskyt ${aktualniText} bude označen jako hotový. ` +
        "Toto je poslední výskyt série, takže další termín už nebude naplánován.";
    }
  }

  if (confirmRecurringCompleteButton) {
    const maDalsiTermin = Boolean(dalsiTermin);
    const popisek = maDalsiTermin
      ? "Dokončit a posunout"
      : "Dokončit";

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        confirmRecurringCompleteButton,
        "hotovo",
        popisek
      );
    } else {
      confirmRecurringCompleteButton.textContent =
        popisek;
    }
  }

  /* Rychlé menu už pod potvrzením nemá zůstávat otevřené. */
  closeReminderQuickMenu();
  recurringCompleteConfirmModal.hidden = false;
  return true;
}


cancelRecurringCompleteButton?.addEventListener(
  "click",
  zavriPotvrzeniDokonceniOpakovanePoznamky
);

recurringCompleteConfirmModal?.addEventListener(
  "click",
  (event) => {
    if (event.target === recurringCompleteConfirmModal) {
      zavriPotvrzeniDokonceniOpakovanePoznamky();
    }
  }
);

confirmRecurringCompleteButton?.addEventListener(
  "click",
  () => {
    const cekajici =
      cekajiciDokonceniOpakovanePoznamky;

    if (!cekajici?.noteId) {
      zavriPotvrzeniDokonceniOpakovanePoznamky();
      return;
    }

    const entry = getReminderEntry(
      "note",
      cekajici.noteId
    );

    if (!entry) {
      zavriPotvrzeniDokonceniOpakovanePoznamky();
      return;
    }

    const context = cekajici.context;
    const dateOverride = cekajici.dateOverride;

    recurringCompleteConfirmModal.hidden = true;
    cekajiciDokonceniOpakovanePoznamky = null;

    nastavPolozkuProGesto(
      entry,
      context,
      dateOverride
    );

    /* Jediný potvrzený průchod použije stávající Hotovo logiku. */
    preskocitPotvrzeniOpakovanehoDokonceniJednou = true;
    completeReminderButton?.click();
  }
);


async function odeberCelouPoznamkuZPlanu(entry) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task?.id === entry.id
  );

  if (index === -1) {
    return false;
  }

  const currentTask = tasks[index];
  const oldNotificationId =
    currentTask.notificationId || null;

  const updatedTask = {
    ...currentTask,
    planned: false,
    reminder: false,
    updatedAt: new Date().toISOString()
  };

  try {
    await ulozZmenuPripominkyLokalne(
      () => updateTask(index, updatedTask),
      updatedTask
    );
  } catch (error) {
    console.error(
      "Odebrání poznámky z Plánu selhalo:",
      error
    );
    return false;
  }

  if (oldNotificationId) {
    spustPripominkovouUlohuNaPozadi(
      () => cancelNotification(oldNotificationId),
      "Zrušení připomínky odebrané z Plánu"
    );
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }
  if (typeof renderCalendar === "function") {
    renderCalendar();
  }
  if (typeof renderCalendarAgenda === "function") {
    renderCalendarAgenda();
  }
  renderRemindersScreen();
  zobrazPotvrzeniPripominky(
    "Poznámka odebrána z Plánu"
  );
  return true;
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
    const note =
      typeof loadTask === "function"
        ? loadTask().find(
            (task) => task?.id === entry.id
          )
        : null;

    if (
      selectedReminderContext === "planner" &&
      note?.repeat?.enabled !== true
    ) {
      await odeberCelouPoznamkuZPlanu(entry);
      closeReminderQuickMenu();
      return;
    }

    /*
     * U opakované připomínky má Smazat jiný význam než Vypnout:
     * uživatel výslovně odstraňuje CELÝ opakovaný úkol. Proto nejdřív
     * zobrazíme varování a po potvrzení použijeme centrální deleteTask(),
     * která kartu přesune do Koše a uklidí Planner + synchronizaci.
     */
    if (note?.repeat?.enabled === true) {
      zapocitejPouzitiTlacitkaPripominky(
        "delete_series",
        "note"
      );

      closeReminderQuickMenu();
      otevriPotvrzeniSmazaniOpakovanePoznamky(
        note.id
      );
      return;
    }

    /*
     * U běžné neopakované připomínky zachováváme dosavadní chování:
     * Smazat zde odstraní připomínku, ne zdrojovou kartu. Pro pouhé
     * vypnutí opakované série zůstává samostatná akce Vypnout.
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
      window.LubaNoteEditorV2Bridge
        ?.zobrazTodoPodleId?.(item.sourceTodoId);
    }, 150);

    return;
  }

  if (item.sourceType !== "selection") {
    return;
  }

  setTimeout(() => {
    const editor = window.LubaNoteEditorV2?.ziskejEditorElement?.();
    const plannedLink = editor?.querySelector(
      `[data-planned-item-id="${item.id}"]`
    );
    if (!editor || !plannedLink) return;

    const editorRect = editor.getBoundingClientRect();
    const linkRect = plannedLink.getBoundingClientRect();
    const targetTop =
      editor.scrollTop +
      (linkRect.top - editorRect.top) -
      (editor.clientHeight / 2) +
      (linkRect.height / 2);

    editor.scrollTo({
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
            aktualizujOtevreneTodoCoreV2(
              task.id,
              item.sourceTodoId,
              { naplanovano: false }
            );
          }

          updatePlannedLinkHtml(
            task,
            item.id,
            "remove"
          );
          aktualizujOtevrenyPlanLinkCoreV2(task.id, item.id, "remove");
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


function nastavPolozkuProGesto(
  entry,
  context = "reminders",
  dateOverride = null
) {
  if (!entry) {
    return false;
  }

  selectedReminderEntry = {
    kind: entry.kind,
    id: entry.id
  };
  selectedReminderContext =
    context === "planner" ? "planner" : "reminders";
  selectedReminderDateOverride = dateOverride || null;
  return true;
}


async function prepniDokonceniPolozkyGestem(
  kind,
  id,
  dateOverride = null,
  context = "planner"
) {
  const entry = getReminderEntry(kind, id);

  if (!nastavPolozkuProGesto(
    entry,
    context,
    dateOverride
  )) {
    return false;
  }

  if (entry.kind === "planned") {
    const item = getPlannedItemById(entry.id);

    if (item?.completed === true) {
      return await restoreSelectedPlannedReminder();
    }

    return await completeSelectedPlannedReminder();
  }

  /*
   * Celá poznámka (včetně opakované série) musí použít přesně stejnou
   * odladěnou akci Hotovo jako menu Připomínek. U opakování tato akce
   * posune pouze aktuální výskyt a proto nemá jednoduché Swipe zpět.
   */
  if (completeReminderButton) {
    completeReminderButton.click();
    return true;
  }

  return false;
}


function otevriSmazaniPolozkyGestem(
  kind,
  id,
  dateOverride = null,
  context = "planner"
) {
  const entry = getReminderEntry(kind, id);

  if (!entry) {
    return false;
  }

  const note =
    entry.kind === "note"
      ? getReminderTaskById(entry.id)
      : null;

  /*
   * Opakovaná série už má vlastní informační modal. Swipe proto jen
   * otevře právě ten – žádné druhé paralelní mazání ani dvojí potvrzení.
   */
  if (note?.repeat?.enabled === true) {
    closeReminderQuickMenu();
    return otevriPotvrzeniSmazaniOpakovanePoznamky(
      note.id
    );
  }

  const jePlanner = context === "planner";
  const nadpis = jePlanner
    ? (
        entry.kind === "planned"
          ? remindersT("reminders.deletePlannerTaskTitle", "Smazat úkol z plánu?")
          : remindersT("reminders.removeNoteFromPlanTitle", "Odebrat poznámku z plánu?")
      )
    : (
        entry.kind === "planned"
          ? remindersT("reminders.deletePlannedTitle", "Smazat naplánovaný úkol?")
          : remindersT("reminders.deleteReminderTitle", "Smazat připomínku?")
      );

  if (typeof window.otevriVyberovyModal !== "function") {
    /*
     * Bez LubaNote potvrzovacího modalu raději pouze otevřeme stávající
     * menu. Swipe nikdy nesmí provést destruktivní akci bez potvrzení.
     */
    openReminderQuickMenu(
      entry,
      {
        context,
        dateOverride
      }
    );
    return true;
  }

  window.otevriVyberovyModal({
    nadpis,
    moznosti: [
      {
        hodnota: "cancel",
        popisek: remindersT("actions.cancel", "Zrušit"),
        ikona: "zavrit"
      },
      {
        hodnota: "delete",
        popisek: remindersT("actions.delete", "Smazat"),
        ikona: "smazat"
      }
    ],
    poVyberu: async (hodnota) => {
      if (hodnota !== "delete") {
        return;
      }

      if (!nastavPolozkuProGesto(
        entry,
        context,
        dateOverride
      )) {
        return;
      }

      await deleteSelectedReminder();
    }
  });

  return true;
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

  /* PATCH 661K – pouze aktivní položky ve skupině POZDĚJI.
     Dnešek/Zítra ani Po termínu tímto cílením neměníme. */
  if (showDate && !overdue) {
    item.classList.add("reminderItemLaterDate");
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

    let textDatumu =
      date.toLocaleDateString(
        window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
        {
          weekday: "short",
          day: "numeric",
          month: "numeric"
        }
      );

    /* 661K – v aktivní skupině POZDĚJI zkrátíme český číselný
       zápis 22. 10. -> 22.10. Ostatní locale se nemění. */
    if (showDate && !overdue) {
      textDatumu = textDatumu.replace(
        /(\d+)\.\s+(\d+)\./u,
        "$1.$2."
      );
    }

    dateLine.textContent = textDatumu;
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

  /* 544 – první řádek jsou jen metadata, druhý název,
     třetí volitelný preview. Díky tomu se významy nemíchají. */
  const meta =
    document.createElement("div");

  meta.className =
    "reminderItemMeta";

  const areaIcon =
    window.LubaNoteIcons?.vytvorHostitele?.(
      entry.area === "work" ? "prace" : "soukrome",
      ["reminderItemMetaIcon", "reminderItemAreaIcon"]
    );

  if (areaIcon) {
    meta.append(areaIcon);
  }

  const typeIcon =
    window.LubaNoteIcons?.vytvorHostitele?.(
      entry.kind === "planned" ? "ukol" : "poznamky",
      [
        "reminderItemMetaIcon",
        "reminderItemTypeIcon",
        entry.kind === "planned"
          ? "reminderItemTypeTask"
          : "reminderItemTypeNote"
      ]
    );

  if (typeIcon) {
    meta.append(typeIcon);
  }

  const bellIcon =
    window.LubaNoteIcons?.vytvorHostitele?.(
      "zvonek",
      ["reminderItemMetaIcon", "reminderItemReminderIcon"]
    );

  if (bellIcon) {
    meta.append(bellIcon);
  }

  if (entry.sourceType === "recurring-note") {
    const repeatIcon =
      window.LubaNoteIcons?.vytvorHostitele?.(
        "opakovat",
        ["reminderItemMetaIcon", "reminderItemRepeatIcon"]
      );

    if (repeatIcon) {
      meta.append(repeatIcon);
    }
  }

  const title =
    document.createElement("div");

  title.className =
    "reminderItemTitle";
  title.textContent = entry.title || "Bez názvu";
  title.title = entry.title || "Bez názvu";

  content.append(meta, title);

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
    previewElement.title = preview;
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

  /* PATCH 661G – na mobilu/tabletu musí být celý vizuální obsah
     Připomínky jediný přímý swipe blok. Desktop timeline ponecháváme
     beze změny, aby se nenarušilo jeho samostatné rozložení. */
  const pouzitJednovrstvySwipe =
    !window.matchMedia?.(
      "(min-width: 1100px) and (hover: hover) and (pointer: fine)"
    )?.matches;

  if (pouzitJednovrstvySwipe) {
    const swipeContent = document.createElement("div");
    swipeContent.className = "reminderItemSwipeContent";
    swipeContent.append(time, content, menuButton);
    item.append(swipeContent);
  } else {
    item.append(time, content, menuButton);
  }

  window.LubaNoteSwipe?.pridejHotovo?.(
    item,
    {
      isCompleted: () => false,
      onComplete: async () => {
        await prepniDokonceniPolozkyGestem(
          entry.kind,
          entry.id,
          entry.date,
          "reminders"
        );
      },
      onDelete: () => {
        otevriSmazaniPolozkyGestem(
          entry.kind,
          entry.id,
          entry.date,
          "reminders"
        );
      }
    }
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

      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
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
      const item = getPlannedItemById(entry.id);

      if (item?.completed === true) {
        await restoreSelectedPlannedReminder();
      } else {
        await completeSelectedPlannedReminder();
      }
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
      const pripominkaPredDokoncenim =
        note.reminder === true;

      /*
       * U opakované poznámky znamená Hotovo dokončení pouze právě
       * zobrazeného výskytu. Samotná série musí zůstat aktivní.
       * Proto posuneme základní datum na následující výskyt a kartu
       * neoznačíme jako trvale dokončenou.
       */
      const jeOpakovanaPoznamka =
        note.repeat?.enabled === true &&
        Boolean(note.date) &&
        Boolean(window.LubaNoteRecurring);

      const potvrzeniUzProbehlo =
        preskocitPotvrzeniOpakovanehoDokonceniJednou;
      preskocitPotvrzeniOpakovanehoDokonceniJednou = false;

      if (
        jeOpakovanaPoznamka &&
        !potvrzeniUzProbehlo
      ) {
        const otevreno =
          otevriPotvrzeniDokonceniOpakovanePoznamky(
            entry,
            note
          );

        if (otevreno) {
          return;
        }
      }

      zapocitejPouzitiTlacitkaPripominky(
        "complete",
        "note"
      );

      let dalsiOpakovanyTermin = null;

      if (jeOpakovanaPoznamka) {
        dalsiOpakovanyTermin =
          vypocitejDalsiTerminOpakovanePoznamky(
            note,
            entry.date
          );

        if (dalsiOpakovanyTermin) {
          const dalsiTerminText =
            formatReminderLocalDateTime(
              dalsiOpakovanyTermin
            );

          note.date = dalsiTerminText;

          /*
           * Opakovací engine používá repeat.startDate jako nejnižší
           * povolený den série. Samotný posun note.date proto nestačí:
           * starý den by dál zůstával platným výskytem v Planneru i
           * Připomínkách. Posuneme tedy začátek aktivní části série na
           * právě vypočtený následující výskyt. Cadence/interval zůstává.
           */
          note.repeat = {
            ...note.repeat,
            startDate: dalsiTerminText.slice(0, 10)
          };

          note.completed = false;
          note.planned = true;
          note.reminder =
            pripominkaPredDokoncenim;

          if (pripominkaPredDokoncenim) {
            note.notificationId =
              createUniqueNotificationId();
          }
        } else {
          /* Série přirozeně skončila (např. endDate). */
          note.completed = true;
          note.reminder = false;
        }
      } else {
        note.completed = true;
        note.reminder = false;
      }

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

      if (typeof renderCalendar === "function") {
        requestAnimationFrame(renderCalendar);
      }

      requestAnimationFrame(
        renderRemindersScreen
      );

      if (typeof renderTasks === "function") {
        requestAnimationFrame(renderTasks);
      }

      zobrazPotvrzeniPripominky(
        jeOpakovanaPoznamka &&
        dalsiOpakovanyTermin
          ? remindersT("recurring.nextScheduled", "Další opakování naplánováno")
          : remindersT("reminders.noteCompleted", "Poznámka dokončena")
      );

      if (
        jeOpakovanaPoznamka &&
        typeof obnovNotifikacePoznamkyPodleSoukromi ===
          "function"
      ) {
        /*
         * Opakovaná série může mít v Androidu více budoucích alarmů.
         * Po Hotovo proto bezpečně zrušíme jejich starou sadu a z
         * uloženého nového termínu vytvoříme čerstvou.
         */
        spustPripominkovouUlohuNaPozadi(
          () =>
            obnovNotifikacePoznamkyPodleSoukromi(
              note
            ),
          "Přeplánování opakované připomínky"
        );
      } else if (
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


function otevriMenuPlanovace(
  kind,
  id,
  dateOverride = null
) {
  const entry = getReminderEntry(kind, id);

  if (!entry) {
    return false;
  }

  openReminderQuickMenu(
    entry,
    {
      context: "planner",
      dateOverride
    }
  );
  return true;
}

function dokoncitPolozkuPlanovace(
  kind,
  id,
  dateOverride = null
) {
  const otevreno = otevriMenuPlanovace(
    kind,
    id,
    dateOverride
  );

  if (!otevreno || !completeReminderButton) {
    return false;
  }

  completeReminderButton.click();
  return true;
}

editReminderRepeatButton?.addEventListener(
  "click",
  async () => {
    const entry = getSelectedReminderEntry();

    if (
      !entry ||
      entry.kind !== "note" ||
      entry.sourceType !== "recurring-note"
    ) {
      return;
    }

    closeReminderQuickMenu();

    if (typeof openTaskEditorById !== "function") {
      return;
    }

    await openTaskEditorById(entry.id);

    setTimeout(() => {
      if (
        typeof modalTimeButton !== "undefined" &&
        document.getElementById("taskModal")
          ?.dataset?.taskId === String(entry.id)
      ) {
        modalTimeButton?.click();
      }
    }, 0);
  }
);

window.LubaNoteReminders = {
  ...(window.LubaNoteReminders || {}),
  obnovIndexLokalnichAlarmu692V: obnovIndexLokalnichAlarmu692V,
  vycistiStarePoTerminu: (moznosti = {}) =>
    vycistiStarePripominkyPoTerminu(moznosti),
  obnovPoSynchronizaci: (noteIds = null) =>
    obnovSystemoveNotifikacePoSynchronizaci(noteIds),
  otevriMenuPlanovace,
  dokoncitPolozkuPlanovace,
  prepniDokonceniPolozkyGestem,
  otevriSmazaniPolozkyGestem,
  jePlanovanaPripominkaZapnuta
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
