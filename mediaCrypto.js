/* ==================================================
   LUBANOTE – E2E ŠIFROVÁNÍ BĚŽNÝCH FOTOGRAFIÍ
   PATCH 551

   CÍL:
   - běžná fotografie NESMÍ odejít do Supabase jako plaintext Data URL,
   - stejné hlavní heslo jako Secret odvozuje oddělený AES-GCM media klíč,
   - lokální poznámka zůstává beze změny a dál obsahuje renderovatelný
     Data URL zdroj; šifrování/dešifrování probíhá pouze na hranici cloudu,
   - media klíč je na zařízení uložen jako non-extractable CryptoKey v
     IndexedDB; na novém zařízení stačí jednou odemknout Secret heslem,
   - pokud media klíč není dostupný, cloudový zápis/čtení s chráněnými
     fotografiemi se raději odloží, než aby vznikl plaintext fallback.

   POZOR:
   - Shared poznámky nepoužívají osobní Secret klíč vlastníka. Nové
     fotografie v shared editoru proto do dokončení shared E2E médií
     záměrně blokujeme v editorMediaV2.js.
================================================== */
(() => {
  "use strict";

  const VERZE = 1;
  const POLE_TREZORU = "__lubanoteMediaVault";
  const KLIC_MIGRACE = "lubanoteMediaProtectedIdsV1";
  const ATRIBUT_REFERENCE = "data-lubanote-media-ref";
  const PREFIX_AAD = "LubaNote-media-v1";
  const LIMIT_OZNAMENI_MS = 30000;
  const MEDIA_DB = "LubaNoteMediaCrypto";
  const MEDIA_DB_VERZE = 1;
  const MEDIA_STORE = "keys";
  const MEDIA_KDF_PREFIX = "LubaNote-media-encryption-v1";

  let posledniOznameni = 0;
  let mediaSifrovaciKlic = null;
  let mediaKlicKontext = null;
  let otevrenaMediaDbPromise = null;
  let pripravaMediaKlicePromise = null;

  function ziskejTajneNastaveniProMedia() {
    try {
      if (typeof nactiLokalniTajneNastaveni === "function") {
        const nastaveni = nactiLokalniTajneNastaveni();
        const aktualniOwner = String(
          localStorage.getItem("lubanoteLocalOwnerUserId") || ""
        );
        const ownerNastaveni = String(
          nastaveni?.userId || nastaveni?.user_id || ""
        );

        /* Na sdíleném zařízení nesmí media key předchozího účtu nikdy
           posloužit novému přihlášení. Jakmile známe obě identity a liší
           se, kontext považujeme za nedostupný. */
        if (
          aktualniOwner &&
          ownerNastaveni &&
          aktualniOwner !== ownerNastaveni
        ) {
          return null;
        }

        return nastaveni;
      }
    } catch (_error) {}

    return null;
  }

  function vytvorMediaKeyId(nastaveni) {
    if (!nastaveni?.salt) return "";
    const vlastnik = String(
      nastaveni.userId ||
      nastaveni.user_id ||
      nastaveni.salt
    );
    return `media-v1:${vlastnik}`;
  }

  function stejnyMediaKontext(a, b) {
    return Boolean(
      a?.salt &&
      b?.salt &&
      a.salt === b.salt &&
      Number(a.kdf_iterations) === Number(b.kdf_iterations)
    );
  }

  function jeKlicDostupny() {
    const aktualni = ziskejTajneNastaveniProMedia();

    if (!mediaSifrovaciKlic || !stejnyMediaKontext(mediaKlicKontext, aktualni)) {
      if (mediaSifrovaciKlic && aktualni && !stejnyMediaKontext(mediaKlicKontext, aktualni)) {
        mediaSifrovaciKlic = null;
        mediaKlicKontext = null;
      }
      return false;
    }

    return true;
  }

  function otevriMediaDb() {
    if (!globalThis.indexedDB) {
      return Promise.reject(new Error("IndexedDB pro media klíč není dostupná."));
    }

    if (otevrenaMediaDbPromise) return otevrenaMediaDbPromise;

    otevrenaMediaDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DB, MEDIA_DB_VERZE);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        otevrenaMediaDbPromise = null;
        reject(request.error || new Error("Media key DB se nepodařilo otevřít."));
      };
    });

    return otevrenaMediaDbPromise;
  }

  async function ulozMediaKlicDoZarizeni(klic, nastaveni) {
    const id = vytvorMediaKeyId(nastaveni);
    if (!id || !klic) return false;

    const db = await otevriMediaDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readwrite");
      tx.objectStore(MEDIA_STORE).put({
        id,
        key: klic,
        salt: nastaveni.salt,
        kdf_iterations: Number(nastaveni.kdf_iterations),
        savedAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Media key se nepodařilo uložit."));
      tx.onabort = () => reject(tx.error || new Error("Uložení media key bylo přerušeno."));
    });

    return true;
  }

  async function nactiMediaKlicZeZarizeni() {
    const nastaveni = ziskejTajneNastaveniProMedia();
    const id = vytvorMediaKeyId(nastaveni);

    if (!id) return false;

    const db = await otevriMediaDb();
    const zaznam = await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readonly");
      const request = tx.objectStore(MEDIA_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Media key se nepodařilo načíst."));
    });

    if (
      !zaznam?.key ||
      zaznam.salt !== nastaveni.salt ||
      Number(zaznam.kdf_iterations) !== Number(nastaveni.kdf_iterations)
    ) {
      return false;
    }

    mediaSifrovaciKlic = zaznam.key;
    mediaKlicKontext = {
      salt: nastaveni.salt,
      kdf_iterations: Number(nastaveni.kdf_iterations)
    };

    return true;
  }

  async function opravLokalniSifrovanaMediaPoZiskaniKlice() {
    if (!jeKlicDostupny()) return { opraveno: 0, chyby: 0 };

    /*
     * PATCH 558 – LOCAL MEDIA REHYDRATE.
     * -----------------------------------
     * Zařízení, které během přechodu 551–555 uložilo cloudovou podobu
     * poznámky přímo do lokální cache, může mít <img data-lubanote-media-ref>
     * bez src + __lubanoteMediaVault. Core V2 takovou poznámku správně
     * odmítne jako „obrázek bez zdroje“.
     *
     * Jakmile je na zařízení dostupný správný media klíč, opravíme POUZE
     * lokální cache: ciphertext lokálně dešifrujeme zpět na Data URL,
     * odstraníme vault a uložíme přes přímý storage zápis.
     *
     * DŮLEŽITÉ: tento repair NESMÍ vytvořit uživatelskou změnu, zvýšit
     * revision ani zařadit TARGET upload. Cloud zůstává beze změny.
     */
    try {
      if (window.LubaNoteRegularNotesStore?.priprav) {
        await window.LubaNoteRegularNotesStore.priprav();
      }

      if (
        typeof nactiBeznePoznamkyZUloziste !== "function" ||
        typeof ulozBeznePoznamkyPrimo !== "function"
      ) {
        return { opraveno: 0, chyby: 0 };
      }

      const puvodni = nactiBeznePoznamkyZUloziste();
      if (!Array.isArray(puvodni) || puvodni.length === 0) {
        return { opraveno: 0, chyby: 0 };
      }

      let opraveno = 0;
      let chyby = 0;
      const vysledek = [];

      for (const note of puvodni) {
        if (!maTrezor(note)) {
          vysledek.push(note);
          continue;
        }

        try {
          vysledek.push(await desifrujPoznamkuZCloudu(note));
          opraveno += 1;
        } catch (error) {
          chyby += 1;
          vysledek.push(note);
          console.warn(
            `LubaNote media E2E: lokální rehydrate selhal pro ${note?.id || "unknown"}.`,
            error
          );
        }
      }

      if (opraveno > 0) {
        await ulozBeznePoznamkyPrimo(vysledek);

        window.LubaNoteStartupDiag?.zapis?.(
          "MEDIA",
          `LOCAL REHYDRATE | repaired=${opraveno} errors=${chyby}`
        );

        if (typeof renderTasks === "function") {
          renderTasks();
        }
        if (typeof renderRemindersScreen === "function") {
          renderRemindersScreen();
        }
      }

      return { opraveno, chyby };
    } catch (error) {
      console.warn(
        "LubaNote media E2E: lokální repair šifrovaných fotografií se nepodařil.",
        error
      );
      return { opraveno: 0, chyby: 1 };
    }
  }

  async function pripravMediaKlicZeZarizeni() {
    if (jeKlicDostupny()) {
      await opravLokalniSifrovanaMediaPoZiskaniKlice();
      return true;
    }
    if (pripravaMediaKlicePromise) return pripravaMediaKlicePromise;

    pripravaMediaKlicePromise = nactiMediaKlicZeZarizeni()
      .then(async (ok) => {
        if (ok === true) {
          await opravLokalniSifrovanaMediaPoZiskaniKlice();
        }
        return ok;
      })
      .catch((error) => {
        console.warn("LubaNote media E2E: device media key zatím není dostupný.", error);
        return false;
      })
      .finally(() => {
        pripravaMediaKlicePromise = null;
      });

    return pripravaMediaKlicePromise;
  }

  async function odvodMediaKlicZHesla(heslo, nastaveni) {
    if (!heslo || !nastaveni?.salt || !Number(nastaveni.kdf_iterations)) {
      throw new Error("Pro media klíč chybí heslo nebo Secret nastavení.");
    }

    const encoder = new TextEncoder();
    const puvodniSalt = Uint8Array.from(
      atob(nastaveni.salt),
      (char) => char.charCodeAt(0)
    );
    const prefix = encoder.encode(MEDIA_KDF_PREFIX);
    const salt = new Uint8Array(prefix.length + puvodniSalt.length);
    salt.set(prefix, 0);
    salt.set(puvodniSalt, prefix.length);

    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(heslo),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: Number(nastaveni.kdf_iterations),
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function nastavKlicZHesla(heslo, nastaveni = null) {
    const kontext = nastaveni || ziskejTajneNastaveniProMedia();
    const klic = await odvodMediaKlicZHesla(heslo, kontext);

    mediaSifrovaciKlic = klic;
    mediaKlicKontext = {
      salt: kontext.salt,
      kdf_iterations: Number(kontext.kdf_iterations)
    };

    try {
      await ulozMediaKlicDoZarizeni(klic, kontext);
    } catch (error) {
      /* Device cache je UX optimalizace. Pokud uložení selže, media jsou
         pořád bezpečná; na tomto zařízení se jen bude muset heslo zadat
         znovu po příštím startu. */
      console.warn("LubaNote media E2E: non-extractable device key se nepodařilo uložit.", error);
    }

    /* PATCH 558 – po ručním Secret unlocku okamžitě opravíme případné
       lokální cloudové media-vault kopie z přechodného období 551–555. */
    await opravLokalniSifrovanaMediaPoZiskaniKlice();

    return true;
  }

  function maTrezor(note) {
    const trezor = note?.[POLE_TREZORU];
    return Boolean(
      trezor &&
      Number(trezor.version) === VERZE &&
      trezor.algorithm === "AES-GCM" &&
      trezor.items &&
      typeof trezor.items === "object"
    );
  }

  function htmlObsahujeDataObrazek(html) {
    return typeof html === "string" &&
      /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html);
  }

  function maPlaintextFotografie(note) {
    if (!note || note.isSecret === true) return false;

    if (htmlObsahujeDataObrazek(note.richContent)) {
      return true;
    }

    for (const todo of Array.isArray(note.todos) ? note.todos : []) {
      if (htmlObsahujeDataObrazek(todo?.html)) {
        return true;
      }
    }

    return false;
  }

  function prevedBajtyNaBase64(bajty) {
    const pole = bajty instanceof Uint8Array
      ? bajty
      : new Uint8Array(bajty || 0);
    let binarni = "";
    const velikost = 0x8000;

    for (let start = 0; start < pole.length; start += velikost) {
      const cast = pole.subarray(
        start,
        Math.min(start + velikost, pole.length)
      );
      binarni += String.fromCharCode(...cast);
    }

    return btoa(binarni);
  }

  function prevedBase64NaBajty(base64) {
    const binarni = atob(String(base64 || ""));
    const vysledek = new Uint8Array(binarni.length);

    for (let i = 0; i < binarni.length; i += 1) {
      vysledek[i] = binarni.charCodeAt(i);
    }

    return vysledek;
  }

  function dataUrlNaBajty(dataUrl) {
    const text = String(dataUrl || "");
    const oddelovac = text.indexOf(",");

    if (!text.startsWith("data:image/") || oddelovac < 0) {
      throw new Error("Fotografie nemá platný Data URL formát.");
    }

    const hlavicka = text.slice(5, oddelovac);
    const obsah = text.slice(oddelovac + 1);
    const casti = hlavicka.split(";");
    const mimeType = String(casti[0] || "image/jpeg").toLowerCase();
    const jeBase64 = casti.includes("base64");

    if (!mimeType.startsWith("image/")) {
      throw new Error("Šifrované médium není obrázek.");
    }

    if (jeBase64) {
      return {
        mimeType,
        bytes: prevedBase64NaBajty(obsah)
      };
    }

    return {
      mimeType,
      bytes: new TextEncoder().encode(decodeURIComponent(obsah))
    };
  }

  function bajtyNaDataUrl(mimeType, bytes) {
    return `data:${mimeType || "image/jpeg"};base64,${prevedBajtyNaBase64(bytes)}`;
  }

  function vytvorAad(noteId, mediaId, mimeType) {
    return new TextEncoder().encode(
      `${PREFIX_AAD}:${String(noteId)}:${String(mediaId)}:${String(mimeType)}`
    );
  }

  async function zasifrujDataUrl(dataUrl, noteId, mediaId) {
    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      const error = new Error("Pro šifrování fotografie chybí media klíč odvozený z hlavního Secret hesla.");
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    const { mimeType, bytes } = dataUrlNaBajty(dataUrl);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: vytvorAad(noteId, mediaId, mimeType)
      },
      mediaSifrovaciKlic,
      bytes
    );

    return {
      version: VERZE,
      algorithm: "AES-GCM",
      mimeType,
      iv: prevedBajtyNaBase64(iv),
      ciphertext: prevedBajtyNaBase64(new Uint8Array(ciphertext))
    };
  }

  async function zabalBajtyHlavnimKlicem(bajty, kontext) {
    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      const error = new Error(
        "Pro ochranu sdílené identity chybí klíč odvozený z hlavního hesla."
      );
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    const data = bajty instanceof Uint8Array
      ? bajty
      : new Uint8Array(bajty || []);
    const aad = new TextEncoder().encode(
      `LubaNote-shared-wrap-v1:${String(kontext || "")}`
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad
      },
      mediaSifrovaciKlic,
      data
    );

    return {
      version: 1,
      algorithm: "AES-GCM",
      iv: prevedBajtyNaBase64(iv),
      ciphertext: prevedBajtyNaBase64(new Uint8Array(ciphertext))
    };
  }

  async function rozbalBajtyHlavnimKlicem(record, kontext) {
    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      const error = new Error(
        "Pro odemknutí sdílené identity chybí klíč odvozený z hlavního hesla."
      );
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    if (
      !record ||
      Number(record.version) !== 1 ||
      record.algorithm !== "AES-GCM" ||
      !record.iv ||
      !record.ciphertext
    ) {
      const error = new Error("Zašifrovaná sdílená identita má neplatný formát.");
      error.code = "LUBANOTE_SHARED_IDENTITY_INVALID";
      throw error;
    }

    const aad = new TextEncoder().encode(
      `LubaNote-shared-wrap-v1:${String(kontext || "")}`
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: prevedBase64NaBajty(record.iv),
        additionalData: aad
      },
      mediaSifrovaciKlic,
      prevedBase64NaBajty(record.ciphertext)
    );

    return new Uint8Array(plaintext);
  }

  async function desifrujDataUrl(record, noteId, mediaId) {
    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      const error = new Error("Pro dešifrování fotografie chybí media klíč odvozený z hlavního Secret hesla.");
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    if (
      !record ||
      Number(record.version) !== VERZE ||
      record.algorithm !== "AES-GCM" ||
      !record.mimeType ||
      !record.iv ||
      !record.ciphertext
    ) {
      const error = new Error("Šifrovaná fotografie má neplatný formát.");
      error.code = "LUBANOTE_MEDIA_INVALID";
      throw error;
    }

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: prevedBase64NaBajty(record.iv),
        additionalData: vytvorAad(noteId, mediaId, record.mimeType)
      },
      mediaSifrovaciKlic,
      prevedBase64NaBajty(record.ciphertext)
    );

    return bajtyNaDataUrl(
      record.mimeType,
      new Uint8Array(decrypted)
    );
  }

  function klonuj(hodnota) {
    if (typeof structuredClone === "function") {
      return structuredClone(hodnota);
    }

    return JSON.parse(JSON.stringify(hodnota));
  }

  function noveMediaId() {
    return crypto.randomUUID?.() ||
      `media-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function ziskejAttachmentId(img) {
    const figure = img?.closest?.("[data-attachment-id]");
    return String(
      figure?.getAttribute?.("data-attachment-id") ||
      img?.getAttribute?.("data-attachment-id") ||
      ""
    ).trim();
  }

  function odstranAttachmentReference(img) {
    img?.removeAttribute?.("data-attachment-id");
    img?.closest?.("[data-attachment-id]")
      ?.removeAttribute?.("data-attachment-id");
  }

  async function zasifrujHtmlObrazky(
    html,
    noteId,
    items,
    mediaIdPodleDataUrl,
    dataUrlPodleMediaId
  ) {
    if (!htmlObsahujeDataObrazek(html)) {
      return String(html || "");
    }

    const template = document.createElement("template");
    template.innerHTML = String(html || "");

    const obrazky = Array.from(
      template.content.querySelectorAll("img[src^='data:image/']")
    );

    for (const img of obrazky) {
      const dataUrl = String(img.getAttribute("src") || "");
      if (!dataUrl.startsWith("data:image/")) continue;

      let mediaId = mediaIdPodleDataUrl.get(dataUrl) || "";

      if (!mediaId) {
        const attachmentId = ziskejAttachmentId(img);
        mediaId = attachmentId || noveMediaId();

        /* Obrázek po crop/replace může výjimečně nést historické
           attachment ID jiného obsahu. Jedno media ID ale smí patřit
           právě jednomu plaintextu; při kolizi vytvoříme nové ID. */
        const driveDataUrl = dataUrlPodleMediaId.get(mediaId);
        if (driveDataUrl && driveDataUrl !== dataUrl) {
          mediaId = noveMediaId();
        }

        mediaIdPodleDataUrl.set(dataUrl, mediaId);
        dataUrlPodleMediaId.set(mediaId, dataUrl);
      }

      if (!items[mediaId]) {
        items[mediaId] = await zasifrujDataUrl(
          dataUrl,
          noteId,
          mediaId
        );
      }

      img.removeAttribute("src");
      img.removeAttribute("srcset");
      img.setAttribute(ATRIBUT_REFERENCE, mediaId);
      odstranAttachmentReference(img);
    }

    return template.innerHTML;
  }

  function vlozDataUrlDoHtml(html, dataUrlPodleId) {
    const text = String(html || "");
    if (!text.includes(ATRIBUT_REFERENCE)) {
      return text;
    }

    const template = document.createElement("template");
    template.innerHTML = text;

    for (const img of template.content.querySelectorAll(`img[${ATRIBUT_REFERENCE}]`)) {
      const mediaId = String(img.getAttribute(ATRIBUT_REFERENCE) || "");
      const dataUrl = dataUrlPodleId.get(mediaId);

      if (!dataUrl) {
        const error = new Error(`Šifrovaná fotografie ${mediaId || "?"} chybí.`);
        error.code = "LUBANOTE_MEDIA_MISSING";
        throw error;
      }

      img.setAttribute("src", dataUrl);
      img.removeAttribute(ATRIBUT_REFERENCE);
    }

    return template.innerHTML;
  }

  async function pripravPoznamkuProCloud(note) {
    if (!note?.id || note.isSecret === true) {
      return note;
    }

    if (!maPlaintextFotografie(note)) {
      return note;
    }

    if (!jeKlicDostupny()) {
      const error = new Error("Fotografie nelze odeslat bez odemčeného Secret klíče.");
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    const kopie = klonuj(note);
    const items = {};
    const mediaIdPodleDataUrl = new Map();
    const dataUrlPodleMediaId = new Map();

    if (typeof kopie.richContent === "string") {
      kopie.richContent = await zasifrujHtmlObrazky(
        kopie.richContent,
        kopie.id,
        items,
        mediaIdPodleDataUrl,
        dataUrlPodleMediaId
      );
    }

    if (Array.isArray(kopie.todos)) {
      for (const todo of kopie.todos) {
        if (
          !todo ||
          typeof todo !== "object" ||
          typeof todo.html !== "string"
        ) {
          continue;
        }

        todo.html = await zasifrujHtmlObrazky(
          todo.html,
          kopie.id,
          items,
          mediaIdPodleDataUrl,
          dataUrlPodleMediaId
        );
      }
    }

    if (Object.keys(items).length === 0) {
      return note;
    }

    kopie[POLE_TREZORU] = {
      version: VERZE,
      algorithm: "AES-GCM",
      items
    };

    return kopie;
  }

  async function desifrujPoznamkuZCloudu(note) {
    if (!maTrezor(note)) {
      return note;
    }

    if (!jeKlicDostupny()) {
      const error = new Error("Cloud obsahuje šifrované fotografie a Secret je zamčený.");
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    const kopie = klonuj(note);
    const trezor = kopie[POLE_TREZORU];
    const dataUrlPodleId = new Map();

    for (const [mediaId, record] of Object.entries(trezor.items || {})) {
      dataUrlPodleId.set(
        mediaId,
        await desifrujDataUrl(record, kopie.id, mediaId)
      );
    }

    if (typeof kopie.richContent === "string") {
      kopie.richContent = vlozDataUrlDoHtml(
        kopie.richContent,
        dataUrlPodleId
      );
    }

    if (Array.isArray(kopie.todos)) {
      for (const todo of kopie.todos) {
        if (
          !todo ||
          typeof todo !== "object" ||
          typeof todo.html !== "string"
        ) {
          continue;
        }

        todo.html = vlozDataUrlDoHtml(
          todo.html,
          dataUrlPodleId
        );
      }
    }

    delete kopie[POLE_TREZORU];
    oznacMigrovano(kopie.id);
    return kopie;
  }

  async function pripravCloudRadkyProLokalniPouziti(rows) {
    const seznam = Array.isArray(rows) ? rows : [];
    const obsahujeChranenaMedia = seznam.some(
      (row) => row?.data && maTrezor(row.data)
    );

    if (!obsahujeChranenaMedia) {
      return seznam;
    }

    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      oznamNutneOdemceni(false);
      const error = new Error(
        "Synchronizace šifrovaných fotografií čeká na jednorázové odemčení Secret na tomto zařízení."
      );
      error.code = "LUBANOTE_MEDIA_KEY_LOCKED";
      throw error;
    }

    const vysledek = [];

    for (const row of seznam) {
      if (!row?.data || !maTrezor(row.data)) {
        vysledek.push(row);
        continue;
      }

      vysledek.push({
        ...row,
        data: await desifrujPoznamkuZCloudu({
          ...row.data,
          id: row.id
        })
      });
    }

    return vysledek;
  }

  function nactiMigrovaneId() {
    try {
      const raw = localStorage.getItem(KLIC_MIGRACE);
      const pole = raw ? JSON.parse(raw) : [];
      return new Set(
        Array.isArray(pole)
          ? pole.filter(Boolean).map(String)
          : []
      );
    } catch (_error) {
      return new Set();
    }
  }

  function ulozMigrovaneId(set) {
    try {
      localStorage.setItem(
        KLIC_MIGRACE,
        JSON.stringify(Array.from(set).slice(-5000))
      );
    } catch (_error) {
      // Marker je jen optimalizace. Šifrování na něm bezpečnostně nestojí.
    }
  }

  function oznacMigrovano(noteId) {
    if (!noteId) return;
    const set = nactiMigrovaneId();
    set.add(String(noteId));
    ulozMigrovaneId(set);
  }

  function jeMigrovano(noteId) {
    return Boolean(noteId && nactiMigrovaneId().has(String(noteId)));
  }

  function jeSdilenaPoznamka(noteId) {
    if (!noteId) return false;

    try {
      return window.LubaNoteSharingNotes
        ?.jeSdilenaPoznamka?.(noteId) === true;
    } catch (_error) {
      return false;
    }
  }

  async function zaradMigraciExistujicichFotografii() {
    if (!jeKlicDostupny()) {
      await pripravMediaKlicZeZarizeni();
    }

    if (!jeKlicDostupny()) {
      return { ok: false, reason: "key_locked", queued: 0 };
    }

    if (
      typeof loadTask !== "function" ||
      typeof window.LubaNoteSync?.zaradCilenouPrivatePoznamku !== "function"
    ) {
      return { ok: false, reason: "sync_unavailable", queued: 0 };
    }

    const notes = loadTask();
    let queued = 0;
    let sharedSkipped = 0;

    for (const note of Array.isArray(notes) ? notes : []) {
      if (
        !note?.id ||
        note.isSecret === true ||
        !maPlaintextFotografie(note) ||
        jeMigrovano(note.id)
      ) {
        continue;
      }

      if (jeSdilenaPoznamka(note.id)) {
        sharedSkipped += 1;
        continue;
      }

      if (window.LubaNoteSync.zaradCilenouPrivatePoznamku(note) === true) {
        queued += 1;
      }
    }

    if (queued > 0) {
      console.info(
        `LubaNote media E2E: do migrace bylo zařazeno ${queued} poznámek s fotografiemi.`
      );
    }

    if (sharedSkipped > 0) {
      console.warn(
        `LubaNote media E2E: ${sharedSkipped} sdílených poznámek bylo přeskočeno; shared media potřebují samostatný sdílený E2E klíč.`
      );
    }

    return {
      ok: true,
      queued,
      sharedSkipped
    };
  }

  function oznamNutneOdemceni(otevritModal = false) {
    const ted = Date.now();

    if (ted - posledniOznameni > LIMIT_OZNAMENI_MS) {
      posledniOznameni = ted;
      window.zobrazZpravuAplikace?.(
        "Šifrované fotografie",
        "Fotografie používají stejné hlavní heslo jako Secret. Na tomto zařízení Secret jednou odemkni a potom akci zopakuj."
      );
    }

    if (
      otevritModal &&
      typeof otevriTajneStitky === "function"
    ) {
      Promise.resolve(otevriTajneStitky()).catch((error) => {
        console.warn(
          "Otevření Secret odemknutí pro fotografie se nepodařilo:",
          error
        );
      });
    }
  }

  window.LubaNoteMediaCrypto = Object.freeze({
    verze: "MEDIA-E2E-558-LOCAL-REHYDRATE",
    jeKlicDostupny,
    pripravMediaKlicZeZarizeni,
    nastavKlicZHesla,
    maPlaintextFotografie,
    maSifrovanaMedia: maTrezor,
    pripravPoznamkuProCloud,
    desifrujPoznamkuZCloudu,
    pripravCloudRadkyProLokalniPouziti,
    zaradMigraciExistujicichFotografii,
    oznacMigrovano,
    jeMigrovano,
    oznamNutneOdemceni,
    zabalBajtyHlavnimKlicem,
    rozbalBajtyHlavnimKlicem,
    nazevPoleTrezoru: POLE_TREZORU
  });

  /* Device-only non-extractable media key načítáme hned při startu.
     Pokud na tomto zařízení ještě nebyl vytvořen, nic se neděje; první
     úspěšné Secret odemknutí jej odvodí ze stejného hlavního hesla. */
  void pripravMediaKlicZeZarizeni();
})();
