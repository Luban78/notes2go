const SUPABASE_URL =
  "https://nwdacgigplofksexssws.supabase.co/";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c";

/*
 * OFFLINE-FIRST START LUBANOTE
 * ----------------------------
 * Supabase je synchronizace, ne podmínka pro otevření aplikace.
 * Knihovna se proto načítá až tehdy, když je internet dostupný.
 * Při offline startu se už dříve přihlášenému uživateli okamžitě
 * zobrazí lokální data a synchronizace se zkusí po návratu internetu.
 */
const LUBANOTE_AUTH_OK_KEY = "lubanoteAuthOk";
const LUBANOTE_AUTH_BLOCKED_KEY = "lubanoteAuthBlocked";
const LUBANOTE_LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";
const LUBANOTE_ACCESS_CACHE_KEY = "lubanoteAccessCacheV1";
const SUPABASE_PROJECT_REF = "nwdacgigplofksexssws";
const SUPABASE_AUTH_STORAGE_KEY =
  `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const SUPABASE_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/dist/umd/supabase.js";

/*
 * Do vydání s vlastní doménou používáme jako návrat po potvrzení
 * e-mailu veřejnou GitHub Pages adresu LubaNote. Nesmíme spoléhat
 * na obecnou Site URL Supabase, protože ta může skončit na kořeni
 * luban78.github.io místo /notes2go/.
 */
const LUBANOTE_AUTH_RETURN_PARAM =
  "lubanote_email_confirmed";

const LUBANOTE_AUTH_REDIRECT_URL =
  "https://luban78.github.io/notes2go/?lubanote_email_confirmed=1";

/*
 * Výsledek potvrzovacího e-mailu musíme rozlišit od skutečně
 * vypršelé Supabase session. Potvrzovací odkaz se může otevřít
 * v interním prohlížeči Gmailu / jiné e-mailové aplikace, kde
 * nejsou stejné auth údaje jako v původní kartě. Bez tohoto markeru
 * by LubaNote mohla chybně zobrazit hlášku o vypršené synchronizaci.
 */
function nactiAuthNavratZAdresy() {
  const url = new URL(window.location.href);
  const hash = String(url.hash || "");
  const hashParams = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );

  const potvrzenyEmail =
    url.searchParams.get(LUBANOTE_AUTH_RETURN_PARAM) === "1";

  const errorCode = String(
    url.searchParams.get("error_code") ||
    hashParams.get("error_code") ||
    ""
  ).trim();

  const maAuthChybu = Boolean(
    url.searchParams.get("error") ||
    hashParams.get("error") ||
    errorCode
  );

  let zmenenaAdresa = false;

  if (url.searchParams.has(LUBANOTE_AUTH_RETURN_PARAM)) {
    url.searchParams.delete(LUBANOTE_AUTH_RETURN_PARAM);
    zmenenaAdresa = true;
  }

  /*
   * Pokud jde o náš návrat po potvrzení e-mailu, uživatele stejně
   * necháme znovu přihlásit heslem. Případný PKCE kód / auth tokeny
   * proto nesmí zůstat viset v adresním řádku ani historii.
   */
  if (potvrzenyEmail) {
    for (const klic of [
      "code",
      "token",
      "token_hash",
      "type",
      "access_token",
      "refresh_token",
      "expires_in",
      "expires_at",
      "token_type"
    ]) {
      if (url.searchParams.has(klic)) {
        url.searchParams.delete(klic);
        zmenenaAdresa = true;
      }
    }

    if (
      url.hash &&
      (
        hashParams.has("access_token") ||
        hashParams.has("refresh_token") ||
        hashParams.has("type")
      )
    ) {
      url.hash = "";
      zmenenaAdresa = true;
    }
  }

  for (const klic of [
    "error",
    "error_code",
    "error_description"
  ]) {
    if (url.searchParams.has(klic)) {
      url.searchParams.delete(klic);
      zmenenaAdresa = true;
    }
  }

  if (maAuthChybu && url.hash) {
    url.hash = "";
    zmenenaAdresa = true;
  }

  if (zmenenaAdresa) {
    window.history.replaceState(
      null,
      document.title,
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  return {
    potvrzenyEmail,
    maAuthChybu,
    errorCode
  };
}

const lubanoteAuthNavrat = nactiAuthNavratZAdresy();

let supabaseClient = null;
let nacitaniSupabaseKnihovny = null;

function sCasovymLimitem(promise, timeoutMs, popis) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`${popis} překročil časový limit.`)
      );
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function existujePredchoziPrihlaseni() {
  /*
   * Pending / rejected / suspended účet nesmí použít offline-first
   * vstup do lokální aplikace jen proto, že Supabase drží session.
   */
  if (
    localStorage.getItem(LUBANOTE_AUTH_BLOCKED_KEY) === "1"
  ) {
    return false;
  }

  if (
    localStorage.getItem(LUBANOTE_AUTH_OK_KEY) === "1"
  ) {
    return true;
  }

  /*
   * Přechod pro instalace vytvořené před zavedením
   * LUBANOTE_AUTH_OK_KEY. Supabase má svou session v localStorage.
   * Nová registrace si vždy nastaví BLOCKED marker, takže tato
   * legacy větev pending účet nepropustí.
   */
  return Boolean(
    localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY)
  );
}

function oznacPredchoziPrihlaseni() {
  localStorage.setItem(
    LUBANOTE_AUTH_OK_KEY,
    "1"
  );
  localStorage.removeItem(
    LUBANOTE_AUTH_BLOCKED_KEY
  );
}

function oznacBlokovanePrihlaseni() {
  localStorage.removeItem(
    LUBANOTE_AUTH_OK_KEY
  );
  localStorage.setItem(
    LUBANOTE_AUTH_BLOCKED_KEY,
    "1"
  );
}

function zrusPredchoziPrihlaseni() {
  localStorage.removeItem(
    LUBANOTE_AUTH_OK_KEY
  );
  localStorage.removeItem(
    LUBANOTE_AUTH_BLOCKED_KEY
  );
}

function nactiLokalniCachePristupu() {
  const vlastnik = String(
    localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) || ""
  ).trim();

  if (!vlastnik) {
    return null;
  }

  try {
    const raw = localStorage.getItem(
      LUBANOTE_ACCESS_CACHE_KEY
    );

    if (!raw) {
      return null;
    }

    const stav = JSON.parse(raw);

    if (String(stav?.user_id || "") !== vlastnik) {
      return null;
    }

    return stav;
  } catch (error) {
    console.warn(
      "Lokální cache přístupu nebyla čitelná:",
      error
    );
    return null;
  }
}

function ulozLokalniCachePristupu(stav, userId) {
  const id = String(userId || "").trim();

  if (!id || !stav?.ok) {
    return;
  }

  try {
    localStorage.setItem(
      LUBANOTE_ACCESS_CACHE_KEY,
      JSON.stringify({
        user_id: id,
        account_status: stav.account_status || null,
        plan_id: stav.plan_id || null,
        plan_name: stav.plan_name || null,
        plan_active: stav.plan_active === true,
        data_access_active:
          typeof stav.data_access_active === "boolean"
            ? stav.data_access_active
            : null,
        demo_until: stav.demo_until || null,
        full_until: stav.full_until || null,
        note_limit:
          stav.note_limit !== null &&
          stav.note_limit !== undefined &&
          Number.isFinite(Number(stav.note_limit))
            ? Number(stav.note_limit)
            : null,
        checked_at: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn(
      "Lokální cache přístupu se nepodařila uložit:",
      error
    );
  }
}

function jeStavPristupuCasovePlatny(stav) {
  if (
    stav?.account_status !== "active" ||
    stav?.plan_active === false ||
    stav?.data_access_active === false
  ) {
    return false;
  }

  if (stav.plan_id === "internal") {
    return true;
  }

  if (stav.plan_id === "demo") {
    const konec = new Date(stav.demo_until || 0).getTime();
    return Number.isFinite(konec) && konec > Date.now();
  }

  if (stav.plan_id === "full") {
    if (!stav.full_until) {
      return true;
    }

    const konec = new Date(stav.full_until).getTime();
    return Number.isFinite(konec) && konec > Date.now();
  }

  return false;
}

function formatDatumPristupu(hodnota) {
  const datum = new Date(hodnota || 0);

  if (Number.isNaN(datum.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
      {
        day: "numeric",
        month: "numeric",
        year: "numeric"
      }
    ).format(datum);
  } catch (_) {
    return datum.toLocaleDateString();
  }
}

function doplnParametryTextu(text, parametry = {}) {
  return Object.entries(parametry).reduce(
    (vysledek, [klic, hodnota]) =>
      vysledek.replaceAll(`{${klic}}`, String(hodnota)),
    String(text || "")
  );
}

/*
 * PATCH 603 – FAIL-CLOSED OWNER GATE PRO STARÉ / NEÚPLNĚ OZNAČENÉ INSTALACE
 * -------------------------------------------------------------------------
 * Kritická zásada: chybějící lubanoteLocalOwnerUserId NIKDY neznamená,
 * že už přihlášený účet smí automaticky převzít existující savedTask.
 * Starší GitHub Pages / PWA instalace mohou obsahovat lokální karty ještě
 * z doby před zavedením owner markeru. Kdybychom owner slepě nastavili na
 * právě přihlášeného uživatele, lokální data jednoho účtu by se mohla
 * zobrazit pod jiným účtem ještě před synchronizací.
 *
 * Proto nejdřív hledáme jednoznačný userId v již existujících, uživatelsky
 * svázaných cache záznamech. Pokud se důkazy rozcházejí nebo žádný owner
 * nelze určit a zařízení přitom obsahuje reálná lokální data, přihlášení
 * se fail-closed zablokuje a nabídne se bezpečný reset zařízení.
 */
function nactiJsonLokalnihoKlice(klic) {
  try {
    const raw = localStorage.getItem(klic);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

/*
 * DIAG 604 – OWNER / ACCOUNT ISOLATION WATCH
 * ------------------------------------------
 * POUZE DIAGNOSTIKA. Tento blok nesmí měnit owner gate, sync ani obsah dat.
 * Zapisuje jen malé technické snapshoty do sessionStorage, aby šlo po startu
 * zjistit, proč se pod právě přihlášeným účtem zobrazila stará lokální cache.
 * Nikdy neukládá auth tokeny, hesla ani obsah poznámek.
 */
const LUBANOTE_OWNER_DIAG_SESSION_KEY =
  "lubanoteOwnerGateDiag604";
const LUBANOTE_OWNER_DIAG_MAX = 120;
let lubanoteOwnerDiagPamet = [];

function nactiOwnerDiagHistorii() {
  try {
    const raw = sessionStorage.getItem(
      LUBANOTE_OWNER_DIAG_SESSION_KEY
    );
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.slice(-LUBANOTE_OWNER_DIAG_MAX) : [];
  } catch (_error) {
    return [];
  }
}

lubanoteOwnerDiagPamet = nactiOwnerDiagHistorii();

function zapisOwnerDiag(typ, detail = {}) {
  const zaznam = {
    ts: new Date().toISOString(),
    ms: Math.round(performance.now()),
    typ: String(typ || "EVENT"),
    detail
  };

  lubanoteOwnerDiagPamet.push(zaznam);
  if (lubanoteOwnerDiagPamet.length > LUBANOTE_OWNER_DIAG_MAX) {
    lubanoteOwnerDiagPamet.splice(
      0,
      lubanoteOwnerDiagPamet.length - LUBANOTE_OWNER_DIAG_MAX
    );
  }

  try {
    sessionStorage.setItem(
      LUBANOTE_OWNER_DIAG_SESSION_KEY,
      JSON.stringify(lubanoteOwnerDiagPamet)
    );
  } catch (_error) {
    // Diagnostika nesmí ovlivnit běh aplikace.
  }
}

function shrnPoleOwnerDiag(klic) {
  const data = nactiJsonLokalnihoKlice(klic);
  const pole = Array.isArray(data) ? data : [];
  const ids = pole
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean);

  return {
    count: pole.length,
    cloudLike: pole.filter(
      (item) => String(item?.storageScope || "cloud") !== "local"
    ).length,
    local: pole.filter(
      (item) => String(item?.storageScope || "cloud") === "local"
    ).length,
    secret: pole.filter((item) => item?.isSecret === true).length,
    idsSample: ids.slice(0, 12)
  };
}

function ownerDiagZdrojovySnapshot() {
  const access = nactiJsonLokalnihoKlice(
    LUBANOTE_ACCESS_CACHE_KEY
  );
  const secret = nactiJsonLokalnihoKlice(
    "lubanoteSecretSettingsV1"
  );
  const localTags = nactiJsonLokalnihoKlice(
    "lubanoteLocalTagsV1"
  );
  const fastSync = nactiJsonLokalnihoKlice(
    "lubanotePrivateFastSyncStateV1"
  );
  const syncCursor = nactiJsonLokalnihoKlice(
    "lubanotePrivateSyncV2CursorV1"
  );
  const safeBootstrap = nactiJsonLokalnihoKlice(
    "lubanotePrivateSafeBootstrapV2V1"
  );
  const authStorage = nactiJsonLokalnihoKlice(
    SUPABASE_AUTH_STORAGE_KEY
  );
  const authUser =
    authStorage?.user ||
    authStorage?.currentSession?.user ||
    null;
  const cloudMeta = nactiJsonLokalnihoKlice(
    "lubanoteCloudSyncMetaV1"
  );
  const pending = nactiJsonLokalnihoKlice(
    "lubanotePendingDeletes"
  );

  return {
    ownerKey: String(
      localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) || ""
    ).trim() || null,
    authOk: localStorage.getItem(LUBANOTE_AUTH_OK_KEY),
    authBlocked: localStorage.getItem(LUBANOTE_AUTH_BLOCKED_KEY),
    authStorageUserId: String(authUser?.id || "").trim() || null,
    authStorageEmail: String(authUser?.email || "").trim() || null,
    accessCacheUserId: String(access?.user_id || "").trim() || null,
    secretUserId: String(
      secret?.userId || secret?.user_id || ""
    ).trim() || null,
    localTagsUserId: String(localTags?.userId || "").trim() || null,
    fastSyncUserId: String(fastSync?.userId || "").trim() || null,
    syncCursorUserId: String(syncCursor?.userId || "").trim() || null,
    safeBootstrapUserId: String(safeBootstrap?.userId || "").trim() || null,
    regularStorageMode:
      localStorage.getItem("lubanoteRegularNotesStorageModeV1") || "localStorage",
    savedTask: shrnPoleOwnerDiag("savedTask"),
    savedSecretTask: shrnPoleOwnerDiag("savedSecretTask"),
    localTagsCount: Array.isArray(localTags?.tags)
      ? localTags.tags.length
      : 0,
    cloudMetaCount:
      cloudMeta && typeof cloudMeta === "object" && !Array.isArray(cloudMeta)
        ? Object.keys(cloudMeta).length
        : 0,
    pendingDeletesCount: Array.isArray(pending)
      ? pending.length
      : pending && typeof pending === "object"
        ? Object.keys(pending).length
        : 0
  };
}

async function ownerDiagIndexedDbSnapshot() {
  const dbName = "LubaNoteRegularNotesCache";
  const storeName = "regularNotes";

  try {
    if (typeof indexedDB === "undefined") {
      return { supported: false };
    }

    if (typeof indexedDB.databases !== "function") {
      return {
        supported: true,
        databasesApi: false,
        skipped: "Nelze bezpečně zjistit existenci DB bez jejího vytvoření."
      };
    }

    const dbs = await indexedDB.databases();
    const exists = dbs.some((db) => db?.name === dbName);

    if (!exists) {
      return { supported: true, databasesApi: true, exists: false };
    }

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("IndexedDB open failed")
      );
    });

    try {
      if (!db.objectStoreNames.contains(storeName)) {
        return {
          supported: true,
          databasesApi: true,
          exists: true,
          storeExists: false
        };
      }

      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(
          request.error || new Error("IndexedDB read failed")
        );
      });

      return {
        supported: true,
        databasesApi: true,
        exists: true,
        storeExists: true,
        rows: rows.map((row) => ({
          ownerId: String(row?.ownerId || "").trim() || null,
          savedAt: row?.savedAt || null,
          noteCount: Array.isArray(row?.notes) ? row.notes.length : 0,
          cloudLike: Array.isArray(row?.notes)
            ? row.notes.filter(
                (note) => String(note?.storageScope || "cloud") !== "local"
              ).length
            : 0,
          local: Array.isArray(row?.notes)
            ? row.notes.filter(
                (note) => String(note?.storageScope || "cloud") === "local"
              ).length
            : 0,
          idsSample: Array.isArray(row?.notes)
            ? row.notes
                .map((note) => String(note?.id || "").trim())
                .filter(Boolean)
                .slice(0, 12)
            : []
        }))
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      supported: true,
      error: String(error?.message || error)
    };
  }
}

async function ownerDiagServerSnapshot() {
  try {
    if (!supabaseClient) {
      return { available: false, reason: "supabaseClient=null" };
    }

    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) {
      return {
        available: false,
        reason: `session-error: ${sessionError.message || sessionError}`
      };
    }

    const user = sessionData?.session?.user || null;
    if (!user?.id) {
      return { available: false, reason: "no-session" };
    }

    const { data, error } = await supabaseClient.rpc(
      "lubanote_get_private_bootstrap_manifest"
    );

    if (error) {
      return {
        available: true,
        userId: user.id,
        email: user.email || null,
        manifestError: String(error.message || error)
      };
    }

    const rows = Array.isArray(data) ? data : [];
    const liveIds = new Set(
      rows
        .filter((row) => !row?.deleted_at)
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean)
    );
    const saved = nactiJsonLokalnihoKlice("savedTask");
    const notes = Array.isArray(saved) ? saved : [];
    const cloudLikeIds = notes
      .filter(
        (note) => String(note?.storageScope || "cloud") !== "local"
      )
      .map((note) => String(note?.id || "").trim())
      .filter(Boolean);
    const localIds = notes
      .filter(
        (note) => String(note?.storageScope || "cloud") === "local"
      )
      .map((note) => String(note?.id || "").trim())
      .filter(Boolean);
    const cloudLikeOnServer = cloudLikeIds.filter((id) => liveIds.has(id));
    const cloudLikeMissing = cloudLikeIds.filter((id) => !liveIds.has(id));
    const localUnexpectedOnServer = localIds.filter((id) => liveIds.has(id));

    return {
      available: true,
      userId: user.id,
      email: user.email || null,
      manifestRows: rows.length,
      manifestLive: liveIds.size,
      manifestDeleted: rows.filter((row) => row?.deleted_at).length,
      savedCloudLike: cloudLikeIds.length,
      savedLocal: localIds.length,
      cloudLikeOnCurrentAccount: cloudLikeOnServer.length,
      cloudLikeMissingFromCurrentAccount: cloudLikeMissing.length,
      cloudLikeMissingSample: cloudLikeMissing.slice(0, 12),
      localUnexpectedOnCurrentAccount: localUnexpectedOnServer.length,
      localUnexpectedSample: localUnexpectedOnServer.slice(0, 12)
    };
  } catch (error) {
    return {
      available: false,
      reason: String(error?.message || error)
    };
  }
}

async function vytvorOwnerDiagSnapshot() {
  return {
    local: ownerDiagZdrojovySnapshot(),
    indexedDb: await ownerDiagIndexedDbSnapshot(),
    server: await ownerDiagServerSnapshot(),
    events: lubanoteOwnerDiagPamet.slice()
  };
}

window.LubaNoteOwnerGateDiag = Object.freeze({
  events: () => lubanoteOwnerDiagPamet.slice(),
  localSnapshot: () => ownerDiagZdrojovySnapshot(),
  snapshot: () => vytvorOwnerDiagSnapshot(),
  clear: () => {
    lubanoteOwnerDiagPamet.length = 0;
    try {
      sessionStorage.removeItem(
        LUBANOTE_OWNER_DIAG_SESSION_KEY
      );
    } catch (_error) {
      // Diagnostika nesmí ovlivnit běh aplikace.
    }
  }
});

function ziskejDukazyVlastnikaLokalnichDat() {
  const ids = new Set();

  const pridej = (hodnota) => {
    const id = String(hodnota || "").trim();
    if (id) ids.add(id);
  };

  const access = nactiJsonLokalnihoKlice(
    LUBANOTE_ACCESS_CACHE_KEY
  );
  pridej(access?.user_id);

  const secret = nactiJsonLokalnihoKlice(
    "lubanoteSecretSettingsV1"
  );
  pridej(secret?.userId || secret?.user_id);

  const localTags = nactiJsonLokalnihoKlice(
    "lubanoteLocalTagsV1"
  );
  pridej(localTags?.userId);

  const fastSync = nactiJsonLokalnihoKlice(
    "lubanotePrivateFastSyncStateV1"
  );
  pridej(fastSync?.userId);

  const syncCursor = nactiJsonLokalnihoKlice(
    "lubanotePrivateSyncV2CursorV1"
  );
  pridej(syncCursor?.userId);

  const safeBootstrap = nactiJsonLokalnihoKlice(
    "lubanotePrivateSafeBootstrapV2V1"
  );
  pridej(safeBootstrap?.userId);

  return Array.from(ids);
}

function maNenulovaLokalniDataBezVlastnika() {
  const maNeprazdnePole = (klic) => {
    const hodnota = nactiJsonLokalnihoKlice(klic);
    return Array.isArray(hodnota) && hodnota.length > 0;
  };

  if (
    maNeprazdnePole("savedTask") ||
    maNeprazdnePole("savedSecretTask") ||
    maNeprazdnePole("plannedItems")
  ) {
    return true;
  }

  const localTags = nactiJsonLokalnihoKlice(
    "lubanoteLocalTagsV1"
  );
  if (
    Array.isArray(localTags?.tags) &&
    localTags.tags.length > 0
  ) {
    return true;
  }

  const cloudMeta = nactiJsonLokalnihoKlice(
    "lubanoteCloudSyncMetaV1"
  );
  if (
    cloudMeta &&
    typeof cloudMeta === "object" &&
    Object.keys(cloudMeta).length > 0
  ) {
    return true;
  }

  const pendingDeletes = nactiJsonLokalnihoKlice(
    "lubanotePendingDeletes"
  );
  if (
    (Array.isArray(pendingDeletes) && pendingDeletes.length > 0) ||
    (
      pendingDeletes &&
      typeof pendingDeletes === "object" &&
      !Array.isArray(pendingDeletes) &&
      Object.keys(pendingDeletes).length > 0
    )
  ) {
    return true;
  }

  /* IndexedDB overflow znamená, že plná sada běžných poznámek může být
     mimo localStorage. I samotný marker proto bereme jako reálná data. */
  if (
    localStorage.getItem(
      "lubanoteRegularNotesStorageModeV1"
    ) === "indexeddb"
  ) {
    return true;
  }

  return false;
}

function overNeboNastavVlastnikaLokalnichDat(userId) {
  const id = String(userId || "").trim();

  if (!id) {
    zapisOwnerDiag("OWNER_GATE_RESULT", {
      result: false,
      reason: "missing-user-id",
      state: ownerDiagZdrojovySnapshot()
    });
    return false;
  }

  const ulozeny = String(
    localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) || ""
  ).trim();
  const dukazy = ziskejDukazyVlastnikaLokalnichDat();

  zapisOwnerDiag("OWNER_GATE_CALL", {
    currentUserId: id,
    ownerBefore: ulozeny || null,
    evidence: dukazy.slice(),
    state: ownerDiagZdrojovySnapshot()
  });

  if (ulozeny) {
    /* I existující owner marker nesmí přebít starší cache, která jasně
       patří jinému účtu. Takový stav je považován za konflikt a UI se
       nesmí otevřít. */
    const konflikt = dukazy.some(
      (dukaz) => dukaz !== ulozeny
    );

    if (konflikt) {
      console.error(
        "LubaNote owner gate: konfliktní lokální provenance; aplikace zůstává zamčená.",
        { owner: ulozeny, evidence: dukazy }
      );
      zapisOwnerDiag("OWNER_GATE_RESULT", {
        result: false,
        reason: "stored-owner-conflicts-with-evidence",
        currentUserId: id,
        owner: ulozeny,
        evidence: dukazy.slice()
      });
      return false;
    }

    const shoda = ulozeny === id;
    zapisOwnerDiag("OWNER_GATE_RESULT", {
      result: shoda,
      reason: shoda ? "stored-owner-matches-current" : "stored-owner-differs-current",
      currentUserId: id,
      owner: ulozeny,
      evidence: dukazy.slice()
    });
    return shoda;
  }

  if (dukazy.length > 1) {
    console.error(
      "LubaNote owner gate: lokální cache obsahují více různých vlastníků; aplikace zůstává zamčená.",
      { evidence: dukazy }
    );
    zapisOwnerDiag("OWNER_GATE_RESULT", {
      result: false,
      reason: "multiple-evidence-owners",
      currentUserId: id,
      evidence: dukazy.slice()
    });
    return false;
  }

  if (dukazy.length === 1) {
    const migrovanyOwner = dukazy[0];

    localStorage.setItem(
      LUBANOTE_LOCAL_OWNER_KEY,
      migrovanyOwner
    );

    const shoda = migrovanyOwner === id;
    zapisOwnerDiag("OWNER_GATE_RESULT", {
      result: shoda,
      reason: shoda ? "migrated-evidence-owner-matches-current" : "migrated-evidence-owner-differs-current",
      currentUserId: id,
      migratedOwner: migrovanyOwner,
      evidence: dukazy.slice()
    });
    return shoda;
  }

  if (maNenulovaLokalniDataBezVlastnika()) {
    console.error(
      "LubaNote owner gate: zařízení obsahuje lokální data bez jednoznačného vlastníka; automatické převzetí je zakázané."
    );
    zapisOwnerDiag("OWNER_GATE_RESULT", {
      result: false,
      reason: "local-data-without-owner-evidence",
      currentUserId: id,
      state: ownerDiagZdrojovySnapshot()
    });
    return false;
  }

  /* Pouze skutečně prázdná instalace smí dostat owner = aktuální účet. */
  localStorage.setItem(
    LUBANOTE_LOCAL_OWNER_KEY,
    id
  );
  zapisOwnerDiag("OWNER_GATE_RESULT", {
    result: true,
    reason: "empty-install-owner-assigned-current",
    currentUserId: id
  });
  return true;
}

function migrujVlastnikaZeStavajiciSession() {
  if (localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY)) {
    return;
  }

  try {
    const dukazy = ziskejDukazyVlastnikaLokalnichDat();

    if (dukazy.length === 1) {
      localStorage.setItem(
        LUBANOTE_LOCAL_OWNER_KEY,
        dukazy[0]
      );
      return;
    }

    /* Konfliktní cache se nesmí "opravit" přepsáním ownera session ID. */
    if (dukazy.length > 1) {
      return;
    }

    if (
      localStorage.getItem(LUBANOTE_AUTH_OK_KEY) !== "1"
    ) {
      return;
    }

    const raw = localStorage.getItem(
      SUPABASE_AUTH_STORAGE_KEY
    );

    if (!raw) {
      return;
    }

    const session = JSON.parse(raw);
    const userId = String(
      session?.user?.id ||
      session?.currentSession?.user?.id ||
      ""
    ).trim();

    /* Legacy session smí ownera doplnit jen tehdy, když zařízení nemá
       žádná lokální data bez vlastníka. Jinak raději fail-closed. */
    if (
      userId &&
      !maNenulovaLokalniDataBezVlastnika()
    ) {
      localStorage.setItem(
        LUBANOTE_LOCAL_OWNER_KEY,
        userId
      );
    }
  } catch (error) {
    console.warn(
      "Migrace vlastníka lokálních dat byla přeskočena:",
      error
    );
  }
}

zapisOwnerDiag("BOOT_BEFORE_LEGACY_OWNER_MIGRATION", ownerDiagZdrojovySnapshot());
migrujVlastnikaZeStavajiciSession();
zapisOwnerDiag("BOOT_AFTER_LEGACY_OWNER_MIGRATION", ownerDiagZdrojovySnapshot());

function vytvorSupabaseClientPokudLze() {
  if (supabaseClient) {
    return true;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    return false;
  }

  supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          /*
           * PATCH 478 – centrální měření Supabase HTTP payloadů.
           * Měření nesmí měnit chování klienta; pokud modul není
           * dostupný, použije se beze změny nativní fetch.
           */
          fetch:
            window.LubaNoteSyncTraffic?.fetch ||
            window.fetch.bind(window)
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );

  window.dispatchEvent(
    new CustomEvent("lubanote:supabase-ready")
  );

  return true;
}

async function pripravSupabaseClient() {
  if (vytvorSupabaseClientPokudLze()) {
    return true;
  }

  if (!navigator.onLine) {
    return false;
  }

  if (nacitaniSupabaseKnihovny) {
    return nacitaniSupabaseKnihovny;
  }

  nacitaniSupabaseKnihovny =
    new Promise((resolve) => {
      const existujiciScript =
        document.getElementById("supabaseRuntimeScript");

      if (existujiciScript) {
        existujiciScript.remove();
      }

      const script =
        document.createElement("script");

      script.id = "supabaseRuntimeScript";
      script.src = SUPABASE_LIBRARY_URL;
      script.async = true;

      const timeoutId = setTimeout(() => {
        script.remove();
        resolve(false);
      }, 7000);

      script.addEventListener(
        "load",
        () => {
          clearTimeout(timeoutId);
          resolve(
            vytvorSupabaseClientPokudLze()
          );
        },
        { once: true }
      );

      script.addEventListener(
        "error",
        () => {
          clearTimeout(timeoutId);
          script.remove();
          resolve(false);
        },
        { once: true }
      );

      document.head.appendChild(script);
    }).finally(() => {
      nacitaniSupabaseKnihovny = null;
    });

  return nacitaniSupabaseKnihovny;
}

async function getCurrentUser() {
  if (!navigator.onLine) {
    return null;
  }

  const pripraven =
    await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    return null;
  }

  try {
    /*
     * Při obnovené Supabase session po startu aplikace
     * může getUser() krátce vrátit null / selhat dřív, než
     * se dokončí obnova auth stavu. getSession() ale už v tu
     * chvíli obsahuje lokálně obnoveného uživatele.
     *
     * Právě to způsobovalo, že GIPA i čerstvě spuštěná APK
     * po restartu nenačetly štítky ani nespustily sync, ale
     * po odhlášení a novém přihlášení vše fungovalo.
     */
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Načtení přihlášené session"
    );

    if (session?.user) {
      return session.user;
    }

    /*
     * Fallback pro čerstvé přihlášení / neobvyklý stav.
     */
    const {
      data: { user }
    } = await sCasovymLimitem(
      supabaseClient.auth.getUser(),
      5000,
      "Ověření uživatele"
    );

    return user || null;
  } catch (error) {
    console.warn(
      "User check skipped:",
      error.message
    );
    return null;
  }
}

const loginScreen =
  document.getElementById("loginScreen");

const loginForm =
  document.getElementById("loginForm");

const loginModeSwitch =
  document.getElementById("loginModeSwitch");

const loginModeSignIn =
  document.getElementById("loginModeSignIn");

const loginModeRegister =
  document.getElementById("loginModeRegister");

const loginTitle =
  document.getElementById("loginTitle");

const loginCredentialsFields =
  document.getElementById("loginCredentialsFields");

const loginEmail =
  document.getElementById("loginEmail");

const loginPassword =
  document.getElementById("loginPassword");

const loginPasswordConfirm =
  document.getElementById("loginPasswordConfirm");

const loginButton =
  document.getElementById("loginButton");

const loginMessage =
  document.getElementById("loginMessage");

const localOwnerResetActions =
  document.getElementById("localOwnerResetActions");

const localOwnerResetButton =
  document.getElementById("localOwnerResetButton");

const localDeviceResetModal =
  document.getElementById("localDeviceResetModal");

const localDeviceResetCancel =
  document.getElementById("localDeviceResetCancel");

const localDeviceResetConfirm =
  document.getElementById("localDeviceResetConfirm");

const accountStatusPanel =
  document.getElementById("accountStatusPanel");

const accountStatusText =
  document.getElementById("accountStatusText");

const accountStatusRefresh =
  document.getElementById("accountStatusRefresh");

const accountStatusSignOut =
  document.getElementById("accountStatusSignOut");

const expiredDemoDataActions =
  document.getElementById("expiredDemoDataActions");

const accountStatusDownloadData =
  document.getElementById("accountStatusDownloadData");

const accountStatusDeleteData =
  document.getElementById("accountStatusDeleteData");

const expiredDemoDeleteModal =
  document.getElementById("expiredDemoDeleteModal");

const expiredDemoDeleteCancel =
  document.getElementById("expiredDemoDeleteCancel");

const expiredDemoDeleteConfirm =
  document.getElementById("expiredDemoDeleteConfirm");

const expiredDemoDeleteProgress =
  document.getElementById("expiredDemoDeleteProgress");

const accountPlanMenuInfo =
  document.getElementById("accountPlanMenuInfo");

const accountPlanMenuText =
  document.getElementById("accountPlanMenuText");

let aktualniRezimAuth = "login";
let aktualniStavUctu = null;
let aktualniPristupUctu = null;
let posledniLimitModalAt = 0;

/* PATCH 586 – živý příznak, že účet prošel aktuální kontrolou přístupu.
   Local režim ho používá jen jako bezpečnou bránu pro zobrazení appky
   bez obsahového syncu. Nejde o náhradu serverové kontroly účtu. */
let aktivniUcetPotvrzenProTentoBeh = false;

/* PATCH 612 – přesný hlídač konce časově omezeného Dema. */
let casovacKonceDema612 = null;
let kontrolaKonceDemaBezi612 = false;

/* PATCH 556 – aktivní účet bez hlavního šifrovacího hesla se
   nepustí do aplikace. Kontext držíme jen v paměti do dokončení
   povinného onboardingu. */
let cekajiciPovinneHlavniHeslo = null;

function tAuth(klic, zaloha = "") {
  return window.LubaNoteI18n?.t?.(klic, zaloha) || zaloha || klic;
}

function jeVyprseleDemo612(stav) {
  if (
    stav?.account_status !== "active" ||
    stav?.plan_id !== "demo"
  ) {
    return false;
  }

  const konec = new Date(stav.demo_until || 0).getTime();
  return Number.isFinite(konec) && konec <= Date.now();
}

function aktualizujPostDemoAkce612(stav) {
  const zobrazit = jeVyprseleDemo612(stav);

  if (expiredDemoDataActions) {
    expiredDemoDataActions.hidden = !zobrazit;
  }

  document.body.classList.toggle(
    "demoExpiredReadOnly",
    zobrazit
  );

  if (!zobrazit && expiredDemoDeleteModal) {
    expiredDemoDeleteModal.hidden = true;
    expiredDemoDeleteModal.setAttribute("aria-hidden", "true");
  }
}

function zrusCasovacKonceDema612() {
  if (casovacKonceDema612 !== null) {
    clearTimeout(casovacKonceDema612);
    casovacKonceDema612 = null;
  }
}

function zobrazVyprseniDemaBezReloadu612() {
  if (!jeVyprseleDemo612(aktualniPristupUctu)) {
    return false;
  }

  zrusCasovacKonceDema612();
  aktivniUcetPotvrzenProTentoBeh = false;
  oznacBlokovanePrihlaseni();

  /*
   * Stejný signál jako při vypršení auth session zastaví Realtime,
   * chat/shared polling i sync UI. Auth session samotnou ale nemažeme –
   * je potřeba pro read-only export a dobrovolné smazání vlastních dat.
   */
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-expired")
  );

  zobrazStavUctu({
    ...aktualniPristupUctu,
    account_status: "active"
  });

  oznamSplashPripravenyBezCloudovehoStartu();
  return true;
}

function naplanujKonecDema612(stav = aktualniPristupUctu) {
  zrusCasovacKonceDema612();

  if (
    stav?.account_status !== "active" ||
    stav?.plan_id !== "demo"
  ) {
    return;
  }

  const konec = new Date(stav.demo_until || 0).getTime();

  if (!Number.isFinite(konec)) {
    return;
  }

  const zbyva = konec - Date.now();

  if (zbyva <= 0) {
    queueMicrotask(zobrazVyprseniDemaBezReloadu612);
    return;
  }

  /* setTimeout má praktický strop ~24,8 dne; Demo je kratší, ale guard
     zachová správné chování i kdyby se tarif později změnil. */
  const dalsiKontrola = Math.min(zbyva + 80, 2147480000);

  casovacKonceDema612 = setTimeout(() => {
    if (!zobrazVyprseniDemaBezReloadu612()) {
      naplanujKonecDema612(aktualniPristupUctu);
    }
  }, dalsiKontrola);
}

async function zkontrolujKonecDemaPriNavratu612() {
  if (kontrolaKonceDemaBezi612) {
    return;
  }

  if (!aktualniPristupUctu || aktualniPristupUctu.plan_id !== "demo") {
    return;
  }

  if (zobrazVyprseniDemaBezReloadu612()) {
    return;
  }

  /*
   * Při návratu z backgroundu respektujeme lokální autoritativní deadline.
   * Pokud ještě nevypršel, jen znovu naplánujeme přesný timer. Serverový
   * stav se dál ověřuje běžnými account kontrolami – nevyrábíme extra egress.
   */
  kontrolaKonceDemaBezi612 = true;
  try {
    naplanujKonecDema612(aktualniPristupUctu);
  } finally {
    kontrolaKonceDemaBezi612 = false;
  }
}

function aktualizujInfoPlanuVMenu(stav = aktualniPristupUctu) {
  if (!accountPlanMenuInfo || !accountPlanMenuText) {
    return;
  }

  if (
    stav?.account_status === "active" &&
    stav?.plan_id === "demo" &&
    jeStavPristupuCasovePlatny(stav)
  ) {
    const datum = formatDatumPristupu(stav.demo_until);
    const vzor = tAuth(
      "account.demoUntil",
      "Demo do {date}"
    );

    accountPlanMenuText.textContent =
      doplnParametryTextu(vzor, { date: datum });
    accountPlanMenuInfo.hidden = false;
    return;
  }

  accountPlanMenuInfo.hidden = true;
  accountPlanMenuText.textContent = "";
}

function zkontrolujLimitNovePoznamky() {
  const rawLimit = aktualniPristupUctu?.note_limit;

  if (rawLimit === null || rawLimit === undefined) {
    return {
      dosazen: false,
      noteLimit: null,
      currentCount: null
    };
  }

  const limit = Number(rawLimit);

  if (!Number.isFinite(limit) || limit < 0) {
    return {
      dosazen: false,
      noteLimit: null,
      currentCount: null
    };
  }

  const currentCount = Number(
    window.LubaNoteStorageState
      ?.spocitejPoznamkyProLimit?.()
  );

  if (!Number.isFinite(currentCount)) {
    return {
      dosazen: false,
      noteLimit: limit,
      currentCount: null
    };
  }

  return {
    dosazen: currentCount >= limit,
    noteLimit: limit,
    currentCount
  };
}

function zobrazLimitPoznamek(detail = {}) {
  const ted = Date.now();

  if (ted - posledniLimitModalAt < 2500) {
    return;
  }

  posledniLimitModalAt = ted;

  const detailLimit = detail.noteLimit;
  const accessLimit = aktualniPristupUctu?.note_limit;

  const limit =
    detailLimit !== null &&
    detailLimit !== undefined &&
    Number.isFinite(Number(detailLimit))
      ? Number(detailLimit)
      : accessLimit !== null &&
          accessLimit !== undefined &&
          Number.isFinite(Number(accessLimit))
        ? Number(accessLimit)
        : 100;

  const title = tAuth(
    "limits.notesTitle",
    "Limit poznámek dosažen"
  );

  const text = doplnParametryTextu(
    tAuth(
      "limits.notesText",
      "Tvůj plán umožňuje maximálně {limit} poznámek. Novou poznámku teď nelze bezpečně uložit. Tvoje stávající data zůstávají zachována."
    ),
    { limit }
  );

  if (typeof zobrazZpravuAplikace === "function") {
    zobrazZpravuAplikace(title, text);
    return;
  }

  console.warn(title, text);
}

function setLoginMessage(message = "", isError = false) {
  delete loginMessage.dataset.i18nKey;
  loginMessage.dataset.i18nSource = message;
  loginMessage.textContent =
    window.LubaNoteI18n?.prelozText?.(message) || message;
  loginMessage.classList.toggle("error", isError);
}

function setLoginMessageKey(
  klic,
  zaloha,
  isError = false
) {
  loginMessage.dataset.i18nKey = klic;
  loginMessage.dataset.i18nSource = "";
  loginMessage.textContent = tAuth(klic, zaloha);
  loginMessage.classList.toggle("error", isError);
}

function oznamPlatnePrihlaseni() {
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-valid")
  );
}

function oznamSplashPripravenyBezCloudovehoStartu() {
  window.dispatchEvent(
    new CustomEvent("lubanote:splash-ready")
  );
}

function nastavRezimAuth(
  rezim,
  { zachovatZpravu = false } = {}
) {
  aktualniRezimAuth =
    rezim === "register" ? "register" : "login";

  const registrace = aktualniRezimAuth === "register";

  loginModeSignIn.classList.toggle("active", !registrace);
  loginModeRegister.classList.toggle("active", registrace);

  loginModeSignIn.setAttribute(
    "aria-selected",
    String(!registrace)
  );
  loginModeRegister.setAttribute(
    "aria-selected",
    String(registrace)
  );

  loginPasswordConfirm.hidden = !registrace;
  loginPasswordConfirm.disabled = !registrace;

  loginEmail.name = registrace ? "email" : "username";
  loginPassword.name = registrace
    ? "new-password"
    : "password";

  loginEmail.setAttribute(
    "autocomplete",
    registrace ? "email" : "username"
  );

  loginPassword.setAttribute(
    "autocomplete",
    registrace ? "new-password" : "current-password"
  );

  loginPasswordConfirm.setAttribute(
    "autocomplete",
    "new-password"
  );

  if (!registrace) {
    loginPasswordConfirm.value = "";
  }

  aktualizujAuthTexty();

  if (!zachovatZpravu) {
    setLoginMessage();
  }
}

function textStavuUctu(stav) {
  if (
    stav?.account_status === "active" &&
    stav?.plan_id === "demo" &&
    !jeStavPristupuCasovePlatny(stav)
  ) {
    const datum = formatDatumPristupu(stav.demo_until);

    return {
      title: tAuth(
        "login.demoExpiredTitle",
        "Demo skončilo"
      ),
      text: doplnParametryTextu(
        tAuth(
          "login.demoExpiredText",
          "Tvoje Demo skončilo {date}. Všechna data zůstávají bezpečně uložená. Pro další používání bude potřeba aktivovat plnou verzi LubaNote."
        ),
        { date: datum }
      )
    };
  }

  if (
    stav?.account_status === "active" &&
    stav?.plan_id === "full" &&
    !jeStavPristupuCasovePlatny(stav)
  ) {
    return {
      title: tAuth(
        "login.fullExpiredTitle",
        "Přístup k plné verzi skončil"
      ),
      text: tAuth(
        "login.fullExpiredText",
        "Tvoje data zůstávají bezpečně uložená. Po obnovení plné verze se LubaNote znovu odemkne."
      )
    };
  }

  switch (stav?.account_status) {
    case "pending":
      return {
        title: tAuth(
          "login.pendingTitle",
          "Účet čeká na schválení"
        ),
        text: tAuth(
          "login.pendingText",
          "Registrace je hotová. Až správce účet schválí, LubaNote se odemkne."
        )
      };

    case "rejected":
      return {
        title: tAuth(
          "login.rejectedTitle",
          "Registrace nebyla schválena"
        ),
        text: tAuth(
          "login.rejectedText",
          "Tento účet nebyl schválen."
        )
      };

    case "suspended":
      return {
        title: tAuth(
          "login.suspendedTitle",
          "Účet je pozastavený"
        ),
        text: tAuth(
          "login.suspendedText",
          "Přístup k LubaNote je dočasně pozastavený."
        )
      };

    default:
      return {
        title: tAuth(
          "login.unavailableTitle",
          "Účet není dostupný"
        ),
        text: tAuth(
          "login.unavailableText",
          "Přístup k účtu se nepodařilo ověřit. Zkus kontrolu znovu."
        )
      };
  }
}

function aktualizujAuthTexty() {
  if (!accountStatusPanel.hidden && aktualniStavUctu) {
    const texty = textStavuUctu(aktualniStavUctu);
    loginTitle.textContent = texty.title;
    accountStatusText.textContent = texty.text;
    return;
  }

  const registrace = aktualniRezimAuth === "register";

  loginTitle.textContent = registrace
    ? tAuth("login.registerTitle", "Registrace")
    : tAuth("login.title", "Přihlášení");

  loginButton.textContent = registrace
    ? tAuth("login.registerSubmit", "Registrovat")
    : tAuth("login.submit", "Přihlásit se");
}

async function zobrazLokalniAplikaci() {
  /*
   * Pokud localStorage na tomto zařízení nestačil, storage.js drží
   * plnou běžnou cache v IndexedDB a v localStorage jen lehký bootstrap.
   * Než odstraníme privacy lock, počkáme na plnou cache a skryté UI
   * překreslíme. Na běžném Androidu/PC je tato větev okamžitý no-op.
   */
  try {
    const plnaCachePripravena =
      await window.LubaNoteRegularNotesStore
        ?.priprav?.();

    if (plnaCachePripravena === true) {
      if (typeof renderTasks === "function") {
        renderTasks();
      }

      if (typeof renderRemindersScreen === "function") {
        renderRemindersScreen();
      }

      if (typeof renderCalendar === "function") {
        renderCalendar();
      }
    }
  } catch (error) {
    /*
     * Lehká localStorage kopie zůstává nouzový fallback. Chyba cache
     * proto nesmí zablokovat přihlášení ani offline otevření aplikace.
     */
    console.warn(
      "Plnou lokální cache poznámek se nepodařilo připravit:",
      error
    );
  }

  loginScreen.hidden = true;

  /*
   * Důležité pro Chrome Password Manager:
   * po přihlášení login formulář nejen skryjeme,
   * ale úplně ho odpojíme z aktivního DOM.
   * Reference i event listenery zůstávají zachované
   * a při odhlášení ho zase vložíme zpět.
   */
  loginForm.setAttribute("inert", "");
  loginEmail.disabled = true;
  loginPassword.disabled = true;
  loginPasswordConfirm.disabled = true;
  loginPassword.value = "";
  loginPasswordConfirm.value = "";

  if (loginForm.isConnected) {
    loginForm.remove();
  }

  document.body.classList.remove(
    "authPending"
  );
}

function pripravLoginFormular() {
  aktivniUcetPotvrzenProTentoBeh = false;
  zrusCasovacKonceDema612();
  aktualizujPostDemoAkce612(null);

  /*
   * PRIVACY LOCK:
   * Lokální poznámky zůstávají po odhlášení uložené kvůli offline-first
   * režimu, ale při loginu nesmí být ani na jediný frame viditelné.
   * Třídu odstraní výhradně zobrazLokalniAplikaci() po povolení účtu.
   */
  document.body.classList.add("authPending");

  if (!loginForm.isConnected) {
    loginScreen.append(loginForm);
  }

  loginForm.removeAttribute("inert");
  loginEmail.disabled = false;
  loginPassword.disabled = false;

  loginModeSwitch.hidden = false;
  loginCredentialsFields.hidden = false;
  accountStatusPanel.hidden = true;
  if (localOwnerResetActions) {
    localOwnerResetActions.hidden = true;
  }
  if (localDeviceResetModal) {
    localDeviceResetModal.hidden = true;
    localDeviceResetModal.setAttribute("aria-hidden", "true");
  }
  aktualniStavUctu = null;

  loginScreen.hidden = false;
}

function zobrazPrihlaseni(
  message = "",
  isError = true
) {
  aktualizujInfoPlanuVMenu(null);
  pripravLoginFormular();
  nastavRezimAuth("login", {
    zachovatZpravu: true
  });

  if (message) {
    setLoginMessage(message, isError);
  } else {
    setLoginMessage();
  }
}

function zobrazStavUctu(stav) {
  aktivniUcetPotvrzenProTentoBeh = false;
  zrusCasovacKonceDema612();
  aktualizujInfoPlanuVMenu(null);

  /* Stejný privacy lock platí i pro pending/rejected/suspended obrazovku. */
  document.body.classList.add("authPending");

  if (!loginForm.isConnected) {
    loginScreen.append(loginForm);
  }

  loginForm.removeAttribute("inert");
  loginScreen.hidden = false;

  loginModeSwitch.hidden = true;
  loginCredentialsFields.hidden = true;
  accountStatusPanel.hidden = false;

  aktualniStavUctu = stav || {
    account_status: "unavailable"
  };

  aktualizujPostDemoAkce612(aktualniStavUctu);

  setLoginMessage();
  aktualizujAuthTexty();
}

function zobrazVyprselePrihlaseni() {
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-expired")
  );

  zobrazPrihlaseni(
    "Přihlášení vypršelo. Přihlas se znovu, aby mohla pokračovat synchronizace. Tvoje lokální data zůstala zachována.",
    true
  );

  /*
   * FIX 440 – pokud lokální instalace pamatuje předchozí účet, ale
   * Supabase session už neexistuje, online startup skončí na loginu.
   * V tomto stavu už není na co čekat: login je finální bezpečné UI.
   * Bez splash-ready by splash zůstal až do 15s nouzové pojistky.
   */
  oznamSplashPripravenyBezCloudovehoStartu();
}

async function nactiStavPristupu() {
  const {
    data,
    error
  } = await sCasovymLimitem(
    supabaseClient.rpc("lubanote_get_my_access"),
    7000,
    "Ověření stavu účtu"
  );

  if (error) {
    throw error;
  }

  return data || {
    ok: false,
    reason: "access_not_configured"
  };
}

function otevriModalVycisteniZarizeni() {
  if (!localDeviceResetModal) {
    return;
  }

  localDeviceResetModal.hidden = false;
  localDeviceResetModal.setAttribute("aria-hidden", "false");
  setTimeout(() => localDeviceResetCancel?.focus(), 0);
}

function zavriModalVycisteniZarizeni() {
  if (!localDeviceResetModal) {
    return;
  }

  localDeviceResetModal.hidden = true;
  localDeviceResetModal.setAttribute("aria-hidden", "true");
}

async function vycistiTotoZarizeniProJinyUcet() {
  if (!localDeviceResetConfirm) {
    return;
  }

  const puvodniText = localDeviceResetConfirm.textContent;
  localDeviceResetConfirm.disabled = true;
  if (localDeviceResetCancel) {
    localDeviceResetCancel.disabled = true;
  }
  localDeviceResetConfirm.textContent = "Připravuji…";

  try {
    /*
     * PATCH 563 – mazání dělá samostatná čistá stránka local-reset.html.
     * Tím nejsou otevřené žádné LubaNote IndexedDB handly a iOS může DB
     * opravdu odstranit. Cloudová data se této cesty vůbec nedotknou.
     */
    try {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (error) {
      console.warn("Local device reset sign-out skipped:", error);
    }

    window.location.assign("local-reset.html");
  } catch (error) {
    console.error("Local device reset start failed:", error);
    setLoginMessage(
      "Vyčištění zařízení se nepodařilo spustit. Zkus to znovu.",
      true
    );
    localDeviceResetConfirm.disabled = false;
    if (localDeviceResetCancel) {
      localDeviceResetCancel.disabled = false;
    }
    localDeviceResetConfirm.textContent = puvodniText;
  }
}

function zobrazAZviditelniLokalniReset() {
  if (!localOwnerResetActions) {
    return;
  }

  /*
   * PATCH 579 – na malém iOS PWA je bezpečný reset pod foldem.
   * Při owner konfliktu / smazaném účtu musí uživatel hlavní akci
   * vidět bez hledání a ručního scrollování. Logiku resetu NEMĚNÍME.
   *
   * Aktivní login input nejdřív odfokusujeme, aby iOS mohl zavřít
   * systémovou klávesnici. Posun zopakujeme po její animaci, ale jen
   * pokud je reset stále mimo viditelný viewport.
   */
  localOwnerResetActions.hidden = false;

  const aktivniPrvek = document.activeElement;
  if (
    aktivniPrvek instanceof HTMLElement &&
    typeof aktivniPrvek.blur === "function"
  ) {
    aktivniPrvek.blur();
  }

  const posunResetDoZaberu = () => {
    if (localOwnerResetActions.hidden) {
      return;
    }

    const rect = localOwnerResetActions.getBoundingClientRect();
    const vyskaViewportu =
      window.visualViewport?.height || window.innerHeight;
    const okraj = 12;
    const jeViditelny =
      rect.top >= okraj &&
      rect.bottom <= vyskaViewportu - okraj;

    if (jeViditelny) {
      return;
    }

    try {
      localOwnerResetActions.scrollIntoView({
        block: "center",
        inline: "nearest"
      });
    } catch (_error) {
      /* Fallback pro starší Safari. */
      localOwnerResetActions.scrollIntoView(false);
    }
  };

  requestAnimationFrame(posunResetDoZaberu);
  setTimeout(posunResetDoZaberu, 380);
}

async function odhlasPoKonfliktuVlastnika() {
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.warn(
      "Sign-out after local owner mismatch skipped:",
      error
    );
  }

  zrusPredchoziPrihlaseni();
  zobrazPrihlaseni();
  setLoginMessageKey(
    "login.localOwnerMismatch",
    "Toto zařízení obsahuje lokální data jiného LubaNote účtu. Kvůli bezpečnosti se účty na stejné instalaci nesmí míchat.",
    true
  );
  zobrazAZviditelniLokalniReset();
  oznamSplashPripravenyBezCloudovehoStartu();
}

async function maUcetNastaveneHlavniHeslo(userId) {
  if (!userId || !navigator.onLine) {
    return null;
  }

  const dotaz = supabaseClient
    .from("secret_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const { data, error } =
    await sCasovymLimitem(
      dotaz,
      5000,
      "Ověření hlavního šifrovacího hesla"
    );

  if (error) {
    throw error;
  }

  return Boolean(data?.user_id);
}

async function maZarizeniPripravenyMediaKlic() {
  /*
   * PATCH 559 – EXISTUJÍCÍ ÚČET NA NOVÉM ZAŘÍZENÍ.
   * Než pustíme UI nebo sync, zkusíme obnovit device-only non-extractable
   * media klíč z IndexedDB. Na známém zařízení je to rychlé a bez hesla.
   * Na novém zařízení vrátí false a login flow vyžádá hlavní heslo.
   *
   * mediaCrypto.js se načítá hned za secret.js; auth síťový request je
   * obvykle pomalejší, přesto krátce počkáme, aby pořadí scriptů nebylo
   * zdrojem falešného „nové zařízení“ promptu.
   */
  const konecCekani = Date.now() + 2000;

  while (
    !window.LubaNoteMediaCrypto
      ?.pripravMediaKlicZeZarizeni &&
    Date.now() < konecCekani
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 25)
    );
  }

  const media = window.LubaNoteMediaCrypto;

  if (!media?.pripravMediaKlicZeZarizeni) {
    console.warn(
      "Povinný media-key gate: MediaCrypto modul není dostupný."
    );
    return false;
  }

  try {
    await media.pripravMediaKlicZeZarizeni();
    return media.jeKlicDostupny?.() === true;
  } catch (error) {
    console.warn(
      "Povinný media-key gate: device klíč se nepodařilo obnovit.",
      error
    );
    return false;
  }
}

function vyzadujPovinneHlavniHeslo(
  user,
  {
    spustitSync = true,
    stav = null,
    rezim = "vytvorit"
  } = {}
) {
  const bezpecnyRezim =
    rezim === "zarizeni" ? "zarizeni" : "vytvorit";

  cekajiciPovinneHlavniHeslo = {
    user,
    spustitSync,
    stav,
    rezim: bezpecnyRezim
  };

  /*
   * Dokud hlavní heslo nevznikne, nevytváříme offline-first AUTH_OK.
   * Reload/Back tedy nemůže onboarding obejít.
   */
  oznacBlokovanePrihlaseni();

  /*
   * PATCH 561 – aktivní účet už NESMÍ zůstat vizuálně ve starém PENDING
   * panelu. Při schválení účtu byl serverový stav správně ACTIVE, ale
   * aktualniStavUctu stále obsahoval předchozí pending snapshot. Následná
   * kontrola pak mohla chybně vypsat „Účet stále čeká na schválení“.
   */
  aktualniStavUctu = null;
  setLoginMessage();

  /*
   * Tags.js je načten před supabaseClient.js a vystavuje přímé API pro
   * povinný master-password onboarding. Použijeme ho přednostně místo
   * samotného eventu: modal se tak otevře synchronně v auth flow a nehrozí,
   * že se první přihlášení ztratí na hraně pořadí eventů / repaintu iOS PWA.
   * Login vrstvu můžeme bezpečně skrýt – body.authPending dál schovává
   * lokální data a jedinou povolenou vrstvou je povinný Secret modal.
   */
  const onboarding =
    window.LubaNoteMasterPasswordOnboarding;

  if (typeof onboarding?.zobraz === "function") {
    loginScreen.hidden = true;
    onboarding.zobraz(bezpecnyRezim);
  } else {
    window.dispatchEvent(
      new CustomEvent(
        "lubanote:master-password-required",
        {
          detail: {
            userId: user?.id || null,
            mode: bezpecnyRezim
          }
        }
      )
    );
  }

  oznamSplashPripravenyBezCloudovehoStartu();
}

async function povolAktivniUcet(
  user,
  { spustitSync = true, stav = null } = {}
) {
  if (
    !overNeboNastavVlastnikaLokalnichDat(user?.id)
  ) {
    await odhlasPoKonfliktuVlastnika();
    return false;
  }

  aktualniPristupUctu = stav || aktualniPristupUctu;
  aktivniUcetPotvrzenProTentoBeh = true;
  aktualizujPostDemoAkce612(null);
  naplanujKonecDema612(aktualniPristupUctu);

  if (aktualniPristupUctu?.ok) {
    ulozLokalniCachePristupu(
      aktualniPristupUctu,
      user?.id
    );
  }

  oznacPredchoziPrihlaseni();
  setLoginMessage();
  aktualizujInfoPlanuVMenu(aktualniPristupUctu);
  zapisOwnerDiag("BEFORE_SHOW_LOCAL_APP", {
    currentUserId: user?.id || null,
    currentEmail: user?.email || null,
    state: ownerDiagZdrojovySnapshot()
  });
  await zobrazLokalniAplikaci();
  zapisOwnerDiag("AFTER_SHOW_LOCAL_APP", {
    currentUserId: user?.id || null,
    currentEmail: user?.email || null,
    state: ownerDiagZdrojovySnapshot()
  });

  /*
   * C3 Admin Dashboard a další účetní UI dostanou signál až poté,
   * co server skutečně povolil aktivní účet. Samotná session nestačí.
   */
  window.dispatchEvent(
    new CustomEvent("lubanote:account-active", {
      detail: {
        userId: user?.id || null
      }
    })
  );

  /*
   * Při běžném online startu načte štítky startSync() těsně před
   * skrytím splash screenu. Dříve se stejný cloudový load dělal
   * ještě tady před auth-valid a pak znovu ve startSync(), takže
   * jeden start vytvářel dvě celé série REST dotazů na tags.
   *
   * Pokud sync záměrně nespouštíme (např. pouze kontrola stavu
   * účtu), štítky načteme i nadále tady, aby se UI nezměnilo.
   */
  if (
    !spustitSync &&
    typeof loadTagsFromSupabase === "function"
  ) {
    await loadTagsFromSupabase();
  }

  oznamPlatnePrihlaseni();

  if (!spustitSync) {
    return true;
  }

  if (
    typeof window.LubaNoteSync
      ?.spustBezpecne === "function"
  ) {
    window.LubaNoteSync.spustBezpecne();
  } else {
    /*
     * PATCH 485 – při chybě/pozdním načtení sync modulu už nesmíme
     * obejít egress ochranu přímým legacy syncNotes(). Start se raději
     * odloží a zopakuje po auth/foreground události.
     */
    window.LubaNoteStartupDiag?.zapis?.(
      "EGRESS",
      "INITIAL SYNC DEFER | safe-sync-module-not-ready"
    );
  }

  return true;
}

/*
 * PATCH 605 – SERVER PROVENANCE GATE PRO PRIVATE CLOUD CACHE
 * ----------------------------------------------------------
 * DIAG 604 prokázal stav, kdy owner/access/secret markery už byly
 * přepsané na právě přihlášený účet, ale savedTask obsahoval cloudové
 * karty jiného účtu. Samotný lokální owner marker tedy už nemůže být
 * poslední autoritou.
 *
 * Před otevřením lokální aplikace proto při ONLINE přihlášení porovnáme
 * ID lokálních CLOUD poznámek s malým bootstrap manifestem aktuálního
 * účtu. Nestahuje se obsah poznámek, pouze manifest přes existující
 * egress-safe RPC. Tento gate nic nemaže ani nepřepisuje.
 */
function nactiCloudCacheProvenance605() {
  const saved = nactiJsonLokalnihoKlice("savedTask");
  const notes = Array.isArray(saved) ? saved : [];
  const cloudIds = notes
    .filter((note) => String(note?.storageScope || "cloud") !== "local")
    .map((note) => String(note?.id || "").trim())
    .filter(Boolean);

  const cloudMeta = nactiJsonLokalnihoKlice("lubanoteCloudSyncMetaV1");
  const meta =
    cloudMeta && typeof cloudMeta === "object" && !Array.isArray(cloudMeta)
      ? cloudMeta
      : {};

  const serverBackedIds = cloudIds.filter((id) => {
    const row = meta[id];
    if (!row || typeof row !== "object") return false;
    return (
      (row.revision !== null &&
        row.revision !== undefined &&
        Number.isFinite(Number(row.revision))) ||
      Boolean(row.serverUpdatedAt)
    );
  });

  return { cloudIds, serverBackedIds };
}

async function overServerovouProvenanciCloudCache605(user) {
  const userId = String(user?.id || "").trim();
  const local = nactiCloudCacheProvenance605();

  if (!userId || local.cloudIds.length === 0) {
    zapisOwnerDiag("SERVER_PROVENANCE_605", {
      result: "PASS",
      reason: !userId ? "missing-user-id-no-check" : "no-local-cloud-cache",
      currentUserId: userId || null,
      localCloud: local.cloudIds.length,
      serverBackedLocal: local.serverBackedIds.length
    });
    return true;
  }

  if (!navigator.onLine || !supabaseClient) {
    zapisOwnerDiag("SERVER_PROVENANCE_605", {
      result: "BLOCK",
      reason: "cannot-verify-local-cloud-cache",
      currentUserId: userId,
      localCloud: local.cloudIds.length,
      serverBackedLocal: local.serverBackedIds.length
    });
    return false;
  }

  try {
    const dotaz = supabaseClient.rpc(
      "lubanote_get_private_bootstrap_manifest"
    );
    const { data, error } =
      typeof sCasovymLimitem === "function"
        ? await sCasovymLimitem(
            dotaz,
            5000,
            "Ověření vlastníka lokální cloud cache"
          )
        : await dotaz;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const manifestIds = new Set(
      rows
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean)
    );

    const overlap = local.cloudIds.filter((id) => manifestIds.has(id));
    const overlapServerBacked = local.serverBackedIds.filter((id) =>
      manifestIds.has(id)
    );

    let blokovat = false;
    let reason = "manifest-compatible";

    if (
      local.serverBackedIds.length > 0 &&
      overlapServerBacked.length !== local.serverBackedIds.length
    ) {
      blokovat = true;
      reason = "server-backed-local-cache-mismatch";
    } else if (manifestIds.size > 0 && overlap.length === 0) {
      blokovat = true;
      reason = "zero-overlap-with-current-account";
    } else if (
      manifestIds.size === 0 &&
      local.serverBackedIds.length > 0
    ) {
      blokovat = true;
      reason = "current-account-empty-but-local-cache-was-synced";
    }

    zapisOwnerDiag("SERVER_PROVENANCE_605", {
      result: blokovat ? "BLOCK" : "PASS",
      reason,
      currentUserId: userId,
      localCloud: local.cloudIds.length,
      serverBackedLocal: local.serverBackedIds.length,
      manifest: manifestIds.size,
      overlap: overlap.length,
      overlapServerBacked: overlapServerBacked.length,
      localSample: local.cloudIds.slice(0, 8),
      manifestSample: Array.from(manifestIds).slice(0, 8)
    });

    if (blokovat) {
      console.error(
        "LubaNote security: lokální cloud cache nepatří aktuálnímu účtu; UI zůstává zamčené.",
        {
          currentUserId: userId,
          localCloud: local.cloudIds.length,
          manifest: manifestIds.size,
          overlap: overlap.length
        }
      );
      return false;
    }

    return true;
  } catch (error) {
    zapisOwnerDiag("SERVER_PROVENANCE_605", {
      result: "BLOCK",
      reason: "manifest-check-failed",
      currentUserId: userId,
      localCloud: local.cloudIds.length,
      serverBackedLocal: local.serverBackedIds.length,
      error: String(error?.message || error)
    });
    return false;
  }
}

async function zpracujStavPrihlasenehoUzivatele(
  user,
  { spustitSync = true } = {}
) {
  const stav = await nactiStavPristupu();

  aktualniPristupUctu = stav?.ok ? stav : null;

  const vlastnik = String(
    localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) || ""
  ).trim();

  /*
   * PATCH 603 – access cache se před owner gate NESMÍ přepsat právě
   * přihlášeným účtem, pokud owner ještě chybí. Tato cache je jeden z
   * důkazů, komu starší lokální data patřila. Zápis proběhne až po
   * úspěšném owner gate v povolAktivniUcet().
   */
  if (
    stav?.ok &&
    user?.id &&
    vlastnik &&
    vlastnik === String(user.id)
  ) {
    ulozLokalniCachePristupu(stav, user.id);
  }

  if (
    stav?.ok === true &&
    stav.account_status === "active" &&
    stav.plan_active === true &&
    stav.data_access_active !== false &&
    jeStavPristupuCasovePlatny(stav)
  ) {
    /*
     * PATCH 605 – ještě před lokálním owner markerem ověřujeme, že
     * savedTask cloud cache je kompatibilní s autoritativním manifestem
     * právě přihlášeného účtu. Owner marker mohl být starým bugem už
     * nesprávně přepsaný, proto sám nestačí.
     */
    const provenanceOk =
      await overServerovouProvenanciCloudCache605(user);

    if (!provenanceOk) {
      zapisOwnerDiag("AUTH_ACTIVE_SERVER_PROVENANCE_BLOCKED", {
        currentUserId: user?.id || null,
        currentEmail: user?.email || null,
        state: ownerDiagZdrojovySnapshot()
      });
      await odhlasPoKonfliktuVlastnika();
      return false;
    }

    /*
     * PATCH 562 – OWNER GATE MUSÍ BÝT PŘED MASTER-PASSWORD GATE.
     * ----------------------------------------------------------
     * MediaCrypto ověřuje, že lokální Secret nastavení patří stejnému
     * účtu jako lokální owner instalace. Owner se ale dosud nastavoval
     * až v povolAktivniUcet(), tedy AŽ PO vytvoření / odemčení hlavního
     * hesla. Na čistém nebo znovu připraveném zařízení tak mohl media
     * klíč vzniknout správně, ale následná kontrola jeKlicDostupny() ho
     * odmítla kvůli ještě nenastavenému / starému owner kontextu.
     *
     * Proto autoritativní ochranu proti míchání účtů provedeme hned po
     * potvrzení ACTIVE účtu a ještě PŘED Secret/media onboardingem.
     * - prázdná instalace dostane owner = aktuální user.id,
     * - instalace patřící jinému účtu se bezpečně odhlásí,
     * - sync ani lokální data se před tímto rozhodnutím neotevřou.
     */
    zapisOwnerDiag("AUTH_ACTIVE_BEFORE_OWNER_GATE", {
      currentUserId: user?.id || null,
      currentEmail: user?.email || null,
      state: ownerDiagZdrojovySnapshot()
    });

    if (!overNeboNastavVlastnikaLokalnichDat(user?.id)) {
      zapisOwnerDiag("AUTH_ACTIVE_OWNER_GATE_BLOCKED", {
        currentUserId: user?.id || null,
        currentEmail: user?.email || null
      });
      await odhlasPoKonfliktuVlastnika();
      return false;
    }

    zapisOwnerDiag("AUTH_ACTIVE_OWNER_GATE_PASSED", {
      currentUserId: user?.id || null,
      currentEmail: user?.email || null,
      state: ownerDiagZdrojovySnapshot()
    });

    /*
     * PATCH 556 – hlavní heslo je bezpečnostní prerequisite účtu.
     * Kontrolujeme autoritativní secret_settings na serveru ještě
     * PŘED otevřením lokální aplikace a PŘED startem synchronizace.
     */
    const maHlavniHeslo =
      await maUcetNastaveneHlavniHeslo(user?.id);

    if (maHlavniHeslo === false) {
      vyzadujPovinneHlavniHeslo(user, {
        spustitSync,
        stav,
        rezim: "vytvorit"
      });
      return false;
    }

    /*
     * Účet hlavní heslo už má. Na KAŽDÉM dalším zařízení ale musí
     * existovat device-only media klíč odvozený ze stejného hesla.
     * Pokud ho IndexedDB tohoto zařízení neobsahuje, aplikaci ani sync
     * ještě nepovolíme a vyžádáme jednorázové zadání hlavního hesla.
     */
    if (maHlavniHeslo === true) {
      const mediaKlicPripraven =
        await maZarizeniPripravenyMediaKlic();

      if (!mediaKlicPripraven) {
        vyzadujPovinneHlavniHeslo(user, {
          spustitSync,
          stav,
          rezim: "zarizeni"
        });
        return false;
      }
    }

    return povolAktivniUcet(user, {
      spustitSync,
      stav
    });
  }

  oznacBlokovanePrihlaseni();

  zobrazStavUctu({
    ...stav,
    account_status:
      stav?.account_status || "unavailable"
  });

  oznamSplashPripravenyBezCloudovehoStartu();
  return false;
}

async function overChybejiciSessionAProbudLogin() {
  if (!navigator.onLine) {
    return false;
  }

  const pripraven = await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    return false;
  }

  try {
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Ověření přihlášené session"
    );

    if (session?.user) {
      return true;
    }

    if (existujePredchoziPrihlaseni()) {
      zobrazVyprselePrihlaseni();
    }

    return false;
  } catch (error) {
    /*
     * Síťová chyba nebo timeout není totéž jako potvrzeně chybějící
     * session. Offline-first aplikaci kvůli tomu nevyhazujeme na login.
     */
    console.warn(
      "Kontrola session pro synchronizaci byla odložena:",
      error.message
    );
    return false;
  }
}

async function overPrihlaseniOnline({
  zobrazitLoginPriNeuspechu = false
} = {}) {
  if (!navigator.onLine) {
    return false;
  }

  const pripraven =
    await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni(
        "Nepodařilo se připojit k synchronizaci. Zkus to znovu po připojení k internetu."
      );
    } else {
      /*
       * Dříve přihlášený uživatel zůstává v offline-first režimu
       * na lokálních datech. Není důvod držet splash až do fallbacku.
       */
      oznamSplashPripravenyBezCloudovehoStartu();
    }
    return false;
  }

  try {
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Ověření přihlášení"
    );

    if (session?.user) {
      return await zpracujStavPrihlasenehoUzivatele(
        session.user,
        { spustitSync: true }
      );
    }

    /*
     * Máme internet, Supabase odpovědělo a session opravdu chybí.
     * Dříve přihlášeného uživatele už nesmíme nechat v aplikaci
     * s dojmem, že cloud funguje. Lokální data ale nemažeme.
     */
    if (existujePredchoziPrihlaseni()) {
      zobrazVyprselePrihlaseni();
    } else if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni();
    } else {
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return false;
  } catch (error) {
    console.warn(
      "Login session check skipped:",
      error.message
    );

    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni();
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
    } else {
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return false;
  }
}

async function updateLoginScreen() {
  /*
   * Potvrzení e-mailu je samostatný auth návrat, ne vypršení session.
   * Vždy ukážeme čisté přihlášení a nikdy kvůli tomu neodemykáme
   * lokální data předchozího účtu.
   */
  if (lubanoteAuthNavrat.maAuthChybu) {
    zrusPredchoziPrihlaseni();
    zobrazPrihlaseni("", false);
    setLoginMessageKey(
      "login.emailLinkInvalid",
      "Potvrzovací odkaz už byl použit nebo vypršel. Pokud je e-mail potvrzený, přihlas se.",
      true
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  if (lubanoteAuthNavrat.potvrzenyEmail) {
    zrusPredchoziPrihlaseni();
    zobrazPrihlaseni("", false);
    setLoginMessageKey(
      "login.emailConfirmed",
      "E-mail byl potvrzen. Teď se přihlas.",
      false
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  const lokalniCachePristupu =
    nactiLokalniCachePristupu();

  /*
   * Demo / časově omezený Full nesmí po známé expiraci probliknout
   * do lokálních dat ani při offline-first startu. Server zůstává
   * autorita; tahle cache pouze umí stejnou známou expiraci dodržet
   * i bez sítě.
   */
  if (
    lokalniCachePristupu?.account_status === "active" &&
    !jeStavPristupuCasovePlatny(lokalniCachePristupu)
  ) {
    aktualniPristupUctu = lokalniCachePristupu;
    zobrazStavUctu(lokalniCachePristupu);
    oznamSplashPripravenyBezCloudovehoStartu();

    if (navigator.onLine) {
      overPrihlaseniOnline({
        zobrazitLoginPriNeuspechu: false
      });
    }

    return;
  }

  const maPredchoziPrihlaseni =
    existujePredchoziPrihlaseni();

  /*
   * Klíčová offline-first větev:
   * dříve schválený uživatel dostane lokální aplikaci ihned.
   * Síťové ověření proběhne pouze na pozadí.
   */
  if (maPredchoziPrihlaseni) {
    /*
     * Lokální aplikace se může otevřít dřív, než WebView spolehlivě ví,
     * zda je zařízení online. Na Androidu může navigator.onLine při
     * studeném startu v režimu Letadlo krátce vracet true, takže podmínka
     * podle navigator.onLine nesmí rozhodovat o načtení bezpečné cache.
     *
     * Cache tags.js obsahuje pouze bezpečný snapshot veřejných štítků
     * (Secret názvy jsou sanitizované), proto ji načteme vždy v této
     * local-first větvi. Online start ji následně stejně obnoví ze serveru.
     */
    if (
      typeof window.LubaNoteTagsStartCache?.nacti === "function"
    ) {
      const userIdProLokalniStitky = String(
        lokalniCachePristupu?.user_id ||
        localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) ||
        ""
      ).trim();

      if (userIdProLokalniStitky) {
        const stitkyNactenyLokalne =
          window.LubaNoteTagsStartCache.nacti(
            userIdProLokalniStitky
          ) === true;

        window.LubaNoteStartupDiag?.zapis?.(
          "FAST",
          stitkyNactenyLokalne
            ? "TAG LOCAL CACHE HIT"
            : "TAG LOCAL CACHE MISS"
        );
      }
    }

    await zobrazLokalniAplikaci();

    if (navigator.onLine) {
      /*
       * Online start nechá splash zakrývat aplikaci, dokud sync.js
       * nenačte poznámky i štítky a nevyšle lubanote:splash-ready.
       */
      overPrihlaseniOnline({
        zobrazitLoginPriNeuspechu: false
      });
    } else {
      /* Offline nemá na co čekat: lokální karty už jsou vykreslené. */
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return;
  }

  if (!navigator.onLine) {
    zobrazPrihlaseni(
      "První přihlášení vyžaduje připojení k internetu."
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  /* Ani při pomalém / nefunkčním internetu nezůstane černá obrazovka. */
  zobrazPrihlaseni(
    "Ověřuji přihlášení…",
    false
  );

  /*
   * Uživatel bez uloženého přihlášení musí vidět login hned.
   * Splash tedy není podmíněný synchronizací, která ještě nemůže běžet.
   */
  oznamSplashPripravenyBezCloudovehoStartu();

  await overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: true
  });
}

async function provedPrihlaseni(email, password) {
  if (!email || !password) {
    setLoginMessageKey(
      "login.enterCredentials",
      "Vyplň e-mail i heslo.",
      true
    );
    return;
  }

  if (!navigator.onLine) {
    setLoginMessage(
      "Přihlášení vyžaduje internet. Lokální aplikace funguje offline až po prvním úspěšném přihlášení.",
      true
    );
    return;
  }

  loginButton.disabled = true;
  setLoginMessageKey(
    "login.signingIn",
    "Přihlašuji…"
  );

  try {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven || !supabaseClient) {
      throw new Error(
        "Nepodařilo se načíst synchronizační službu."
      );
    }

    const {
      data,
      error
    } = await sCasovymLimitem(
      supabaseClient.auth.signInWithPassword({
        email,
        password
      }),
      12000,
      "Přihlášení"
    );

    if (error) {
      if (
        String(error.message || "")
          .toLowerCase()
          .includes("email not confirmed")
      ) {
        setLoginMessageKey(
          "login.emailNotConfirmed",
          "E-mail ještě není potvrzený. Otevři potvrzovací odkaz v e-mailu a pak se přihlas znovu.",
          true
        );
        return;
      }

      throw error;
    }

    /*
     * Úspěšná Auth session ještě není oprávnění k datům LubaNote.
     * Nejdřív musí projít serverová kontrola account_status.
     */
    oznacBlokovanePrihlaseni();

    loginPassword.value = "";
    loginPasswordConfirm.value = "";

    await zpracujStavPrihlasenehoUzivatele(
      data?.user,
      { spustitSync: true }
    );
  } catch (error) {
    setLoginMessageKey(
      "login.signInFailed",
      "Přihlášení se nezdařilo. Zkontroluj e-mail, heslo a připojení.",
      true
    );
    console.error("Login error:", error);
  } finally {
    loginButton.disabled = false;
  }
}

async function provedRegistraci(
  email,
  password,
  passwordConfirm
) {
  if (!email || !password || !passwordConfirm) {
    setLoginMessageKey(
      "login.enterRegistration",
      "Vyplň e-mail, heslo i heslo znovu.",
      true
    );
    return;
  }

  if (password !== passwordConfirm) {
    setLoginMessageKey(
      "login.passwordMismatch",
      "Zadaná hesla se neshodují.",
      true
    );
    return;
  }

  if (password.length < 8) {
    setLoginMessageKey(
      "login.passwordTooShort",
      "Heslo musí mít alespoň 8 znaků.",
      true
    );
    return;
  }

  if (!navigator.onLine) {
    setLoginMessageKey(
      "login.registrationOnline",
      "Registrace vyžaduje připojení k internetu.",
      true
    );
    return;
  }

  loginButton.disabled = true;
  setLoginMessageKey(
    "login.registering",
    "Registruji…"
  );

  try {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven || !supabaseClient) {
      throw new Error(
        "Nepodařilo se načíst synchronizační službu."
      );
    }

    const {
      data,
      error
    } = await sCasovymLimitem(
      supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: LUBANOTE_AUTH_REDIRECT_URL
        }
      }),
      15000,
      "Registrace"
    );

    if (error) {
      throw error;
    }

    if (
      data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      nastavRezimAuth("login", {
        zachovatZpravu: true
      });
      setLoginMessageKey(
        "login.alreadyRegistered",
        "Tento e-mail už je zaregistrovaný. Použij Přihlášení.",
        true
      );
      return;
    }

    /*
     * Nový Auth účet serverový trigger vždy založí jako PENDING.
     * Dokud server nepotvrdí ACTIVE, nikdy nenastavujeme offline-first
     * marker pro vstup do lokální aplikace.
     */
    oznacBlokovanePrihlaseni();

    loginPassword.value = "";
    loginPasswordConfirm.value = "";

    if (data?.session?.user) {
      await zpracujStavPrihlasenehoUzivatele(
        data.session.user,
        { spustitSync: false }
      );
      return;
    }

    nastavRezimAuth("login", {
      zachovatZpravu: true
    });
    loginEmail.value = email;
    setLoginMessageKey(
      "login.registrationCreated",
      "Registrace byla vytvořena. Potvrď e-mail a potom se přihlas.",
      false
    );
  } catch (error) {
    const chybaText = String(
      error?.message || error?.code || ""
    ).toLowerCase();
    const jeEmailRateLimit =
      Number(error?.status) === 429 ||
      chybaText.includes("rate limit") ||
      chybaText.includes("rate_limit") ||
      chybaText.includes("email rate") ||
      chybaText.includes("over_email_send_rate_limit");

    if (jeEmailRateLimit) {
      setLoginMessageKey(
        "login.registrationRateLimited",
        "Bylo odesláno příliš mnoho potvrzovacích e-mailů. Zkus registraci později.",
        true
      );
    } else {
      setLoginMessageKey(
        "login.registrationFailed",
        "Registrace se nezdařila. Zkontroluj e-mail, heslo a připojení.",
        true
      );
    }

    console.error("Registration error:", error);
  } finally {
    loginButton.disabled = false;
  }
}

loginModeSignIn.addEventListener("click", () => {
  nastavRezimAuth("login");
});

loginModeRegister.addEventListener("click", () => {
  nastavRezimAuth("register");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (aktualniRezimAuth === "register") {
    await provedRegistraci(
      email,
      password,
      loginPasswordConfirm.value
    );
    return;
  }

  await provedPrihlaseni(email, password);
});

function otevriSmazaniDatPoDemu612() {
  if (!jeVyprseleDemo612(aktualniStavUctu || aktualniPristupUctu)) {
    return;
  }

  expiredDemoDeleteProgress.hidden = true;
  expiredDemoDeleteProgress.textContent = "";
  expiredDemoDeleteCancel.disabled = false;
  expiredDemoDeleteConfirm.disabled = false;
  expiredDemoDeleteModal.hidden = false;
  expiredDemoDeleteModal.setAttribute("aria-hidden", "false");
  setTimeout(() => expiredDemoDeleteCancel?.focus(), 0);
}

function zavriSmazaniDatPoDemu612() {
  if (!expiredDemoDeleteModal || expiredDemoDeleteConfirm?.disabled) {
    return;
  }

  expiredDemoDeleteModal.hidden = true;
  expiredDemoDeleteModal.setAttribute("aria-hidden", "true");
}

function nastavPrubehSmazaniPoDemu612(text) {
  if (!expiredDemoDeleteProgress) {
    return;
  }

  expiredDemoDeleteProgress.hidden = false;
  expiredDemoDeleteProgress.textContent = String(text || "");
}

async function smazCloudovaDataPoDemu612() {
  if (!jeVyprseleDemo612(aktualniStavUctu || aktualniPristupUctu)) {
    throw new Error("Demo není ve stavu, ve kterém lze data smazat.");
  }

  const pripraven = await pripravSupabaseClient();
  if (!pripraven || !supabaseClient) {
    throw new Error("Cloud není dostupný.");
  }

  nastavPrubehSmazaniPoDemu612("Připravuji bezpečné smazání…");

  const { data: priprava, error: chybaPripravy } =
    await supabaseClient.rpc(
      "lubanote_prepare_my_demo_data_delete"
    );

  if (chybaPripravy || priprava?.ok !== true) {
    throw chybaPripravy || new Error(
      `Příprava smazání selhala: ${priprava?.reason || "unknown"}`
    );
  }

  const celkemPriloh = Number(priprava?.attachment_count || 0);
  let smazanoPriloh = 0;

  for (let kolo = 0; kolo < 100; kolo += 1) {
    nastavPrubehSmazaniPoDemu612(
      celkemPriloh > 0
        ? `Mažu přílohy… ${Math.min(smazanoPriloh, celkemPriloh)}/${celkemPriloh}`
        : "Kontroluji přílohy…"
    );

    const cleanup =
      await window.LubaNoteAttachmentsCloud
        ?.vycistiCloudovePrilohyPoProdleve?.(100);

    if (!cleanup || cleanup.ok !== true) {
      throw new Error(
        `Přílohy se nepodařilo bezpečně smazat: ${cleanup?.reason || "cleanup_failed"}`
      );
    }

    smazanoPriloh += Number(cleanup.deleted || 0);

    if (Number(cleanup.claimed || 0) === 0) {
      break;
    }

    if (kolo === 99) {
      throw new Error("Mazání příloh překročilo bezpečný počet kroků.");
    }
  }

  nastavPrubehSmazaniPoDemu612("Mažu poznámky a ostatní data…");

  const { data: finalizace, error: chybaFinalizace } =
    await supabaseClient.rpc(
      "lubanote_finalize_my_demo_data_delete"
    );

  if (chybaFinalizace || finalizace?.ok !== true) {
    throw chybaFinalizace || new Error(
      `Dokončení smazání selhalo: ${finalizace?.reason || "unknown"}`
    );
  }

  nastavPrubehSmazaniPoDemu612("Cloudová data jsou smazaná. Čistím zařízení…");

  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.warn("Post-Demo sign-out po smazání přeskočen:", error);
  }

  window.location.replace("./local-reset.html?cloudPurged=1");
}

accountStatusDownloadData?.addEventListener(
  "click",
  async () => {
    if (!jeVyprseleDemo612(aktualniStavUctu || aktualniPristupUctu)) {
      return;
    }

    accountStatusDownloadData.disabled = true;
    accountStatusDeleteData.disabled = true;

    try {
      if (typeof window.LubaNoteBackup?.exportujPoSkonceniDema !== "function") {
        throw new Error("Modul kompletní zálohy není dostupný.");
      }

      await window.LubaNoteBackup.exportujPoSkonceniDema();
    } catch (error) {
      console.error("Post-Demo export selhal:", error);
      zobrazZpravuAplikace?.(
        "Stáhnout moje data",
        error?.message || "Zálohu se nepodařilo vytvořit."
      );
    } finally {
      accountStatusDownloadData.disabled = false;
      accountStatusDeleteData.disabled = false;
    }
  }
);

accountStatusDeleteData?.addEventListener(
  "click",
  otevriSmazaniDatPoDemu612
);

expiredDemoDeleteCancel?.addEventListener(
  "click",
  zavriSmazaniDatPoDemu612
);

expiredDemoDeleteConfirm?.addEventListener(
  "click",
  async () => {
    expiredDemoDeleteCancel.disabled = true;
    expiredDemoDeleteConfirm.disabled = true;
    accountStatusDownloadData.disabled = true;
    accountStatusDeleteData.disabled = true;

    try {
      await smazCloudovaDataPoDemu612();
    } catch (error) {
      console.error("Post-Demo smazání dat selhalo:", error);
      nastavPrubehSmazaniPoDemu612(
        `Smazání nebylo dokončeno: ${error?.message || "neznámá chyba"}`
      );
      expiredDemoDeleteCancel.disabled = false;
      expiredDemoDeleteConfirm.disabled = false;
      accountStatusDownloadData.disabled = false;
      accountStatusDeleteData.disabled = false;
    }
  }
);

accountStatusRefresh.addEventListener(
  "click",
  async () => {
    if (!navigator.onLine) {
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
      return;
    }

    accountStatusRefresh.disabled = true;
    setLoginMessage();

    try {
      const pripraven = await pripravSupabaseClient();

      if (!pripraven || !supabaseClient) {
        throw new Error("Supabase unavailable");
      }

      const {
        data: { session }
      } = await sCasovymLimitem(
        supabaseClient.auth.getSession(),
        5000,
        "Kontrola session"
      );

      if (!session?.user) {
        zrusPredchoziPrihlaseni();
        zobrazPrihlaseni();
        return;
      }

      const povolen =
        await zpracujStavPrihlasenehoUzivatele(
          session.user,
          { spustitSync: true }
        );

      if (
        !povolen &&
        aktualniStavUctu?.account_status === "pending"
      ) {
        setLoginMessageKey(
          "login.stillPending",
          "Účet stále čeká na schválení.",
          false
        );
      }
    } catch (error) {
      console.warn("Account status refresh failed:", error);
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
    } finally {
      accountStatusRefresh.disabled = false;
    }
  }
);

accountStatusSignOut.addEventListener(
  "click",
  async () => {
    /*
     * PATCH 578 – pokud uživatel odhlašuje zařízení ze stavu
     * „Účet není dostupný“, po návratu na login nabídneme EXISTUJÍCÍ
     * bezpečný lokální reset z PATCH 563. Nic nemažeme automaticky.
     *
     * Stav musíme uložit PŘED zobrazPrihlaseni(), protože ta přes
     * pripravLoginFormular() záměrně vynuluje aktualniStavUctu.
     * Pending/rejected/suspended flow tímto zůstává beze změny.
     */
    const nabidnoutLokalniReset =
      aktualniStavUctu?.account_status === "unavailable";

    accountStatusSignOut.disabled = true;

    try {
      const pripraven = await pripravSupabaseClient();

      if (pripraven && supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (error) {
      console.warn("Pending account sign-out skipped:", error);
    } finally {
      zrusPredchoziPrihlaseni();
      accountStatusSignOut.disabled = false;
      zobrazPrihlaseni();

      if (nabidnoutLokalniReset) {
        zobrazAZviditelniLokalniReset();
      }
    }
  }
);

localOwnerResetButton?.addEventListener(
  "click",
  otevriModalVycisteniZarizeni
);

localDeviceResetCancel?.addEventListener(
  "click",
  zavriModalVycisteniZarizeni
);

localDeviceResetConfirm?.addEventListener(
  "click",
  () => {
    void vycistiTotoZarizeniProJinyUcet();
  }
);

localDeviceResetModal?.addEventListener(
  "click",
  (event) => {
    if (event.target === localDeviceResetModal) {
      zavriModalVycisteniZarizeni();
    }
  }
);

window.addEventListener("lubanote:language-change", () => {
  const klic = loginMessage.dataset.i18nKey || "";
  const zdroj = loginMessage.dataset.i18nSource || "";

  if (klic) {
    loginMessage.textContent = tAuth(klic, loginMessage.textContent);
  } else if (zdroj) {
    loginMessage.textContent =
      window.LubaNoteI18n?.prelozText?.(zdroj) || zdroj;
  }

  aktualizujAuthTexty();
  aktualizujInfoPlanuVMenu(aktualniPristupUctu);
});

window.addEventListener(
  "lubanote:note-limit-reached",
  (event) => {
    zobrazLimitPoznamek(event?.detail || {});
  }
);

window.addEventListener(
  "lubanote:account-access-denied",
  async () => {
    if (!navigator.onLine) {
      return;
    }

    try {
      const pripraven = await pripravSupabaseClient();

      if (!pripraven || !supabaseClient) {
        return;
      }

      const { data: { session } } =
        await supabaseClient.auth.getSession();

      if (!session?.user) {
        zobrazVyprselePrihlaseni();
        return;
      }

      await zpracujStavPrihlasenehoUzivatele(
        session.user,
        { spustitSync: false }
      );
    } catch (error) {
      console.warn(
        "Obnovení stavu účtu po odmítnutí přístupu selhalo:",
        error
      );
    }
  }
);

window.addEventListener(
  "lubanote:master-password-ready",
  async () => {
    const cekajici = cekajiciPovinneHlavniHeslo;

    if (!cekajici?.user?.id) {
      return;
    }

    cekajiciPovinneHlavniHeslo = null;

    try {
      await povolAktivniUcet(
        cekajici.user,
        {
          spustitSync: cekajici.spustitSync,
          stav: cekajici.stav
        }
      );
    } catch (error) {
      console.error(
        "Dokončení vstupu po přípravě hlavního hesla selhalo:",
        error
      );

      /* Fail closed – session zůstává, ale aplikace se bez úspěšného
         dokončení bezpečnostního gate neotevře. */
      oznacBlokovanePrihlaseni();
      zobrazPrihlaseni(
        "Hlavní heslo bylo ověřeno, ale dokončení přihlášení selhalo. Zkus se přihlásit znovu."
      );
    }
  }
);

window.LubaNoteSupabase = {
  pripravClient: pripravSupabaseClient,
  jePripraven: () => Boolean(supabaseClient),
  maPredchoziPrihlaseni:
    existujePredchoziPrihlaseni,
  zrusPredchoziPrihlaseni,
  zobrazPrihlaseni,
  overChybejiciSessionAProbudLogin,
  nactiStavPristupu,
  ziskejAktualniPristup: () =>
    aktualniPristupUctu || nactiLokalniCachePristupu(),
  jeAktivniUcetPotvrzenProTentoBeh: () =>
    aktivniUcetPotvrzenProTentoBeh === true,
  zkontrolujLimitNovePoznamky
};

window.addEventListener(
  "lubanote:auth-required",
  () => {
    overChybejiciSessionAProbudLogin();
  }
);

window.addEventListener("online", () => {
  /*
   * Když se internet vrátí po offline startu,
   * načteme Supabase a obnovíme session bez restartu aplikace.
   */
  overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: false
  });
});

aktualizujAuthTexty();
updateLoginScreen();


/* PATCH 612 – WebView/Chrome mohou background timer pozastavit. Při návratu
 * proto deadline znovu vyhodnotíme bez čekání na reload nebo ruční tlačítko. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void zkontrolujKonecDemaPriNavratu612();
  }
});

window.addEventListener("focus", () => {
  void zkontrolujKonecDemaPriNavratu612();
});

window.addEventListener("pageshow", () => {
  void zkontrolujKonecDemaPriNavratu612();
});
