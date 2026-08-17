const REGULAR_TASK_STORAGE_KEY = "savedTask";
const SECRET_TASK_STORAGE_KEY = "savedSecretTask";
const LUBANOTE_BACKUP_FORMAT = "LubaNote-backup-v2";

/*
 * Tajné poznámky jsou po odemknutí dostupné pouze v paměti.
 * Do localStorage se ukládá jen jejich AES-GCM obálka.
 */
let desifrovaneTajnePoznamky = [];
let frontaUkladaniTajnychPoznamek = Promise.resolve();

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
  return nactiPoleZLocalStorage(REGULAR_TASK_STORAGE_KEY)
    .filter((task) => task && task.isSecret !== true);
}

/*
 * Přechodová podpora: starší vývojová verze mohla mít tajnou
 * poznámku ještě v savedTask jako plaintext. Dokud není trezor
 * odemčený, takovou poznámku loadTask() vůbec nevrací.
 * Po prvním odemknutí se automaticky zašifruje a plaintext odstraní.
 */
function nactiStarePlaintextTajnePoznamky() {
  return nactiPoleZLocalStorage(REGULAR_TASK_STORAGE_KEY)
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

function saveAllTasks(tasks) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
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

function deleteTask(index) {
  const tasks = loadTask();
  tasks.splice(index, 1);
  return saveAllTasks(tasks);
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

async function exportTasks() {
  await cekajNaUlozeniTajnychPoznamek();

  const backup = {
    format: LUBANOTE_BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    notes: nactiBeznePoznamkyZUloziste(),
    secretNotes: nactiSifrovaneTajneZaznamy()
  };

  const data = JSON.stringify(backup, null, 2);
  const blob = new Blob([data], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "lubanote-backup.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function normalizujImportovanouPoznamku(task, importedAt) {
  return {
    ...task,
    id: task.id || crypto.randomUUID(),
    updatedAt: task.updatedAt || importedAt,
    todos: Array.isArray(task.todos) ? task.todos : [],
    tags: Array.isArray(task.tags) ? task.tags : []
  };
}

function importTasks(file) {
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      const importedAt = new Date().toISOString();

      if (
        imported?.format === LUBANOTE_BACKUP_FORMAT &&
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
        "Soubor není platná záloha LubaNote."
      );
    }
  };

  reader.readAsText(file);
}
