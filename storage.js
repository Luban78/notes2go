const REGULAR_TASK_STORAGE_KEY = "savedTask";
const SECRET_TASK_STORAGE_KEY = "savedSecretTask";
const LUBANOTE_BACKUP_FORMAT_V2 =
  "LubaNote-backup-v2";
const LUBANOTE_BACKUP_FORMAT =
  "LubaNote-complete-backup-v3";

const BACKUP_CLOUD_META_STORAGE_KEY =
  "lubanoteCloudSyncMetaV1";
const BACKUP_PENDING_DELETE_STORAGE_KEY =
  "lubanotePendingDeletes";


/*
 * STABILNÍ IDENTITA STARÝCH POZNÁMEK
 *
 * Starší verze LubaNote mohly mít poznámky ještě bez UUID.
 * Kdyby si dvě zařízení takové poznámce přidělila náhodné UUID
 * nezávisle na sobě, Supabase by je následně považoval za dvě
 * různé poznámky. Proto starým poznámkám bez ID vytváříme
 * deterministické UUID ze stejné původní identity.
 */
function normalizujTextProLegacyIdentitu(hodnota) {
  return String(hodnota ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function vytvorLegacyHash128(text) {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  let h3 = 0xc0decafe ^ text.length;
  let h4 = 0x9e3779b9 ^ text.length;

  for (let i = 0; i < text.length; i += 1) {
    const znak = text.charCodeAt(i);

    h1 = Math.imul(h1 ^ znak, 2654435761);
    h2 = Math.imul(h2 ^ znak, 1597334677);
    h3 = Math.imul(h3 ^ znak, 2246822507);
    h4 = Math.imul(h4 ^ znak, 3266489909);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);

  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h3 ^ (h3 >>> 13), 3266489909);

  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507);
  h3 ^= Math.imul(h4 ^ (h4 >>> 13), 3266489909);

  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507);
  h4 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return [h1, h2, h3, h4]
    .map((cislo) =>
      (cislo >>> 0).toString(16).padStart(8, "0")
    )
    .join("");
}

function formatLegacyHashJakoUuid(hash) {
  const hex = String(hash || "")
    .replace(/[^0-9a-f]/gi, "")
    .padEnd(32, "0")
    .slice(0, 32)
    .toLowerCase()
    .split("");

  /*
   * UUID v4/variant formát. Hodnota je deterministická, ale stále
   * splňuje formát UUID sloupce v Supabase/PostgreSQL.
   */
  hex[12] = "4";
  hex[16] = (
    (parseInt(hex[16], 16) & 0x3) | 0x8
  ).toString(16);

  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join("")
  ].join("-");
}

function vytvorLegacyIdentituPoznamky(task) {
  if (!task || typeof task !== "object") {
    return "";
  }

  /*
   * notificationId vzniká už při vytvoření poznámky a běžně se
   * synchronizoval spolu s ní. U staré poznámky je proto nejlepší
   * dostupný společný původní identifikátor napříč zařízeními.
   */
  if (
    task.notificationId !== undefined &&
    task.notificationId !== null &&
    String(task.notificationId) !== ""
  ) {
    return `notification:${String(task.notificationId)}`;
  }

  if (task.createdAt) {
    return `created:${String(task.createdAt)}`;
  }

  const todoText = Array.isArray(task.todos)
    ? task.todos
        .map((todo) =>
          normalizujTextProLegacyIdentitu(todo?.text)
        )
        .join("|")
    : "";

  const plainRichText =
    normalizujTextProLegacyIdentitu(
      String(task.richContent || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

  /*
   * Záložní identita pro opravdu stará data bez notificationId.
   * Nezahrnujeme připnutí, štítky, oblíbenost ani dokončení,
   * protože právě tyto vlastnosti se mohly na dvou zařízeních lišit.
   */
  return [
    "fallback",
    normalizujTextProLegacyIdentitu(task.title),
    String(task.date || ""),
    normalizujTextProLegacyIdentitu(task.note) || plainRichText,
    todoText
  ].join("::");
}

function vytvorStabilniIdStarePoznamky(task) {
  if (task?.id) {
    return task.id;
  }

  const identita =
    vytvorLegacyIdentituPoznamky(task);

  if (!identita) {
    return crypto.randomUUID();
  }

  return formatLegacyHashJakoUuid(
    vytvorLegacyHash128(
      `LubaNote:legacy-note:v1:${identita}`
    )
  );
}

/*
 * Tento klíč používáme pouze pro velmi konzervativní opravu
 * již vzniklých legacy duplikátů. Automaticky slučujeme jen
 * běžné poznámky, které mají stejné notificationId a současně
 * stejný základní obsah.
 */
function vytvorKlicJasnehoLegacyDuplikatu(task) {
  if (
    !task ||
    task.isSecret === true ||
    task.notificationId === undefined ||
    task.notificationId === null ||
    String(task.notificationId) === ""
  ) {
    return null;
  }

  const todoText = Array.isArray(task.todos)
    ? task.todos
        .map((todo) =>
          normalizujTextProLegacyIdentitu(todo?.text)
        )
        .join("|")
    : "";

  const plainRichText =
    normalizujTextProLegacyIdentitu(
      String(task.richContent || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

  return [
    String(task.notificationId),
    normalizujTextProLegacyIdentitu(task.title),
    String(task.date || ""),
    normalizujTextProLegacyIdentitu(task.note) || plainRichText,
    todoText
  ].join("::");
}

function nactiSavedTaskSeStabilnimiId() {
  const puvodni =
    nactiPoleZLocalStorage(REGULAR_TASK_STORAGE_KEY);

  let zmeneno = false;

  const normalizovane = puvodni.map((task) => {
    if (!task || task.id) {
      return task;
    }

    zmeneno = true;

    return {
      ...task,
      id: vytvorStabilniIdStarePoznamky(task)
    };
  });

  if (zmeneno) {
    localStorage.setItem(
      REGULAR_TASK_STORAGE_KEY,
      JSON.stringify(normalizovane)
    );

    console.info(
      "LubaNote: starým poznámkám byla doplněna stabilní ID."
    );
  }

  return normalizovane;
}

/*
 * Tajné poznámky jsou po odemknutí dostupné pouze v paměti.
 * Do localStorage se ukládá jen jejich AES-GCM obálka.
 */
let desifrovaneTajnePoznamky = [];
let frontaUkladaniTajnychPoznamek = Promise.resolve();

/*
 * REVIZE LOKÁLNÍCH ZMĚN POZNÁMEK
 *
 * Sync podle tohoto čítače pozná, že uživatel během síťové
 * synchronizace mezitím něco změnil. Síť pak nesmí přepsat
 * novější lokální stav starým snapshotem.
 */
let revizeLokalnichZmenPoznamek = 0;

function zvysReviziLokalnichZmenPoznamek() {
  revizeLokalnichZmenPoznamek += 1;
  return revizeLokalnichZmenPoznamek;
}

function ziskejReviziLokalnichZmenPoznamek() {
  return revizeLokalnichZmenPoznamek;
}

window.LubaNoteStorageState = {
  ziskejReviziLokalnichZmenPoznamek
};


function nactiPoleZLocalStorage(klic) {
  const raw = localStorage.getItem(klic);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Local data load error (${klic}):`, error);
    return [];
  }
}

function nactiBeznePoznamkyZUloziste() {
  return nactiSavedTaskSeStabilnimiId()
    .filter((task) => task && task.isSecret !== true);
}

/*
 * Přechodová podpora: starší vývojová verze mohla mít tajnou
 * poznámku ještě v savedTask jako plaintext. Dokud není trezor
 * odemčený, takovou poznámku loadTask() vůbec nevrací.
 * Po prvním odemknutí se automaticky zašifruje a plaintext odstraní.
 */
function nactiStarePlaintextTajnePoznamky() {
  return nactiSavedTaskSeStabilnimiId()
    .filter((task) => task?.isSecret === true);
}

function ulozBeznePoznamkyPrimo(
  tasks,
  zachovatLegacyTajne = true
) {
  const beznePoznamky = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task && task.isSecret !== true);

  /*
   * Staré plaintext tajné poznámky nesmíme při běžném syncu smazat
   * dřív, než máme AES klíč a vytvořenou šifrovanou kopii.
   */
  const legacyTajne = zachovatLegacyTajne
    ? nactiStarePlaintextTajnePoznamky()
    : [];

  localStorage.setItem(
    REGULAR_TASK_STORAGE_KEY,
    JSON.stringify([
      ...beznePoznamky,
      ...legacyTajne
    ])
  );
}

function nactiSifrovaneTajneZaznamy() {
  return nactiPoleZLocalStorage(SECRET_TASK_STORAGE_KEY)
    .filter((record) =>
      record?.id &&
      record?.encrypted?.iv &&
      record?.encrypted?.ciphertext
    );
}

function ulozSifrovaneTajneZaznamy(records) {
  localStorage.setItem(
    SECRET_TASK_STORAGE_KEY,
    JSON.stringify(Array.isArray(records) ? records : [])
  );
}

function nastavDesifrovaneTajnePoznamky(tasks) {
  desifrovaneTajnePoznamky = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.id)
    .map((task) => ({
      ...task,
      isSecret: true
    }));
}

function vycistiDesifrovaneTajnePoznamky() {
  desifrovaneTajnePoznamky = [];
}

function getDesifrovaneTajnePoznamky() {
  return desifrovaneTajnePoznamky;
}

function getSecretNoteIds() {
  return new Set([
    ...nactiSifrovaneTajneZaznamy().map((record) => record.id),
    ...nactiStarePlaintextTajnePoznamky().map((task) => task.id),
    ...desifrovaneTajnePoznamky.map((task) => task.id)
  ].filter(Boolean));
}

function loadTask() {
  const beznePoznamky = nactiBeznePoznamkyZUloziste();

  /*
   * Cache tajných poznámek je při zamknutí prázdná.
   * Díky tomu je nemůže najít render, search, planner ani reminders.
   */
  return [
    ...beznePoznamky,
    ...desifrovaneTajnePoznamky
  ];
}

function odstranPlaintextPlanovanePolozkyTajnychPoznamek(secretIds) {
  if (!(secretIds instanceof Set) || secretIds.size === 0) {
    return;
  }

  const raw = localStorage.getItem("plannedItems");

  if (!raw) {
    return;
  }

  try {
    const items = JSON.parse(raw);

    if (!Array.isArray(items)) {
      return;
    }

    const safeItems = items.filter(
      (item) => !secretIds.has(item?.sourceNoteId)
    );

    if (safeItems.length !== items.length) {
      localStorage.setItem(
        "plannedItems",
        JSON.stringify(safeItems)
      );
    }
  } catch (error) {
    console.error(
      "Čištění plánovaných položek tajných poznámek se nepodařilo:",
      error
    );
  }
}

async function ulozTajnePoznamkySifrovaneHned(tasks) {
  const tajnePoznamky = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.id && task.isSecret === true);

  if (
    typeof zasifrujTajnouPoznamku !== "function" ||
    typeof tajnySifrovaciKlic === "undefined" ||
    !tajnySifrovaciKlic
  ) {
    return false;
  }

  const records = [];

  for (const note of tajnePoznamky) {
    const encrypted = await zasifrujTajnouPoznamku(note);

    records.push({
      id: note.id,
      updatedAt: note.updatedAt || new Date().toISOString(),
      encrypted
    });
  }

  ulozSifrovaneTajneZaznamy(records);

  odstranPlaintextPlanovanePolozkyTajnychPoznamek(
    new Set(records.map((record) => record.id))
  );

  /* Ciphertext už existuje, takže starý plaintext můžeme odstranit. */
  if (nactiStarePlaintextTajnePoznamky().length > 0) {
    ulozBeznePoznamkyPrimo(
      nactiBeznePoznamkyZUloziste(),
      false
    );
  }

  return true;
}

function zaradUlozeniTajnychPoznamek(tasks) {
  let snapshot;

  try {
    snapshot = typeof structuredClone === "function"
      ? structuredClone(tasks)
      : JSON.parse(JSON.stringify(tasks));
  } catch (error) {
    console.error("Secret snapshot error:", error);
    return Promise.resolve(false);
  }

  frontaUkladaniTajnychPoznamek =
    frontaUkladaniTajnychPoznamek
      .catch(() => false)
      .then(() => ulozTajnePoznamkySifrovaneHned(snapshot))
      .catch((error) => {
        console.error(
          "Šifrované lokální uložení tajných poznámek selhalo:",
          error
        );
        return false;
      });

  return frontaUkladaniTajnychPoznamek;
}

function cekajNaUlozeniTajnychPoznamek() {
  return frontaUkladaniTajnychPoznamek.catch(() => false);
}

async function nactiTajnePoznamkyZLocalStorage() {
  if (
    typeof tajnySifrovaciKlic === "undefined" ||
    !tajnySifrovaciKlic ||
    typeof desifrujTajnouPoznamku !== "function"
  ) {
    vycistiDesifrovaneTajnePoznamky();
    return [];
  }

  await cekajNaUlozeniTajnychPoznamek();

  const records = nactiSifrovaneTajneZaznamy();
  const merged = new Map();

  for (const record of records) {
    try {
      const note = await desifrujTajnouPoznamku(
        record.encrypted,
        record.id
      );

      merged.set(record.id, {
        ...note,
        id: record.id,
        updatedAt: record.updatedAt || note.updatedAt,
        isSecret: true
      });
    } catch (error) {
      console.error(
        `Tajnou poznámku ${record.id} se nepodařilo dešifrovat:`,
        error
      );
    }
  }

  const legacyPlaintext = nactiStarePlaintextTajnePoznamky();

  legacyPlaintext.forEach((note) => {
    if (!note?.id) {
      return;
    }

    const current = merged.get(note.id);
    const currentTime = new Date(current?.updatedAt || 0).getTime();
    const legacyTime = new Date(note.updatedAt || 0).getTime();

    if (!current || legacyTime >= currentTime) {
      merged.set(note.id, {
        ...note,
        isSecret: true
      });
    }
  });

  const tajnePoznamky = Array.from(merged.values());
  nastavDesifrovaneTajnePoznamky(tajnePoznamky);

  /*
   * Starý plaintext odstraníme až POTÉ, co se podařilo vytvořit
   * šifrovanou kopii. Tím během migrace neriskujeme ztrátu dat.
   */
  if (legacyPlaintext.length > 0) {
    const encryptedOk =
      await ulozTajnePoznamkySifrovaneHned(tajnePoznamky);

    if (encryptedOk) {
      ulozBeznePoznamkyPrimo(
        nactiBeznePoznamkyZUloziste(),
        false
      );
    }
  }

  return tajnePoznamky;
}

function odstranDuplicitniPoznamkySeStejnymId(tasks) {
  const vysledek = [];
  const indexPodleId = new Map();

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    if (!task?.id) {
      vysledek.push(task);
      return;
    }

    if (!indexPodleId.has(task.id)) {
      indexPodleId.set(task.id, vysledek.length);
      vysledek.push(task);
      return;
    }

    const index = indexPodleId.get(task.id);
    const puvodni = vysledek[index];

    const puvodniCas =
      new Date(puvodni?.updatedAt || 0).getTime();

    const novyCas =
      new Date(task?.updatedAt || 0).getTime();

    if (novyCas >= puvodniCas) {
      vysledek[index] = task;
    }
  });

  return vysledek;
}


function saveAllTasks(tasks) {
  const safeTasks =
    odstranDuplicitniPoznamkySeStejnymId(tasks);

  /*
   * Každé běžné lokální uložení je nová uživatelská revize.
   * Přímé zápisy, které provádí samotný sync, tento čítač
   * nezvyšují.
   */
  zvysReviziLokalnichZmenPoznamek();
  const beznePoznamky = safeTasks.filter(
    (task) => task && task.isSecret !== true
  );
  const tajnePoznamky = safeTasks.filter(
    (task) => task?.id && task.isSecret === true
  );

  /* Plaintext tajné poznámky se do savedTask nikdy nezapisují. */
  ulozBeznePoznamkyPrimo(beznePoznamky);

  const maSifrovaciKlic =
    typeof tajnySifrovaciKlic !== "undefined" &&
    Boolean(tajnySifrovaciKlic);

  if (maSifrovaciKlic) {
    nastavDesifrovaneTajnePoznamky(tajnePoznamky);
    return zaradUlozeniTajnychPoznamek(tajnePoznamky);
  }

  /*
   * Při zamknutém trezoru zachováme existující ciphertext beze změny.
   * Tajná data se nikdy nepokusíme uložit jako náhradní plaintext.
   */
  if (tajnePoznamky.length > 0) {
    console.error(
      "Tajné poznámky nelze uložit bez odemčeného tajného režimu."
    );
  }

  return Promise.resolve(true);
}

function saveTask(task) {
  const tasks = loadTask();
  tasks.push(task);
  return saveAllTasks(tasks);
}

async function deleteTask(index) {
  const tasks = loadTask();
  const taskToDelete = tasks[index];

  if (!taskToDelete) {
    return false;
  }

  const noteId = taskToDelete.id || null;

  const plannedItems =
    typeof loadPlannedItems === "function"
      ? loadPlannedItems()
      : [];

  const relatedPlannedItems = plannedItems.filter(
    (item) => item?.sourceNoteId === noteId
  );

  const notificationIds = new Set();

  if (taskToDelete.notificationId) {
    notificationIds.add(
      taskToDelete.notificationId
    );
  }

  relatedPlannedItems.forEach((item) => {
    if (item?.notificationId) {
      notificationIds.add(item.notificationId);
    }
  });

  /*
   * Lokální data smažeme jako první. Uživatel tak nečeká na
   * Android plugin ani na Supabase.
   */
  if (
    noteId &&
    typeof savePlannedItems === "function"
  ) {
    savePlannedItems(
      plannedItems.filter(
        (item) => item?.sourceNoteId !== noteId
      )
    );
  }

  tasks.splice(index, 1);
  await saveAllTasks(tasks);

  /* Android notifikace uklidíme až na pozadí. */
  if (
    notificationIds.size > 0 &&
    typeof cancelNotification === "function"
  ) {
    setTimeout(() => {
      (async () => {
        for (const notificationId of notificationIds) {
          try {
            await cancelNotification(notificationId);
          } catch (error) {
            console.warn(
              "Zrušení notifikace po smazání bylo odloženo:",
              error
            );
          }
        }
      })();
    }, 0);
  }

  if (
    taskToDelete.id &&
    typeof markNoteDeletedInSupabase === "function"
  ) {
    /*
     * Tombstone se zapíše do lokální fronty ještě před prvním await.
     * Síť proto mazání UI neblokuje.
     */
    markNoteDeletedInSupabase(taskToDelete)
      .catch((error) => {
        console.warn(
          "Odeslání smazání do cloudu bylo odloženo:",
          error
        );
      });
  }

  return true;
}


/*
 * HROMADNÉ SMAZÁNÍ PODLE STABILNÍCH ID
 *
 * Poznámky odstraníme jediným lokálním zápisem. Cloudová smazání
 * se jen zařadí do bezpečné tombstone fronty a odešlou na pozadí.
 */
async function deleteTasksByIds(ids) {
  const bezpecnaId = new Set(
    (Array.isArray(ids) ? ids : [])
      .filter(Boolean)
  );

  if (bezpecnaId.size === 0) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }

  const tasks = loadTask();

  const mazanePoznamky = tasks.filter(
    (task) =>
      task?.id &&
      bezpecnaId.has(task.id)
  );

  if (mazanePoznamky.length === 0) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }

  const mazanaId = new Set(
    mazanePoznamky.map((task) => task.id)
  );

  const notificationIds = new Set();

  mazanePoznamky.forEach((task) => {
    if (task?.notificationId) {
      notificationIds.add(task.notificationId);
    }
  });

  if (
    typeof loadPlannedItems === "function" &&
    typeof savePlannedItems === "function"
  ) {
    const plannedItems = loadPlannedItems();

    plannedItems.forEach((item) => {
      if (
        mazanaId.has(item?.sourceNoteId) &&
        item?.notificationId
      ) {
        notificationIds.add(item.notificationId);
      }
    });

    savePlannedItems(
      plannedItems.filter(
        (item) =>
          !mazanaId.has(item?.sourceNoteId)
      )
    );
  }

  const zbyvajiciPoznamky = tasks.filter(
    (task) =>
      !task?.id ||
      !mazanaId.has(task.id)
  );

  const lokalneUlozeno =
    await saveAllTasks(zbyvajiciPoznamky);

  if (lokalneUlozeno === false) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }

  /*
   * Android notifikace uklízíme na pozadí.
   * Jejich rušení nesmí zdržovat zmizení karet z obrazovky.
   */
  if (
    notificationIds.size > 0 &&
    typeof cancelNotification === "function"
  ) {
    Promise.allSettled(
      [...notificationIds].map(
        (notificationId) =>
          cancelNotification(notificationId)
      )
    ).catch(() => {});
  }

  /*
   * U hromadného mazání do sítě vůbec nevstupujeme.
   * Jen vytvoříme lokální tombstone frontu; centrální sync ji po
   * ukončení výběru odešle na pozadí.
   */
  const casSmazani =
    new Date().toISOString();

  if (typeof pridejCekajiciSmazani === "function") {
    mazanePoznamky.forEach((task) => {
      pridejCekajiciSmazani(
        task.id,
        casSmazani
      );
    });
  } else if (
    typeof markNoteDeletedInSupabase === "function"
  ) {
    /*
     * Záložní cesta, pokud starší sync.js ještě lokální frontu
     * neposkytuje. Ani zde na síť nečekáme.
     */
    mazanePoznamky.forEach((task) => {
      markNoteDeletedInSupabase(task)
        .catch((error) => {
          console.warn(
            "Odeslání hromadného smazání do cloudu bylo odloženo:",
            task?.id,
            error
          );
        });
    });
  }

  return {
    pocet: mazanePoznamky.length,
    lokalneUlozeno: true
  };
}

function toggleTaskCompleted(index) {
  const tasks = loadTask();
  const task = tasks[index];

  if (!task) {
    return null;
  }

  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  saveAllTasks(tasks);

  return task;
}

function updateTask(index, updatedTask) {
  const tasks = loadTask();
  tasks[index] = updatedTask;
  return saveAllTasks(tasks);
}

function vytvorNazevSouboruZalohy() {
  const cas = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  return `lubanote-backup-${cas}.json`;
}


function stahniZalohuVeWebu(data, nazevSouboru) {
  const blob = new Blob([data], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = nazevSouboru;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}


async function sdilejZalohuVApk(
  data,
  nazevSouboru
) {
  const Filesystem =
    window.Capacitor?.Plugins?.Filesystem;

  const Share =
    window.Capacitor?.Plugins?.Share;

  if (!Filesystem || !Share) {
    throw new Error(
      "V APK chybí nativní pluginy Filesystem nebo Share."
    );
  }

  /*
   * Android WebView neumí spolehlivě stáhnout blob: odkaz.
   * Zálohu proto nejdřív vytvoříme jako skutečný soubor v cache
   * aplikace a jeho content URI předáme systémovému Android menu.
   */
  const ulozenySoubor =
    await Filesystem.writeFile({
      path: nazevSouboru,
      data,
      directory: "CACHE",
      encoding: "utf8"
    });

  if (!ulozenySoubor?.uri) {
    throw new Error(
      "Android nevytvořil soubor zálohy."
    );
  }

  await Share.share({
    title: "Kompletní záloha LubaNote",
    text: "Kompletní záloha dat LubaNote",
    files: [ulozenySoubor.uri],
    dialogTitle: "Uložit nebo sdílet zálohu"
  });
}


async function ulozZalohuDoSouboruVApk(
  data,
  nazevSouboru
) {
  const BackupExport =
    window.Capacitor
      ?.Plugins?.LubaNoteBackupExport;

  if (!BackupExport) {
    throw new Error(
      "V APK chybí nativní ukládání zálohy."
    );
  }

  await BackupExport.zahajExport();

  const VELIKOST_CASTI_EXPORTU =
    64 * 1024;

  const kodovani = new TextEncoder();
  let ocekavanyPocetBajtu = 0;

  for (
    let zacatek = 0;
    zacatek < data.length;
  ) {
    let konec = Math.min(
      zacatek + VELIKOST_CASTI_EXPORTU,
      data.length
    );

    /*
     * Řez nesmí rozdělit emoji ani jiný znak tvořený
     * dvojicí UTF-16 surrogate znaků.
     */
    if (
      konec < data.length &&
      konec > zacatek
    ) {
      const posledniKod =
        data.charCodeAt(konec - 1);
      const dalsiKod =
        data.charCodeAt(konec);

      if (
        posledniKod >= 0xD800 &&
        posledniKod <= 0xDBFF &&
        dalsiKod >= 0xDC00 &&
        dalsiKod <= 0xDFFF
      ) {
        konec -= 1;
      }
    }

    const cast = data.slice(
      zacatek,
      konec
    );

    ocekavanyPocetBajtu +=
      kodovani.encode(cast).byteLength;

    const vysledek =
      await BackupExport.pridejCast({
        cast
      });

    const prijatyPocetBajtu =
      Number(vysledek?.bytes || 0);

    if (
      prijatyPocetBajtu !==
      ocekavanyPocetBajtu
    ) {
      throw new Error(
        "Android nepřijal celou zálohu."
      );
    }

    const tlacitko =
      document.getElementById(
        "settingsExportButton"
      );

    if (tlacitko) {
      const procent = Math.round(
        (konec / data.length) * 100
      );

      tlacitko.textContent =
        `Připravuji zálohu… ${procent} %`;
    }

    zacatek = konec;
  }

  if (ocekavanyPocetBajtu <= 0) {
    throw new Error(
      "Připravená záloha je prázdná."
    );
  }

  return await BackupExport.otevriUlozeni({
    nazevSouboru
  });
}


function vytvorChybuZalohy(
  zprava,
  uzivatelskaZprava = zprava
) {
  const error = new Error(zprava);
  error.uzivatelskaZprava =
    uzivatelskaZprava;
  return error;
}


function nactiNastaveniProKompletniZalohu() {
  let rychleOdlozeni = null;

  try {
    rychleOdlozeni = JSON.parse(
      localStorage.getItem(
        "rychleOdlozeni"
      ) || "null"
    );
  } catch (error) {
    rychleOdlozeni = null;
  }

  const velikostPisma = Number(
    localStorage.getItem("fontSize")
  );

  return {
    fontSize:
      Number.isFinite(velikostPisma)
        ? Math.min(
            20,
            Math.max(13, velikostPisma)
          )
        : 16,
    theme:
      localStorage.getItem("theme") ||
      "light",
    cardView:
      localStorage.getItem("cardView") ===
      "list"
        ? "list"
        : "grid",
    cardSortDirection:
      localStorage.getItem(
        "cardSortDirection"
      ) === "asc"
        ? "asc"
        : "desc",
    rychleOdlozeni:
      rychleOdlozeni &&
      typeof rychleOdlozeni === "object"
        ? rychleOdlozeni
        : null
  };
}


function obnovNastaveniZKompletniZalohy(
  nastaveni
) {
  if (!nastaveni || typeof nastaveni !== "object") {
    return;
  }

  const velikostPisma = Number(
    nastaveni.fontSize
  );

  if (Number.isFinite(velikostPisma)) {
    localStorage.setItem(
      "fontSize",
      String(
        Math.min(
          20,
          Math.max(13, velikostPisma)
        )
      )
    );
  }

  if (
    typeof nastaveni.theme === "string" &&
    nastaveni.theme.trim()
  ) {
    localStorage.setItem(
      "theme",
      nastaveni.theme.trim()
    );
  }

  localStorage.setItem(
    "cardView",
    nastaveni.cardView === "list"
      ? "list"
      : "grid"
  );

  localStorage.setItem(
    "cardSortDirection",
    nastaveni.cardSortDirection === "asc"
      ? "asc"
      : "desc"
  );

  if (
    nastaveni.rychleOdlozeni &&
    typeof nastaveni.rychleOdlozeni ===
      "object"
  ) {
    localStorage.setItem(
      "rychleOdlozeni",
      JSON.stringify(
        nastaveni.rychleOdlozeni
      )
    );
  }
}


function pripravTajneNastaveniProZalohu(
  nastaveni
) {
  if (
    !nastaveni ||
    typeof nastaveni.salt !== "string" ||
    !nastaveni.salt ||
    typeof nastaveni.verifier !== "string" ||
    !nastaveni.verifier ||
    !Number.isFinite(
      Number(nastaveni.kdf_iterations)
    )
  ) {
    return null;
  }

  return {
    salt: nastaveni.salt,
    verifier: nastaveni.verifier,
    kdf_iterations:
      Number(nastaveni.kdf_iterations)
  };
}


async function ziskejTajneNastaveniProZalohu(
  pocetTajnychPoznamek
) {
  let nastaveni =
    typeof nactiLokalniTajneNastaveni ===
    "function"
      ? nactiLokalniTajneNastaveni()
      : null;

  if (
    !nastaveni &&
    typeof nactiTajneNastaveniZCloudu ===
      "function" &&
    navigator.onLine
  ) {
    const cloud =
      await nactiTajneNastaveniZCloudu();

    if (cloud?.stav === "ok") {
      nastaveni = cloud.data;
    }
  }

  const bezpecneNastaveni =
    pripravTajneNastaveniProZalohu(
      nastaveni
    );

  if (
    pocetTajnychPoznamek > 0 &&
    !bezpecneNastaveni
  ) {
    throw vytvorChybuZalohy(
      "Chybí šifrovací nastavení tajných poznámek.",
      "Kompletní zálohu nelze vytvořit bez šifrovacího nastavení. Připoj zařízení k internetu, odemkni tajný režim a zkus export znovu."
    );
  }

  return {
    nastaveni: bezpecneNastaveni,
    userId:
      nastaveni?.userId ||
      nastaveni?.user_id ||
      null
  };
}


async function vytvorKompletniZalohu() {
  await cekajNaUlozeniTajnychPoznamek();

  const notes =
    nactiBeznePoznamkyZUloziste();
  const secretNotes =
    nactiSifrovaneTajneZaznamy();

  const tajneNastaveni =
    await ziskejTajneNastaveniProZalohu(
      secretNotes.length
    );

  if (
    typeof ziskejStitkyProKompletniZalohu !==
    "function"
  ) {
    throw vytvorChybuZalohy(
      "Modul štítků není dostupný.",
      "Kompletní zálohu se nepodařilo připravit, protože nejsou dostupné štítky."
    );
  }

  let vsechnyStitky;

  try {
    vsechnyStitky =
      await ziskejStitkyProKompletniZalohu();
  } catch (error) {
    const zprava = String(
      error?.message || error || ""
    );

    throw vytvorChybuZalohy(
      zprava,
      zprava ||
      "Štítky se nepodařilo načíst pro kompletní zálohu."
    );
  }

  const verejneStitky = vsechnyStitky
    .filter(
      (stitek) => stitek.is_secret !== true
    );

  const tajneStitky = vsechnyStitky
    .filter(
      (stitek) => stitek.is_secret === true
    );

  let secretMetadata = null;

  if (tajneStitky.length > 0) {
    if (
      typeof zasifrujMetadataKompletniZalohy !==
        "function" ||
      typeof tajnySifrovaciKlic === "undefined" ||
      !tajnySifrovaciKlic
    ) {
      throw vytvorChybuZalohy(
        "Tajný režim je zamknutý.",
        "Nejdřív odemkni tajný režim. Tajné štítky musí být v kompletní záloze bezpečně zašifrované."
      );
    }

    secretMetadata =
      await zasifrujMetadataKompletniZalohy({
        tags: tajneStitky
      });
  }

  const user =
    typeof getCurrentUser === "function"
      ? await getCurrentUser()
      : null;

  const ownerUserId =
    user?.id ||
    tajneNastaveni.userId ||
    null;

  if (
    user?.id &&
    tajneNastaveni.userId &&
    user.id !== tajneNastaveni.userId
  ) {
    throw vytvorChybuZalohy(
      "Lokální tajné nastavení patří jinému účtu.",
      "Kompletní zálohu nelze vytvořit, protože tajné nastavení patří jinému účtu. Připoj se k internetu a zkus to znovu."
    );
  }

  const plannedItems =
    typeof loadPlannedItems === "function"
      ? loadPlannedItems()
      : [];

  return {
    format: LUBANOTE_BACKUP_FORMAT,
    version: 3,
    exportedAt: new Date().toISOString(),
    appVersion:
      window.LUBANOTE_VERSION || null,
    owner: {
      userId: ownerUserId
    },
    manifest: {
      complete: true,
      regularNoteCount: notes.length,
      secretNoteCount: secretNotes.length,
      publicTagCount: verejneStitky.length,
      secretTagCount: tajneStitky.length,
      plannedItemCount:
        Array.isArray(plannedItems)
          ? plannedItems.length
          : 0
    },
    notes,
    secretNotes,
    secretSettings:
      tajneNastaveni.nastaveni,
    publicTags: verejneStitky,
    secretMetadata,
    plannedItems:
      Array.isArray(plannedItems)
        ? plannedItems
        : [],
    preferences:
      nactiNastaveniProKompletniZalohu()
  };
}


async function pripravAProvedExportZalohy(
  zpusobExportu
) {
  const tlacitko =
    document.getElementById(
      "settingsExportButton"
    );

  const puvodniText =
    tlacitko?.textContent ||
    "Export zálohy";

  if (tlacitko) {
    tlacitko.disabled = true;
    tlacitko.textContent =
      "Připravuji zálohu…";
  }

  try {
    const backup =
      await vytvorKompletniZalohu();

    const data =
      JSON.stringify(backup, null, 2);

    const nazevSouboru =
      vytvorNazevSouboruZalohy();

    const jeApk =
      window.Capacitor
        ?.isNativePlatform?.() === true;

    if (
      jeApk &&
      zpusobExportu === "sdilet"
    ) {
      await sdilejZalohuVApk(
        data,
        nazevSouboru
      );
    } else if (jeApk) {
      const vysledek =
        await ulozZalohuDoSouboruVApk(
          data,
          nazevSouboru
        );

      if (
        vysledek?.saved === true &&
        typeof zobrazZpravuAplikace ===
        "function"
      ) {
        zobrazZpravuAplikace(
          "Kompletní záloha",
          "Kompletní záloha byla uložena do vybraného umístění."
        );
      }
    } else {
      stahniZalohuVeWebu(
        data,
        nazevSouboru
      );
    }
  } catch (error) {
    const zpravaChyby = String(
      error?.message || error || ""
    );

    if (
      zpravaChyby.includes(
        "Share canceled"
      )
    ) {
      return;
    }

    console.error(
      "Export zálohy selhal:",
      error
    );

    if (
      typeof zobrazZpravuAplikace ===
      "function"
    ) {
      zobrazZpravuAplikace(
        "Kompletní záloha",
        error?.uzivatelskaZprava ||
        "Zálohu se nepodařilo vytvořit. Zkus to prosím znovu."
      );
    }
  } finally {
    if (tlacitko) {
      tlacitko.disabled = false;
      tlacitko.textContent = puvodniText;
    }
  }
}


function exportTasks() {
  const jeApk =
    window.Capacitor
      ?.isNativePlatform?.() === true;

  if (
    jeApk &&
    typeof window.otevriVyberovyModal ===
    "function"
  ) {
    window.otevriVyberovyModal({
      nadpis: "Kompletní záloha",
      moznosti: [
        {
          hodnota: "ulozit",
          popisek: "Uložit do telefonu"
        },
        {
          hodnota: "sdilet",
          popisek: "Sdílet zálohu"
        }
      ],
      poVyberu: (zpusobExportu) =>
        pripravAProvedExportZalohy(
          zpusobExportu
        )
    });

    return;
  }

  pripravAProvedExportZalohy(
    jeApk ? "ulozit" : "web"
  );
}

function normalizujImportovanouPoznamku(task, importedAt) {
  return {
    ...task,
    id:
      task.id ||
      vytvorStabilniIdStarePoznamky(task),
    updatedAt: task.updatedAt || importedAt,
    todos: Array.isArray(task.todos) ? task.todos : [],
    tags: Array.isArray(task.tags) ? task.tags : []
  };
}


function jePlatnySifrovanyZaznamZalohy(
  zaznam
) {
  return Boolean(
    zaznam?.id &&
    zaznam?.encrypted?.iv &&
    zaznam?.encrypted?.ciphertext &&
    zaznam?.encrypted?.algorithm ===
      "AES-GCM"
  );
}


function jePlatnaKompletniZaloha(
  zaloha
) {
  if (
    zaloha?.format !==
      LUBANOTE_BACKUP_FORMAT ||
    Number(zaloha.version) !== 3 ||
    zaloha?.manifest?.complete !== true ||
    !Array.isArray(zaloha.notes) ||
    !Array.isArray(zaloha.secretNotes) ||
    !Array.isArray(zaloha.publicTags) ||
    !Array.isArray(zaloha.plannedItems) ||
    !zaloha.preferences ||
    typeof zaloha.preferences !== "object"
  ) {
    return false;
  }

  if (
    !zaloha.notes.every(
      (note) =>
        note && typeof note === "object"
    ) ||
    !zaloha.secretNotes.every(
      jePlatnySifrovanyZaznamZalohy
    ) ||
    !zaloha.publicTags.every(
      (stitek) =>
        typeof stitek?.name === "string" &&
        stitek.name.trim() &&
        stitek.is_secret !== true
    )
  ) {
    return false;
  }

  const tajneNastaveni =
    pripravTajneNastaveniProZalohu(
      zaloha.secretSettings
    );

  if (
    zaloha.secretNotes.length > 0 &&
    !tajneNastaveni
  ) {
    return false;
  }

  if (
    zaloha.secretMetadata !== null &&
    zaloha.secretMetadata !== undefined &&
    (
      zaloha.secretMetadata.algorithm !==
        "AES-GCM" ||
      !zaloha.secretMetadata.iv ||
      !zaloha.secretMetadata.ciphertext
    )
  ) {
    return false;
  }

  const manifest = zaloha.manifest;

  return (
    Number(manifest.regularNoteCount) ===
      zaloha.notes.length &&
    Number(manifest.secretNoteCount) ===
      zaloha.secretNotes.length &&
    Number(manifest.publicTagCount) ===
      zaloha.publicTags.length &&
    Number(manifest.plannedItemCount) ===
      zaloha.plannedItems.length &&
    (
      Number(manifest.secretTagCount) === 0 ||
      Boolean(zaloha.secretMetadata)
    )
  );
}


function nactiObjektZLocalStorageProObnovu(
  klic,
  vychoziHodnota
) {
  try {
    const raw = localStorage.getItem(klic);

    return raw
      ? JSON.parse(raw)
      : vychoziHodnota;
  } catch (error) {
    return vychoziHodnota;
  }
}


async function vytvorPlanCloudoveSynchronizacePoObnove(
  obnovovanaId,
  importedAt
) {
  if (
    !navigator.onLine ||
    typeof getCurrentUser !== "function" ||
    typeof getCloudNotesForSync !== "function"
  ) {
    throw vytvorChybuZalohy(
      "Cloud není dostupný pro bezpečnou obnovu.",
      "Kompletní obnova potřebuje připojení k internetu, aby ji následná synchronizace znovu nepřepsala."
    );
  }

  const user = await getCurrentUser();

  if (!user?.id) {
    throw vytvorChybuZalohy(
      "Uživatel není přihlášený.",
      "Před kompletní obnovou se přihlas ke svému účtu LubaNote."
    );
  }

  const cloudRows =
    await getCloudNotesForSync();

  const cloudPodleId = new Map(
    (Array.isArray(cloudRows) ? cloudRows : [])
      .filter((row) => row?.id)
      .map((row) => [row.id, row])
  );

  const meta = nactiObjektZLocalStorageProObnovu(
    BACKUP_CLOUD_META_STORAGE_KEY,
    {}
  );

  const cekajiciSmazani =
    nactiObjektZLocalStorageProObnovu(
      BACKUP_PENDING_DELETE_STORAGE_KEY,
      []
    );

  const obnovovanaIdSet = new Set(
    Array.isArray(obnovovanaId)
      ? obnovovanaId.filter(Boolean)
      : []
  );

  const novaMeta = {
    ...(meta && typeof meta === "object"
      ? meta
      : {})
  };

  const znackaObnovy =
    `restore-pending:${importedAt}`;

  obnovovanaIdSet.forEach((id) => {
    const cloudRow = cloudPodleId.get(id);

    if (!cloudRow) {
      delete novaMeta[id];
      return;
    }

    const revision = Number(
      cloudRow.revision
    );

    if (!Number.isFinite(revision)) {
      throw vytvorChybuZalohy(
        `Cloudová poznámka ${id} nemá revizi.`,
        "Bezpečnou obnovu se nepodařilo připravit. Žádná data nebyla importována."
      );
    }

    /*
     * Serverovou revizi známe, ale lokální čas záměrně označíme
     * jinak. Bezpečný sync tak pozná výslovně obnovenou lokální
     * verzi a nahraje ji i přes novější cloudový tombstone.
     */
    novaMeta[id] = {
      revision,
      localUpdatedAt: znackaObnovy,
      serverUpdatedAt:
        cloudRow.updated_at || null
    };
  });

  return {
    user,
    meta: novaMeta,
    cekajiciSmazani:
      (Array.isArray(cekajiciSmazani)
        ? cekajiciSmazani
        : []
      ).filter(
        (zaznam) =>
          !obnovovanaIdSet.has(
            zaznam?.id
          )
      )
  };
}


function aplikujPlanCloudoveSynchronizacePoObnove(
  plan
) {
  localStorage.setItem(
    BACKUP_CLOUD_META_STORAGE_KEY,
    JSON.stringify(plan.meta || {})
  );

  localStorage.setItem(
    BACKUP_PENDING_DELETE_STORAGE_KEY,
    JSON.stringify(
      plan.cekajiciSmazani || []
    )
  );
}


async function obnovKompletniZalohu(
  imported,
  importedAt
) {
  if (!jePlatnaKompletniZaloha(imported)) {
    throw new Error(
      "Invalid complete backup format"
    );
  }

  const regularNotes = imported.notes.map(
    (task) =>
      normalizujImportovanouPoznamku(
        task,
        importedAt
      )
  );

  const obnovovanaId = [
    ...regularNotes.map((note) => note.id),
    ...imported.secretNotes.map(
      (record) => record.id
    )
  ];

  const plan =
    await vytvorPlanCloudoveSynchronizacePoObnove(
      obnovovanaId,
      importedAt
    );

  const ownerUserId =
    imported?.owner?.userId || null;

  if (
    ownerUserId &&
    ownerUserId !== plan.user.id
  ) {
    throw vytvorChybuZalohy(
      "Záloha patří jinému účtu.",
      "Tato kompletní záloha patří jinému účtu LubaNote. Obnova byla bezpečně zastavena."
    );
  }

  if (imported.secretSettings) {
    if (
      typeof obnovTajneNastaveniZKompletniZalohy !==
        "function" ||
      !await obnovTajneNastaveniZKompletniZalohy(
        imported.secretSettings,
        plan.user
      )
    ) {
      throw vytvorChybuZalohy(
        "Obnova tajného nastavení selhala.",
        "Tajné nastavení se nepodařilo bezpečně obnovit. Poznámky nebyly importovány."
      );
    }
  }

  if (
    typeof obnovStitkyZKompletniZalohy !==
      "function" ||
    !await obnovStitkyZKompletniZalohy(
      imported.publicTags,
      plan.user
    )
  ) {
    throw vytvorChybuZalohy(
      "Obnova veřejných štítků selhala.",
      "Štítky se nepodařilo bezpečně obnovit. Poznámky nebyly importovány."
    );
  }

  aplikujPlanCloudoveSynchronizacePoObnove(
    plan
  );

  ulozBeznePoznamkyPrimo(
    regularNotes,
    false
  );
  ulozSifrovaneTajneZaznamy(
    imported.secretNotes
  );

  localStorage.setItem(
    "plannedItems",
    JSON.stringify(imported.plannedItems)
  );

  obnovNastaveniZKompletniZalohy(
    imported.preferences
  );

  if (
    typeof ulozCekajiciTajnaMetadataZeZalohy ===
    "function"
  ) {
    ulozCekajiciTajnaMetadataZeZalohy(
      imported.secretMetadata || null,
      ownerUserId
    );
  }

  vycistiDesifrovaneTajnePoznamky();
  zvysReviziLokalnichZmenPoznamek();

  if (
    typeof obnovSystemoveNotifikacePoKompletniObnove ===
    "function"
  ) {
    try {
      await obnovSystemoveNotifikacePoKompletniObnove(
        regularNotes
      );
    } catch (error) {
      console.warn(
        "Systémové notifikace budou obnoveny později:",
        error
      );
    }
  }

  location.reload();
}


async function provedKompletniObnovuSeZpracovanimChyby(
  imported,
  importedAt
) {
  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Obnovuji kompletní zálohu…",
      150
    ) || (() => {});

  try {
    await obnovKompletniZalohu(
      imported,
      importedAt
    );
  } catch (error) {
    ukonciCekani();

    console.error(
      "Complete backup restore error:",
      error
    );

    zobrazZpravuAplikace(
      "Záloha a obnova",
      error?.uzivatelskaZprava ||
      "Soubor není platná kompletní záloha LubaNote."
    );

    return;
  }

  ukonciCekani();
}

function importTasks(file) {
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      const importedAt = new Date().toISOString();

      if (
        imported?.format ===
        LUBANOTE_BACKUP_FORMAT
      ) {
        if (!jePlatnaKompletniZaloha(imported)) {
          throw new Error(
            "Invalid complete backup format"
          );
        }

        if (
          typeof window.otevriVyberovyModal ===
          "function"
        ) {
          window.otevriVyberovyModal({
            nadpis:
              "Obnovit kompletní zálohu? Obnovené verze se uloží také do cloudu.",
            moznosti: [
              {
                hodnota: "obnovit",
                popisek: "Obnovit zálohu"
              },
              {
                hodnota: "zrusit",
                popisek: "Zrušit"
              }
            ],
            poVyberu: async (volba) => {
              if (volba !== "obnovit") {
                return;
              }

              await provedKompletniObnovuSeZpracovanimChyby(
                imported,
                importedAt
              );
            }
          });
          return;
        }

        await provedKompletniObnovuSeZpracovanimChyby(
          imported,
          importedAt
        );
        return;
      }

      if (
        imported?.format ===
          LUBANOTE_BACKUP_FORMAT_V2 &&
        Array.isArray(imported.notes) &&
        Array.isArray(imported.secretNotes)
      ) {
        const regularNotes = imported.notes.map(
          (task) => normalizujImportovanouPoznamku(task, importedAt)
        );

        ulozBeznePoznamkyPrimo(regularNotes, false);
        ulozSifrovaneTajneZaznamy(imported.secretNotes);
        vycistiDesifrovaneTajnePoznamky();
        location.reload();
        return;
      }

      /* Kompatibilita se starou zálohou, která byla jen pole poznámek. */
      if (!Array.isArray(imported)) {
        throw new Error("Invalid backup format");
      }

      const normalizedTasks = imported.map(
        (task) => normalizujImportovanouPoznamku(task, importedAt)
      );

      const secretTasks = normalizedTasks.filter(
        (task) => task.isSecret === true
      );

      if (secretTasks.length > 0) {
        if (
          typeof tajnySifrovaciKlic === "undefined" ||
          !tajnySifrovaciKlic
        ) {
          zobrazZpravuAplikace(
            "Záloha a obnova",
            "Záloha obsahuje tajné poznámky. Nejdřív odemkni tajný režim a import zopakuj."
          );
          return;
        }

        const encryptedOk =
          await ulozTajnePoznamkySifrovaneHned(secretTasks);

        if (!encryptedOk) {
          throw new Error("Secret backup encryption failed");
        }
      }

      ulozBeznePoznamkyPrimo(
        normalizedTasks.filter((task) => task.isSecret !== true),
        false
      );

      location.reload();
    } catch (error) {
      console.error("Import backup error:", error);
      zobrazZpravuAplikace(
        "Záloha a obnova",
        error?.uzivatelskaZprava ||
        "Soubor není platná záloha LubaNote."
      );
    }
  };

  reader.readAsText(file);
}
