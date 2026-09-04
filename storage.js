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

function spocitejPoznamkyProLimit() {
  const ids = new Set();

  nactiBeznePoznamkyZUloziste().forEach((task) => {
    if (task?.id) {
      ids.add(task.id);
    }
  });

  getSecretNoteIds().forEach((id) => {
    if (id) {
      ids.add(id);
    }
  });

  return ids.size;
}

window.LubaNoteStorageState = {
  ziskejReviziLokalnichZmenPoznamek,
  spocitejPoznamkyProLimit
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

function jePoznamkaVKosi(task) {
  return Boolean(task?.trashedAt);
}

function loadTask() {
  const beznePoznamky = nactiBeznePoznamkyZUloziste();

  /*
   * Koš je oddělený od běžné aplikace. Poznámka v koši proto nesmí
   * prosakovat do vyhledávání, Plánu, Připomínek ani běžných karet.
   * Tajné poznámky jsou navíc při zamknutí stále pouze ciphertext.
   */
  return [
    ...beznePoznamky,
    ...desifrovaneTajnePoznamky
  ].filter((task) => !jePoznamkaVKosi(task));
}

function nactiPoznamkyVKosi({ tajne = false } = {}) {
  if (tajne) {
    return desifrovaneTajnePoznamky
      .filter((task) => jePoznamkaVKosi(task))
      .map((task) => ({ ...task, isSecret: true }));
  }

  return nactiBeznePoznamkyZUloziste()
    .filter((task) => jePoznamkaVKosi(task));
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


function slucPoznamkySPuvodnimKosem(prichozi, puvodni) {
  const vysledek = [];
  const obsazenaId = new Set();

  (Array.isArray(prichozi) ? prichozi : []).forEach((task) => {
    if (!task) {
      return;
    }

    if (task.id) {
      obsazenaId.add(task.id);
    }

    vysledek.push(task);
  });

  (Array.isArray(puvodni) ? puvodni : []).forEach((task) => {
    if (
      !task ||
      !jePoznamkaVKosi(task) ||
      (task.id && obsazenaId.has(task.id))
    ) {
      return;
    }

    vysledek.push(task);
  });

  return odstranDuplicitniPoznamkySeStejnymId(vysledek);
}

function saveAllTasks(tasks) {
  const safeTasks =
    odstranDuplicitniPoznamkySeStejnymId(tasks);

  /*
   * loadTask() záměrně vrací jen aktivní poznámky. Každé běžné uložení
   * proto musí zachovat starší položky Koše, které v předaném seznamu
   * vůbec nejsou. Pokud stejná poznámka přijde v novém stavu (např.
   * obnovená z Koše), příchozí verze má přednost.
   */
  const puvodniBezne =
    nactiBeznePoznamkyZUloziste();
  const puvodniTajne =
    desifrovaneTajnePoznamky;

  /*
   * Každé běžné lokální uložení je nová uživatelská revize.
   * Přímé zápisy, které provádí samotný sync, tento čítač
   * nezvyšují.
   */
  zvysReviziLokalnichZmenPoznamek();

  const beznePrichozi = safeTasks.filter(
    (task) => task && task.isSecret !== true
  );
  const tajnePrichozi = safeTasks.filter(
    (task) => task?.id && task.isSecret === true
  );

  const beznePoznamky =
    slucPoznamkySPuvodnimKosem(
      beznePrichozi,
      puvodniBezne
    );

  const tajnePoznamky =
    slucPoznamkySPuvodnimKosem(
      tajnePrichozi,
      puvodniTajne
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
  if (tajnePrichozi.length > 0) {
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

function ziskejNotifikacePoznamkyAKNavazanymPlanum(task) {
  const ids = new Set();
  const noteId = task?.id || null;

  if (task?.notificationId) {
    ids.add(task.notificationId);
  }

  if (typeof loadPlannedItems === "function") {
    const plannedItems = loadPlannedItems();

    plannedItems.forEach((item) => {
      if (
        item?.sourceNoteId === noteId &&
        item?.notificationId
      ) {
        ids.add(item.notificationId);
      }
    });
  }

  return ids;
}

function odstranPlanovanePolozkyPoznamek(idsPoznamek) {
  if (
    !(idsPoznamek instanceof Set) ||
    idsPoznamek.size === 0 ||
    typeof loadPlannedItems !== "function" ||
    typeof savePlannedItems !== "function"
  ) {
    return;
  }

  const plannedItems = loadPlannedItems();

  savePlannedItems(
    plannedItems.filter(
      (item) => !idsPoznamek.has(item?.sourceNoteId)
    )
  );
}

function zrusNotifikaceNaPozadi(notificationIds) {
  if (
    !(notificationIds instanceof Set) ||
    notificationIds.size === 0 ||
    typeof cancelNotification !== "function"
  ) {
    return;
  }

  setTimeout(() => {
    Promise.allSettled(
      [...notificationIds].map((id) =>
        cancelNotification(id)
      )
    ).catch(() => {});
  }, 0);
}

async function deleteTask(index) {
  const tasks = loadTask();
  const taskToDelete = tasks[index];

  if (!taskToDelete) {
    return false;
  }

  const casPresunu = new Date().toISOString();
  const notificationIds =
    ziskejNotifikacePoznamkyAKNavazanymPlanum(
      taskToDelete
    );

  taskToDelete.trashedAt = casPresunu;
  taskToDelete.updatedAt = casPresunu;

  odstranPlanovanePolozkyPoznamek(
    new Set([taskToDelete.id].filter(Boolean))
  );

  await saveAllTasks(tasks);
  zrusNotifikaceNaPozadi(notificationIds);

  /*
   * Přesun do Koše není serverové smazání. Synchronizujeme celý nový
   * stav poznámky, takže se Koš objeví stejně i na ostatních zařízeních.
   */
  if (
    taskToDelete.id &&
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    uploadLocalNoteToSupabase(taskToDelete)
      .catch((error) => {
        console.warn(
          "Synchronizace přesunu do Koše byla odložena:",
          error
        );
      });
  }

  return true;
}

/*
 * HROMADNÉ PŘESUNUTÍ DO KOŠE PODLE STABILNÍCH ID.
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
    (task) => task?.id && bezpecnaId.has(task.id)
  );

  if (mazanePoznamky.length === 0) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }

  const casPresunu = new Date().toISOString();
  const notificationIds = new Set();

  mazanePoznamky.forEach((task) => {
    ziskejNotifikacePoznamkyAKNavazanymPlanum(task)
      .forEach((id) => notificationIds.add(id));

    task.trashedAt = casPresunu;
    task.updatedAt = casPresunu;
  });

  odstranPlanovanePolozkyPoznamek(
    new Set(mazanePoznamky.map((task) => task.id))
  );

  const lokalneUlozeno =
    await saveAllTasks(tasks);

  if (lokalneUlozeno === false) {
    return {
      pocet: 0,
      lokalneUlozeno: false
    };
  }

  zrusNotifikaceNaPozadi(notificationIds);

  return {
    pocet: mazanePoznamky.length,
    lokalneUlozeno: true
  };
}

async function obnovPoznamkuZKose(noteId, tajne = false) {
  if (!noteId) {
    return false;
  }

  if (
    tajne &&
    (
      typeof tajnyRezimOdemceny === "undefined" ||
      tajnyRezimOdemceny !== true
    )
  ) {
    return false;
  }

  const kos = nactiPoznamkyVKosi({ tajne });
  const puvodni = kos.find((task) => task?.id === noteId);

  if (!puvodni) {
    return false;
  }

  const obnovena = {
    ...puvodni,
    updatedAt: new Date().toISOString()
  };

  delete obnovena.trashedAt;

  const aktivni = loadTask();
  const bezStejnehoId = aktivni.filter(
    (task) => task?.id !== noteId
  );

  const ulozeno = await saveAllTasks([
    ...bezStejnehoId,
    obnovena
  ]);

  if (ulozeno === false) {
    return false;
  }

  if (
    window.LubaNotePlanner
      ?.synchronizujPlanovaneTodoSPoznamkou
  ) {
    await window.LubaNotePlanner
      .synchronizujPlanovaneTodoSPoznamkou(
        obnovena
      );
  }

  if (
    typeof obnovNotifikacePoznamkyPodleSoukromi === "function"
  ) {
    obnovNotifikacePoznamkyPodleSoukromi(
      obnovena
    ).catch(() => {});
  }

  if (typeof uploadLocalNoteToSupabase === "function") {
    uploadLocalNoteToSupabase(obnovena)
      .catch((error) => {
        console.warn(
          "Synchronizace obnovení z Koše byla odložena:",
          error
        );
      });
  }

  return true;
}

async function smazPoznamkuZKoseTrvale(noteId, tajne = false) {
  if (!noteId) {
    return false;
  }

  if (
    tajne &&
    (
      typeof tajnyRezimOdemceny === "undefined" ||
      tajnyRezimOdemceny !== true
    )
  ) {
    return false;
  }

  const zdroj = tajne
    ? [...desifrovaneTajnePoznamky]
    : nactiBeznePoznamkyZUloziste();

  const poznamka = zdroj.find(
    (task) => task?.id === noteId && jePoznamkaVKosi(task)
  );

  if (!poznamka) {
    return false;
  }

  zvysReviziLokalnichZmenPoznamek();

  if (tajne) {
    const zbyvajici = zdroj.filter(
      (task) => task?.id !== noteId
    );

    nastavDesifrovaneTajnePoznamky(zbyvajici);
    const ulozeno =
      await ulozTajnePoznamkySifrovaneHned(zbyvajici);

    if (ulozeno === false) {
      return false;
    }
  } else {
    ulozBeznePoznamkyPrimo(
      zdroj.filter((task) => task?.id !== noteId)
    );
  }

  if (
    typeof markNoteDeletedInSupabase === "function"
  ) {
    await markNoteDeletedInSupabase(poznamka);
  }

  return true;
}

async function uklidPoznamkyVKosiPo30Dnech() {
  const LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
  const hranice = Date.now() - LIMIT_MS;
  const kandidati = [];

  nactiPoznamkyVKosi({ tajne: false })
    .forEach((task) => {
      const cas = new Date(task?.trashedAt || 0).getTime();
      if (Number.isFinite(cas) && cas <= hranice) {
        kandidati.push({ id: task.id, tajne: false });
      }
    });

  if (
    typeof tajnyRezimOdemceny !== "undefined" &&
    tajnyRezimOdemceny === true
  ) {
    nactiPoznamkyVKosi({ tajne: true })
      .forEach((task) => {
        const cas = new Date(task?.trashedAt || 0).getTime();
        if (Number.isFinite(cas) && cas <= hranice) {
          kandidati.push({ id: task.id, tajne: true });
        }
      });
  }

  let pocet = 0;

  for (const kandidat of kandidati) {
    const uspesne = await smazPoznamkuZKoseTrvale(
      kandidat.id,
      kandidat.tajne
    );

    if (uspesne) {
      pocet += 1;
    }
  }

  return pocet;
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


const LUBANOTE_BACKUP_ARCHIVE_FORMAT =
  "LubaNote-backup-archive-v4";

const LUBANOTE_BACKUP_ARCHIVE_VERSION = 4;

const LUBANOTE_BACKUP_ATTACHMENT_PHASE =
  "cloud_shadow_v1";


function vytvorNazevSouboruZalohyArchivu() {
  const cas = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  return `lubanote-backup-${cas}.lubbackup`;
}


function najdiAttachmentIdsVHtmlProZalohu(
  html,
  cil
) {
  if (typeof html !== "string" || !html) {
    return;
  }

  const regex =
    /data-attachment-id\s*=\s*["']([^"']+)["']/gi;
  let shoda;

  while ((shoda = regex.exec(html)) !== null) {
    const id = String(shoda[1] || "").trim();

    if (id) {
      cil.add(id);
    }
  }
}


function ziskejAttachmentIdsPoznamkyProZalohu(note) {
  if (
    typeof window.LubaNoteAttachmentsCloud
      ?.ziskejAttachmentIdsZPoznamky === "function"
  ) {
    return window.LubaNoteAttachmentsCloud
      .ziskejAttachmentIdsZPoznamky(note);
  }

  const ids = new Set();

  najdiAttachmentIdsVHtmlProZalohu(
    note?.richContent,
    ids
  );

  for (const todo of Array.isArray(note?.todos)
    ? note.todos
    : []) {
    najdiAttachmentIdsVHtmlProZalohu(
      todo?.html,
      ids
    );
  }

  return Array.from(ids);
}


function vytvorMapuPrilohProZalohu(notes) {
  const mapa = new Map();

  for (const note of Array.isArray(notes) ? notes : []) {
    if (!note?.id || note.isSecret === true) {
      continue;
    }

    const ids =
      ziskejAttachmentIdsPoznamkyProZalohu(note);

    for (const id of ids) {
      if (!mapa.has(id)) {
        mapa.set(id, {
          id,
          noteId: note.id
        });
      }
    }
  }

  return mapa;
}


function najdiDataUrlPrilohVHtml(
  html,
  mapa
) {
  if (typeof html !== "string" || !html) {
    return;
  }

  const kontejner = document.createElement("div");
  kontejner.innerHTML = html;

  kontejner
    .querySelectorAll("[data-attachment-id]")
    .forEach((prvek) => {
      const id = String(
        prvek.dataset?.attachmentId || ""
      ).trim();

      if (!id || mapa.has(id)) {
        return;
      }

      const obrazek = prvek.matches("img")
        ? prvek
        : prvek.querySelector("img");

      const src = String(
        obrazek?.getAttribute("src") || ""
      );

      if (src.startsWith("data:")) {
        mapa.set(id, src);
      }
    });
}


function vytvorMapuDataUrlPrilohProZalohu(notes) {
  const mapa = new Map();

  for (const note of Array.isArray(notes) ? notes : []) {
    if (note?.isSecret === true) {
      continue;
    }

    najdiDataUrlPrilohVHtml(
      note?.richContent,
      mapa
    );

    for (const todo of Array.isArray(note?.todos)
      ? note.todos
      : []) {
      najdiDataUrlPrilohVHtml(
        todo?.html,
        mapa
      );
    }
  }

  return mapa;
}


function dataUrlNaBlobProZalohu(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:")
  ) {
    return null;
  }

  const oddelovac = dataUrl.indexOf(",");

  if (oddelovac < 0) {
    return null;
  }

  const hlavicka = dataUrl.slice(5, oddelovac);
  const obsah = dataUrl.slice(oddelovac + 1);
  const casti = hlavicka.split(";");
  const mimeType = casti[0] ||
    "application/octet-stream";
  const jeBase64 = casti.includes("base64");

  if (!jeBase64) {
    return new Blob(
      [decodeURIComponent(obsah)],
      { type: mimeType }
    );
  }

  const binarni = atob(obsah);
  const bajty = new Uint8Array(binarni.length);

  for (let i = 0; i < binarni.length; i += 1) {
    bajty[i] = binarni.charCodeAt(i);
  }

  return new Blob(
    [bajty],
    { type: mimeType }
  );
}


async function pripravCloudProKompletniZalohu() {
  if (!navigator.onLine) {
    return false;
  }

  if (
    typeof window.LubaNoteSupabase
      ?.pripravClient === "function"
  ) {
    const pripraven =
      await window.LubaNoteSupabase
        .pripravClient();

    if (!pripraven) {
      return false;
    }
  } else if (
    typeof pripravSupabaseClient === "function"
  ) {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven) {
      return false;
    }
  }

  return Boolean(
    typeof supabaseClient !== "undefined" &&
    supabaseClient
  );
}


async function nactiCloudMetadataPrilohProZalohu(
  attachmentIds
) {
  const ids = Array.from(
    new Set(
      (Array.isArray(attachmentIds)
        ? attachmentIds
        : []
      ).filter(Boolean)
    )
  );

  const mapa = new Map();

  if (ids.length === 0) {
    return mapa;
  }

  if (!await pripravCloudProKompletniZalohu()) {
    return mapa;
  }

  for (let zacatek = 0; zacatek < ids.length; zacatek += 100) {
    const cast = ids.slice(zacatek, zacatek + 100);

    const { data, error } = await supabaseClient
      .from("attachments")
      .select(
        "id,note_id,mime_type,storage_path,size_bytes,status,is_secret"
      )
      .in("id", cast);

    if (error) {
      console.warn(
        "LubaNote backup: metadata příloh se nepodařilo načíst z cloudu.",
        error
      );
      return mapa;
    }

    for (const zaznam of Array.isArray(data) ? data : []) {
      if (zaznam?.id) {
        mapa.set(zaznam.id, zaznam);
      }
    }
  }

  return mapa;
}


async function nactiBlobPrilohyProZalohu({
  attachmentId,
  lokalniZaznam,
  cloudMetadata,
  dataUrl
}) {
  if (lokalniZaznam?.blob instanceof Blob) {
    return lokalniZaznam.blob;
  }

  if (
    cloudMetadata?.storage_path &&
    cloudMetadata?.status !== "deleted" &&
    await pripravCloudProKompletniZalohu()
  ) {
    const bucket =
      window.LubaNoteAttachmentsCloud?.bucket ||
      "lubanote-attachments";

    const { data, error } =
      await supabaseClient.storage
        .from(bucket)
        .download(cloudMetadata.storage_path);

    if (!error && data instanceof Blob) {
      return data;
    }

    if (error) {
      console.warn(
        `LubaNote backup: cloudová příloha ${attachmentId} se nepodařila stáhnout.`,
        error
      );
    }
  }

  return dataUrlNaBlobProZalohu(dataUrl);
}


async function vypocitejSha256Blobu(blob) {
  if (!globalThis.crypto?.subtle) {
    return null;
  }

  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    buffer
  );

  return Array.from(new Uint8Array(digest))
    .map((bajt) =>
      bajt.toString(16).padStart(2, "0")
    )
    .join("");
}


function prevedBajtyNaBase64(bajty) {
  let binarni = "";
  const VELIKOST_PREVODU = 0x8000;

  for (
    let zacatek = 0;
    zacatek < bajty.length;
    zacatek += VELIKOST_PREVODU
  ) {
    const cast = bajty.subarray(
      zacatek,
      Math.min(
        zacatek + VELIKOST_PREVODU,
        bajty.length
      )
    );

    binarni += String.fromCharCode(...cast);
  }

  return btoa(binarni);
}


async function pridejTextDoNativnihoArchivu(
  BackupExport,
  archivniCesta,
  text
) {
  const obsah = String(text ?? "");
  const kodovani = new TextEncoder();
  const ocekavaneBajty =
    kodovani.encode(obsah).byteLength;

  await BackupExport.zahajPrilohu({
    nazev: archivniCesta,
    ocekavaneBajty
  });

  const VELIKOST_TEXTOVE_CASTI =
    64 * 1024;
  let zacatek = 0;
  let odeslaneBajty = 0;

  while (zacatek < obsah.length) {
    let konec = Math.min(
      zacatek + VELIKOST_TEXTOVE_CASTI,
      obsah.length
    );

    if (
      konec < obsah.length &&
      konec > zacatek
    ) {
      const posledniKod =
        obsah.charCodeAt(konec - 1);
      const dalsiKod =
        obsah.charCodeAt(konec);

      if (
        posledniKod >= 0xD800 &&
        posledniKod <= 0xDBFF &&
        dalsiKod >= 0xDC00 &&
        dalsiKod <= 0xDFFF
      ) {
        konec -= 1;
      }
    }

    const bajty = kodovani.encode(
      obsah.slice(zacatek, konec)
    );

    const vysledek =
      await BackupExport.pridejPrilohuCast({
        base64: prevedBajtyNaBase64(bajty)
      });

    odeslaneBajty += bajty.byteLength;

    if (
      Number(vysledek?.bytes || 0) !==
      odeslaneBajty
    ) {
      throw new Error(
        `Android nepřijal celý soubor ${archivniCesta}.`
      );
    }

    zacatek = konec;
  }

  const dokonceni =
    await BackupExport.dokoncitPrilohu();

  if (
    Number(dokonceni?.bytes || 0) !==
    ocekavaneBajty
  ) {
    throw new Error(
      `Soubor ${archivniCesta} není v archivu kompletní.`
    );
  }
}


async function pridejBlobDoNativnihoArchivu(
  BackupExport,
  archivniCesta,
  blob
) {
  const VELIKOST_BINARNI_CASTI =
    192 * 1024;

  await BackupExport.zahajPrilohu({
    nazev: archivniCesta,
    ocekavaneBajty: blob.size
  });

  let odeslano = 0;

  while (odeslano < blob.size) {
    const konec = Math.min(
      odeslano + VELIKOST_BINARNI_CASTI,
      blob.size
    );

    const buffer = await blob
      .slice(odeslano, konec)
      .arrayBuffer();

    const base64 = prevedBajtyNaBase64(
      new Uint8Array(buffer)
    );

    const vysledek =
      await BackupExport.pridejPrilohuCast({
        base64
      });

    const prijato = Number(
      vysledek?.bytes || 0
    );

    if (prijato !== konec) {
      throw new Error(
        `Android nepřijal celou přílohu ${archivniCesta}.`
      );
    }

    odeslano = konec;
  }

  const dokonceni =
    await BackupExport.dokoncitPrilohu();

  if (Number(dokonceni?.bytes || 0) !== blob.size) {
    throw new Error(
      `Příloha ${archivniCesta} není v archivu kompletní.`
    );
  }
}


async function vytvorAProvedKompletniArchivV4(
  backup,
  zpusobExportu,
  tlacitko
) {
  const BackupExport =
    window.Capacitor
      ?.Plugins?.LubaNoteBackupExport;

  if (
    !BackupExport?.zahajArchiv ||
    !BackupExport?.zahajPrilohu ||
    !BackupExport?.pridejPrilohuCast ||
    !BackupExport?.dokoncitPrilohu ||
    !BackupExport?.dokoncitArchiv
  ) {
    throw vytvorChybuZalohy(
      "APK nemá podporu kompletního archivu V4.",
      "Tato APK ještě neumí novou kompletní zálohu s přílohami. Nainstaluj aktuální verzi LubaNote a export zopakuj."
    );
  }

  const mapaPriloh =
    vytvorMapuPrilohProZalohu(backup.notes);

  const dataUrlMapa =
    vytvorMapuDataUrlPrilohProZalohu(backup.notes);

  const ids = Array.from(mapaPriloh.keys());
  const cloudMetadataMapa =
    await nactiCloudMetadataPrilohProZalohu(ids);

  const polozkyManifestu = [];
  let celkemBajtuPriloh = 0;
  let archivDokoncen = false;

  await BackupExport.zahajArchiv();

  try {
    await pridejTextDoNativnihoArchivu(
      BackupExport,
      "backup.json",
      JSON.stringify(backup)
    );

    let poradoveCislo = 0;

    for (const [attachmentId, identita] of mapaPriloh) {
      const lokalniZaznam =
        await window.LubaNoteAttachmentsLocal
          ?.nactiPrilohu?.(attachmentId);

      const cloudMetadata =
        cloudMetadataMapa.get(attachmentId) || null;

      /*
       * Staré shadow_v1 attachment ID je pouze diagnostická cache
       * FÁZE A. Jeho obrázek zůstává uvnitř backup.json jako Data URL
       * a není součástí nové Storage autority.
       */
      const jeNovaPriloha = Boolean(
        cloudMetadata ||
        lokalniZaznam?.faze ===
          LUBANOTE_BACKUP_ATTACHMENT_PHASE
      );

      if (!jeNovaPriloha) {
        continue;
      }

      poradoveCislo += 1;

      if (tlacitko) {
        tlacitko.textContent =
          `Přidávám přílohy… ${poradoveCislo}/${mapaPriloh.size}`;
      }

      const blob = await nactiBlobPrilohyProZalohu({
        attachmentId,
        lokalniZaznam,
        cloudMetadata,
        dataUrl: dataUrlMapa.get(attachmentId) || null
      });

      if (!(blob instanceof Blob) || blob.size <= 0) {
        throw vytvorChybuZalohy(
          `Příloha ${attachmentId} není dostupná.`,
          "Kompletní zálohu nelze dokončit, protože jedna z příloh není dostupná ani lokálně ani v cloudu. Připoj zařízení k internetu a export zopakuj."
        );
      }

      const mimeType =
        cloudMetadata?.mime_type ||
        lokalniZaznam?.mimeType ||
        blob.type ||
        "application/octet-stream";

      const pripona =
        mimeType === "image/jpeg"
          ? "jpg"
          : "bin";

      const archivniCesta =
        `attachments/${attachmentId}.${pripona}`;

      const sha256 =
        await vypocitejSha256Blobu(blob);

      await pridejBlobDoNativnihoArchivu(
        BackupExport,
        archivniCesta,
        blob
      );

      celkemBajtuPriloh += blob.size;

      polozkyManifestu.push({
        id: attachmentId,
        noteId:
          cloudMetadata?.note_id ||
          lokalniZaznam?.noteId ||
          identita.noteId ||
          null,
        mimeType,
        sizeBytes: blob.size,
        sha256,
        archivePath: archivniCesta,
        storagePath:
          cloudMetadata?.storage_path ||
          lokalniZaznam?.storagePath ||
          null
      });
    }

    const manifest = {
      format: LUBANOTE_BACKUP_ARCHIVE_FORMAT,
      version: LUBANOTE_BACKUP_ARCHIVE_VERSION,
      complete: true,
      exportedAt: backup.exportedAt,
      appVersion: backup.appVersion || null,
      owner: backup.owner || { userId: null },
      backupJson: {
        path: "backup.json",
        format: backup.format,
        version: backup.version
      },
      attachmentCount: polozkyManifestu.length,
      attachmentBytes: celkemBajtuPriloh,
      attachments: polozkyManifestu
    };

    await pridejTextDoNativnihoArchivu(
      BackupExport,
      "manifest.json",
      JSON.stringify(manifest, null, 2)
    );

    const dokonceni =
      await BackupExport.dokoncitArchiv();

    archivDokoncen = true;

    if (
      !dokonceni?.ready ||
      Number(dokonceni?.bytes || 0) <= 0
    ) {
      throw new Error(
        "Android nevytvořil platný kompletní archiv."
      );
    }

    const nazevSouboru =
      vytvorNazevSouboruZalohyArchivu();

    if (zpusobExportu === "sdilet") {
      const Share =
        window.Capacitor?.Plugins?.Share;

      if (!Share) {
        throw new Error(
          "V APK chybí nativní plugin Share."
        );
      }

      const soubor =
        await BackupExport.ziskejArchivProSdileni();

      if (!soubor?.uri) {
        throw new Error(
          "Android nepřipravil archiv ke sdílení."
        );
      }

      await Share.share({
        title: "Kompletní záloha LubaNote",
        text: "Kompletní záloha dat a příloh LubaNote",
        files: [soubor.uri],
        dialogTitle: "Uložit nebo sdílet zálohu"
      });

      /*
       * Dočasný soubor po sdílení nemažeme hned. Cílová aplikace
       * může content URI načítat ještě chvíli po zavření share sheetu.
       * Při příštím exportu se stejný jediný temp soubor bezpečně
       * přepíše a Android cache jej může uklidit také sama.
       */
      return {
        saved: true,
        shared: true,
        bytes: Number(soubor?.bytes || 0),
        manifest
      };
    }

    const vysledek =
      await BackupExport.otevriUlozeniArchivu({
        nazevSouboru
      });

    return {
      ...(vysledek || {}),
      manifest
    };
  } catch (error) {
    if (!archivDokoncen) {
      try {
        await BackupExport.vycistiArchiv?.();
      } catch {
        // Dočasný archiv se při dalším exportu stejně přepíše.
      }
    }

    throw error;
  }
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


async function vytvorKompletniZalohu(moznosti = {}) {
  await cekajNaUlozeniTajnychPoznamek();

  const notes =
    nactiBeznePoznamkyZUloziste();
  const secretNotes =
    nactiSifrovaneTajneZaznamy();

  const tajneNastaveni =
    await ziskejTajneNastaveniProZalohu(
      secretNotes.length
    );

  const pouzitSifrovaneTajneStitkyV4 =
    moznosti?.sifrovaneTajneStitkyV4 === true;

  let verejneStitky = [];
  let tajneStitky = [];
  let secretTagRecords = [];
  let secretMetadata = null;

  try {
    if (pouzitSifrovaneTajneStitkyV4) {
      if (
        typeof ziskejStitkyProKompletniZalohuV4 !==
        "function"
      ) {
        throw new Error(
          "Modul štítků V4 není dostupný."
        );
      }

      const stitkyV4 =
        await ziskejStitkyProKompletniZalohuV4();

      verejneStitky = Array.isArray(
        stitkyV4?.publicTags
      ) ? stitkyV4.publicTags : [];

      secretTagRecords = Array.isArray(
        stitkyV4?.secretTagRecords
      ) ? stitkyV4.secretTagRecords : [];
    } else {
      if (
        typeof ziskejStitkyProKompletniZalohu !==
        "function"
      ) {
        throw new Error(
          "Modul štítků není dostupný."
        );
      }

      const vsechnyStitky =
        await ziskejStitkyProKompletniZalohu();

      verejneStitky = vsechnyStitky
        .filter(
          (stitek) => stitek.is_secret !== true
        );

      tajneStitky = vsechnyStitky
        .filter(
          (stitek) => stitek.is_secret === true
        );

      if (tajneStitky.length > 0) {
        if (
          typeof zasifrujMetadataKompletniZalohy !==
            "function" ||
          typeof tajnySifrovaciKlic === "undefined" ||
          !tajnySifrovaciKlic
        ) {
          throw new Error(
            "Nejdřív odemkni tajný režim. Tajné štítky musí být v kompletní záloze bezpečně zašifrované."
          );
        }

        secretMetadata =
          await zasifrujMetadataKompletniZalohy({
            tags: tajneStitky
          });
      }
    }
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
      secretTagCount: pouzitSifrovaneTajneStitkyV4 ?
        secretTagRecords.length :
        tajneStitky.length,
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
    secretTagEncoding:
      pouzitSifrovaneTajneStitkyV4 ?
        "encrypted-records-v1" :
        "legacy-secret-metadata-v1",
    secretTagRecords:
      pouzitSifrovaneTajneStitkyV4 ?
        secretTagRecords :
        undefined,
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
    const jeApk =
      window.Capacitor
        ?.isNativePlatform?.() === true;

    const backup =
      await vytvorKompletniZalohu({
        sifrovaneTajneStitkyV4: jeApk
      });

    if (jeApk) {
      const vysledek =
        await vytvorAProvedKompletniArchivV4(
          backup,
          zpusobExportu,
          tlacitko
        );

      if (
        vysledek?.saved === true &&
        zpusobExportu !== "sdilet" &&
        typeof zobrazZpravuAplikace ===
        "function"
      ) {
        const pocetPriloh = Number(
          vysledek?.manifest?.attachmentCount || 0
        );

        zobrazZpravuAplikace(
          "Kompletní záloha",
          `Kompletní záloha byla uložena. Archiv obsahuje ${pocetPriloh} cloudových příloh.`
        );
      }
    } else {
      /*
       * Web zatím zůstává na kompatibilním JSON V3. V současné
       * FÁZI B jsou Data URL stále uvnitř poznámek, takže je webová
       * záloha pořád kompletní. Před odstraněním Data URL autority
       * dostane web stejný streamovaný archivový formát V4.
       */
      const data =
        JSON.stringify(backup, null, 2);

      stahniZalohuVeWebu(
        data,
        vytvorNazevSouboruZalohy()
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
        (zpravaChyby
          ? `Zálohu se nepodařilo vytvořit. Detail: ${zpravaChyby}`
          : "Zálohu se nepodařilo vytvořit. Zkus to prosím znovu.")
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


function jePlatnySifrovanyTajnyStitekV4(zaznam) {
  const encryptedName = zaznam?.encrypted_name;

  return Boolean(
    zaznam?.id &&
    zaznam?.is_secret === true &&
    encryptedName &&
    typeof encryptedName === "object" &&
    encryptedName.algorithm === "AES-GCM" &&
    encryptedName.iv &&
    encryptedName.ciphertext
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
  const pocetTajnychStitku = Number(
    manifest.secretTagCount
  );
  const pouzivaV4TajneStitky =
    zaloha.secretTagEncoding ===
      "encrypted-records-v1";

  if (pouzivaV4TajneStitky) {
    if (
      !Array.isArray(zaloha.secretTagRecords) ||
      zaloha.secretTagRecords.length !==
        pocetTajnychStitku ||
      !zaloha.secretTagRecords.every(
        jePlatnySifrovanyTajnyStitekV4
      )
    ) {
      return false;
    }
  } else if (
    pocetTajnychStitku > 0 &&
    !zaloha.secretMetadata
  ) {
    return false;
  }

  return (
    Number(manifest.regularNoteCount) ===
      zaloha.notes.length &&
    Number(manifest.secretNoteCount) ===
      zaloha.secretNotes.length &&
    Number(manifest.publicTagCount) ===
      zaloha.publicTags.length &&
    Number(manifest.plannedItemCount) ===
      zaloha.plannedItems.length
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
  importedAt,
  moznosti = {}
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

  if (
    typeof moznosti.predObnovou === "function"
  ) {
    await moznosti.predObnovou({
      plan,
      regularNotes,
      ownerUserId
    });
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

  const pouzivaSifrovaneTajneStitkyV4 =
    imported.secretTagEncoding ===
      "encrypted-records-v1";

  if (pouzivaSifrovaneTajneStitkyV4) {
    if (
      typeof obnovStitkyZKompletniZalohyV4 !==
        "function" ||
      !await obnovStitkyZKompletniZalohyV4(
        imported.publicTags,
        imported.secretTagRecords,
        plan.user
      )
    ) {
      throw vytvorChybuZalohy(
        "Obnova štítků V4 selhala.",
        "Štítky se nepodařilo bezpečně obnovit. Poznámky nebyly importovány."
      );
    }
  } else if (
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

  if (
    typeof moznosti.predLokalnimUlozenim ===
      "function"
  ) {
    await moznosti.predLokalnimUlozenim({
      plan,
      regularNotes,
      ownerUserId
    });
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

  if (
    typeof moznosti.predReload === "function"
  ) {
    await moznosti.predReload({
      plan,
      regularNotes,
      ownerUserId
    });
  }

  location.reload();
}


async function provedKompletniObnovuSeZpracovanimChyby(
  imported,
  importedAt,
  moznosti = {}
) {
  window.zavriVyberovyModal?.();

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Obnovuji kompletní zálohu…",
      0
    ) || (() => {});

  /*
   * Potvrzovací okno musí nejdřív zmizet a čekací stav se musí
   * skutečně vykreslit. Teprve další snímek může zahájit delší
   * obnovu, jinak Android WebView přeskočí rovnou k reloadu.
   */
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

  try {
    await obnovKompletniZalohu(
      imported,
      importedAt,
      moznosti
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


function base64NaUint8ArrayProImport(base64) {
  const binarni = atob(base64 || "");
  const bajty = new Uint8Array(binarni.length);

  for (let i = 0; i < binarni.length; i += 1) {
    bajty[i] = binarni.charCodeAt(i);
  }

  return bajty;
}


async function nactiPolozkuNativeZalohyV4(
  BackupExport,
  nazev,
  moznosti = {}
) {
  const jakoText = moznosti.jakoText === true;
  const mimeType = moznosti.mimeType ||
    "application/octet-stream";

  const start = await BackupExport.zahajCteniImportu({
    nazev
  });

  const ocekavaneBajty = Number(start?.bytes) || 0;

  if (ocekavaneBajty <= 0) {
    throw new Error(
      `Položka ${nazev || "zálohy"} je prázdná.`
    );
  }

  const casti = [];
  const decoder = jakoText
    ? new TextDecoder("utf-8", { fatal: true })
    : null;

  let prijato = 0;
  let hotovo = false;

  try {
    while (!hotovo) {
      const odpoved =
        await BackupExport.nactiCastImportu({
          maxBajtu: 96 * 1024
        });

      const bajty = base64NaUint8ArrayProImport(
        odpoved?.base64 || ""
      );

      prijato += bajty.byteLength;

      if (jakoText) {
        casti.push(
          decoder.decode(
            bajty,
            { stream: odpoved?.done !== true }
          )
        );
      } else if (bajty.byteLength > 0) {
        casti.push(bajty);
      }

      hotovo = odpoved?.done === true;
    }

    await BackupExport.dokoncitCteniImportu();
  } catch (error) {
    try {
      await BackupExport.dokoncitCteniImportu();
    } catch {
      // Původní chyba má přednost.
    }
    throw error;
  }

  if (prijato !== ocekavaneBajty) {
    throw new Error(
      `Položka ${nazev || "zálohy"} není kompletní.`
    );
  }

  if (jakoText) {
    return casti.join("");
  }

  return new Blob(casti, { type: mimeType });
}


function jePlatnyManifestArchivuV4(
  manifest,
  backup
) {
  if (
    manifest?.format !==
      LUBANOTE_BACKUP_ARCHIVE_FORMAT ||
    Number(manifest.version) !==
      LUBANOTE_BACKUP_ARCHIVE_VERSION ||
    manifest.complete !== true ||
    manifest?.backupJson?.path !== "backup.json" ||
    manifest?.backupJson?.format !==
      LUBANOTE_BACKUP_FORMAT ||
    Number(manifest?.backupJson?.version) !== 3 ||
    !Array.isArray(manifest.attachments) ||
    Number(manifest.attachmentCount) !==
      manifest.attachments.length
  ) {
    return false;
  }

  if (
    manifest?.owner?.userId &&
    backup?.owner?.userId &&
    manifest.owner.userId !==
      backup.owner.userId
  ) {
    return false;
  }

  const mapaReferenci =
    vytvorMapuPrilohProZalohu(backup.notes);
  const ids = new Set();
  let soucetBajtu = 0;

  for (const polozka of manifest.attachments) {
    const id = String(polozka?.id || "").trim();
    const noteId = String(
      polozka?.noteId || ""
    ).trim();
    const velikost = Number(polozka?.sizeBytes);
    const reference = mapaReferenci.get(id);

    if (
      !id ||
      !noteId ||
      ids.has(id) ||
      polozka?.mimeType !== "image/jpeg" ||
      !Number.isFinite(velikost) ||
      velikost <= 0 ||
      velikost > 2 * 1024 * 1024 ||
      polozka?.archivePath !==
        `attachments/${id}.jpg` ||
      !/^[0-9a-f]{64}$/i.test(
        String(polozka?.sha256 || "")
      ) ||
      !reference ||
      String(reference.noteId) !== noteId
    ) {
      return false;
    }

    ids.add(id);
    soucetBajtu += velikost;
  }

  return (
    ids.size === manifest.attachments.length &&
    soucetBajtu ===
      Number(manifest.attachmentBytes || 0)
  );
}


async function ulozPrilohyArchivuV4DoCache(
  BackupExport,
  manifest
) {
  const lokalni =
    window.LubaNoteAttachmentsLocal;

  if (
    !lokalni?.ulozObnovenouPrilohuDoCache
  ) {
    throw vytvorChybuZalohy(
      "Lokální attachment cache V4 není dostupná.",
      "Přílohy ze zálohy se nepodařilo bezpečně připravit."
    );
  }

  for (const polozka of manifest.attachments) {
    const blob = await nactiPolozkuNativeZalohyV4(
      BackupExport,
      polozka.archivePath,
      {
        mimeType: "image/jpeg"
      }
    );

    if (blob.size !== Number(polozka.sizeBytes)) {
      throw vytvorChybuZalohy(
        `Velikost obnovené přílohy ${polozka.id} nesedí.`,
        "Příloha v záloze neprošla kontrolou velikosti. Obnova byla zastavena."
      );
    }

    await lokalni.ulozObnovenouPrilohuDoCache({
      id: polozka.id,
      noteId: polozka.noteId,
      blob,
      mimeType: "image/jpeg",
      fileName: `${polozka.id}.jpg`,
      storagePath: ""
    });
  }
}


async function pripravCloudProObnovuPrilohV4(
  manifest
) {
  if (manifest.attachments.length === 0) {
    return true;
  }

  if (!await pripravCloudProKompletniZalohu()) {
    throw vytvorChybuZalohy(
      "Cloud není dostupný pro obnovu příloh.",
      "Kompletní obnova příloh potřebuje připojení k internetu."
    );
  }

  const polozky = manifest.attachments.map(
    (polozka) => ({
      id: polozka.id,
      noteId: polozka.noteId,
      sizeBytes: Number(polozka.sizeBytes),
      mimeType: "image/jpeg"
    })
  );

  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_prepare_attachment_restore",
      { p_items: polozky }
    );

  if (error) {
    throw error;
  }

  if (data?.ok !== true) {
    const duvod = data?.reason ||
      "restore_prepare_failed";

    throw vytvorChybuZalohy(
      `Server odmítl přípravu příloh: ${duvod}`,
      data?.message ||
      `Přílohy ze zálohy nelze obnovit (${duvod}). Žádné poznámky nebyly obnoveny.`
    );
  }

  return true;
}


async function zaradPrilohyArchivuV4PoObnove(
  manifest
) {
  const lokalni =
    window.LubaNoteAttachmentsLocal;

  for (const polozka of manifest.attachments) {
    await lokalni?.upravPrilohu?.(
      polozka.id,
      {
        noteId: polozka.noteId,
        cloudState: "pending_upload",
        lastCloudError: ""
      }
    );

    await lokalni?.zaradUpload?.({
      attachmentId: polozka.id,
      noteId: polozka.noteId
    });
  }
}


async function vycistiNativeImportBezChyby(BackupExport) {
  try {
    await BackupExport?.vycistiImport?.();
  } catch {
    // Dočasný import se při příštím výběru stejně přepíše.
  }
}


async function importTasksApk() {
  const BackupExport =
    window.Capacitor?.Plugins
      ?.LubaNoteBackupExport;

  if (
    window.Capacitor?.isNativePlatform?.() !== true ||
    !BackupExport?.otevriImport ||
    !BackupExport?.zahajCteniImportu ||
    !BackupExport?.nactiCastImportu ||
    !BackupExport?.dokoncitCteniImportu
  ) {
    const input = document.getElementById("importFile");
    input?.click();
    return;
  }

  let vyber;

  try {
    vyber = await BackupExport.otevriImport();
  } catch (error) {
    console.error("Výběr zálohy selhal:", error);
    zobrazZpravuAplikace(
      "Záloha a obnova",
      error?.message ||
      "Zálohu se nepodařilo otevřít."
    );
    return;
  }

  if (vyber?.canceled === true) {
    return;
  }

  if (vyber?.typ === "json") {
    try {
      const text = await nactiPolozkuNativeZalohyV4(
        BackupExport,
        "legacy.json",
        { jakoText: true }
      );

      await BackupExport.vycistiImport?.();

      importTasks(
        new Blob([text], {
          type: "application/json"
        })
      );
    } catch (error) {
      await vycistiNativeImportBezChyby(BackupExport);
      console.error("Import JSON zálohy selhal:", error);
      zobrazZpravuAplikace(
        "Záloha a obnova",
        error?.message ||
        "Soubor není platná záloha LubaNote."
      );
    }
    return;
  }

  if (vyber?.typ !== "archive-v4") {
    await vycistiNativeImportBezChyby(BackupExport);
    zobrazZpravuAplikace(
      "Záloha a obnova",
      "Vybraný soubor není podporovaná záloha LubaNote."
    );
    return;
  }

  const ukonciKontrolu =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ověřuji kompletní zálohu…",
      0
    ) || (() => {});

  let manifest;
  let imported;

  try {
    const kontrola =
      await BackupExport.overArchivImportu();

    manifest = JSON.parse(
      kontrola?.manifestJson || "{}"
    );

    const backupText =
      await nactiPolozkuNativeZalohyV4(
        BackupExport,
        manifest?.backupJson?.path || "backup.json",
        { jakoText: true }
      );

    imported = JSON.parse(backupText);

    if (
      !jePlatnaKompletniZaloha(imported) ||
      !jePlatnyManifestArchivuV4(
        manifest,
        imported
      )
    ) {
      throw new Error(
        "Archiv V4 nebo backup.json nemá platnou strukturu."
      );
    }
  } catch (error) {
    ukonciKontrolu();
    await vycistiNativeImportBezChyby(BackupExport);

    console.error(
      "Kontrola archivu V4 selhala:",
      error
    );

    zobrazZpravuAplikace(
      "Záloha a obnova",
      error?.message ||
      "Kompletní archiv V4 neprošel bezpečnostní kontrolou."
    );
    return;
  }

  ukonciKontrolu();

  const importedAt = new Date().toISOString();
  const provedObnovu = async () => {
    try {
      await provedKompletniObnovuSeZpracovanimChyby(
        imported,
        importedAt,
        {
          predObnovou: async () => {
            await ulozPrilohyArchivuV4DoCache(
              BackupExport,
              manifest
            );
          },
          predLokalnimUlozenim: async () => {
            await pripravCloudProObnovuPrilohV4(
              manifest
            );
          },
          predReload: async () => {
            await zaradPrilohyArchivuV4PoObnove(
              manifest
            );
          }
        }
      );
    } finally {
      try {
        await BackupExport.vycistiImport?.();
      } catch {
        // Cache se při příštím importu stejně přepíše.
      }
    }
  };

  if (
    typeof window.otevriVyberovyModal ===
    "function"
  ) {
    window.otevriVyberovyModal({
      nadpis:
        `Obnovit kompletní zálohu V4? Archiv obsahuje ${manifest.attachmentCount} příloh. Obnovené verze se uloží také do cloudu.`,
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
          await vycistiNativeImportBezChyby(BackupExport);
          return;
        }

        await provedObnovu();
      }
    });
    return;
  }

  await provedObnovu();
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
