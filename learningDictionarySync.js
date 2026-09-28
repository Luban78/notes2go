/* ==============================================================
   LUBANOTE – VÝUKA JAZYKŮ / STUDIJNÍ SLOVNÍK SYNC V1 (PATCH 660B)
   --------------------------------------------------------------
   - offline-first dirty fronta po jednotlivých položkách,
   - server delta cursor podle monotonní revision,
   - tombstone pro smazání,
   - první bootstrap zachová existující lokální slovíčka,
   - LOCAL prostor nic neposílá do cloudu,
   - žádný full snapshot notes ani vazba na hlavní Notes Sync V2.
   ============================================================== */
(() => {
  "use strict";

  const OWNER_KEY = "lubanoteLocalOwnerUserId";
  const DIRTY_PREFIX = "lubanote_learning_sync_dirty_v1:";
  const CURSOR_PREFIX = "lubanote_learning_sync_cursor_v1:";
  const BOOTSTRAP_PREFIX = "lubanote_learning_sync_bootstrap_v1:";
  const JAZYKY = ["cs", "sk", "en", "de", "pl", "es"];

  let probihajici = null;
  let casovac = null;
  let posledniSyncAt = 0;

  function diag(text) {
    window.LubaNoteStartupDiag?.zapis?.("LEARN-SYNC", String(text || ""));
  }

  const owner = () => String(localStorage.getItem(OWNER_KEY) || "").trim();
  const dirtyKey = (id) => `${DIRTY_PREFIX}${id}`;
  const cursorKey = (id) => `${CURSOR_PREFIX}${id}`;
  const bootstrapKey = (id) => `${BOOTSTRAP_PREFIX}${id}`;

  function jeLocalMode() {
    return window.LubaNoteStorageScope?.ziskejAktivni?.() === "local";
  }

  function nactiJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "");
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function ulozJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function nactiDirty(id) {
    const value = nactiJson(dirtyKey(id), {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ulozDirty(id, value) {
    ulozJson(dirtyKey(id), value || {});
  }

  function nactiCursor(id) {
    const value = Number(localStorage.getItem(cursorKey(id)) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function ulozCursor(id, value) {
    localStorage.setItem(cursorKey(id), String(Math.max(0, Number(value || 0))));
  }

  function maxRevision(rows, fallback = 0) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (max, row) => Math.max(max, Number(row?.revision || 0)),
      Number(fallback || 0)
    );
  }

  function prekladovyJazyk(language) {
    const api = window.LubaNoteLearningDictionary;
    return String(api?.ziskejPrekladovyJazyk?.(language) || (language === "cs" ? "en" : "cs"));
  }

  function normalizujPolozku(item, { deleted = false, fallbackLanguage = "en", deletedAt = 0 } = {}) {
    const language = String(item?.language || fallbackLanguage || "en");
    const updatedAt = Math.max(0, Number(item?.updatedAt || deletedAt || Date.now()));
    return {
      itemId: String(item?.id || item?.itemId || "").trim(),
      language,
      translationLanguage: String(item?.translationLanguage || prekladovyJazyk(language)),
      term: String(item?.term || ""),
      translation: String(item?.translation || ""),
      context: String(item?.context || ""),
      bookTitle: String(item?.bookTitle || ""),
      chapterTitle: String(item?.chapterTitle || ""),
      sourceType: String(item?.sourceType || "manual"),
      createdAt: Math.max(0, Number(item?.createdAt || 0)),
      updatedAt,
      level: Math.max(0, Number(item?.level || 0)),
      reviews: Math.max(0, Number(item?.reviews || 0)),
      correct: Math.max(0, Number(item?.correct || 0)),
      wrong: Math.max(0, Number(item?.wrong || 0)),
      nextReviewAt: Math.max(0, Number(item?.nextReviewAt || 0)),
      lastReviewedAt: Math.max(0, Number(item?.lastReviewedAt || 0)),
      deleted: deleted === true
    };
  }

  function najdiLokalniPolozku(id, language) {
    const api = window.LubaNoteLearningDictionary;
    if (!api?.vse) return null;
    const langs = language ? [language] : JAZYKY;
    for (const lang of langs) {
      const found = api.vse(lang).find((item) => String(item?.id || "") === String(id || ""));
      if (found) return found;
    }
    return null;
  }

  function zaradZmenu(ownerId, row) {
    if (!ownerId || !row?.itemId || !row?.language) return;
    const dirty = nactiDirty(ownerId);
    dirty[String(row.itemId)] = { ...row, queuedAt: Date.now() };
    ulozDirty(ownerId, dirty);
  }

  function zaradCelouLokalniKopii(ownerId) {
    const api = window.LubaNoteLearningDictionary;
    if (!api?.vse) return;
    JAZYKY.forEach((language) => {
      api.vse(language).forEach((item) => {
        zaradZmenu(ownerId, normalizujPolozku(item, { fallbackLanguage: language }));
      });
    });
  }

  function naplanuj(delay = 1800) {
    clearTimeout(casovac);
    casovac = setTimeout(() => { void synchronizuj(); }, Math.max(0, Number(delay || 0)));
  }

  async function sitJeOpravduDostupna() {
    if (!navigator.onLine) return false;
    try {
      const network = window.Capacitor?.Plugins?.Network;
      if (window.Capacitor?.isNativePlatform?.() && network?.getStatus) {
        const status = await network.getStatus();
        return status?.connected !== false;
      }
    } catch (_error) {}
    return true;
  }

  function aplikujCloud(rows, ownerId) {
    const api = window.LubaNoteLearningDictionary;
    if (!api?.aplikujCloudoveZmenyProSync) return false;
    const dirtyIds = Object.keys(nactiDirty(ownerId));
    return api.aplikujCloudoveZmenyProSync(rows, dirtyIds);
  }

  async function pullDeltas(cloud, ownerId, startCursor) {
    let cursor = startCursor;
    for (let batch = 0; batch < 20; batch += 1) {
      const result = await cloud.nactiZmenyStudijnihoSlovniku660(cursor, 500);
      if (!result?.ok) return { ok: false, cursor };
      const rows = Array.isArray(result.rows) ? result.rows : [];
      aplikujCloud(rows, ownerId);
      const next = maxRevision(rows, cursor);
      if (next > cursor) {
        cursor = next;
        ulozCursor(ownerId, cursor);
      }
      if (rows.length < 500) break;
    }
    return { ok: true, cursor };
  }

  async function synchronizuj({ force = false, userIdHint = "" } = {}) {
    if (probihajici) {
      diag("JOIN | sync already running");
      return probihajici;
    }

    const id = String(userIdHint || owner()).trim();
    if (!id) {
      diag("SKIP | missing owner");
      return false;
    }
    if (jeLocalMode()) {
      diag("SKIP | local mode");
      return false;
    }
    if (!force && Date.now() - posledniSyncAt < 1500) {
      diag("SKIP | throttle");
      return false;
    }
    if (!(await sitJeOpravduDostupna())) {
      diag("SKIP | offline");
      return false;
    }

    const cloud = window.LubaNoteSupabase;
    const learning = window.LubaNoteLearningDictionary;
    if (cloud?.jeAktivniUcetPotvrzenProTentoBeh?.() !== true) {
      diag("SKIP | account gate");
      return false;
    }
    if (
      !cloud?.nactiZmenyStudijnihoSlovniku660 ||
      !cloud?.ulozZmenyStudijnihoSlovniku660 ||
      !learning?.aplikujCloudoveZmenyProSync
    ) {
      diag("SKIP | api unavailable");
      return false;
    }

    diag(`START | cursor=${nactiCursor(id)} dirty=${Object.keys(nactiDirty(id)).length}`);

    probihajici = (async () => {
      try {
        let cursor = nactiCursor(id);

        // 1) Nejdřív vzdálené změny. Lokální dirty ID se při aplikaci přeskočí.
        let pulled = await pullDeltas(cloud, id, cursor);
        if (!pulled.ok) return false;
        cursor = pulled.cursor;

        // 2) Jednorázově zařadit slovíčka existující ještě před Sync V1.
        // Děláme to až PO pullu, takže cloudový pokrok na novém zařízení vyhraje.
        if (localStorage.getItem(bootstrapKey(id)) !== "1") {
          zaradCelouLokalniKopii(id);
          diag(`BOOTSTRAP | dirty=${Object.keys(nactiDirty(id)).length}`);
        }

        // 3) Upload jen změněných položek, max 200 v jednom RPC.
        for (let batch = 0; batch < 30; batch += 1) {
          const dirty = nactiDirty(id);
          const entries = Object.entries(dirty).slice(0, 200);
          if (!entries.length) break;

          const snapshot = Object.fromEntries(entries);
          const payload = entries.map(([, row]) => row);
          const result = await cloud.ulozZmenyStudijnihoSlovniku660(payload);
          if (!result?.ok) return false;

          cursor = maxRevision(result.rows, cursor);
          ulozCursor(id, cursor);

          // Ack smažeme jen pokud se položka během requestu znovu nezměnila.
          const current = nactiDirty(id);
          const acked = [];
          entries.forEach(([key]) => {
            if (JSON.stringify(current[key]) === JSON.stringify(snapshot[key])) {
              delete current[key];
              acked.push(key);
            }
          });
          ulozDirty(id, current);

          if (acked.length && Array.isArray(result.rows)) {
            const ackSet = new Set(acked);
            learning.aplikujCloudoveZmenyProSync(
              result.rows.filter((row) => ackSet.has(String(row?.item_id || ""))),
              []
            );
          }
        }

        // 4) Krátký finální delta pull zachytí změnu z jiného zařízení,
        // která vznikla během našeho uploadu.
        pulled = await pullDeltas(cloud, id, cursor);
        if (!pulled.ok) return false;
        cursor = pulled.cursor;

        const remaining = Object.keys(nactiDirty(id)).length;
        if (remaining === 0) localStorage.setItem(bootstrapKey(id), "1");

        posledniSyncAt = Date.now();
        diag(`OK | cursor=${nactiCursor(id)} dirty=${remaining}`);
        return true;
      } catch (error) {
        diag(`ERROR | ${String(error?.message || error || "unknown")}`);
        console.warn("Synchronizace Výuky jazyků byla odložena:", error);
        return false;
      } finally {
        probihajici = null;
      }
    })();

    return probihajici;
  }

  function zpracujLokalniZmenu(detail = {}) {
    if (detail.source === "cloud") return false;

    const id = owner();
    const itemId = String(detail.id || "").trim();
    const language = String(detail.language || "en");
    const operation = String(detail.operation || "update");

    if (!id || !itemId) {
      diag(`QUEUE SKIP | op=${operation} owner=${id ? "yes" : "no"} item=${itemId ? "yes" : "no"}`);
      return false;
    }

    if (operation === "delete") {
      zaradZmenu(id, normalizujPolozku(
        { id: itemId, language, translationLanguage: prekladovyJazyk(language), updatedAt: Date.now() },
        { deleted: true, fallbackLanguage: language, deletedAt: Date.now() }
      ));
    } else {
      const item = najdiLokalniPolozku(itemId, language);
      if (!item) {
        diag(`QUEUE SKIP | op=${operation} local-item-missing`);
        return false;
      }
      zaradZmenu(id, normalizujPolozku(item, { fallbackLanguage: language }));
    }

    diag(`QUEUE | op=${operation} dirty=${Object.keys(nactiDirty(id)).length}`);
    naplanuj(1800);
    return true;
  }

  window.addEventListener("lubanote:learning-dictionary-change", (event) => {
    const detail = event?.detail || {};
    if (detail.learningSyncQueued === true) return;
    zpracujLokalniZmenu(detail);
  });

  window.addEventListener("lubanote:account-active", (event) => {
    const id = String(event?.detail?.userId || owner()).trim();
    if (!id) return;
    clearTimeout(casovac);
    void synchronizuj({ force: true, userIdHint: id });
  });

  window.addEventListener("lubanote:auth-valid", () => naplanuj(700));
  window.addEventListener("online", () => naplanuj(900));
  window.addEventListener("lubanote:storage-scope-change", (event) => {
    if (event?.detail?.scope !== "local") naplanuj(900);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - posledniSyncAt > 30000) naplanuj(1200);
  });

  if (owner()) naplanuj(1400);

  window.LubaNoteLearningDictionarySync = Object.freeze({
    zaradLokalniZmenu: (detail = {}) => zpracujLokalniZmenu(detail),
    synchronizujTed: () => synchronizuj({ force: true }),
    maCekajiciZmeny: () => {
      const id = owner();
      return Boolean(id && Object.keys(nactiDirty(id)).length > 0);
    },
    ziskejCursor: () => {
      const id = owner();
      return id ? nactiCursor(id) : 0;
    }
  });
})();
