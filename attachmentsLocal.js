/* ==================================================
   LUBANOTE – LOKÁLNÍ PŘÍLOHY / INDEXEDDB – FÁZE B

   FÁZE B = cloudová STÍNOVÁ vrstva.

   DŮLEŽITÉ:
   - Data URL v poznámce zůstává autoritou a kompatibilní zálohou,
   - nový normální obrázek se navíc ukládá jako Blob do IndexedDB,
   - trvalá fronta si pamatuje čekající cloudový upload,
   - Secret obrázky se sem v plaintextu vůbec neukládají,
   - sync poznámky zatím na Storage NENÍ existenčně závislý.
================================================== */

(() => {
  const NAZEV_DB = "LubaNoteAttachments";
  const VERZE_DB = 2;
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

  function nastavSchemaDatabaze(databaze, transakce = null) {
    let prilohy;

    if (!databaze.objectStoreNames.contains(SKLAD_PRILOH)) {
      prilohy = databaze.createObjectStore(
        SKLAD_PRILOH,
        { keyPath: "id" }
      );
    } else if (transakce) {
      prilohy = transakce.objectStore(SKLAD_PRILOH);
    }

    if (prilohy) {
      if (!prilohy.indexNames.contains("noteId")) {
        prilohy.createIndex(
          "noteId",
          "noteId",
          { unique: false }
        );
      }

      if (!prilohy.indexNames.contains("lastAccessAt")) {
        prilohy.createIndex(
          "lastAccessAt",
          "lastAccessAt",
          { unique: false }
        );
      }

      if (!prilohy.indexNames.contains("cloudState")) {
        prilohy.createIndex(
          "cloudState",
          "cloudState",
          { unique: false }
        );
      }
    }

    let fronta;

    if (!databaze.objectStoreNames.contains(SKLAD_FRONTY)) {
      fronta = databaze.createObjectStore(
        SKLAD_FRONTY,
        { keyPath: "id" }
      );
    } else if (transakce) {
      fronta = transakce.objectStore(SKLAD_FRONTY);
    }

    if (fronta) {
      if (!fronta.indexNames.contains("attachmentId")) {
        fronta.createIndex(
          "attachmentId",
          "attachmentId",
          { unique: false }
        );
      }

      if (!fronta.indexNames.contains("stav")) {
        fronta.createIndex(
          "stav",
          "stav",
          { unique: false }
        );
      }
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
        nastavSchemaDatabaze(
          request.result,
          request.transaction
        );
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

  async function provedTransakci(
    sklad,
    rezim,
    akce,
    chybaText
  ) {
    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        sklad,
        rezim
      );
      const objectStore = transakce.objectStore(sklad);
      let vysledek;

      try {
        vysledek = akce(objectStore, transakce);
      } catch (error) {
        try {
          transakce.abort();
        } catch {
          // Nic dalšího není třeba dělat.
        }
        reject(error);
        return;
      }

      transakce.oncomplete = () => resolve(vysledek);
      transakce.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          chybaText,
          udalost
        )
      );
      transakce.onabort = (udalost) => reject(
        vytvorChybuDatabaze(
          chybaText,
          udalost
        )
      );
    });
  }

  async function ulozZaznamDoSkladu(sklad, zaznam) {
    return provedTransakci(
      sklad,
      "readwrite",
      (objectStore) => {
        objectStore.put(zaznam);
        return zaznam;
      },
      "Lokální přílohu se nepodařilo uložit."
    );
  }

  async function nactiZaznamZeSkladu(sklad, id) {
    if (!id) {
      return null;
    }

    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        sklad,
        "readonly"
      );
      const request = transakce
        .objectStore(sklad)
        .get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální záznam přílohy se nepodařilo načíst.",
          udalost
        )
      );
    });
  }

  async function smazZaznamZeSkladu(sklad, id) {
    if (!id) {
      return false;
    }

    await provedTransakci(
      sklad,
      "readwrite",
      (objectStore) => {
        objectStore.delete(id);
        return true;
      },
      "Lokální záznam přílohy se nepodařilo odstranit."
    );

    return true;
  }

  async function upravPrilohu(id, zmeny = {}) {
    const puvodni = await nactiZaznamZeSkladu(
      SKLAD_PRILOH,
      id
    );

    if (!puvodni) {
      return null;
    }

    const novy = {
      ...puvodni,
      ...(zmeny && typeof zmeny === "object" ? zmeny : {}),
      id: puvodni.id
    };

    await ulozZaznamDoSkladu(
      SKLAD_PRILOH,
      novy
    );

    return novy;
  }

  async function zaradUpload({
    attachmentId,
    noteId = null
  } = {}) {
    if (!attachmentId) {
      throw new Error("Fronta příloh nemá attachmentId.");
    }

    const ted = new Date().toISOString();
    const id = `upload:${attachmentId}`;
    const puvodni = await nactiZaznamZeSkladu(
      SKLAD_FRONTY,
      id
    );

    const zaznam = {
      id,
      attachmentId,
      noteId: noteId || puvodni?.noteId || null,
      akce: "upload",
      stav: puvodni?.stav === "uploaded"
        ? "uploaded"
        : "pending_upload",
      pocetPokusu: Number(puvodni?.pocetPokusu) || 0,
      posledniChyba: puvodni?.posledniChyba || "",
      createdAt: puvodni?.createdAt || ted,
      updatedAt: ted
    };

    await ulozZaznamDoSkladu(
      SKLAD_FRONTY,
      zaznam
    );

    return zaznam;
  }

  async function aktualizujUpload(
    attachmentId,
    zmeny = {}
  ) {
    if (!attachmentId) {
      return null;
    }

    const id = `upload:${attachmentId}`;
    const puvodni = await nactiZaznamZeSkladu(
      SKLAD_FRONTY,
      id
    );

    if (!puvodni) {
      return null;
    }

    const zaznam = {
      ...puvodni,
      ...(zmeny && typeof zmeny === "object" ? zmeny : {}),
      id,
      attachmentId,
      updatedAt: new Date().toISOString()
    };

    await ulozZaznamDoSkladu(
      SKLAD_FRONTY,
      zaznam
    );

    return zaznam;
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
      faze: "shadow_v1",
      cloudState: "disabled"
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

  async function ulozCloudovouStinovouPrilohuZDataUrl({
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
      mimeType: blob.type || "image/jpeg",
      sizeBytes: blob.size,
      fileName: fileName || "",
      createdAt: ted,
      lastAccessAt: ted,
      faze: "cloud_shadow_v1",
      cloudState: "pending_upload",
      storagePath: "",
      uploadedAt: null,
      activatedAt: null,
      lastCloudError: ""
    };

    await ulozZaznamDoSkladu(
      SKLAD_PRILOH,
      zaznam
    );

    await zaradUpload({
      attachmentId: id,
      noteId
    });

    return {
      id: zaznam.id,
      noteId: zaznam.noteId,
      mimeType: zaznam.mimeType,
      sizeBytes: zaznam.sizeBytes,
      createdAt: zaznam.createdAt,
      cloudState: zaznam.cloudState
    };
  }

  async function nactiPrilohu(id) {
    return nactiZaznamZeSkladu(
      SKLAD_PRILOH,
      id
    );
  }

  async function smazPrilohu(id) {
    if (!id) {
      return false;
    }

    await smazZaznamZeSkladu(
      SKLAD_FRONTY,
      `upload:${id}`
    );

    return smazZaznamZeSkladu(
      SKLAD_PRILOH,
      id
    );
  }

  async function smazPrilohyPodleNoteId(noteId) {
    if (!noteId) {
      return 0;
    }

    const databaze = await otevriDatabazi();

    const ids = await new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        SKLAD_PRILOH,
        "readonly"
      );
      const index = transakce
        .objectStore(SKLAD_PRILOH)
        .index("noteId");
      const request = index.getAllKeys(noteId);

      request.onsuccess = () => {
        resolve(
          Array.isArray(request.result)
            ? request.result
            : []
        );
      };

      request.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohy draftu se nepodařilo najít.",
          udalost
        )
      );
    });

    let smazano = 0;

    for (const id of ids) {
      if (await smazPrilohu(id)) {
        smazano += 1;
      }
    }

    return smazano;
  }

  async function spocitejSklad(sklad, index = null, hodnota = null) {
    const databaze = await otevriDatabazi();

    return new Promise((resolve, reject) => {
      const transakce = databaze.transaction(
        sklad,
        "readonly"
      );
      const objectStore = transakce.objectStore(sklad);
      const request = index
        ? objectStore.index(index).count(hodnota)
        : objectStore.count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = (udalost) => reject(
        vytvorChybuDatabaze(
          "Lokální přílohy se nepodařilo spočítat.",
          udalost
        )
      );
    });
  }

  async function spocitejPrilohy() {
    return spocitejSklad(SKLAD_PRILOH);
  }

  async function ziskejDiagnostiku() {
    try {
      const [
        pocetPriloh,
        cekajiciUploady,
        nahraneUploady
      ] = await Promise.all([
        spocitejSklad(SKLAD_PRILOH),
        spocitejSklad(
          SKLAD_FRONTY,
          "stav",
          "pending_upload"
        ),
        spocitejSklad(
          SKLAD_FRONTY,
          "stav",
          "uploaded"
        )
      ]);

      return {
        dostupne: true,
        databaze: NAZEV_DB,
        verze: VERZE_DB,
        pocetPriloh,
        cekajiciUploady,
        nahraneUploady,
        frontaUploaduAktivni: true,
        rezim: "cloud_shadow"
      };
    } catch (error) {
      return {
        dostupne: false,
        databaze: NAZEV_DB,
        verze: VERZE_DB,
        pocetPriloh: 0,
        cekajiciUploady: 0,
        nahraneUploady: 0,
        frontaUploaduAktivni: true,
        rezim: "cloud_shadow",
        chyba: error?.message || String(error)
      };
    }
  }

  window.LubaNoteAttachmentsLocal = {
    jeDostupne: jeIndexedDbDostupne,
    ulozStinovouPrilohuZDataUrl,
    ulozCloudovouStinovouPrilohuZDataUrl,
    nactiPrilohu,
    upravPrilohu,
    smazPrilohu,
    smazPrilohyPodleNoteId,
    zaradUpload,
    aktualizujUpload,
    spocitejPrilohy,
    ziskejDiagnostiku
  };
})();
