/* ============================================================
   LubaNote – SHARED MEDIA E2E IDENTITY V1
   PATCH 653A + 653B + 653C
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
  const DB_VERSION = 2;
  const STORE = "identity";

  let aktivniUserId = null;
  let identita = null;
  let otevrenaDbPromise = null;
  let pripravaPromise = null;
  const noteKeyCache = new Map();

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
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "cacheKey" });
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

  async function nactiMojiObalkuZeServeru(noteId) {
    const klient = await zajistiSupabase();
    if (!klient) return { ok: false, reason: "cloud_unavailable" };

    const { data, error } = await klient.rpc(
      "lubanote_get_my_shared_note_key_envelope",
      { p_note_id: noteId }
    );

    if (error) throw error;
    if (data?.ok !== true) {
      return { ok: false, reason: data?.reason || "shared_note_key_read_failed" };
    }

    return {
      ok: true,
      hasEnvelope: data?.has_envelope === true,
      envelope: data?.envelope || null,
      keyVersion: Number(data?.key_version) || 1
    };
  }

  async function ulozObalkuNaServer(noteId, recipientUserId, envelope) {
    const klient = await zajistiSupabase();
    if (!klient) return { ok: false, reason: "cloud_unavailable" };

    const { data, error } = await klient.rpc(
      "lubanote_put_shared_note_key_envelope",
      {
        p_note_id: noteId,
        p_recipient_user_id: recipientUserId,
        p_key_version: 1,
        p_envelope: envelope
      }
    );

    if (error) throw error;
    if (data?.ok !== true) {
      return { ok: false, reason: data?.reason || "shared_note_key_write_failed" };
    }

    return {
      ok: true,
      inserted: data?.inserted === true
    };
  }

  async function nactiPrijemceNoteKey(noteId) {
    const klient = await zajistiSupabase();
    if (!klient) return { ok: false, reason: "cloud_unavailable" };

    const { data, error } = await klient.rpc(
      "lubanote_get_shared_note_key_recipients",
      { p_note_id: noteId }
    );

    if (error) throw error;
    if (data?.ok !== true) {
      return { ok: false, reason: data?.reason || "shared_note_key_recipients_failed" };
    }

    return {
      ok: true,
      ownerUserId: String(data?.owner_user_id || ""),
      recipients: Array.isArray(data?.recipients) ? data.recipients : []
    };
  }

  async function nactiNoteKeyProPoznamku(noteId) {
    const id = String(noteId || "").trim();
    if (!id) return { ok: false, reason: "note_id_required" };

    const cached = noteKeyCache.get(id);
    if (cached instanceof Uint8Array && cached.length === 32) {
      return { ok: true, cached: true, noteKey: new Uint8Array(cached) };
    }

    const ready = await zajistiIdentitu();
    if (ready?.ok !== true || !jeIdentitaPripravena()) {
      return { ok: false, reason: ready?.reason || "identity_not_ready" };
    }

    const server = await nactiMojiObalkuZeServeru(id);
    if (server?.ok !== true) return server;
    if (!server.hasEnvelope || !server.envelope) {
      diag(`NOTE KEY LOAD | MISSING | note=${id}`);
      return { ok: false, reason: "shared_note_key_envelope_missing" };
    }

    const noteKey = await rozbalNoteKey(id, server.envelope);
    noteKeyCache.set(id, new Uint8Array(noteKey));
    diag(`NOTE KEY LOAD | OK | note=${id}`);

    return { ok: true, noteKey: new Uint8Array(noteKey) };
  }

  async function zajistiObalkyProPoznamku(noteId) {
    const id = String(noteId || "").trim();
    if (!id) return { ok: false, reason: "note_id_required" };

    const ready = await zajistiIdentitu();
    if (ready?.ok !== true || !jeIdentitaPripravena()) {
      return { ok: false, reason: ready?.reason || "identity_not_ready" };
    }

    const recipientsResult = await nactiPrijemceNoteKey(id);
    if (recipientsResult?.ok !== true) return recipientsResult;

    if (recipientsResult.ownerUserId !== identita.userId) {
      return { ok: false, reason: "not_owner" };
    }

    let noteKey = null;
    const moje = await nactiMojiObalkuZeServeru(id);
    if (moje?.ok !== true) return moje;

    if (moje.hasEnvelope && moje.envelope) {
      noteKey = await rozbalNoteKey(id, moje.envelope);
    } else {
      const ownerRecipient = recipientsResult.recipients.find(
        (item) => String(item?.user_id || "") === identita.userId
      );

      if (!ownerRecipient?.public_key_jwk) {
        return { ok: false, reason: "owner_public_key_missing" };
      }

      const kandidat = vytvorNoteKey();
      const selfEnvelope = await zabalNoteKeyProUzivatele(
        id,
        kandidat,
        ownerRecipient.public_key_jwk
      );
      const ulozeni = await ulozObalkuNaServer(
        id,
        identita.userId,
        selfEnvelope
      );
      if (ulozeni?.ok !== true) return ulozeni;

      if (ulozeni.inserted === true) {
        noteKey = kandidat;
      } else {
        // Souběh dvou owner zařízení: první self obálka je kanonická.
        const kanonicka = await nactiMojiObalkuZeServeru(id);
        if (!kanonicka?.hasEnvelope || !kanonicka.envelope) {
          return { ok: false, reason: "canonical_owner_envelope_missing" };
        }
        noteKey = await rozbalNoteKey(id, kanonicka.envelope);
      }
    }

    noteKeyCache.set(id, new Uint8Array(noteKey));

    let added = 0;
    let already = 0;
    let missingIdentity = 0;

    for (const recipient of recipientsResult.recipients) {
      const recipientUserId = String(recipient?.user_id || "");
      if (!recipientUserId || recipientUserId === identita.userId) continue;

      if (recipient?.has_envelope === true) {
        already += 1;
        continue;
      }

      if (recipient?.identity_ready !== true || !recipient?.public_key_jwk) {
        missingIdentity += 1;
        continue;
      }

      const envelope = await zabalNoteKeyProUzivatele(
        id,
        noteKey,
        recipient.public_key_jwk
      );
      const ulozeni = await ulozObalkuNaServer(id, recipientUserId, envelope);
      if (ulozeni?.ok !== true) {
        return ulozeni;
      }
      if (ulozeni.inserted === true) added += 1;
      else already += 1;
    }

    diag(
      `NOTE KEY SERVER | OK | note=${id} added=${added} already=${already} missingIdentity=${missingIdentity}`
    );

    return {
      ok: true,
      noteKey: new Uint8Array(noteKey),
      added,
      already,
      missingIdentity,
      recipients: recipientsResult.recipients.length
    };
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
    noteKeyCache.clear();
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


  // 653G – Shared Media Egress V2.
  // Ciphertext obrázků už není součástí notes.data. Canonical shared note
  // obsahuje jen malé media reference a samotný AES-GCM payload je uložen
  // odděleně v public.lubanote_shared_media_payloads. Device cache drží pouze
  // ciphertext/metadata, nikdy plaintext note_key.
  const SHARED_MEDIA_VAULT = "__lubanoteSharedMediaVault"; // legacy 653D
  const SHARED_MEDIA_REF = "data-lubanote-shared-media-ref";
  const SHARED_MEDIA_VERSION = 1;
  const SHARED_MEDIA_ALGORITHM = "AES-256-GCM";
  const SHARED_MEDIA_EDITOR_PREFIX = "shared-media:";
  const MEDIA_STORE = "media";

  function klonujNote(hodnota) {
    if (typeof structuredClone === "function") return structuredClone(hodnota);
    return JSON.parse(JSON.stringify(hodnota));
  }

  function bajtyNaBase64(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(text);
  }

  function base64NaBajty(text) {
    const raw = atob(String(text || ""));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function odhadniBajtyBase64(text) {
    const value = String(text || "");
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
  }

  async function otiskDataUrl(dataUrl) {
    const text = String(dataUrl || "");
    if (!text) return "";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function dataUrlNaBajty(dataUrl) {
    const text = String(dataUrl || "");
    const comma = text.indexOf(",");
    if (!text.startsWith("data:image/") || comma < 0) throw new Error("invalid_shared_media_data_url");
    const head = text.slice(5, comma);
    const mimeType = head.split(";")[0] || "image/jpeg";
    const body = text.slice(comma + 1);
    const bytes = head.includes(";base64")
      ? base64NaBajty(body)
      : new TextEncoder().encode(decodeURIComponent(body));
    return { mimeType, bytes };
  }

  function bajtyNaDataUrl(mimeType, bytes) {
    return `data:${mimeType};base64,${bajtyNaBase64(bytes)}`;
  }

  function sharedMediaAad(noteId, mediaId, mimeType) {
    return new TextEncoder().encode(
      `LubaNote-shared-media-v1:${String(noteId)}:${String(mediaId)}:${String(mimeType)}`
    );
  }

  async function importujNoteKeyAes(noteKey) {
    return crypto.subtle.importKey(
      "raw",
      noteKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function jeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function noveMediaId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10,16).join("")}`;
  }

  async function zasifrujSharedDataUrl(noteId, mediaId, dataUrl, noteKey) {
    const { mimeType, bytes } = dataUrlNaBajty(dataUrl);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await importujNoteKeyAes(noteKey);
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: sharedMediaAad(noteId, mediaId, mimeType) },
      key,
      bytes
    );
    const ciphertext = bajtyNaBase64(new Uint8Array(cipher));
    return {
      version: SHARED_MEDIA_VERSION,
      algorithm: SHARED_MEDIA_ALGORITHM,
      mimeType,
      iv: bajtyNaBase64(iv),
      ciphertext,
      cipherBytes: odhadniBajtyBase64(ciphertext)
    };
  }

  async function desifrujSharedRecord(noteId, mediaId, record, noteKey) {
    if (
      !record ||
      Number(record.version) !== SHARED_MEDIA_VERSION ||
      record.algorithm !== SHARED_MEDIA_ALGORITHM ||
      !String(record.mimeType || "").startsWith("image/")
    ) {
      throw new Error("invalid_shared_media_record");
    }
    const key = await importujNoteKeyAes(noteKey);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64NaBajty(record.iv),
        additionalData: sharedMediaAad(noteId, mediaId, record.mimeType)
      },
      key,
      base64NaBajty(record.ciphertext)
    );
    return bajtyNaDataUrl(record.mimeType, new Uint8Array(plain));
  }

  function mediaCacheKey(userId, noteId, mediaId) {
    return `${String(userId)}:${String(noteId)}:${String(mediaId)}`;
  }

  async function nactiMediaCache(noteId, mediaId) {
    const userId = aktivniUserId;
    if (!userId || !noteId || !mediaId) return null;
    try {
      const db = await otevriDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_STORE, "readonly");
        const req = tx.objectStore(MEDIA_STORE).get(mediaCacheKey(userId, noteId, mediaId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.warn("Shared E2E: media cache read selhal.", error);
      return null;
    }
  }

  async function ulozMediaCache(noteId, mediaId, record, serverStored, plainFingerprint = "") {
    const userId = aktivniUserId;
    if (!userId || !noteId || !mediaId || !record) return;
    try {
      const db = await otevriDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_STORE, "readwrite");
        tx.objectStore(MEDIA_STORE).put({
          cacheKey: mediaCacheKey(userId, noteId, mediaId),
          userId,
          noteId: String(noteId),
          mediaId: String(mediaId),
          record: {
            version: Number(record.version) || SHARED_MEDIA_VERSION,
            algorithm: String(record.algorithm || SHARED_MEDIA_ALGORITHM),
            mimeType: String(record.mimeType || "image/jpeg"),
            iv: String(record.iv || ""),
            ciphertext: String(record.ciphertext || ""),
            cipherBytes: Number(record.cipherBytes) || odhadniBajtyBase64(record.ciphertext)
          },
          serverStored: serverStored === true,
          plainFingerprint: String(plainFingerprint || ""),
          updatedAt: new Date().toISOString()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Shared media cache transaction aborted."));
      });
    } catch (error) {
      console.warn("Shared E2E: media cache write selhal.", error);
    }
  }

  function prevedServerRecord(row) {
    if (!row) return null;
    const record = {
      version: Number(row.version),
      algorithm: String(row.algorithm || ""),
      mimeType: String(row.mime_type || row.mimeType || ""),
      iv: String(row.iv || ""),
      ciphertext: String(row.ciphertext || ""),
      cipherBytes: Number(row.cipher_bytes || row.cipherBytes) || odhadniBajtyBase64(row.ciphertext)
    };
    if (
      record.version !== SHARED_MEDIA_VERSION ||
      record.algorithm !== SHARED_MEDIA_ALGORITHM ||
      !record.mimeType.startsWith("image/") ||
      !record.iv ||
      !record.ciphertext
    ) return null;
    return record;
  }

  async function ulozRecordNaServer(noteId, mediaId, record, plainFingerprint = "") {
    const klient = await zajistiSupabase();
    if (!klient) throw new Error("supabase_unavailable");
    const { data, error } = await klient.rpc("lubanote_put_shared_media_payload", {
      p_note_id: noteId,
      p_media_id: mediaId,
      p_record: {
        version: SHARED_MEDIA_VERSION,
        algorithm: SHARED_MEDIA_ALGORITHM,
        mime_type: record.mimeType,
        iv: record.iv,
        ciphertext: record.ciphertext
      }
    });
    if (error) throw error;
    if (data?.ok !== true) throw new Error(data?.reason || "shared_media_store_failed");
    await ulozMediaCache(noteId, mediaId, record, true, plainFingerprint);
    return data;
  }

  async function nactiExternalniRecordy(noteId, mediaIds) {
    const ids = Array.from(new Set((Array.isArray(mediaIds) ? mediaIds : []).filter(jeUuid)));
    const mapa = new Map();
    const chybi = [];
    let cacheCount = 0;
    let cloudCount = 0;
    let cloudBytes = 0;

    for (const mediaId of ids) {
      const cached = await nactiMediaCache(noteId, mediaId);
      if (cached?.record) {
        mapa.set(mediaId, cached.record);
        cacheCount += 1;
      } else {
        chybi.push(mediaId);
      }
    }

    if (chybi.length) {
      const klient = await zajistiSupabase();
      if (!klient) throw new Error("supabase_unavailable");
      const { data, error } = await klient.rpc("lubanote_get_shared_media_payloads", {
        p_note_id: noteId,
        p_media_ids: chybi
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(data?.reason || "shared_media_fetch_failed");
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const row of items) {
        const mediaId = String(row?.media_id || "");
        const record = prevedServerRecord(row);
        if (!jeUuid(mediaId) || !record) continue;
        mapa.set(mediaId, record);
        cloudCount += 1;
        cloudBytes += Number(record.cipherBytes) || 0;
        await ulozMediaCache(noteId, mediaId, record, true);
      }
    }

    return { mapa, cacheCount, cloudCount, cloudBytes };
  }

  function ziskejEditorMediaId(img) {
    if (!(img instanceof Element)) return "";
    const kandidat = img.closest?.("[data-attachment-id]")?.getAttribute?.("data-attachment-id")
      || img.getAttribute?.("data-attachment-id")
      || "";
    const text = String(kandidat || "");
    if (!text.startsWith(SHARED_MEDIA_EDITOR_PREFIX)) return "";
    const mediaId = text.slice(SHARED_MEDIA_EDITOR_PREFIX.length);
    return jeUuid(mediaId) ? mediaId : "";
  }

  function odeberEditorMediaMarker(img) {
    img?.removeAttribute?.("data-attachment-id");
    const holder = img?.closest?.("[data-attachment-id]");
    if (holder) holder.removeAttribute("data-attachment-id");
  }

  function nastavEditorMediaMarker(img, mediaId) {
    const value = `${SHARED_MEDIA_EDITOR_PREFIX}${mediaId}`;
    const figure = img?.closest?.("figure");
    if (figure) figure.setAttribute("data-attachment-id", value);
    else img?.setAttribute?.("data-attachment-id", value);
  }

  async function zajistiMediaRecordNaServeru(noteId, mediaId, dataUrl, noteKey) {
    let aktualniMediaId = mediaId;
    let cached = await nactiMediaCache(noteId, aktualniMediaId);
    const maPlain = dataUrl?.startsWith?.("data:image/") === true;
    const aktualniOtisk = maPlain ? await otiskDataUrl(dataUrl) : "";

    if (
      cached?.record &&
      cached.serverStored === true &&
      (
        !maPlain ||
        (cached.plainFingerprint && cached.plainFingerprint === aktualniOtisk)
      )
    ) {
      return {
        mediaId: aktualniMediaId,
        record: cached.record,
        uploaded: false,
        reused: true,
        changed: false
      };
    }

    let changed = false;

    /* 653D legacy cache ještě není external payload. Při prvním skutečném
       editor save jí dáme NOVÉ media_id, aby optimalizovaná verze nikdy
       neměnila význam starého immutable ID. */
    if (cached?.record && cached.serverStored !== true && maPlain) {
      aktualniMediaId = noveMediaId();
      cached = null;
      changed = true;
    }

    /* Zdroj stejného external image bloku se změnil (např. crop). Immutable
       payload nepřepisujeme: změna dostane nové media_id. */
    if (
      cached?.record &&
      cached.serverStored === true &&
      maPlain &&
      aktualniOtisk &&
      (
        !cached.plainFingerprint ||
        cached.plainFingerprint !== aktualniOtisk
      )
    ) {
      aktualniMediaId = noveMediaId();
      cached = null;
      changed = true;
    }

    let record = null;
    let finalOtisk = aktualniOtisk;

    /* Legacy 653D ciphertext mohl být výrazně větší. Máme-li při migraci
       v editoru plaintext Data URL, znovu jej bezpečně optimalizujeme podle
       653E a vytvoříme nový ciphertext. Starý ciphertext na server neposíláme. */
    if (maPlain) {
      let source = dataUrl;
      const optimizer = window.LubaNoteEditorMediaV2?.optimalizujSdilenyDataUrl;
      if (typeof optimizer === "function" && cached?.serverStored !== true) {
        source = await optimizer(source);
      }
      finalOtisk = await otiskDataUrl(source);
      record = await zasifrujSharedDataUrl(noteId, aktualniMediaId, source, noteKey);
    } else {
      record = cached?.record || null;
      finalOtisk = String(cached?.plainFingerprint || "");
    }

    if (!record) throw new Error("shared_media_plain_missing");

    await ulozRecordNaServer(noteId, aktualniMediaId, record, finalOtisk);
    return {
      mediaId: aktualniMediaId,
      record,
      uploaded: true,
      reused: Boolean(cached?.record),
      changed
    };
  }

  async function pripravSharedHtmlProCloud(html, noteId, noteKey) {
    const text = String(html || "");
    if (!/<img\b/i.test(text)) return { html: text, newCount: 0, reusedCount: 0, uploadedCount: 0, changedCount: 0 };

    const template = document.createElement("template");
    template.innerHTML = text;
    let newCount = 0;
    let reusedCount = 0;
    let uploadedCount = 0;
    let changedCount = 0;

    for (const img of template.content.querySelectorAll("img")) {
      const dataUrl = String(img.getAttribute("src") || "");
      const cloudRef = String(img.getAttribute(SHARED_MEDIA_REF) || "");
      let mediaId = jeUuid(cloudRef) ? cloudRef : ziskejEditorMediaId(img);

      if (!dataUrl.startsWith("data:image/")) {
        if (mediaId) {
          img.removeAttribute("src");
          img.removeAttribute("srcset");
          odeberEditorMediaMarker(img);
          img.setAttribute(SHARED_MEDIA_REF, mediaId);
        }
        continue;
      }

      const jeNova = !mediaId;
      if (!mediaId) mediaId = noveMediaId();

      const ensured = await zajistiMediaRecordNaServeru(noteId, mediaId, dataUrl, noteKey);
      mediaId = ensured.mediaId || mediaId;
      if (jeNova) newCount += 1;
      else reusedCount += 1;
      if (ensured.uploaded) uploadedCount += 1;
      if (ensured.changed) changedCount += 1;

      img.removeAttribute("src");
      img.removeAttribute("srcset");
      odeberEditorMediaMarker(img);
      img.setAttribute(SHARED_MEDIA_REF, mediaId);
    }

    return { html: template.innerHTML, newCount, reusedCount, uploadedCount, changedCount };
  }

  async function pripravSdilenouPoznamkuProCloud(note) {
    if (!note?.id) return note;

    const maObrazekNeboRef = [
      note.richContent,
      ...(Array.isArray(note.todos) ? note.todos.map((t) => t?.html) : [])
    ].some((h) => typeof h === "string" && /<img\b/i.test(h));
    const legacyItems = note?.[SHARED_MEDIA_VAULT]?.items;

    if (!maObrazekNeboRef && (!legacyItems || typeof legacyItems !== "object")) return note;

    const keyResult = await nactiNoteKeyProPoznamku(note.id);
    if (keyResult?.ok !== true || !(keyResult.noteKey instanceof Uint8Array)) {
      throw new Error(keyResult?.reason || "shared_note_key_unavailable");
    }

    /* Legacy 653D vault: při prvním uložení po 653G jej jednorázově
       externalizujeme. Potom už notes.data obsahuje jen malé reference. */
    let legacyUploaded = 0;
    if (legacyItems && typeof legacyItems === "object") {
      for (const [mediaId, legacyRecord] of Object.entries(legacyItems)) {
        if (!jeUuid(mediaId)) continue;
        const record = {
          version: Number(legacyRecord?.version),
          algorithm: String(legacyRecord?.algorithm || ""),
          mimeType: String(legacyRecord?.mimeType || ""),
          iv: String(legacyRecord?.iv || ""),
          ciphertext: String(legacyRecord?.ciphertext || ""),
          cipherBytes: odhadniBajtyBase64(legacyRecord?.ciphertext)
        };
        if (
          record.version !== SHARED_MEDIA_VERSION ||
          record.algorithm !== SHARED_MEDIA_ALGORITHM ||
          !record.mimeType.startsWith("image/") ||
          !record.iv ||
          !record.ciphertext
        ) continue;
        await ulozMediaCache(note.id, mediaId, record, false);
        await ulozRecordNaServer(note.id, mediaId, record);
        legacyUploaded += 1;
      }
    }

    const copy = klonujNote(note);
    let newCount = 0;
    let reusedCount = 0;
    let uploadedCount = legacyUploaded;
    let changedCount = 0;

    if (typeof copy.richContent === "string") {
      const result = await pripravSharedHtmlProCloud(copy.richContent, copy.id, keyResult.noteKey);
      copy.richContent = result.html;
      newCount += result.newCount;
      reusedCount += result.reusedCount;
      uploadedCount += result.uploadedCount;
      changedCount += result.changedCount || 0;
    }

    if (Array.isArray(copy.todos)) {
      for (const todo of copy.todos) {
        if (!todo || typeof todo.html !== "string") continue;
        const result = await pripravSharedHtmlProCloud(todo.html, copy.id, keyResult.noteKey);
        todo.html = result.html;
        newCount += result.newCount;
        reusedCount += result.reusedCount;
        uploadedCount += result.uploadedCount;
        changedCount += result.changedCount || 0;
      }
    }

    delete copy[SHARED_MEDIA_VAULT];
    if (newCount || reusedCount || uploadedCount || legacyUploaded) {
      diag(
        `SHARED-CRYPTO | MEDIA EXTERNALIZE | OK | note=${copy.id} | new=${newCount} | reused=${reusedCount} | changed=${changedCount} | uploaded=${uploadedCount} | legacy=${legacyUploaded}`
      );
    }
    return copy;
  }

  function ziskejMediaIdsZHtml(html) {
    const text = String(html || "");
    if (!text.includes(SHARED_MEDIA_REF)) return [];
    const template = document.createElement("template");
    template.innerHTML = text;
    const ids = [];
    for (const img of template.content.querySelectorAll(`img[${SHARED_MEDIA_REF}]`)) {
      const id = String(img.getAttribute(SHARED_MEDIA_REF) || "");
      if (jeUuid(id)) ids.push(id);
    }
    return ids;
  }

  function vlozSharedDataUrlDoHtml(html, mapa) {
    const text = String(html || "");
    if (!text.includes(SHARED_MEDIA_REF)) return text;
    const template = document.createElement("template");
    template.innerHTML = text;
    for (const img of template.content.querySelectorAll(`img[${SHARED_MEDIA_REF}]`)) {
      const id = String(img.getAttribute(SHARED_MEDIA_REF) || "");
      const dataUrl = mapa.get(id);
      if (!dataUrl) throw new Error("shared_media_missing");
      img.setAttribute("src", dataUrl);
      img.removeAttribute(SHARED_MEDIA_REF);
      nastavEditorMediaMarker(img, id);
    }
    return template.innerHTML;
  }

  async function desifrujSdilenouPoznamkuZCloudu(note) {
    if (!note?.id) return note;

    const ids = Array.from(new Set([
      ...ziskejMediaIdsZHtml(note.richContent),
      ...(Array.isArray(note.todos)
        ? note.todos.flatMap((todo) => ziskejMediaIdsZHtml(todo?.html))
        : [])
    ]));
    const legacyItems = note?.[SHARED_MEDIA_VAULT]?.items;

    if (ids.length === 0 && (!legacyItems || typeof legacyItems !== "object")) return note;

    const keyResult = await nactiNoteKeyProPoznamku(note.id);
    if (keyResult?.ok !== true || !(keyResult.noteKey instanceof Uint8Array)) {
      throw new Error(keyResult?.reason || "shared_note_key_unavailable");
    }

    const records = new Map();
    let legacyCount = 0;

    if (legacyItems && typeof legacyItems === "object") {
      for (const [mediaId, legacyRecord] of Object.entries(legacyItems)) {
        if (!jeUuid(mediaId)) continue;
        const record = {
          version: Number(legacyRecord?.version),
          algorithm: String(legacyRecord?.algorithm || ""),
          mimeType: String(legacyRecord?.mimeType || ""),
          iv: String(legacyRecord?.iv || ""),
          ciphertext: String(legacyRecord?.ciphertext || ""),
          cipherBytes: odhadniBajtyBase64(legacyRecord?.ciphertext)
        };
        if (
          record.version !== SHARED_MEDIA_VERSION ||
          record.algorithm !== SHARED_MEDIA_ALGORITHM ||
          !record.mimeType.startsWith("image/") ||
          !record.iv ||
          !record.ciphertext
        ) continue;
        records.set(mediaId, record);
        legacyCount += 1;
        await ulozMediaCache(note.id, mediaId, record, false);
      }
    }

    const chybejiciIds = ids.filter((id) => !records.has(id));
    const external = await nactiExternalniRecordy(note.id, chybejiciIds);
    for (const [mediaId, record] of external.mapa.entries()) records.set(mediaId, record);

    const mapa = new Map();
    for (const mediaId of ids) {
      const record = records.get(mediaId);
      if (!record) throw new Error("shared_media_missing");
      const dataUrl = await desifrujSharedRecord(note.id, mediaId, record, keyResult.noteKey);
      mapa.set(mediaId, dataUrl);

      const cached = await nactiMediaCache(note.id, mediaId);
      await ulozMediaCache(
        note.id,
        mediaId,
        record,
        cached?.serverStored === true,
        await otiskDataUrl(dataUrl)
      );
    }

    const copy = klonujNote(note);
    if (typeof copy.richContent === "string") copy.richContent = vlozSharedDataUrlDoHtml(copy.richContent, mapa);
    if (Array.isArray(copy.todos)) {
      for (const todo of copy.todos) {
        if (todo && typeof todo.html === "string") todo.html = vlozSharedDataUrlDoHtml(todo.html, mapa);
      }
    }
    delete copy[SHARED_MEDIA_VAULT];

    diag(
      `SHARED-CRYPTO | MEDIA DECRYPT | OK | note=${copy.id} | count=${mapa.size} | cache=${external.cacheCount} | cloud=${external.cloudCount} | legacy=${legacyCount} | cloudBytes=${external.cloudBytes}`
    );
    return copy;
  }

  window.LubaNoteSharedMediaCrypto = Object.freeze({
    verze: "SHARED-MEDIA-EGRESS-V2-653G",
    zajistiIdentitu,
    jeIdentitaPripravena,
    ziskejVerejnyKlic,
    ziskejSoukromyKlicProShared,
    vytvorNoteKey,
    zabalNoteKeyProUzivatele,
    rozbalNoteKey,
    nactiNoteKeyProPoznamku,
    zajistiObalkyProPoznamku,
    selfTestNoteKey,
    pripravSdilenouPoznamkuProCloud,
    desifrujSdilenouPoznamkuZCloudu
  });
})();
