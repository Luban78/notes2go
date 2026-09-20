/* ============================================================
   LubaNote – SHARED MEDIA E2E IDENTITY V1
   PATCH 653A
   ------------------------------------------------------------
   - každý účet má jeden ECDH P-256 pár pro bezpečné předávání
     klíčů konkrétních sdílených poznámek,
   - veřejný klíč může být uložen na serveru,
   - soukromý klíč se na server ukládá pouze zašifrovaný klíčem
     odvozeným ze stejného hlavního hesla jako E2E fotografie,
   - na zařízení se po úspěšném odemknutí importuje jako
     non-extractable CryptoKey a ukládá se do IndexedDB,
   - 653A ještě NEZAPÍNÁ obrázky ve Shared. Jen připraví identitu.
============================================================ */

(() => {
  "use strict";

  const TABULKA = "lubanote_shared_crypto_identities";
  const ALGORITMUS = "ECDH-P256";
  const KEY_VERSION = 1;
  const DB_NAME = "LubaNoteSharedCrypto";
  const DB_VERSION = 1;
  const STORE = "identity";

  let aktivniUserId = null;
  let identita = null;
  let otevrenaDbPromise = null;
  let pripravaPromise = null;

  function diag(text) {
    window.LubaNoteStartupDiag?.zapis?.("SHARED-CRYPTO", text);
  }

  async function zajistiSupabase() {
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      return supabaseClient;
    }

    if (typeof pripravSupabaseClient === "function") {
      const pripraven = await pripravSupabaseClient();
      if (pripraven && typeof supabaseClient !== "undefined") {
        return supabaseClient;
      }
    }

    return null;
  }

  function otevriDb() {
    if (!globalThis.indexedDB) {
      return Promise.reject(new Error("IndexedDB pro Shared E2E není dostupná."));
    }

    if (otevrenaDbPromise) return otevrenaDbPromise;

    otevrenaDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "userId" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Shared E2E DB se nepodařilo otevřít."));
    });

    return otevrenaDbPromise;
  }

  async function nactiLokalniIdentitu(userId) {
    if (!userId) return null;

    try {
      const db = await otevriDb();
      const zaznam = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(userId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (
        !zaznam ||
        zaznam.userId !== userId ||
        zaznam.algorithm !== ALGORITMUS ||
        Number(zaznam.keyVersion) !== KEY_VERSION ||
        !(zaznam.privateKey instanceof CryptoKey) ||
        !zaznam.publicKeyJwk
      ) {
        return null;
      }

      return {
        userId,
        algorithm: zaznam.algorithm,
        keyVersion: Number(zaznam.keyVersion),
        publicKeyJwk: zaznam.publicKeyJwk,
        privateKey: zaznam.privateKey
      };
    } catch (error) {
      console.warn("Shared E2E: lokální identitu se nepodařilo načíst.", error);
      return null;
    }
  }

  async function ulozLokalniIdentitu(data) {
    if (!data?.userId || !(data.privateKey instanceof CryptoKey)) return;

    try {
      const db = await otevriDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({
          userId: data.userId,
          algorithm: data.algorithm,
          keyVersion: Number(data.keyVersion),
          publicKeyJwk: data.publicKeyJwk,
          privateKey: data.privateKey,
          updatedAt: new Date().toISOString()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Shared E2E cache byla zrušena."));
      });
    } catch (error) {
      /* Cache je pouze UX/egress optimalizace. Serverový zašifrovaný
         soukromý klíč zůstává autoritou a lze jej znovu odemknout. */
      console.warn("Shared E2E: identitu se nepodařilo uložit do device cache.", error);
    }
  }

  async function importujSoukromyKlic(pkcs8Bytes) {
    return crypto.subtle.importKey(
      "pkcs8",
      pkcs8Bytes,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
  }

  function kontextPrivatnihoKlice(userId) {
    return `shared-identity:${userId}:v${KEY_VERSION}`;
  }

  async function vytvorKandidata(userId) {
    const mediaCrypto = window.LubaNoteMediaCrypto;

    if (!mediaCrypto?.zabalBajtyHlavnimKlicem) {
      throw new Error("shared_identity_wrap_api_missing");
    }

    const pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    const [publicKeyJwk, privatePkcs8] = await Promise.all([
      crypto.subtle.exportKey("jwk", pair.publicKey),
      crypto.subtle.exportKey("pkcs8", pair.privateKey)
    ]);

    const privateKeyBox = await mediaCrypto.zabalBajtyHlavnimKlicem(
      new Uint8Array(privatePkcs8),
      kontextPrivatnihoKlice(userId)
    );

    const privateKey = await importujSoukromyKlic(privatePkcs8);

    return {
      userId,
      algorithm: ALGORITMUS,
      keyVersion: KEY_VERSION,
      publicKeyJwk,
      privateKeyBox,
      privateKey
    };
  }

  async function odemkniServerovouIdentitu(userId, row) {
    const mediaCrypto = window.LubaNoteMediaCrypto;

    if (!mediaCrypto?.rozbalBajtyHlavnimKlicem) {
      throw new Error("shared_identity_unwrap_api_missing");
    }

    if (
      !row ||
      row.algorithm !== ALGORITMUS ||
      Number(row.key_version) !== KEY_VERSION ||
      !row.public_key_jwk ||
      !row.private_key_box
    ) {
      throw new Error("shared_identity_server_record_invalid");
    }

    const privatePkcs8 = await mediaCrypto.rozbalBajtyHlavnimKlicem(
      row.private_key_box,
      kontextPrivatnihoKlice(userId)
    );

    return {
      userId,
      algorithm: row.algorithm,
      keyVersion: Number(row.key_version),
      publicKeyJwk: row.public_key_jwk,
      privateKey: await importujSoukromyKlic(privatePkcs8)
    };
  }

  async function nactiServerovouIdentitu(klient, userId) {
    const { data, error } = await klient
      .from(TABULKA)
      .select("user_id, algorithm, key_version, public_key_jwk, private_key_box")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function vytvorNeboVratServerovouIdentitu(klient, kandidat) {
    const { data, error } = await klient.rpc(
      "lubanote_ensure_shared_crypto_identity",
      {
        p_algorithm: kandidat.algorithm,
        p_key_version: kandidat.keyVersion,
        p_public_key_jwk: kandidat.publicKeyJwk,
        p_private_key_box: kandidat.privateKeyBox
      }
    );

    if (error) throw error;
    if (data?.ok !== true) {
      throw new Error(data?.reason || "shared_identity_ensure_failed");
    }

    return {
      user_id: data.user_id,
      algorithm: data.algorithm,
      key_version: data.key_version,
      public_key_jwk: data.public_key_jwk,
      private_key_box: data.private_key_box
    };
  }

  async function ziskejAktualniUserId(preferovanyUserId = null) {
    if (preferovanyUserId) return String(preferovanyUserId);

    const klient = await zajistiSupabase();
    if (!klient) return null;

    const { data, error } = await klient.auth.getUser();
    if (error) return null;
    return data?.user?.id ? String(data.user.id) : null;
  }

  async function zajistiIdentitu(userId = null) {
    const resolvedUserId = await ziskejAktualniUserId(userId);

    if (!resolvedUserId) {
      return { ok: false, reason: "missing_user" };
    }

    if (identita?.userId === resolvedUserId) {
      return { ok: true, cached: true };
    }

    if (pripravaPromise) return pripravaPromise;

    pripravaPromise = (async () => {
      aktivniUserId = resolvedUserId;

      const lokalni = await nactiLokalniIdentitu(resolvedUserId);
      if (lokalni) {
        identita = lokalni;
        diag("READY | device cache");
        return { ok: true, source: "device" };
      }

      const mediaCrypto = window.LubaNoteMediaCrypto;
      if (!mediaCrypto?.pripravMediaKlicZeZarizeni) {
        return { ok: false, reason: "media_crypto_missing" };
      }

      await mediaCrypto.pripravMediaKlicZeZarizeni();
      if (mediaCrypto.jeKlicDostupny?.() !== true) {
        diag("WAIT | master key unavailable");
        return { ok: false, reason: "master_key_unavailable" };
      }

      const klient = await zajistiSupabase();
      if (!klient) {
        return { ok: false, reason: "cloud_unavailable" };
      }

      let serverRow = await nactiServerovouIdentitu(klient, resolvedUserId);

      if (!serverRow) {
        const kandidat = await vytvorKandidata(resolvedUserId);
        serverRow = await vytvorNeboVratServerovouIdentitu(klient, kandidat);

        const stejnyKlic = JSON.stringify(serverRow.public_key_jwk) ===
          JSON.stringify(kandidat.publicKeyJwk);

        identita = stejnyKlic
          ? {
              userId: resolvedUserId,
              algorithm: kandidat.algorithm,
              keyVersion: kandidat.keyVersion,
              publicKeyJwk: kandidat.publicKeyJwk,
              privateKey: kandidat.privateKey
            }
          : await odemkniServerovouIdentitu(resolvedUserId, serverRow);

        diag(stejnyKlic ? "CREATED | server identity" : "READY | concurrent server identity");
      } else {
        identita = await odemkniServerovouIdentitu(resolvedUserId, serverRow);
        diag("READY | server identity");
      }

      await ulozLokalniIdentitu(identita);
      return { ok: true, source: "server" };
    })()
      .catch((error) => {
        console.warn("Shared E2E identita se nepodařila připravit.", error);
        diag(`ERROR | ${String(error?.message || error)}`);
        return { ok: false, reason: error?.message || "identity_prepare_failed" };
      })
      .finally(() => {
        pripravaPromise = null;
      });

    return pripravaPromise;
  }

  function jeIdentitaPripravena() {
    return Boolean(
      identita &&
      identita.userId === aktivniUserId &&
      identita.privateKey instanceof CryptoKey &&
      identita.publicKeyJwk
    );
  }

  function ziskejVerejnyKlic() {
    if (!jeIdentitaPripravena()) return null;
    return typeof structuredClone === "function"
      ? structuredClone(identita.publicKeyJwk)
      : JSON.parse(JSON.stringify(identita.publicKeyJwk));
  }

  function ziskejSoukromyKlicProShared() {
    return jeIdentitaPripravena() ? identita.privateKey : null;
  }

  function resetPameti() {
    aktivniUserId = null;
    identita = null;
  }

  window.addEventListener("lubanote:account-active", (event) => {
    const userId = event?.detail?.userId || null;
    void zajistiIdentitu(userId);
  });

  window.addEventListener("lubanote:master-password-ready", () => {
    void zajistiIdentitu();
  });

  window.addEventListener("lubanote:auth-valid", () => {
    void zajistiIdentitu();
  });

  window.addEventListener("lubanote:auth-expired", resetPameti);
  window.addEventListener("lubanote:account-blocked", resetPameti);

  window.LubaNoteSharedMediaCrypto = Object.freeze({
    verze: "SHARED-MEDIA-E2E-IDENTITY-653A",
    zajistiIdentitu,
    jeIdentitaPripravena,
    ziskejVerejnyKlic,
    ziskejSoukromyKlicProShared
  });
})();
