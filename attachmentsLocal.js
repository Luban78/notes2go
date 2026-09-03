/* ==================================================
   LUBANOTE – LOKÁLNÍ PŘÍLOHY / INDEXEDDB – FÁZE A

   Bezpečná stínová vrstva pro budoucí attachments.

   DŮLEŽITÉ PRO FÁZI A:
   - současný WEBP Data URL v poznámce zůstává autoritou,
   - synchronizace, export/import ani zobrazení obrázků
     na IndexedDB zatím NEZÁVISÍ,
   - Secret obrázky se sem vůbec neukládají,
   - fronta uploadů je pouze připravena pro další fázi;
     nic se z ní zatím neposílá do cloudu.
================================================== */

(() => {
  const NAZEV_DB = "LubaNoteAttachments";
  const VERZE_DB = 1;
  const SKLAD_PRILOH = "prilohy";
  const SKLAD_FRONTY = "frontaPriloh";

  let slibDatabaze = null;

  function jeIndexedDbDostupne() {
    return typeof indexedDB !== "undefined";
  }

  function vytvorChybuDatabaze(zprava, udalost = null) {
    const puvodniChyba =
      udalost?.target?.error || null;

    const chyba = new Error(
      puvodniChyba?.message || zprava
    );

    if (puvodniChyba?.name) {
      chyba.name = puvodniChyba.name;
    }

    return chyba;
  }

  function nastavSchemaDatabaze(databaze) {
    if (!databaze.objectStoreNames.contains(SKLAD_PRILOH)) {
      const prilohy = databaze.createObjectStore(
        SKLAD_PRILOH,
        { keyPath: "id" }
      );

      prilohy.createIndex(
        "noteId",
        "noteId",
        { unique: false }
      );

      prilohy.createIndex(
        "lastAccessAt",
        "lastAccessAt",
        { unique: false }
      );
    }

    if (!databaze.objectStoreNames.contains(SKLAD_FRONTY)) {
      const fronta = databaze.createObjectStore(
        SKLAD_FRONTY,
        { keyPath: "id" }
      );

      fronta.createIndex(
        "attachmentId",
        "attachmentId",
        { unique: false }
      );

      fronta.createIndex(
        "stav",
        "stav",
        { unique: false }
      );
    }
  }

  function otevriDatabazi() {
    if (!jeIndexedDbDostupne()) {
      return Promise.reject(
        new Error("IndexedDB není v tomto zařízení dostupné.")
      );
    }

    if (slibDatabaze) {
      return slibDatabaze;
    }

    slibDatabaze = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        NAZEV_DB,
        VERZE_DB
      );

      request.onupgradeneeded = () => {
        nastavSchemaDatabaze(request.result);
      };

      request.onsuccess = () => {
        const databaze = request.result;

        databaze.onversionchange = () => {
          databaze.close();
          slibDatabaze = null;
        };

        resolve(databaze);
      };

      request.onerror = (udalost) => {
        slibDatabaze = null;
        reject(
          vytvorChybuDatabaze(
            "Lokální databázi příloh se nepodařilo otevřít.",
            udalost
          )
        );
      };

      request.onblocked = () => {
        console.warn(
          "LubaNote attachments: upgrade IndexedDB je blokovaný jinou otevřenou instancí."
        );
      };
    });

    return slibDatabaze;
  }

  function dataUrlNaBlob(dataUrl) {
    if (
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith("data:")
    ) {
      throw new Error("Příloha nemá platný Data URL formát.");
    }

    const oddelovac = dataUrl.indexOf(",");

    if (oddelovac < 0) {
      throw new Error("Příloha nemá platný Data URL obsah.");
    }

    const hlavicka = dataUrl.slice(5, oddelovac);
    const obsah = dataUrl.slice(oddelovac + 1);
    const castiHlavicky = hlavicka.split(";");
    const mimeType = castiHlavicky[0] ||
      "application/octet-stream";
    const jeBase64 = castiHlavicky.includes("base64");

    if (!jeBase64) {
      return new Blob(
        [decodeURIComponent(obsah)],
        { type: mimeType }
      );
    }

    const binarniText = atob(obsah);
    const bajty = new Uint8Array(binarniText.length);

    for (let i = 0; i < binarniText.length; i += 1) {
      bajty[i] = binarniText.charCodeAt(i);
    }

    return new Blob(
      [bajty],
      { type: mimeType }
    );
  }

  async function ulozZaznamDoSkladu(
    sklad,
    zaznam
  ) {
    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        sklad,
        "readwrite"
      );

      const request = transakce
        .objectStore(sklad)
        .put(zaznam);

      request.onerror = (udalost) => {
        console.warn(
          "LubaNote attachments: zápis do IndexedDB selhal.",
          udalost?.target?.error || udalost
        );
      };

      /*
       * Úspěch hlásíme až po skutečném dokončení transakce.
       * Request může být úspěšný o okamžik dřív, než je zápis commitnutý.
       */
      transakce.oncomplete = () => resolve(zaznam);

      transakce.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohu se nepodařilo uložit.",
          udalost
        )
      );

      transakce.onabort = (udalost) => reject(
        vytvorChybuDatabaze(
          "Uložení lokální přílohy bylo přerušeno.",
          udalost
        )
      );
    });
  }

  async function ulozStinovouPrilohuZDataUrl({
    id,
    dataUrl,
    noteId = null,
    fileName = ""
  } = {}) {
    if (!id) {
      throw new Error("Lokální příloha nemá ID.");
    }

    const blob = dataUrlNaBlob(dataUrl);
    const ted = new Date().toISOString();

    const zaznam = {
      id,
      noteId: noteId || null,
      blob,
      mimeType:
        blob.type || "application/octet-stream",
      sizeBytes: blob.size,
      fileName: fileName || "",
      createdAt: ted,
      lastAccessAt: ted,
      faze: "shadow_v1"
    };

    await ulozZaznamDoSkladu(
      SKLAD_PRILOH,
      zaznam
    );

    return {
      id: zaznam.id,
      noteId: zaznam.noteId,
      mimeType: zaznam.mimeType,
      sizeBytes: zaznam.sizeBytes,
      createdAt: zaznam.createdAt
    };
  }

  async function nactiPrilohu(id) {
    if (!id) {
      return null;
    }

    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        SKLAD_PRILOH,
        "readonly"
      );
      const request = transakce
        .objectStore(SKLAD_PRILOH)
        .get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohu se nepodařilo načíst.",
          udalost
        )
      );
    });
  }

  async function smazPrilohu(id) {
    if (!id) {
      return false;
    }

    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        SKLAD_PRILOH,
        "readwrite"
      );

      transakce.objectStore(SKLAD_PRILOH)
        .delete(id);

      transakce.oncomplete = () => resolve(true);
      transakce.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohu se nepodařilo odstranit.",
          udalost
        )
      );
      transakce.onabort = (udalost) => reject(
        vytvorChybuDatabaze(
          "Odstranění lokální přílohy bylo přerušeno.",
          udalost
        )
      );
    });
  }

  async function spocitejPrilohy() {
    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        SKLAD_PRILOH,
        "readonly"
      );
      const request = transakce
        .objectStore(SKLAD_PRILOH)
        .count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohy se nepodařilo spočítat.",
          udalost
        )
      );
    });
  }

  async function ziskejDiagnostiku() {
    try {
      const pocetPriloh = await spocitejPrilohy();

      return {
        dostupne: true,
        databaze: NAZEV_DB,
        verze: VERZE_DB,
        pocetPriloh,
        frontaUploaduAktivni: false
      };
    } catch (error) {
      return {
        dostupne: false,
        databaze: NAZEV_DB,
        verze: VERZE_DB,
        pocetPriloh: 0,
        frontaUploaduAktivni: false,
        chyba: error?.message || String(error)
      };
    }
  }

  window.LubaNoteAttachmentsLocal = {
    jeDostupne: jeIndexedDbDostupne,
    ulozStinovouPrilohuZDataUrl,
    nactiPrilohu,
    smazPrilohu,
    spocitejPrilohy,
    ziskejDiagnostiku
  };
})();
