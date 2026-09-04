function getLocalNotesForSync() {
  return typeof nactiBeznePoznamkyZUloziste === "function"
    ? nactiBeznePoznamkyZUloziste()
    : loadTask().filter((note) => note?.isSecret !== true);
}

/*
 * Lokální UI má vždy přednost před sítí.
 * Storage zvyšuje revizi při každém uživatelském saveAllTasks().
 * Pokud se revize během syncu změní, starý cloudový snapshot
 * se nesmí zapsat zpět přes novější lokální změnu.
 */
function ziskejReviziLokalnichZmenProSync() {
  return Number(
    window.LubaNoteStorageState
      ?.ziskejReviziLokalnichZmenPoznamek
      ?.() || 0
  );
}

function lokalniStavSeBehemSyncuZmenil(
  revizePriStartu
) {
  return (
    ziskejReviziLokalnichZmenProSync() !==
    revizePriStartu
  );
}

function odlozOpakovaniSynchronizace() {
  synchronizaceOdlozenaKvuliLokalniZmene = true;
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

/*
 * SERVEROVÁ REVIZE POZNÁMEK
 *
 * Lokálně si pamatujeme poslední serverovou revizi, kterou tato
 * konkrétní instalace skutečně přijala nebo úspěšně zapsala.
 * Tento údaj se záměrně NEUKLÁDÁ dovnitř samotné poznámky.
 * Starý klient ho tedy nemůže omylem přenášet jako obsah poznámky.
 */
const CLOUD_SYNC_META_STORAGE_KEY =
  "lubanoteCloudSyncMetaV1";

const aktivniKonfliktySyncu = new Map();
let konfliktSyncuUzOhlasen = false;

/*
 * Stejný nevyřešený konflikt nesmí po každém refreshi znovu
 * zobrazovat modal. Otisk konfliktu si pamatujeme v localStorage.
 * Pokud se konflikt skutečně změní (nová revize / čas), otisk se
 * změní a uživatel bude upozorněn znovu. Po vyřešení se záznam maže.
 */
const OHLASENE_KONFLIKTY_STORAGE_KEY =
  "lubanoteOhlaseneKonfliktySyncuV1";

function nactiOhlaseneKonfliktySyncu() {
  try {
    const raw = localStorage.getItem(
      OHLASENE_KONFLIKTY_STORAGE_KEY
    );

    const parsed = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function ulozOhlaseneKonfliktySyncu(mapa) {
  try {
    localStorage.setItem(
      OHLASENE_KONFLIKTY_STORAGE_KEY,
      JSON.stringify(mapa || {})
    );
  } catch {
    // Evidování modalu nikdy nesmí blokovat samotnou synchronizaci.
  }
}

function vytvorOtiskKonfliktu(noteId, duvod, detail = {}) {
  return JSON.stringify({
    id: noteId || "",
    duvod: duvod || "",
    expectedRevision: detail?.expectedRevision ?? null,
    cloudRevision: detail?.cloudRevision ?? null,
    localUpdatedAt: detail?.localUpdatedAt ?? null,
    cloudUpdatedAt: detail?.cloudUpdatedAt ?? null
  });
}

function bylKonfliktUzOhlasen(noteId, duvod, detail = {}) {
  if (!noteId) {
    return false;
  }

  const mapa = nactiOhlaseneKonfliktySyncu();

  return mapa[noteId] ===
    vytvorOtiskKonfliktu(noteId, duvod, detail);
}

function oznacKonfliktJakoOhlaseny(noteId, duvod, detail = {}) {
  if (!noteId) {
    return;
  }

  const mapa = nactiOhlaseneKonfliktySyncu();
  mapa[noteId] = vytvorOtiskKonfliktu(
    noteId,
    duvod,
    detail
  );
  ulozOhlaseneKonfliktySyncu(mapa);
}

function zrusOhlaseniKonfliktu(noteId) {
  if (!noteId) {
    return;
  }

  const mapa = nactiOhlaseneKonfliktySyncu();

  if (!(noteId in mapa)) {
    return;
  }

  delete mapa[noteId];
  ulozOhlaseneKonfliktySyncu(mapa);
}

function oznamChybejiciOnlineSession() {
  if (!navigator.onLine) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("lubanote:auth-required")
  );
}

function nastavStavSynchronizaceUI(stav) {
  window.dispatchEvent(
    new CustomEvent("lubanote:sync-state", {
      detail: { stav }
    })
  );
}

function nastavKoncovyStavSynchronizaceUI() {
  nastavStavSynchronizaceUI(
    aktivniKonfliktySyncu.size > 0
      ? "conflict"
      : "synced"
  );
}

const frontyServerovychZapisu = new Map();
let casovacVyreseniBeznehoReviznihoKonfliktu = null;

function naplanujVyreseniBeznehoReviznihoKonfliktu() {
  clearTimeout(
    casovacVyreseniBeznehoReviznihoKonfliktu
  );

  const beziciSyncPriPlanovani = probihajiciSync;
  const beziciStartPriPlanovani = probihajiciStartSync;

  casovacVyreseniBeznehoReviznihoKonfliktu =
    setTimeout(async () => {
      casovacVyreseniBeznehoReviznihoKonfliktu = null;

      try {
        /*
         * Pokud konflikt vznikl uvnitř právě běžícího syncu,
         * nejdřív ho necháme bezpečně doběhnout. Teprve potom
         * načteme čerstvý lokální i cloudový stav a provedeme merge.
         */
        if (beziciSyncPriPlanovani) {
          await beziciSyncPriPlanovani.catch(() => null);
        }

        if (beziciStartPriPlanovani) {
          await beziciStartPriPlanovani.catch(() => null);
        }

        await spustRychlySyncPoznamekBezpecne();
      } catch (error) {
        console.warn(
          "Automatické vyřešení běžného revizního konfliktu bylo odloženo:",
          error
        );
      }
    }, 120);
}

function zaradServerovyZapis(noteId, akce) {
  if (!noteId || typeof akce !== "function") {
    return Promise.resolve({ ok: false });
  }

  const predchozi =
    frontyServerovychZapisu.get(noteId) ||
    Promise.resolve();

  const aktualni = predchozi
    .catch(() => null)
    .then(akce);

  frontyServerovychZapisu.set(
    noteId,
    aktualni
  );

  const uklidFronty = () => {
    if (
      frontyServerovychZapisu.get(noteId) ===
      aktualni
    ) {
      frontyServerovychZapisu.delete(noteId);
    }
  };

  aktualni.then(
    uklidFronty,
    uklidFronty
  );

  return aktualni;
}

function nactiCloudSyncMetaMapu() {
  const raw = localStorage.getItem(
    CLOUD_SYNC_META_STORAGE_KEY
  );

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch (error) {
    console.error(
      "Načtení sync revizí selhalo:",
      error
    );
    return {};
  }
}

function ulozCloudSyncMetaMapu(mapa) {
  localStorage.setItem(
    CLOUD_SYNC_META_STORAGE_KEY,
    JSON.stringify(
      mapa && typeof mapa === "object"
        ? mapa
        : {}
    )
  );
}

function ziskejCloudSyncMeta(noteId) {
  if (!noteId) {
    return null;
  }

  const meta =
    nactiCloudSyncMetaMapu()[noteId];

  if (!meta || typeof meta !== "object") {
    return null;
  }

  const revision = Number(meta.revision);

  if (!Number.isFinite(revision)) {
    return null;
  }

  return {
    revision,
    localUpdatedAt:
      meta.localUpdatedAt ?? null,
    serverUpdatedAt:
      meta.serverUpdatedAt ?? null
  };
}

function ulozCloudSyncMeta(
  noteId,
  {
    revision,
    localUpdatedAt = null,
    serverUpdatedAt = null
  } = {}
) {
  if (!noteId) {
    return;
  }

  const bezpecnaRevize = Number(revision);

  if (!Number.isFinite(bezpecnaRevize)) {
    return;
  }

  const mapa = nactiCloudSyncMetaMapu();

  mapa[noteId] = {
    revision: bezpecnaRevize,
    localUpdatedAt,
    serverUpdatedAt
  };

  ulozCloudSyncMetaMapu(mapa);
}

function oznamKonfliktSynchronizace(
  noteId,
  duvod,
  detail = {}
) {
  if (noteId) {
    aktivniKonfliktySyncu.set(noteId, {
      id: noteId,
      duvod,
      detail,
      cas: new Date().toISOString()
    });
  }

  console.warn(
    "LubaNote sync konflikt – nic nebylo přepsáno:",
    noteId,
    duvod,
    detail
  );

  nastavStavSynchronizaceUI("conflict");

  /*
   * Stejný konflikt může při každém startu znovu vzniknout z téhož
   * lokálního a cloudového snapshotu. Evidujeme ho dál, ale modal
   * zobrazíme pouze při prvním výskytu konkrétní verze konfliktu.
   */
  if (bylKonfliktUzOhlasen(noteId, duvod, detail)) {
    return;
  }

  oznacKonfliktJakoOhlaseny(noteId, duvod, detail);

  if (konfliktSyncuUzOhlasen) {
    return;
  }

  konfliktSyncuUzOhlasen = true;

  if (typeof zobrazZpravuAplikace === "function") {
    zobrazZpravuAplikace(
      "Konflikt synchronizace",
      "LubaNote našla dvě změněné verze stejné poznámky. Nic nepřepsala a obě verze zůstávají v bezpečí. Stejný konflikt už po každém obnovení stránky znovu hlásit nebude."
    );
  }
}

function zrusKonfliktSynchronizace(noteId) {
  if (!noteId) {
    return;
  }

  aktivniKonfliktySyncu.delete(noteId);
  zrusOhlaseniKonfliktu(noteId);
}

function jeChybaOdeprenehoPristupu(error) {
  const text = String(
    error?.message || error?.details || error?.hint || ""
  ).toLowerCase();

  return (
    String(error?.code || "") === "42501" ||
    text.includes("account_not_active_or_plan_expired") ||
    text.includes("row-level security")
  );
}

function oznamOdeprenyPristupUctu(error = null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "lubanote:account-access-denied",
      {
        detail: {
          code: error?.code || null,
          message: error?.message || null
        }
      }
    )
  );
}

function oznamLimitPoznamek(vysledek = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "lubanote:note-limit-reached",
      {
        detail: {
          source: "server",
          noteLimit: vysledek?.note_limit ?? null,
          currentCount: vysledek?.current_count ?? null
        }
      }
    )
  );
}

async function provedBezpecnyZapisPoznamky({
  id,
  data,
  expectedRevision,
  localUpdatedAt = null,
  deleteNote = false,
  deletedByDeviceId = null,
  oznamitKonflikt = true
}) {
  if (!id) {
    return { ok: false };
  }

  const { data: vysledek, error } =
    await supabaseClient.rpc(
      "save_note_safe",
      {
        p_id: id,
        p_data: data,
        p_expected_revision:
          Number(expectedRevision),
        p_delete: Boolean(deleteNote),
        p_deleted_by_device_id:
          deletedByDeviceId
      }
    );

  if (error) {
    console.error(
      "Bezpečný sync zápis selhal:",
      id,
      error.message
    );

    if (jeChybaOdeprenehoPristupu(error)) {
      oznamOdeprenyPristupUctu(error);

      return {
        ok: false,
        accessDenied: true,
        error
      };
    }

    return {
      ok: false,
      error
    };
  }

  if (
    !vysledek?.ok &&
    vysledek?.limit === true &&
    vysledek?.reason === "note_limit_reached"
  ) {
    oznamLimitPoznamek(vysledek);

    return {
      ok: false,
      limit: true,
      result: vysledek
    };
  }

  if (!vysledek?.ok) {
    if (oznamitKonflikt) {
      oznamKonfliktSynchronizace(
        id,
        vysledek?.reason || "revision_conflict",
        vysledek || {}
      );
    } else {
      /*
       * Běžný zápis z UI může narazit na novější serverovou revizi.
       * To ještě není důvod zobrazovat kritický modal: plný revizní
       * merge umí obě běžné verze bezpečně zachovat.
       */
      console.warn(
        "LubaNote sync: běžný zápis narazil na novější revizi; konflikt převezme revizní merge:",
        id,
        vysledek?.reason || "revision_conflict",
        vysledek || {}
      );
    }

    return {
      ok: false,
      conflict: true,
      result: vysledek
    };
  }

  ulozCloudSyncMeta(id, {
    revision: vysledek.revision,
    localUpdatedAt,
    serverUpdatedAt:
      vysledek.updated_at || null
  });

  zrusKonfliktSynchronizace(id);

  /*
   * Realtime zde neposílá obsah poznámky. Pouze oznámíme, že
   * server právě bezpečně potvrdil novou revizi. Samostatný modul
   * syncRealtime.js z tohoto lokálního signálu vytvoří malý
   * Broadcast pro ostatní právě připojená zařízení.
   */
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(
      new CustomEvent(
        "lubanote:cloud-write-confirmed",
        {
          detail: {
            noteId: id,
            revision: vysledek.revision
          }
        }
      )
    );
  }

  return {
    ok: true,
    result: vysledek
  };
}

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
  deletedAt = new Date().toISOString(),
  expectedRevision = null
) {
  if (!noteId) {
    return;
  }

  const meta = ziskejCloudSyncMeta(noteId);

  const bezpecnaExpectedRevision =
    Number.isFinite(Number(expectedRevision))
      ? Number(expectedRevision)
      : Number.isFinite(Number(meta?.revision))
        ? Number(meta.revision)
        : 0;

  const zaznamy = nactiCekajiciSmazani();
  const bezStejnehoId =
    zaznamy.filter(
      (zaznam) => zaznam.id !== noteId
    );

  bezStejnehoId.push({
    id: noteId,
    deletedAt,
    deviceId: getDeviceId(),
    expectedRevision:
      bezpecnaExpectedRevision
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

    const expectedRevision =
      Number.isFinite(
        Number(zaznam.expectedRevision)
      )
        ? Number(zaznam.expectedRevision)
        : 0;

    const vysledek =
      await provedBezpecnyZapisPoznamky({
        id: zaznam.id,
        data: {
          deleted: true
        },
        expectedRevision,
        localUpdatedAt: deletedAt,
        deleteNote: true,
        deletedByDeviceId:
          zaznam.deviceId || getDeviceId(),
        /*
         * Čekající smazání řešíme zvlášť.
         * Stará revize smazání nesmí vyvolat obecný konfliktový modal.
         */
        oznamitKonflikt: false
      });

    if (!vysledek.ok) {
      const duvod =
        vysledek?.result?.reason || null;

      /*
       * Poznámka byla po našem posledním známém stavu změněná
       * na jiném zařízení. Staré čekající smazání proto rušíme.
       *
       * Bezpečnější je zachovat novější cloudovou verzi než ji
       * automaticky smazat. Hlavní merge ji v témže syncu stáhne
       * zpět do tohoto zařízení. Pokud ji uživatel stále chce
       * smazat, udělá to znovu nad aktuální revizí.
       */
      if (duvod === "revision_mismatch") {
        console.warn(
          "LubaNote sync: čekající smazání bylo zrušeno, protože poznámka byla mezitím změněna na jiném zařízení:",
          zaznam.id,
          vysledek.result
        );

        odeberCekajiciSmazani(zaznam.id);
        zrusKonfliktSynchronizace(zaznam.id);
        continue;
      }

      vseOdeslano = false;
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
  /*
   * Tombstones zatím záměrně fyzicky nemažeme.
   * Historie a serverová revize mají přednost před úsporou několika
   * řádků v databázi. Staré klienty navíc přímý DELETE už nesmí pustit.
   */
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

  /*
   * FÁZE B ATTACHMENTS – cloudová stínová vrstva.
   * Nové běžné JPEG přílohy se zkusí rezervovat a nahrát do
   * privátního Storage ještě PŘED zápisem revize poznámky.
   *
   * Data URL ale zatím zůstává součástí poznámky, takže chyba
   * Storage NESMÍ zastavit původní bezpečný revision sync.
   * Tvrdou závislost zapneme až po ověření Storage, downloadu,
   * backupu a migrace ve Fázi B2.
   */
  if (
    note.isSecret !== true &&
    window.LubaNoteAttachmentsCloud
      ?.zajistiStinovePrilohyPoznamkyVCloudu
  ) {
    try {
      const stavPriloh =
        await window.LubaNoteAttachmentsCloud
          .zajistiStinovePrilohyPoznamkyVCloudu(note);

      if (stavPriloh?.ok !== true) {
        console.warn(
          "LubaNote attachments: některá stínová cloudová příloha zatím není nahraná. Poznámka se bezpečně synchronizuje původním Data URL způsobem.",
          stavPriloh
        );
      }
    } catch (error) {
      console.warn(
        "LubaNote attachments: příprava cloudové stínové přílohy selhala; původní sync pokračuje.",
        error
      );
    }
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

  const vysledek = await zaradServerovyZapis(
    note.id,
    async () => {
      const meta = ziskejCloudSyncMeta(note.id);
      const expectedRevision =
        Number.isFinite(Number(meta?.revision))
          ? Number(meta.revision)
          : 0;

      return await provedBezpecnyZapisPoznamky({
        id: note.id,
        data: dataToStore,
        expectedRevision,
        localUpdatedAt:
          note.updatedAt || null,
        deleteNote: false,
        deletedByDeviceId: null,
        /* Secret konflikt zůstává konzervativně blokovaný.
           Běžný konflikt převezme centrální revizní merge. */
        oznamitKonflikt: note.isSecret === true
      });
    }
  );

  if (
    !vysledek.ok &&
    vysledek.conflict &&
    note.isSecret !== true
  ) {
    naplanujVyreseniBeznehoReviznihoKonfliktu();
  }

  if (
    vysledek.ok &&
    note.isSecret !== true &&
    window.LubaNoteAttachmentsCloud
  ) {
    try {
      const cloud = window.LubaNoteAttachmentsCloud;

      if (cloud.synchronizujReferencePrilohPoznamky) {
        /*
         * Až PO úspěšném zápisu nové revize sjednotíme serverové
         * attachment reference s tím, co v poznámce skutečně zůstalo.
         * Chybějící dříve aktivní attachmenty se pouze označí jako
         * pending_delete; fyzický soubor se v této fázi nemaže.
         */
        await cloud.synchronizujReferencePrilohPoznamky(note);
      } else if (cloud.oznacPrilohyPoznamkyJakoAktivni) {
        /*
         * Kompatibilní fallback pro případ, že klient krátce běží proti
         * starší serverové/JS vrstvě bez reconciliation RPC.
         */
        await cloud.oznacPrilohyPoznamkyJakoAktivni(note);
      }
    } catch (error) {
      /*
       * Attachment metadata nesmí vrátit zpět už úspěšně zapsanou
       * revizi poznámky. Další sync reconciliation zkusí znovu.
       */
      console.warn(
        "LubaNote attachments: synchronizace attachment referencí se dokončí později.",
        error
      );
    }
  }

  return vysledek.ok;
}

async function uploadEncryptedSecretRecordToSupabase(record) {
  const user = await getCurrentUser();

  if (!user || !record?.id || !record?.encrypted) {
    return false;
  }

  const vysledek = await zaradServerovyZapis(
    record.id,
    async () => {
      const meta = ziskejCloudSyncMeta(record.id);
      const expectedRevision =
        Number.isFinite(Number(meta?.revision))
          ? Number(meta.revision)
          : 0;

      return await provedBezpecnyZapisPoznamky({
        id: record.id,
        data: {
          __lubanoteSecret: true,
          version: 1,
          encrypted: record.encrypted
        },
        expectedRevision,
        localUpdatedAt:
          record.updatedAt || null,
        deleteNote: false,
        deletedByDeviceId: null
      });
    }
  );

  return vysledek.ok;
}

async function markNoteDeletedInSupabase(note) {
  if (!note?.id) {
    return false;
  }

  const deletedAt = new Date().toISOString();
  const meta = ziskejCloudSyncMeta(note.id);
  const expectedRevision =
    Number.isFinite(Number(meta?.revision))
      ? Number(meta.revision)
      : 0;

  /*
   * Smazání nejdřív zapíšeme do lokální fronty.
   * Fronta nese i revizi, ze které uživatel při smazání vycházel.
   * Starší zařízení proto nemůže smazat novější cloudovou verzi.
   */
  pridejCekajiciSmazani(
    note.id,
    deletedAt,
    expectedRevision
  );

  const user = await getCurrentUser();

  if (!user || !navigator.onLine) {
    return false;
  }

  const vysledek =
    await provedBezpecnyZapisPoznamky({
      id: note.id,
      data: {
        deleted: true
      },
      expectedRevision,
      localUpdatedAt: deletedAt,
      deleteNote: true,
      deletedByDeviceId: getDeviceId()
    });

  if (!vysledek.ok) {
    return false;
  }

  odeberCekajiciSmazani(note.id);

  return true;
}





async function getCloudNotesForSync() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error(
      "Synchronizace byla zastavena: uživatel není přihlášený."
    );
  }

  /*
   * Čtení poznámek jde přes serverovou RPC funkci.
   * Přímý SELECT na public.notes zůstává klientům zakázaný,
   * takže stará verze LubaNote nemůže ani stáhnout cloudový stav.
   */
  const { data, error } = await supabaseClient
    .rpc("get_notes_safe");

  if (error) {
    console.error("Sync download error:", error.message);

    if (jeChybaOdeprenehoPristupu(error)) {
      oznamOdeprenyPristupUctu(error);
    }

    /*
     * Chybu čtení nikdy nesmíme zaměnit za prázdný cloud.
     * Jinak by klient mohl začít všechny lokální poznámky posílat
     * jako údajně nové. Při nejistotě proto celý sync bezpečně končí.
     */
    throw error;
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Synchronizace byla zastavena: server vrátil neplatná data."
    );
  }

  return data;
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


function jsouStejneCasoveZnacky(a, b) {
  return String(a ?? "") === String(b ?? "");
}

function seradJsonProSyncPorovnani(hodnota) {
  if (Array.isArray(hodnota)) {
    return hodnota.map(seradJsonProSyncPorovnani);
  }

  if (
    hodnota &&
    typeof hodnota === "object"
  ) {
    return Object.keys(hodnota)
      .sort()
      .reduce((vysledek, klic) => {
        if (hodnota[klic] !== undefined) {
          vysledek[klic] =
            seradJsonProSyncPorovnani(
              hodnota[klic]
            );
        }

        return vysledek;
      }, {});
  }

  return hodnota;
}

function normalizujPoznamkuProPorovnaniKonfliktu(
  poznamka,
  id
) {
  if (!poznamka || typeof poznamka !== "object") {
    return null;
  }

  /*
   * Porovnáváme uživatelský obsah, ne technický stav konkrétního
   * zařízení. notificationId je lokální identifikátor systémové
   * notifikace a updatedAt je pouze časová stopa synchronizace.
   * Tyto hodnoty proto nesmí samy vytvořit konfliktní kopii.
   *
   * Naopak reminder, repeat, plannedItems, text, TODO, štítky atd.
   * zůstávají součástí porovnání. Skutečnou uživatelskou změnu tedy
   * nikdy automaticky nesloučíme jen proto, že karta vypadá podobně.
   */
  const odstranTechnickaPole = (hodnota) => {
    if (Array.isArray(hodnota)) {
      return hodnota.map(odstranTechnickaPole);
    }

    if (hodnota && typeof hodnota === "object") {
      return Object.keys(hodnota)
        .sort()
        .reduce((vysledek, klic) => {
          if (
            klic === "updatedAt" ||
            klic === "notificationId" ||
            klic === "syncConflict"
          ) {
            return vysledek;
          }

          if (hodnota[klic] !== undefined) {
            vysledek[klic] = odstranTechnickaPole(
              hodnota[klic]
            );
          }

          return vysledek;
        }, {});
    }

    return hodnota;
  };

  const vysledek = {
    ...poznamka,
    id: id || poznamka.id
  };

  if (vysledek.isSecret === false) {
    delete vysledek.isSecret;
  }

  return odstranTechnickaPole(vysledek);
}

function majiStejnySkutecnyObsahPoznamky(
  lokalniPoznamka,
  cloudPoznamka,
  id
) {
  if (!lokalniPoznamka || !cloudPoznamka) {
    return false;
  }

  return JSON.stringify(
    normalizujPoznamkuProPorovnaniKonfliktu(
      lokalniPoznamka,
      id
    )
  ) === JSON.stringify(
    normalizujPoznamkuProPorovnaniKonfliktu(
      cloudPoznamka,
      id
    )
  );
}

function normalizujPoznamkuProPrvniRevizi(
  poznamka,
  id
) {
  if (!poznamka || typeof poznamka !== "object") {
    return null;
  }

  const vysledek = {
    ...poznamka,
    id: id || poznamka.id
  };

  /*
   * updatedAt se po starém syncu nemusí rovnat serverovému
   * updated_at. Pro bezpečné převzetí první revize proto porovnáváme
   * celý skutečný obsah poznámky a ignorujeme pouze tuto časovou stopu.
   */
  delete vysledek.updatedAt;

  if (vysledek.isSecret === false) {
    delete vysledek.isSecret;
  }

  return seradJsonProSyncPorovnani(vysledek);
}

function vytvorKonfliktniKopiiBeznePoznamky(
  poznamka,
  puvodniId
) {
  if (!poznamka || poznamka.isSecret === true) {
    return null;
  }

  let kopie;

  try {
    kopie = typeof structuredClone === "function"
      ? structuredClone(poznamka)
      : JSON.parse(JSON.stringify(poznamka));
  } catch (error) {
    console.error(
      "Vytvoření bezpečné konfliktní kopie selhalo:",
      error
    );
    return null;
  }

  const noveId = crypto.randomUUID();
  const cas = new Date().toISOString();
  const puvodniNazev = String(
    kopie.title || "Poznámka"
  ).trim();

  kopie.id = noveId;
  kopie.title = `${puvodniNazev} ⚠️ konfliktní kopie`;
  kopie.updatedAt = cas;
  kopie.isSecret = false;

  /* Konfliktní kopie zachovává text, TODO, štítky a další obsah,
     ale nesmí vytvořit duplicitní systémovou notifikaci ani
     zdvojit Planner položky se stejnými ID. Původní cloudová
     verze zůstává beze změny. */
  kopie.reminder = false;
  kopie.notificationId = null;
  kopie.plannedItems = [];

  if (
    kopie.repeat &&
    typeof kopie.repeat === "object"
  ) {
    kopie.repeat = {
      ...kopie.repeat,
      enabled: false
    };
  }

  kopie.syncConflict = {
    originalId: puvodniId || poznamka.id || null,
    preservedAt: cas
  };

  return kopie;
}

function maStejnyObsahProPrvniRevizi(
  lokalni,
  row
) {
  if (!lokalni || !row || row.deleted_at) {
    return false;
  }

  if (
    lokalni.record &&
    jeSifrovanyCloudSecretRow(row)
  ) {
    return JSON.stringify(
      seradJsonProSyncPorovnani(
        lokalni.record.encrypted
      )
    ) === JSON.stringify(
      seradJsonProSyncPorovnani(
        row.data.encrypted
      )
    );
  }

  if (!lokalni.note || jeSifrovanyCloudSecretRow(row)) {
    return false;
  }

  return majiStejnySkutecnyObsahPoznamky(
    lokalni.note,
    row.data,
    row.id
  );
}

async function ziskejShodneSecretIdProRevizniMerge(
  localDecryptedSecret,
  cloudRows
) {
  const shodneId = new Set();

  if (
    !Array.isArray(localDecryptedSecret) ||
    localDecryptedSecret.length === 0 ||
    typeof desifrujTajnouPoznamku !== "function"
  ) {
    return shodneId;
  }

  const lokalniMapa = new Map(
    localDecryptedSecret
      .filter((note) => note?.id)
      .map((note) => [note.id, note])
  );

  for (const row of Array.isArray(cloudRows) ? cloudRows : []) {
    if (
      !row?.id ||
      row.deleted_at ||
      !jeSifrovanyCloudSecretRow(row)
    ) {
      continue;
    }

    const lokalni = lokalniMapa.get(row.id);

    if (!lokalni) {
      continue;
    }

    try {
      const cloudPoznamka = await desifrujTajnouPoznamku(
        row.data.encrypted,
        row.id
      );

      if (
        cloudPoznamka &&
        majiStejnySkutecnyObsahPoznamky(
          {
            ...lokalni,
            id: row.id,
            isSecret: true
          },
          {
            ...cloudPoznamka,
            id: row.id,
            isSecret: true
          },
          row.id
        )
      ) {
        shodneId.add(row.id);
      }
    } catch (error) {
      /*
       * Secret může být zamčený nebo může chybět klíč.
       * V takovém případě zůstává původní konzervativní ochrana:
       * nic automaticky nepřepisujeme a případný konflikt zůstane.
       */
    }
  }

  return shodneId;
}

function pripravRevizniMerge(
  localRegular,
  localEncrypted,
  localLegacySecret,
  localDecryptedSecret,
  cloudRows,
  shodneSecretId = new Set(),
  idPoznamekEditovanychJinde = new Set()
) {
  const lokalniMapa =
    vytvorMapuVitezu(
      localRegular,
      localEncrypted,
      localLegacySecret,
      localDecryptedSecret,
      []
    ).winners;

  const konfliktniId = new Set();
  const vynutitCloudId = new Set();
  const vynutitLocalId = new Set();
  const prijmoutCloudMetaId = new Set();
  const konfliktniKopie = [];
  const puvodniIdJizZachovanychKonfliktnichKopii =
    new Set(
      (Array.isArray(localRegular) ? localRegular : [])
        .map((note) => note?.syncConflict?.originalId)
        .filter(Boolean)
    );

  const cekajiciSmazaniId = new Set(
    nactiCekajiciSmazani().map(
      (zaznam) => zaznam?.id
    ).filter(Boolean)
  );

  (Array.isArray(cloudRows) ? cloudRows : [])
    .forEach((row) => {
      if (!row?.id) {
        return;
      }

      /*
       * Cizí aktivní editor má během svého lease výhradní právo
       * změnit tuto poznámku. Tento klient ji proto neposuzuje jako
       * revizní konflikt a její lokální kopii zatím nechá nedotčenou.
       */
      if (idPoznamekEditovanychJinde.has(row.id)) {
        return;
      }

      /*
       * Dokud server bezpečně nepotvrdí tombstone, nesmíme pro tuto
       * poznámku přijmout novou cloudovou revizi ani zrušit případný
       * konflikt. Uložená expectedRevision je přesně stav, ze kterého
       * uživatel mazal, a musí zůstat beze změny.
       */
      if (cekajiciSmazaniId.has(row.id)) {
        if (aktivniKonfliktySyncu.has(row.id)) {
          konfliktniId.add(row.id);
        }

        return;
      }

      const lokalni = lokalniMapa.get(row.id);
      const meta = ziskejCloudSyncMeta(row.id);
      const cloudRevision =
        Number(row.revision);

      if (!Number.isFinite(cloudRevision)) {
        oznamKonfliktSynchronizace(
          row.id,
          "missing_server_revision",
          { row }
        );
        konfliktniId.add(row.id);
        return;
      }

      if (!lokalni) {
        prijmoutCloudMetaId.add(row.id);
        return;
      }

      if (!meta) {
        /*
         * První start po zavedení revizí:
         *
         * - shodný obsah bezpečně převezme serverovou revizi,
         * - prokazatelně novější cloud opraví starou lokální kopii,
         * - stejně starý nebo starší cloud s rozdílným obsahem zůstane
         *   konfliktem, protože může jít o dosud neodeslanou lokální změnu.
         *
         * Přímé zápisy starých klientů jsou na serveru zakázané. Novější
         * serverový čas proto už nemůže vzniknout obyčejným legacy upsertem.
         */
        const lokalniCas =
          new Date(
            lokalni.updatedAt || 0
          ).getTime();

        const cloudCas =
          new Date(
            row.updated_at || 0
          ).getTime();

        const cloudJeProkazatelneNovejsi =
          Number.isFinite(cloudCas) &&
          Number.isFinite(lokalniCas) &&
          cloudCas > lokalniCas;

        if (
          maStejnyObsahProPrvniRevizi(
            lokalni,
            row
          ) ||
          cloudJeProkazatelneNovejsi ||
          shodneSecretId.has(row.id)
        ) {
          vynutitCloudId.add(row.id);
          prijmoutCloudMetaId.add(row.id);
          zrusKonfliktSynchronizace(row.id);

          if (shodneSecretId.has(row.id)) {
            console.info(
              "LubaNote sync: falešný Secret konflikt přeskočen – skutečný obsah je shodný:",
              row.id
            );
          }

          return;
        }

        if (
          lokalni.type === "regular" &&
          lokalni.note &&
          !jeCloudSecretRow(row)
        ) {
          /*
           * Pokud už byla tato lokální verze dříve bezpečně zachována
           * jako konfliktní kopie s novým ID, nevytváříme další kopii.
           * Původní ID už může bez ztráty převzít cloud.
           */
          if (
            puvodniIdJizZachovanychKonfliktnichKopii.has(
              row.id
            )
          ) {
            vynutitCloudId.add(row.id);
            prijmoutCloudMetaId.add(row.id);
            zrusKonfliktSynchronizace(row.id);
            return;
          }

          const kopie =
            vytvorKonfliktniKopiiBeznePoznamky(
              lokalni.note,
              row.id
            );

          if (kopie) {
            konfliktniKopie.push(kopie);
            puvodniIdJizZachovanychKonfliktnichKopii.add(
              row.id
            );
            vynutitCloudId.add(row.id);
            prijmoutCloudMetaId.add(row.id);
            zrusKonfliktSynchronizace(row.id);

            console.warn(
              "LubaNote sync: rozdílné první revize byly zachovány jako dvě poznámky:",
              row.id,
              kopie.id
            );
            return;
          }
        }

        konfliktniId.add(row.id);
        oznamKonfliktSynchronizace(
          row.id,
          "first_revision_migration_conflict",
          {
            localUpdatedAt:
              lokalni.updatedAt || null,
            cloudUpdatedAt:
              row.updated_at || null,
            cloudRevision
          }
        );
        return;
      }

      const cloudSeZmenil =
        cloudRevision !== Number(meta.revision);

      const localSeZmenil =
        !jsouStejneCasoveZnacky(
          lokalni.updatedAt,
          meta.localUpdatedAt
        );

      if (cloudSeZmenil && localSeZmenil) {
        /*
         * Secret poznámka může být po importu nebo novém zašifrování
         * binárně jiná, i když je její skutečný dešifrovaný obsah
         * naprosto stejný. Pokud je Secret právě odemčený, porovnání
         * proběhlo výše pouze v paměti. Shodný obsah není konflikt.
         */
        if (shodneSecretId.has(row.id)) {
          vynutitCloudId.add(row.id);
          prijmoutCloudMetaId.add(row.id);
          zrusKonfliktSynchronizace(row.id);

          console.info(
            "LubaNote sync: falešný Secret konflikt přeskočen – skutečný obsah je shodný:",
            row.id
          );
          return;
        }

        /*
         * Než vytvoříme konfliktní kopii, ověříme skutečný obsah.
         * Obě strany mohou mít změněnou revizi/updatedAt pouze kvůli
         * technickému housekeeping-u (např. notificationId), přestože
         * uživatelský obsah zůstal totožný. V takovém případě konflikt
         * neexistuje a bezpečně převezmeme serverovou revizi.
         */
        if (
          lokalni.type === "regular" &&
          lokalni.note &&
          !jeCloudSecretRow(row) &&
          majiStejnySkutecnyObsahPoznamky(
            lokalni.note,
            row.data,
            row.id
          )
        ) {
          vynutitCloudId.add(row.id);
          prijmoutCloudMetaId.add(row.id);
          zrusKonfliktSynchronizace(row.id);

          console.info(
            "LubaNote sync: falešný konflikt přeskočen – skutečný obsah je shodný:",
            row.id
          );
          return;
        }

        /*
         * Dvě moderní zařízení změnila stejnou běžnou poznámku.
         * Starší řešení sync úplně zastavilo a modal se opakoval.
         * Bezpečnější a praktičtější je NEPŘEPSAT ani jednu verzi:
         * cloud zůstane na původním ID a lokální změna dostane nové ID.
         * Starý klient tak stále nikdy nemůže přepsat novější cloud.
         */
        if (
          lokalni.type === "regular" &&
          lokalni.note &&
          !jeCloudSecretRow(row)
        ) {
          /*
           * Pokud už byla tato lokální verze dříve bezpečně zachována
           * jako konfliktní kopie s novým ID, nevytváříme další kopii.
           * Původní ID už může bez ztráty převzít cloud.
           */
          if (
            puvodniIdJizZachovanychKonfliktnichKopii.has(
              row.id
            )
          ) {
            vynutitCloudId.add(row.id);
            prijmoutCloudMetaId.add(row.id);
            zrusKonfliktSynchronizace(row.id);
            return;
          }

          const kopie =
            vytvorKonfliktniKopiiBeznePoznamky(
              lokalni.note,
              row.id
            );

          if (kopie) {
            konfliktniKopie.push(kopie);
            puvodniIdJizZachovanychKonfliktnichKopii.add(
              row.id
            );
            vynutitCloudId.add(row.id);
            prijmoutCloudMetaId.add(row.id);
            zrusKonfliktSynchronizace(row.id);

            console.warn(
              "LubaNote sync: obě současně změněné verze byly zachovány:",
              row.id,
              kopie.id
            );
            return;
          }
        }

        /* Secret konflikt nebo selhání vytvoření kopie zůstává
           konzervativně blokovaný – zde nesmíme riskovat plaintext. */
        konfliktniId.add(row.id);
        oznamKonfliktSynchronizace(
          row.id,
          "both_sides_changed",
          {
            expectedRevision: meta.revision,
            cloudRevision,
            localUpdatedAt:
              lokalni.updatedAt || null,
            lastSyncedLocalUpdatedAt:
              meta.localUpdatedAt || null,
            cloudUpdatedAt:
              row.updated_at || null
          }
        );
        return;
      }

      if (cloudSeZmenil) {
        vynutitCloudId.add(row.id);
        prijmoutCloudMetaId.add(row.id);
        return;
      }

      if (localSeZmenil) {
        vynutitLocalId.add(row.id);
        return;
      }

      /*
       * Ani jedna strana se od poslední známé revize nezměnila.
       * Přijmeme serverovou reprezentaci, aby se lokální updatedAt
       * srovnal se serverovým časem vráceným save_note_safe().
       */
      vynutitCloudId.add(row.id);
      prijmoutCloudMetaId.add(row.id);
    });

  return {
    konfliktniId,
    vynutitCloudId,
    vynutitLocalId,
    prijmoutCloudMetaId,
    konfliktniKopie
  };
}

function ulozPrijateCloudMetaPoMerge(
  cloudRows,
  prijmoutCloudMetaId
) {
  if (!(prijmoutCloudMetaId instanceof Set)) {
    return;
  }

  (Array.isArray(cloudRows) ? cloudRows : [])
    .forEach((row) => {
      if (
        !row?.id ||
        !prijmoutCloudMetaId.has(row.id)
      ) {
        return;
      }

      ulozCloudSyncMeta(row.id, {
        revision: row.revision,
        localUpdatedAt:
          row.deleted_at
            ? null
            : row.updated_at || null,
        serverUpdatedAt:
          row.updated_at || null
      });

      zrusKonfliktSynchronizace(row.id);
    });
}


/*
 * OPRAVA JIŽ VZNIKLÝCH LEGACY DUPLIKÁTŮ
 *
 * Předchozí verze mohly stejné staré poznámce bez ID na dvou
 * zařízeních přidělit dvě různá náhodná UUID. Takovou situaci
 * opravujeme pouze tehdy, když je shoda velmi silná:
 * - stejný notificationId,
 * - stejný základní obsah poznámky.
 *
 * Běžné dvě úmyslně podobné poznámky bez této shody neslučujeme.
 */
function vyberNejnovejsiLegacyKandidat(kandidati) {
  return [...kandidati].sort((a, b) => {
    const casA = new Date(a?.note?.updatedAt || 0).getTime();
    const casB = new Date(b?.note?.updatedAt || 0).getTime();

    if (casA !== casB) {
      return casB - casA;
    }

    /* Při shodném čase dáváme přednost lokálnímu stavu. */
    if (a.source === b.source) {
      return 0;
    }

    return a.source === "local" ? -1 : 1;
  })[0] || null;
}

function slucViditelnyStavLegacyKandidatu(kandidati, canonicalId) {
  const nejlepsi =
    vyberNejnovejsiLegacyKandidat(kandidati);

  if (!nejlepsi?.note) {
    return null;
  }

  /*
   * Obsah a čas bereme z nejnovější verze. Připnutí a oblíbenost
   * jsou neškodné UI vlastnosti, proto je při opravě duplikátu
   * neztratíme, pokud je měla alespoň jedna kopie.
   */
  const puvodniId = new Set(
    kandidati
      .map((kandidat) => kandidat?.note?.id)
      .filter(Boolean)
  );

  const plannedItems = Array.isArray(nejlepsi.note.plannedItems)
    ? nejlepsi.note.plannedItems.map((item) => ({
        ...item,
        sourceNoteId:
          puvodniId.has(item?.sourceNoteId)
            ? canonicalId
            : item?.sourceNoteId
      }))
    : nejlepsi.note.plannedItems;

  return {
    ...nejlepsi.note,
    id: canonicalId,
    plannedItems,
    pinned: kandidati.some(
      (kandidat) => kandidat?.note?.pinned === true
    ),
    favorite: kandidati.some(
      (kandidat) => kandidat?.note?.favorite === true
    ),
    isSecret: false
  };
}

function prevedOdkazyLegacyDuplikatu(aliasy) {
  if (!(aliasy instanceof Map) || aliasy.size === 0) {
    return;
  }

  if (
    typeof loadPlannedItems === "function" &&
    typeof savePlannedItems === "function"
  ) {
    const plannedItems = loadPlannedItems();
    let changed = false;

    plannedItems.forEach((item) => {
      const noveId = aliasy.get(item?.sourceNoteId);

      if (noveId) {
        item.sourceNoteId = noveId;
        changed = true;
      }
    });

    if (changed) {
      savePlannedItems(plannedItems);
    }
  }

  if (
    typeof activeTaskId !== "undefined" &&
    aliasy.has(activeTaskId)
  ) {
    activeTaskId = aliasy.get(activeTaskId);
  }

  if (
    typeof plannerSourceNoteId !== "undefined" &&
    aliasy.has(plannerSourceNoteId)
  ) {
    plannerSourceNoteId = aliasy.get(plannerSourceNoteId);
  }

  const taskModal = document.getElementById("taskModal");
  const modalId = taskModal?.dataset?.taskId;

  if (modalId && aliasy.has(modalId)) {
    taskModal.dataset.taskId = aliasy.get(modalId);
  }
}

function sjednotJasneLegacyDuplikatyPredSyncem(
  localRegular,
  cloudRows
) {
  if (
    typeof vytvorKlicJasnehoLegacyDuplikatu !== "function" ||
    typeof vytvorStabilniIdStarePoznamky !== "function"
  ) {
    return {
      localRegular,
      cloudRows,
      pocetOpravenychSkupin: 0
    };
  }

  const skupiny = new Map();

  const pridej = (note, source) => {
    const klic =
      vytvorKlicJasnehoLegacyDuplikatu(note);

    if (!klic || !note?.id) {
      return;
    }

    if (!skupiny.has(klic)) {
      skupiny.set(klic, []);
    }

    skupiny.get(klic).push({
      note,
      source
    });
  };

  (Array.isArray(localRegular) ? localRegular : [])
    .forEach((note) => pridej(note, "local"));

  (Array.isArray(cloudRows) ? cloudRows : [])
    .forEach((row) => {
      const note = vytvorCloudRegularNote(row);

      if (note) {
        pridej(note, "cloud");
      }
    });

  const aliasy = new Map();
  const canonicalPoznamky = new Map();
  let pocetOpravenychSkupin = 0;

  skupiny.forEach((kandidati) => {
    const ruznaId = new Set(
      kandidati
        .map((kandidat) => kandidat?.note?.id)
        .filter(Boolean)
    );

    if (ruznaId.size < 2) {
      return;
    }

    const vzor = kandidati[0]?.note;
    const canonicalId =
      vytvorStabilniIdStarePoznamky({
        ...vzor,
        id: null
      });

    if (!canonicalId) {
      return;
    }

    const sloucena =
      slucViditelnyStavLegacyKandidatu(
        kandidati,
        canonicalId
      );

    if (!sloucena) {
      return;
    }

    ruznaId.forEach((stareId) => {
      if (stareId === canonicalId) {
        return;
      }

      aliasy.set(stareId, canonicalId);

      /*
       * Starý cloudový řádek nesmí při příštím syncu znovu ožít.
       * Tombstone pouze zařadíme do lokální fronty; UI na síť nečeká.
       */
      if (typeof pridejCekajiciSmazani === "function") {
        const cloudRowStarehoId =
          (Array.isArray(cloudRows) ? cloudRows : [])
            .find((row) => row?.id === stareId);

        pridejCekajiciSmazani(
          stareId,
          new Date().toISOString(),
          Number.isFinite(
            Number(cloudRowStarehoId?.revision)
          )
            ? Number(cloudRowStarehoId.revision)
            : 0
        );
      }
    });

    canonicalPoznamky.set(canonicalId, sloucena);
    pocetOpravenychSkupin += 1;
  });

  if (pocetOpravenychSkupin === 0) {
    return {
      localRegular,
      cloudRows,
      pocetOpravenychSkupin: 0
    };
  }

  const puvodniId = new Set(aliasy.keys());

  const noveLocalRegular = (
    Array.isArray(localRegular) ? localRegular : []
  ).filter((note) =>
    note?.id &&
    !puvodniId.has(note.id) &&
    !canonicalPoznamky.has(note.id)
  );

  canonicalPoznamky.forEach((note) => {
    noveLocalRegular.push(note);
  });

  const noveCloudRows = (
    Array.isArray(cloudRows) ? cloudRows : []
  ).filter((row) => !puvodniId.has(row?.id));

  prevedOdkazyLegacyDuplikatu(aliasy);

  /*
   * Lokální kopii opravíme okamžitě. Jde o interní migraci syncu,
   * proto nezvyšujeme uživatelskou revizi přes saveAllTasks().
   */
  if (typeof ulozBeznePoznamkyPrimo === "function") {
    ulozBeznePoznamkyPrimo(noveLocalRegular);
  }

  odlozOpakovaniSynchronizace();

  console.warn(
    `LubaNote: opraveno legacy duplikátů: ${pocetOpravenychSkupin}`
  );

  return {
    localRegular: noveLocalRegular,
    cloudRows: noveCloudRows,
    pocetOpravenychSkupin
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

/* ============================================================
   OCHRANA POZNÁMKY OTEVŘENÉ NA JINÉM ZAŘÍZENÍ

   Aktivní editor lease je autorita i pro běžný background sync.
   Zařízení, které poznámku právě NEEDITUJE, ji během platného
   cizího lease nesmí uploadovat, stahovat přes starou lokální kopii
   ani z ní vytvářet konfliktní kopii. Po bezpečném předání se nový
   vlastník přestane blokovat a stáhne potvrzenou serverovou revizi.
   ============================================================ */
async function ziskejIdPoznamekEditovanychJinde() {
  if (!navigator.onLine) {
    return new Set();
  }

  const deviceId = getDeviceId();

  if (!deviceId) {
    return new Set();
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      "lubanote_get_remote_active_editor_note_ids",
      {
        p_device_id: deviceId
      }
    );

    if (error) {
      /*
       * Doplňková handoff ochrana nesmí rozbít původní sync při
       * dočasné síťové chybě nebo před aplikací SQL V1.3.
       * V takovém případě zůstává aktivní původní revision airbag.
       */
      console.warn(
        "Kontrola aktivních editorů pro sync nebyla dostupná:",
        error.message
      );
      return new Set();
    }

    const radky = Array.isArray(data) ? data : [];

    return new Set(
      radky
        .map((row) => row?.note_id)
        .filter(Boolean)
    );
  } catch (error) {
    console.warn(
      "Kontrola aktivních editorů pro sync selhala:",
      error
    );
    return new Set();
  }
}

async function syncNotes() {
  if (probihajiciSync) {
    return probihajiciSync;
  }

  probihajiciSync = (async () => {
    const user = await getCurrentUser();

    if (!user) {
      oznamChybejiciOnlineSession();
      return false;
    }

    nastavStavSynchronizaceUI("syncing");

    if (typeof cekajNaUlozeniTajnychPoznamek === "function") {
      await cekajNaUlozeniTajnychPoznamek();
    }

    const revizeLokalnihoStavuPriStartu =
      ziskejReviziLokalnichZmenProSync();

    /*
     * Nejdřív odešleme případná smazání z offline fronty.
     * Teprve potom načítáme cloudový snapshot.
     */
    await odesliCekajiciSmazaniDoSupabase();

    let localRegular = getLocalNotesForSync();

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

    let cloudRows = await getCloudNotesForSync();

    /*
     * Pokud stejnou poznámku právě drží aktivní editor na jiném
     * zařízení, tento klient ji v tomto syncu pouze ponechá beze změny.
     * Tím mobil při otevření aplikace nemůže zvýšit serverovou revizi
     * pod rozepsaným editorem na PC ještě před požadavkem na handoff.
     */
    const idPoznamekEditovanychJinde =
      await ziskejIdPoznamekEditovanychJinde();

    /*
     * LEGACY PLANNER MIGRACE – pouze skutečně lokální poznámky.
     *
     * Původní kód spouštěl migrateLocalPlannedItemsIntoNotes() nad
     * KAŽDOU poznámkou ještě před načtením cloudu. Funkce přitom při
     * doplnění staré Planner položky mění updatedAt. Lokální cache
     * plannedItems tak mohla během startu označit dávno synchronizovanou
     * poznámku jako „lokálně změněnou“. Pokud mezitím stejnou poznámku
     * změnilo jiné zařízení, revizní merge správně viděl změnu obou stran,
     * ale výsledkem byla falešná konfliktní kopie.
     *
     * Jednorázová legacy migrace proto smí sahat pouze na poznámku, která:
     * - ještě nemá žádnou známou serverovou revizi na tomto zařízení, A
     * - současně vůbec neexistuje v aktuálním cloudovém snapshotu.
     *
     * U moderních synchronizovaných poznámek je zdrojem pravdy obsah
     * poznámky z cloudu; stará lokální Planner cache ho nesmí znovu měnit.
     */
    if (
      typeof migrateLocalPlannedItemsIntoNotes === "function"
    ) {
      const cloudId = new Set(
        (Array.isArray(cloudRows) ? cloudRows : [])
          .map((row) => row?.id)
          .filter(Boolean)
      );

      const pouzeLokalniLegacyPoznamky =
        localRegular.filter((note) => (
          note?.id &&
          !ziskejCloudSyncMeta(note.id) &&
          !cloudId.has(note.id)
        ));

      if (
        pouzeLokalniLegacyPoznamky.length > 0 &&
        migrateLocalPlannedItemsIntoNotes(
          pouzeLokalniLegacyPoznamky
        )
      ) {
        /*
         * Kandidáti jsou stejné objekty jako v localRegular, takže
         * uložíme celý bezpečný seznam. Jde o interní migraci uvnitř
         * syncu, proto nepoužíváme saveAllTasks() a nevytváříme falešnou
         * uživatelskou lokální revizi.
         */
        ulozBeznePoznamkyPrimo(localRegular);
        localRegular = getLocalNotesForSync();
      }
    }

    if (
      lokalniStavSeBehemSyncuZmenil(
        revizeLokalnihoStavuPriStartu
      )
    ) {
      odlozOpakovaniSynchronizace();
      return false;
    }

    /*
     * Ještě před hlavním merge opravíme pouze jasně rozpoznané
     * legacy duplikáty vzniklé rozdílným UUID na dvou zařízeních.
     */
    const opravaLegacyDuplikatu =
      sjednotJasneLegacyDuplikatyPredSyncem(
        localRegular,
        cloudRows
      );

    localRegular =
      opravaLegacyDuplikatu.localRegular;

    cloudRows =
      opravaLegacyDuplikatu.cloudRows;

    const cloudMap = new Map(
      cloudRows.map((row) => [row.id, row])
    );

    /*
     * Od této chvíle nerozhoduje mezi dvěma zařízeními pouze čas.
     * Základ je poslední serverová revize, kterou tento klient znal.
     * Pokud se od ní změnily obě strany, nic automaticky nepřepisujeme.
     */
    const shodneSecretId =
      await ziskejShodneSecretIdProRevizniMerge(
        localDecryptedSecret,
        cloudRows
      );

    const revizniMerge = pripravRevizniMerge(
      localRegular,
      localEncrypted,
      localLegacySecret,
      localDecryptedSecret,
      cloudRows,
      shodneSecretId,
      idPoznamekEditovanychJinde
    );

    const {
      konfliktniId,
      vynutitCloudId,
      vynutitLocalId,
      prijmoutCloudMetaId,
      konfliktniKopie
    } = revizniMerge;

    if (konfliktniKopie.length > 0) {
      localRegular = [
        ...localRegular,
        ...konfliktniKopie
      ];
    }

    const localRegularProMerge =
      localRegular.filter(
        (note) => !vynutitCloudId.has(note?.id)
      );

    const localEncryptedProMerge =
      localEncrypted.filter(
        (record) => !vynutitCloudId.has(record?.id)
      );

    const localLegacySecretProMerge =
      localLegacySecret.filter(
        (note) => !vynutitCloudId.has(note?.id)
      );

    const localDecryptedSecretProMerge =
      localDecryptedSecret.filter(
        (note) => !vynutitCloudId.has(note?.id)
      );

    const cloudRowsProMerge =
      cloudRows.filter(
        (row) =>
          !konfliktniId.has(row?.id) &&
          !vynutitLocalId.has(row?.id) &&
          !idPoznamekEditovanychJinde.has(row?.id)
      );

    const { winners } = vytvorMapuVitezu(
      localRegularProMerge,
      localEncryptedProMerge,
      localLegacySecretProMerge,
      localDecryptedSecretProMerge,
      cloudRowsProMerge
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
          !konfliktniId.has(id) &&
          !idPoznamekEditovanychJinde.has(id) &&
          winner.source === "local-regular" &&
          (
            !cloudRow ||
            vynutitLocalId.has(id) ||
            winnerTime > cloudTime ||
            jeCloudSecretRow(cloudRow)
          )
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
        !konfliktniId.has(id) &&
        !idPoznamekEditovanychJinde.has(id) &&
        winner.source === "local-secret-encrypted" &&
        (
          !cloudRow ||
          vynutitLocalId.has(id) ||
          winnerTime > cloudTime ||
          !jeCloudSecretRow(cloudRow)
        )
      ) {
        await uploadEncryptedSecretRecordToSupabase(winner.record);
      }
    }

    /*
     * Během síťových await mohl uživatel něco změnit.
     * V takovém případě starý snapshot NEZAPÍŠEME do localStorage.
     * Nový sync si načte čerstvý lokální stav.
     */
    if (
      lokalniStavSeBehemSyncuZmenil(
        revizeLokalnihoStavuPriStartu
      )
    ) {
      odlozOpakovaniSynchronizace();
      return false;
    }

    /*
     * Toto odstraní stale běžnou kopii, pokud na jiném zařízení vyhrála
     * novější tajná verze. Legacy tajný plaintext se zatím zachová.
     */
    ulozBeznePoznamkyPrimo(mergedRegular);
    ulozSifrovaneTajneZaznamy(encryptedToKeep);

    /*
     * Meta revizi posuneme až poté, co jsme cloudový stav opravdu
     * přijali do lokálního úložiště. Při pádu uprostřed syncu tak
     * nevznikne falešný dojem, že starý lokální obsah je aktuální.
     */
    ulozPrijateCloudMetaPoMerge(
      cloudRows,
      prijmoutCloudMetaId
    );

    if (
      konfliktniKopie.length > 0 &&
      typeof showToast === "function"
    ) {
      showToast(
        konfliktniKopie.length === 1
          ? "Obě verze poznámky byly zachovány"
          : `Zachovány obě verze ${konfliktniKopie.length} poznámek`
      );
    }

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

      if (
        lokalniStavSeBehemSyncuZmenil(
          revizeLokalnihoStavuPriStartu
        )
      ) {
        odlozOpakovaniSynchronizace();
        return false;
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
          !konfliktniId.has(note.id) &&
          (
            !cloudRow ||
            vynutitLocalId.has(note.id) ||
            !jeSifrovanyCloudSecretRow(cloudRow) ||
            noteTime > cloudTime
          )
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

    if (
      lokalniStavSeBehemSyncuZmenil(
        revizeLokalnihoStavuPriStartu
      )
    ) {
      odlozOpakovaniSynchronizace();
      return false;
    }

    /*
     * Probíhající starší sync nesmí během hromadného výběru
     * překreslit celý seznam karet pod prstem uživatele.
     */
    if (
      typeof rezimVyberuKaret !== "undefined" &&
      rezimVyberuKaret === true
    ) {
      odlozOpakovaniSynchronizace();
      return false;
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

    return true;
  })();

  try {
    const vysledek = await probihajiciSync;

    if (vysledek === true) {
      nastavKoncovyStavSynchronizaceUI();
    }

    return vysledek;
  } catch (error) {
    if (jeChybaOdeprenehoPristupu(error)) {
      oznamOdeprenyPristupUctu(error);
    }

    if (aktivniKonfliktySyncu.size > 0) {
      nastavStavSynchronizaceUI("conflict");
    } else {
      nastavStavSynchronizaceUI("restore");
    }

    throw error;
  } finally {
    probihajiciSync = null;
  }
}

function oznamObsahPripravenyProSplash() {
  window.dispatchEvent(
    new CustomEvent("lubanote:splash-ready")
  );
}

async function startSync() {
  /*
   * Splash nesmíme zavřít po neautentizovaném pokusu o sync.
   * Při obnovení session přijde lubanote:auth-valid a start se
   * zopakuje už s platným uživatelem.
   */
  const user = await getCurrentUser();

  if (!user) {
    oznamChybejiciOnlineSession();
    return false;
  }

  const poznamkySynchronizovany = await syncNotes();

  if (poznamkySynchronizovany !== true) {
    return false;
  }

  nastavStavSynchronizaceUI("syncing");

  /*
   * Onboarding se spouští až PO prvním bezpečném syncu. Server tak ví,
   * zda je účet opravdu nový a čistý. Pokud právě vytvořil uvítací
   * poznámku, provedeme ještě jeden sync před skrytím splash screenu,
   * aby uživatel nikdy neviděl nejdřív prázdnou aplikaci.
   */
  if (
    typeof window.LubaNoteOnboarding
      ?.zajistiUvitaciPoznamku === "function"
  ) {
    try {
      const onboarding =
        await window.LubaNoteOnboarding
          .zajistiUvitaciPoznamku();

      if (onboarding?.created === true) {
        const uvodSynchronizovan = await syncNotes();

        if (uvodSynchronizovan !== true) {
          return false;
        }
      }
    } catch (error) {
      /*
       * Onboarding nesmí zablokovat už existující účet ani základní
       * synchronizaci. Server si stav pamatuje a pokus může zopakovat
       * při dalším bezpečném startu.
       */
      console.warn(
        "Uvítací poznámka se dokončí později:",
        error
      );
    }
  }

  if (
    typeof window.LubaNoteRecurring
      ?.migrujStareOpakovaniPlanneru ===
    "function"
  ) {
    await window.LubaNoteRecurring
      .migrujStareOpakovaniPlanneru();
  }

  await loadTagsFromSupabase();

  /*
   * Tohle je skutečný konec VIZUÁLNÍ inicializace poznámek:
   * syncNotes() už vykreslil finální poznámky a loadTagsFromSupabase()
   * je znovu překreslil se správnými barvami štítků. Teprve teď
   * smí zmizet splash. Servisní úlohy níže mohou doběhnout na pozadí.
   */
  oznamObsahPripravenyProSplash();

  await registerCurrentDevice();
  await cleanupSafeDeletedNotes();

  if (
    typeof obnovNotifikaceOpakovanychPoznamek ===
    "function"
  ) {
    await obnovNotifikaceOpakovanychPoznamek();
  }

  nastavKoncovyStavSynchronizaceUI();

  /*
   * FÁZE B: obnova trvalé upload fronty je servisní úloha.
   * NESMÍ blokovat první vykreslení aplikace ani splash screen.
   *
   * Bezpečné pořadí attachment -> revize poznámky zůstává zachováno
   * přímo v uploadLocalNoteToSupabase(), kde se před serverovým
   * zápisem konkrétní poznámky stále čeká na její stínové přílohy.
   * Tohle je pouze dodatečné obnovení fronty po startu pro přílohy,
   * které už nepotřebují novou textovou revizi poznámky.
   */
  if (
    window.LubaNoteAttachmentsCloud
      ?.zpracujStinovePrilohyPoznamekVCloudu
  ) {
    setTimeout(() => {
      Promise.resolve(
        window.LubaNoteAttachmentsCloud
          .zpracujStinovePrilohyPoznamekVCloudu(
            getLocalNotesForSync()
          )
      ).catch((error) => {
        console.warn(
          "LubaNote attachments: obnovení stínové upload fronty se dokončí později.",
          error
        );
      });
    }, 0);
  }

  /*
   * FÁZE B – fyzický cleanup starých pending_delete attachmentů.
   * Spouští se AŽ po splash a s malým odkladem, takže neblokuje start.
   * Server vydá claim pouze attachmentům starším než 7 dní; samotný
   * soubor se maže přes Storage API a kvóta se uvolní až po potvrzení.
   */
  if (
    window.LubaNoteAttachmentsCloud
      ?.vycistiCloudovePrilohyPoProdleve
  ) {
    setTimeout(() => {
      Promise.resolve(
        window.LubaNoteAttachmentsCloud
          .vycistiCloudovePrilohyPoProdleve(20)
      ).catch((error) => {
        console.warn(
          "LubaNote attachments: fyzický cleanup se dokončí při některém dalším připojení.",
          error
        );
      });
    }, 1500);
  }

  return true;
}

let probihajiciStartSync = null;

/*
 * FRONTA LOKÁLNÍCH ZMĚN
 *
 * Lokální změny řadíme pouze mezi sebou. Na síť nečekají.
 * Souběh se syncem hlídá revize z storage.js: starý síťový
 * snapshot se při nové lokální změně zahodí a sync se zopakuje.
 */
let probihajiciLokalniZmena = null;
let lokalniZmenaRezervovana = false;
let synchronizaceOdlozenaKvuliLokalniZmene = false;
let frontaLokalnichZmen = Promise.resolve();
let casovacSynchronizacePoLokalniZmene = null;

function naplanujSynchronizaciPoLokalniZmene(
  zpozdeni = 350
) {
  clearTimeout(casovacSynchronizacePoLokalniZmene);

  casovacSynchronizacePoLokalniZmene =
    setTimeout(() => {
      casovacSynchronizacePoLokalniZmene = null;

      spustRychlySyncPoznamekBezpecne().catch(
        (error) => {
          console.warn(
            "Následná synchronizace lokální změny selhala:",
            error
          );
        }
      );
    }, Math.max(0, Number(zpozdeni) || 0));
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

  /*
   * Čekáme jen na PŘEDCHOZÍ LOKÁLNÍ změnu.
   * Na Supabase ani na právě běžící sync už UI nikdy nečeká.
   */
  await predchoziFronta;

  lokalniZmenaRezervovana = true;

  try {
    probihajiciLokalniZmena =
      Promise.resolve().then(akce);

    const vysledek =
      await probihajiciLokalniZmena;

    /*
     * Pokud souběžně běží starší sync, jeho revizní kontrola
     * zabrání přepsání této změny a po skončení se pustí nový sync.
     */
    if (
      probihajiciSync ||
      probihajiciStartSync
    ) {
      odlozOpakovaniSynchronizace();
    }

    return vysledek;
  } finally {
    probihajiciLokalniZmena = null;
    lokalniZmenaRezervovana = false;
    uvolniFrontu?.();
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

  if (navigator.onLine) {
    if (vyberKaretAktivni) {
      /*
       * Během výběru necháme UI v klidu.
       * ukonciRezimVyberuKaret() sync následně spustí.
       */
      odlozOpakovaniSynchronizace();
    } else {
      if (
        probihajiciStartSync ||
        probihajiciSync
      ) {
        odlozOpakovaniSynchronizace();
      }

      /*
       * Síť běží výhradně na pozadí a krátce se debouncuje.
       * Několik rychlých kliknutí tak nespustí několik synců za sebou.
       */
      naplanujSynchronizaciPoLokalniZmene(350);
    }
  }

  return vysledek;
}

async function spustRychlySyncPoznamekBezpecne() {
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

  /*
   * Pokud běží plný start sync, necháme ho doběhnout a pouze
   * označíme, že po něm má následovat čerstvý notes-only sync.
   */
  if (probihajiciStartSync) {
    odlozOpakovaniSynchronizace();
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
  }

  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient
  ) {
    return false;
  }

  try {
    const vysledek = await syncNotes();
    return vysledek === true;
  } catch (error) {
    console.warn(
      "Rychlá synchronizace poznámek byla odložena:",
      error
    );
    return false;
  }
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
        return (await startSync()) === true;
      } catch (error) {
        console.warn(
          "Synchronizace byla odložena:",
          error
        );

        if (aktivniKonfliktySyncu.size > 0) {
          nastavStavSynchronizaceUI("conflict");
        } else {
          nastavStavSynchronizaceUI("restore");
        }

        return false;
      }
    })();

  try {
    return await probihajiciStartSync;
  } finally {
    probihajiciStartSync = null;

    /*
     * Pokud během tohoto syncu přišla lokální změna, pustíme
     * po jeho skončení nový sync z čerstvého lokálního stavu.
     * V aktivním výběru počkáme až na jeho ukončení.
     */
    const vyberKaretAktivni =
      typeof rezimVyberuKaret !== "undefined" &&
      rezimVyberuKaret === true;

    if (
      synchronizaceOdlozenaKvuliLokalniZmene &&
      navigator.onLine &&
      !probihajiciLokalniZmena &&
      !lokalniZmenaRezervovana &&
      !vyberKaretAktivni
    ) {
      synchronizaceOdlozenaKvuliLokalniZmene = false;

      setTimeout(
        spustRychlySyncPoznamekBezpecne,
        120
      );
    }
  }
}

async function synchronizujPoznamkyTed(
  noteId = null
) {
  clearTimeout(
    casovacSynchronizacePoLokalniZmene
  );
  casovacSynchronizacePoLokalniZmene = null;

  try {
    await frontaLokalnichZmen;
  } catch {
    // Čerstvý sync níže sám ověří konzistenci.
  }

  if (!navigator.onLine) {
    return false;
  }

  /*
   * Pokud právě dobíhá starší sync/start-sync, nejdřív ho necháme
   * skončit. Jinak by syncNotes() pouze vrátil jeho starý Promise a
   * předání by mohlo chybně vyhodnotit starý snapshot jako finální.
   */
  if (probihajiciStartSync) {
    try {
      await probihajiciStartSync;
    } catch {
      // Potom stejně spustíme vlastní čerstvý notes sync.
    }
  }

  if (probihajiciSync) {
    try {
      await probihajiciSync;
    } catch {
      // Potom stejně spustíme vlastní čerstvý notes sync.
    }
  }

  try {
    await frontaLokalnichZmen;
  } catch {
    // Další sync rozhodne podle revize lokálního stavu.
  }

  /*
   * Dva pokusy pokryjí legitimní případ, kdy první čerstvý sync
   * zruší souběžná lokální změna jiného modulu. Aktivní editor je
   * během předání překrytý a už do něj uživatel dál nepíše.
   */
  for (let pokus = 0; pokus < 2; pokus += 1) {
    if (!navigator.onLine) {
      return false;
    }

    let vysledek = false;

    try {
      vysledek = await syncNotes();
    } catch (error) {
      console.warn(
        "Potvrzovací synchronizace editoru selhala:",
        error
      );
      vysledek = false;
    }

    if (
      vysledek === true &&
      (!noteId || !aktivniKonfliktySyncu.has(noteId))
    ) {
      return true;
    }

    try {
      await frontaLokalnichZmen;
    } catch {
      // Druhý pokus použije aktuální stav.
    }
  }

  return false;
}


window.LubaNoteSync = {
  spustBezpecne: spustStartSyncBezpecne,
  ziskejDeviceId: getDeviceId,
  spustRychle: spustRychlySyncPoznamekBezpecne,
  naplanujPoLokalniZmene:
    naplanujSynchronizaciPoLokalniZmene,
  provedLokalniZmenuBezKolizeSeSync,
  provedLokalniZmenuASynchronizuj,
  synchronizujPoznamkyTed,
  ziskejIdPoznamekEditovanychJinde,
  ziskejKonflikty: () =>
    Array.from(aktivniKonfliktySyncu.values()),
  ziskejCloudSyncMeta
};

let casovacSyncuPoAktivaci = null;

/*
 * Druhé zařízení nemusí stránku ručně obnovovat.
 * Jakmile se uživatel do LubaNote vrátí, stáhneme bezpečně
 * aktuální revize poznámek. Více událostí při jednom návratu
 * sloučíme do jediného síťového požadavku.
 */
function naplanujSyncPoAktivaci(
  zpozdeni = 180
) {
  clearTimeout(casovacSyncuPoAktivaci);

  casovacSyncuPoAktivaci =
    setTimeout(() => {
      casovacSyncuPoAktivaci = null;

      if (!navigator.onLine) {
        return;
      }

      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      spustRychlySyncPoznamekBezpecne()
        .catch((error) => {
          console.warn(
            "Synchronizace po návratu do aplikace byla odložena:",
            error
          );
        });
    }, Math.max(0, Number(zpozdeni) || 0));
}

/*
 * Offline start nikdy nečeká na síť.
 * Po návratu internetu se synchronizace spustí sama.
 */
spustStartSyncBezpecne();

/*
 * Obnovení Supabase session je asynchronní. Pokud první pokus syncu
 * proběhne dřív než auth knihovna obnoví uživatele, supabaseClient.js
 * po potvrzení session vyšle tuto událost a sync se spustí znovu.
 * Tím se běžné GIPA chová stejně jako čerstvé anonymní okno.
 */
window.addEventListener(
  "lubanote:auth-valid",
  () => {
    setTimeout(
      spustStartSyncBezpecne,
      0
    );
  }
);

window.addEventListener(
  "online",
  () => {
    setTimeout(
      spustStartSyncBezpecne,
      400
    );
  }
);

window.addEventListener(
  "focus",
  () => {
    naplanujSyncPoAktivaci();
  }
);

window.addEventListener(
  "pageshow",
  () => {
    naplanujSyncPoAktivaci();
  }
);

if (
  typeof document !== "undefined" &&
  typeof document.addEventListener === "function"
) {
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        naplanujSyncPoAktivaci();
      }
    }
  );
}
