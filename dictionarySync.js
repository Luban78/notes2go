/* ==============================================================
   LUBANOTE – PERSONAL DICTIONARY SYNC (PATCH 650)

   - synchronizuje pouze naučený / osobní slovník LubaKeyboard,
   - základní vestavěný slovník se do cloudu neposílá,
   - delta po jednotlivých slovech + tombstone pro smazání,
   - lokální změny jsou offline-first a čekají ve frontě,
   - při aktivním prostoru „Toto zařízení“ žádný dictionary sync neběží.
   ============================================================== */
(() => {
  "use strict";

  const OWNER_KEY = "lubanoteLocalOwnerUserId";
  const PREFIX_DIRTY = "lubanote_dictionary_dirty_v1:";
  const PREFIX_CURSOR = "lubanote_dictionary_cursor_v1:";
  const PREFIX_BOOTSTRAP = "lubanote_dictionary_bootstrap_v1:";

  let probihajici = null;
  let casovac = null;
  let posledniSyncAt = 0;

  const owner = () => String(localStorage.getItem(OWNER_KEY) || "").trim();
  const dirtyKey = (id) => `${PREFIX_DIRTY}${id}`;
  const cursorKey = (id) => `${PREFIX_CURSOR}${id}`;
  const bootstrapKey = (id) => `${PREFIX_BOOTSTRAP}${id}`;
  const rowKey = (row) => `${String(row?.language || "")}|${String(row?.normalizedWord || row?.normalized_word || "")}`;

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
    const rev = Math.max(0, Number(value || 0));
    localStorage.setItem(cursorKey(id), String(rev));
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

  function zaradZmenu(id, row) {
    if (!id || !row?.language || !row?.normalizedWord) return;
    const dirty = nactiDirty(id);
    dirty[rowKey(row)] = {
      language: String(row.language),
      normalizedWord: String(row.normalizedWord),
      word: String(row.word || row.normalizedWord),
      count: Math.max(0, Math.min(9999, Number(row.count || 0))),
      deleted: row.deleted === true,
      queuedAt: Date.now()
    };
    ulozDirty(id, dirty);
  }

  function zaradCelouLokalniKopii(id) {
    const rows = window.LubaNoteKeyboard?.exportujSlovnikProSync?.() || [];
    rows.forEach((row) => zaradZmenu(id, { ...row, deleted: false }));
  }

  function naplanuj(delay = 5000) {
    clearTimeout(casovac);
    casovac = setTimeout(() => {
      void synchronizuj();
    }, Math.max(0, Number(delay || 0)));
  }

  function maxRevision(rows, fallback = 0) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (max, row) => Math.max(max, Number(row?.revision || 0)),
      Number(fallback || 0)
    );
  }

  async function synchronizuj({ force = false } = {}) {
    if (probihajici) return probihajici;

    const id = owner();
    if (!id || jeLocalMode()) return false;
    if (!force && Date.now() - posledniSyncAt < 1500) return false;
    if (!(await sitJeOpravduDostupna())) return false;

    const cloud = window.LubaNoteSupabase;
    const keyboard = window.LubaNoteKeyboard;

    /* Auth session sama nestačí. Stejně jako hlavní LubaNote čekáme, až
       server skutečně povolí aktivní účet / plán. */
    if (cloud?.jeAktivniUcetPotvrzenProTentoBeh?.() !== true) {
      return false;
    }

    if (
      !cloud?.nactiZmenyOsobnihoSlovniku650 ||
      !cloud?.ulozZmenyOsobnihoSlovniku650 ||
      !keyboard?.aplikujCloudoveZmenySlovniku
    ) {
      return false;
    }

    keyboard.nastavVlastnikaSlovniku?.(id);

    probihajici = (async () => {
      try {
        let cursor = nactiCursor(id);

        /* 1) Nejdřív stáhnout serverové změny. Lokální dirty položky mají
           přednost, takže vzdálená změna nerozbije čerstvou offline editaci. */
        for (let batch = 0; batch < 20; batch += 1) {
          const result = await cloud.nactiZmenyOsobnihoSlovniku650(cursor, 500);
          if (!result?.ok) return false;

          const rows = Array.isArray(result.rows) ? result.rows : [];
          const dirty = nactiDirty(id);

          /* Pokud stejné slovo mezitím změnilo i jiné zařízení, četnost
             nesmí klesnout jen proto, že naše offline fronta byla starší. */
          rows.forEach((row) => {
            const key = rowKey(row);
            const localDirty = dirty[key];
            if (!localDirty || row?.deleted === true || localDirty.deleted === true) return;
            localDirty.count = Math.max(
              Number(localDirty.count || 0),
              Number(row?.usage_count || 0)
            );
          });
          ulozDirty(id, dirty);

          keyboard.aplikujCloudoveZmenySlovniku(
            rows,
            Object.keys(dirty)
          );

          const dalsiCursor = maxRevision(rows, cursor);
          if (dalsiCursor > cursor) {
            cursor = dalsiCursor;
            ulozCursor(id, cursor);
          }

          if (rows.length < 500) break;
        }

        /* 2) První připojení zařízení: po aplikaci serverových tombstonů
           pošleme jednou současnou lokální kopii. Tím bezpečně migrujeme
           slovník existující ještě před patchem 650. */
        if (localStorage.getItem(bootstrapKey(id)) !== "1") {
          zaradCelouLokalniKopii(id);
        }

        /* 3) Upload pouze změněných slov. */
        for (let batch = 0; batch < 30; batch += 1) {
          const dirty = nactiDirty(id);
          const entries = Object.entries(dirty).slice(0, 200);
          if (entries.length === 0) break;

          const payload = entries.map(([, row]) => row);
          const sentSnapshot = Object.fromEntries(entries);
          const result = await cloud.ulozZmenyOsobnihoSlovniku650(payload);
          if (!result?.ok) return false;

          cursor = maxRevision(result.rows, cursor);
          ulozCursor(id, cursor);

          /* Pokud během requestu stejné slovo dostalo novou lokální změnu,
             novější položku ve frontě nesmažeme. */
          const current = nactiDirty(id);
          entries.forEach(([key, row]) => {
            if (JSON.stringify(current[key]) === JSON.stringify(sentSnapshot[key])) {
              delete current[key];
            }
          });
          ulozDirty(id, current);
        }

        if (Object.keys(nactiDirty(id)).length === 0) {
          localStorage.setItem(bootstrapKey(id), "1");
        }

        posledniSyncAt = Date.now();
        return true;
      } catch (error) {
        console.warn("Synchronizace osobního slovníku byla odložena:", error);
        return false;
      } finally {
        probihajici = null;
      }
    })();

    return probihajici;
  }

  window.addEventListener("lubanote:dictionary-change", (event) => {
    const detail = event?.detail || {};
    if (detail.source !== "local") return;

    const id = owner();
    if (!id || !detail.language || !detail.normalizedWord) return;

    zaradZmenu(id, {
      language: detail.language,
      normalizedWord: detail.normalizedWord,
      word: detail.word || detail.normalizedWord,
      count: detail.count || 0,
      deleted: detail.operation === "delete"
    });

    naplanuj(5000);
  });

  window.addEventListener("lubanote:account-active", (event) => {
    const id = String(event?.detail?.userId || owner()).trim();
    if (!id) return;
    window.LubaNoteKeyboard?.nastavVlastnikaSlovniku?.(id);
    naplanuj(300);
  });

  window.addEventListener("lubanote:auth-valid", () => naplanuj(500));
  window.addEventListener("online", () => naplanuj(800));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - posledniSyncAt > 30000) {
      naplanuj(1200);
    }
  });

  /* Offline start má hned správně oddělený lokální slovník podle ownera.
     Síťový sync se spustí jen pokud je účet + síť skutečně dostupná. */
  const startOwner = owner();
  if (startOwner) {
    window.LubaNoteKeyboard?.nastavVlastnikaSlovniku?.(startOwner);
    naplanuj(1200);
  }

  window.LubaNoteDictionarySync = Object.freeze({
    synchronizujTed: () => synchronizuj({ force: true }),
    maCekajiciZmeny: () => {
      const id = owner();
      return Boolean(id && Object.keys(nactiDirty(id)).length > 0);
    }
  });
})();
