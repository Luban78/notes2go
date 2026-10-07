/* ==================================================
   LUBANOTE – FULL E2E CORE
   PATCH 680A

   Tento modul ZATÍM NEŠIFRUJE obsah poznámek.
   Připravuje pouze účetní Root Key a bezpečný klíčový základ pro další
   E2E kroky.

   Princip:
   - náhodný 256bit Account Root Key vzniká pouze na klientovi,
   - trvale se na zařízení ukládá pouze jeho AES-GCM obálka; po odemčení
     se Root Key importuje do paměti jako non-extractable HKDF CryptoKey,
   - server nikdy nedostane plaintext Root Key,
   - server drží pouze AES-GCM obálku Root Key chráněnou existujícím
     hlavním/media klíčem,
   - další zařízení obálku stáhne a rozbalí až po zpřístupnění
     hlavního/media klíče,
   - z Root Key se později odvodí oddělené doménové klíče přes HKDF.
================================================== */
(() => {
  "use strict";

  const VERZE_MODULU = "E2E-CORE-680A";
  const ROOT_KEY_VERZE = 1;
  const ROOT_KEY_ALGORITMUS = "HKDF-SHA-256";
  const ROOT_BOX_ALGORITMUS = "AES-GCM+MEDIA-KEK-V1";
  const ROOT_DB = "LubaNoteE2ECore";
  const ROOT_DB_VERZE = 1;
  const ROOT_STORE = "keys";
  const ROOT_RECORD_PREFIX = "account-root-v1:";
  const ROOT_WRAP_KONTEXT_PREFIX = "LubaNote-e2e-account-root-v1";
  const DOMAIN_SALT_PREFIX = "LubaNote-e2e-domain-salt-v1";
  const DOMAIN_INFO_PREFIX = "LubaNote-e2e-domain-v1";

  let otevrenaDbPromise = null;
  let rootKlic = null;
  let rootKontext = null;
  let pripravaPromise = null;
  let posledniStav = Object.freeze({
    ok: false,
    ready: false,
    reason: "not_initialized",
    source: null,
    keyId: null,
    userId: null,
    module: VERZE_MODULU
  });

  const domenoveKlice = new Map();

  function zapisDiag(zprava, detail = null) {
    try {
      window.LubaNoteStartupDiag?.zapis?.(
        "E2E",
        detail ? `${zprava} | ${JSON.stringify(detail)}` : zprava
      );
    } catch (_error) {}
  }

  function nastavStav(stav) {
    posledniStav = Object.freeze({
      module: VERZE_MODULU,
      ok: stav?.ok === true,
      ready: stav?.ready === true,
      reason: stav?.reason || null,
      source: stav?.source || null,
      keyId: stav?.keyId || null,
      userId: stav?.userId || null
    });

    try {
      window.dispatchEvent(
        new CustomEvent("lubanote:e2e-core-state", {
          detail: posledniStav
        })
      );
    } catch (_error) {}

    if (posledniStav.ready) {
      zapisDiag("ROOT READY", {
        source: posledniStav.source,
        keyId: posledniStav.keyId
      });
    } else if (posledniStav.reason) {
      zapisDiag("ROOT NOT READY", {
        reason: posledniStav.reason
      });
    }

    return posledniStav;
  }


  function ziskejSupabase() {
    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient) {
        return supabaseClient;
      }
    } catch (_error) {}

    return window.supabaseClient || null;
  }

  function jeRootKlicDostupny() {
    return Boolean(
      rootKlic &&
      rootKontext?.userId &&
      rootKontext?.keyId
    );
  }

  function base64UrlZBajtu(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  async function vytvorKeyId(rawRoot) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", rawRoot)
    );
    return `rk1_${base64UrlZBajtu(digest.slice(0, 18))}`;
  }

  async function importujRootKlic(rawRoot) {
    const bytes = rawRoot instanceof Uint8Array
      ? rawRoot
      : new Uint8Array(rawRoot || []);

    if (bytes.length !== 32) {
      throw new Error("E2E Root Key musí mít přesně 32 bajtů.");
    }

    return crypto.subtle.importKey(
      "raw",
      bytes,
      "HKDF",
      false,
      ["deriveKey", "deriveBits"]
    );
  }

  function otevriDb() {
    if (!globalThis.indexedDB) {
      return Promise.reject(
        new Error("IndexedDB pro E2E Root Key není dostupná.")
      );
    }

    if (otevrenaDbPromise) return otevrenaDbPromise;

    otevrenaDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(ROOT_DB, ROOT_DB_VERZE);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROOT_STORE)) {
          db.createObjectStore(ROOT_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        otevrenaDbPromise = null;
        reject(
          request.error ||
          new Error("E2E Root Key DB se nepodařilo otevřít.")
        );
      };
    });

    return otevrenaDbPromise;
  }

  function rootRecordId(userId) {
    return `${ROOT_RECORD_PREFIX}${String(userId || "")}`;
  }

  async function nactiLokalniRootRecord(userId) {
    if (!userId) return null;

    const db = await otevriDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ROOT_STORE, "readonly");
      const request = tx.objectStore(ROOT_STORE).get(rootRecordId(userId));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(
        request.error || new Error("Lokální E2E Root Key se nepodařilo načíst.")
      );
    });
  }

  async function ulozLokalniRootRecord({
    userId,
    keyId,
    box
  }) {
    if (!userId || !keyId || !box) {
      throw new Error("Chybí data pro uložení E2E Root Key.");
    }

    const db = await otevriDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(ROOT_STORE, "readwrite");
      tx.objectStore(ROOT_STORE).put({
        id: rootRecordId(userId),
        userId,
        keyId,
        keyVersion: ROOT_KEY_VERZE,
        keyAlgorithm: ROOT_KEY_ALGORITMUS,
        boxAlgorithm: ROOT_BOX_ALGORITMUS,
        box,
        savedAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(
        tx.error || new Error("E2E Root Key se nepodařilo uložit do zařízení.")
      );
      tx.onabort = () => reject(
        tx.error || new Error("Uložení E2E Root Key bylo přerušeno.")
      );
    });
  }

  function maPlatnyLokalniRecord(record, userId) {
    return Boolean(
      record?.userId === userId &&
      record?.keyId &&
      Number(record?.keyVersion) === ROOT_KEY_VERZE &&
      record?.keyAlgorithm === ROOT_KEY_ALGORITMUS &&
      record?.box &&
      record?.boxAlgorithm === ROOT_BOX_ALGORITMUS
    );
  }

  function maPlatnyServerRecord(record) {
    return Boolean(
      record &&
      Number(record.e2e_root_key_version) === ROOT_KEY_VERZE &&
      record.e2e_root_key_algorithm === ROOT_KEY_ALGORITMUS &&
      typeof record.e2e_root_key_id === "string" &&
      record.e2e_root_key_id.length > 0 &&
      record.e2e_root_key_box &&
      typeof record.e2e_root_key_box === "object"
    );
  }

  async function ziskejAktualniUserId() {
    try {
      if (typeof getCurrentUser === "function") {
        const user = await getCurrentUser();
        if (user?.id) return user.id;
      }
    } catch (_error) {}

    try {
      const klient = ziskejSupabase();
      if (klient?.auth?.getSession) {
        const { data } = await klient.auth.getSession();
        return data?.session?.user?.id || null;
      }
    } catch (_error) {}

    return null;
  }

  async function nactiServerRootRecord(userId) {
    if (!navigator.onLine) {
      return { ok: false, reason: "offline", data: null };
    }

    const klient = ziskejSupabase();
    if (!klient) {
      return { ok: false, reason: "supabase_unavailable", data: null };
    }

    const { data, error } = await klient
      .from("secret_settings")
      .select(
        "e2e_root_key_version, e2e_root_key_algorithm, e2e_root_key_id, e2e_root_key_box"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      const msg = String(error.message || error);
      if (
        msg.includes("e2e_root_key_") ||
        msg.includes("column") ||
        msg.includes("schema cache")
      ) {
        return { ok: false, reason: "schema_missing", error, data: null };
      }
      return { ok: false, reason: "server_read_failed", error, data: null };
    }

    return { ok: true, reason: null, data: data || null };
  }

  async function inicializujServerRootPokudChybi(userId, kandidat) {
    const klient = ziskejSupabase();
    if (!klient) {
      return { ok: false, reason: "supabase_unavailable", data: null };
    }

    const hodnoty = {
      e2e_root_key_version: ROOT_KEY_VERZE,
      e2e_root_key_algorithm: ROOT_KEY_ALGORITMUS,
      e2e_root_key_id: kandidat.keyId,
      e2e_root_key_box: kandidat.box,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await klient
      .from("secret_settings")
      .update(hodnoty)
      .eq("user_id", userId)
      .is("e2e_root_key_box", null)
      .select(
        "e2e_root_key_version, e2e_root_key_algorithm, e2e_root_key_id, e2e_root_key_box"
      );

    if (error) {
      return { ok: false, reason: "server_init_failed", error, data: null };
    }

    if (Array.isArray(data) && data.length === 1) {
      return { ok: true, created: true, data: data[0] };
    }

    const autoritativni = await nactiServerRootRecord(userId);
    if (!autoritativni.ok) return autoritativni;

    return {
      ok: true,
      created: false,
      data: autoritativni.data
    };
  }

  function rootWrapKontext(userId) {
    return `${ROOT_WRAP_KONTEXT_PREFIX}:${String(userId)}`;
  }

  async function zabalRootRaw(rawRoot, userId) {
    if (!window.LubaNoteMediaCrypto?.zabalBajtyE2ECore) {
      const error = new Error("MediaCrypto E2E Core wrapper není dostupný.");
      error.code = "LUBANOTE_E2E_MEDIA_KEK_UNAVAILABLE";
      throw error;
    }

    return window.LubaNoteMediaCrypto.zabalBajtyE2ECore(
      rawRoot,
      rootWrapKontext(userId)
    );
  }

  async function rozbalRootRaw(box, userId) {
    if (!window.LubaNoteMediaCrypto?.rozbalBajtyE2ECore) {
      const error = new Error("MediaCrypto E2E Core unwrapper není dostupný.");
      error.code = "LUBANOTE_E2E_MEDIA_KEK_UNAVAILABLE";
      throw error;
    }

    return window.LubaNoteMediaCrypto.rozbalBajtyE2ECore(
      box,
      rootWrapKontext(userId)
    );
  }

  function aktivujRootKlic(key, kontext) {
    rootKlic = key;
    rootKontext = {
      userId: kontext.userId,
      keyId: kontext.keyId,
      keyVersion: ROOT_KEY_VERZE,
      keyAlgorithm: ROOT_KEY_ALGORITMUS
    };
    domenoveKlice.clear();
  }

  async function pripravZLokalnihoRecordu(record, userId) {
    if (!maPlatnyLokalniRecord(record, userId)) return false;

    const raw = await rozbalRootRaw(record.box, userId);
    if (!(raw instanceof Uint8Array) || raw.length !== 32) {
      throw new Error("Lokální E2E Root Key obálka má neplatný obsah.");
    }

    const overenyKeyId = await vytvorKeyId(raw);
    if (overenyKeyId !== record.keyId) {
      raw.fill(0);
      throw new Error("Kontrola lokální identity E2E Root Key selhala.");
    }

    const key = await importujRootKlic(raw);
    raw.fill(0);

    aktivujRootKlic(key, {
      userId,
      keyId: record.keyId
    });
    return true;
  }

  async function pripravZeServerRecordu(serverRecord, userId) {
    if (!maPlatnyServerRecord(serverRecord)) {
      throw new Error("Serverový E2E Root Key záznam je neplatný.");
    }

    const raw = await rozbalRootRaw(
      serverRecord.e2e_root_key_box,
      userId
    );

    if (!(raw instanceof Uint8Array) || raw.length !== 32) {
      throw new Error("Rozbalený E2E Root Key má neplatnou délku.");
    }

    const overenyKeyId = await vytvorKeyId(raw);
    if (overenyKeyId !== serverRecord.e2e_root_key_id) {
      raw.fill(0);
      throw new Error("Kontrola identity E2E Root Key selhala.");
    }

    const key = await importujRootKlic(raw);
    raw.fill(0);

    await ulozLokalniRootRecord({
      userId,
      keyId: serverRecord.e2e_root_key_id,
      box: serverRecord.e2e_root_key_box
    });

    aktivujRootKlic(key, {
      userId,
      keyId: serverRecord.e2e_root_key_id
    });
  }

  async function vytvorNovyRootKandidat(userId) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const keyId = await vytvorKeyId(raw);
    const box = await zabalRootRaw(raw, userId);
    const key = await importujRootKlic(raw);
    raw.fill(0);

    return { userId, keyId, key, box };
  }

  async function pripravRootKlicProUcet(userId, volby = {}) {
    const id = String(userId || "");
    if (!id) {
      return nastavStav({
        ok: false,
        ready: false,
        reason: "missing_user",
        userId: null
      });
    }

    if (
      jeRootKlicDostupny() &&
      rootKontext?.userId === id
    ) {
      return nastavStav({
        ok: true,
        ready: true,
        reason: null,
        source: "memory",
        keyId: rootKontext.keyId,
        userId: id
      });
    }

    if (pripravaPromise) return pripravaPromise;

    pripravaPromise = (async () => {
      try {
        const mediaReady =
          window.LubaNoteMediaCrypto?.jeKlicDostupny?.() === true ||
          await window.LubaNoteMediaCrypto?.pripravMediaKlicZeZarizeni?.();

        if (mediaReady !== true) {
          return nastavStav({
            ok: false,
            ready: false,
            reason: "media_kek_locked",
            userId: id
          });
        }

        let lokalni = null;
        try {
          lokalni = await nactiLokalniRootRecord(id);
        } catch (error) {
          console.warn("LubaNote E2E Core: lokální Root Key nelze načíst:", error);
        }

        const lokalniPlatny = maPlatnyLokalniRecord(lokalni, id);

        if (!navigator.onLine) {
          if (lokalniPlatny) {
            await pripravZLokalnihoRecordu(lokalni, id);
            return nastavStav({
              ok: true,
              ready: true,
              source: "device-offline",
              keyId: lokalni.keyId,
              userId: id
            });
          }

          return nastavStav({
            ok: false,
            ready: false,
            reason: "offline_without_device_root",
            userId: id
          });
        }

        const server = await nactiServerRootRecord(id);
        if (!server.ok) {
          /* 680A je přípravný patch. Chybějící SQL schema nesmí rozbít
             současnou aplikaci ani Sync; pouze E2E Core zůstane NOT READY. */
          if (
            lokalniPlatny &&
            server.reason !== "schema_missing"
          ) {
            await pripravZLokalnihoRecordu(lokalni, id);
            return nastavStav({
              ok: true,
              ready: true,
              source: "device-server-temporary-error",
              keyId: lokalni.keyId,
              userId: id
            });
          }

          return nastavStav({
            ok: false,
            ready: false,
            reason: server.reason,
            userId: id
          });
        }

        if (maPlatnyServerRecord(server.data)) {
          if (
            lokalniPlatny &&
            lokalni.keyId === server.data.e2e_root_key_id
          ) {
            await pripravZLokalnihoRecordu(lokalni, id);
            return nastavStav({
              ok: true,
              ready: true,
              source: "device+server-verified",
              keyId: lokalni.keyId,
              userId: id
            });
          }

          await pripravZeServerRecordu(server.data, id);
          return nastavStav({
            ok: true,
            ready: true,
            source: "server-envelope",
            keyId: server.data.e2e_root_key_id,
            userId: id
          });
        }

        /* Server Root Key ještě nemá. Pokud ho zařízení už má, použijeme
           jeho uloženou obálku; tím lze bezpečně opravit nový/obnovený
           backend bez exportu plaintext klíče. Jinak vznikne nový Root Key. */
        let kandidat;
        if (lokalniPlatny) {
          kandidat = {
            userId: id,
            keyId: lokalni.keyId,
            key: null,
            box: lokalni.box
          };
        } else {
          kandidat = await vytvorNovyRootKandidat(id);
        }

        const init = await inicializujServerRootPokudChybi(id, kandidat);
        if (!init.ok || !maPlatnyServerRecord(init.data)) {
          return nastavStav({
            ok: false,
            ready: false,
            reason: init.reason || "server_init_unverified",
            userId: id
          });
        }

        /* Při souběhu dvou zařízení může vyhrát druhý Root Key. Nikdy
           nepoužijeme svůj kandidát, dokud neověříme autoritativní server. */
        if (init.data.e2e_root_key_id === kandidat.keyId) {
          await ulozLokalniRootRecord(kandidat);

          if (kandidat.key) {
            aktivujRootKlic(kandidat.key, {
              userId: id,
              keyId: kandidat.keyId
            });
          } else {
            await pripravZLokalnihoRecordu(
              {
                userId: id,
                keyId: kandidat.keyId,
                keyVersion: ROOT_KEY_VERZE,
                keyAlgorithm: ROOT_KEY_ALGORITMUS,
                boxAlgorithm: ROOT_BOX_ALGORITMUS,
                box: kandidat.box
              },
              id
            );
          }

          return nastavStav({
            ok: true,
            ready: true,
            source: init.created ? "created" : "device-restored-server",
            keyId: kandidat.keyId,
            userId: id
          });
        }

        await pripravZeServerRecordu(init.data, id);
        return nastavStav({
          ok: true,
          ready: true,
          source: "server-race-winner",
          keyId: init.data.e2e_root_key_id,
          userId: id
        });
      } catch (error) {
        console.error("LubaNote E2E Core 680A: příprava Root Key selhala:", error);
        return nastavStav({
          ok: false,
          ready: false,
          reason: error?.code || error?.message || "root_prepare_failed",
          userId: id
        });
      } finally {
        pripravaPromise = null;
      }
    })();

    return pripravaPromise;
  }

  async function pripravAktualniUcet(volby = {}) {
    const userId = await ziskejAktualniUserId();
    if (!userId) {
      return nastavStav({
        ok: false,
        ready: false,
        reason: "no_session",
        userId: null
      });
    }
    return pripravRootKlicProUcet(userId, volby);
  }

  async function odvodDomenovyKlic(domena, usages = ["encrypt", "decrypt"]) {
    if (!jeRootKlicDostupny()) {
      const stav = await pripravAktualniUcet();
      if (!stav.ready) {
        const error = new Error(
          `E2E Root Key není připraven (${stav.reason || "unknown"}).`
        );
        error.code = "LUBANOTE_E2E_ROOT_NOT_READY";
        throw error;
      }
    }

    const normalizovanaDomena = String(domena || "").trim();
    if (!normalizovanaDomena) {
      throw new Error("Pro odvození E2E klíče chybí doména.");
    }

    const usageKey = [...usages].sort().join(",");
    const cacheKey = `${normalizovanaDomena}|${usageKey}`;
    if (domenoveKlice.has(cacheKey)) {
      return domenoveKlice.get(cacheKey);
    }

    const encoder = new TextEncoder();
    const salt = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(
          `${DOMAIN_SALT_PREFIX}:${rootKontext.userId}:${rootKontext.keyId}`
        )
      )
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: encoder.encode(
          `${DOMAIN_INFO_PREFIX}:${normalizovanaDomena}`
        )
      },
      rootKlic,
      { name: "AES-GCM", length: 256 },
      false,
      usages
    );

    domenoveKlice.set(cacheKey, key);
    return key;
  }

  async function selfTest() {
    try {
      const stav = await pripravAktualniUcet();
      if (!stav.ready) {
        return {
          ok: false,
          reason: stav.reason,
          keyId: stav.keyId || null
        };
      }

      const klic = await odvodDomenovyKlic("self-test-v1");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = new TextEncoder().encode(
        `LubaNote-e2e-self-test-v1:${stav.keyId}`
      );
      const plaintext = crypto.getRandomValues(new Uint8Array(32));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        klic,
        plaintext
      );
      const decrypted = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, additionalData: aad },
          klic,
          encrypted
        )
      );

      const ok =
        plaintext.length === decrypted.length &&
        plaintext.every((b, i) => b === decrypted[i]);

      plaintext.fill(0);
      decrypted.fill(0);

      zapisDiag(ok ? "SELF TEST PASS" : "SELF TEST FAIL", {
        keyId: stav.keyId
      });

      return {
        ok,
        reason: ok ? null : "roundtrip_mismatch",
        keyId: stav.keyId,
        source: stav.source
      };
    } catch (error) {
      console.error("LubaNote E2E Core self-test selhal:", error);
      return {
        ok: false,
        reason: error?.code || error?.message || "self_test_failed",
        keyId: posledniStav.keyId || null
      };
    }
  }

  function getStav() {
    return { ...posledniStav };
  }

  function resetPametiProTest() {
    rootKlic = null;
    rootKontext = null;
    domenoveKlice.clear();
    return nastavStav({
      ok: false,
      ready: false,
      reason: "memory_reset",
      userId: null
    });
  }

  window.LubaNoteE2ECore = Object.freeze({
    verze: VERZE_MODULU,
    jePripraven: jeRootKlicDostupny,
    pripravAktualniUcet,
    pripravRootKlicProUcet,
    odvodDomenovyKlic,
    selfTest,
    getStav,
    resetPametiProTest
  });

  /* Autoritativní start po potvrzení ACTIVE účtu. */
  window.addEventListener("lubanote:account-active", (event) => {
    const userId = event?.detail?.userId || null;
    if (!userId) return;

    void pripravRootKlicProUcet(userId).then((stav) => {
      if (stav.ready) void selfTest();
    });
  });

  /* Když byl event account-active velmi rychlý nebo se E2E modul načetl
     po obnovené session, uděláme neblokující fallback pokus. */
  window.addEventListener("load", () => {
    setTimeout(() => {
      void pripravAktualniUcet().then((stav) => {
        if (stav.ready) void selfTest();
      });
    }, 1200);
  }, { once: true });
})();
