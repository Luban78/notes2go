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


  // ============================================================
  // 653B – note_key crypto primitives
  // Jeden náhodný 256bit klíč patří právě jedné sdílené poznámce.
  // Tento krok ještě NEUKLÁDÁ obálky na server a nezapíná média.
  // ============================================================

  function bajtyNaBase64(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function base64NaBajty(text) {
    const bin = atob(String(text || ""));
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  }

  function noteKeyKontext(noteId) {
    return `lubanote:shared-note-key:${String(noteId)}:v1`;
  }

  async function importujVerejnyEcdhKlic(jwk) {
    return crypto.subtle.importKey(
      "jwk", jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false, []
    );
  }

  async function odvodWrapKlic(privateKey, publicKey, noteId) {
    const secret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      privateKey,
      256
    );
    const hkdfBase = await crypto.subtle.importKey(
      "raw", secret, "HKDF", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("LubaNote Shared Media E2E 653B"),
        info: new TextEncoder().encode(noteKeyKontext(noteId))
      },
      hkdfBase,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function vytvorNoteKey() {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  async function zabalNoteKeyProUzivatele(noteId, noteKeyBytes, recipientPublicKeyJwk) {
    if (!jeIdentitaPripravena()) throw new Error("shared_identity_not_ready");
    if (!noteId || !(noteKeyBytes instanceof Uint8Array) || noteKeyBytes.length !== 32) {
      throw new Error("invalid_shared_note_key");
    }
    const recipientPublicKey = await importujVerejnyEcdhKlic(recipientPublicKeyJwk);
    const wrapKey = await odvodWrapKlic(identita.privateKey, recipientPublicKey, noteId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(noteKeyKontext(noteId));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      wrapKey,
      noteKeyBytes
    );
    return {
      version: 1,
      algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
      sender_public_key_jwk: ziskejVerejnyKlic(),
      iv: bajtyNaBase64(iv),
      ciphertext: bajtyNaBase64(new Uint8Array(cipher))
    };
  }

  async function rozbalNoteKey(noteId, envelope) {
    if (!jeIdentitaPripravena()) throw new Error("shared_identity_not_ready");
    if (!noteId || !envelope?.sender_public_key_jwk || !envelope?.iv || !envelope?.ciphertext) {
      throw new Error("invalid_shared_note_key_envelope");
    }
    const senderPublicKey = await importujVerejnyEcdhKlic(envelope.sender_public_key_jwk);
    const wrapKey = await odvodWrapKlic(identita.privateKey, senderPublicKey, noteId);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64NaBajty(envelope.iv),
        additionalData: new TextEncoder().encode(noteKeyKontext(noteId))
      },
      wrapKey,
      base64NaBajty(envelope.ciphertext)
    );
    const bytes = new Uint8Array(plain);
    if (bytes.length !== 32) throw new Error("invalid_unwrapped_shared_note_key");
    return bytes;
  }

  async function selfTestNoteKey() {
    const ready = await zajistiIdentitu();
    if (ready?.ok !== true || !jeIdentitaPripravena()) {
      return { ok: false, reason: ready?.reason || "identity_not_ready" };
    }
    const noteId = `selftest-${identita.userId}`;
    const original = vytvorNoteKey();
    const envelope = await zabalNoteKeyProUzivatele(noteId, original, identita.publicKeyJwk);
    const unwrapped = await rozbalNoteKey(noteId, envelope);
    const ok = original.length === unwrapped.length && original.every((b, i) => b === unwrapped[i]);
    diag(ok ? "NOTE KEY SELFTEST | OK" : "NOTE KEY SELFTEST | FAIL");
    return { ok };
  }

  function resetPameti() {
    aktivniUserId = null;
    identita = null;
  }

  window.addEventListener("lubanote:account-active", (event) => {
    const userId = event?.detail?.userId || null;
    void zajistiIdentitu(userId).then((r) => {
      if (r?.ok === true) void selfTestNoteKey();
    });
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
    verze: "SHARED-MEDIA-E2E-NOTEKEY-653B",
    zajistiIdentitu,
    jeIdentitaPripravena,
    ziskejVerejnyKlic,
    ziskejSoukromyKlicProShared,
    vytvorNoteKey,
    zabalNoteKeyProUzivatele,
    rozbalNoteKey,
    selfTestNoteKey
  });
})();
