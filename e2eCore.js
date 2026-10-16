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

  /* 686A: pouze diagnostika obnovy; nikdy nemeni klice ani data.
     Vysledek neobsahuje hesla, obalky ani identifikatory uctu. */
  async function recoveryPreflight() {
    const vysledek = {
      ok: false,
      readOnly: true,
      reason: null,
      rootReady: jeRootKlicDostupny(),
      deviceKekReady: Boolean(window.LubaNoteMediaCrypto?.jeKlicDostupny?.()),
      localEnvelope: false,
      serverEnvelope: false,
      sameKeyId: false,
      online: Boolean(navigator.onLine)
    };

    try {
      const userId = await ziskejAktualniUserId();
      if (!userId) {
        vysledek.reason = "not_authenticated";
        return vysledek;
      }

      const lokalni = await nactiLokalniRootRecord(userId);
      vysledek.localEnvelope = maPlatnyLokalniRecord(lokalni, userId);

      if (!vysledek.online) {
        vysledek.reason = "offline";
        return vysledek;
      }

      const server = await nactiServerRootRecord(userId);
      if (!server.ok) {
        vysledek.reason = server.reason || "server_read_failed";
        return vysledek;
      }

      vysledek.serverEnvelope = maPlatnyServerRecord(server.data);
      vysledek.sameKeyId = Boolean(
        vysledek.localEnvelope &&
        vysledek.serverEnvelope &&
        lokalni.keyId === server.data.e2e_root_key_id
      );

      vysledek.ok = Boolean(
        vysledek.rootReady &&
        vysledek.deviceKekReady &&
        vysledek.localEnvelope &&
        vysledek.serverEnvelope &&
        vysledek.sameKeyId
      );
      vysledek.reason = vysledek.ok ? null : "recovery_prerequisites_missing";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "preflight_failed";
      return vysledek;
    }
  }

  /* 686C TEST – reautentizace heslem uctu pro budouci E2E obnovu.
     NENI to opravneni ulozene pro pozdejsi pouziti. Pri skutecne obnove
     je nutne overit heslo znovu v te same operaci a zkontrolovat identitu.
     Tento krok nezapisuje zadna E2E data ani neprepina existujici session. */
  async function overHesloUctuProRecovery(heslo) {
    const vysledek = {
      ok: false,
      e2eUnchanged: true,
      sessionUnchanged: true,
      reason: "not_started"
    };

    if (typeof heslo !== "string" || heslo.length === 0) {
      vysledek.reason = "password_required";
      return vysledek;
    }
    if (!navigator.onLine) {
      vysledek.reason = "offline";
      return vysledek;
    }

    let docasny = null;
    try {
      const predpoklady = await recoveryPreflight();
      if (!predpoklady.ok) {
        vysledek.reason = "preflight_failed";
        return vysledek;
      }

      const stavajici = ziskejSupabase();
      if (
        !stavajici?.auth?.getUser ||
        !stavajici.supabaseUrl ||
        !stavajici.supabaseKey ||
        typeof window.supabase?.createClient !== "function"
      ) {
        vysledek.reason = "auth_unavailable";
        return vysledek;
      }

      /* getUser kontroluje ucet na serveru, ne jen obsah lokalni session. */
      const { data: overeny, error: chybaUctu } =
        await stavajici.auth.getUser();
      const user = overeny?.user;
      if (chybaUctu || !user?.id || !user?.email) {
        vysledek.reason = "account_unverified";
        return vysledek;
      }

      /* Oddeleny GoTrue klient: bez IndexedDB/localStorage, bez refresh,
         bez zachyceni Auth tokenu aplikace a bez vymeny aktivni session. */
      docasny = window.supabase.createClient(
        stavajici.supabaseUrl,
        stavajici.supabaseKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "ln-e2e-686c-reauth-ephemeral"
          }
        }
      );

      const { data, error } = await docasny.auth.signInWithPassword({
        email: user.email,
        password: heslo
      });
      if (error || !data?.user?.id) {
        vysledek.reason = "invalid_credentials_or_auth_error";
        return vysledek;
      }
      if (data.user.id !== user.id) {
        vysledek.reason = "account_identity_mismatch";
        return vysledek;
      }

      /* Po kontrole znovu potvrdime, ze zustava stejny aktivni ucet. */
      const { data: aktualni, error: chybaKontroly } =
        await stavajici.auth.getUser();
      if (chybaKontroly || aktualni?.user?.id !== user.id) {
        vysledek.reason = "active_account_changed";
        return vysledek;
      }

      vysledek.ok = true;
      vysledek.reason = null;
      return vysledek;
    } catch (_error) {
      vysledek.reason = "reauth_failed";
      return vysledek;
    } finally {
      /* Pouze docasna session (scope local), nikdy hlavni Auth klient. */
      if (docasny?.auth?.signOut) {
        try { await docasny.auth.signOut({ scope: "local" }); }
        catch (_error) { /* Bez perzistence neni co uklizet na disku. */ }
      }
    }
  }

  /* 686F – DRY-RUN: prokaž, že aktuální KEK opravdu rozbalí serverový
     Root Key a že jej lze znovu bezpečně zabalit. VŠE POUZE V PAMĚTI.
     Nezapisuje IndexedDB ani server; neobnovuje heslo ani Secret/media. */
  async function recoveryRewrapDryRun() {
    const vysledek = {
      ok: false,
      readOnly: true,
      reason: null,
      sourceEnvelopeVerified: false,
      temporaryRewrapVerified: false,
      sameKeyId: false,
      notesAndKeysUnchanged: true
    };
    let raw = null;
    let rozbalene = null;
    let ciphertext = null;
    try {
      if (String(location.hostname || "").toLowerCase() !== "test.lubanote.com") {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      const predpoklady = await recoveryPreflight();
      if (!predpoklady.ok) {
        vysledek.reason = "preflight_failed";
        return vysledek;
      }
      const userId = await ziskejAktualniUserId();
      const server = await nactiServerRootRecord(userId);
      if (!server.ok || !maPlatnyServerRecord(server.data)) {
        vysledek.reason = "server_envelope_unavailable";
        return vysledek;
      }
      const keyId = server.data.e2e_root_key_id;
      raw = await rozbalRootRaw(server.data.e2e_root_key_box, userId);
      if (!(raw instanceof Uint8Array) || raw.length !== 32) {
        vysledek.reason = "invalid_root_length";
        return vysledek;
      }
      vysledek.sourceEnvelopeVerified = (await vytvorKeyId(raw)) === keyId;
      if (!vysledek.sourceEnvelopeVerified) {
        vysledek.reason = "source_root_id_mismatch";
        return vysledek;
      }
      /* Náhodný dočasný AES klíč simuluje nový wrap key.
         NENÍ to ještě odvození KEK z nového E2E hesla. */
      const docasnyKlic = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = new TextEncoder().encode(
        `LubaNote-e2e-recovery-dry-run-v1:${userId}:${keyId}`
      );
      ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad }, docasnyKlic, raw
      ));
      rozbalene = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad }, docasnyKlic, ciphertext
      ));
      vysledek.temporaryRewrapVerified =
        rozbalene.length === 32 &&
        rozbalene.every((byte, i) => byte === raw[i]);
      vysledek.sameKeyId = vysledek.temporaryRewrapVerified &&
        (await vytvorKeyId(rozbalene)) === keyId;
      vysledek.ok = vysledek.sourceEnvelopeVerified &&
        vysledek.temporaryRewrapVerified && vysledek.sameKeyId;
      vysledek.reason = vysledek.ok ? null : "rewrap_roundtrip_failed";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "cryptographic_dry_run_failed";
      return vysledek;
    } finally {
      raw?.fill(0);
      rozbalene?.fill(0);
      ciphertext?.fill(0);
    }
  }

  /* 686G TEST – kryptograficky ověří ochranu EXISTUJÍCÍHO Root Key
     NOVÝM uživatelským E2E heslem. Bez jakéhokoli trvalého zápisu.
     PBKDF2 media KEK, salt, AAD a verifier odpovídají stávající V1.
     V reálné obnově bude nutná transakční změna secret_settings,
     lokálních obálek a detekce legacy Secret/media. */
  async function recoveryNoveHesloDryRun(noveHeslo) {
    const vysledek = {
      ok: false,
      readOnly: true,
      reason: null,
      sourceEnvelopeVerified: false,
      passwordDerivedKekVerified: false,
      newEnvelopeRoundtrip: false,
      verifierCompatible: false,
      sameKeyId: false,
      serverAndKeysUnchanged: true
    };
    let raw = null;
    let rozbalene = null;
    let ciphertext = null;
    let verifierBytes = null;
    let saltSVerifierem = null;
    let saltSKlicem = null;
    let material = null;
    try {
      if (String(location.hostname || "").toLowerCase() !== "test.lubanote.com") {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      if (typeof noveHeslo !== "string" || noveHeslo.length < 12) {
        vysledek.reason = "new_password_too_short";
        return vysledek;
      }
      const preflight = await recoveryPreflight();
      if (!preflight.ok) {
        vysledek.reason = "preflight_failed";
        return vysledek;
      }
      const userId = await ziskejAktualniUserId();
      const server = await nactiServerRootRecord(userId);
      if (!server.ok || !maPlatnyServerRecord(server.data)) {
        vysledek.reason = "server_envelope_unavailable";
        return vysledek;
      }
      const keyId = server.data.e2e_root_key_id;
      raw = await rozbalRootRaw(server.data.e2e_root_key_box, userId);
      vysledek.sourceEnvelopeVerified =
        raw instanceof Uint8Array && raw.length === 32 &&
        (await vytvorKeyId(raw)) === keyId;
      if (!vysledek.sourceEnvelopeVerified) {
        vysledek.reason = "source_root_mismatch";
        return vysledek;
      }

      // Stejný KDF jako mediaCrypto.js: 600 000 iterací, 16B náhodný salt.
      // Nový salt/verifier NIKDY neopustí paměť během tohoto testu.
      const iterations = 600000;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const encoder = new TextEncoder();
      const spojSalt = (prefix) => {
        const cast = encoder.encode(prefix);
        const kombinace = new Uint8Array(cast.length + salt.length);
        kombinace.set(cast);
        kombinace.set(salt, cast.length);
        return kombinace;
      };
      saltSKlicem = spojSalt("LubaNote-media-encryption-v1");
      saltSVerifierem = spojSalt("LubaNote-verifier-v1");
      material = await crypto.subtle.importKey(
        "raw", encoder.encode(noveHeslo), "PBKDF2", false,
        ["deriveKey", "deriveBits"]
      );
      const novyKek = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltSKlicem, iterations, hash: "SHA-256" },
        material, { name: "AES-GCM", length: 256 }, false,
        ["encrypt", "decrypt"]
      );
      vysledek.passwordDerivedKekVerified = Boolean(novyKek);

      verifierBytes = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: saltSVerifierem, iterations, hash: "SHA-256" },
        material, 256
      ));
      /* Kompatibilita se secret.js – stejná 256bit délka a domain prefix.
         Verifier se záměrně nikdy nevypisuje ani neposílá na server. */
      /* Nezávisle porovnej s přesně tou funkcí, kterou používal Secret.
         Kontrola jen délky by mohla falešně projít s chybným KDF. */
      if (typeof vytvorVerifierZHesla !== "function") {
        vysledek.reason = "secret_verifier_unavailable";
        return vysledek;
      }
      const base64Salt = btoa(String.fromCharCode(...salt));
      const verifierPodleSecretu = await vytvorVerifierZHesla(
        noveHeslo, base64Salt, iterations
      );
      vysledek.verifierCompatible =
        verifierBytes.length === 32 &&
        verifierPodleSecretu === btoa(String.fromCharCode(...verifierBytes));
      if (!vysledek.verifierCompatible) {
        vysledek.reason = "verifier_algorithm_mismatch";
        return vysledek;
      }

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = encoder.encode(
        `LubaNote-e2e-core-wrap-v1:${rootWrapKontext(userId)}`
      );
      ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad }, novyKek, raw
      ));
      rozbalene = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad }, novyKek, ciphertext
      ));
      vysledek.newEnvelopeRoundtrip =
        rozbalene.length === 32 &&
        rozbalene.every((byte, i) => byte === raw[i]);
      vysledek.sameKeyId = vysledek.newEnvelopeRoundtrip &&
        (await vytvorKeyId(rozbalene)) === keyId;
      vysledek.ok = Boolean(
        vysledek.sourceEnvelopeVerified &&
        vysledek.passwordDerivedKekVerified &&
        vysledek.newEnvelopeRoundtrip &&
        vysledek.verifierCompatible &&
        vysledek.sameKeyId
      );
      vysledek.reason = vysledek.ok ? null : "new_password_roundtrip_failed";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "new_password_crypto_failed";
      return vysledek;
    } finally {
      raw?.fill(0);
      rozbalene?.fill(0);
      ciphertext?.fill(0);
      verifierBytes?.fill(0);
      saltSVerifierem?.fill(0);
      saltSKlicem?.fill(0);
      material = null;
    }
  }

  /* PATCH 686H – READ-ONLY inventory before any potential main-password reset.
   * This is NOT authorization to rotate secret_settings. Legacy Secret notes,
   * image vaults, Secret tags and shared identities are encrypted under V1
   * password-derived keys, unlike ordinary Root Key E2E notes. Replacing
   * their salt/verifier without a migration can irreversibly lock them.
   * The server bootstrap manifest contains metadata, not image-vault JSON,
   * so remote media absence CANNOT be inferred from it. Fail closed.
   */
  async function recoveryLegacyAudit686H() {
    const vysledek = {
      ok: false,
      readOnly: true,
      safeToRotate: false,
      reason: "not_started",
      testWeb: false,
      testBackend: false,
      rootVerified: false,
      localSecretNotes: 0,
      localLegacySecretNotes: 0,
      localMediaVaults: 0,
      serverNotes: 0,
      serverSecretNotes: 0,
      serverSecretTags: 0,
      serverSecretAttachments: 0,
      serverSharedIdentities: 0,
      serverMediaContentAudited: false
    };

    try {
      vysledek.testWeb = String(location.hostname || "").toLowerCase() === "test.lubanote.com";
      if (!vysledek.testWeb) {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      if (!navigator.onLine) {
        vysledek.reason = "offline";
        return vysledek;
      }

      const konfig = typeof LUBANOTE_BACKEND !== "undefined" ? LUBANOTE_BACKEND : null;
      vysledek.testBackend = Boolean(
        konfig?.prostredi === "test" &&
        konfig?.backendId === "lubaserver-test" &&
        String(konfig?.url || "").replace(/\/$/, "") === "https://test.lubanote.com"
      );

      const klient = ziskejSupabase();
      if (!klient?.auth?.getUser || !klient?.rpc) {
        vysledek.reason = "auth_unavailable";
        return vysledek;
      }
      const { data: overeny, error: authChyba } = await klient.auth.getUser();
      const userId = overeny?.user?.id;
      if (authChyba || !userId) {
        vysledek.reason = "account_unverified";
        return vysledek;
      }

      const predpoklady = await recoveryPreflight();
      if (!predpoklady.ok) {
        vysledek.reason = "root_preflight_failed";
        return vysledek;
      }
      vysledek.rootVerified = true;

      /* Prevent reading another account's local Secret cache. */
      const lokalniOwner = String(localStorage.getItem("lubanoteLocalOwnerUserId") || "").trim();
      if (!lokalniOwner || lokalniOwner !== userId) {
        vysledek.reason = "local_owner_unverified";
        return vysledek;
      }
      if (
        typeof nactiSifrovaneTajneZaznamy !== "function" ||
        typeof nactiStarePlaintextTajnePoznamky !== "function" ||
        typeof getLocalNotesForSync !== "function"
      ) {
        vysledek.reason = "local_audit_unavailable";
        return vysledek;
      }

      const tajne = nactiSifrovaneTajneZaznamy();
      const legacy = nactiStarePlaintextTajnePoznamky();
      const bezne = getLocalNotesForSync();
      if (!Array.isArray(tajne) || !Array.isArray(legacy) || !Array.isArray(bezne)) {
        vysledek.reason = "local_audit_invalid";
        return vysledek;
      }
      vysledek.localSecretNotes = tajne.length;
      vysledek.localLegacySecretNotes = legacy.length;
      vysledek.localMediaVaults = bezne.filter(
        (note) => window.LubaNoteMediaCrypto?.maSifrovanaMedia?.(note) === true
      ).length;

      /* Metadata-only server inspection: no private note contents downloaded. */
      const { data: manifest, error: manifestChyba } = await klient.rpc(
        "lubanote_get_private_bootstrap_manifest"
      );
      if (manifestChyba || !Array.isArray(manifest)) {
        vysledek.reason = "server_manifest_unavailable";
        return vysledek;
      }
      const aktivni = manifest.filter((row) => row && !row.deleted_at);
      vysledek.serverNotes = aktivni.length;
      vysledek.serverSecretNotes = aktivni.filter((row) => row.is_secret === true).length;

      async function spocitej(tab, filtr) {
        let dotaz = klient.from(tab).select("id", { count: "exact", head: true });
        dotaz = dotaz.eq("user_id", userId);
        if (filtr) dotaz = filtr(dotaz);
        const { count, error } = await dotaz;
        if (error || !Number.isSafeInteger(count) || count < 0) {
          throw new Error("audit_count_unavailable");
        }
        return count;
      }
      try {
        vysledek.serverSecretTags = await spocitej(
          "tags", (q) => q.eq("is_secret", true).is("deleted_at", null)
        );
        vysledek.serverSecretAttachments = await spocitej(
          "attachments", (q) => q.eq("is_secret", true)
        );
        /* Shared private identity is encrypted with the old V1 media KEK. */
        const { count: identityCount, error: identityError } = await klient
          .from("lubanote_shared_crypto_identities")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (identityError || !Number.isSafeInteger(identityCount) || identityCount < 0) {
          throw new Error("shared_identity_count_unavailable");
        }
        vysledek.serverSharedIdentities = identityCount;
      } catch (_err) {
        vysledek.reason = "server_legacy_counts_unavailable";
        return vysledek;
      }

      /* Remote media vaults may be nested in encrypted/private JSON.
         Metadata cannot establish their absence. This read-only phase
         deliberately NEVER yields safeToRotate=true. */
      const staleRiziko = Boolean(
        vysledek.localSecretNotes || vysledek.localLegacySecretNotes ||
        vysledek.localMediaVaults || vysledek.serverSecretNotes ||
        vysledek.serverSecretTags || vysledek.serverSecretAttachments ||
        vysledek.serverSharedIdentities
      );
      const { data: konec, error: kontrolaChyba } = await klient.auth.getUser();
      if (kontrolaChyba || konec?.user?.id !== userId ||
          !jeRootKlicDostupny() || rootKontext?.userId !== userId) {
        vysledek.reason = "account_or_root_changed";
        return vysledek;
      }

      vysledek.ok = true;
      vysledek.reason = !vysledek.testBackend
        ? "test_backend_not_confirmed"
        : staleRiziko
          ? "legacy_encrypted_content_detected"
          : vysledek.serverNotes > 0
            ? "remote_media_not_audited"
            : "write_procedure_not_installed";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "legacy_audit_failed";
      return vysledek;
    }
  }

  /* 686I – TEST WEB read-only provenance and Shared identity cryptographic audit.
   * The TEST website does not imply a separate API/DB. This function shows
   * the ACTUAL Supabase client's endpoint and never certifies DB isolation.
   * The Shared private key is decrypted only into ephemeral memory, verified
   * against the server public key using ECDH symmetry, and immediately cleared.
   * No key generation for the account, no writes, no rewrap, no password reset.
   */
  async function recoveryBackendSharedAudit686I() {
    const vysledek = {
      ok: false,
      readOnly: true,
      safeToRotate: false,
      reason: "not_started",
      testWeb: false,
      accountVerified: false,
      configuredBackendId: "unknown",
      configuredEnvironment: "unknown",
      configuredProfileId: "unknown",
      actualApiHost: "unknown",
      backendUrlMatchesClient: false,
      productionApi: false,
      isolatedTestDatabaseVerified: false,
      sharedIdentityFound: false,
      sharedIdentityMetadataValid: false,
      mediaKekReady: false,
      sharedPrivateEnvelopeDecrypted: false,
      sharedKeyPairVerified: false
    };
    let soukromyPkcs8 = null;
    let dukazLevy = null;
    let dukazPravy = null;
    try {
      vysledek.testWeb = String(location.hostname || "").toLowerCase() === "test.lubanote.com";
      if (!vysledek.testWeb) {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      if (!navigator.onLine) {
        vysledek.reason = "offline";
        return vysledek;
      }
      const klient = ziskejSupabase();
      const profil = typeof LUBANOTE_BACKEND !== "undefined" ? LUBANOTE_BACKEND : null;
      if (!klient?.auth?.getUser || !klient?.from || !profil?.url || !klient.supabaseUrl) {
        vysledek.reason = "backend_client_unavailable";
        return vysledek;
      }
      const nakonfigurovano = new URL(profil.url);
      const skutecne = new URL(klient.supabaseUrl);
      if (nakonfigurovano.protocol !== "https:" || skutecne.protocol !== "https:") {
        vysledek.reason = "insecure_backend_url";
        return vysledek;
      }
      vysledek.configuredBackendId = String(profil.backendId || "unknown").slice(0, 60);
      vysledek.configuredEnvironment = String(profil.prostredi || "unknown").slice(0, 32);
      vysledek.configuredProfileId = String(profil.id || "unknown").slice(0, 60);
      vysledek.actualApiHost = skutecne.hostname.slice(0, 100);
      vysledek.backendUrlMatchesClient = nakonfigurovano.origin === skutecne.origin;
      /* Report recognizes established production API hosts; physical DB
         separation can NOT be proven merely from an API hostname/profile. */
      vysledek.productionApi = [
        "api.lubanote.com",
        "nwdacgigplofksexssws.supabase.co"
      ].includes(vysledek.actualApiHost);
      if (!vysledek.backendUrlMatchesClient) {
        vysledek.reason = "configured_and_runtime_api_mismatch";
        return vysledek;
      }
      const { data: prihlaseny, error: authChyba } = await klient.auth.getUser();
      const userId = prihlaseny?.user?.id;
      if (authChyba || !userId) {
        vysledek.reason = "account_unverified";
        return vysledek;
      }
      vysledek.accountVerified = true;
      const { data: identita, error: chybaIdentity } = await klient
        .from("lubanote_shared_crypto_identities")
        .select("user_id, algorithm, key_version, public_key_jwk, private_key_box")
        .eq("user_id", userId)
        .maybeSingle();
      if (chybaIdentity) {
        vysledek.reason = "shared_identity_read_failed";
        return vysledek;
      }
      vysledek.sharedIdentityFound = Boolean(identita);
      if (!identita) {
        vysledek.ok = true;
        vysledek.reason = "shared_identity_missing";
        return vysledek;
      }
      vysledek.sharedIdentityMetadataValid = Boolean(
        identita.user_id === userId &&
        identita.algorithm === "ECDH-P256" &&
        Number(identita.key_version) === 1 &&
        identita.public_key_jwk?.kty === "EC" &&
        identita.public_key_jwk?.crv === "P-256" &&
        identita.private_key_box?.algorithm === "AES-GCM" &&
        Number(identita.private_key_box?.version) === 1
      );
      if (!vysledek.sharedIdentityMetadataValid) {
        vysledek.reason = "shared_identity_metadata_invalid";
        return vysledek;
      }
      const media = window.LubaNoteMediaCrypto;
      vysledek.mediaKekReady = media?.jeKlicDostupny?.() === true;
      if (!vysledek.mediaKekReady || !media?.rozbalBajtyHlavnimKlicem) {
        vysledek.reason = "shared_media_kek_locked";
        return vysledek;
      }
      /* Read/decrypt only – NEVER call zajistiIdentitu(), which may create a
         new server identity if one is absent. */
      soukromyPkcs8 = await media.rozbalBajtyHlavnimKlicem(
        identita.private_key_box,
        `shared-identity:${userId}:v1`
      );
      if (!(soukromyPkcs8 instanceof Uint8Array) ||
          soukromyPkcs8.length < 60 || soukromyPkcs8.length > 1024) {
        vysledek.reason = "shared_private_key_invalid";
        return vysledek;
      }
      vysledek.sharedPrivateEnvelopeDecrypted = true;
      /* P-256 consistency without exporting/replacing private key:
         ECDH(old private, ephemeral public) must match
         ECDH(ephemeral private, old public). */
      const starySoukromy = await crypto.subtle.importKey(
        "pkcs8", soukromyPkcs8,
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
      );
      const staryVerejny = await crypto.subtle.importKey(
        "jwk", identita.public_key_jwk,
        { name: "ECDH", namedCurve: "P-256" }, false, []
      );
      const docasny = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
      );
      dukazLevy = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: docasny.publicKey }, starySoukromy, 256
      ));
      dukazPravy = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: staryVerejny }, docasny.privateKey, 256
      ));
      let rozdil = dukazLevy.length ^ dukazPravy.length;
      for (let i = 0; i < Math.min(dukazLevy.length, dukazPravy.length); i += 1) {
        rozdil |= dukazLevy[i] ^ dukazPravy[i];
      }
      vysledek.sharedKeyPairVerified = rozdil === 0 && dukazLevy.length === 32;
      if (!vysledek.sharedKeyPairVerified) {
        vysledek.reason = "shared_key_pair_mismatch";
        return vysledek;
      }
      const { data: kontrola, error: chybaKontroly } = await klient.auth.getUser();
      if (chybaKontroly || kontrola?.user?.id !== userId) {
        vysledek.reason = "active_account_changed";
        return vysledek;
      }
      vysledek.ok = true;
      vysledek.reason = vysledek.productionApi
        ? "production_api_shared_key_verified_read_only"
        : "shared_key_verified_read_only";
      /* safeToRotate remains FALSE: server media/Secret/shared migration
         and atomic replacement procedure have NOT been validated. */
      return vysledek;
    } catch (_error) {
      vysledek.reason = "shared_identity_crypto_audit_failed";
      return vysledek;
    } finally {
      soukromyPkcs8?.fill(0);
      dukazLevy?.fill(0);
      dukazPravy?.fill(0);
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
    recoveryPreflight,
    overHesloUctuProRecovery,
    recoveryRewrapDryRun,
    recoveryNoveHesloDryRun,
    recoveryLegacyAudit686H,
    recoveryBackendSharedAudit686I,
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
