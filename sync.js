function getLocalNotesForSync() {
  return typeof nactiBeznePoznamkyZUloziste === "function"
    ? nactiBeznePoznamkyZUloziste()
    : loadTask().filter((note) => note?.isSecret !== true);
}

function getDeviceId() {
  let deviceId =
    localStorage.getItem("lubanoteDeviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();

    localStorage.setItem(
      "lubanoteDeviceId",
      deviceId
    );
  }

  return deviceId;
}

const PENDING_DELETE_STORAGE_KEY =
  "lubanotePendingDeletes";

function nactiCekajiciSmazani() {
  const raw =
    localStorage.getItem(
      PENDING_DELETE_STORAGE_KEY
    );

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((zaznam) => zaznam?.id)
      : [];
  } catch (error) {
    console.error(
      "Načtení čekajících smazání selhalo:",
      error
    );

    return [];
  }
}

function ulozCekajiciSmazani(zaznamy) {
  localStorage.setItem(
    PENDING_DELETE_STORAGE_KEY,
    JSON.stringify(
      Array.isArray(zaznamy)
        ? zaznamy
        : []
    )
  );
}

function pridejCekajiciSmazani(
  noteId,
  deletedAt = new Date().toISOString()
) {
  if (!noteId) {
    return;
  }

  const zaznamy = nactiCekajiciSmazani();
  const bezStejnehoId =
    zaznamy.filter(
      (zaznam) => zaznam.id !== noteId
    );

  bezStejnehoId.push({
    id: noteId,
    deletedAt,
    deviceId: getDeviceId()
  });

  ulozCekajiciSmazani(bezStejnehoId);
}

function odeberCekajiciSmazani(noteId) {
  if (!noteId) {
    return;
  }

  ulozCekajiciSmazani(
    nactiCekajiciSmazani().filter(
      (zaznam) => zaznam.id !== noteId
    )
  );
}

async function odesliCekajiciSmazaniDoSupabase() {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const cekajici = nactiCekajiciSmazani();

  if (cekajici.length === 0) {
    return true;
  }

  let vseOdeslano = true;

  for (const zaznam of cekajici) {
    const deletedAt =
      zaznam.deletedAt ||
      new Date().toISOString();

    const { error } = await supabaseClient
      .from("notes")
      .upsert({
        id: zaznam.id,
        user_id: user.id,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        deleted_by_device_id:
          zaznam.deviceId || getDeviceId(),
        data: {
          deleted: true
        }
      });

    if (error) {
      vseOdeslano = false;

      console.error(
        "Odeslání čekajícího smazání selhalo:",
        zaznam.id,
        error.message
      );

      continue;
    }

    odeberCekajiciSmazani(zaznam.id);
  }

  return vseOdeslano;
}

async function registerCurrentDevice() {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const deviceId = getDeviceId();
  const now = new Date().toISOString();

  const { error } = await supabaseClient
    .from("devices")
    .upsert(
      {
        user_id: user.id,
        device_id: deviceId,
        last_sync_at: now
      },
      {
        onConflict: "user_id,device_id"
      }
    );

  if (error) {
    console.error(
      "Device register error:",
      error.message
    );

    return false;
  }

  return true;
}

async function haveAllDevicesSyncedAfter(
  timestamp,
  deletingDeviceId
) {
  const user = await getCurrentUser();

  if (!user || !timestamp) {
    return false;
  }

  const targetTime = new Date(timestamp).getTime();

  if (Number.isNaN(targetTime)) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("devices")
    .select("device_id,last_sync_at")
    .eq("user_id", user.id);

  if (error) {
    console.error(
      "Device sync check error:",
      error.message
    );
    return false;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.every((device) => {
    // Zařízení, které smazání vytvořilo,
    // už o smazání samozřejmě ví.
    if (device.device_id === deletingDeviceId) {
      return true;
    }

    const syncTime = new Date(device.last_sync_at).getTime();

    return (
      !Number.isNaN(syncTime) &&
      syncTime > targetTime
    );
  });
}

async function cleanupSafeDeletedNotes() {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const { data: deletedRows, error } =
    await supabaseClient
      .from("notes")
      .select(
        "id,deleted_at,deleted_by_device_id"
      )
      .eq("user_id", user.id)
      .not("deleted_at", "is", null);

  if (error) {
    console.error(
      "Deleted notes cleanup load error:",
      error.message
    );

    return false;
  }

  for (const row of deletedRows || []) {
    const safeToDelete =
      await haveAllDevicesSyncedAfter(
        row.deleted_at,
        row.deleted_by_device_id
      );

    if (!safeToDelete) {
      continue;
    }

    const { error: deleteError } =
      await supabaseClient
        .from("notes")
        .delete()
        .eq("id", row.id)
        .eq("user_id", user.id);

    if (deleteError) {
      console.error(
        "Hard delete error:",
        row.id,
        deleteError.message
      );
    }
  }

  return true;
}






function jeSifrovanyCloudSecretRow(row) {
  return Boolean(
    row?.data?.__lubanoteSecret === true &&
    row?.data?.encrypted?.iv &&
    row?.data?.encrypted?.ciphertext
  );
}

function jeLegacyCloudSecretRow(row) {
  return Boolean(
    !jeSifrovanyCloudSecretRow(row) &&
    row?.data?.isSecret === true
  );
}

function jeCloudSecretRow(row) {
  return jeSifrovanyCloudSecretRow(row) ||
    jeLegacyCloudSecretRow(row);
}

async function uploadLocalNoteToSupabase(note) {
  const user = await getCurrentUser();

  if (!user || !note?.id) {
    return false;
  }

  let dataToStore = note;

  if (note.isSecret === true) {
    if (
      typeof tajnySifrovaciKlic === "undefined" ||
      !tajnySifrovaciKlic ||
      typeof zasifrujTajnouPoznamku !== "function"
    ) {
      console.error(
        "Sync tajné poznámky byl zastaven: tajný režim není odemčený."
      );
      return false;
    }

    const encrypted = await zasifrujTajnouPoznamku(note);

    dataToStore = {
      __lubanoteSecret: true,
      version: 1,
      encrypted
    };
  }

  const { error } = await supabaseClient
    .from("notes")
    .upsert({
      id: note.id,
      user_id: user.id,
      data: dataToStore,
      updated_at:
        note.updatedAt || new Date().toISOString(),
      deleted_at: null
    });

  if (error) {
    console.error("Sync upload error:", error.message);
    return false;
  }

  return true;
}

async function uploadEncryptedSecretRecordToSupabase(record) {
  const user = await getCurrentUser();

  if (!user || !record?.id || !record?.encrypted) {
    return false;
  }

  const { error } = await supabaseClient
    .from("notes")
    .upsert({
      id: record.id,
      user_id: user.id,
      data: {
        __lubanoteSecret: true,
        version: 1,
        encrypted: record.encrypted
      },
      updated_at:
        record.updatedAt || new Date().toISOString(),
      deleted_at: null
    });

  if (error) {
    console.error(
      "Encrypted secret sync upload error:",
      error.message
    );
    return false;
  }

  return true;
}

async function markNoteDeletedInSupabase(note) {
  if (!note?.id) {
    return false;
  }

  const deletedAt = new Date().toISOString();

  /*
   * Smazání nejdřív zapíšeme do lokální fronty.
   * Díky tomu se poznámka po offline smazání
   * při dalším syncu nemůže z cloudu vrátit.
   */
  pridejCekajiciSmazani(
    note.id,
    deletedAt
  );

  const user = await getCurrentUser();

  if (!user || !navigator.onLine) {
    return false;
  }

  const { error } = await supabaseClient
    .from("notes")
    .upsert({
      id: note.id,
      user_id: user.id,
      deleted_at: deletedAt,
      updated_at: deletedAt,
      deleted_by_device_id: getDeviceId(),
      data: {
        deleted: true
      }
    });

  if (error) {
    console.error(
      "Sync delete error:",
      error.message
    );

    return false;
  }

  odeberCekajiciSmazani(note.id);

  return true;
}





async function getCloudNotesForSync() {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("notes")
    .select("*");

  if (error) {
    console.error("Sync download error:", error.message);
    return [];
  }

  return data || [];
}

function vytvorCloudRegularNote(row) {
  if (
    !row?.data ||
    row.deleted_at ||
    jeCloudSecretRow(row)
  ) {
    return null;
  }

  return {
    ...row.data,
    id: row.id,
    updatedAt: row.updated_at,
    isSecret: false
  };
}

function vytvorCloudEncryptedRecord(row) {
  if (!jeSifrovanyCloudSecretRow(row) || row.deleted_at) {
    return null;
  }

  return {
    id: row.id,
    updatedAt: row.updated_at,
    encrypted: row.data.encrypted
  };
}

function casKandidata(candidate) {
  return new Date(candidate?.updatedAt || 0).getTime();
}

function bezpecnostniPoradiKandidata(candidate) {
  const poradi = {
    "cloud-secret-encrypted": 60,
    "local-secret-encrypted": 55,
    "local-secret-decrypted": 50,
    "cloud-secret-legacy": 45,
    "local-secret-legacy": 40,
    "cloud-regular": 20,
    "local-regular": 10
  };

  return poradi[candidate?.source] || 0;
}

function vyberLepsiKandidat(current, candidate) {
  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  const currentTime = casKandidata(current);
  const candidateTime = casKandidata(candidate);

  if (candidateTime > currentTime) {
    return candidate;
  }

  if (candidateTime < currentTime) {
    return current;
  }

  /*
   * Při shodném čase dáváme bezpečnostně přednost tajné variantě.
   * Tím se na jiném zařízení nemůže objevit stará běžná kopie jen
   * kvůli nerozhodnému timestampu.
   */
  if (current.type !== candidate.type) {
    return candidate.type === "secret"
      ? candidate
      : current;
  }

  return bezpecnostniPoradiKandidata(candidate) >
    bezpecnostniPoradiKandidata(current)
      ? candidate
      : current;
}

function pridejKandidataDoMapy(candidateMap, id, candidate) {
  if (!id || !candidate) {
    return;
  }

  candidateMap.set(
    id,
    vyberLepsiKandidat(
      candidateMap.get(id),
      candidate
    )
  );
}

function vytvorMapuVitezu(
  localRegular,
  localEncrypted,
  localLegacySecret,
  localDecryptedSecret,
  cloudRows
) {
  const winners = new Map();
  const deletedIds = new Set([
    ...cloudRows
      .filter((row) => row?.deleted_at)
      .map((row) => row.id),
    ...nactiCekajiciSmazani()
      .map((zaznam) => zaznam.id)
  ]);

  localRegular.forEach((note) => {
    if (!note?.id || deletedIds.has(note.id)) {
      return;
    }

    pridejKandidataDoMapy(winners, note.id, {
      type: "regular",
      source: "local-regular",
      updatedAt: note.updatedAt,
      note
    });
  });

  localEncrypted.forEach((record) => {
    if (!record?.id || deletedIds.has(record.id)) {
      return;
    }

    pridejKandidataDoMapy(winners, record.id, {
      type: "secret",
      source: "local-secret-encrypted",
      updatedAt: record.updatedAt,
      record
    });
  });

  localLegacySecret.forEach((note) => {
    if (!note?.id || deletedIds.has(note.id)) {
      return;
    }

    pridejKandidataDoMapy(winners, note.id, {
      type: "secret",
      source: "local-secret-legacy",
      updatedAt: note.updatedAt,
      note: {
        ...note,
        isSecret: true
      }
    });
  });

  localDecryptedSecret.forEach((note) => {
    if (!note?.id || deletedIds.has(note.id)) {
      return;
    }

    pridejKandidataDoMapy(winners, note.id, {
      type: "secret",
      source: "local-secret-decrypted",
      updatedAt: note.updatedAt,
      note: {
        ...note,
        isSecret: true
      }
    });
  });

  cloudRows.forEach((row) => {
    if (!row?.id || row.deleted_at) {
      return;
    }

    if (jeSifrovanyCloudSecretRow(row)) {
      pridejKandidataDoMapy(winners, row.id, {
        type: "secret",
        source: "cloud-secret-encrypted",
        updatedAt: row.updated_at,
        record: vytvorCloudEncryptedRecord(row)
      });
      return;
    }

    if (jeLegacyCloudSecretRow(row)) {
      pridejKandidataDoMapy(winners, row.id, {
        type: "secret",
        source: "cloud-secret-legacy",
        updatedAt: row.updated_at,
        note: {
          ...row.data,
          id: row.id,
          updatedAt: row.updated_at,
          isSecret: true
        }
      });
      return;
    }

    const note = vytvorCloudRegularNote(row);

    if (note) {
      pridejKandidataDoMapy(winners, row.id, {
        type: "regular",
        source: "cloud-regular",
        updatedAt: row.updated_at,
        note
      });
    }
  });

  return {
    winners,
    deletedIds
  };
}

function najdiNejlepsiEncryptedFallback(id, localEncrypted, cloudRows) {
  let best = null;

  const local = localEncrypted.find((record) => record?.id === id);
  if (local) {
    best = {
      id: local.id,
      updatedAt: local.updatedAt,
      encrypted: local.encrypted
    };
  }

  const cloud = cloudRows.find(
    (row) => row?.id === id && jeSifrovanyCloudSecretRow(row)
  );

  if (cloud) {
    const cloudRecord = vytvorCloudEncryptedRecord(cloud);

    if (
      !best ||
      new Date(cloudRecord.updatedAt || 0).getTime() >
        new Date(best.updatedAt || 0).getTime()
    ) {
      best = cloudRecord;
    }
  }

  return best;
}

async function desifrujViteznySecret(candidate) {
  if (!candidate || candidate.type !== "secret") {
    return null;
  }

  if (candidate.note) {
    return {
      ...candidate.note,
      isSecret: true
    };
  }

  if (!candidate.record) {
    return null;
  }

  const note = await desifrujTajnouPoznamku(
    candidate.record.encrypted,
    candidate.record.id
  );

  return {
    ...note,
    id: candidate.record.id,
    updatedAt:
      candidate.record.updatedAt || note.updatedAt,
    isSecret: true
  };
}

let probihajiciSync = null;

async function syncNotes() {
  if (probihajiciSync) {
    return probihajiciSync;
  }

  probihajiciSync = (async () => {
    const user = await getCurrentUser();

    if (!user) {
      return;
    }

    if (typeof cekajNaUlozeniTajnychPoznamek === "function") {
      await cekajNaUlozeniTajnychPoznamek();
    }

    /*
     * Nejdřív odešleme případná smazání z offline fronty.
     * Teprve potom načítáme cloudový snapshot.
     */
    await odesliCekajiciSmazaniDoSupabase();

    let localRegular = getLocalNotesForSync();

    /* Přeneseme pouze běžné starší Planner položky do poznámek. */
    if (
      typeof migrateLocalPlannedItemsIntoNotes === "function" &&
      migrateLocalPlannedItemsIntoNotes(localRegular)
    ) {
      ulozBeznePoznamkyPrimo(localRegular);
    }

    localRegular = getLocalNotesForSync();

    const localEncrypted =
      typeof nactiSifrovaneTajneZaznamy === "function"
        ? nactiSifrovaneTajneZaznamy()
        : [];

    const localLegacySecret =
      typeof nactiStarePlaintextTajnePoznamky === "function"
        ? nactiStarePlaintextTajnePoznamky()
        : [];

    const localDecryptedSecret =
      typeof getDesifrovaneTajnePoznamky === "function"
        ? getDesifrovaneTajnePoznamky()
        : [];

    const cloudRows = await getCloudNotesForSync();
    const cloudMap = new Map(
      cloudRows.map((row) => [row.id, row])
    );

    const { winners } = vytvorMapuVitezu(
      localRegular,
      localEncrypted,
      localLegacySecret,
      localDecryptedSecret,
      cloudRows
    );

    const mergedRegular = [];
    const encryptedToKeep = [];
    const secretCandidates = [];

    for (const [id, winner] of winners.entries()) {
      const cloudRow = cloudMap.get(id);
      const cloudTime = cloudRow
        ? new Date(cloudRow.updated_at || 0).getTime()
        : 0;
      const winnerTime = casKandidata(winner);

      if (winner.type === "regular") {
        mergedRegular.push({
          ...winner.note,
          id,
          updatedAt: winner.updatedAt,
          isSecret: false
        });

        if (
          winner.source === "local-regular" &&
          (!cloudRow || winnerTime > cloudTime || jeCloudSecretRow(cloudRow))
        ) {
          await uploadLocalNoteToSupabase(winner.note);
        }

        continue;
      }

      secretCandidates.push(winner);

      if (winner.record) {
        encryptedToKeep.push(winner.record);
      } else {
        /*
         * Při zamknutí můžeme ponechat starší ciphertext jako zálohu,
         * dokud novější legacy plaintext po odemknutí nepřevedeme.
         */
        const fallback = najdiNejlepsiEncryptedFallback(
          id,
          localEncrypted,
          cloudRows
        );

        if (fallback) {
          encryptedToKeep.push(fallback);
        }
      }

      if (
        winner.source === "local-secret-encrypted" &&
        (!cloudRow || winnerTime > cloudTime || !jeCloudSecretRow(cloudRow))
      ) {
        await uploadEncryptedSecretRecordToSupabase(winner.record);
      }
    }

    /*
     * Toto odstraní stale běžnou kopii, pokud na jiném zařízení vyhrála
     * novější tajná verze. Legacy tajný plaintext se zatím zachová.
     */
    ulozBeznePoznamkyPrimo(mergedRegular);
    ulozSifrovaneTajneZaznamy(encryptedToKeep);

    const secretUnlocked =
      typeof tajnySifrovaciKlic !== "undefined" &&
      Boolean(tajnySifrovaciKlic) &&
      typeof tajnyRezimOdemceny !== "undefined" &&
      tajnyRezimOdemceny === true;

    if (secretUnlocked) {
      const decryptedSecretNotes = [];
      const failedEncryptedRecords = [];

      for (const candidate of secretCandidates) {
        try {
          const note = await desifrujViteznySecret(candidate);

          if (note) {
            decryptedSecretNotes.push(note);
          }
        } catch (error) {
          if (candidate?.record) {
            failedEncryptedRecords.push(candidate.record);
          }

          console.error(
            `Tajnou poznámku se nepodařilo dešifrovat (${candidate?.record?.id || candidate?.note?.id || "unknown"}):`,
            error
          );
        }
      }

      nastavDesifrovaneTajnePoznamky(decryptedSecretNotes);

      /*
       * Všechny úspěšně dešifrované tajné poznámky sjednotíme do
       * lokálního ciphertextu. Poškozený/nečitelný ciphertext ale
       * NESMÍME smazat – ponecháme ho pro pozdější obnovu/diagnostiku.
       */
      await ulozTajnePoznamkySifrovaneHned(decryptedSecretNotes);

      if (failedEncryptedRecords.length > 0) {
        const currentEncrypted = nactiSifrovaneTajneZaznamy();
        const mergedEncrypted = new Map(
          currentEncrypted.map((record) => [record.id, record])
        );

        failedEncryptedRecords.forEach((record) => {
          if (record?.id && !mergedEncrypted.has(record.id)) {
            mergedEncrypted.set(record.id, record);
          }
        });

        ulozSifrovaneTajneZaznamy(
          Array.from(mergedEncrypted.values())
        );
      }

      for (const note of decryptedSecretNotes) {
        const cloudRow = cloudMap.get(note.id);
        const noteTime = new Date(note.updatedAt || 0).getTime();
        const cloudTime = cloudRow
          ? new Date(cloudRow.updated_at || 0).getTime()
          : 0;

        if (
          !cloudRow ||
          !jeSifrovanyCloudSecretRow(cloudRow) ||
          noteTime > cloudTime
        ) {
          await uploadLocalNoteToSupabase(note);
        }
      }
    }

    if (
      typeof uklidOsirelychPlanovanychPolozek === "function"
    ) {
      await uklidOsirelychPlanovanychPolozek();
    }

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    if (typeof renderRemindersScreen === "function") {
      renderRemindersScreen();
    }

    if (typeof renderCalendar === "function") {
      renderCalendar();
    }
  })();

  try {
    await probihajiciSync;
  } finally {
    probihajiciSync = null;
  }
}

async function startSync() {
  await syncNotes();

  if (
    typeof window.LubaNoteRecurring
      ?.migrujStareOpakovaniPlanneru ===
    "function"
  ) {
    await window.LubaNoteRecurring
      .migrujStareOpakovaniPlanneru();
  }

  await loadTagsFromSupabase();
  await registerCurrentDevice();
  await cleanupSafeDeletedNotes();

  if (
    typeof obnovNotifikaceOpakovanychPoznamek ===
    "function"
  ) {
    await obnovNotifikaceOpakovanychPoznamek();
  }
}

let probihajiciStartSync = null;

/*
 * ZÁMEK PRO LOKÁLNÍ ZMĚNY
 *
 * Hromadná změna nesmí proběhnout uprostřed syncu,
 * protože sync pracuje se snapshotem poznámek.
 * Lokální změny proto řadíme do krátké fronty.
 */
let probihajiciLokalniZmena = null;
let lokalniZmenaRezervovana = false;
let synchronizaceOdlozenaKvuliLokalniZmene = false;
let frontaLokalnichZmen = Promise.resolve();

async function pockejNaProbihajiciSynchronizaci() {
  if (probihajiciStartSync) {
    try {
      await probihajiciStartSync;
    } catch (error) {
      console.warn(
        "Čekání na startovací synchronizaci skončilo chybou:",
        error
      );
    }

    return;
  }

  if (probihajiciSync) {
    try {
      await probihajiciSync;
    } catch (error) {
      console.warn(
        "Čekání na synchronizaci skončilo chybou:",
        error
      );
    }
  }
}

async function provedLokalniZmenuBezKolizeSeSync(akce) {
  if (typeof akce !== "function") {
    return null;
  }

  let uvolniFrontu;

  const mojeMistoVeFronte =
    new Promise((resolve) => {
      uvolniFrontu = resolve;
    });

  const predchoziFronta =
    frontaLokalnichZmen;

  frontaLokalnichZmen =
    predchoziFronta.then(
      () => mojeMistoVeFronte
    );

  await predchoziFronta;

  /*
   * Rezervaci nastavíme ještě PŘED čekáním na běžící sync.
   * Nový sync tak nemůže v malé mezeře mezi čekáním a uložením
   * začít pracovat se starým snapshotem.
   */
  lokalniZmenaRezervovana = true;

  try {
    await pockejNaProbihajiciSynchronizaci();

    probihajiciLokalniZmena =
      Promise.resolve().then(akce);

    return await probihajiciLokalniZmena;
  } finally {
    probihajiciLokalniZmena = null;
    lokalniZmenaRezervovana = false;

    uvolniFrontu?.();

    if (synchronizaceOdlozenaKvuliLokalniZmene) {
      synchronizaceOdlozenaKvuliLokalniZmene = false;

      setTimeout(
        spustStartSyncBezpecne,
        0
      );
    }
  }
}

/*
 * Pro hromadné změny používáme centrální sync místo přímého
 * uploadu jednotlivých poznámek. Lokální změna je hotová hned,
 * následný sync se spustí z bezpečného aktuálního snapshotu.
 */
async function provedLokalniZmenuASynchronizuj(akce) {
  const vysledek =
    await provedLokalniZmenuBezKolizeSeSync(
      akce
    );

  const vyberKaretAktivni =
    typeof rezimVyberuKaret !== "undefined" &&
    rezimVyberuKaret === true;

  if (
    navigator.onLine &&
    !vyberKaretAktivni
  ) {
    /*
     * Nečekáme na síť kvůli odezvě UI.
     * Další lokální hromadná změna si případně na tento sync
     * bezpečně počká přes stejný zámek.
     */
    spustStartSyncBezpecne().catch(
      (error) => {
        console.warn(
          "Následná synchronizace lokální změny selhala:",
          error
        );
      }
    );
  }

  return vysledek;
}

async function spustStartSyncBezpecne() {
  if (
    probihajiciLokalniZmena ||
    lokalniZmenaRezervovana ||
    (
      typeof rezimVyberuKaret !== "undefined" &&
      rezimVyberuKaret === true
    )
  ) {
    synchronizaceOdlozenaKvuliLokalniZmene = true;
    return false;
  }

  if (!navigator.onLine) {
    return false;
  }

  synchronizaceOdlozenaKvuliLokalniZmene = false;

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
  }

  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient
  ) {
    return false;
  }

  if (probihajiciStartSync) {
    return probihajiciStartSync;
  }

  probihajiciStartSync =
    (async () => {
      try {
        await startSync();
        return true;
      } catch (error) {
        console.warn(
          "Synchronizace byla odložena:",
          error
        );
        return false;
      }
    })();

  try {
    return await probihajiciStartSync;
  } finally {
    probihajiciStartSync = null;
  }
}

window.LubaNoteSync = {
  spustBezpecne: spustStartSyncBezpecne,
  provedLokalniZmenuBezKolizeSeSync,
  provedLokalniZmenuASynchronizuj
};

/*
 * Offline start nikdy nečeká na síť.
 * Po návratu internetu se synchronizace spustí sama.
 */
spustStartSyncBezpecne();

window.addEventListener(
  "online",
  () => {
    setTimeout(
      spustStartSyncBezpecne,
      400
    );
  }
);
