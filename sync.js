/*
 * LOKÁLNÍ REŽIM – HARD CLOUD GUARD (FÁZE L1).
 * ---------------------------------------------
 * Chybějící storageScope = dosavadní cloudové chování.
 * I kdyby budoucí UI omylem poslalo lokální poznámku do sync cesty,
 * tyto guardy ji nesmí pustit do Supabase.
 */
function jePoznamkaPouzeLokalniProSync(note) {
  try {
    if (
      window.LubaNoteStorageScope
        ?.jePouzeLokalni?.(note) === true
    ) {
      return true;
    }
  } catch (_) {}

  return note?.storageScope === "local";
}

function jeSecretRecordPouzeLokalniProSync(record) {
  return record?.storageScope === "local";
}

function getLocalNotesForSync() {
  /*
   * Lehká localStorage kopie v overflow režimu nemá Data URL obrázky
   * a nikdy nesmí být omylem považována za autoritativní plnou lokální
   * poznámku. Pokud se IndexedDB cache nepodařila načíst, necháme při
   * online syncu obnovit běžné poznámky z cloudu místo uploadu stripu.
   */
  if (
    window.LubaNoteRegularNotesStore
      ?.chybiPlnaCacheProSync?.() === true
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "STORAGE",
      "REGULAR FULL CACHE MISSING -> CLOUD RECOVERY"
    );
    return [];
  }

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

/*
 * FAST SYNC V1
 *
 * Serverový otisk je pouze malý validační token. Neobsahuje text
 * poznámek ani přílohy. Pokud se otisk i trvalá lokální generace shodují
 * s posledním bezpečně přijatým stavem, není důvod stahovat celý
 * get_notes_safe snapshot. Při jakékoli nejistotě se fast path nepoužije.
 */
const FAST_SYNC_STATE_STORAGE_KEY =
  "lubanotePrivateFastSyncStateV1";

/*
 * SYNC V2.1 – CHANGE FEED CURSOR (PATCH 480)
 *
 * Zatím jde pouze o bezpečný přechodový / pozorovací stav. Cursor se
 * smí posunout jen tehdy, když už jsme jinou cestou potvrdili, že
 * lokální data odpovídají serveru (Fast Sync fingerprint SKIP nebo
 * úspěšně dokončený plný revizní merge).
 *
 * Tento blok NESTAHUJE obsah poznámek a NEMĚNÍ rozhodování V1 syncu.
 * Pouze ověřuje nový serverový change feed a připravuje last_change_seq
 * pro další fázi Sync V2.
 */
const PRIVATE_SYNC_V2_CURSOR_STORAGE_KEY =
  "lubanotePrivateSyncV2CursorV1";

function nactiPrivateSyncV2Cursor(userId) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(
      PRIVATE_SYNC_V2_CURSOR_STORAGE_KEY
    );

    if (!raw) {
      return null;
    }

    const stav = JSON.parse(raw);
    const lastSeq = Number(stav?.lastSeq);

    if (
      String(stav?.userId || "") !== String(userId) ||
      !Number.isFinite(lastSeq) ||
      lastSeq < 0
    ) {
      return null;
    }

    return {
      userId: String(stav.userId),
      lastSeq: Math.floor(lastSeq),
      savedAt: stav.savedAt || null
    };
  } catch (error) {
    console.warn(
      "Sync V2.1: change cursor nebylo možné načíst:",
      error
    );
    return null;
  }
}

function ulozPrivateSyncV2Cursor(userId, lastSeq) {
  const bezpecneSeq = Number(lastSeq);

  if (
    !userId ||
    !Number.isFinite(bezpecneSeq) ||
    bezpecneSeq < 0
  ) {
    return false;
  }

  try {
    localStorage.setItem(
      PRIVATE_SYNC_V2_CURSOR_STORAGE_KEY,
      JSON.stringify({
        userId: String(userId),
        lastSeq: Math.floor(bezpecneSeq),
        savedAt: new Date().toISOString()
      })
    );
    return true;
  } catch (error) {
    console.warn(
      "Sync V2.1: change cursor nebylo možné uložit:",
      error
    );
    return false;
  }
}

async function ziskejPrivateSyncV2Head() {
  const { data, error } = await supabaseClient.rpc(
    "lubanote_get_note_change_head"
  );

  if (error) {
    console.warn(
      "Sync V2.1: change head není dostupný:",
      error.message || error
    );
    return null;
  }

  const head = Number(
    Array.isArray(data) ? data[0] : data
  );

  return Number.isFinite(head) && head >= 0
    ? Math.floor(head)
    : null;
}

async function ziskejPrivateSyncV2ZmenyOd(
  afterSeq,
  limit = 50
) {
  const safeAfter = Math.max(
    0,
    Math.floor(Number(afterSeq) || 0)
  );

  const safeLimit = Math.min(
    200,
    Math.max(1, Math.floor(Number(limit) || 50))
  );

  const { data, error } = await supabaseClient.rpc(
    "lubanote_get_note_changes_since",
    {
      p_after_seq: safeAfter,
      p_limit: safeLimit
    }
  );

  if (error) {
    console.warn(
      "Sync V2.1: change feed není dostupný:",
      error.message || error
    );
    return null;
  }

  return Array.isArray(data) ? data : [];
}

async function potvrdPrivateSyncV2CursorPoShodnemStavu(
  userId
) {
  if (!userId || !navigator.onLine) {
    return false;
  }

  try {
    const ulozeny = nactiPrivateSyncV2Cursor(userId);

    /*
     * První bezpečný bootstrap: aktuální lokální stav už byl ověřen
     * fingerprintem nebo úspěšným plným merge, takže aktuální HEAD
     * můžeme uložit jako výchozí cursor bez stahování jediné poznámky.
     */
    if (!ulozeny) {
      const head = await ziskejPrivateSyncV2Head();

      if (head === null) {
        return false;
      }

      const ulozeno = ulozPrivateSyncV2Cursor(
        userId,
        head
      );

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `CURSOR BOOTSTRAP | seq=${head}`
      );

      return ulozeno;
    }

    /*
     * Pozorovací čtení nového feedu. Volá se jen po potvrzení shody
     * lokálního a serverového stavu, takže případné historické metadata
     * můžeme bezpečně přeskočit/odcursorovat. Obsah poznámek se zde
     * nikdy nestahuje.
     */
    const zmeny = await ziskejPrivateSyncV2ZmenyOd(
      ulozeny.lastSeq,
      50
    );

    if (!zmeny) {
      return false;
    }

    if (zmeny.length === 0) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `DELTA EMPTY | after=${ulozeny.lastSeq}`
      );
      return true;
    }

    let posledniSeq = ulozeny.lastSeq;

    zmeny.forEach((radek) => {
      const seq = Number(radek?.seq);

      if (Number.isFinite(seq)) {
        posledniSeq = Math.max(
          posledniSeq,
          Math.floor(seq)
        );
      }
    });

    if (posledniSeq > ulozeny.lastSeq) {
      ulozPrivateSyncV2Cursor(
        userId,
        posledniSeq
      );
    }

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `DELTA OBSERVE | count=${zmeny.length} ` +
        `seq=${ulozeny.lastSeq}->${posledniSeq}`
    );

    return true;
  } catch (error) {
    /*
     * V2.1 je zatím pouze aditivní observér. Jeho chyba nesmí nikdy
     * změnit nebo zablokovat současný bezpečný sync.
     */
    console.warn(
      "Sync V2.1: cursor observér selhal, V1 zůstává beze změny:",
      error
    );
    return false;
  }
}

let pocetPotvrzenychServerovychZapisu = 0;

function ziskejTrvalouGeneraciLokalnichZmenProFastSync() {
  const hodnota = Number(
    window.LubaNoteStorageState
      ?.ziskejTrvalouGeneraciLokalnichZmenPoznamek
      ?.()
  );

  return Number.isFinite(hodnota) && hodnota >= 0
    ? Math.floor(hodnota)
    : null;
}

function nactiFastSyncStav(userId) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(
      FAST_SYNC_STATE_STORAGE_KEY
    );

    if (!raw) {
      return null;
    }

    const stav = JSON.parse(raw);

    if (
      !stav ||
      typeof stav !== "object" ||
      String(stav.userId || "") !== String(userId) ||
      typeof stav.serverFingerprint !== "string" ||
      !stav.serverFingerprint ||
      !Number.isFinite(Number(stav.localGeneration))
    ) {
      return null;
    }

    return {
      userId: String(stav.userId),
      serverFingerprint: stav.serverFingerprint,
      localGeneration: Number(stav.localGeneration),
      savedAt: stav.savedAt || null
    };
  } catch (error) {
    console.warn(
      "Fast Sync: lokální validační stav nebylo možné načíst:",
      error
    );
    return null;
  }
}

function ulozFastSyncStav({
  userId,
  serverFingerprint,
  localGeneration
}) {
  if (
    !userId ||
    typeof serverFingerprint !== "string" ||
    !serverFingerprint ||
    !Number.isFinite(Number(localGeneration))
  ) {
    return false;
  }

  try {
    localStorage.setItem(
      FAST_SYNC_STATE_STORAGE_KEY,
      JSON.stringify({
        userId: String(userId),
        serverFingerprint,
        localGeneration: Number(localGeneration),
        savedAt: new Date().toISOString()
      })
    );
    return true;
  } catch (error) {
    console.warn(
      "Fast Sync: validační stav nebylo možné uložit:",
      error
    );
    return false;
  }
}

function zrusFastSyncStav() {
  try {
    localStorage.removeItem(
      FAST_SYNC_STATE_STORAGE_KEY
    );
  } catch {
    // Fast path je pouze optimalizace; chyba localStorage nesmí blokovat sync.
  }
}

async function ziskejServerovyPrivateFingerprint() {
  /*
   * PATCH 481 – STUDENÝ START / AUTH RACE
   *
   * Na Androidu se při studeném startu může stát, že lokální session už
   * vrátí uživatele, ale první PostgREST RPC ještě běží se starým /
   * neobnoveným tokenem a skončí 401. Dřívější fallback pak okamžitě
   * spustil get_notes_safe a stáhl celý snapshot.
   *
   * Fingerprint proto jednou krátce zopakujeme. Pokud není dostupný ani
   * potom, obsahový sync se NESMÍ spustit jen proto, že kontrolní RPC
   * selhalo. Volající takový sync bezpečně odloží.
   */
  for (let pokus = 1; pokus <= 2; pokus += 1) {
    try {
      const { data, error } = await supabaseClient.rpc(
        "lubanote_get_private_sync_fingerprint"
      );

      if (error) {
        if (pokus === 1) {
          window.LubaNoteStartupDiag?.zapis?.(
            "FAST",
            "FINGERPRINT RETRY – první RPC selhalo"
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 350)
          );
          continue;
        }

        console.warn(
          "Fast Sync: serverový otisk není dostupný, sync se bezpečně odloží:",
          error.message || error
        );
        return null;
      }

      const vysledek = Array.isArray(data)
        ? data[0]
        : data;

      const fingerprint =
        typeof vysledek === "string"
          ? vysledek
          : vysledek?.fingerprint;

      if (
        typeof fingerprint !== "string" ||
        !fingerprint
      ) {
        console.warn(
          "Fast Sync: server vrátil neplatný otisk, sync se bezpečně odloží."
        );
        return null;
      }

      return {
        fingerprint,
        noteCount: Number(vysledek?.note_count ?? 0),
        maxRevision: Number(vysledek?.max_revision ?? 0)
      };
    } catch (error) {
      if (pokus === 1) {
        window.LubaNoteStartupDiag?.zapis?.(
          "FAST",
          "FINGERPRINT RETRY – výjimka při prvním RPC"
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 350)
        );
        continue;
      }

      console.warn(
        "Fast Sync: kontrola serverového otisku selhala, sync se bezpečně odloží:",
        error
      );
      return null;
    }
  }

  return null;
}

/* PATCH 495 – poslední výsledek malého Fast Sync rozhodnutí držíme
 * i mimo lokální scope diagnostiky. Quota Saver i Existing Client
 * Reconcile tak mohou bezpečně rozlišit BOOTSTRAP-PENDING /
 * LOCAL-CHANGED bez dalšího fingerprint RPC. */
let posledniFastSyncStav = "UNKNOWN";

async function pripravFastSyncPriStartu(user) {
  const diagnostika =
    window.LubaNoteStartupDiag?.zacni?.("FAST SYNC CHECK");

  let stavDiagnostiky = "FULL";

  try {
    if (!user?.id || !navigator.onLine) {
      stavDiagnostiky = "NO-USER/OFFLINE";
      return { preskocit: false, snapshot: null };
    }

    const localGeneration =
      ziskejTrvalouGeneraciLokalnichZmenProFastSync();

    if (localGeneration === null) {
      stavDiagnostiky = "NO-LOCAL-GEN";
      zrusFastSyncStav();
      return { preskocit: false, snapshot: null };
    }

    const server =
      await ziskejServerovyPrivateFingerprint();

    if (!server) {
      /*
       * PATCH 481 – selhání malého kontrolního RPC už nesmí být důvodem
       * k plnému get_notes_safe snapshotu. Fast stav zachováme a sync
       * odložíme; auth-valid / foreground / reconnect ho bezpečně zkusí
       * znovu.
       */
      stavDiagnostiky = "SERVER-CHECK-DEFER";
      return {
        preskocit: false,
        snapshot: null,
        odlozit: true
      };
    }

    const snapshot = {
      userId: user.id,
      serverFingerprint: server.fingerprint,
      localGeneration,
      confirmedWriteCount:
        pocetPotvrzenychServerovychZapisu
    };

    const ulozeny = nactiFastSyncStav(user.id);
    const maCekajiciSmazani =
      nactiCekajiciSmazani().length > 0;

    const shodnyLokalniStav = Boolean(
      ulozeny &&
      Number(ulozeny.localGeneration) ===
        Number(localGeneration)
    );

    const shodnyServer = Boolean(
      ulozeny &&
      ulozeny.serverFingerprint ===
        server.fingerprint
    );

    if (
      ulozeny &&
      shodnyLokalniStav &&
      shodnyServer &&
      !maCekajiciSmazani &&
      aktivniKonfliktySyncu.size === 0
    ) {
      stavDiagnostiky = "SKIP";
      window.LubaNoteStartupDiag?.zapis?.(
        "FAST",
        `PRIVATE SYNC SKIP | notes=${server.noteCount}`
      );

      return {
        preskocit: true,
        snapshot
      };
    }

    if (!ulozeny) {
      stavDiagnostiky = "BOOTSTRAP-PENDING";
    } else if (maCekajiciSmazani) {
      stavDiagnostiky = "PENDING-DELETE";
    } else if (!shodnyLokalniStav) {
      stavDiagnostiky = "LOCAL-CHANGED";
    } else if (!shodnyServer) {
      stavDiagnostiky = "SERVER-CHANGED";
    } else {
      stavDiagnostiky = "SAFE-FULL";
    }

    /*
     * PATCH 484 – pokud je lokální generace beze změny a změnil se
     * pouze server, máme přesně případ pro vzdálené V2 delta čtení.
     * Tato informace je pouze routing hint; samotné delta ještě znovu
     * ověří cursor, revize i lokální stav a při nejistotě NIC hromadně
     * nestáhne.
     */
    const vzdaleneDeltaV2 = Boolean(
      ulozeny &&
      shodnyLokalniStav &&
      !shodnyServer &&
      !maCekajiciSmazani &&
      aktivniKonfliktySyncu.size === 0 &&
      !maCilenyPrivateV2Dluh()
    );

    return {
      preskocit: false,
      snapshot,
      vzdaleneDeltaV2
    };
  } finally {
    posledniFastSyncStav = stavDiagnostiky;
    window.LubaNoteStartupDiag?.konec?.(
      diagnostika,
      stavDiagnostiky
    );
  }
}

function ulozFastSyncStavPoPlnemSyncu(snapshot) {
  if (!snapshot?.userId || !snapshot.serverFingerprint) {
    return false;
  }

  const aktualniGenerace =
    ziskejTrvalouGeneraciLokalnichZmenProFastSync();

  const behemSyncuSeZapisovaloNaServer =
    pocetPotvrzenychServerovychZapisu !==
    snapshot.confirmedWriteCount;

  if (
    aktualniGenerace === null ||
    Number(aktualniGenerace) !==
      Number(snapshot.localGeneration) ||
    behemSyncuSeZapisovaloNaServer ||
    nactiCekajiciSmazani().length > 0 ||
    aktivniKonfliktySyncu.size > 0
  ) {
    zrusFastSyncStav();
    return false;
  }

  return ulozFastSyncStav({
    userId: snapshot.userId,
    serverFingerprint:
      snapshot.serverFingerprint,
    localGeneration: aktualniGenerace
  });
}

/*
 * EGRESS GUARD 477
 *
 * Běžný plný sync často sám zapíše jednu nebo více lokálních změn na
 * server. Před-sync fingerprint pak už z principu neplatí a starší kód
 * Fast Sync stav zrušil. Následný návrat do aplikace proto znovu stáhl
 * celý get_notes_safe snapshot, i když se od posledního syncu nic
 * nezměnilo.
 *
 * Po ÚSPĚŠNÉM plném syncu proto v takovém případě načteme pouze malý
 * serverový fingerprint a potvrdíme jím právě dokončený lokální stav.
 * Neobsahuje text poznámek ani přílohy a nijak neobchází revision merge.
 */
async function obnovFastSyncStavPoUspesnemPlnemSyncu(userId) {
  if (
    !userId ||
    !navigator.onLine ||
    nactiCekajiciSmazani().length > 0 ||
    aktivniKonfliktySyncu.size > 0
  ) {
    return false;
  }

  const localGeneration =
    ziskejTrvalouGeneraciLokalnichZmenProFastSync();

  if (localGeneration === null) {
    return false;
  }

  const server = await ziskejServerovyPrivateFingerprint();

  if (!server?.fingerprint) {
    return false;
  }

  return ulozFastSyncStav({
    userId,
    serverFingerprint: server.fingerprint,
    localGeneration
  });
}

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

/* PATCH 586 – LOCAL MODE HARD GATE.
   Aktivní prostor "Toto zařízení" nesmí spouštět obsahový notes sync.
   Účet, Demo a plán dál ověřuje supabaseClient.js; tato brána se týká
   pouze obsahu poznámek / targeted V2 / bootstrapu / reconcile. */
function jeAktivniRezimPouzeTotoZarizeni() {
  return (
    window.LubaNoteStorageScope?.ziskejAktivni?.() ===
    "local"
  );
}

function nastavStavPouzeTotoZarizeni() {
  nastavStavSynchronizaceUI("local");
}

let probihajiciLokalniStartBezObsahovehoSyncu = null;

async function dokoncitLokalniStartBezObsahovehoSyncu() {
  if (probihajiciLokalniStartBezObsahovehoSyncu) {
    return probihajiciLokalniStartBezObsahovehoSyncu;
  }

  probihajiciLokalniStartBezObsahovehoSyncu =
    (async () => {
      nastavStavPouzeTotoZarizeni();

      /* Lokální servisní kroky zachováme, ale žádný obsah neposíláme
         ani nestahujeme ze Supabase. */
      try {
        if (
          typeof window.LubaNoteRecurring
            ?.migrujStareOpakovaniPlanneru === "function"
        ) {
          await window.LubaNoteRecurring
            .migrujStareOpakovaniPlanneru();
        }
      } catch (error) {
        console.warn(
          "Local režim: migrace opakování se dokončí později:",
          error
        );
      }

      oznamObsahPripravenyProSplash();

      try {
        if (
          typeof obnovNotifikaceOpakovanychPoznamek ===
          "function"
        ) {
          await obnovNotifikaceOpakovanychPoznamek();
        }
      } catch (error) {
        console.warn(
          "Local režim: obnova lokálních notifikací se dokončí později:",
          error
        );
      }

      window.LubaNoteStartupDiag?.zapis?.(
        "LOCAL",
        "LOCAL MODE READY | content sync disabled"
      );

      return true;
    })();

  try {
    return await probihajiciLokalniStartBezObsahovehoSyncu;
  } finally {
    probihajiciLokalniStartBezObsahovehoSyncu = null;
  }
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

    aktivujTargetV2SitovouPauzu(error);

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

  zrusTargetV2SitovouPauzu("write-ok");

  /*
   * Počítadlo slouží Fast Syncu pouze k bezpečnému poznání, zda plný
   * sync během svého běhu sám změnil serverový otisk. Pokud ano,
   * předstartovní token se nesmí uložit jako nový potvrzený stav.
   */
  pocetPotvrzenychServerovychZapisu += 1;

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

/*
 * PATCH 488 – TARGETED DELETE / OFFLINE QUEUE
 *
 * Tombstone po úspěšném save_note_safe nemažeme z lokální fronty hned.
 * Nejdřív si do stejného persistentního záznamu uložíme potvrzenou
 * serverovou revizi. Pokud aplikace mezi zápisem a potvrzením change
 * feedu spadne, po restartu už DELETE znovu neposíláme – pouze bezpečně
 * dokončíme V2 cursor/fingerprint potvrzení.
 */
function maCekajiciSmazaniPotvrzenouServerovouRevizi(zaznam) {
  return Number.isFinite(Number(zaznam?.uploadedRevision));
}

function nactiNeodeslanaCekajiciSmazani() {
  return nactiCekajiciSmazani().filter(
    (zaznam) =>
      !maCekajiciSmazaniPotvrzenouServerovouRevizi(zaznam) &&
      !zaznam?.blockedReason
  );
}

function nactiBlokovanaCekajiciSmazani() {
  return nactiCekajiciSmazani().filter(
    (zaznam) => Boolean(zaznam?.blockedReason)
  );
}

function oznacCekajiciSmazaniJakoOdeslane(
  noteId,
  uploadedRevision
) {
  const revize = Number(uploadedRevision);

  if (!noteId || !Number.isFinite(revize)) {
    return false;
  }

  const zaznamy = nactiCekajiciSmazani();
  let zmeneno = false;

  const nove = zaznamy.map((zaznam) => {
    if (String(zaznam?.id || "") !== String(noteId)) {
      return zaznam;
    }

    zmeneno = true;
    return {
      ...zaznam,
      uploadedRevision: revize,
      uploadedAt: new Date().toISOString(),
      blockedReason: null
    };
  });

  if (zmeneno) {
    ulozCekajiciSmazani(nove);
  }

  return zmeneno;
}

function zablokujCekajiciSmazani(noteId, duvod, detail = null) {
  if (!noteId) {
    return false;
  }

  const zaznamy = nactiCekajiciSmazani();
  let zmeneno = false;

  const nove = zaznamy.map((zaznam) => {
    if (String(zaznam?.id || "") !== String(noteId)) {
      return zaznam;
    }

    zmeneno = true;
    return {
      ...zaznam,
      blockedReason: duvod || "blocked",
      blockedAt: new Date().toISOString(),
      blockedDetail: detail || null
    };
  });

  if (zmeneno) {
    ulozCekajiciSmazani(nove);
  }

  return zmeneno;
}

function pridejCekajiciSmazani(
  noteId,
  deletedAt = new Date().toISOString(),
  expectedRevision = null
) {
  if (!noteId) {
    return;
  }

  zrusObsahovyTargetKvuliSmazani(noteId);

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

/*
 * Hromadné trvalé smazání může obsahovat stovky poznámek.
 * Frontu tombstonů proto načteme a uložíme jen jednou.
 */
function pridejCekajiciSmazaniHromadne(
  poznamky,
  deletedAt = new Date().toISOString()
) {
  const seznam = (Array.isArray(poznamky) ? poznamky : [])
    .filter((poznamka) => poznamka?.id);

  if (seznam.length === 0) {
    return 0;
  }

  const mapa = new Map(
    nactiCekajiciSmazani()
      .filter((zaznam) => zaznam?.id)
      .map((zaznam) => [zaznam.id, zaznam])
  );

  const deviceId = getDeviceId();

  seznam.forEach((poznamka) => {
    zrusObsahovyTargetKvuliSmazani(poznamka.id);

    const meta = ziskejCloudSyncMeta(poznamka.id);
    const expectedRevision =
      Number.isFinite(Number(meta?.revision))
        ? Number(meta.revision)
        : 0;

    mapa.set(poznamka.id, {
      id: poznamka.id,
      deletedAt,
      deviceId,
      expectedRevision
    });
  });

  ulozCekajiciSmazani(Array.from(mapa.values()));
  return seznam.length;
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

  /*
   * PATCH 488 – záznam, který už server přijal, znovu neposíláme.
   * Po případném restartu pouze obnovíme in-memory mapu revizí a
   * závěrečné V2 potvrzení dokončí cursor/fingerprint.
   */
  for (const zaznam of cekajici) {
    if (
      zaznam?.id &&
      maCekajiciSmazaniPotvrzenouServerovouRevizi(zaznam)
    ) {
      potvrzeneCileneRevizeV2.set(
        String(zaznam.id),
        Number(zaznam.uploadedRevision)
      );
    }
  }

  const blokovana = nactiBlokovanaCekajiciSmazani();

  if (blokovana.length > 0) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET DELETE BLOCKED | count=${blokovana.length}`
    );
    return false;
  }

  const neodeslana = nactiNeodeslanaCekajiciSmazani();

  for (const zaznam of neodeslana) {
    const deletedAt =
      zaznam.deletedAt ||
      new Date().toISOString();

    const expectedRevision =
      Number.isFinite(
        Number(zaznam.expectedRevision)
      )
        ? Number(zaznam.expectedRevision)
        : 0;

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET DELETE UPLOAD | id=${zaznam.id}`
    );

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
        /* Delete konflikt má vlastní bezpečný režim níže. */
        oznamitKonflikt: false
      });

    if (!vysledek.ok) {
      const duvod =
        vysledek?.result?.reason || null;

      if (duvod === "revision_mismatch") {
        /*
         * Starší zařízení NESMÍ automaticky smazat novější revizi.
         * Frontu ponecháme persistentně zablokovanou a hlavně ji
         * nezkoušíme každých 1,5 s znovu – tím chráníme data i egress.
         * Samostatný targeted conflict recovery může později stáhnout
         * pouze toto jedno ID; full snapshot se zde nikdy nespustí.
         */
        zablokujCekajiciSmazani(
          zaznam.id,
          "revision_mismatch",
          {
            expectedRevision,
            serverRevision:
              vysledek?.result?.revision ?? null
          }
        );

        oznamKonfliktSynchronizace(
          zaznam.id,
          "delete_revision_mismatch",
          {
            expectedRevision,
            serverRevision:
              vysledek?.result?.revision ?? null
          }
        );

        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `TARGET DELETE CONFLICT | id=${zaznam.id}`
        );
        return false;
      }

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `TARGET DELETE DEFER | id=${zaznam.id}`
      );
      return false;
    }

    const revize = Number(
      vysledek?.result?.revision ??
      ziskejCloudSyncMeta(zaznam.id)?.revision
    );

    if (!Number.isFinite(revize)) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `TARGET DELETE DEFER | revision-missing id=${zaznam.id}`
      );
      return false;
    }

    oznacCekajiciSmazaniJakoOdeslane(
      zaznam.id,
      revize
    );

    potvrzeneCileneRevizeV2.set(
      String(zaznam.id),
      revize
    );

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET DELETE SAVED | id=${zaznam.id} rev=${revize}`
    );
  }

  return (
    nactiNeodeslanaCekajiciSmazani().length === 0 &&
    nactiBlokovanaCekajiciSmazani().length === 0
  );
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

async function uploadLocalNoteToSupabase(note, moznosti = {}) {
  if (jePoznamkaPouzeLokalniProSync(note)) {
    window.LubaNoteStartupDiag?.zapis?.(
      "LOCAL",
      `CLOUD WRITE BLOCKED | id=${note?.id || "?"}`
    );

    if (moznosti?.vratitDetailV2 === true) {
      return {
        ok: true,
        wrote: false,
        reason: "local_only"
      };
    }

    return true;
  }

  const user = await getCurrentUser();

  if (!user || !note?.id) {
    return false;
  }

  let dataToStore = note;
  let mediaChranenaE2E = false;

  /*
   * PATCH 551 – E2E FOTOGRAFIE BĚŽNÝCH POZNÁMEK.
   * ------------------------------------------------
   * Jakmile poznámka obsahuje inline data:image, starý plaintext fallback
   * je ZAKÁZANÝ. Fotografie se před serverovým zápisem vyjmou z HTML,
   * zašifrují odděleným AES-GCM media klíčem odvozeným ze stejného
   * hlavního hesla jako Secret a do JSONu se uloží jen ciphertext +
   * reference. Bez device media klíče odvozeného ze stejného
   * hlavního hesla se zápis raději odloží; nikdy nesmí pokračovat původní
   * Data URL cestou.
   */
  if (note.isSecret !== true) {
    const fallbackMaFotografii = [
      note?.richContent,
      ...(Array.isArray(note?.todos) ? note.todos.map((todo) => todo?.html) : [])
    ].some((html) =>
      typeof html === "string" &&
      /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html)
    );

    const mediaCrypto = window.LubaNoteMediaCrypto;
    const maFotografii = mediaCrypto?.maPlaintextFotografie
      ? mediaCrypto.maPlaintextFotografie(note) === true
      : fallbackMaFotografii;

    if (maFotografii) {
      if (
        mediaCrypto?.pripravMediaKlicZeZarizeni &&
        mediaCrypto.jeKlicDostupny?.() !== true
      ) {
        await mediaCrypto.pripravMediaKlicZeZarizeni();
      }

      if (
        !mediaCrypto?.pripravPoznamkuProCloud ||
        mediaCrypto.jeKlicDostupny?.() !== true
      ) {
        mediaCrypto?.oznamNutneOdemceni?.(false);
        console.warn(
          `LubaNote media E2E: cloudový zápis ${note.id} byl odložen, protože media klíč není dostupný.`
        );

        if (moznosti?.vratitDetailV2 === true) {
          return {
            ok: false,
            wrote: false,
            reason: "media_key_locked"
          };
        }

        return false;
      }

      try {
        dataToStore = await mediaCrypto
          .pripravPoznamkuProCloud(note);
        mediaChranenaE2E =
          mediaCrypto.maSifrovanaMedia?.(dataToStore) === true;
      } catch (error) {
        console.error(
          "LubaNote media E2E: šifrování fotografie před syncem selhalo.",
          error
        );

        if (moznosti?.vratitDetailV2 === true) {
          return {
            ok: false,
            wrote: false,
            reason: error?.code || "media_encrypt_failed",
            error
          };
        }

        return false;
      }

      if (!mediaChranenaE2E) {
        console.error(
          "LubaNote media E2E: ochranný guard zastavil zápis – fotografie nebyla převedena na ciphertext."
        );
        return false;
      }
    }
  }

  /*
   * Starý cloud-shadow JPEG uploader smí běžet už jen pro obsah, který
   * nepoužívá nový E2E media payload. U fotografie chráněné patchem 551
   * je Storage plaintext upload výslovně zakázaný.
   */
  if (
    note.isSecret !== true &&
    !mediaChranenaE2E &&
    window.LubaNoteAttachmentsCloud
      ?.zajistiStinovePrilohyPoznamkyVCloudu
  ) {
    try {
      const stavPriloh =
        await window.LubaNoteAttachmentsCloud
          .zajistiStinovePrilohyPoznamkyVCloudu(note);

      if (stavPriloh?.ok !== true) {
        console.warn(
          "LubaNote attachments: některá stínová cloudová příloha zatím není nahraná.",
          stavPriloh
        );
      }
    } catch (error) {
      console.warn(
        "LubaNote attachments: příprava cloudové stínové přílohy selhala.",
        error
      );
    }
  }

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
    /*
     * PATCH 483 – targeted upload.
     *
     * Běžná V2 změna už při revizním konfliktu nesmí spustit celý
     * get_notes_safe snapshot. Stáhneme pouze konfliktující note_id
     * přes RPC z patch 482 a použijeme stejná revision pravidla jako
     * dosavadní bezpečný merge.
     */
    if (moznosti?.cilenyV2 === true) {
      const cileneVyreseno =
        await vyresCilenyKonfliktBeznePoznamkyV2(
          note,
          vysledek?.result || {}
        );

      if (moznosti?.vratitDetailV2 === true) {
        return {
          ok: cileneVyreseno === true,
          wrote: false,
          conflictResolved:
            cileneVyreseno === true
        };
      }

      return cileneVyreseno === true;
    }

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
        await cloud.synchronizujReferencePrilohPoznamky(
          mediaChranenaE2E ? dataToStore : note
        );
      } else if (cloud.oznacPrilohyPoznamkyJakoAktivni) {
        /*
         * Kompatibilní fallback pro případ, že klient krátce běží proti
         * starší serverové/JS vrstvě bez reconciliation RPC.
         */
        await cloud.oznacPrilohyPoznamkyJakoAktivni(
          mediaChranenaE2E ? dataToStore : note
        );
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

  if (
    vysledek.ok &&
    mediaChranenaE2E &&
    note.isSecret !== true
  ) {
    window.LubaNoteMediaCrypto
      ?.oznacMigrovano?.(note.id);
  }

  if (moznosti?.vratitDetailV2 === true) {
    return {
      ok: vysledek.ok === true,
      wrote: vysledek.ok === true,
      revision:
        vysledek?.result?.revision ??
        ziskejCloudSyncMeta(note.id)?.revision ??
        null,
      error: vysledek?.error || null,
      accessDenied: vysledek?.accessDenied === true,
      limit: vysledek?.limit === true
    };
  }

  return vysledek.ok;
}

async function uploadEncryptedSecretRecordToSupabase(record) {
  if (jeSecretRecordPouzeLokalniProSync(record)) {
    window.LubaNoteStartupDiag?.zapis?.(
      "LOCAL",
      `SECRET CLOUD WRITE BLOCKED | id=${record?.id || "?"}`
    );
    return true;
  }

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

  if (jePoznamkaPouzeLokalniProSync(note)) {
    window.LubaNoteStartupDiag?.zapis?.(
      "LOCAL",
      `CLOUD DELETE BLOCKED | id=${note.id}`
    );
    return true;
  }

  const deletedAt = new Date().toISOString();
  const meta = ziskejCloudSyncMeta(note.id);
  const expectedRevision =
    Number.isFinite(Number(meta?.revision))
      ? Number(meta.revision)
      : 0;

  /*
   * PATCH 488 – permanentní smazání je vždy nejdřív persistentní
   * lokální tombstone fronta. UI tedy nečeká na síť a offline delete
   * přežije i kill aplikace. Samotný save_note_safe provede centrální
   * targeted V2 worker; žádný full snapshot zde není.
   */
  pridejCekajiciSmazani(
    note.id,
    deletedAt,
    expectedRevision
  );

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET DELETE QUEUE | id=${note.id} rev=${expectedRevision}`
  );

  oznacLokalniZmenuCekajiciNaSync();

  if (navigator.onLine) {
    naplanujSynchronizaciPoLokalniZmene(120);
  }

  return true;
}





/*
 * PATCH 485 – HARD EGRESS FUSE
 *
 * get_notes_safe vrací celý obsah všech private poznámek a je proto
 * nejdražší síťová operace v LubaNote. Od tohoto patche NESMÍ být
 * spuštěna automaticky ze startu, foregroundu, Secret unlocku ani jako
 * fallback po chybě/konfliktu. Full snapshot je povolen pouze uvnitř
 * výslovně označeného recovery volání syncNotes({ recoveryFullSnapshot:true }).
 * Běžný provoz používá fingerprint + change feed + targeted RPC.
 */
let recoveryFullSnapshotPovolen = false;

const LIMIT_NACTENI_CLOUDU_MS = 12000;
const CEKANI_PRED_OPAKOVANIM_CLOUDU_MS = 800;
const KOD_TIMEOUTU_CLOUD_SYNCU = "LUBANOTE_CLOUD_SYNC_TIMEOUT";

function vytvorChybuTimeoutuCloudSyncu() {
  const chyba = new Error(
    "Synchronizace byla zastavena: načtení cloudu trvalo příliš dlouho."
  );
  chyba.code = KOD_TIMEOUTU_CLOUD_SYNCU;
  return chyba;
}

function jeTimeoutCloudSyncu(error) {
  return error?.code === KOD_TIMEOUTU_CLOUD_SYNCU;
}

async function nactiCloudSnapshotJednimPokusem() {
  if (recoveryFullSnapshotPovolen !== true) {
    window.LubaNoteStartupDiag?.zapis?.(
      "EGRESS",
      "FULL SNAPSHOT BLOCKED | get_notes_safe"
    );

    const chyba = new Error(
      "Automatický full snapshot je zablokovaný ochranou egressu."
    );
    chyba.code = "LUBANOTE_FULL_SNAPSHOT_BLOCKED";
    throw chyba;
  }

  const kontroler =
    typeof AbortController === "function"
      ? new AbortController()
      : null;

  let vyprselLimit = false;
  let casovac = null;

  let pozadavek = supabaseClient.rpc("get_notes_safe");

  if (
    kontroler &&
    typeof pozadavek?.abortSignal === "function"
  ) {
    pozadavek = pozadavek.abortSignal(kontroler.signal);
  }

  const timeout = new Promise((_, reject) => {
    casovac = setTimeout(() => {
      vyprselLimit = true;

      try {
        kontroler?.abort();
      } catch (_) {
        // Abort je jen úklid; timeout musí fungovat i bez něj.
      }

      reject(vytvorChybuTimeoutuCloudSyncu());
    }, LIMIT_NACTENI_CLOUDU_MS);
  });

  try {
    return await Promise.race([pozadavek, timeout]);
  } catch (error) {
    if (vyprselLimit || jeTimeoutCloudSyncu(error)) {
      throw vytvorChybuTimeoutuCloudSyncu();
    }

    throw error;
  } finally {
    if (casovac !== null) {
      clearTimeout(casovac);
    }
  }
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
   *
   * Jednorázově zatuhlé RPC nesmí držet celé UI téměř 100 sekund.
   * Po 12 s první čtení bezpečně ukončíme a jednou ho zopakujeme.
   * Jde pouze o read-only snapshot; merge/revision logika pod tímto
   * blokem se nijak nemění.
   */
  let vysledek;

  try {
    vysledek = await nactiCloudSnapshotJednimPokusem();
  } catch (error) {
    if (!jeTimeoutCloudSyncu(error)) {
      throw error;
    }

    window.LubaNoteStartupDiag?.zapis?.(
      "RETRY",
      "get_notes_safe timeout – druhý pokus"
    );

    if (!navigator.onLine) {
      throw error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, CEKANI_PRED_OPAKOVANIM_CLOUDU_MS);
    });

    vysledek = await nactiCloudSnapshotJednimPokusem();
  }

  const { data, error } = vysledek || {};

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

  /* PATCH 551 – cloudové běžné poznámky mohou obsahovat E2E media
     trezor. Dešifrujeme jej ještě PŘED revision merge, aby všechny
     existující porovnávací cesty dál pracovaly s kanonickým lokálním
     plaintext modelem a nevytvářely falešné konflikty. */
  if (window.LubaNoteMediaCrypto?.pripravCloudRadkyProLokalniPouziti) {
    return await window.LubaNoteMediaCrypto
      .pripravCloudRadkyProLokalniPouziti(data);
  }

  return data;
}


async function ziskejVlastniSdileneIdProSync() {
  const diagCelaKontrola =
    window.LubaNoteStartupDiag?.zacni?.("SYNC GUARD – OWNED SHARED");
  const diagAuth =
    window.LubaNoteStartupDiag?.zacni?.("SYNC GUARD AUTH – OWNED SHARED");
  const user = await getCurrentUser();
  window.LubaNoteStartupDiag?.konec?.(diagAuth, user ? "OK" : "NO-USER");

  if (!user || !navigator.onLine) {
    window.LubaNoteStartupDiag?.konec?.(
      diagCelaKontrola,
      !navigator.onLine ? "OFFLINE" : "NO-USER"
    );
    return new Set();
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      "lubanote_get_my_owned_shared_notes_safe"
    );

    if (error) {
      window.LubaNoteStartupDiag?.konec?.(
        diagCelaKontrola,
        "RPC-CHYBA"
      );
      console.warn(
        "LubaNote sync: seznam vlastních sdílených poznámek se nepodařilo načíst; běžný sync je pro jistotu nepovažuje za shared.",
        error
      );
      return new Set();
    }

    const radky = Array.isArray(data)
      ? data
      : Array.isArray(data?.notes)
        ? data.notes
        : [];

    const vysledek = new Set(
      radky
        .map((row) => row?.note_id || row?.id || null)
        .filter(Boolean)
    );

    window.LubaNoteStartupDiag?.konec?.(
      diagCelaKontrola,
      `OK count=${vysledek.size}`
    );

    return vysledek;
  } catch (error) {
    window.LubaNoteStartupDiag?.konec?.(diagCelaKontrola, "CHYBA");
    console.warn(
      "LubaNote sync: detekce vlastních sdílených poznámek selhala.",
      error
    );
    return new Set();
  }
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
  idPoznamekEditovanychJinde = new Set(),
  vlastniSdileneId = new Set()
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

      /*
       * VLASTNÍ SDÍLENÁ POZNÁMKA
       * --------------------------------------------------------
       * Jakmile má poznámka přijatého spolupracovníka, její společný
       * obsah už nesmí řešit starý private revision merge. Jinak změna
       * provedená collaborator-em v shared editoru vypadá vlastníkovi
       * jako "změna z druhého zařízení" a starý ochranný algoritmus
       * správně, ale zbytečně vytvoří konfliktní kopii.
       *
       * Shared obsah je autoritativní na serveru a editace obou stran
       * prochází jediným shared lockem. Proto vlastník po skončení
       * cizího aktivního lease bezpečně převezme cloudovou revizi a
       * private sync ji nikdy neposílá zpět přes save_note_safe().
       */
      if (vlastniSdileneId.has(row.id)) {
        vynutitCloudId.add(row.id);
        prijmoutCloudMetaId.add(row.id);
        zrusKonfliktSynchronizace(row.id);
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
 * SYNC V2.2 – TARGETED DOWNLOAD PRO KONFLIKT (PATCH 483)
 *
 * RPC z patch 482 vrací pouze konkrétně vyžádané note_id. Tato cesta
 * se používá při konfliktu targeted uploadu, aby jedna kolidující
 * poznámka nikdy nebyla důvodem stáhnout celý get_notes_safe snapshot.
 */
async function nactiCloudPoznamkyPodleIdV2(noteIds) {
  const ids = Array.from(
    new Set(
      (Array.isArray(noteIds) ? noteIds : [])
        .filter(Boolean)
        .map((id) => String(id))
    )
  ).slice(0, 200);

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient.rpc(
    "lubanote_get_notes_by_ids_safe",
    {
      p_note_ids: ids
    }
  );

  if (error) {
    console.warn(
      "Sync V2: targeted download selhal:",
      error.message || error
    );

    if (jeChybaOdeprenehoPristupu(error)) {
      oznamOdeprenyPristupUctu(error);
    }

    return null;
  }

  const radky = Array.isArray(data) ? data : [];

  if (window.LubaNoteMediaCrypto?.pripravCloudRadkyProLokalniPouziti) {
    try {
      return await window.LubaNoteMediaCrypto
        .pripravCloudRadkyProLokalniPouziti(radky);
    } catch (error) {
      console.warn(
        "Sync V2: targeted download šifrovaných fotografií čeká na odemčení Secret.",
        error
      );
      return null;
    }
  }

  return radky;
}


/*
 * SYNC V2.4 – SAFE BOOTSTRAP NOVÉHO ZAŘÍZENÍ (PATCH 486)
 *
 * Čistý prohlížeč / nová instalace nemá lokální cache ani Fast Sync stav.
 * PATCH 485 proto správně zablokoval automatický get_notes_safe snapshot.
 * Tento patch doplňuje jedinou bezpečnou cestu prvního načtení:
 *
 *   1) uživatel musí stažení výslovně potvrdit v LubaNote modalu,
 *   2) server vrátí jen malý manifest BEZ data jsonb,
 *   3) živé poznámky se stáhnou po malých targeted dávkách přes RPC 482,
 *   4) tombstones se podle manifestu zpracují bez stažení jejich obsahu,
 *   5) po přerušení se při dalším pokusu podle revision + lokální meta
 *      přeskočí vše, co už bylo bezpečně uloženo,
 *   6) Fast Sync + V2 cursor se potvrdí až po úplném dokončení.
 *
 * Nikde v této cestě se nepovoluje get_notes_safe().
 */
const SAFE_BOOTSTRAP_PROGRESS_KEY =
  "lubanotePrivateSafeBootstrapV2V1";
const SAFE_BOOTSTRAP_MAX_IDS_V_DAVCE = 12;
const SAFE_BOOTSTRAP_MAX_BAJTU_V_DAVCE = 180 * 1024;

let safeBootstrapPraveBezi = false;
let safeBootstrapNabidnutUserId = null;
let safeBootstrapModalDokoncen = false;

function nactiSafeBootstrapMarker(userId) {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(
      SAFE_BOOTSTRAP_PROGRESS_KEY
    );

    if (!raw) return null;

    const stav = JSON.parse(raw);

    if (String(stav?.userId || "") !== String(userId)) {
      return null;
    }

    return stav;
  } catch (error) {
    console.warn(
      "Safe Bootstrap: stav pokračování nebylo možné načíst:",
      error
    );
    return null;
  }
}

function ulozSafeBootstrapMarker(userId) {
  if (!userId) return false;

  try {
    const puvodni =
      nactiSafeBootstrapMarker(userId) || {};

    localStorage.setItem(
      SAFE_BOOTSTRAP_PROGRESS_KEY,
      JSON.stringify({
        userId: String(userId),
        startedAt:
          puvodni.startedAt || new Date().toISOString(),
        lastAttemptAt: new Date().toISOString()
      })
    );

    return true;
  } catch (error) {
    console.warn(
      "Safe Bootstrap: stav pokračování nebylo možné uložit:",
      error
    );
    return false;
  }
}

function zrusSafeBootstrapMarker() {
  try {
    localStorage.removeItem(
      SAFE_BOOTSTRAP_PROGRESS_KEY
    );
  } catch (_) {}
}

function formatBootstrapVelikost(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value < 1024) {
    return `${Math.round(value)} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} kB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function ziskejSafeBootstrapModalPrvky() {
  if (typeof document === "undefined") {
    return null;
  }

  const modal = document.getElementById(
    "safeBootstrapModal"
  );
  const title = document.getElementById(
    "safeBootstrapTitle"
  );
  const text = document.getElementById(
    "safeBootstrapText"
  );
  const start = document.getElementById(
    "safeBootstrapStartButton"
  );
  const later = document.getElementById(
    "safeBootstrapLaterButton"
  );

  if (!modal || !title || !text || !start || !later) {
    return null;
  }

  return { modal, title, text, start, later };
}

function maLokalniDataProSafeBootstrap() {
  try {
    const regular =
      typeof nactiBeznePoznamkyZUloziste === "function"
        ? nactiBeznePoznamkyZUloziste()
        : getLocalNotesForSync();

    if (Array.isArray(regular) && regular.length > 0) {
      return true;
    }

    if (
      typeof nactiSifrovaneTajneZaznamy === "function" &&
      nactiSifrovaneTajneZaznamy().length > 0
    ) {
      return true;
    }

    if (
      typeof nactiStarePlaintextTajnePoznamky === "function" &&
      nactiStarePlaintextTajnePoznamky().length > 0
    ) {
      return true;
    }
  } catch (error) {
    /* Při nejistotě zařízení nepovažujeme za čisté. */
    return true;
  }

  return false;
}

function nastavSafeBootstrapModal({
  title,
  text,
  startText = "Načíst data",
  laterText = "Později",
  startHidden = false,
  laterHidden = false,
  disabled = false
} = {}) {
  const ui = ziskejSafeBootstrapModalPrvky();
  if (!ui) return null;

  ui.title.textContent = title || "Načíst data z cloudu";
  ui.text.textContent = text || "";
  ui.start.textContent = startText;
  ui.later.textContent = laterText;
  ui.start.hidden = Boolean(startHidden);
  ui.later.hidden = Boolean(laterHidden);
  ui.start.disabled = Boolean(disabled);
  ui.later.disabled = Boolean(disabled);
  ui.modal.hidden = false;

  return ui;
}

function zavriSafeBootstrapModal() {
  const ui = ziskejSafeBootstrapModalPrvky();
  if (ui) ui.modal.hidden = true;
}

async function nactiSafeBootstrapManifestV2() {
  const { data, error } = await supabaseClient.rpc(
    "lubanote_get_private_bootstrap_manifest"
  );

  if (error) {
    console.warn(
      "Safe Bootstrap: manifest se nepodařilo načíst:",
      error.message || error
    );

    if (jeChybaOdeprenehoPristupu(error)) {
      oznamOdeprenyPristupUctu(error);
    }

    const chyba = new Error(
      "Serverový bootstrap manifest není dostupný."
    );
    chyba.code = "LUBANOTE_BOOTSTRAP_MANIFEST_FAILED";
    chyba.cause = error;
    throw chyba;
  }

  return (Array.isArray(data) ? data : [])
    .filter((row) => row?.id)
    .map((row) => ({
      id: String(row.id),
      revision: Number(row.revision),
      updated_at: row.updated_at || null,
      deleted_at: row.deleted_at || null,
      is_secret: row.is_secret === true,
      approx_bytes: Math.max(
        0,
        Number(row.approx_bytes) || 0
      )
    }));
}

function ulozBootstrapCloudMetaRadky(rows) {
  const mapa = nactiCloudSyncMetaMapu();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.id || !Number.isFinite(Number(row.revision))) {
      continue;
    }

    mapa[String(row.id)] = {
      revision: Number(row.revision),
      localUpdatedAt:
        row.deleted_at
          ? null
          : row.updated_at || null,
      serverUpdatedAt: row.updated_at || null
    };

    zrusKonfliktSynchronizace(String(row.id));
  }

  ulozCloudSyncMetaMapu(mapa);
}

function ziskejBootstrapLokalniId() {
  const regularIds = new Set();
  const secretIds = new Set();

  try {
    const regular =
      typeof nactiBeznePoznamkyZUloziste === "function"
        ? nactiBeznePoznamkyZUloziste()
        : getLocalNotesForSync();

    for (const note of Array.isArray(regular) ? regular : []) {
      if (note?.id && note?.isSecret !== true) {
        regularIds.add(String(note.id));
      }
    }
  } catch (_) {}

  try {
    if (typeof getSecretNoteIds === "function") {
      for (const id of getSecretNoteIds()) {
        if (id) secretIds.add(String(id));
      }
    } else if (
      typeof nactiSifrovaneTajneZaznamy === "function"
    ) {
      for (const record of nactiSifrovaneTajneZaznamy()) {
        if (record?.id) secretIds.add(String(record.id));
      }
    }
  } catch (_) {}

  return { regularIds, secretIds };
}

function jeBootstrapRadekJizBezpecneLokalne(
  manifestRow,
  lokalniIds
) {
  if (!manifestRow?.id || manifestRow.deleted_at) {
    return false;
  }

  const meta = ziskejCloudSyncMeta(manifestRow.id);

  if (
    !meta ||
    Number(meta.revision) !== Number(manifestRow.revision)
  ) {
    return false;
  }

  if (manifestRow.is_secret === true) {
    return lokalniIds.secretIds.has(manifestRow.id);
  }

  return lokalniIds.regularIds.has(manifestRow.id);
}

function vytvorSafeBootstrapDavky(manifestRows) {
  const vysledek = [];
  let aktualni = [];
  let aktualniBytes = 0;

  for (const row of Array.isArray(manifestRows) ? manifestRows : []) {
    const rowBytes = Math.max(
      1,
      Number(row?.approx_bytes) || 1
    );

    const prekrociPocet =
      aktualni.length >= SAFE_BOOTSTRAP_MAX_IDS_V_DAVCE;
    const prekrociVelikost =
      aktualni.length > 0 &&
      aktualniBytes + rowBytes >
        SAFE_BOOTSTRAP_MAX_BAJTU_V_DAVCE;

    if (prekrociPocet || prekrociVelikost) {
      vysledek.push(aktualni);
      aktualni = [];
      aktualniBytes = 0;
    }

    aktualni.push(row);
    aktualniBytes += rowBytes;
  }

  if (aktualni.length > 0) {
    vysledek.push(aktualni);
  }

  return vysledek;
}

async function aplikujSafeBootstrapRadky(rows) {
  const cloudRows = Array.isArray(rows) ? rows : [];

  const regularMapa = new Map(
    (
      typeof nactiBeznePoznamkyZUloziste === "function"
        ? nactiBeznePoznamkyZUloziste()
        : getLocalNotesForSync()
    )
      .filter((note) => note?.id && note?.isSecret !== true)
      .map((note) => [String(note.id), note])
  );

  const encryptedMapa = new Map(
    (
      typeof nactiSifrovaneTajneZaznamy === "function"
        ? nactiSifrovaneTajneZaznamy()
        : []
    )
      .filter((record) => record?.id)
      .map((record) => [String(record.id), record])
  );

  const secretUnlocked = Boolean(
    typeof tajnySifrovaciKlic !== "undefined" &&
    tajnySifrovaciKlic &&
    typeof tajnyRezimOdemceny !== "undefined" &&
    tajnyRezimOdemceny === true
  );

  const decryptedMapa = new Map(
    secretUnlocked &&
    typeof getDesifrovaneTajnePoznamky === "function"
      ? (getDesifrovaneTajnePoznamky() || [])
          .filter((note) => note?.id)
          .map((note) => [String(note.id), note])
      : []
  );

  for (const row of cloudRows) {
    const id = String(row?.id || "");
    if (!id) continue;

    /* Lokální-only ID je pro cloud nedotknutelné. */
    if (
      jePoznamkaPouzeLokalniProSync(
        regularMapa.get(id)
      ) ||
      jeSecretRecordPouzeLokalniProSync(
        encryptedMapa.get(id)
      )
    ) {
      continue;
    }

    if (row.deleted_at) {
      regularMapa.delete(id);
      encryptedMapa.delete(id);
      decryptedMapa.delete(id);
      continue;
    }

    if (jeLegacyCloudSecretRow(row)) {
      const chyba = new Error(
        "Cloud obsahuje starší Secret formát, který Safe Bootstrap nesmí uložit jako plaintext."
      );
      chyba.code = "LUBANOTE_BOOTSTRAP_LEGACY_SECRET";
      throw chyba;
    }

    if (jeSifrovanyCloudSecretRow(row)) {
      const record = vytvorCloudEncryptedRecord(row);

      if (!record) {
        throw new Error(
          `Safe Bootstrap: neplatný Secret řádek ${id}`
        );
      }

      regularMapa.delete(id);
      encryptedMapa.set(id, record);

      if (secretUnlocked) {
        if (typeof desifrujTajnouPoznamku !== "function") {
          throw new Error(
            "Safe Bootstrap: Secret decrypt není dostupný."
          );
        }

        const note = await desifrujTajnouPoznamku(
          record.encrypted,
          id
        );

        decryptedMapa.set(id, {
          ...note,
          id,
          updatedAt: record.updatedAt || note?.updatedAt,
          isSecret: true
        });
      }

      continue;
    }

    const note = vytvorCloudRegularNote(row);

    if (!note) {
      throw new Error(
        `Safe Bootstrap: nepodporovaný řádek ${id}`
      );
    }

    encryptedMapa.delete(id);
    decryptedMapa.delete(id);
    regularMapa.set(id, note);
  }

  if (typeof ulozBeznePoznamkyPrimo !== "function") {
    throw new Error(
      "Safe Bootstrap: lokální úložiště běžných poznámek není dostupné."
    );
  }

  const regularOk = await ulozBeznePoznamkyPrimo(
    Array.from(regularMapa.values())
  );

  if (regularOk === false) {
    throw new Error(
      "Safe Bootstrap: uložení běžných poznámek selhalo."
    );
  }

  if (typeof ulozSifrovaneTajneZaznamy === "function") {
    ulozSifrovaneTajneZaznamy(
      Array.from(encryptedMapa.values())
    );
  } else if (encryptedMapa.size > 0) {
    throw new Error(
      "Safe Bootstrap: lokální Secret úložiště není dostupné."
    );
  }

  if (
    secretUnlocked &&
    typeof nastavDesifrovaneTajnePoznamky === "function"
  ) {
    nastavDesifrovaneTajnePoznamky(
      Array.from(decryptedMapa.values())
    );
  }

  ulozBootstrapCloudMetaRadky(cloudRows);
}

async function aplikujSafeBootstrapTombstones(
  manifestRows
) {
  const tombstones = (Array.isArray(manifestRows) ? manifestRows : [])
    .filter((row) => row?.id && row.deleted_at);

  if (tombstones.length === 0) return;

  const pseudoRows = tombstones.map((row) => ({
    id: row.id,
    revision: row.revision,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    data: null
  }));

  await aplikujSafeBootstrapRadky(pseudoRows);
}

function aktualizujSafeBootstrapProgress(
  hotovo,
  celkem,
  approxBytes
) {
  nastavSafeBootstrapModal({
    title: "Načítám data z cloudu",
    text:
      `Připraveno ${hotovo} / ${celkem} poznámek. ` +
      `Cloudový obsah je přibližně ${formatBootstrapVelikost(approxBytes)}. ` +
      "Skutečný RX/TX vidíš průběžně nahoře.",
    startText: "Načítám…",
    laterHidden: true,
    disabled: true
  });
}

async function dokonciSafeBootstrapV2(userId, headStart) {
  const headEnd = await ziskejPrivateSyncV2Head();

  if (headEnd === null) {
    return false;
  }

  if (!ulozPrivateSyncV2Cursor(userId, headStart)) {
    return false;
  }

  if (headEnd > headStart) {
    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      `DELTA AFTER BOOTSTRAP | ${headStart}->${headEnd}`
    );

    const deltaOk =
      await synchronizujVzdalenePrivateDeltaV2(userId);

    if (deltaOk !== true) {
      return false;
    }

    return true;
  }

  if (headEnd < headStart) {
    return false;
  }

  const server = await ziskejServerovyPrivateFingerprint();

  if (!server?.fingerprint) {
    return false;
  }

  /* Stejná ochrana jako u targeted uploadu: fingerprint nesmíme
     potvrdit proti cursoru, pokud se mezi oběma malými RPC server
     změnil. Druhý HEAD uzavírá tuto race bez full snapshotu. */
  const headPoFingerprintu =
    await ziskejPrivateSyncV2Head();

  if (headPoFingerprintu !== headEnd) {
    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      `CONFIRM RACE | head=${headEnd}->${headPoFingerprintu ?? "?"}`
    );
    return false;
  }

  const localGeneration =
    ziskejTrvalouGeneraciLokalnichZmenProFastSync();

  if (localGeneration === null) {
    return false;
  }

  const fastOk = ulozFastSyncStav({
    userId,
    serverFingerprint: server.fingerprint,
    localGeneration
  });

  if (!fastOk) return false;

  return ulozPrivateSyncV2Cursor(
    userId,
    headPoFingerprintu
  );
}

async function spustSafeBootstrapV2(
  userId,
  { automaticky = false } = {}
) {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    window.LubaNoteStartupDiag?.zapis?.(
      "LOCAL",
      "SAFE BOOTSTRAP SKIP | local mode"
    );
    return false;
  }

  if (
    safeBootstrapPraveBezi ||
    !userId ||
    !navigator.onLine
  ) {
    if (!navigator.onLine && !automaticky) {
      nastavSafeBootstrapModal({
        title: "Bez internetu",
        text:
          "Načtení dat se nespustilo. Po připojení klepni na Pokračovat.",
        startText: "Pokračovat",
        laterHidden: Boolean(
          nactiSafeBootstrapMarker(userId)
        )
      });
    }
    return false;
  }

  safeBootstrapPraveBezi = true;
  safeBootstrapModalDokoncen = false;
  ulozSafeBootstrapMarker(userId);
  nastavStavSynchronizaceUI("syncing");
  window.LubaNoteSyncTraffic?.zacniSync?.();

  const diag = window.LubaNoteStartupDiag?.zacni?.(
    "SAFE BOOTSTRAP"
  );
  let diagStav = "CHYBA";

  try {
    if (
      maCilenyPrivateV2Dluh() ||
      nactiCekajiciSmazani().length > 0 ||
      aktivniKonfliktySyncu.size > 0
    ) {
      const chyba = new Error(
        "Safe Bootstrap: nejdřív je potřeba dokončit čekající lokální změny."
      );
      chyba.code = "LUBANOTE_BOOTSTRAP_LOCAL_DEBT";
      throw chyba;
    }

    const generacePriStartu =
      ziskejTrvalouGeneraciLokalnichZmenProFastSync();
    const revizeLokalnihoStavuPriStartu =
      ziskejReviziLokalnichZmenProSync();

    if (generacePriStartu === null) {
      throw new Error(
        "Safe Bootstrap: lokální generace není dostupná."
      );
    }

    const headStart = await ziskejPrivateSyncV2Head();

    if (headStart === null) {
      throw new Error(
        "Safe Bootstrap: serverový cursor není dostupný."
      );
    }

    const manifest = await nactiSafeBootstrapManifestV2();
    const liveRows = manifest.filter(
      (row) => !row.deleted_at
    );
    const approxBytes = liveRows.reduce(
      (sum, row) => sum + (Number(row.approx_bytes) || 0),
      0
    );

    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      `MANIFEST | rows=${manifest.length} live=${liveRows.length} deleted=${manifest.length - liveRows.length} approx=${Math.round(approxBytes / 1024)}kB head=${headStart}`
    );

    /* Tombstones nepotřebují data jsonb – odstraníme je jen podle
       malého manifestu a tím šetříme egress už při prvním načtení. */
    await aplikujSafeBootstrapTombstones(manifest);

    const lokalniIds = ziskejBootstrapLokalniId();
    const pending = liveRows.filter(
      (row) =>
        !jeBootstrapRadekJizBezpecneLokalne(
          row,
          lokalniIds
        )
    );

    let hotovo = liveRows.length - pending.length;
    if (!automaticky) {
      aktualizujSafeBootstrapProgress(
        hotovo,
        liveRows.length,
        approxBytes
      );
    }

    const davky = vytvorSafeBootstrapDavky(pending);

    for (let i = 0; i < davky.length; i += 1) {
      if (
        ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
          generacePriStartu ||
        lokalniStavSeBehemSyncuZmenil(
          revizeLokalnihoStavuPriStartu
        )
      ) {
        const chyba = new Error(
          "Safe Bootstrap: během načítání vznikla lokální změna; pokračování bylo zastaveno."
        );
        chyba.code = "LUBANOTE_BOOTSTRAP_LOCAL_CHANGED";
        throw chyba;
      }

      const davka = davky[i];
      const ids = davka.map((row) => row.id);
      const cloudRows = await nactiCloudPoznamkyPodleIdV2(ids);

      if (!cloudRows) {
        throw new Error(
          `Safe Bootstrap: dávku ${i + 1}/${davky.length} se nepodařilo stáhnout.`
        );
      }

      const vraceneIds = new Set(
        cloudRows
          .filter((row) => row?.id)
          .map((row) => String(row.id))
      );
      const chybejici = ids.filter(
        (id) => !vraceneIds.has(String(id))
      );

      if (chybejici.length > 0) {
        const headNow = await ziskejPrivateSyncV2Head();

        if (headNow === null || headNow <= headStart) {
          throw new Error(
            `Safe Bootstrap: server nevrátil ${chybejici.length} očekávaných poznámek.`
          );
        }

        window.LubaNoteStartupDiag?.zapis?.(
          "BOOTSTRAP",
          `ROW MOVED DURING DOWNLOAD | count=${chybejici.length}`
        );
      }

      await aplikujSafeBootstrapRadky(cloudRows);

      /* Za úspěšně vyřešené považujeme celou dávku. Chybějící ID
         vzniklé souběžnou serverovou změnou zachytí závěrečný delta
         průchod od headStart. */
      hotovo += davka.length;

      if (!automaticky) {
        aktualizujSafeBootstrapProgress(
          Math.min(hotovo, liveRows.length),
          liveRows.length,
          approxBytes
        );
      }

      window.LubaNoteStartupDiag?.zapis?.(
        "BOOTSTRAP",
        `BATCH | ${Math.min(hotovo, liveRows.length)}/${liveRows.length} ids=${ids.length}`
      );
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

    if (
      ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
        generacePriStartu ||
      lokalniStavSeBehemSyncuZmenil(
        revizeLokalnihoStavuPriStartu
      )
    ) {
      const chyba = new Error(
        "Safe Bootstrap: lokální data se během načítání změnila."
      );
      chyba.code = "LUBANOTE_BOOTSTRAP_LOCAL_CHANGED";
      throw chyba;
    }

    const potvrzeno = await dokonciSafeBootstrapV2(
      userId,
      headStart
    );

    if (!potvrzeno) {
      const chyba = new Error(
        "Data se během načítání změnila. Další pokus naváže jen chybějícími změnami."
      );
      chyba.code = "LUBANOTE_BOOTSTRAP_CONFIRM_DEFER";
      throw chyba;
    }

    zrusSafeBootstrapMarker();
    nastavKoncovyStavSynchronizaceUI();
    diagStav = "OK";

    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      `COMPLETE | live=${liveRows.length} approx=${Math.round(approxBytes / 1024)}kB`
    );

    /* Úplně nový prázdný účet může až teď bezpečně vytvořit uvítací
       kartu. Pokud vznikne, následující V2 průchod stáhne jen její ID. */
    await provedOnboardingPoBezpecnemSyncu({
      blokovatStart: false
    });

    try {
      await spustRychlySyncPoznamekBezpecne();
    } catch (_) {
      /* Onboarding delta se může dokončit při příštím foregroundu. */
    }

    if (automaticky) {
      /* PATCH 564 – čisté nové zařízení už po přihlášení a odemčení
         hlavního hesla nepotřebuje další potvrzovací modal. Safe
         Bootstrap proběhne automaticky a UI skončí rovnou ve stavu
         Synchronizováno. Interní targeted ochrany zůstávají zachované. */
      safeBootstrapModalDokoncen = false;
      zavriSafeBootstrapModal();
    } else {
      safeBootstrapModalDokoncen = true;
      nastavSafeBootstrapModal({
        title: "Data jsou načtená",
        text:
          `Hotovo. Na tomto zařízení je připraveno ${liveRows.length} cloudových poznámek. ` +
          "Další běžná synchronizace už používá pouze malé V2 změny.",
        startHidden: true,
        laterText: "Zavřít"
      });
    }

    return true;
  } catch (error) {
    console.warn(
      "Safe Bootstrap byl bezpečně přerušen:",
      error
    );

    nastavStavSynchronizaceUI("pending");

    const legacySecret =
      error?.code === "LUBANOTE_BOOTSTRAP_LEGACY_SECRET";

    if (automaticky && !legacySecret) {
      /* Automatický první start nesmí uživatele uvěznit v opakovaném
         klikání na „Pokračovat“. Marker zůstává uložený a další běžný
         foreground/start bezpečně naváže. */
      zavriSafeBootstrapModal();
      window.LubaNoteStartupDiag?.zapis?.(
        "BOOTSTRAP",
        "AUTO DEFER | resume-next-start"
      );
    } else {
      nastavSafeBootstrapModal({
        title: legacySecret
          ? "Starší Secret data"
          : "Načítání je pozastavené",
        text: legacySecret
          ? "V cloudu je starší Secret formát. LubaNote ho z bezpečnostních důvodů neuloží jako plaintext. Nejdřív ho převeď na aktuální Secret formát na zařízení, kde Secret funguje."
          : "Načtení se bezpečně přerušilo. Nic se nemaže a při dalším pokusu LubaNote naváže pouze chybějícími změnami.",
        startText: legacySecret
          ? "Zkusit znovu"
          : "Pokračovat",
        laterHidden: true
      });
    }

    return false;
  } finally {
    safeBootstrapPraveBezi = false;
    window.LubaNoteStartupDiag?.konec?.(
      diag,
      diagStav
    );
    window.LubaNoteSyncTraffic?.dokonciSync?.();
  }
}

function nabidniSafeBootstrapPokudJeTreba(userId) {
  if (
    !userId ||
    safeBootstrapNabidnutUserId === String(userId)
  ) {
    return;
  }

  const marker = nactiSafeBootstrapMarker(userId);
  const maLokalniData = maLokalniDataProSafeBootstrap();

  /* Bez rozpracovaného bootstrapu nikdy nenabízíme přepis zařízení,
     které už nějaká lokální data má. To je recovery problém, ne first
     bootstrap, a musí se řešit zvlášť bez domněnek. */
  if (!marker && maLokalniData) {
    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      "OFFER BLOCKED | local-data-present"
    );
    return;
  }

  safeBootstrapNabidnutUserId = String(userId);

  setTimeout(() => {
    const ui = nastavSafeBootstrapModal({
      title: marker
        ? "Dokončit načítání dat"
        : "Načíst data z cloudu?",
      text: marker
        ? "Předchozí načítání nebylo dokončeno. Pokračování stáhne jen chybějící nebo změněné poznámky; full snapshot zůstává zablokovaný."
        : "Na tomto zařízení zatím nejsou poznámky. LubaNote bezpečně načte cloudová data a po případném přerušení dokáže navázat bez opakovaného stahování hotových změn.",
      startText: marker ? "Pokračovat" : "Načíst data",
      laterText: "Později",
      laterHidden: Boolean(marker)
    });

    if (!ui) return;

    ui.start.onclick = () => {
      spustSafeBootstrapV2(userId).catch(() => {});
    };

    ui.later.onclick = () => {
      if (safeBootstrapModalDokoncen) {
        safeBootstrapModalDokoncen = false;
      }
      zavriSafeBootstrapModal();
    };

    window.LubaNoteStartupDiag?.zapis?.(
      "BOOTSTRAP",
      marker ? "OFFER | resume" : "OFFER | clean-client"
    );
  }, 80);
}


/*
 * SYNC V2.5 – EXISTING CLIENT RECONCILE (PATCH 495)
 *
 * PATCH 485 záměrně zablokoval automatický full snapshot. Existující
 * klient s lokálními daty ale mohl po změně localGeneration skončit ve
 * stavu LOCAL-CHANGED a neměl bezpečnou cestu zpět do Fast Syncu.
 *
 * Reconcile proto používá pouze:
 *   - malý bootstrap manifest bez data jsonb,
 *   - targeted RPC 482 jen pro ID, jejichž cloudový obsah opravdu
 *     potřebujeme porovnat/stáhnout,
 *   - stejná revision/meta conflict pravidla jako původní bezpečný merge.
 *
 * get_notes_safe() se zde NIKDY nepovoluje.
 */
let existingClientReconcilePraveBezi = null;
let existingClientReconcilePosledniPokus = 0;
const EXISTING_RECONCILE_COOLDOWN_MS = 15000;
/* Nouzový měsíční quota guard: automatický reconcile nikdy nesmí
 * překvapit několika MB targeted downloadu při ztracené lokální meta.
 * Manifest je malý; obsah nad tento rozpočet se pouze odloží. */
const EXISTING_RECONCILE_AUTO_RX_BUDGET = 256 * 1024;

function nactiLokalniSnapshotProExistingReconcile() {
  const localRegular = getLocalNotesForSync();
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

  const { winners } = vytvorMapuVitezu(
    localRegular,
    localEncrypted,
    localLegacySecret,
    localDecryptedSecret,
    []
  );

  return {
    localRegular,
    localEncrypted,
    localLegacySecret,
    localDecryptedSecret,
    winners
  };
}

function existingReconcileLokalniStavBezeZmeny(
  generacePriStartu,
  revizePriStartu
) {
  return (
    ziskejTrvalouGeneraciLokalnichZmenProFastSync() ===
      generacePriStartu &&
    !lokalniStavSeBehemSyncuZmenil(revizePriStartu)
  );
}

function jeExistingReconcileWinnerSecret(winner) {
  return winner?.type === "secret";
}

function najdiAktualniWinnerProExistingReconcile(noteId) {
  if (!noteId) return null;
  return nactiLokalniSnapshotProExistingReconcile()
    .winners.get(String(noteId)) || null;
}

async function uploadExistingReconcileWinnerV2(noteId) {
  const winner = najdiAktualniWinnerProExistingReconcile(noteId);

  if (!winner) {
    return false;
  }

  if (winner.type === "regular" && winner.note) {
    const detail = await uploadLocalNoteToSupabase(
      winner.note,
      {
        cilenyV2: true,
        vratitDetailV2: true
      }
    );

    return detail?.ok === true;
  }

  if (winner.type === "secret") {
    if (winner.note) {
      const detail = await uploadLocalNoteToSupabase(
        {
          ...winner.note,
          id: noteId,
          isSecret: true
        },
        {
          cilenyV2: true,
          vratitDetailV2: true
        }
      );

      return detail?.ok === true;
    }

    if (winner.record) {
      return await uploadEncryptedSecretRecordToSupabase(
        winner.record
      );
    }
  }

  return false;
}

async function spustExistingClientReconcileV2(userId, { force = false } = {}) {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    return false;
  }

  if (!userId || !navigator.onLine) {
    return false;
  }

  if (existingClientReconcilePraveBezi) {
    return existingClientReconcilePraveBezi;
  }

  const ted = Date.now();
  if (
    !force &&
    ted - existingClientReconcilePosledniPokus <
      EXISTING_RECONCILE_COOLDOWN_MS
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "RECONCILE DEFER | cooldown"
    );
    return false;
  }

  existingClientReconcilePosledniPokus = ted;

  existingClientReconcilePraveBezi = (async () => {
    if (
      maCilenyPrivateV2Dluh() ||
      nactiCekajiciSmazani().length > 0 ||
      aktivniKonfliktySyncu.size > 0
    ) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "RECONCILE DEFER | local-debt"
      );
      return false;
    }

    const diag = window.LubaNoteStartupDiag?.zacni?.(
      "V2 EXISTING RECONCILE"
    );
    let diagStav = "CHYBA";

    nastavStavSynchronizaceUI("syncing");
    window.LubaNoteSyncTraffic?.zacniSync?.();

    try {
      const generacePriStartu =
        ziskejTrvalouGeneraciLokalnichZmenProFastSync();
      const revizePriStartu =
        ziskejReviziLokalnichZmenProSync();

      if (generacePriStartu === null) {
        return false;
      }

      const headStart = await ziskejPrivateSyncV2Head();
      if (headStart === null) {
        return false;
      }

      const [manifest, vlastniSdileneId, idEditovanychJinde] =
        await Promise.all([
          nactiSafeBootstrapManifestV2(),
          ziskejVlastniSdileneIdProSync(),
          ziskejIdPoznamekEditovanychJinde()
        ]);

      if (
        !existingReconcileLokalniStavBezeZmeny(
          generacePriStartu,
          revizePriStartu
        )
      ) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "RECONCILE DEFER | local-changed-during-manifest"
        );
        return false;
      }

      const lokalni = nactiLokalniSnapshotProExistingReconcile();
      const manifestMapa = new Map(
        manifest.map((row) => [String(row.id), row])
      );

      const fetchManifestRows = [];
      const pseudoTombstones = [];
      const localUploadIds = new Set();
      const unresolvedIds = new Set();
      // DIAG 607: pouze vysvětluje, PROČ zůstalo ID unresolved.
      // Nemění rozhodování reconcile, pořadí requestů ani obsah syncu.
      const unresolvedDuvody = new Map();
      const oznacUnresolved = (idRaw, duvod) => {
        const id = String(idRaw);
        unresolvedIds.add(id);
        if (!unresolvedDuvody.has(id)) unresolvedDuvody.set(id, new Set());
        unresolvedDuvody.get(id).add(String(duvod || "unknown"));
      };

      for (const row of manifest) {
        const id = String(row.id);
        const winner = lokalni.winners.get(id);
        const meta = ziskejCloudSyncMeta(id);

        if (row.deleted_at) {
          if (
            winner ||
            !meta ||
            Number(meta.revision) !== Number(row.revision)
          ) {
            pseudoTombstones.push({
              id,
              revision: row.revision,
              updated_at: row.updated_at,
              deleted_at: row.deleted_at,
              data: null
            });
          }
          continue;
        }

        if (!winner) {
          fetchManifestRows.push(row);
          continue;
        }

        const typeMismatch =
          Boolean(row.is_secret) !==
          jeExistingReconcileWinnerSecret(winner);

        if (!meta || typeMismatch) {
          fetchManifestRows.push(row);
          continue;
        }

        const cloudSeZmenil =
          Number(meta.revision) !== Number(row.revision);
        const localSeZmenil =
          !jsouStejneCasoveZnacky(
            winner.updatedAt,
            meta.localUpdatedAt
          );

        if (cloudSeZmenil) {
          fetchManifestRows.push(row);
        } else if (localSeZmenil) {
          if (vlastniSdileneId.has(id)) {
            /*
             * PATCH 608 – OWNED SHARED JE SERVER-AUTORITATIVNÍ.
             * -------------------------------------------------
             * Vlastní sdílená poznámka nikdy nesmí skončit v private
             * uploadu přes save_note_safe(). Zároveň ji ale nesmíme
             * nechat jako unresolved jen proto, že lokální updatedAt
             * vypadá "dirty" při stejné serverové revizi.
             *
             * Starý plný revision merge už má správné pravidlo:
             * owned-shared => cloud/shared server vyhrává. V2 existing
             * reconcile proto targeted stáhne právě tento jeden řádek
             * a stejný merge ho bezpečně přijme do lokální cache.
             *
             * DŮLEŽITÉ: neuploadovat tuto větev a nevracet sem
             * shared-owner-local-dirty unresolved. Jinak se sync zasekne
             * na pending a opakovanými retry zbytečně vyrábí egress.
             */
            fetchManifestRows.push(row);
            window.LubaNoteStartupDiag?.zapis?.(
              "V2",
              `RECONCILE OWNED SHARED REFRESH | id=${id}`
            );
          } else {
            localUploadIds.add(id);
          }
        }
      }

      /* Lokální ID, které serverový owner manifest vůbec nezná.
       * Bez cloud meta jde typicky o offline/legacy novou poznámku a
       * bezpečně ji pošleme targeted. Známé ID chybějící ze serveru
       * nehádáme – mohlo dojít k převodu vlastnictví. */
      for (const [id] of lokalni.winners.entries()) {
        if (manifestMapa.has(id)) continue;

        if (
          window.LubaNoteSharingNotes
            ?.jeSdilenaPoznamka?.(id) === true
        ) {
          continue;
        }

        const meta = ziskejCloudSyncMeta(id);
        if (meta) {
          oznacUnresolved(id, "local-known-missing-from-owner-manifest");
        } else {
          localUploadIds.add(id);
        }
      }

      const odhadFetchBytes = fetchManifestRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row?.approx_bytes) || 0),
        0
      );

      if (
        odhadFetchBytes > EXISTING_RECONCILE_AUTO_RX_BUDGET
      ) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `RECONCILE DEFER | budget fetch=${fetchManifestRows.length} approx=${Math.round(odhadFetchBytes / 1024)}kB limit=${Math.round(EXISTING_RECONCILE_AUTO_RX_BUDGET / 1024)}kB`
        );
        nastavStavSynchronizaceUI("pending");
        return false;
      }

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `RECONCILE PLAN | manifest=${manifest.length} fetch=${fetchManifestRows.length} approx=${Math.round(odhadFetchBytes / 1024)}kB upload=${localUploadIds.size} tombstones=${pseudoTombstones.length}`
      );

      const cloudRows = [...pseudoTombstones];
      const davky = vytvorSafeBootstrapDavky(fetchManifestRows);

      for (let i = 0; i < davky.length; i += 1) {
        if (
          !existingReconcileLokalniStavBezeZmeny(
            generacePriStartu,
            revizePriStartu
          )
        ) {
          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            "RECONCILE DEFER | local-changed-during-download"
          );
          return false;
        }

        const ids = davky[i].map((row) => row.id);
        const rows = await nactiCloudPoznamkyPodleIdV2(ids);

        if (!rows) {
          return false;
        }

        const returned = new Set(
          rows.filter((row) => row?.id).map((row) => String(row.id))
        );

        for (const id of ids) {
          if (!returned.has(String(id))) {
            oznacUnresolved(id, "targeted-fetch-missing");
          }
        }

        cloudRows.push(...rows);

        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `RECONCILE BATCH | ${i + 1}/${davky.length} ids=${ids.length}`
        );
      }

      if (
        !existingReconcileLokalniStavBezeZmeny(
          generacePriStartu,
          revizePriStartu
        )
      ) {
        return false;
      }

      const shodneSecretId =
        await ziskejShodneSecretIdProRevizniMerge(
          lokalni.localDecryptedSecret,
          cloudRows
        );

      const revizniMerge = pripravRevizniMerge(
        lokalni.localRegular,
        lokalni.localEncrypted,
        lokalni.localLegacySecret,
        lokalni.localDecryptedSecret,
        cloudRows,
        shodneSecretId,
        idEditovanychJinde,
        vlastniSdileneId
      );

      for (const id of revizniMerge.vynutitLocalId) {
        if (!vlastniSdileneId.has(id)) {
          localUploadIds.add(String(id));
        }
      }

      for (const id of revizniMerge.konfliktniId) {
        oznacUnresolved(id, "revision-merge-conflict");
      }

      for (const id of idEditovanychJinde) {
        if (
          cloudRows.some((row) => String(row?.id || "") === String(id))
        ) {
          oznacUnresolved(id, "remote-editor-active");
        }
      }

      if (revizniMerge.konfliktniKopie.length > 0) {
        const aktualniRegular = getLocalNotesForSync();
        const existujiciIds = new Set(
          aktualniRegular.filter((n) => n?.id).map((n) => String(n.id))
        );
        const noveKopie = revizniMerge.konfliktniKopie.filter(
          (note) => note?.id && !existujiciIds.has(String(note.id))
        );

        if (noveKopie.length > 0) {
          const ok = await ulozBeznePoznamkyPrimo([
            ...aktualniRegular,
            ...noveKopie
          ]);

          if (ok === false) {
            return false;
          }

          for (const note of noveKopie) {
            localUploadIds.add(String(note.id));
          }
        }
      }

      const cloudApplyRows = cloudRows.filter((row) =>
        row?.id &&
        revizniMerge.prijmoutCloudMetaId.has(String(row.id)) &&
        !revizniMerge.konfliktniId.has(String(row.id)) &&
        !idEditovanychJinde.has(String(row.id))
      );

      if (cloudApplyRows.length > 0) {
        if (
          !existingReconcileLokalniStavBezeZmeny(
            generacePriStartu,
            revizePriStartu
          )
        ) {
          return false;
        }

        await aplikujSafeBootstrapRadky(cloudApplyRows);
      }

      for (const id of localUploadIds) {
        if (
          unresolvedIds.has(id) ||
          vlastniSdileneId.has(id) ||
          window.LubaNoteSharingNotes
            ?.jeSdilenaPoznamka?.(id) === true
        ) {
          continue;
        }

        if (
          !existingReconcileLokalniStavBezeZmeny(
            generacePriStartu,
            revizePriStartu
          )
        ) {
          return false;
        }

        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `RECONCILE UPLOAD | id=${id}`
        );

        const ok = await uploadExistingReconcileWinnerV2(id);
        if (ok !== true) {
          oznacUnresolved(id, "upload-failed");
          break;
        }
      }

      if (unresolvedIds.size > 0) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `RECONCILE DEFER | unresolved=${unresolvedIds.size} id=${Array.from(unresolvedIds)[0]}`
        );

        // DIAG 607: vypsat každé problematické ID + důvod a bezpečná metadata.
        // Žádný obsah poznámky ani title se neloguje.
        for (const id of unresolvedIds) {
          const meta = ziskejCloudSyncMeta(id);
          const winner = lokalni.winners.get(id);
          const row = manifestMapa.get(id);
          const duvody = Array.from(unresolvedDuvody.get(id) || ["unknown"]).join(",");
          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            `RECONCILE UNRESOLVED | id=${id} | reason=${duvody} | manifest=${row ? "Y" : "N"} | local=${winner ? "Y" : "N"} | ownShared=${vlastniSdileneId.has(id) ? "Y" : "N"} | shared=${window.LubaNoteSharingNotes?.jeSdilenaPoznamka?.(id) === true ? "Y" : "N"} | metaRev=${meta?.revision ?? "-"} | cloudRev=${row?.revision ?? "-"}`
          );
        }

        nastavStavSynchronizaceUI("pending");
        return false;
      }

      if (
        !existingReconcileLokalniStavBezeZmeny(
          generacePriStartu,
          revizePriStartu
        )
      ) {
        return false;
      }

      const potvrzeno = await dokonciSafeBootstrapV2(
        userId,
        headStart
      );

      if (potvrzeno !== true) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "RECONCILE DEFER | confirm"
        );
        nastavStavSynchronizaceUI("pending");
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

      nastavKoncovyStavSynchronizaceUI();
      posledniFastSyncStav = "SKIP";
      diagStav = "OK";

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `RECONCILE COMPLETE | manifest=${manifest.length} fetch=${fetchManifestRows.length} cloudApply=${cloudApplyRows.length} upload=${localUploadIds.size}`
      );

      return true;
    } catch (error) {
      console.warn(
        "Existing Client Reconcile byl bezpečně odložen:",
        error
      );
      nastavStavSynchronizaceUI("pending");
      return false;
    } finally {
      window.LubaNoteStartupDiag?.konec?.(diag, diagStav);
      window.LubaNoteSyncTraffic?.dokonciSync?.();
    }
  })();

  try {
    return await existingClientReconcilePraveBezi;
  } finally {
    existingClientReconcilePraveBezi = null;
  }
}

/*
 * SYNC V2.3 – VZDÁLENÝ TARGETED DOWNLOAD (PATCH 484)
 *
 * Používá se pouze tehdy, když Fast Sync prokázal:
 *   - lokální generace se od posledního potvrzeného stavu nezměnila,
 *   - změnil se serverový fingerprint,
 *   - nejsou pending delete / aktivní konflikty / targeted upload dluhy.
 *
 * Change feed vrátí jen metadata note_id. Obsah se stáhne výhradně přes
 * lubanote_get_notes_by_ids_safe() pro dotčená ID. Při jakékoli
 * nejistotě se delta ODLOŽÍ a tato cesta sama nikdy nespustí
 * get_notes_safe(). Full snapshot tak zůstává jen recovery cestou.
 */
async function synchronizujVzdalenePrivateDeltaV2(userId) {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    return false;
  }

  if (!userId || !navigator.onLine) {
    return false;
  }

  if (
    maCilenyPrivateV2Dluh() ||
    nactiCekajiciSmazani().length > 0 ||
    aktivniKonfliktySyncu.size > 0
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | local-debt"
    );
    return false;
  }

  const cursor = nactiPrivateSyncV2Cursor(userId);

  if (!cursor) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | cursor-missing"
    );
    return false;
  }

  const revizeLokalnihoStavuPriStartu =
    ziskejReviziLokalnichZmenProSync();
  const generacePriStartu =
    ziskejTrvalouGeneraciLokalnichZmenProFastSync();

  if (generacePriStartu === null) {
    return false;
  }

  const zmeny = await ziskejPrivateSyncV2ZmenyOd(
    cursor.lastSeq,
    200
  );

  if (!zmeny) {
    return false;
  }

  if (zmeny.length === 0) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `REMOTE DELTA DEFER | empty-after=${cursor.lastSeq}`
    );
    return false;
  }

  if (zmeny.length >= 200) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | feed-limit"
    );
    return false;
  }

  let posledniSeq = cursor.lastSeq;
  const idsKeStazeni = new Set();

  for (const radek of zmeny) {
    const seq = Number(radek?.seq);
    const id = String(radek?.note_id || "");

    if (Number.isFinite(seq)) {
      posledniSeq = Math.max(
        posledniSeq,
        Math.floor(seq)
      );
    }

    if (!id) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "REMOTE DELTA DEFER | missing-id"
      );
      return false;
    }

    /*
     * Hard delete / převod vlastnictví zůstává konzervativně odložený.
     * Důležité je, že PATCH 485 ani zde nikdy nepadá na full snapshot.
     */
    if (radek?.action !== "upsert") {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `REMOTE DELTA DEFER | action=${radek?.action || "?"} id=${id}`
      );
      return false;
    }

    idsKeStazeni.add(id);
  }

  if (
    lokalniStavSeBehemSyncuZmenil(
      revizeLokalnihoStavuPriStartu
    ) ||
    ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
      generacePriStartu
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | local-changed-before-download"
    );
    return false;
  }

  const ids = Array.from(idsKeStazeni);

  /*
   * Owned Shared poznámku nesmí private V2 přebrat. Její vlastní
   * shared editor/sync zůstává autoritou.
   */
  const vlastniSdileneId =
    await ziskejVlastniSdileneIdProSync();

  if (ids.some((id) => vlastniSdileneId.has(id))) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | owned-shared"
    );
    return false;
  }

  const cloudRows = await nactiCloudPoznamkyPodleIdV2(ids);

  if (!cloudRows) {
    return false;
  }

  const cloudMapa = new Map(
    cloudRows
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );

  for (const id of ids) {
    if (!cloudMapa.has(String(id))) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `REMOTE DELTA DEFER | row-missing id=${id}`
      );
      return false;
    }
  }

  const lokalniSecretIds = (() => {
    try {
      if (typeof getSecretNoteIds === "function") {
        return new Set(
          Array.from(getSecretNoteIds()).map(String)
        );
      }
    } catch (_) {}

    const idsFallback = new Set();

    if (typeof nactiSifrovaneTajneZaznamy === "function") {
      for (const record of nactiSifrovaneTajneZaznamy()) {
        if (record?.id) idsFallback.add(String(record.id));
      }
    }

    if (typeof getDesifrovaneTajnePoznamky === "function") {
      for (const note of getDesifrovaneTajnePoznamky()) {
        if (note?.id) idsFallback.add(String(note.id));
      }
    }

    return idsFallback;
  })();

  const secretRows = [];
  const regularRows = [];
  const secretIdsKOdstraneniKvuliRegular = new Set();

  for (const row of cloudRows) {
    const id = String(row?.id || "");
    const jeSecret =
      jeCloudSecretRow(row) ||
      (Boolean(row?.deleted_at) && lokalniSecretIds.has(id));

    if (jeSecret) {
      if (!row.deleted_at && jeLegacyCloudSecretRow(row)) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `REMOTE DELTA DEFER | legacy-secret id=${id}`
        );
        return false;
      }

      secretRows.push(row);
    } else {
      regularRows.push(row);

      /* Secret -> regular převod: starý lokální ciphertext stejného ID
         se po přijetí serverové regular verze musí odstranit. */
      if (lokalniSecretIds.has(id)) {
        secretIdsKOdstraneniKvuliRegular.add(id);
      }
    }
  }

  let noveLocalRegular = null;

  if (regularRows.length > 0 || secretRows.length > 0) {
    if (
      window.LubaNoteRegularNotesStore
        ?.chybiPlnaCacheProSync?.() === true
    ) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "REMOTE DELTA DEFER | full-local-cache-missing"
      );
      return false;
    }

    const localRegular = getLocalNotesForSync();

    if (regularRows.length > 0) {
      const revizniMerge = pripravRevizniMerge(
        localRegular,
        [],
        [],
        [],
        regularRows,
        new Set(),
        new Set(),
        new Set()
      );

      if (
        revizniMerge.konfliktniId.size > 0 ||
        revizniMerge.vynutitLocalId.size > 0 ||
        revizniMerge.konfliktniKopie.length > 0
      ) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "REMOTE DELTA DEFER | revision-merge"
        );
        return false;
      }
    }

    const mapaRegular = new Map(
      localRegular
        .filter((note) => note?.id)
        .map((note) => [String(note.id), note])
    );

    for (const row of secretRows) {
      const id = String(row.id);
      const lokalni = mapaRegular.get(id);

      if (!jePoznamkaPouzeLokalniProSync(lokalni)) {
        mapaRegular.delete(id);
      }
    }

    for (const row of regularRows) {
      const id = String(row.id);
      const lokalni = mapaRegular.get(id);

      if (jePoznamkaPouzeLokalniProSync(lokalni)) {
        continue;
      }

      if (row.deleted_at) {
        mapaRegular.delete(id);
        continue;
      }

      const cloudPoznamka = vytvorCloudRegularNote(row);

      if (!cloudPoznamka) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `REMOTE DELTA DEFER | unsupported-row id=${id}`
        );
        return false;
      }

      mapaRegular.set(id, cloudPoznamka);
    }

    noveLocalRegular = Array.from(mapaRegular.values());
  }

  let noveEncryptedSecret = null;
  let noveDecryptedSecret = null;

  if (
    secretRows.length > 0 ||
    secretIdsKOdstraneniKvuliRegular.size > 0
  ) {
    if (
      typeof nactiSifrovaneTajneZaznamy !== "function" ||
      typeof ulozSifrovaneTajneZaznamy !== "function"
    ) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "REMOTE DELTA DEFER | secret-storage-unavailable"
      );
      return false;
    }

    const encryptedMapa = new Map(
      nactiSifrovaneTajneZaznamy()
        .filter((record) => record?.id)
        .map((record) => [String(record.id), record])
    );

    const secretUnlocked = Boolean(
      typeof tajnySifrovaciKlic !== "undefined" &&
      tajnySifrovaciKlic &&
      typeof tajnyRezimOdemceny !== "undefined" &&
      tajnyRezimOdemceny === true
    );

    const decryptedMapa = new Map(
      secretUnlocked &&
      typeof getDesifrovaneTajnePoznamky === "function"
        ? (getDesifrovaneTajnePoznamky() || [])
            .filter((note) => note?.id)
            .map((note) => [String(note.id), note])
        : []
    );

    for (const id of secretIdsKOdstraneniKvuliRegular) {
      const klic = String(id);

      if (
        !jeSecretRecordPouzeLokalniProSync(
          encryptedMapa.get(klic)
        )
      ) {
        encryptedMapa.delete(klic);
        decryptedMapa.delete(klic);
      }
    }

    for (const row of secretRows) {
      const id = String(row.id);

      if (
        jeSecretRecordPouzeLokalniProSync(
          encryptedMapa.get(id)
        )
      ) {
        continue;
      }

      if (row.deleted_at) {
        encryptedMapa.delete(id);
        decryptedMapa.delete(id);
        continue;
      }

      if (!jeSifrovanyCloudSecretRow(row)) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `REMOTE DELTA DEFER | unsupported-secret id=${id}`
        );
        return false;
      }

      const record = vytvorCloudEncryptedRecord(row);

      if (!record) {
        return false;
      }

      encryptedMapa.set(id, record);

      if (secretUnlocked) {
        if (typeof desifrujTajnouPoznamku !== "function") {
          return false;
        }

        try {
          const note = await desifrujTajnouPoznamku(
            record.encrypted,
            id
          );

          decryptedMapa.set(id, {
            ...note,
            id,
            updatedAt: record.updatedAt || note?.updatedAt,
            isSecret: true
          });
        } catch (error) {
          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            `REMOTE DELTA DEFER | secret-decrypt id=${id}`
          );
          return false;
        }
      }
    }

    noveEncryptedSecret = Array.from(encryptedMapa.values());
    noveDecryptedSecret = secretUnlocked
      ? Array.from(decryptedMapa.values())
      : null;
  }

  if (
    lokalniStavSeBehemSyncuZmenil(
      revizeLokalnihoStavuPriStartu
    ) ||
    ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
      generacePriStartu
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "REMOTE DELTA DEFER | local-changed-before-write"
    );
    return false;
  }

  if (noveLocalRegular) {
    await ulozBeznePoznamkyPrimo(noveLocalRegular);
  }

  if (noveEncryptedSecret) {
    ulozSifrovaneTajneZaznamy(noveEncryptedSecret);

    if (
      noveDecryptedSecret &&
      typeof nastavDesifrovaneTajnePoznamky === "function"
    ) {
      nastavDesifrovaneTajnePoznamky(
        noveDecryptedSecret
      );
    }
  }

  ulozPrijateCloudMetaPoMerge(
    cloudRows,
    new Set(ids)
  );

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }

  const server = await ziskejServerovyPrivateFingerprint();

  if (!server?.fingerprint) {
    return false;
  }

  const head = await ziskejPrivateSyncV2Head();

  if (
    head === null ||
    head !== posledniSeq ||
    lokalniStavSeBehemSyncuZmenil(
      revizeLokalnihoStavuPriStartu
    ) ||
    ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
      generacePriStartu
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `REMOTE DELTA DEFER | confirm-race head=${head ?? "?"} seq=${posledniSeq}`
    );
    return false;
  }

  const fastUlozen = ulozFastSyncStav({
    userId,
    serverFingerprint: server.fingerprint,
    localGeneration: generacePriStartu
  });

  if (!fastUlozen) {
    return false;
  }

  if (!ulozPrivateSyncV2Cursor(userId, posledniSeq)) {
    return false;
  }

  nastavKoncovyStavSynchronizaceUI();

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `REMOTE DELTA APPLIED | notes=${ids.length} secret=${secretRows.length} seq=${cursor.lastSeq}->${posledniSeq}`
  );

  return true;
}

async function vyresCilenyKonfliktBeznePoznamkyV2(
  lokalniPoznamka,
  konfliktDetail = {}
) {
  const noteId = lokalniPoznamka?.id;

  if (!noteId || lokalniPoznamka?.isSecret === true) {
    return false;
  }

  /*
   * Shared obsah nesmí private V2 merge převzít. Serverový guard
   * save_note_safe je zde autoritativní a shared editor má vlastní
   * lock/save cestu.
   */
  if (
    konfliktDetail?.reason ===
      "shared_note_requires_shared_save"
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET CONFLICT DEFER | shared | id=${noteId}`
    );
    return false;
  }

  const cloudRows =
    await nactiCloudPoznamkyPodleIdV2([noteId]);

  if (!cloudRows) {
    return false;
  }

  const row = cloudRows.find(
    (polozka) => String(polozka?.id) === String(noteId)
  );

  if (!row) {
    oznamKonfliktSynchronizace(
      noteId,
      "targeted_note_missing",
      {
        expectedRevision:
          ziskejCloudSyncMeta(noteId)?.revision ?? null,
        serverReason:
          konfliktDetail?.reason || null
      }
    );

    return false;
  }

  const localRegular = getLocalNotesForSync();

  const revizniMerge = pripravRevizniMerge(
    localRegular,
    [],
    [],
    [],
    [row],
    new Set(),
    new Set(),
    new Set()
  );

  const {
    konfliktniId,
    vynutitCloudId,
    vynutitLocalId,
    prijmoutCloudMetaId,
    konfliktniKopie
  } = revizniMerge;

  if (konfliktniId.has(noteId)) {
    return false;
  }

  /*
   * Pokud server během prvního save opravdu změnil revizi, běžný
   * moderní konflikt skončí zde: cloud zůstane pod původním ID a
   * lokální verze se případně zachová jako konfliktní kopie s novým ID.
   */
  if (vynutitCloudId.has(noteId)) {
    const aktualni =
      getLocalNotesForSync().filter(
        (note) => String(note?.id) !== String(noteId)
      );

    const cloudPoznamka =
      vytvorCloudRegularNote(row);

    if (cloudPoznamka) {
      aktualni.push(cloudPoznamka);
    }

    for (const kopie of konfliktniKopie) {
      if (kopie?.id) {
        aktualni.push(kopie);
      }
    }

    await ulozBeznePoznamkyPrimo(aktualni);

    ulozPrijateCloudMetaPoMerge(
      [row],
      prijmoutCloudMetaId
    );

    /*
     * Konfliktní kopie je nová běžná poznámka. Uložíme ji targeted
     * cestou také samostatně; nikdy kvůli ní nepouštíme full snapshot.
     */
    for (const kopie of konfliktniKopie) {
      const detailKopie =
        await uploadLocalNoteToSupabase(
          kopie,
          {
            cilenyV2: true,
            vratitDetailV2: true
          }
        );

      if (detailKopie?.ok !== true) {
        return false;
      }
    }

    if (
      konfliktniKopie.length > 0 &&
      typeof showToast === "function"
    ) {
      showToast("Obě verze poznámky byly zachovány");
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

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET CONFLICT RESOLVED | id=${noteId} copies=${konfliktniKopie.length}`
    );

    return true;
  }

  /*
   * Teoretická větev: cloud se podle známé meta revize nezměnil, ale
   * save přesto vrátil konflikt. Nic naslepo nepřepisujeme.
   */
  if (vynutitLocalId.has(noteId)) {
    oznamKonfliktSynchronizace(
      noteId,
      "targeted_revision_state_uncertain",
      {
        expectedRevision:
          ziskejCloudSyncMeta(noteId)?.revision ?? null,
        cloudRevision: row?.revision ?? null
      }
    );
  }

  return false;
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
    const ulozeniLegacyDedup =
      ulozBeznePoznamkyPrimo(noveLocalRegular);

    if (ulozeniLegacyDedup?.catch) {
      void ulozeniLegacyDedup.catch((error) => {
        console.warn(
          "Uložení legacy dedup migrace se dokončí při hlavním zápisu syncu:",
          error
        );
      });
    }
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
  const diagCelaKontrola =
    window.LubaNoteStartupDiag?.zacni?.("SYNC GUARD – REMOTE EDITORS");

  if (!navigator.onLine) {
    window.LubaNoteStartupDiag?.konec?.(diagCelaKontrola, "OFFLINE");
    return new Set();
  }

  const deviceId = getDeviceId();

  if (!deviceId) {
    window.LubaNoteStartupDiag?.konec?.(diagCelaKontrola, "NO-DEVICE");
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
      window.LubaNoteStartupDiag?.konec?.(
        diagCelaKontrola,
        "RPC-CHYBA"
      );
      console.warn(
        "Kontrola aktivních editorů pro sync nebyla dostupná:",
        error.message
      );
      return new Set();
    }

    const radky = Array.isArray(data) ? data : [];

    const vysledek = new Set(
      radky
        .map((row) => row?.note_id)
        .filter(Boolean)
    );

    window.LubaNoteStartupDiag?.konec?.(
      diagCelaKontrola,
      `OK count=${vysledek.size}`
    );

    return vysledek;
  } catch (error) {
    window.LubaNoteStartupDiag?.konec?.(diagCelaKontrola, "CHYBA");
    console.warn(
      "Kontrola aktivních editorů pro sync selhala:",
      error
    );
    return new Set();
  }
}

async function syncNotes(moznosti = {}) {
  if (probihajiciSync) {
    return probihajiciSync;
  }

  /*
   * PATCH 485 – AUTOMATICKÝ FULL SNAPSHOT JE ZAKÁZANÝ.
   *
   * Tohle je poslední obranná vrstva. I kdyby nějaký starší modul
   * omylem zavolal syncNotes(), nesmí tím stáhnout několik MB.
   * Recovery full snapshot bude možné spustit jen výslovně a vědomě.
   */
  if (moznosti?.recoveryFullSnapshot !== true) {
    window.LubaNoteStartupDiag?.zapis?.(
      "EGRESS",
      `FULL SNAPSHOT BLOCKED | source=${moznosti?.zdroj || "automatic"}`
    );
    nastavStavSynchronizaceUI("pending");
    return false;
  }

  recoveryFullSnapshotPovolen = true;

  /*
   * PATCH 478 – měření notes syncu.
   * Pokud sync spustil start/foreground wrapper, jde pouze o vnořený
   * scope a počítadlo se neresetuje. Přímé syncNotes() si měření založí
   * samo, takže žádná starší cesta synchronizace nezůstane slepá.
   */
  window.LubaNoteSyncTraffic?.zacniSync?.();

  const diagnostikaPrivateSync =
    window.LubaNoteStartupDiag?.zacni?.("PRIVATE SYNC");
  let diagnostikaPrivateSyncStav = "KONEC";
  const fastSnapshot = moznosti?.fastSnapshot || null;

  probihajiciSync = (async () => {
    const diagAuthPrivate =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE AUTH");
    const user = await getCurrentUser();
    window.LubaNoteStartupDiag?.konec?.(
      diagAuthPrivate,
      user ? "OK" : "NO-USER"
    );

    if (!user) {
      oznamChybejiciOnlineSession();
      return false;
    }

    nastavStavSynchronizaceUI("syncing");

    const diagSecretFlush =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE SECRET FLUSH");
    if (typeof cekajNaUlozeniTajnychPoznamek === "function") {
      await cekajNaUlozeniTajnychPoznamek();
    }
    window.LubaNoteStartupDiag?.konec?.(diagSecretFlush, "OK");

    const revizeLokalnihoStavuPriStartu =
      ziskejReviziLokalnichZmenProSync();

    /*
     * Nejdřív odešleme případná smazání z offline fronty.
     * Teprve potom načítáme cloudový snapshot.
     */
    const diagPendingDeletes =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE PENDING DELETES");
    await odesliCekajiciSmazaniDoSupabase();
    window.LubaNoteStartupDiag?.konec?.(diagPendingDeletes, "OK");

    const diagLocalSnapshot =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE LOCAL SNAPSHOT");
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

    window.LubaNoteStartupDiag?.konec?.(
      diagLocalSnapshot,
      `regular=${localRegular.length} encrypted=${localEncrypted.length} legacySecret=${localLegacySecret.length} decryptedSecret=${localDecryptedSecret.length}`
    );

    const diagCloudSnapshot =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE CLOUD SNAPSHOT");
    let cloudRows = await getCloudNotesForSync();
    window.LubaNoteStartupDiag?.konec?.(
      diagCloudSnapshot,
      `rows=${Array.isArray(cloudRows) ? cloudRows.length : 0}`
    );

    /*
     * Start optimalizace 2:
     * Obě následující kontroly jsou pouze read-only a navzájem na sobě
     * nezávisí. Dříve čekaly jedna na druhou. Výsledek i bezpečnostní
     * pravidla zůstávají stejné, jen serverové čtení proběhne paralelně.
     */
    const diagSyncGuards =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE SYNC GUARDS");
    const [
      vlastniSdileneId,
      idPoznamekEditovanychJinde
    ] = await Promise.all([
      /*
       * Určí, které poznámky tohoto vlastníka už patří do shared-lock
       * režimu a nesmí do běžného private conflict/save rozhodování.
       */
      ziskejVlastniSdileneIdProSync(),

      /*
       * Poznámku právě editovanou na jiném zařízení tento klient v tomto
       * syncu pouze ponechá beze změny, aby nezvýšil serverovou revizi
       * pod rozepsaným editorem před handoffem.
       */
      ziskejIdPoznamekEditovanychJinde()
    ]);
    window.LubaNoteStartupDiag?.konec?.(
      diagSyncGuards,
      `ownedShared=${vlastniSdileneId.size} remoteEditors=${idPoznamekEditovanychJinde.size}`
    );

    const diagLegacyPlanner =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE LEGACY PLANNER CHECK");

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
        await ulozBeznePoznamkyPrimo(localRegular);
        localRegular = getLocalNotesForSync();
      }
    }

    window.LubaNoteStartupDiag?.konec?.(diagLegacyPlanner, "OK");

    if (
      lokalniStavSeBehemSyncuZmenil(
        revizeLokalnihoStavuPriStartu
      )
    ) {
      odlozOpakovaniSynchronizace();
      return false;
    }

    const diagLegacyDedup =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE LEGACY DEDUP");

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
    window.LubaNoteStartupDiag?.konec?.(diagLegacyDedup, "OK");

    const diagMergePrepare =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE MERGE PREPARE");

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
      idPoznamekEditovanychJinde,
      vlastniSdileneId
    );
    window.LubaNoteStartupDiag?.konec?.(diagMergePrepare, "OK");

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

    const diagWinnerMap =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE WINNER MAP");
    const { winners } = vytvorMapuVitezu(
      localRegularProMerge,
      localEncryptedProMerge,
      localLegacySecretProMerge,
      localDecryptedSecretProMerge,
      cloudRowsProMerge
    );
    window.LubaNoteStartupDiag?.konec?.(
      diagWinnerMap,
      `winners=${winners.size}`
    );

    const diagMergeLoop =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE MERGE LOOP + UPLOADS");
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

    window.LubaNoteStartupDiag?.konec?.(
      diagMergeLoop,
      `regular=${mergedRegular.length} secretCandidates=${secretCandidates.length}`
    );

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
    const diagLocalWrite =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE LOCAL WRITE");

    try {
      await ulozBeznePoznamkyPrimo(mergedRegular);
    } catch (error) {
      let jsonChars = -1;

      try {
        jsonChars = JSON.stringify(mergedRegular).length;
      } catch (_) {}

      window.LubaNoteStartupDiag?.zapis?.(
        "ERROR",
        `PRIVATE LOCAL WRITE REGULAR | ${error?.name || "Error"} | ${error?.message || String(error)} | count=${mergedRegular.length} jsonChars=${jsonChars}`
      );
      throw error;
    }

    try {
      ulozSifrovaneTajneZaznamy(encryptedToKeep);
    } catch (error) {
      let jsonChars = -1;

      try {
        jsonChars = JSON.stringify(encryptedToKeep).length;
      } catch (_) {}

      window.LubaNoteStartupDiag?.zapis?.(
        "ERROR",
        `PRIVATE LOCAL WRITE SECRET | ${error?.name || "Error"} | ${error?.message || String(error)} | count=${encryptedToKeep.length} jsonChars=${jsonChars}`
      );
      throw error;
    }

    /*
     * Meta revizi posuneme až poté, co jsme cloudový stav opravdu
     * přijali do lokálního úložiště. Při pádu uprostřed syncu tak
     * nevznikne falešný dojem, že starý lokální obsah je aktuální.
     */
    try {
      ulozPrijateCloudMetaPoMerge(
        cloudRows,
        prijmoutCloudMetaId
      );
    } catch (error) {
      window.LubaNoteStartupDiag?.zapis?.(
        "ERROR",
        `PRIVATE LOCAL WRITE META | ${error?.name || "Error"} | ${error?.message || String(error)} | cloudRows=${cloudRows.length} accept=${prijmoutCloudMetaId.size}`
      );
      throw error;
    }
    window.LubaNoteStartupDiag?.konec?.(
      diagLocalWrite,
      `regular=${mergedRegular.length} encrypted=${encryptedToKeep.length}`
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

    const diagSecretMerge =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE SECRET MERGE");
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

    window.LubaNoteStartupDiag?.konec?.(
      diagSecretMerge,
      secretUnlocked ? "UNLOCKED" : "LOCKED"
    );

    const diagPlannerCleanup =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE PLANNER CLEANUP");
    if (
      typeof uklidOsirelychPlanovanychPolozek === "function"
    ) {
      await uklidOsirelychPlanovanychPolozek();
    }
    window.LubaNoteStartupDiag?.konec?.(diagPlannerCleanup, "OK");

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

    const diagRender =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE UI REFRESH");
    if (typeof renderTasks === "function") {
      renderTasks();
    }

    if (typeof renderRemindersScreen === "function") {
      renderRemindersScreen();
    }

    if (typeof renderCalendar === "function") {
      renderCalendar();
    }
    window.LubaNoteStartupDiag?.konec?.(diagRender, "OK");

    /*
     * Fast token ukládáme až po úspěšném plném merge. Předstartovní
     * serverový otisk je bezpečné potvrdit pouze pokud tento sync během
     * svého běhu sám server nezměnil a lokální generace zůstala stejná.
     */
    const diagFastState =
      window.LubaNoteStartupDiag?.zacni?.("PRIVATE FAST STATE SAVE");

    const fastStavPotvrzenPredsyncTokenem =
      ulozFastSyncStavPoPlnemSyncu(fastSnapshot);

    if (!fastStavPotvrzenPredsyncTokenem) {
      try {
        await obnovFastSyncStavPoUspesnemPlnemSyncu(user.id);
      } catch (error) {
        /*
         * Fast Sync je pouze optimalizace. Pokud malý fingerprint po
         * úspěšném merge selže, data už jsou bezpečně synchronizovaná.
         * PATCH 481 navíc nedovolí, aby samotná chyba fingerprintu při
         * dalším pokusu vyvolala plný snapshot.
         */
        console.warn(
          "Fast Sync: post-sync fingerprint se obnoví později:",
          error
        );
      }
    }

    window.LubaNoteStartupDiag?.konec?.(diagFastState, "OK");

    /*
     * PATCH 480 – po skutečně úspěšném plném merge je lokální stav
     * potvrzený, takže V2 cursor lze bezpečně posunout na serverový HEAD.
     * Jde jen o malé metadata RPC; obsah poznámek se zde nestahuje.
     */
    await potvrdPrivateSyncV2CursorPoShodnemStavu(
      user.id
    );

    /* PATCH 551 – nový/obnovený klient mohl právě stáhnout starší
       plaintext fotografii z cloudové poznámky, která před odemknutím
       Secret nebyla lokálně dostupná. Po úspěšném merge proto ještě
       jednou projdeme lokální poznámky a takové fotografie zařadíme do
       targeted E2E migrace. Už chráněné noteId mají lokální marker a
       znovu se nefrontují. */
    if (
      window.LubaNoteMediaCrypto?.jeKlicDostupny?.() === true &&
      window.LubaNoteMediaCrypto
        ?.zaradMigraciExistujicichFotografii
    ) {
      try {
        await window.LubaNoteMediaCrypto
          .zaradMigraciExistujicichFotografii();
      } catch (error) {
        console.warn(
          "LubaNote media E2E: post-sync migrace fotografií se dokončí později.",
          error
        );
      }
    }

    return true;
  })();

  try {
    const vysledek = await probihajiciSync;

    diagnostikaPrivateSyncStav =
      vysledek === true ? "OK" : "FALSE";

    if (vysledek === true) {
      nastavKoncovyStavSynchronizaceUI();
    }

    return vysledek;
  } catch (error) {
    diagnostikaPrivateSyncStav = "CHYBA";

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
    window.LubaNoteStartupDiag?.konec?.(
      diagnostikaPrivateSync,
      aktivniKonfliktySyncu.size > 0
        ? "KONFLIKT"
        : diagnostikaPrivateSyncStav
    );
    probihajiciSync = null;
    recoveryFullSnapshotPovolen = false;
    window.LubaNoteSyncTraffic?.dokonciSync?.();
  }
}

function oznamObsahPripravenyProSplash() {
  window.dispatchEvent(
    new CustomEvent("lubanote:splash-ready")
  );
}

/*
 * Onboarding umí při úplně novém účtu vytvořit uvítací poznámku.
 * Na prvním důvěryhodném startu proto dál blokuje splash stejně jako
 * dosud. U instalace, která už má bezpečný Fast Sync stav, může stejná
 * kontrola proběhnout až po UI READY – případně nově vytvořenou
 * uvítací poznámku bezpečně dosynchronizuje na pozadí.
 */
async function provedOnboardingPoBezpecnemSyncu({
  blokovatStart = true
} = {}) {
  if (
    typeof window.LubaNoteOnboarding
      ?.zajistiUvitaciPoznamku !== "function"
  ) {
    return true;
  }

  try {
    const onboarding =
      await window.LubaNoteOnboarding
        .zajistiUvitaciPoznamku();

    if (onboarding?.created === true) {
      /*
       * PATCH 485 – nová uvítací poznámka už nesmí být důvodem pro
       * get_notes_safe. Změnu zachytí fingerprint/change feed a stáhne
       * se cíleně při bezpečném V2 průchodu.
       */
      /* Fast stav ponecháme. Právě jeho starý fingerprint umožní při
         příštím bezpečném průchodu poznat server-only změnu a stáhnout
         novou kartu přes change feed + targeted download. */
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "ONBOARDING CHANGE DEFER | targeted-next-pass"
      );

      return true;
    }

    return true;
  } catch (error) {
    /*
     * Onboarding nesmí zablokovat už existující účet ani základní
     * synchronizaci. Server si stav pamatuje a pokus lze zopakovat.
     */
    console.warn(
      "Uvítací poznámka se dokončí později:",
      error
    );
    return true;
  }
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

  /*
   * Stav čteme PŘED fast checkem. Jeho existence znamená, že tato
   * konkrétní instalace už alespoň jednou dokončila bezpečný plný sync.
   * Pouze tehdy smíme onboarding a síťový refresh štítků odsunout za
   * první použitelné UI.
   */
  const predchoziBezpecnyFastStav =
    nactiFastSyncStav(user.id);

  const lzeOdlozitServisStartu =
    Boolean(predchoziBezpecnyFastStav);

  let poznamkySynchronizovany = false;
  let startPouzeLokalneKvuliEgressu = false;
  /* PATCH 555 – EXISTING CLIENT CURSOR RECOVERY
   * Starší existující klient může mít platný Fast Sync stav, ale ještě
   * nemít V2 change cursor. Pokud se mezitím změnil server, nesmíme se
   * pokusit o remote delta (nemáme bezpečný after_seq) ani spustit full
   * snapshot. Po prvním vykreslení proto provedeme už existující malý
   * manifest + targeted reconcile, který cursor bezpečně založí. */
  let naplanovatExistingReconcileKvuliChybejicimuCursoru = false;

  window.LubaNoteSyncTraffic?.zacniSync?.();

  try {
    const fastSync = await pripravFastSyncPriStartu(user);

    if (fastSync?.odlozit === true) {
      window.LubaNoteStartupDiag?.zapis?.(
        "FAST",
        "PRIVATE SYNC DEFER – fingerprint není potvrzen"
      );
      nastavStavSynchronizaceUI("restore");
      return false;
    }

    if (fastSync?.preskocit === true) {
      /*
       * Lokální data už odpovídají potvrzenému serverovému otisku.
       * Neprovádíme get_notes_safe ani revizní merge, protože by neměl
       * co změnit. Všechny servisní kroky startu pod tímto blokem však
       * zůstávají zachované.
       */
      nastavKoncovyStavSynchronizaceUI();
      poznamkySynchronizovany = true;
    } else if (fastSync?.vzdaleneDeltaV2 === true) {
      /*
       * PATCH 484 – změnil se pouze server. Nejdřív použijeme change
       * feed + targeted download. Při nejistotě zde ZÁMĚRNĚ nepadáme
       * zpět na get_notes_safe; sync se pouze odloží.
       *
       * PATCH 555 – pokud existující klient ještě nemá V2 cursor, delta
       * nemá bezpečný výchozí bod. To není čistý klient a nesmí dostat
       * Safe Bootstrap/full snapshot. UI pustíme z cache a po vykreslení
       * spustíme Existing Client Reconcile (manifest + jen dotčená ID).
       */
      const cursorV2 = nactiPrivateSyncV2Cursor(user.id);

      if (!cursorV2) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "REMOTE DELTA RECOVER | cursor-missing -> reconcile"
        );
        poznamkySynchronizovany = true;
        startPouzeLokalneKvuliEgressu = true;
        naplanovatExistingReconcileKvuliChybejicimuCursoru = true;
        nastavStavSynchronizaceUI("pending");
      } else {
        poznamkySynchronizovany =
          await synchronizujVzdalenePrivateDeltaV2(
            user.id
          );

        if (poznamkySynchronizovany !== true) {
          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            "REMOTE DELTA DEFER | start-no-full-fallback"
          );
          nastavStavSynchronizaceUI("restore");
        }
      }
    } else if (posledniFastSyncStav === "LOCAL-CHANGED") {
      /* PATCH 495 – existující klient se starším / lokálně změněným
       * stavem už nezůstane navždy viset v pending. UI pustíme hned
       * z cache a po startu spustíme pouze manifest + targeted reconcile. */
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "RECONCILE SCHEDULE | start-local-changed"
      );
      poznamkySynchronizovany = true;
      startPouzeLokalneKvuliEgressu = true;
      nastavStavSynchronizaceUI("pending");
    } else {
      /*
       * PATCH 485 – čistý prohlížeč / ztracený Fast stav / legacy dluh
       * už NESMÍ automaticky spustit full snapshot. Aplikaci pustíme z
       * lokální cache (může být i prázdná) a stav necháme jako pending.
       * Řízený bootstrap/recovery bude samostatná explicitní operace.
       */
      window.LubaNoteStartupDiag?.zapis?.(
        "EGRESS",
        "AUTO FULL BLOCK | start-local-only"
      );
      poznamkySynchronizovany = true;
      startPouzeLokalneKvuliEgressu = true;
      nastavStavSynchronizaceUI("pending");
    }
  } finally {
    window.LubaNoteSyncTraffic?.dokonciSync?.();
  }

  if (poznamkySynchronizovany !== true) {
    return false;
  }

  nastavStavSynchronizaceUI("syncing");

  /*
   * Úplně první důvěryhodný start zachovává původní blokující
   * onboarding. U ověřené instalace ho odsuneme za splash.
   */
  if (!lzeOdlozitServisStartu && !startPouzeLokalneKvuliEgressu) {
    const onboardingHotov =
      await provedOnboardingPoBezpecnemSyncu({
        blokovatStart: true
      });

    if (onboardingHotov !== true) {
      return false;
    }
  } else if (startPouzeLokalneKvuliEgressu) {
    window.LubaNoteStartupDiag?.zapis?.(
      "EGRESS",
      "BOOTSTRAP DEFERRED | local UI only"
    );
  } else {
    window.LubaNoteStartupDiag?.zapis?.(
      "FAST",
      "ONBOARDING DEFERRED AFTER UI READY"
    );
  }

  if (
    typeof window.LubaNoteRecurring
      ?.migrujStareOpakovaniPlanneru ===
    "function"
  ) {
    await window.LubaNoteRecurring
      .migrujStareOpakovaniPlanneru();
  }

  let stitkyNactenyZCache = false;

  if (
    lzeOdlozitServisStartu &&
    typeof window.LubaNoteTagsStartCache?.nacti === "function"
  ) {
    stitkyNactenyZCache =
      window.LubaNoteTagsStartCache.nacti(user.id) === true;

    window.LubaNoteStartupDiag?.zapis?.(
      "FAST",
      stitkyNactenyZCache
        ? "TAG START CACHE HIT"
        : "TAG START CACHE MISS"
    );
  }

  /*
   * Při prvním startu po zavedení cache (nebo po její ztrátě) dál
   * čekáme na server, aby UI nikdy nezačalo bez známých barev štítků.
   * Jakmile cache existuje, splash už tento GET blokovat nemusí.
   */
  if (!stitkyNactenyZCache) {
    await loadTagsFromSupabase();
  }

  /*
   * Vizuální inicializace je hotová: poznámky jsou bezpečně sloučené
   * a štítky jsou buď čerstvé ze serveru, nebo z poslední bezpečné
   * lokální cache. Síťový refresh může u ověřené instalace doběhnout
   * až po zobrazení aplikace.
   */
  oznamObsahPripravenyProSplash();

  if (lzeOdlozitServisStartu) {
    Promise.resolve()
      .then(async () => {
        const diagServis =
          window.LubaNoteStartupDiag?.zacni?.(
            "POST-UI START SERVICES"
          );

        await provedOnboardingPoBezpecnemSyncu({
          blokovatStart: false
        });

        if (
          stitkyNactenyZCache &&
          !stitkyCekajiNaRefreshPoNavratuInternetu
        ) {
          await loadTagsFromSupabase();
        }

        window.LubaNoteStartupDiag?.konec?.(
          diagServis,
          stitkyNactenyZCache
            ? "OK + TAG REFRESH"
            : "OK"
        );
      })
      .catch((error) => {
        console.warn(
          "Odložené startovní služby se dokončí později:",
          error
        );
      });
  }

  await registerCurrentDevice();
  await cleanupSafeDeletedNotes();

  if (
    typeof obnovNotifikaceOpakovanychPoznamek ===
    "function"
  ) {
    await obnovNotifikaceOpakovanychPoznamek();
  }

  if (startPouzeLokalneKvuliEgressu) {
    nastavStavSynchronizaceUI("pending");
  } else {
    nastavKoncovyStavSynchronizaceUI();
  }

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

  if (startPouzeLokalneKvuliEgressu) {
    if (
      posledniFastSyncStav === "LOCAL-CHANGED" ||
      naplanovatExistingReconcileKvuliChybejicimuCursoru
    ) {
      /* PATCH 495/555 – UI už je použitelné; reconcile běží až teď, aby
         případné targeted dávky nikdy nezdržely splash. PATCH 555 sem
         vede i existující klient s SERVER-CHANGED + chybějícím cursorem. */
      setTimeout(() => {
        spustExistingClientReconcileV2(user.id, { force: true })
          .catch(() => {});
      }, 0);
    } else {
      /* PATCH 564 – po úspěšném přihlášení + povinném hlavním hesle je
         čisté zařízení už dostatečně autorizované. Další modal „Načíst
         data z cloudu?“ je pro nový účet i nové zařízení zbytečný a u
         prvního účtu navíc blokoval vytvoření uvítací karty.

         Čistý klient (nebo rozpracovaný Safe Bootstrap) proto pokračuje
         automaticky. Existující zařízení s lokálními daty se sem nikdy
         automaticky nepřepisuje – pro něj zůstávají recovery ochrany. */
      const bootstrapMarker =
        nactiSafeBootstrapMarker(user.id);
      const maLokalniData =
        maLokalniDataProSafeBootstrap();

      if (!maLokalniData || bootstrapMarker) {
        window.LubaNoteStartupDiag?.zapis?.(
          "BOOTSTRAP",
          bootstrapMarker
            ? "AUTO RESUME | clean-device"
            : "AUTO START | clean-device"
        );

        setTimeout(() => {
          spustSafeBootstrapV2(
            user.id,
            { automaticky: true }
          ).catch(() => {});
        }, 0);
      } else {
        nabidniSafeBootstrapPokudJeTreba(user.id);
      }
    }
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

/*
 * OFFLINE / RECONNECT FRONTa
 *
 * Lokální generace ve storage.js už chrání data i přes kill aplikace.
 * Tady držíme pouze živý stav aktuálního procesu, aby UI nikdy
 * nehlásilo "Synchronizováno", dokud nová lokální změna nebyla
 * opravdu potvrzená cloudovým syncem.
 *
 * Android WebView obvykle vyšle event "online", ale ne ve všech
 * lifecycle kombinacích je to stoprocentní. Proto při čekající lokální
 * změně běží lehká kontrola navigator.onLine. Interval existuje pouze
 * po dobu čekání a po úspěšném syncu se ihned ruší.
 */
let lokalniZmenaCekaNaPotvrzeniServerem = false;
let casovacKontrolyNavratuInternetu = null;
let probihajiciSyncCekajiciLokalniZmeny = null;


/*
 * SYNC V2.2 – TARGETED UPLOAD FRONTa (PATCH 483)
 *
 * Lokální akce si před/po uložení porovná běžné private poznámky.
 * Editor navíc může předat konkrétní Secret poznámku, takže i její
 * uložení jde přes jeden save_note_safe(expected_revision), nikdy přes
 * full snapshot. Shared cesta zůstává oddělená.
 */
const cekajiciCilenePrivateV2 = new Map();
let probihajiciCilenyPrivateV2 = null;
let cileneV2CekaNaFastPotvrzeni = false;
const potvrzeneCileneRevizeV2 = new Map();

/*
 * PATCH 500 – OFFLINE RETRY CIRCUIT BREAKER
 *
 * Android WebView může i bez skutečného internetu hlásit
 * navigator.onLine=true. Původní reconnect timer pak po síťovém
 * TypeError zkoušel save_note_safe každých 1,5 s. Data to nepoškodilo,
 * ale vznikala zbytečná retry smyčka a UI zůstávalo ve "syncing".
 * Po skutečné transportní chybě proto targeted V2 dostane postupný
 * cooldown. Event "online" jej okamžitě zruší; jinak zůstává pomalý
 * safety retry pro WebView, které online event někdy nevyšle.
 */
const TARGET_V2_SITOVE_BACKOFFY_MS = [5000, 15000, 30000, 60000];
let targetV2SitovaPauzaDo = 0;
let targetV2SitovyBackoffIndex = 0;

function jeSitovaChybaTargetV2(error) {
  if (!error) {
    return navigator.onLine === false;
  }

  const text = String(
    error?.message || error?.details || error?.hint || error || ""
  ).toLowerCase();

  return (
    navigator.onLine === false ||
    error?.name === "TypeError" ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network error") ||
    text.includes("load failed") ||
    text.includes("fetch failed")
  );
}

function aktivujTargetV2SitovouPauzu(error = null) {
  if (!jeSitovaChybaTargetV2(error)) {
    return false;
  }

  const index = Math.min(
    targetV2SitovyBackoffIndex,
    TARGET_V2_SITOVE_BACKOFFY_MS.length - 1
  );
  const cekani = TARGET_V2_SITOVE_BACKOFFY_MS[index];

  targetV2SitovyBackoffIndex = Math.min(
    targetV2SitovyBackoffIndex + 1,
    TARGET_V2_SITOVE_BACKOFFY_MS.length - 1
  );
  targetV2SitovaPauzaDo = Date.now() + cekani;

  nastavStavSynchronizaceUI("pending");

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET NETWORK PAUSE | ${Math.round(cekani / 1000)}s`
  );

  return true;
}

function zrusTargetV2SitovouPauzu(duvod = null) {
  const bylaPauza = targetV2SitovaPauzaDo > Date.now();

  targetV2SitovaPauzaDo = 0;
  targetV2SitovyBackoffIndex = 0;

  if (bylaPauza && duvod) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET NETWORK RESUME | ${duvod}`
    );
  }
}

function jeTargetV2SitovaPauzaAktivni() {
  return Date.now() < targetV2SitovaPauzaDo;
}

/*
 * PATCH 502 – ANDROID NATIVE NETWORK RESUME
 *
 * Browserový event "online" není v Android WebView spolehlivý. APK proto
 * může dostat přes malý nativní plugin potvrzení ConnectivityManageru, že
 * aktivní síť má skutečně VALIDATED internet. Není to HTTP probe a nemá
 * žádný Supabase egress. Používáme ho pouze k okamžitému probuzení už
 * existující targeted fronty z PATCH 500. Web/PWA beze změny používají
 * browser online event + bezpečný backoff.
 */
let nativeNetworkBridgeV2Inicializovan = false;
let nativeNetworkListenerV2 = null;
let nativeNetworkAutoritaV2 = false;
let nativeNetworkPosledniConnectedV2 = null;
/* PATCH 504 – browser offline může přijít dřív než Android callback.
   Na APK smí browser stav pouze konzervativně ZABLOKOVAT síť.
   Znovu ji povolí až nový native VALIDATED=true. Browser online ji
   sám nikdy nepovoluje. */
let nativeNetworkCekaNaNovePotvrzeniV2 = false;

function jeTargetV2SitOpravduPouzitelna() {
  if (!navigator.onLine) {
    return false;
  }

  if (!pouzivaNativeNetworkAutorituV2()) {
    return true;
  }

  return (
    nativeNetworkPosledniConnectedV2 === true &&
    nativeNetworkCekaNaNovePotvrzeniV2 !== true
  );
}

function pouzivaNativeNetworkAutorituV2() {
  return nativeNetworkAutoritaV2 === true;
}

let probihajiciTargetNetworkResumeV2 = null;

function zpracujTargetV2NavratSite(duvod = "network") {
  const melaPauzu = jeTargetV2SitovaPauzaAktivni();
  const maDluh = maCilenyPrivateV2Dluh();

  zrusTargetV2SitovouPauzu(duvod);

  if (!melaPauzu && !maDluh) {
    return Promise.resolve(true);
  }

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET NETWORK WAKE | ${duvod}`
  );

  /*
   * PATCH 505 – QUEUE FIRST ON NETWORK RESUME
   *
   * Po návratu validované Android sítě má čekající targeted fronta
   * absolutní prioritu před běžným START SYNC FLOW. V 504 mohl auth-valid
   * rozjet start o pár ms dřív a targeted worker pak čekal několik sekund
   * na jeho dokončení. Tady serializujeme reconnect do jedné Promise a
   * po případném rychlém deferu startu dokončíme queue jako první.
   */
  if (probihajiciTargetNetworkResumeV2) {
    return probihajiciTargetNetworkResumeV2;
  }

  probihajiciTargetNetworkResumeV2 =
    (async () => {
      if (probihajiciStartSync) {
        try {
          await probihajiciStartSync;
        } catch {
          // Start má vlastní error handling; reconnect queue pokračuje dál.
        }
      }

      if (!jeTargetV2SitOpravduPouzitelna()) {
        nastavStavSynchronizaceUI("pending");
        return false;
      }

      if (!maCilenyPrivateV2Dluh()) {
        return true;
      }

      const uspesne =
        await synchronizujCekajiciLokalniZmenu();

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `TARGET NETWORK DRAIN | ${uspesne === true ? "OK" : "DEFER"} | ${duvod}`
      );

      return uspesne === true;
    })();

  return probihajiciTargetNetworkResumeV2.finally(() => {
    probihajiciTargetNetworkResumeV2 = null;
  });
}

async function aktivujNativeNetworkBridgeV2() {
  if (nativeNetworkBridgeV2Inicializovan) return;
  nativeNetworkBridgeV2Inicializovan = true;

  if (!window.Capacitor?.isNativePlatform?.()) return;

  const plugin = window.Capacitor?.Plugins?.LubaNoteNetworkState;
  if (!plugin?.addListener) return;

  /*
   * PATCH 503 – NATIVE NETWORK AUTHORITY
   *
   * Jakmile je Android bridge opravdu připojený, browserové online/offline
   * eventy už na APK nesmějí rozhodovat o synchronizaci. WebView je umí
   * vyslat dřív, než má Android skutečně VALIDATED internet. WEB/PWA naopak
   * zůstává na browserových eventech beze změny.
   */
  try {
    nativeNetworkListenerV2 = await plugin.addListener(
      "networkStatusChange",
      (stav) => {
        const connected = stav?.connected === true;
        const predchozi = nativeNetworkPosledniConnectedV2;
        nativeNetworkPosledniConnectedV2 = connected;

        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `NATIVE NETWORK | ${connected ? "online" : "offline"}`
        );

        if (!connected) {
          nativeNetworkCekaNaNovePotvrzeniV2 = true;
          stitkyCekajiNaRefreshPoNavratuInternetu = true;
          return;
        }

        nativeNetworkCekaNaNovePotvrzeniV2 = false;

        const drainPromise =
          zpracujTargetV2NavratSite("native-network");

        /*
         * PATCH 505 – běžný start až PO queue drainu. Initial status=true
         * při studeném startu stále nesmí vytvořit druhý start.
         */
        if (predchozi === false) {
          Promise.resolve(drainPromise)
            .catch(() => false)
            .finally(() => {
              setTimeout(
                spustStartSyncBezpecne,
                120
              );
            });
        }
      }
    );

    /* Autoritu zapínáme až po úspěšném připojení listeneru. */
    nativeNetworkAutoritaV2 = true;
  } catch (_error) {
    nativeNetworkListenerV2 = null;
    nativeNetworkAutoritaV2 = false;
    nativeNetworkPosledniConnectedV2 = null;
    nativeNetworkCekaNaNovePotvrzeniV2 = false;
    return;
  }

  if (plugin.getStatus) {
    try {
      const stav = await plugin.getStatus();
      const connected = stav?.connected === true;
      nativeNetworkPosledniConnectedV2 = connected;

      if (connected) {
        nativeNetworkCekaNaNovePotvrzeniV2 = false;

        if (jeTargetV2SitovaPauzaAktivni()) {
          zpracujTargetV2NavratSite("native-status");
        }
      } else {
        nativeNetworkCekaNaNovePotvrzeniV2 = true;
        stitkyCekajiNaRefreshPoNavratuInternetu = true;
      }
    } catch (_error) {
      /* Listener zůstává autoritativní i když jednorázové getStatus selže. */
    }
  }
}

/*
 * Permanentní delete je konečný stav stejného note_id. Jakmile existuje
 * tombstone, starší obsahový targeted upload tohoto ID už nesmí frontu
 * blokovat ani se po návratu internetu znovu posílat.
 */
function zrusObsahovyTargetKvuliSmazani(noteId) {
  const id = String(noteId || "");

  if (!id) {
    return false;
  }

  const odstraneno = cekajiciCilenePrivateV2.delete(id);
  potvrzeneCileneRevizeV2.delete(id);

  if (odstraneno) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET CONTENT SUPERSEDED BY DELETE | id=${id}`
    );
  }

  return odstraneno;
}

function zrusObsahoveTargetyPrekryteSmazanim() {
  for (const zaznam of nactiCekajiciSmazani()) {
    if (zaznam?.id) {
      zrusObsahovyTargetKvuliSmazani(zaznam.id);
    }
  }
}

function klonujPoznamkuProCilenyV2(note) {
  if (!note || typeof note !== "object") {
    return null;
  }

  try {
    return typeof structuredClone === "function"
      ? structuredClone(note)
      : JSON.parse(JSON.stringify(note));
  } catch {
    return null;
  }
}

function vytvorOtiskPoznamkyProCilenyV2(note) {
  if (!note || typeof note !== "object") {
    return "";
  }

  try {
    return JSON.stringify(
      seradJsonProSyncPorovnani(note)
    );
  } catch {
    return "";
  }
}

function nactiSnapshotBeznychPoznamekProCilenyV2() {
  if (
    window.LubaNoteRegularNotesStore
      ?.chybiPlnaCacheProSync?.() === true
  ) {
    return null;
  }

  const mapa = new Map();

  for (const note of getLocalNotesForSync()) {
    if (
      !note?.id ||
      note.isSecret === true ||
      jePoznamkaPouzeLokalniProSync(note)
    ) {
      continue;
    }

    mapa.set(String(note.id), {
      note: klonujPoznamkuProCilenyV2(note),
      otisk: vytvorOtiskPoznamkyProCilenyV2(note)
    });
  }

  return mapa;
}

function nactiAktualniSecretPoznamkuProCilenyV2(noteId) {
  if (!noteId || typeof getDesifrovaneTajnePoznamky !== "function") {
    return null;
  }

  const note = (getDesifrovaneTajnePoznamky() || [])
    .find((polozka) => String(polozka?.id || "") === String(noteId));

  if (!note) {
    return null;
  }

  const klon = klonujPoznamkuProCilenyV2({
    ...note,
    isSecret: true
  });

  if (!klon) {
    return null;
  }

  return {
    note: klon,
    otisk: vytvorOtiskPoznamkyProCilenyV2(klon)
  };
}

function zaregistrujExplicitniSecretZmenuV2(note) {
  if (!note?.id || note.isSecret !== true) {
    return { podporovano: false, pocet: 0 };
  }

  if (jePoznamkaPouzeLokalniProSync(note)) {
    return {
      podporovano: true,
      pocet: 0,
      duvod: "local_only"
    };
  }

  const aktualni =
    nactiAktualniSecretPoznamkuProCilenyV2(note.id);

  const bezpecna = aktualni?.note ||
    klonujPoznamkuProCilenyV2(note);
  const otisk = aktualni?.otisk ||
    vytvorOtiskPoznamkyProCilenyV2(bezpecna);

  if (!bezpecna || !otisk) {
    return { podporovano: false, pocet: 0 };
  }

  cekajiciCilenePrivateV2.set(String(note.id), {
    note: bezpecna,
    otisk,
    secret: true,
    queuedAt: Date.now()
  });

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET SECRET QUEUE | id=${note.id}`
  );

  return { podporovano: true, pocet: 1 };
}

/*
 * PATCH 488 – přímé lokální změny, které historicky neprocházely
 * wrapperem (hlavně přesun jedné karty do Koše), mohou předat hotovou
 * private poznámku rovnou targeted frontě. Díky tomu offline změna
 * přežije v lokálním obsahu a po návratu internetu se odešle jako
 * jediný save_note_safe místo legacy/full fallbacku.
 */
function zaradKonkretniPrivatePoznamkuV2(note) {
  if (!note?.id) {
    return false;
  }

  if (jePoznamkaPouzeLokalniProSync(note)) {
    return false;
  }

  if (jeVlastniSharedPoznamkaProPrivateV2(note.id)) {
    return false;
  }

  let vysledek;

  if (note.isSecret === true) {
    vysledek = zaregistrujExplicitniSecretZmenuV2(note);
  } else {
    const bezpecna = klonujPoznamkuProCilenyV2(note);
    const otisk = vytvorOtiskPoznamkyProCilenyV2(bezpecna);

    if (!bezpecna || !otisk) {
      return false;
    }

    cekajiciCilenePrivateV2.set(String(note.id), {
      note: bezpecna,
      otisk,
      secret: false,
      queuedAt: Date.now()
    });

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET QUEUE DIRECT | id=${note.id}`
    );

    vysledek = { podporovano: true, pocet: 1 };
  }

  if (vysledek?.podporovano !== true) {
    return false;
  }

  oznacLokalniZmenuCekajiciNaSync();

  if (navigator.onLine) {
    naplanujSynchronizaciPoLokalniZmene(180);
  }

  return true;
}

function jeVlastniSharedPoznamkaProPrivateV2(noteId) {
  if (!noteId) {
    return false;
  }

  try {
    return window.LubaNoteSharingNotes
      ?.jeVlastniSdilenaPoznamka?.(noteId) === true;
  } catch {
    return false;
  }
}

function zaregistrujCileneZmenyPoLokalniAkciV2(
  snapshotPred
) {
  if (!(snapshotPred instanceof Map)) {
    return {
      podporovano: false,
      pocet: 0,
      duvod: "snapshot-pred-unavailable"
    };
  }

  const snapshotPo =
    nactiSnapshotBeznychPoznamekProCilenyV2();

  if (!(snapshotPo instanceof Map)) {
    return {
      podporovano: false,
      pocet: 0,
      duvod: "snapshot-po-unavailable"
    };
  }

  const vsechnaId = new Set([
    ...snapshotPred.keys(),
    ...snapshotPo.keys()
  ]);

  const zmenena = [];

  for (const id of vsechnaId) {
    const pred = snapshotPred.get(id);
    const po = snapshotPo.get(id);

    if ((pred?.otisk || "") === (po?.otisk || "")) {
      continue;
    }

    /*
     * Hard delete má vlastní tombstone frontu a targeted delete cestu.
     * Tento patch řeší obsahový upload běžné poznámky.
     */
    if (!po?.note) {
      return {
        podporovano: false,
        pocet: zmenena.length,
        duvod: "regular-note-removed"
      };
    }

    if (jeVlastniSharedPoznamkaProPrivateV2(id)) {
      return {
        podporovano: false,
        pocet: zmenena.length,
        duvod: "owned-shared"
      };
    }

    if (!po.otisk) {
      return {
        podporovano: false,
        pocet: zmenena.length,
        duvod: "note-signature-missing"
      };
    }

    zmenena.push({
      id,
      note: po.note,
      otisk: po.otisk
    });
  }

  if (zmenena.length === 0) {
    return {
      podporovano: false,
      pocet: 0,
      duvod: "no-regular-change"
    };
  }

  for (const zmena of zmenena) {
    cekajiciCilenePrivateV2.set(
      zmena.id,
      {
        note: zmena.note,
        otisk: zmena.otisk,
        secret: false,
        queuedAt: Date.now()
      }
    );
  }

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET QUEUE | count=${zmenena.length}`
  );

  return {
    podporovano: true,
    pocet: zmenena.length,
    duvod: null
  };
}

function maCilenyPrivateV2Dluh() {
  return (
    cekajiciCilenePrivateV2.size > 0 ||
    nactiCekajiciSmazani().length > 0 ||
    cileneV2CekaNaFastPotvrzeni === true ||
    Boolean(probihajiciCilenyPrivateV2)
  );
}

async function potvrdCilenePrivateZapisyV2(userId) {
  if (
    !userId ||
    !navigator.onLine ||
    cekajiciCilenePrivateV2.size > 0 ||
    nactiNeodeslanaCekajiciSmazani().length > 0 ||
    nactiBlokovanaCekajiciSmazani().length > 0 ||
    aktivniKonfliktySyncu.size > 0
  ) {
    return false;
  }

  const cursor = nactiPrivateSyncV2Cursor(userId);

  if (!cursor) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "TARGET CONFIRM DEFER | cursor-missing"
    );
    return false;
  }

  const zmeny = await ziskejPrivateSyncV2ZmenyOd(
    cursor.lastSeq,
    200
  );

  if (!zmeny) {
    return false;
  }

  /*
   * Limit 200 je záměrná bezpečnostní brzda. Pokud by feed byl tak
   * dlouhý, nesmíme předpokládat, že jsme viděli jeho konec.
   */
  if (zmeny.length >= 200) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "TARGET CONFIRM DEFER | feed-limit"
    );
    return false;
  }

  let posledniSeq = cursor.lastSeq;
  const videnePotvrzeneId = new Set();

  for (const radek of zmeny) {
    const id = String(radek?.note_id || "");
    const revizeEventu = Number(radek?.revision);
    const potvrzenaRevize =
      Number(potvrzeneCileneRevizeV2.get(id));

    /*
     * Před 484 ještě neumíme obecné vzdálené delta aplikovat.
     * Fast stav proto potvrdíme jen tehdy, když KAŽDÁ nová feed
     * událost odpovídá targeted zápisu, který právě tento klient
     * úspěšně dokončil.
     */
    if (
      radek?.action !== "upsert" ||
      !Number.isFinite(potvrzenaRevize) ||
      !Number.isFinite(revizeEventu) ||
      revizeEventu > potvrzenaRevize
    ) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        `TARGET CONFIRM DEFER | remote-delta | id=${id || "?"}`
      );
      return false;
    }

    videnePotvrzeneId.add(id);

    const seq = Number(radek?.seq);

    if (Number.isFinite(seq)) {
      posledniSeq = Math.max(
        posledniSeq,
        Math.floor(seq)
      );
    }
  }

  const chybejiciPotvrzenaId = Array.from(
    potvrzeneCileneRevizeV2.keys()
  ).filter(
    (id) => !videnePotvrzeneId.has(String(id))
  );

  if (chybejiciPotvrzenaId.length > 0) {
    /*
     * PATCH 488 – recovery úzkého crash okna:
     * potvrdCilenePrivateZapisyV2 ukládá Fast stav + cursor a teprve
     * potom maže persistentní tombstone frontu. Pokud aplikace spadne
     * přesně mezi těmito kroky, po restartu už change feed správně nic
     * nevrátí (cursor událost obsahuje), ale uploaded tombstone v queue
     * ještě zůstane. Smíme ho uklidit pouze tehdy, když VŠECHNA chybějící
     * ID jsou právě tyto uploaded tombstones a uložený Fast stav se stále
     * shoduje s aktuálním serverovým fingerprintem, cursorem i lokální
     * generací. Jinak nic nehádáme a potvrzení odložíme.
     */
    const uploadedDeleteIds = new Set(
      nactiCekajiciSmazani()
        .filter(maCekajiciSmazaniPotvrzenouServerovouRevizi)
        .map((zaznam) => String(zaznam.id))
    );

    const jenUploadedDeletes =
      chybejiciPotvrzenaId.every(
        (id) => uploadedDeleteIds.has(String(id))
      ) &&
      Array.from(potvrzeneCileneRevizeV2.keys()).every(
        (id) => uploadedDeleteIds.has(String(id))
      );

    if (jenUploadedDeletes) {
      const fast = nactiFastSyncStav(userId);
      const localGeneration =
        ziskejTrvalouGeneraciLokalnichZmenProFastSync();

      if (
        fast &&
        localGeneration !== null &&
        Number(fast.localGeneration) === Number(localGeneration)
      ) {
        const [server, head] = await Promise.all([
          ziskejServerovyPrivateFingerprint(),
          ziskejPrivateSyncV2Head()
        ]);

        if (
          server?.fingerprint &&
          fast.serverFingerprint === server.fingerprint &&
          head !== null &&
          Number(head) === Number(cursor.lastSeq)
        ) {
          ulozCekajiciSmazani(
            nactiCekajiciSmazani().filter(
              (zaznam) =>
                !maCekajiciSmazaniPotvrzenouServerovouRevizi(zaznam)
            )
          );
          potvrzeneCileneRevizeV2.clear();
          cileneV2CekaNaFastPotvrzeni = false;
          synchronizaceOdlozenaKvuliLokalniZmene = false;

          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            `TARGET DELETE CONFIRM RECOVER | seq=${cursor.lastSeq}`
          );
          return true;
        }
      }
    }

    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      `TARGET CONFIRM DEFER | own-event-missing | id=${chybejiciPotvrzenaId[0]}`
    );
    return false;
  }

  const headPredFingerprintem =
    await ziskejPrivateSyncV2Head();

  if (
    headPredFingerprintem === null ||
    headPredFingerprintem !== posledniSeq
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "TARGET CONFIRM DEFER | head-changed-before-fingerprint"
    );
    return false;
  }

  const localGeneration =
    ziskejTrvalouGeneraciLokalnichZmenProFastSync();

  if (localGeneration === null) {
    return false;
  }

  const server =
    await ziskejServerovyPrivateFingerprint();

  if (!server?.fingerprint) {
    return false;
  }

  const headPoFingerprintu =
    await ziskejPrivateSyncV2Head();

  if (
    headPoFingerprintu === null ||
    headPoFingerprintu !== headPredFingerprintem ||
    ziskejTrvalouGeneraciLokalnichZmenProFastSync() !==
      localGeneration ||
    cekajiciCilenePrivateV2.size > 0
  ) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "TARGET CONFIRM DEFER | state-changed-during-confirm"
    );
    return false;
  }

  const fastUlozen = ulozFastSyncStav({
    userId,
    serverFingerprint: server.fingerprint,
    localGeneration
  });

  if (!fastUlozen) {
    return false;
  }

  const cursorUlozen = ulozPrivateSyncV2Cursor(
    userId,
    headPoFingerprintu
  );

  if (!cursorUlozen) {
    /* Fast fingerprint bez odpovídajícího cursoru nesmí zůstat jako
       potvrzený stav. Příští průchod raději znovu ověří malé V2 RPC. */
    zrusFastSyncStav();
    return false;
  }

  /* PATCH 488 – tombstone opouští persistentní frontu až poté, co je
     jeho change-feed událost i nový fingerprint/cursor potvrzený. */
  ulozCekajiciSmazani(
    nactiCekajiciSmazani().filter(
      (zaznam) =>
        !maCekajiciSmazaniPotvrzenouServerovouRevizi(zaznam)
    )
  );

  potvrzeneCileneRevizeV2.clear();
  cileneV2CekaNaFastPotvrzeni = false;
  synchronizaceOdlozenaKvuliLokalniZmene = false;

  window.LubaNoteStartupDiag?.zapis?.(
    "V2",
    `TARGET CONFIRMED | seq=${headPoFingerprintu}`
  );

  return true;
}

async function synchronizujCilenePrivateZmenyV2() {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    return false;
  }

  if (probihajiciCilenyPrivateV2) {
    return probihajiciCilenyPrivateV2;
  }

  /* PATCH 500 – delete má přednost před starším obsahovým uploadem. */
  zrusObsahoveTargetyPrekryteSmazanim();

  if (!jeTargetV2SitOpravduPouzitelna() || jeTargetV2SitovaPauzaAktivni()) {
    nastavStavSynchronizaceUI("pending");
    return false;
  }

  if (probihajiciStartSync || probihajiciSync) {
    odlozOpakovaniSynchronizace();
    return false;
  }

  probihajiciCilenyPrivateV2 =
    (async () => {
      const user = await getCurrentUser();

      if (!user) {
        return false;
      }

      nastavStavSynchronizaceUI("syncing");
      window.LubaNoteSyncTraffic?.zacniSync?.();

      try {
        /*
         * PATCH 488 – tombstones mají přednost před obsahovými uploady.
         * Fronta je persistentní, takže tento krok bezpečně dokončí i
         * smazání vytvořené offline nebo předchozí session.
         */
        const smazaniOk =
          await odesliCekajiciSmazaniDoSupabase();

        if (smazaniOk !== true) {
          return false;
        }

        const snapshot = Array.from(
          cekajiciCilenePrivateV2.entries()
        );

        for (const [id, zaznam] of snapshot) {
          /*
           * Během síťového await mohla stejná poznámka dostat novější
           * lokální editaci. Starý snapshot pak nesmíme odeslat.
           */
          const aktualniFronta =
            cekajiciCilenePrivateV2.get(id);

          if (
            !aktualniFronta ||
            aktualniFronta.otisk !== zaznam.otisk
          ) {
            continue;
          }

          const aktualni = zaznam.secret === true
            ? nactiAktualniSecretPoznamkuProCilenyV2(id)
            : nactiSnapshotBeznychPoznamekProCilenyV2()?.get(id);

          if (
            !aktualni?.note ||
            aktualni.otisk !== zaznam.otisk
          ) {
            continue;
          }

          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            `${zaznam.secret === true ? "TARGET SECRET UPLOAD" : "TARGET UPLOAD"} | id=${id}`
          );

          const detail =
            await uploadLocalNoteToSupabase(
              aktualni.note,
              {
                cilenyV2: true,
                vratitDetailV2: true
              }
            );

          if (detail?.ok !== true) {
            window.LubaNoteStartupDiag?.zapis?.(
              "V2",
              `TARGET UPLOAD DEFER | id=${id}`
            );
            return false;
          }

          /*
           * Pro bezpečné potvrzení feedu evidujeme jen zápis, který
           * opravdu provedl tento targeted save. Vyřešený konflikt
           * může obsahovat vzdálenou událost a finální potvrzení proto
           * necháme až na obecné delta fázi 484.
           */
          if (detail?.wrote === true) {
            const revize = Number(
              detail?.revision ??
              ziskejCloudSyncMeta(id)?.revision
            );

            if (Number.isFinite(revize)) {
              potvrzeneCileneRevizeV2.set(
                String(id),
                revize
              );
            }
          } else {
            cileneV2CekaNaFastPotvrzeni = true;
          }

          const frontaPoZapisu =
            cekajiciCilenePrivateV2.get(id);

          if (
            frontaPoZapisu?.otisk === zaznam.otisk
          ) {
            cekajiciCilenePrivateV2.delete(id);
          }
        }

        if (cekajiciCilenePrivateV2.size > 0) {
          return false;
        }

        cileneV2CekaNaFastPotvrzeni = true;

        const potvrzeno =
          await potvrdCilenePrivateZapisyV2(user.id);

        if (potvrzeno === true) {
          window.LubaNoteStartupDiag?.zapis?.(
            "V2",
            "TARGET SYNC OK"
          );
          return true;
        }

        return false;
      } finally {
        window.LubaNoteSyncTraffic?.dokonciSync?.();
      }
    })();

  try {
    return await probihajiciCilenyPrivateV2;
  } finally {
    probihajiciCilenyPrivateV2 = null;
  }
}

/*
 * Barvy karet závisejí na syncedTags. Při skutečně offline startu se
 * použije bezpečná lokální cache štítků, ale pokud Android WebView při
 * návratu sítě nevyšle event "online", může proběhnout jen notes-only
 * sync a serverový refresh štítků se přeskočí. Tento příznak proto drží
 * jediný dlužný refresh po návratu internetu. Běžné online syncy tím
 * žádný další dotaz na tabulku tags nedostávají.
 */
let stitkyCekajiNaRefreshPoNavratuInternetu =
  !navigator.onLine;
let probihajiciRefreshStitkuPoNavratuInternetu = null;

/*
 * Pouze diagnostický getter pro VD build. Nemění sync ani stav aplikace.
 * Debug Hub díky němu umí zkopírovat krátký TAG-VD report bez stovek
 * běžných HTTP řádků.
 */
window.LubaNoteTagReconnectVD = {
  stav: () => ({
    pending: stitkyCekajiNaRefreshPoNavratuInternetu,
    online: navigator.onLine,
    refreshRunning: Boolean(
      probihajiciRefreshStitkuPoNavratuInternetu
    )
  })
};

async function obnovStitkyPoNavratuInternetuPokudJeTreba() {
  window.LubaNoteStartupDiag?.zapis?.(
    "TAG-VD",
    `REFRESH CHECK | pending=${stitkyCekajiNaRefreshPoNavratuInternetu} ` +
      `online=${navigator.onLine} ` +
      `loader=${typeof loadTagsFromSupabase}`
  );

  if (
    !stitkyCekajiNaRefreshPoNavratuInternetu ||
    typeof loadTagsFromSupabase !== "function"
  ) {
    return true;
  }

  if (probihajiciRefreshStitkuPoNavratuInternetu) {
    return probihajiciRefreshStitkuPoNavratuInternetu;
  }

  probihajiciRefreshStitkuPoNavratuInternetu =
    (async () => {
      try {
        window.LubaNoteStartupDiag?.zapis?.(
          "TAG-VD",
          "REFRESH CALL START"
        );

        const stitkyObnoveny =
          await loadTagsFromSupabase();

        window.LubaNoteStartupDiag?.zapis?.(
          "TAG-VD",
          `REFRESH CALL END | success=${stitkyObnoveny === true}`
        );

        if (stitkyObnoveny !== true) {
          return false;
        }

        stitkyCekajiNaRefreshPoNavratuInternetu = false;

        window.LubaNoteStartupDiag?.zapis?.(
          "FAST",
          "TAG REFRESH AFTER OFFLINE"
        );

        return true;
      } catch (error) {
        console.warn(
          "Štítky se po návratu internetu obnoví při dalším syncu:",
          error
        );
        return false;
      }
    })();

  try {
    return await probihajiciRefreshStitkuPoNavratuInternetu;
  } finally {
    probihajiciRefreshStitkuPoNavratuInternetu = null;
  }
}

function zastavKontroluNavratuInternetu() {
  if (casovacKontrolyNavratuInternetu) {
    clearInterval(casovacKontrolyNavratuInternetu);
    casovacKontrolyNavratuInternetu = null;
  }
}

function spustKontroluNavratuInternetu() {
  if (casovacKontrolyNavratuInternetu) {
    return;
  }

  casovacKontrolyNavratuInternetu =
    setInterval(() => {
      if (jeAktivniRezimPouzeTotoZarizeni()) {
        zastavKontroluNavratuInternetu();
        nastavStavPouzeTotoZarizeni();
        return;
      }

      if (!lokalniZmenaCekaNaPotvrzeniServerem) {
        zastavKontroluNavratuInternetu();
        return;
      }

      if (nactiBlokovanaCekajiciSmazani().length > 0) {
        zastavKontroluNavratuInternetu();
        return;
      }

      if (!jeTargetV2SitOpravduPouzitelna() || jeTargetV2SitovaPauzaAktivni()) {
        return;
      }

      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      synchronizujCekajiciLokalniZmenu().catch(
        (error) => {
          console.warn(
            "Opakovaná synchronizace po návratu internetu selhala:",
            error
          );
        }
      );
    }, 1500);
}

function oznacLokalniZmenuCekajiciNaSync() {
  lokalniZmenaCekaNaPotvrzeniServerem = true;
  odlozOpakovaniSynchronizace();
  nastavStavSynchronizaceUI("pending");
  spustKontroluNavratuInternetu();
}

function potvrzLokalniZmenuNaServeru() {
  lokalniZmenaCekaNaPotvrzeniServerem = false;
  zastavKontroluNavratuInternetu();
  nastavKoncovyStavSynchronizaceUI();
}

async function synchronizujCekajiciLokalniZmenu() {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    zastavKontroluNavratuInternetu();
    nastavStavPouzeTotoZarizeni();
    return false;
  }

  if (!lokalniZmenaCekaNaPotvrzeniServerem) {
    return true;
  }

  if (nactiBlokovanaCekajiciSmazani().length > 0) {
    zastavKontroluNavratuInternetu();
    nastavStavSynchronizaceUI("conflict");
    return false;
  }

  if (!jeTargetV2SitOpravduPouzitelna()) {
    nastavStavSynchronizaceUI("pending");
    spustKontroluNavratuInternetu();
    return false;
  }

  if (probihajiciSyncCekajiciLokalniZmeny) {
    return probihajiciSyncCekajiciLokalniZmeny;
  }

  nastavStavSynchronizaceUI("syncing");

  probihajiciSyncCekajiciLokalniZmeny =
    (async () => {
      /*
       * PATCH 483:
       * Jakmile máme přesně identifikované běžné private změny, mají
       * absolutní přednost targeted zápisy. Full sync je fallback pouze
       * pro legacy/unsupported akce, které tento patch ještě neumí
       * bezpečně identifikovat.
       */
      const pouzitCilenyV2 =
        maCilenyPrivateV2Dluh();

      const uspesne = pouzitCilenyV2
        ? await synchronizujCilenePrivateZmenyV2()
        : await spustRychlySyncPoznamekBezpecne();

      if (uspesne === true) {
        potvrzLokalniZmenuNaServeru();
        return true;
      }

      if (
        lokalniZmenaCekaNaPotvrzeniServerem &&
        nactiBlokovanaCekajiciSmazani().length === 0
      ) {
        nastavStavSynchronizaceUI("pending");
        spustKontroluNavratuInternetu();
      }

      return false;
    })();

  try {
    return await probihajiciSyncCekajiciLokalniZmeny;
  } finally {
    probihajiciSyncCekajiciLokalniZmeny = null;
  }
}

function naplanujSynchronizaciPoLokalniZmene(
  zpozdeni = 350
) {
  clearTimeout(casovacSynchronizacePoLokalniZmene);

  casovacSynchronizacePoLokalniZmene =
    setTimeout(() => {
      casovacSynchronizacePoLokalniZmene = null;

      synchronizujCekajiciLokalniZmenu().catch(
        (error) => {
          console.warn(
            "Následná synchronizace lokální změny selhala:",
            error
          );

          if (lokalniZmenaCekaNaPotvrzeniServerem) {
            nastavStavSynchronizaceUI("pending");
            spustKontroluNavratuInternetu();
          }
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
async function provedLokalniZmenuASynchronizuj(
  akce,
  konkretniPoznamka = null
) {
  /*
   * LOCAL SCOPE 584 – explicitní lokální poznámka nesmí spustit
   * obsahový cloud sync. Účet / Demo mohou dál používat server, ale
   * samotný obsah této poznámky zůstává pouze v zařízení.
   *
   * Tato rychlá větev je záměrně pouze pro akce, které předají konkrétní
   * poznámku (editor save). Hromadné/mixed operace budeme zapojovat až
   * v další fázi, aby se cloudové a lokální poznámky nikdy nesmíchaly.
   */
  if (jePoznamkaPouzeLokalniProSync(konkretniPoznamka)) {
    const vysledek =
      await provedLokalniZmenuBezKolizeSeSync(akce);

    window.LubaNoteStartupDiag?.zapis?.(
      "LOCAL",
      `LOCAL CONTENT SAVE | cloud sync skipped id=${konkretniPoznamka?.id || "?"}`
    );

    return vysledek;
  }
  /*
   * PATCH 483/485 – targeted upload.
   * Snapshot je pouze lokální; neprovádí žádný síťový request.
   * Editor může dodat konkrétní Secret poznámku, protože ta není
   * součástí běžného regular snapshotu.
   */
  const snapshotPredCilenymV2 =
    nactiSnapshotBeznychPoznamekProCilenyV2();

  const vysledek =
    await provedLokalniZmenuBezKolizeSeSync(
      akce
    );

  const cilenaRegularV2 =
    zaregistrujCileneZmenyPoLokalniAkciV2(
      snapshotPredCilenymV2
    );

  const cilenaSecretV2 =
    zaregistrujExplicitniSecretZmenuV2(
      konkretniPoznamka
    );

  const cilenaZmenaV2 = {
    podporovano:
      cilenaRegularV2?.podporovano === true ||
      cilenaSecretV2?.podporovano === true,
    pocet:
      Number(cilenaRegularV2?.pocet || 0) +
      Number(cilenaSecretV2?.pocet || 0)
  };

  /*
   * Od této chvíle existuje nová lokální změna, kterou server ještě
   * nepotvrdil. Stav zruší až skutečně úspěšný notes sync.
   */
  oznacLokalniZmenuCekajiciNaSync();

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
       * U podporované běžné private změny už časovač nevede na
       * get_notes_safe. synchronizujCekajiciLokalniZmenu() nejprve
       * zpracuje targeted frontu. Nepodporované/legacy cesty zůstávají
       * beze změny a použijí dosavadní bezpečný sync.
       */
      naplanujSynchronizaciPoLokalniZmene(
        cilenaZmenaV2?.podporovano === true
          ? 220
          : 350
      );
    }
  }

  return vysledek;
}

async function spustRychlySyncPoznamekBezpecne() {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    return false;
  }

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
   * PATCH 483 – foreground / pageshow nesmí obejít targeted frontu.
   * Pokud už lokální změna čeká na konkrétní save_note_safe zápis,
   * dokončíme jej místo fingerprint -> full-sync rozhodování.
   */
  if (maCilenyPrivateV2Dluh()) {
    const targetedOk =
      await synchronizujCilenePrivateZmenyV2();

    if (
      targetedOk === true &&
      lokalniZmenaCekaNaPotvrzeniServerem
    ) {
      potvrzLokalniZmenuNaServeru();
    }

    return targetedOk === true;
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

  let mereniTrafficuSpusteno = false;

  try {
    const user = await getCurrentUser();

    if (!user) {
      return false;
    }

    window.LubaNoteSyncTraffic?.zacniSync?.();
    mereniTrafficuSpusteno = true;

    /*
     * EGRESS GUARD 477
     *
     * Tento "rychlý" sync se spouští mimo jiné při pageshow / návratu
     * aplikace do popředí. Dříve pokaždé rovnou stáhl celý
     * get_notes_safe snapshot. Teď nejprve ověříme malý fingerprint.
     * Pokud se server ani lokální generace nezměnily, není co mergovat
     * a několik MB stejného obsahu znovu nestahujeme.
     */
    const fastSync = await pripravFastSyncPriStartu(user);

    if (fastSync?.odlozit === true) {
      window.LubaNoteStartupDiag?.zapis?.(
        "FAST",
        "QUICK SYNC DEFER – fingerprint není potvrzen"
      );
      nastavStavSynchronizaceUI("restore");
      return false;
    }

    let vysledek = true;

    if (fastSync?.preskocit === true) {
      nastavKoncovyStavSynchronizaceUI();
      window.LubaNoteStartupDiag?.zapis?.(
        "FAST",
        "QUICK SYNC SKIP – fingerprint beze změny"
      );

      /*
       * PATCH 480 – fingerprint právě potvrdil, že lokální a serverový
       * stav jsou shodné. Teprve teď smíme bezpečně bootstrapnout /
       * posunout nový V2 change cursor.
       */
      await potvrdPrivateSyncV2CursorPoShodnemStavu(
        user.id
      );
    } else if (fastSync?.vzdaleneDeltaV2 === true) {
      /* PATCH 484 – server-only změna = delta, nikdy automatický full.
       * PATCH 555 – existující klient bez cursoru použije bezpečný
       * manifest reconcile místo nekonečného cursor-missing deferu. */
      const cursorV2 = nactiPrivateSyncV2Cursor(user.id);

      if (!cursorV2) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "REMOTE DELTA RECOVER | quick cursor-missing -> reconcile"
        );
        vysledek = await spustExistingClientReconcileV2(
          user.id,
          { force: true }
        );
      } else {
        vysledek = await synchronizujVzdalenePrivateDeltaV2(
          user.id
        );
      }

      if (vysledek !== true) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "REMOTE DELTA DEFER | quick-no-full-fallback"
        );
        nastavStavSynchronizaceUI("restore");
      }
    } else if (posledniFastSyncStav === "LOCAL-CHANGED") {
      vysledek = await spustExistingClientReconcileV2(user.id);

      if (vysledek !== true) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "RECONCILE DEFER | quick"
        );
        nastavStavSynchronizaceUI("pending");
      }
    } else {
      window.LubaNoteStartupDiag?.zapis?.(
        "EGRESS",
        "AUTO FULL BLOCK | quick-defer"
      );
      nastavStavSynchronizaceUI("pending");
      vysledek = false;
    }

    if (vysledek !== true) {
      stitkyCekajiNaRefreshPoNavratuInternetu = true;
    }

    if (vysledek === true) {
      await obnovStitkyPoNavratuInternetuPokudJeTreba();
    }

    if (
      vysledek === true &&
      lokalniZmenaCekaNaPotvrzeniServerem
    ) {
      potvrzLokalniZmenuNaServeru();
    }

    return vysledek === true;
  } catch (error) {
    stitkyCekajiNaRefreshPoNavratuInternetu = true;

    console.warn(
      "Rychlá synchronizace poznámek byla odložena:",
      error
    );
    return false;
  } finally {
    if (mereniTrafficuSpusteno) {
      window.LubaNoteSyncTraffic?.dokonciSync?.();
    }
  }
}

async function spustStartSyncBezpecne() {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();

    /* Splash pustíme až po skutečné kontrole účtu v tomto běhu.
       Před ní se local režim pouze zdrží – nikdy kvůli tomu nespustí
       obsahový sync ani neobejde Demo / account-status gate. */
    if (
      window.LubaNoteSupabase
        ?.jeAktivniUcetPotvrzenProTentoBeh?.() !== true
    ) {
      window.LubaNoteStartupDiag?.zapis?.(
        "LOCAL",
        "LOCAL MODE WAIT | account gate"
      );
      return false;
    }

    synchronizaceOdlozenaKvuliLokalniZmene = false;
    return dokoncitLokalniStartBezObsahovehoSyncu();
  }

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

  /*
   * PATCH 501 – START/RESUME REENTRY GATE
   *
   * Auth-valid, online, focus/pageshow a obnovení offline tombstonu se
   * mohou sejít během několika milisekund. Celý start včetně TARGET
   * DELETE RESUME proto vlastní JEDINÝ Promise. Další volající se k
   * němu pouze připojí a nesmí rozjet druhý START SYNC FLOW.
   *
   * DŮLEŽITÉ: brána musí být nastavena PŘED prvním awaitem resume
   * fronty. Ve verzi 500 byla až za ním, takže několik současných
   * volání všechna stihla projít resume blokem a pak spustila start
   * paralelně.
   */
  if (probihajiciStartSync) {
    window.LubaNoteStartupDiag?.zapis?.(
      "V2",
      "START JOIN | in-flight"
    );
    return probihajiciStartSync;
  }

  probihajiciStartSync =
    (async () => {
      /*
       * PATCH 488/500 – offline tombstone přežije restart v
       * localStorage. Ještě před běžným start flow dokončíme pouze
       * tuto malou targeted frontu. Nevolá get_notes_safe.
       */
      if (
        nactiCekajiciSmazani().length > 0 &&
        nactiBlokovanaCekajiciSmazani().length === 0
      ) {
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          `TARGET DELETE RESUME | count=${nactiCekajiciSmazani().length}`
        );

        const resumedDeleteOk =
          await synchronizujCilenePrivateZmenyV2();

        if (
          resumedDeleteOk === true &&
          lokalniZmenaCekaNaPotvrzeniServerem
        ) {
          potvrzLokalniZmenuNaServeru();
        }
      }

      /*
       * PATCH 505 – pokud máme targeted dluh, ale Android ještě nepotvrdil
       * VALIDATED internet, běžný start nesmí queue předběhnout. Auth-valid
       * může přijít z WebView o pár ms dříve než native callback; v takovém
       * případě start rychle skončí jako pending a native reconnect queue ho
       * po potvrzení sítě dokončí jako první.
       */
      if (
        maCilenyPrivateV2Dluh() &&
        !jeTargetV2SitOpravduPouzitelna()
      ) {
        nastavStavSynchronizaceUI("pending");
        window.LubaNoteStartupDiag?.zapis?.(
          "V2",
          "START DEFER | targeted-wait-native"
        );
        return false;
      }

      const diagnostikaStartSync =
        window.LubaNoteStartupDiag?.zacni?.("START SYNC FLOW");
      let diagnostikaStartSyncStav = "KONEC";

      try {
        const uspesne = (await startSync()) === true;
        diagnostikaStartSyncStav = uspesne ? "OK" : "FALSE";
        return uspesne;
      } catch (error) {
        diagnostikaStartSyncStav = "CHYBA";
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
      } finally {
        window.LubaNoteStartupDiag?.konec?.(
          diagnostikaStartSync,
          diagnostikaStartSyncStav
        );
      }
    })();

  try {
    const vysledek =
      await probihajiciStartSync;

    /*
     * Android WebView může při studeném offline startu vracet
     * navigator.onLine=true a vůbec nevyvolat offline/online event.
     * Neúspěšný sync je proto spolehlivější signál, že po příštím
     * úspěšném spojení musíme jednou obnovit štítky.
     */
    if (vysledek !== true) {
      stitkyCekajiNaRefreshPoNavratuInternetu = true;

      window.LubaNoteStartupDiag?.zapis?.(
        "TAG-VD",
        "SYNC FAILED | pending=true"
      );
    }

    /*
     * Po skutečném offline startu event online spouští plný start sync.
     * Reconnect dluh štítků proto musíme vyřídit i tady, ne jen v
     * notes-only cestě. Jinak může být sync poznámek hotový, ale karty
     * zůstanou bez barev až do dalšího restartu aplikace.
     */
    if (vysledek === true) {
      await obnovStitkyPoNavratuInternetuPokudJeTreba();
    }

    if (
      vysledek === true &&
      lokalniZmenaCekaNaPotvrzeniServerem
    ) {
      potvrzLokalniZmenuNaServeru();
    }

    return vysledek;
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

      setTimeout(() => {
        if (lokalniZmenaCekaNaPotvrzeniServerem) {
          synchronizujCekajiciLokalniZmenu().catch(
            (error) => {
              console.warn(
                "Odložený targeted sync po startu selhal:",
                error
              );
            }
          );
          return;
        }

        spustRychlySyncPoznamekBezpecne()
          .catch(() => {});
      }, 120);
    }
  }
}

async function synchronizujPoznamkyTed(
  noteId = null
) {
  if (jeAktivniRezimPouzeTotoZarizeni()) {
    nastavStavPouzeTotoZarizeni();
    return false;
  }

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
   * PATCH 483 – editor handoff / "čekej na cloud".
   *
   * Pokud konkrétní noteId právě čeká v targeted V2 frontě, nesmí tato
   * potvrzovací cesta spustit syncNotes() a tím celý get_notes_safe.
   * Nejdřív dokončíme targeted upload. Pokud jej nelze bezpečně
   * potvrdit, vrátíme false a nic hromadně nestahujeme.
   */
  if (
    noteId &&
    lokalniZmenaCekaNaPotvrzeniServerem &&
    maCilenyPrivateV2Dluh()
  ) {
    for (let pokus = 0; pokus < 2; pokus += 1) {
      const targetedOk =
        await synchronizujCekajiciLokalniZmenu();

      if (
        targetedOk === true &&
        !aktivniKonfliktySyncu.has(noteId)
      ) {
        return true;
      }

      if (!maCilenyPrivateV2Dluh()) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 120)
      );
    }

    if (maCilenyPrivateV2Dluh()) {
      return false;
    }
  }

  /*
   * PATCH 485 – editor confirmation už nikdy nesmí jako fallback
   * stáhnout celý snapshot. Jeden bezpečný V2/fast průchod stačí;
   * pokud nejde potvrdit, předání se raději odloží.
   */
  try {
    const vysledek =
      await spustRychlySyncPoznamekBezpecne();

    return Boolean(
      vysledek === true &&
      (!noteId || !aktivniKonfliktySyncu.has(noteId))
    );
  } catch (error) {
    console.warn(
      "Potvrzovací synchronizace editoru byla odložena:",
      error
    );
    return false;
  }
}


window.LubaNoteSync = {
  spustBezpecne: spustStartSyncBezpecne,
  ziskejDeviceId: getDeviceId,
  spustRychle: spustRychlySyncPoznamekBezpecne,
  naplanujPoLokalniZmene:
    naplanujSynchronizaciPoLokalniZmene,
  provedLokalniZmenuBezKolizeSeSync,
  provedLokalniZmenuASynchronizuj,
  zaradCilenouPrivatePoznamku:
    zaradKonkretniPrivatePoznamkuV2,
  synchronizujPoznamkyTed,
  ziskejIdPoznamekEditovanychJinde,
  ziskejKonflikty: () =>
    Array.from(aktivniKonfliktySyncu.values()),
  ziskejCloudSyncMeta,
  zaradSmazaniHromadne:
    pridejCekajiciSmazaniHromadne,
  spustSafeBootstrap: spustSafeBootstrapV2,
  maRozpracovanySafeBootstrap: async () => {
    const user = await getCurrentUser();
    return Boolean(
      user?.id && nactiSafeBootstrapMarker(user.id)
    );
  },
  /* PATCH 487 – lehký synchronní signál pro pomocné moduly.
     Chat / Shared / Invitations podle něj umí při čistém klientovi
     vypnout pouze AUTOMATICKÝ polling. Ruční otevření funkcí zůstává. */
  jeBootstrapPending: () =>
    posledniFastSyncStav === "BOOTSTRAP-PENDING",
  spustExistingReconcile: async () => {
    const user = await getCurrentUser();
    return Boolean(
      user?.id &&
      await spustExistingClientReconcileV2(user.id, { force: true })
    );
  }
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

  if (jeAktivniRezimPouzeTotoZarizeni()) {
    casovacSyncuPoAktivaci = null;
    nastavStavPouzeTotoZarizeni();
    return;
  }

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

      /* PATCH 487 – Quota Saver. Čistý klient čekající na výslovný
         Safe Bootstrap nemá při každém focus/pageshow znovu volat
         fingerprint RPC. Server se stejně nesmí automaticky stáhnout
         a explicitní bootstrap si udělá vlastní bezpečné kontroly. */
      if (
        posledniFastSyncStav === "BOOTSTRAP-PENDING" &&
        !maCilenyPrivateV2Dluh() &&
        !lokalniZmenaCekaNaPotvrzeniServerem &&
        nactiCekajiciSmazani().length === 0
      ) {
        window.LubaNoteStartupDiag?.zapis?.(
          "QUOTA",
          "FOREGROUND POLL SKIP | bootstrap-pending"
        );
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

/* PATCH 586 – přepnutí pracovního prostoru řídí i obsahový sync.
   LOCAL: zrušíme pouze časovače/retry, dluhy nemažeme.
   CLOUD: zachované dluhy se bezpečně dokončí standardním start flow. */
window.addEventListener(
  "lubanote:storage-scope-change",
  (event) => {
    const scope = event.detail?.scope;

    if (scope === "local") {
      clearTimeout(casovacSyncuPoAktivaci);
      casovacSyncuPoAktivaci = null;
      clearTimeout(casovacSynchronizacePoLokalniZmene);
      casovacSynchronizacePoLokalniZmene = null;
      zastavKontroluNavratuInternetu();
      nastavStavPouzeTotoZarizeni();

      window.LubaNoteStartupDiag?.zapis?.(
        "LOCAL",
        "LOCAL MODE ON | content sync timers stopped"
      );
      return;
    }

    nastavStavSynchronizaceUI("pending");
    setTimeout(() => {
      spustStartSyncBezpecne().catch(() => {});
    }, 0);
  }
);

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
  "offline",
  () => {
    if (pouzivaNativeNetworkAutorituV2()) {
      /* PATCH 504 – browser offline je pouze bezpečnostní veto.
         Staré native=true už nesmí povolit žádný další targeted request.
         Browser online tento latch nezruší; čekáme na nový VALIDATED=true. */
      nativeNetworkCekaNaNovePotvrzeniV2 = true;

      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "BROWSER NETWORK VETO | offline | wait-native-revalidate"
      );
      return;
    }

    stitkyCekajiNaRefreshPoNavratuInternetu = true;

    window.LubaNoteStartupDiag?.zapis?.(
      "TAG-VD",
      "EVENT OFFLINE | pending=true"
    );
  }
);

window.addEventListener(
  "online",
  () => {
    if (pouzivaNativeNetworkAutorituV2()) {
      window.LubaNoteStartupDiag?.zapis?.(
        "V2",
        "BROWSER NETWORK IGNORE | online | native-authority"
      );
      return;
    }

    zpracujTargetV2NavratSite("online-event");

    window.LubaNoteStartupDiag?.zapis?.(
      "TAG-VD",
      `EVENT ONLINE | pending=${stitkyCekajiNaRefreshPoNavratuInternetu}`
    );

    setTimeout(
      spustStartSyncBezpecne,
      400
    );
  }
);

/* PATCH 502 – plugin je registrovaný nativně před načtením WebView.
   setTimeout pouze oddělí inicializaci listeneru od synchronního načtení
   modulu; žádný síťový request tím nevzniká. */
setTimeout(aktivujNativeNetworkBridgeV2, 0);

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
