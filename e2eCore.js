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

  /* 686J – TEST-only Shared identity password rewrap dry run.
   * The server's original ECDH private key is decrypted with the EXISTING
   * local media KEK; then wrapped in memory under a NEW password-derived
   * media KEK using exactly the mediaCrypto V1 PBKDF2 domain and shared-wrap
   * AES-GCM AAD. Decryption and key-pair match are verified in memory.
   * No updates/inserts/RPCs, no persisted salt, no server/local key mutation.
   * This does NOT make a real password reset safe: Secret/media auditing,
   * atomic multi-record rotation and rollback are still outstanding.
   */
  async function recoverySharedRewrapDryRun686J(noveHeslo) {
    const vysledek = {
      ok: false,
      readOnly: true,
      safeToRotate: false,
      reason: "not_started",
      accountVerified: false,
      sourceEnvelopeDecrypted: false,
      sourceKeyPairVerified: false,
      newPasswordKekDerived: false,
      temporaryRewrapRoundtrip: false,
      samePrivateKey: false,
      samePublicIdentity: false,
      serverMediaContentAudited: false
    };
    let soukromyPkcs8 = null;
    let rozbalenyPkcs8 = null;
    let ciphertext = null;
    let oldProof = null;
    let newProof = null;
    let serverProof = null;
    let salt = null;
    let derivacniSalt = null;
    let hesloBajty = null;
    let aad = null;
    try {
      if (String(location.hostname || "").toLowerCase() !== "test.lubanote.com") {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      // The password is used only here; it is never stored, logged or returned.
      if (typeof noveHeslo !== "string" || noveHeslo.length < 8) {
        vysledek.reason = "new_password_too_short";
        return vysledek;
      }
      if (!navigator.onLine) {
        vysledek.reason = "offline";
        return vysledek;
      }
      const klient = ziskejSupabase();
      if (!klient?.auth?.getUser || !klient?.from) {
        vysledek.reason = "backend_client_unavailable";
        return vysledek;
      }
      const { data: overeni, error: authChyba } = await klient.auth.getUser();
      const userId = overeni?.user?.id;
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
      if (chybaIdentity || !identita) {
        vysledek.reason = chybaIdentity ? "shared_identity_read_failed" : "shared_identity_missing";
        return vysledek;
      }
      if (
        identita.user_id !== userId ||
        identita.algorithm !== "ECDH-P256" ||
        Number(identita.key_version) !== 1 ||
        identita.public_key_jwk?.kty !== "EC" ||
        identita.public_key_jwk?.crv !== "P-256" ||
        identita.private_key_box?.algorithm !== "AES-GCM" ||
        Number(identita.private_key_box?.version) !== 1
      ) {
        vysledek.reason = "shared_identity_metadata_invalid";
        return vysledek;
      }
      const media = window.LubaNoteMediaCrypto;
      if (media?.jeKlicDostupny?.() !== true || !media?.rozbalBajtyHlavnimKlicem) {
        vysledek.reason = "old_media_kek_unavailable";
        return vysledek;
      }
      soukromyPkcs8 = await media.rozbalBajtyHlavnimKlicem(
        identita.private_key_box, `shared-identity:${userId}:v1`
      );
      if (!(soukromyPkcs8 instanceof Uint8Array) ||
          soukromyPkcs8.length < 60 || soukromyPkcs8.length > 1024) {
        vysledek.reason = "source_private_key_invalid";
        return vysledek;
      }
      vysledek.sourceEnvelopeDecrypted = true;
      const staryPrivatni = await crypto.subtle.importKey(
        "pkcs8", soukromyPkcs8,
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
      );
      const verejny = await crypto.subtle.importKey(
        "jwk", identita.public_key_jwk,
        { name: "ECDH", namedCurve: "P-256" }, false, []
      );
      const docasny = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
      );
      oldProof = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: docasny.publicKey }, staryPrivatni, 256
      ));
      serverProof = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: verejny }, docasny.privateKey, 256
      ));
      let rozdil = 0;
      for (let i = 0; i < oldProof.length; i++) rozdil |= oldProof[i] ^ serverProof[i];
      vysledek.sourceKeyPairVerified = oldProof.length === 32 && rozdil === 0;
      if (!vysledek.sourceKeyPairVerified) {
        vysledek.reason = "source_key_pair_mismatch";
        return vysledek;
      }

      // Same PBKDF2 domain separation as mediaCrypto.js, no settings persisted.
      salt = crypto.getRandomValues(new Uint8Array(16));
      const encoder = new TextEncoder();
      const prefix = encoder.encode("LubaNote-media-encryption-v1");
      derivacniSalt = new Uint8Array(prefix.length + salt.length);
      derivacniSalt.set(prefix);
      derivacniSalt.set(salt, prefix.length);
      hesloBajty = encoder.encode(noveHeslo);
      const material = await crypto.subtle.importKey(
        "raw", hesloBajty, "PBKDF2", false, ["deriveKey"]
      );
      const novyKek = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: derivacniSalt, iterations: 600000, hash: "SHA-256" },
        material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
      vysledek.newPasswordKekDerived = Boolean(novyKek);
      aad = encoder.encode(`LubaNote-shared-wrap-v1:shared-identity:${userId}:v1`);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad }, novyKek, soukromyPkcs8
      ));
      rozbalenyPkcs8 = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad }, novyKek, ciphertext
      ));
      vysledek.temporaryRewrapRoundtrip = rozbalenyPkcs8.length === soukromyPkcs8.length;
      let diff = soukromyPkcs8.length ^ rozbalenyPkcs8.length;
      for (let i = 0; i < Math.min(soukromyPkcs8.length, rozbalenyPkcs8.length); i++) {
        diff |= soukromyPkcs8[i] ^ rozbalenyPkcs8[i];
      }
      vysledek.samePrivateKey = vysledek.temporaryRewrapRoundtrip && diff === 0;
      if (!vysledek.samePrivateKey) {
        vysledek.reason = "shared_rewrap_roundtrip_mismatch";
        return vysledek;
      }
      const znovuPrivatni = await crypto.subtle.importKey(
        "pkcs8", rozbalenyPkcs8,
        { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
      );
      newProof = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: docasny.publicKey }, znovuPrivatni, 256
      ));
      let diffDukazu = newProof.length ^ serverProof.length;
      for (let i = 0; i < Math.min(newProof.length, serverProof.length); i++) {
        diffDukazu |= newProof[i] ^ serverProof[i];
      }
      vysledek.samePublicIdentity = newProof.length === 32 && diffDukazu === 0;
      const { data: kontrola, error: chybaKontroly } = await klient.auth.getUser();
      if (chybaKontroly || kontrola?.user?.id !== userId) {
        vysledek.reason = "active_account_changed";
        return vysledek;
      }
      vysledek.ok = Boolean(
        vysledek.accountVerified && vysledek.sourceEnvelopeDecrypted &&
        vysledek.sourceKeyPairVerified && vysledek.newPasswordKekDerived &&
        vysledek.temporaryRewrapRoundtrip && vysledek.samePrivateKey &&
        vysledek.samePublicIdentity
      );
      vysledek.reason = vysledek.ok ? "shared_rewrap_verified_read_only" : "shared_rewrap_failed";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "shared_rewrap_crypto_failed";
      return vysledek;
    } finally {
      soukromyPkcs8?.fill(0);
      rozbalenyPkcs8?.fill(0);
      ciphertext?.fill(0);
      oldProof?.fill(0);
      newProof?.fill(0);
      serverProof?.fill(0);
      salt?.fill(0);
      derivacniSalt?.fill(0);
      hesloBajty?.fill(0);
      aad?.fill(0);
    }
  }

  /* 686K – TEST-only Secret/media metadata audit. READ-ONLY.
   * Selects only server note IDs and projected JSONB marker scalars, never
   * the full note data/ciphertext/image bytes. The E2E note marker hides
   * its inner contents, so media absence can NEVER be established here.
   * May read from PROD-backed TEST, so never write/rotate anything.
   */
  async function recoverySecretMediaAudit686K() {
    const vysledek = {
      ok: false, readOnly: true, safeToRotate: false,
      reason: "not_started", accountVerified: false,
      rootVerified: false, localOwnerVerified: false,
      localSecretNotes: 0, localLegacySecretNotes: 0,
      localMediaVaults: 0,
      serverNotes: 0, serverSecretNotes: 0,
      serverSecretTags: 0, serverSecretAttachments: 0,
      remoteRowsScanned: 0, remoteE2ENotes: 0,
      remoteLegacyMediaVaultMarkers: 0,
      remotePlainOrOtherNotes: 0,
      remoteMediaMetadataScanComplete: false,
      serverMediaContentAudited: false,
      storageObjectsAudited: false,
      e2eInnerPayloadAudited: false
    };
    try {
      if (String(location.hostname || "").toLowerCase() !== "test.lubanote.com") {
        vysledek.reason = "test_web_only";
        return vysledek;
      }
      if (!navigator.onLine) { vysledek.reason = "offline"; return vysledek; }
      const klient = ziskejSupabase();
      if (!klient?.auth?.getUser || !klient?.from || !klient?.rpc) {
        vysledek.reason = "backend_unavailable";
        return vysledek;
      }
      const { data: auth, error: authChyba } = await klient.auth.getUser();
      const userId = auth?.user?.id;
      if (authChyba || !userId) {
        vysledek.reason = "account_unverified";
        return vysledek;
      }
      vysledek.accountVerified = true;
      vysledek.rootVerified = jeRootKlicDostupny() && rootKontext?.userId === userId;
      if (!vysledek.rootVerified) {
        vysledek.reason = "root_key_unavailable";
        return vysledek;
      }
      const localOwner = String(localStorage.getItem("lubanoteLocalOwnerUserId") || "").trim();
      vysledek.localOwnerVerified = localOwner === userId;
      if (!vysledek.localOwnerVerified) {
        vysledek.reason = "local_owner_unverified";
        return vysledek;
      }
      if (typeof nactiSifrovaneTajneZaznamy !== "function" ||
          typeof nactiStarePlaintextTajnePoznamky !== "function" ||
          typeof getLocalNotesForSync !== "function") {
        vysledek.reason = "local_inventory_unavailable";
        return vysledek;
      }
      const secret = nactiSifrovaneTajneZaznamy();
      const legacy = nactiStarePlaintextTajnePoznamky();
      const notes = getLocalNotesForSync();
      if (!Array.isArray(secret) || !Array.isArray(legacy) || !Array.isArray(notes)) {
        vysledek.reason = "local_inventory_invalid";
        return vysledek;
      }
      vysledek.localSecretNotes = secret.length;
      vysledek.localLegacySecretNotes = legacy.length;
      vysledek.localMediaVaults = notes.filter(
        note => window.LubaNoteMediaCrypto?.maSifrovanaMedia?.(note) === true
      ).length;

      /* Manifest is already the established private metadata-only RPC. */
      const { data: manifest, error: manifestChyba } = await klient.rpc(
        "lubanote_get_private_bootstrap_manifest"
      );
      if (manifestChyba || !Array.isArray(manifest)) {
        vysledek.reason = "manifest_unavailable";
        return vysledek;
      }
      const live = manifest.filter(row => row && !row.deleted_at);
      vysledek.serverNotes = live.length;
      vysledek.serverSecretNotes = live.filter(row => row.is_secret === true).length;
      async function spocitej(tab, filtr) {
        let q = klient.from(tab).select("id", {count: "exact", head: true})
          .eq("user_id", userId);
        if (filtr) q = filtr(q);
        const {count, error} = await q;
        if (error || !Number.isSafeInteger(count) || count < 0) {
          throw new Error("count_unavailable");
        }
        return count;
      }
      try {
        vysledek.serverSecretTags = await spocitej(
          "tags", q => q.eq("is_secret", true).is("deleted_at", null)
        );
        vysledek.serverSecretAttachments = await spocitej(
          "attachments", q => q.eq("is_secret", true)
        );
      } catch (_error) {
        vysledek.reason = "secret_metadata_unavailable";
        return vysledek;
      }
      /* Only direct-owner remote notes; shared/inaccessible/stale media remain
         unverified. Check count to prevent unbounded metadata scans. */
      const {count, error: countError} = await klient.from("notes")
        .select("id", {count: "exact", head: true})
        .eq("user_id", userId).is("deleted_at", null);
      if (countError || !Number.isSafeInteger(count) || count < 0) {
        vysledek.reason = "remote_notes_count_unavailable";
        return vysledek;
      }
      if (count > 1000) {
        vysledek.reason = "remote_notes_over_1000_limit";
        return vysledek;
      }
      // PostgREST projects JSONB scalar fields server-side; no ciphertext,
      // actual image contents, URLs, note text or private IDs in the report.
      for (let offset = 0; offset < count; offset += 100) {
        const {data: rows, error} = await klient.from("notes")
          .select("id,e2e_marker:data->>__lubanoteE2ENote,media_vault_version:data->__lubanoteMediaVault->>version,media_vault_algorithm:data->__lubanoteMediaVault->>algorithm")
          .eq("user_id", userId).is("deleted_at", null)
          .order("id", {ascending: true})
          .range(offset, Math.min(offset + 99, count - 1));
        if (error || !Array.isArray(rows) || rows.length !== Math.min(100, count-offset)) {
          vysledek.reason = "remote_media_metadata_unavailable";
          return vysledek;
        }
        for (const row of rows) {
          const e2e = row?.e2e_marker === "true" || row?.e2e_marker === true;
          const legacyMedia = row?.media_vault_version != null ||
            row?.media_vault_algorithm != null;
          if (e2e) vysledek.remoteE2ENotes++;
          else vysledek.remotePlainOrOtherNotes++;
          if (legacyMedia) vysledek.remoteLegacyMediaVaultMarkers++;
          vysledek.remoteRowsScanned++;
        }
      }
      // Count the owner-scoped rows again to reject a concurrent count change.
      const {count: kontrolniPocet, error: kontrolniChyba} = await klient.from("notes")
        .select("id", {count: "exact", head: true})
        .eq("user_id", userId).is("deleted_at", null);
      if (kontrolniChyba || kontrolniPocet !== count ||
          vysledek.remoteRowsScanned !== count) {
        vysledek.reason = "remote_notes_changed_during_scan";
        return vysledek;
      }
      const {data: current, error: currentError} = await klient.auth.getUser();
      if (currentError || current?.user?.id !== userId ||
          !jeRootKlicDostupny() || rootKontext?.userId !== userId) {
        vysledek.reason = "account_or_root_changed";
        return vysledek;
      }
      vysledek.remoteMediaMetadataScanComplete = true;
      vysledek.ok = true;
      // This is INVENTORY PASS, never "no old media" proof. E2E note
      // ciphertext may contain hidden legacy media vaults and attachments.
      vysledek.reason = "metadata_only_media_contents_unverified";
      return vysledek;
    } catch (_error) {
      vysledek.reason = "secret_media_audit_failed";
      return vysledek;
    }
  }

  /* 686L – targeted read-only proof for legacy media and E2E inner vaults.
   * Uses authenticated server note reads and the existing non-extractable keys.
   * Does not call legacy note conversion, migration, write or device rehydrate.
   * Does not inspect Storage objects, shared data, or other accounts.
   * May run against PROD-backed TEST: NEVER writes; safeToRotate ALWAYS false.
   */
  async function recoveryMediaContentProof686L() {
    const vysledek = {
      ok:false,readOnly:true,safeToRotate:false,reason:"not_started",
      accountVerified:false,rootVerified:false,mediaKekReady:false,
      remoteNotesCount:0,remoteRowsScanned:0,remoteE2EChecked:0,
      remoteLegacyVaultNotes:0,remoteE2EVaultNotes:0,
      mediaItemsFound:0,mediaItemsAuthenticated:0,
      legacyMediaAuthenticated:false,e2eInnerPayloadAudited:false,
      storageObjectsAudited:false,serverMediaContentAudited:false
    };
    try {
      if (String(location.hostname||"").toLowerCase() !== "test.lubanote.com") {
        vysledek.reason="test_web_only";return vysledek;
      }
      if (!navigator.onLine) {vysledek.reason="offline";return vysledek;}
      const klient=ziskejSupabase();
      if (!klient?.auth?.getUser || !klient?.from) {
        vysledek.reason="backend_unavailable";return vysledek;
      }
      const {data:auth,error:authChyba}=await klient.auth.getUser();
      const userId=auth?.user?.id;
      if (authChyba || !userId ||
          String(localStorage.getItem("lubanoteLocalOwnerUserId")||"")!==userId) {
        vysledek.reason="account_or_local_owner_unverified";return vysledek;
      }
      vysledek.accountVerified=true;
      const stav=window.LubaNoteE2ECore?.getStav?.();
      vysledek.rootVerified=Boolean(jeRootKlicDostupny() && rootKontext?.userId===userId &&
        stav?.ready===true && stav?.userId===userId);
      if (!vysledek.rootVerified) {vysledek.reason="root_unavailable";return vysledek;}
      const media=window.LubaNoteMediaCrypto;
      vysledek.mediaKekReady=media?.jeKlicDostupny?.()===true;
      if (!vysledek.mediaKekReady || typeof media.recoveryOverMediaRecord686L!=="function") {
        vysledek.reason="media_key_or_verifier_unavailable";return vysledek;
      }
      const e2e=window.LubaNoteNotesCrypto;
      if (typeof e2e?.desifruj!=="function") {
        vysledek.reason="e2e_read_unavailable";return vysledek;
      }
      const pocet=await klient.from("notes").select("id",{count:"exact",head:true})
        .eq("user_id",userId).is("deleted_at",null);
      if (pocet.error || !Number.isSafeInteger(pocet.count) || pocet.count<0) {
        vysledek.reason="note_count_unavailable";return vysledek;
      }
      vysledek.remoteNotesCount=pocet.count;
      // Bounded read-only test. Larger accounts need a paged specialized audit.
      if (pocet.count>30) {vysledek.reason="over_30_notes_limit";return vysledek;}
      const {data:rows,error:rowsChyba}=await klient.from("notes")
        .select("id,data").eq("user_id",userId).is("deleted_at",null)
        .order("id",{ascending:true}).limit(31);
      if (rowsChyba || !Array.isArray(rows) || rows.length!==pocet.count) {
        vysledek.reason="note_read_incomplete";return vysledek;
      }
      for (const row of rows) {
        const obj=row?.data;
        if (!row?.id || !obj || typeof obj!=="object" || Array.isArray(obj)) {
          vysledek.reason="invalid_note_data";return vysledek;
        }
        let note=obj;
        if (Object.prototype.hasOwnProperty.call(obj,"__lubanoteE2ENote")) {
          // Direct authenticated decrypt only; do NOT call CloudRead which
          // alters its protected-ID guard. Never expose decrypted note in UI.
          try {note=await e2e.desifruj(obj,userId,row.id);}
          catch (_error) {vysledek.reason="e2e_inner_decrypt_failed";return vysledek;}
          vysledek.remoteE2EChecked++;
        }
        const vault=note?.__lubanoteMediaVault;
        if (vault!==undefined && vault!==null) {
          if (Number(vault.version)!==1 || vault.algorithm!=="AES-GCM" ||
              !vault.items || typeof vault.items!=="object" || Array.isArray(vault.items)) {
            vysledek.reason="media_vault_invalid";return vysledek;
          }
          if (note===obj) vysledek.remoteLegacyVaultNotes++;
          else vysledek.remoteE2EVaultNotes++;
          const zaznamy=Object.entries(vault.items);
          if (zaznamy.length>30) {vysledek.reason="over_30_media_limit";return vysledek;}
          for (const [mediaId,record] of zaznamy) {
            if (++vysledek.mediaItemsFound>30) {
              vysledek.reason="over_30_media_limit";return vysledek;
            }
            const proof=await media.recoveryOverMediaRecord686L(record,row.id,mediaId);
            if (proof?.ok!==true) {vysledek.reason=proof?.reason||"media_failed";return vysledek;}
            vysledek.mediaItemsAuthenticated++;
          }
        }
        vysledek.remoteRowsScanned++;
      }
      const overeniPoctu=await klient.from("notes")
        .select("id",{count:"exact",head:true})
        .eq("user_id",userId).is("deleted_at",null);
      const {data:aktualni,error:aktualniChyba}=await klient.auth.getUser();
      if (overeniPoctu.error || overeniPoctu.count!==pocet.count ||
          aktualniChyba || aktualni?.user?.id!==userId ||
          !jeRootKlicDostupny() || rootKontext?.userId!==userId ||
          media.jeKlicDostupny?.()!==true) {
        vysledek.reason="account_or_data_changed";return vysledek;
      }
      vysledek.legacyMediaAuthenticated=vysledek.remoteLegacyVaultNotes>0 &&
        vysledek.mediaItemsAuthenticated===vysledek.mediaItemsFound;
      vysledek.e2eInnerPayloadAudited=true; // Only these direct-owner rows.
      vysledek.ok=true;
      vysledek.reason=vysledek.mediaItemsFound===0
        ? "no_vault_items_in_owner_notes_storage_unverified"
        : "owner_note_vault_items_authenticated_storage_unverified";
      // storageObjectsAudited/serverMediaContentAudited/safeToRotate
      // intentionally remain FALSE until separate comprehensive validation.
      return vysledek;
    } catch (_error) {
      vysledek.reason="media_content_proof_failed";return vysledek;
    }
  }

  /* 686M – bounded scoped Storage metadata inventory + RAM-only legacy media
   * rewrap under NEW password-derived media KEK. NEVER writes to DB, Storage,
   * IndexedDB or localStorage. TEST may route to production DB.
   * Storage prefix listing is NOT proof of full storage-object coverage,
   * content authenticity, snapshots, shared notes or other buckets.
   */
  async function recoveryStorageMediaDryRun686M(noveHeslo) {
    const v={ok:false,readOnly:true,safeToRotate:false,reason:"not_started",
      accountVerified:false,rootVerified:false,mediaKekReady:false,
      newMediaKekDerived:false,legacyMediaRewrapVerified:false,
      remoteRowsScanned:0,e2eNotesDecrypted:0,legacyMediaVaults:0,
      mediaItemsFound:0,mediaItemsRewrapped:0,mediaProofReason:"not_started",
      storageBucket:"lubanote-attachments",storageUserPrefixListed:false,
      storageObjectsFound:0,storageFoldersScanned:0,
      storageAttachmentRows:0,storageListingReason:"not_started",
      storageAllBucketsAudited:false,storageObjectContentsAudited:false,
      storageObjectsAudited:false,serverMediaContentAudited:false};
    let salt=null,kdfSalt=null,novyKlic=null;
    try {
      if(String(location.hostname||"").toLowerCase()!=="test.lubanote.com") {
        v.reason="test_web_only";return v;
      }
      if(!navigator.onLine){v.reason="offline";return v;}
      if(typeof noveHeslo!=="string" || noveHeslo.length<8 || noveHeslo.length>1024){
        v.reason="new_password_length_invalid";return v;
      }
      const klient=ziskejSupabase();
      if(!klient?.auth?.getUser || !klient?.from || !klient?.storage?.from){
        v.reason="backend_storage_unavailable";return v;
      }
      const {data:auth,error:authChyba}=await klient.auth.getUser();
      const userId=auth?.user?.id;
      if(authChyba || !userId ||
          String(localStorage.getItem("lubanoteLocalOwnerUserId")||"")!==userId){
        v.reason="account_or_local_owner_unverified";return v;
      }
      v.accountVerified=true;
      const stav=window.LubaNoteE2ECore?.getStav?.();
      v.rootVerified=Boolean(jeRootKlicDostupny() && rootKontext?.userId===userId &&
        stav?.ready===true && stav?.userId===userId);
      const media=window.LubaNoteMediaCrypto;
      v.mediaKekReady=media?.jeKlicDostupny?.()===true;
      if(!v.rootVerified || !v.mediaKekReady ||
          typeof media?.recoveryMediaRewrapRecord686M!=="function" ||
          typeof window.LubaNoteNotesCrypto?.desifruj!=="function"){
        v.reason="root_or_media_key_unavailable";return v;
      }
      // Storage: app's known private bucket, ONLY current user's prefix.
      // list(...) is a GET, never upload / createSignedUrl / download.
      try {
        const {count,error:attachError}=await klient.from("attachments")
          .select("id",{count:"exact",head:true}).eq("user_id",userId);
        if(attachError || !Number.isSafeInteger(count) || count<0){
          v.storageListingReason="attachment_metadata_unavailable";
        } else {
          v.storageAttachmentRows=count;
          const cesta=[{path:userId,depth:0}];
          const seen=new Set();let calls=0,folders=0,objects=0;
          let problem="";
          const bucket=window.LubaNoteAttachmentsCloud?.bucket || "lubanote-attachments";
          // Explicit allowlist to avoid silently auditing an arbitrary bucket.
          if(bucket!=="lubanote-attachments"){
            problem="unknown_attachment_bucket";
          } else {
            while(cesta.length && !problem){
              const {path,depth}=cesta.shift();
              if(seen.has(path)){problem="storage_duplicate_prefix";break;}
              seen.add(path);folders++;
              if(folders>60 || depth>7){problem="storage_tree_limit";break;}
              for(let offset=0; !problem; offset+=100){
                if(++calls>40){problem="storage_request_limit";break;}
                const {data:items,error:listError}=await klient.storage
                  .from(bucket).list(path,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
                if(listError || !Array.isArray(items)){problem="storage_list_failed";break;}
                if(items.length>100){problem="storage_page_invalid";break;}
                for(const item of items){
                  const name=String(item?.name||"");
                  if(!name || name==="." || name===".." || name.includes("/") || name.length>255){
                    problem="storage_item_name_invalid";break;
                  }
                  if(item.id==null && item.metadata==null){
                    cesta.push({path:`${path}/${name}`,depth:depth+1});
                  } else if(item.id!=null) {
                    objects++;
                    if(objects>300){problem="storage_object_limit";break;}
                  } else {problem="storage_entry_ambiguous";break;}
                }
                if(items.length<100)break;
              }
            }
          }
          v.storageObjectsFound=objects;
          v.storageFoldersScanned=folders;
          v.storageUserPrefixListed=!problem;
          v.storageListingReason=problem||"known_bucket_user_prefix_listed_metadata_only";
        }
      }catch(_error){v.storageListingReason="storage_inventory_failed";}
      // Media test: decrypt existing note vault bytes under OLD key,
      // re-encrypt ONLY in RAM with derived NEW key and compare decrypted bytes.
      try {
        const countResult=await klient.from("notes").select("id",{count:"exact",head:true})
          .eq("user_id",userId).is("deleted_at",null);
        if(countResult.error || !Number.isSafeInteger(countResult.count) || countResult.count<0){
          v.mediaProofReason="note_count_unavailable";
        } else if(countResult.count>30){
          v.mediaProofReason="over_30_notes_limit";
        } else {
          const {data:rows,error:rowsError}=await klient.from("notes")
            .select("id,data").eq("user_id",userId).is("deleted_at",null)
            .order("id",{ascending:true}).limit(31);
          if(rowsError || !Array.isArray(rows) || rows.length!==countResult.count){
            v.mediaProofReason="note_read_incomplete";
          } else {
            // Same domain-separated media PBKDF2 as mediaCrypto.js, fresh salt.
            salt=crypto.getRandomValues(new Uint8Array(16));
            const prefix=new TextEncoder().encode("LubaNote-media-encryption-v1");
            kdfSalt=new Uint8Array(prefix.length+salt.length);
            kdfSalt.set(prefix,0);kdfSalt.set(salt,prefix.length);
            const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(noveHeslo),
              "PBKDF2",false,["deriveKey"]);
            novyKlic=await crypto.subtle.deriveKey(
              {name:"PBKDF2",salt:kdfSalt,iterations:600000,hash:"SHA-256"},
              material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
            v.newMediaKekDerived=true;
            let problem="";
            for(const row of rows){
              const obj=row?.data;
              if(!row?.id || !obj || typeof obj!=="object" || Array.isArray(obj)){
                problem="invalid_note_data";break;
              }
              let note=obj;
              if(Object.prototype.hasOwnProperty.call(obj,"__lubanoteE2ENote")){
                try {note=await window.LubaNoteNotesCrypto.desifruj(obj,userId,row.id);}
                catch(_error){problem="e2e_note_decrypt_failed";break;}
                v.e2eNotesDecrypted++;
              }
              const vault=note?.__lubanoteMediaVault;
              if(vault!=null){
                if(Number(vault.version)!==1 || vault.algorithm!=="AES-GCM" ||
                   !vault.items || typeof vault.items!=="object" || Array.isArray(vault.items)){
                  problem="invalid_media_vault";break;
                }
                if(note===obj)v.legacyMediaVaults++;
                const items=Object.entries(vault.items);
                if(items.length>30){problem="over_30_media_items";break;}
                for(const [mediaId,record] of items){
                  if(++v.mediaItemsFound>30){problem="over_30_media_items";break;}
                  const proof=await media.recoveryMediaRewrapRecord686M(
                    record,row.id,mediaId,novyKlic);
                  if(proof?.ok!==true){problem=proof?.reason||"media_rewrap_failed";break;}
                  v.mediaItemsRewrapped++;
                }
                if(problem)break;
              }
              v.remoteRowsScanned++;
            }
            if(!problem){
              const rescan=await klient.from("notes").select("id",{count:"exact",head:true})
                .eq("user_id",userId).is("deleted_at",null);
              if(rescan.error || rescan.count!==countResult.count){
                problem="notes_changed_during_scan";
              }
            }
            v.legacyMediaRewrapVerified=!problem && v.mediaItemsFound>0 &&
              v.remoteRowsScanned===countResult.count &&
              v.mediaItemsRewrapped===v.mediaItemsFound;
            v.mediaProofReason=problem||(v.mediaItemsFound===0 ? "no_media_to_rewrap" : "new_password_media_roundtrip_verified_in_memory");
          }
        }
      }catch(_error){v.mediaProofReason="media_rewrap_dry_run_failed";}
      const {data:check,error:checkError}=await klient.auth.getUser();
      if(checkError || check?.user?.id!==userId ||
        !jeRootKlicDostupny() || rootKontext?.userId!==userId ||
        media.jeKlicDostupny?.()!==true){
        v.reason="account_or_keys_changed";return v;
      }
      v.ok=v.legacyMediaRewrapVerified && v.storageUserPrefixListed;
      v.reason=v.ok?"known_storage_prefix_and_media_dry_run_pass_other_scope_unverified":
        (v.legacyMediaRewrapVerified?"media_pass_storage_incomplete":"media_dry_run_incomplete");
      // safeToRotate deliberately remains FALSE in all cases.
      return v;
    }catch(_error){v.reason="storage_media_audit_failed";return v;}
    finally {salt?.fill(0);kdfSalt?.fill(0);novyKlic=null;}
  }

  /* 686O – complete candidate for the future atomic 686N call,
   * constructed, authenticated and DROPPED entirely in RAM. Nothing is
   * submitted to RPC/DB/Storage, stored locally, logged or returned.
   * TEST hostname is NOT an isolated backend; any scope uncertainty fails.
   * Passing this bounded staging is NOT permission to rotate credentials.
   */
  async function recoveryAtomicInputStaging686O(noveHeslo) {
    const v={ok:false,readOnly:true,safeToRotate:false,reason:"not_started",
      accountVerified:false,settingsLoaded:false,newVerifierVerified:false,
      rootEnvelopeVerified:false,rootKeyIdPreserved:false,
      sharedIdentityStaged:false,sharedIdentityVerified:false,
      liveNotesScanned:0,e2eNotesRestaged:0,legacyVaultNotesStaged:0,
      mediaItemsStaged:0,allStagedNotesVerified:false,
      atomicInputsPreparedInMemory:false,serverSnapshotUnchanged:false,
      storageScopeVerified:false,multiDeviceFenceVerified:false,
      serverAtomicCommitCalled:false,serverAndLocalModified:false};
    let rootRaw=null, rootRoundtrip=null, sharedRaw=null, sharedRoundtrip=null;
    let verifierRaw=null, hesloBajty=null, salt=null, mediaSalt=null, verifierSalt=null;
    let novyMediaKlic=null, stagedInputs=null;
    // Deliberately do NOT call initializers that may write local state.
    try {
      if(String(location.hostname||"").toLowerCase()!=="test.lubanote.com") {
        v.reason="test_web_only";return v;
      }
      if(!navigator.onLine){v.reason="offline";return v;}
      if(typeof noveHeslo!=="string" || noveHeslo.length<12 || noveHeslo.length>1024){
        v.reason="new_password_length_invalid";return v;
      }
      const klient=ziskejSupabase();
      const media=window.LubaNoteMediaCrypto;
      const notesCrypto=window.LubaNoteNotesCrypto;
      if(!klient?.auth?.getUser || !klient?.from ||
         typeof media?.recoveryStageMediaRecord686O!=="function" ||
         typeof media?.rozbalBajtyHlavnimKlicem!=="function" ||
         typeof notesCrypto?.zasifruj!=="function" ||
         typeof notesCrypto?.desifruj!=="function"){
        v.reason="staging_dependencies_unavailable";return v;
      }
      const {data:auth,error:authError}=await klient.auth.getUser();
      const userId=auth?.user?.id;
      if(authError || !userId || String(localStorage.getItem("lubanoteLocalOwnerUserId")||"")!==userId){
        v.reason="account_or_local_owner_unverified";return v;
      }
      const rootStav=getStav();
      if(!jeRootKlicDostupny() || rootKontext?.userId!==userId ||
         rootStav?.ready!==true || rootStav?.userId!==userId ||
         !media.jeKlicDostupny?.()){
        v.reason="root_or_media_key_unavailable";return v;
      }
      v.accountVerified=true;
      const {data:settings,error:settingsError}=await klient.from("secret_settings")
        .select("user_id,salt,verifier,kdf_iterations,e2e_root_key_version,e2e_root_key_algorithm,e2e_root_key_id,e2e_root_key_box")
        .eq("user_id",userId).maybeSingle();
      if(settingsError || !settings || settings.user_id!==userId ||
         typeof settings.salt!=="string" || typeof settings.verifier!=="string" ||
         Number(settings.kdf_iterations)!==600000 || !maPlatnyServerRecord(settings) ||
         rootKontext.keyId!==settings.e2e_root_key_id){
        v.reason="settings_missing_or_changed";return v;
      }
      v.settingsLoaded=true;
      rootRaw=await rozbalRootRaw(settings.e2e_root_key_box,userId);
      if(rootRaw.length!==32 || await vytvorKeyId(rootRaw)!==settings.e2e_root_key_id){
        v.reason="root_source_invalid";return v;
      }
      const enc=new TextEncoder();
      hesloBajty=enc.encode(noveHeslo);
      salt=crypto.getRandomValues(new Uint8Array(16));
      const prefix=(str)=>{const p=enc.encode(str);const b=new Uint8Array(p.length+salt.length);
        b.set(p);b.set(salt,p.length);return b;};
      mediaSalt=prefix("LubaNote-media-encryption-v1");
      verifierSalt=prefix("LubaNote-verifier-v1");
      const material=await crypto.subtle.importKey("raw",hesloBajty,"PBKDF2",false,["deriveKey","deriveBits"]);
      novyMediaKlic=await crypto.subtle.deriveKey(
        {name:"PBKDF2",salt:mediaSalt,iterations:600000,hash:"SHA-256"},
        material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
      verifierRaw=new Uint8Array(await crypto.subtle.deriveBits(
        {name:"PBKDF2",salt:verifierSalt,iterations:600000,hash:"SHA-256"},material,256));
      const b64=(b)=>btoa(String.fromCharCode(...b));
      const saltBase64=b64(salt);
      if(typeof vytvorVerifierZHesla!=="function" ||
         await vytvorVerifierZHesla(noveHeslo,saltBase64,600000)!==b64(verifierRaw)){
        v.reason="verifier_incompatible";return v;
      }
      v.newVerifierVerified=true;
      const stageBox=async(raw,aadText)=>{
        const iv=crypto.getRandomValues(new Uint8Array(12));
        const aad=enc.encode(aadText);
        const bytes=new Uint8Array(await crypto.subtle.encrypt(
          {name:"AES-GCM",iv,additionalData:aad},novyMediaKlic,raw));
        const box={version:1,algorithm:"AES-GCM",iv:b64(iv),ciphertext:b64(bytes)};
        const check=new Uint8Array(await crypto.subtle.decrypt(
          {name:"AES-GCM",iv,additionalData:aad},novyMediaKlic,bytes));
        bytes.fill(0);
        return {box,check};
      };
      const rootStage=await stageBox(rootRaw,`LubaNote-e2e-core-wrap-v1:${rootWrapKontext(userId)}`);
      rootRoundtrip=rootStage.check;
      v.rootEnvelopeVerified=rootRoundtrip.length===rootRaw.length &&
        rootRoundtrip.every((b,i)=>b===rootRaw[i]);
      v.rootKeyIdPreserved=v.rootEnvelopeVerified &&
        await vytvorKeyId(rootRoundtrip)===settings.e2e_root_key_id;
      if(!v.rootKeyIdPreserved){v.reason="root_restaging_failed";return v;}
      const {data:shared,error:sharedError}=await klient.from("lubanote_shared_crypto_identities")
        .select("user_id,algorithm,key_version,public_key_jwk,private_key_box")
        .eq("user_id",userId).maybeSingle();
      if(sharedError){v.reason="shared_identity_read_failed";return v;}
      let sharedOldBox=null,sharedNewBox=null;
      if(shared){
        if(shared.user_id!==userId || shared.algorithm!=="ECDH-P256" ||
           Number(shared.key_version)!==1 ||
           shared.public_key_jwk?.kty!=="EC" || shared.public_key_jwk?.crv!=="P-256" ||
           shared.private_key_box?.algorithm!=="AES-GCM" ||
           Number(shared.private_key_box?.version)!==1){
          v.reason="shared_identity_invalid";return v;
        }
        sharedOldBox=shared.private_key_box;
        sharedRaw=await media.rozbalBajtyHlavnimKlicem(
          sharedOldBox,`shared-identity:${userId}:v1`);
        const stage=await stageBox(sharedRaw,`LubaNote-shared-wrap-v1:shared-identity:${userId}:v1`);
        sharedRoundtrip=stage.check;sharedNewBox=stage.box;
        v.sharedIdentityStaged=true;
        const same=sharedRaw.length===sharedRoundtrip.length &&
          sharedRaw.every((b,i)=>b===sharedRoundtrip[i]);
        if(!same){v.reason="shared_key_roundtrip_mismatch";return v;}
        // Check that the staged private key still agrees with public identity.
        const privateKey=await crypto.subtle.importKey("pkcs8",sharedRoundtrip,
          {name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
        const publicKey=await crypto.subtle.importKey("jwk",shared.public_key_jwk,
          {name:"ECDH",namedCurve:"P-256"},false,[]);
        const probe=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
        const a=new Uint8Array(await crypto.subtle.deriveBits(
          {name:"ECDH",public:probe.publicKey},privateKey,256));
        const b=new Uint8Array(await crypto.subtle.deriveBits(
          {name:"ECDH",public:publicKey},probe.privateKey,256));
        v.sharedIdentityVerified=a.length===32 && b.length===32 && a.every((n,i)=>n===b[i]);
        a.fill(0);b.fill(0);
        if(!v.sharedIdentityVerified){v.reason="shared_public_identity_mismatch";return v;}
      }else{
        v.sharedIdentityVerified=true; // No shared identity record to rewrap.
      }
      const {count,error:countError}=await klient.from("notes")
        .select("id",{count:"exact",head:true}).eq("user_id",userId).is("deleted_at",null);
      if(countError || !Number.isSafeInteger(count) || count<0 || count>30){
        v.reason="bounded_notes_count_unavailable";return v;
      }
      const {data:rows,error:rowError}=await klient.from("notes")
        .select("id,data").eq("user_id",userId).is("deleted_at",null)
        .order("id",{ascending:true}).limit(31);
      if(rowError || !Array.isArray(rows) || rows.length!==count){
        v.reason="notes_snapshot_unavailable";return v;
      }
      const changes=[];
      for(const row of rows){
        const obj=row?.data;
        if(!row?.id || !obj || typeof obj!=="object" || Array.isArray(obj)){
          v.reason="note_data_invalid";return v;
        }
        const isE2E=obj.__lubanoteE2ENote===true;
        let decrypted=isE2E ? await notesCrypto.desifruj(obj,userId,row.id) : obj;
        const vault=decrypted?.__lubanoteMediaVault;
        const hasVault=vault!=null;
        if(hasVault && (Number(vault.version)!==1 || vault.algorithm!=="AES-GCM" ||
           !vault.items || typeof vault.items!=="object" || Array.isArray(vault.items))){
          v.reason="media_vault_invalid";return v;
        }
        if(!isE2E && !hasVault){v.liveNotesScanned++;continue;}
        // Clone before modifying, so the server snapshot cannot be mutated.
        let replacement=JSON.parse(JSON.stringify(decrypted));
        if(hasVault){
          const items=Object.entries(vault.items);
          if(items.length>30){v.reason="media_items_limit";return v;}
          for(const [mediaId,record] of items){
            if(++v.mediaItemsStaged>30){v.reason="media_items_limit";return v;}
            const result=await media.recoveryStageMediaRecord686O(record,row.id,mediaId,novyMediaKlic);
            if(!result.ok){v.reason=result.reason||"media_stage_failed";return v;}
            replacement.__lubanoteMediaVault.items[mediaId]=result.record;
          }
          if(!isE2E)v.legacyVaultNotesStaged++;
        }
        let newData;
        if(isE2E){
          newData=await notesCrypto.zasifruj(replacement,userId);
          const roundtrip=await notesCrypto.desifruj(newData,userId,row.id);
          if(JSON.stringify(roundtrip)!==JSON.stringify(replacement)){
            v.reason="e2e_note_roundtrip_mismatch";return v;
          }
          v.e2eNotesRestaged++;
        }else{newData=replacement;}
        if(JSON.stringify(newData)===JSON.stringify(obj)){
          v.reason="restaged_note_unchanged";return v;
        }
        changes.push({id:row.id,old_data:obj,new_data:newData});
        v.liveNotesScanned++;
      }
      v.allStagedNotesVerified=v.liveNotesScanned===count;
      // 686N accepts no more than 4 MB of note changes (pg_column_size).
      // This conservative JSON byte ceiling avoids falsely advertising
      // completeness for candidates that the server would reject.
      if(enc.encode(JSON.stringify(changes)).byteLength>3500000){
        v.reason="atomic_input_payload_too_large";return v;
      }
      // Staging data follows the 686N input contract, but is NEVER sent there.
      stagedInputs={expected_settings:{salt:settings.salt,verifier:settings.verifier,
          kdf_iterations:600000,e2e_root_key_id:settings.e2e_root_key_id,
          e2e_root_key_box:settings.e2e_root_key_box},
        new_settings:{salt:saltBase64,verifier:b64(verifierRaw),kdf_iterations:600000,
          e2e_root_key_id:settings.e2e_root_key_id,e2e_root_key_box:rootStage.box},
        expected_shared_box:sharedOldBox,new_shared_box:sharedNewBox,
        note_changes:changes,expected_live_note_count:count};
      const snapshotHash=async(x)=>{
        const data=enc.encode(JSON.stringify(x));
        const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",data));
        return b64(digest);
      };
      const originalDigest=await snapshotHash(rows);
      const {data:after,error:afterError}=await klient.from("notes")
        .select("id,data").eq("user_id",userId).is("deleted_at",null)
        .order("id",{ascending:true}).limit(31);
      const {data:settingsAfter,error:settingsAfterError}=await klient.from("secret_settings")
        .select("salt,verifier,kdf_iterations,e2e_root_key_id,e2e_root_key_box")
        .eq("user_id",userId).maybeSingle();
      const {data:sharedAfter,error:sharedAfterError}=await klient.from("lubanote_shared_crypto_identities")
        .select("private_key_box").eq("user_id",userId).maybeSingle();
      const {count:countAfter,error:countAfterError}=await klient.from("notes")
        .select("id",{count:"exact",head:true}).eq("user_id",userId).is("deleted_at",null);
      const {data:authAfter,error:authAfterError}=await klient.auth.getUser();
      if(afterError || settingsAfterError || sharedAfterError || countAfterError || authAfterError ||
         !Array.isArray(after) || after.length!==count || countAfter!==count ||
         authAfter?.user?.id!==userId || !jeRootKlicDostupny() ||
         rootKontext?.userId!==userId || rootKontext?.keyId!==settings.e2e_root_key_id ||
         !media.jeKlicDostupny?.()){
        v.reason="source_changed_during_staging";return v;
      }
      v.serverSnapshotUnchanged=await snapshotHash(after)===originalDigest &&
        settingsAfter?.salt===settings.salt &&
        settingsAfter?.verifier===settings.verifier &&
        Number(settingsAfter?.kdf_iterations)===600000 &&
        settingsAfter?.e2e_root_key_id===settings.e2e_root_key_id &&
        JSON.stringify(settingsAfter?.e2e_root_key_box)===JSON.stringify(settings.e2e_root_key_box) &&
        JSON.stringify(sharedAfter?.private_key_box??null)===JSON.stringify(sharedOldBox??null);
      if(!v.serverSnapshotUnchanged){v.reason="source_snapshot_changed";return v;}
      // Existence + bounded shape (never return or persist the actual fields).
      v.atomicInputsPreparedInMemory=!!(stagedInputs.new_settings.e2e_root_key_box &&
        stagedInputs.new_settings.verifier &&
        Array.isArray(stagedInputs.note_changes) &&
        stagedInputs.note_changes.length===v.e2eNotesRestaged+v.legacyVaultNotesStaged);
      v.ok=v.newVerifierVerified && v.rootKeyIdPreserved && v.sharedIdentityVerified &&
        v.allStagedNotesVerified && v.atomicInputsPreparedInMemory && v.serverSnapshotUnchanged;
      v.reason=v.ok?"atomic_inputs_verified_in_ram_scope_still_unverified":"staging_incomplete";
      return v;
    }catch(_error){v.reason="staging_crypto_or_read_failed";return v;}
    finally {
      rootRaw?.fill(0);rootRoundtrip?.fill(0);
      sharedRaw?.fill(0);sharedRoundtrip?.fill(0);verifierRaw?.fill(0);
      hesloBajty?.fill(0);salt?.fill(0);mediaSalt?.fill(0);verifierSalt?.fill(0);
      novyMediaKlic=null;stagedInputs=null;
    }
  }

  /* 686P – bounded, authenticated READ-ONLY storage metadata scope audit.
   * Uses only signed-in user's attachment metadata and normal Storage list().
   * No download, signed URLs, crypto, RPC, upload, deletion or local storage writes.
   * RLS-limited views and the unaudited buckets/objects prevent GLOBAL PASS.
   * A passing result means only this one visible bucket/user prefix is consistent.
   */
  async function recoveryStorageScopeAudit686P() {
    const v={ok:false,readOnly:true,safeToRotate:false,reason:"not_started",
      accountVerified:false,dbMetadataComplete:false,dbSnapshotStable:false,
      bucket:"lubanote-attachments",userPrefixListed:false,
      attachmentRows:0,attachmentPaths:0,attachmentWithoutPath:0,
      deletedRows:0,storageObjects:0,storageFolders:0,storageListCalls:0,
      duplicatePaths:0,invalidPaths:0,missingObjects:0,untrackedObjects:0,
      visiblePathsMatched:false,storageScopeVerified:false,
      allBucketsAudited:false,objectContentsAudited:false,
      otherUsersAudited:false,serverSideInventoryAudited:false,
      serverModified:false};
    try {
      if(String(location.hostname||"").toLowerCase()!=="test.lubanote.com"){
        v.reason="test_web_only";return v;
      }
      if(!navigator.onLine){v.reason="offline";return v;}
      const klient=ziskejSupabase();
      if(!klient?.auth?.getUser || !klient?.from || !klient?.storage?.from){
        v.reason="backend_unavailable";return v;
      }
      const {data:auth,error:authError}=await klient.auth.getUser();
      const userId=auth?.user?.id;
      if(authError || !userId ||
         String(localStorage.getItem("lubanoteLocalOwnerUserId")||"")!==userId){
        v.reason="account_or_local_owner_unverified";return v;
      }
      v.accountVerified=true;
      const bucket=window.LubaNoteAttachmentsCloud?.bucket || "lubanote-attachments";
      if(bucket!==v.bucket){v.reason="unrecognized_bucket";return v;}
      // Standard user's RLS-visible rows only; never treat this as a server-wide inventory.
      const readRows=async()=>{
        const {count,error}=await klient.from("attachments")
          .select("id",{count:"exact",head:true}).eq("user_id",userId);
        if(error || !Number.isSafeInteger(count) || count<0 || count>300){
          return {ok:false,reason:count>300?"attachment_row_limit":"attachment_count_unavailable"};
        }
        const rows=[];
        for(let start=0;start<count;start+=100){
          const {data,error:e}=await klient.from("attachments")
            .select("id,storage_path,status")
            .eq("user_id",userId).order("id",{ascending:true})
            .range(start,Math.min(start+99,count-1));
          if(e || !Array.isArray(data) || data.length!==Math.min(100,count-start)){
            return {ok:false,reason:"attachment_page_incomplete"};
          }
          rows.push(...data);
        }
        if(rows.length!==count || new Set(rows.map(r=>String(r?.id||""))).size!==count ||
           rows.some(r=>!r?.id))return {ok:false,reason:"attachment_rows_ambiguous"};
        // Sanitize snapshot to compare metadata before/after (without returning paths).
        return {ok:true,rows,signature:JSON.stringify(rows.map(r=>
          [String(r.id),r.storage_path??null,r.status??null]))};
      };
      const first=await readRows();
      if(!first.ok){v.reason=first.reason;return v;}
      v.attachmentRows=first.rows.length;
      v.dbMetadataComplete=true;
      const reference=new Set();
      const prefix=userId+"/";
      const validPath=path=>typeof path==="string" && path.startsWith(prefix) &&
        path.length>prefix.length && path.length<=1024 && !path.includes("\\") &&
        !path.split("/").some(s=>!s || s==="." || s===".." || s.length>255 || /[\x00-\x1f]/.test(s));
      for(const r of first.rows){
        if(String(r.status||"").toLowerCase()==="deleted") {v.deletedRows++;continue;}
        const path=r.storage_path;
        if(path==null || path==="") {v.attachmentWithoutPath++;continue;}
        if(!validPath(path)){v.invalidPaths++;continue;}
        if(reference.has(path)){v.duplicatePaths++;continue;}
        reference.add(path);
      }
      v.attachmentPaths=reference.size;
      if(v.invalidPaths || v.duplicatePaths){v.reason="attachment_paths_invalid_or_duplicate";return v;}
      // Storage list returns only user-permitted objects; never claim global coverage.
      const actual=new Set(), queue=[{path:userId,depth:0}],seenFolders=new Set();
      let issue="";
      while(queue.length && !issue){
        const next=queue.shift();
        if(seenFolders.has(next.path)){issue="repeated_storage_directory";break;}
        seenFolders.add(next.path);
        if(++v.storageFolders>60 || next.depth>7){issue="storage_tree_limit";break;}
        for(let offset=0;!issue;offset+=100){
          if(++v.storageListCalls>40){issue="storage_request_limit";break;}
          const {data,error}=await klient.storage.from(bucket).list(next.path,
            {limit:100,offset,sortBy:{column:"name",order:"asc"}});
          if(error || !Array.isArray(data)){issue="storage_list_failed";break;}
          if(data.length>100){issue="storage_page_invalid";break;}
          for(const item of data){
            const name=item?.name;
            if(typeof name!=="string" || !name || name==="." || name===".." ||
               name.includes("/") || name.includes("\\") || name.length>255 ||
               /[\x00-\x1f]/.test(name)){
              issue="storage_item_invalid";break;
            }
            const path=next.path+"/"+name;
            if(item.id==null && item.metadata==null){
              queue.push({path,depth:next.depth+1});
            }else if(item.id!=null){
              if(actual.has(path)){issue="duplicate_storage_object";break;}
              actual.add(path);
              if(actual.size>300){issue="storage_object_limit";break;}
            }else {issue="storage_item_ambiguous";break;}
          }
          if(data.length<100)break;
        }
      }
      v.storageObjects=actual.size;
      if(issue){v.reason=issue;return v;}
      v.userPrefixListed=true;
      for(const path of reference)if(!actual.has(path))v.missingObjects++;
      for(const path of actual)if(!reference.has(path))v.untrackedObjects++;
      const last=await readRows();
      if(!last.ok){v.reason="attachment_recheck_failed";return v;}
      const {data:authAfter,error:authAfterError}=await klient.auth.getUser();
      if(authAfterError || authAfter?.user?.id!==userId){
        v.reason="account_changed_during_audit";return v;
      }
      v.dbSnapshotStable=first.signature===last.signature;
      if(!v.dbSnapshotStable){v.reason="attachment_metadata_changed_during_audit";return v;}
      // Still not an atomic Storage snapshot; concurrent object changes are possible.
      v.visiblePathsMatched=v.missingObjects===0 && v.untrackedObjects===0;
      v.ok=v.visiblePathsMatched && v.userPrefixListed && v.dbMetadataComplete && v.dbSnapshotStable;
      v.reason=v.ok?"visible_account_storage_metadata_consistent_global_scope_unverified":
        "storage_metadata_path_mismatch";
      return v;
    }catch(_error){v.reason="storage_audit_read_failed";return v;}
  }

  /* 686Q – TEST-only multi-device INVENTORY, not a write fence.
   * Only SELECT auth user's RLS-visible public.devices rows. No write/RPC,
   * auth logout, token refresh, device ID creation or local state modification.
   * Device census cannot prove protection from stale offline clients or JWTs.
   */
  async function recoveryMultiDeviceFenceAudit686Q() {
    const v={ok:false,readOnly:true,safeToRotate:false,reason:"not_started",
      accountVerified:false,currentDeviceIdPresent:false,devicesMetadataReadable:false,
      deviceRowsComplete:false,deviceSnapshotStable:false,listedCurrentDevice:false,
      visibleDevices:0,otherVisibleDevices:0,devicesWithMissingSyncTime:0,
      devicesOlderThan30Days:0,invalidDeviceIds:0,duplicateDeviceIds:0,
      authenticatedSessionsEnumerated:false,offlineClientsExcluded:false,
      allDevicesAudited:false,serverWriteFenceInspected:false,
      serverWriteFenceVerified:false,multiDeviceFenceVerified:false,
      serverModified:false};
    try {
      if(String(location.hostname||"").toLowerCase()!=="test.lubanote.com") {
        v.reason="test_web_only";return v;
      }
      if(!navigator.onLine){v.reason="offline";return v;}
      const klient=ziskejSupabase();
      if(!klient?.auth?.getUser || !klient?.from){v.reason="backend_unavailable";return v;}
      const {data:auth,error:authError}=await klient.auth.getUser();
      const userId=auth?.user?.id;
      if(authError || !userId ||
         String(localStorage.getItem("lubanoteLocalOwnerUserId")||"")!==userId){
        v.reason="account_or_local_owner_unverified";return v;
      }
      v.accountVerified=true;
      // Never call getDeviceId(): it would create and persist a new identifier.
      const ownDevice=localStorage.getItem("lubanoteDeviceId");
      if(typeof ownDevice!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownDevice)){
        v.reason="current_device_id_missing_or_invalid";return v;
      }
      v.currentDeviceIdPresent=true;
      const readDevices=async()=>{
        const {count,error}=await klient.from("devices")
          .select("device_id",{count:"exact",head:true}).eq("user_id",userId);
        if(error || !Number.isSafeInteger(count) || count<0 || count>300){
          return {ok:false,reason:count>300?"device_row_limit":"device_count_unavailable"};
        }
        const rows=[];
        for(let start=0;start<count;start+=100){
          const {data,error:e}=await klient.from("devices")
            .select("device_id,last_sync_at")
            .eq("user_id",userId).order("device_id",{ascending:true})
            .range(start,Math.min(start+99,count-1));
          if(e || !Array.isArray(data) || data.length!==Math.min(100,count-start)){
            return {ok:false,reason:"device_page_incomplete"};
          }
          rows.push(...data);
        }
        if(rows.length!==count)return {ok:false,reason:"device_count_mismatch"};
        return {ok:true,rows,signature:JSON.stringify(rows.map(r=>
          [r?.device_id??null,r?.last_sync_at??null]))};
      };
      const first=await readDevices();
      if(!first.ok){v.reason=first.reason;return v;}
      v.devicesMetadataReadable=true;
      v.visibleDevices=first.rows.length;
      v.deviceRowsComplete=true;
      const seen=new Set();
      const now=Date.now();
      for(const r of first.rows){
        const id=r?.device_id;
        if(typeof id!=="string" ||
           !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
          v.invalidDeviceIds++;continue;
        }
        const normalized=id.toLowerCase();
        if(seen.has(normalized)){v.duplicateDeviceIds++;continue;}
        seen.add(normalized);
        if(normalized===ownDevice.toLowerCase())v.listedCurrentDevice=true;
        else v.otherVisibleDevices++;
        const t=Date.parse(r?.last_sync_at??"");
        if(!Number.isFinite(t) || t>now+60000){v.devicesWithMissingSyncTime++;continue;}
        if(now-t>30*24*60*60*1000)v.devicesOlderThan30Days++;
      }
      const last=await readDevices();
      if(!last.ok){v.reason="device_recheck_failed";return v;}
      const {data:authAfter,error:authAfterError}=await klient.auth.getUser();
      if(authAfterError || authAfter?.user?.id!==userId){
        v.reason="account_changed_during_audit";return v;
      }
      v.deviceSnapshotStable=first.signature===last.signature;
      if(!v.deviceSnapshotStable){v.reason="device_metadata_changed_during_audit";return v;}
      if(v.invalidDeviceIds || v.duplicateDeviceIds){v.reason="device_ids_invalid_or_duplicate";return v;}
      if(!v.listedCurrentDevice){v.reason="current_device_not_in_visible_registry";return v;}
      // No promise of all-device coverage: RLS, expired/offline clients, and
      // sessions outside public.devices cannot be enumerated by this client.
      v.ok=true;
      v.reason="visible_device_inventory_consistent_server_fence_not_verified";
      return v;
    }catch(_error){v.reason="device_inventory_read_failed";return v;}
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
    recoverySharedRewrapDryRun686J,
    recoverySecretMediaAudit686K,
    recoveryMediaContentProof686L,
    recoveryStorageMediaDryRun686M,
    recoveryAtomicInputStaging686O,
    recoveryStorageScopeAudit686P,
    recoveryMultiDeviceFenceAudit686Q,
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
