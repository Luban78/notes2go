/* ============================================================
   LUBANOTE – DOKUMENTY V2.0 / LUBAREADER BOOKMARKS + HIGHLIGHTS (PATCH 645)
   ------------------------------------------------------------
   Lokální knihovna Dokumentů:
   - složky, řazení, long-press přesuny, Koš, hledání a filtry
   - PDF import + stávající LubaNote PDF viewer
   - DOCX import + čtecí viewer přímo v Dokumentech
   - legacy Word 97–2003 DOC import + bezpečný lokální textový viewer
   - 2× tap v DOCX/DOC vieweru přepne maximalizované zobrazení
   - DOCX: nadpisy, odstavce, formát textu, tabulky, odkazy a obrázky
   - DOC: čitelný text bez maker/OLE a bez garance původního layoutu
   - EPUB import + vlastní lokální LubaReader, kapitoly a zapamatování pozice
   - LubaReader: globální nastavení čtení (Aa) – zarovnání, velikost, řádkování, okraje, pozadí a písmo
   - LubaReader: lokální záložky a trvalé barevné zvýraznění vybraného textu

   DŮLEŽITÉ:
   - zatím pouze lokálně v zařízení / prohlížeči
   - žádný cloud, Shared ani konverze
   - starý stabilní PDF tok se nemění
   - DOCX ani DOC se NEPŘEVÁDÍ na poznámku a editor se neotevírá
   ============================================================ */

(() => {
  'use strict';

  const DB_NAME = 'lubanote_documents_v1';
  const DB_VERSION = 1;
  const STORE_FOLDERS = 'folders';
  const STORE_FILES = 'files';
  const MAX_PDF_BYTES = 100 * 1024 * 1024;
  const MAX_DOCX_BYTES = 20 * 1024 * 1024;
  const MAX_DOC_BYTES = 24 * 1024 * 1024;
  const MAX_EPUB_BYTES = 100 * 1024 * 1024;
  const MAX_SQL_BYTES = 10 * 1024 * 1024;
  const MAX_DOCX_PART_BYTES = 32 * 1024 * 1024;
  const MAX_DOCX_ZIP_ENTRIES = 5000;
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const DOC_MIME = 'application/msword';
  const EPUB_MIME = 'application/epub+zip';
  const SQL_MIME = 'application/sql';
  const TRASH_VIEW = '__documents_trash__';
  const EPUB_READER_SETTINGS_KEY = 'lubanote_epub_reader_settings_v1';
  const EPUB_READER_DEFAULTS = Object.freeze({
    align: 'book',
    fontSize: 100,
    lineHeight: 'normal',
    margins: 'normal',
    theme: 'sepia',
    font: 'book'
  });

  let dbPromise = null;
  let aktivniSlozkaId = null;
  let dokumentyPrvky = null;
  let posledniSlozky = [];
  let posledniSoubory = [];
  let aktivniTypFiltru = 'all';
  let hledaniDokumentu = '';
  const DELKA_LONG_PRESS_SOUBORU = 420;
  const MAX_POHYB_PRED_LONGPRESS = 20;
  const START_DRAG_PO_LONGPRESS = 7;
  const MAGNET_CILE_PX = 42;

  let dragStav = null;
  let dragCasovac = null;
  let dragNahled = null;
  let blokovatOtevreniDo = 0;

  const DELKA_LONG_PRESS_SLOZKY = 420;
  const MAX_POHYB_SLOZKY_PRED_LONGPRESS = 20;
  const START_DRAG_SLOZKY_PO_LONGPRESS = 7;
  let folderDragStav = null;
  let folderDragCasovac = null;
  let folderDragNahled = null;
  let blokovatOtevreniSlozkyDo = 0;

  let docxViewerPrvky = null;
  let docxViewerOtevren = false;
  let docxViewerObjectUrls = [];
  let docxAndroidBackZapojen = false;
  let docxViewerFullscreen = false;
  let docxViewerSqlText = '';

  let epubViewerPrvky = null;
  let epubViewerOtevren = false;
  let epubViewerFullscreen = false;
  let epubAktualniKniha = null;
  let epubAktualniRecordId = null;
  let epubAktualniKapitola = 0;
  let epubKapitolaObjectUrls = [];
  let epubUlozPoziciTimer = null;
  let epubListCoverUrls = [];
  let epubReaderNastaveni = nactiEpubReaderNastaveni();
  let epubZalozky = [];
  let epubZvyrazneni = [];
  let epubVyberTextu = null;
  let epubVybraneZvyrazneniId = null;

  function jeAndroid() {
    try {
      return window.Capacitor?.getPlatform?.() === 'android';
    } catch {
      return false;
    }
  }

  function ziskejNativniPlugin() {
    return window.Capacitor?.Plugins?.LubaNoteDocument || null;
  }

  function id() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function esc(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`.replace('.', ',');
  }

  function formatDate(value) {
    const datum = new Date(value || Date.now());
    if (Number.isNaN(datum.getTime())) return '';
    return datum.toLocaleDateString('cs-CZ');
  }


  function jePdfSoubor(soubor) {
    const mime = String(soubor?.mime || '').toLowerCase();
    const nazev = String(soubor?.name || '').toLowerCase();
    return mime === 'application/pdf' || nazev.endsWith('.pdf');
  }

  function jeDocxSoubor(soubor) {
    const mime = String(soubor?.mime || '').toLowerCase();
    const nazev = String(soubor?.name || '').toLowerCase();
    return mime === DOCX_MIME || nazev.endsWith('.docx');
  }

  function jeDocSoubor(soubor) {
    const mime = String(soubor?.mime || '').toLowerCase();
    const nazev = String(soubor?.name || '').toLowerCase();
    return mime === DOC_MIME || nazev.endsWith('.doc');
  }

  function jeEpubSoubor(soubor) {
    const mime = String(soubor?.mime || '').toLowerCase();
    const nazev = String(soubor?.name || '').toLowerCase();
    return mime === EPUB_MIME || nazev.endsWith('.epub');
  }

  function jeSqlSoubor(soubor) {
    const nazev = String(soubor?.name || '').toLowerCase();
    return nazev.endsWith('.sql');
  }

  function typSouboru(soubor) {
    if (jeDocxSoubor(soubor)) return 'docx';
    if (jeDocSoubor(soubor)) return 'doc';
    if (jeEpubSoubor(soubor)) return 'epub';
    if (jeSqlSoubor(soubor)) return 'sql';
    if (jePdfSoubor(soubor)) return 'pdf';
    return 'other';
  }

  function popisTypuSouboru(soubor) {
    const typ = typSouboru(soubor);
    if (typ === 'docx') return 'DOCX';
    if (typ === 'doc') return 'DOC';
    if (typ === 'epub') return 'EPUB';
    if (typ === 'sql') return 'SQL';
    if (typ === 'pdf') return 'PDF';
    return 'SOUBOR';
  }

  function priponaSouboru(soubor) {
    const typ = typSouboru(soubor);
    if (typ === 'docx') return 'docx';
    if (typ === 'doc') return 'doc';
    if (typ === 'epub') return 'epub';
    if (typ === 'sql') return 'sql';
    return 'pdf';
  }

  function pocetSouboruText(pocet) {
    const n = Math.max(0, Number(pocet) || 0);
    if (n === 1) return '1 soubor';
    if (n >= 2 && n <= 4) return `${n} soubory`;
    return `${n} souborů`;
  }

  function normalizujHledani(value) {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('cs')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function souborOdpovidaHledani(soubor, folderMap) {
    const dotaz = normalizujHledani(hledaniDokumentu);
    if (!dotaz) return true;

    const slozka = soubor.folderId
      ? folderMap.get(soubor.folderId) || ''
      : soubor.trashFolderId
        ? folderMap.get(soubor.trashFolderId) || ''
        : '';

    return normalizujHledani(`${soubor.name || ''} ${soubor.epubTitle || ''} ${soubor.epubAuthor || ''} ${slozka}`).includes(dotaz);
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB operace selhala.'));
    });
  }

  function otevriDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          const store = db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
          store.createIndex('folderId', 'folderId');
          store.createIndex('updatedAt', 'updatedAt');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Databázi Dokumentů nelze otevřít.'));
    });

    return dbPromise;
  }

  async function vseZeStore(storeName) {
    const db = await otevriDb();
    const tx = db.transaction(storeName, 'readonly');
    return await requestPromise(tx.objectStore(storeName).getAll());
  }

  async function ulozDoStore(storeName, value) {
    const db = await otevriDb();
    const tx = db.transaction(storeName, 'readwrite');
    await requestPromise(tx.objectStore(storeName).put(value));
  }


  function nazevSlozkyExistuje(nazev, ignorovatId = null) {
    const cil = String(nazev || '').trim().toLocaleLowerCase('cs');
    if (!cil) return false;
    return posledniSlozky.some((folder) => (
      folder.id !== ignorovatId &&
      String(folder.name || '').trim().toLocaleLowerCase('cs') === cil
    ));
  }

  async function smazSlozkuBezZtraty(folderId) {
    const db = await otevriDb();

    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_FOLDERS, STORE_FILES], 'readwrite');
      const foldersStore = tx.objectStore(STORE_FOLDERS);
      const filesStore = tx.objectStore(STORE_FILES);
      const request = filesStore.getAll();

      request.onerror = () => reject(request.error || new Error('Soubory složky nelze načíst.'));
      request.onsuccess = () => {
        const ted = Date.now();
        for (const soubor of request.result || []) {
          if ((soubor.folderId || null) !== folderId) continue;
          soubor.folderId = null;
          soubor.updatedAt = ted;
          filesStore.put(soubor);
        }
        foldersStore.delete(folderId);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Složku se nepodařilo smazat.'));
      tx.onabort = () => reject(tx.error || new Error('Mazání složky bylo přerušeno.'));
    });
  }

  function hodnotaPoradiSlozky(folder, fallback = Number.MAX_SAFE_INTEGER) {
    const poradi = Number(folder?.poradi);
    return Number.isFinite(poradi) ? poradi : fallback;
  }

  async function zajistiPoradiSlozek(folders) {
    const serazene = [...(folders || [])].sort((a, b) => {
      const ap = hodnotaPoradiSlozky(a);
      const bp = hodnotaPoradiSlozky(b);
      if (ap !== bp) return ap - bp;

      const ac = Number(a?.createdAt || 0);
      const bc = Number(b?.createdAt || 0);
      if (ac !== bc) return ac - bc;

      return String(a?.name || '').localeCompare(String(b?.name || ''), 'cs');
    });

    let zmeneno = false;
    for (let index = 0; index < serazene.length; index += 1) {
      const folder = serazene[index];
      if (Number(folder.poradi) === index) continue;
      folder.poradi = index;
      await ulozDoStore(STORE_FOLDERS, folder);
      zmeneno = true;
    }

    return { folders: serazene, zmeneno };
  }

  async function ulozPoradiSlozek(ids) {
    const podleId = new Map(posledniSlozky.map((folder) => [folder.id, folder]));
    const novePoradi = [];

    ids.forEach((folderId, index) => {
      const folder = podleId.get(folderId);
      if (!folder) return;
      folder.poradi = index;
      novePoradi.push(folder);
    });

    posledniSlozky.forEach((folder) => {
      if (!novePoradi.includes(folder)) novePoradi.push(folder);
    });

    for (let index = 0; index < novePoradi.length; index += 1) {
      const folder = novePoradi[index];
      if (Number(folder.poradi) !== index) folder.poradi = index;
      await ulozDoStore(STORE_FOLDERS, folder);
    }

    posledniSlozky = novePoradi;
  }

  async function nactiSoubor(idSouboru) {
    const db = await otevriDb();
    const tx = db.transaction(STORE_FILES, 'readonly');
    return await requestPromise(tx.objectStore(STORE_FILES).get(idSouboru));
  }

  function jeSouborVKosi(soubor) {
    return Number(soubor?.deletedAt || 0) > 0;
  }

  function normalizujNazevSouboru(value, pripona = 'pdf') {
    let nazev = String(value || '').trim().replace(/\s+/g, ' ');
    const ext = ['docx', 'doc', 'epub', 'sql'].includes(pripona) ? pripona : 'pdf';
    if (!nazev) return '';

    const regex = new RegExp(`\\.${ext}$`, 'i');
    if (regex.test(nazev)) {
      const zaklad = nazev.slice(0, -(ext.length + 1)).trim().slice(0, 116);
      return zaklad ? `${zaklad}.${ext}` : '';
    }

    nazev = nazev.replace(/\.(pdf|docx|doc|epub|sql)$/i, '').trim().slice(0, 116);
    return nazev ? `${nazev}.${ext}` : '';
  }

  async function prejmenujSoubor(idSouboru, novyNazev) {
    const record = await nactiSoubor(idSouboru);
    if (!record) throw new Error('Soubor už není dostupný.');

    const nazev = normalizujNazevSouboru(novyNazev, priponaSouboru(record));
    if (!nazev) throw new Error('Název souboru je prázdný.');

    record.name = nazev;
    record.updatedAt = Date.now();
    await ulozDoStore(STORE_FILES, record);
    return record;
  }

  async function presunSouborDoKose(idSouboru) {
    const record = await nactiSoubor(idSouboru);
    if (!record) throw new Error('Soubor už není dostupný.');
    if (jeSouborVKosi(record)) return record;

    record.trashFolderId = record.folderId || null;
    record.folderId = null;
    record.deletedAt = Date.now();
    record.updatedAt = record.deletedAt;
    await ulozDoStore(STORE_FILES, record);
    return record;
  }

  async function obnovSouborZKose(idSouboru) {
    const record = await nactiSoubor(idSouboru);
    if (!record) throw new Error('Soubor už není dostupný.');
    if (!jeSouborVKosi(record)) return record;

    const puvodniSlozka = record.trashFolderId || null;
    const slozkaExistuje = puvodniSlozka !== null && posledniSlozky.some((folder) => folder.id === puvodniSlozka);
    record.folderId = slozkaExistuje ? puvodniSlozka : null;
    delete record.deletedAt;
    delete record.trashFolderId;
    record.updatedAt = Date.now();
    await ulozDoStore(STORE_FILES, record);
    return record;
  }

  /* PATCH 658Q – dokumentový Koš musí umět skutečné trvalé smazání.
     Android PDF je fyzicky uložené v privátní složce aplikace, takže nejdřív
     smažeme tuto kopii a teprve potom záznam z IndexedDB. Ostatní typy jsou
     uložené přímo v IndexedDB a stačí smazat jejich record. */
  async function smazSouborTrvale(idSouboru) {
    const record = await nactiSoubor(idSouboru);
    if (!record) throw new Error('Soubor už není dostupný.');
    if (!jeSouborVKosi(record)) throw new Error('Trvale mazat lze pouze dokument v koši.');

    if (record.storageMode === 'android' && record.storageKey) {
      const plugin = ziskejNativniPlugin();
      if (!plugin?.smazUlozenyPdf) {
        throw new Error('Android neumí bezpečně smazat uložené PDF.');
      }

      const vysledek = await plugin.smazUlozenyPdf({ storageKey: record.storageKey });
      if (vysledek?.deleted !== true && vysledek?.missing !== true) {
        throw new Error('Uložené PDF se nepodařilo fyzicky smazat.');
      }
    }

    const db = await otevriDb();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    await requestPromise(tx.objectStore(STORE_FILES).delete(idSouboru));
    return true;
  }


  async function presunSouborDoSlozky(idSouboru, folderId) {
    const record = await nactiSoubor(idSouboru);
    if (!record) {
      zobrazChybu('Dokumenty', 'Soubor už není dostupný.');
      return false;
    }

    const cil = folderId || null;
    if ((record.folderId || null) === cil) return false;

    if (cil !== null && !posledniSlozky.some((folder) => folder.id === cil)) {
      zobrazChybu('Dokumenty', 'Cílová složka už není dostupná.');
      return false;
    }

    record.folderId = cil;
    record.updatedAt = Date.now();
    await ulozDoStore(STORE_FILES, record);
    return true;
  }

  function vycistiDragCil() {
    document.querySelectorAll('.documentsFolderCard.drag-target, .documentsFolderAll.drag-target')
      .forEach((el) => el.classList.remove('drag-target'));
  }

  function vzdalenostOdObdelniku(x, y, rect) {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
  }

  function najdiDragCil(x, y) {
    const el = document.elementFromPoint(x, y);
    const prime = el?.closest?.('.documentsFolderCard, .documentsFolderAll') || null;
    if (prime) return prime;

    let nejblizsi = null;
    let nejmensi = Infinity;

    document.querySelectorAll('.documentsFolderCard, .documentsFolderAll').forEach((target) => {
      const rect = target.getBoundingClientRect();
      const vzdalenost = vzdalenostOdObdelniku(x, y, rect);
      if (vzdalenost <= MAGNET_CILE_PX && vzdalenost < nejmensi) {
        nejmensi = vzdalenost;
        nejblizsi = target;
      }
    });

    return nejblizsi;
  }

  function nazevDragCile(target) {
    if (!target) return '';
    if (target.classList.contains('documentsFolderAll')) return 'Všechny soubory';
    return target.querySelector('.documentsFolderCardName')?.textContent?.trim()
      || target.dataset.folderId
      || 'složka';
  }

  function zajistiDragNahled() {
    if (dragNahled?.isConnected) return dragNahled;

    dragNahled = document.createElement('div');
    dragNahled.className = 'documentsDragPreview';
    dragNahled.hidden = true;
    dragNahled.innerHTML = `
      <span class="documentsDragPreviewIcon" aria-hidden="true">PDF</span>
      <span class="documentsDragPreviewText">
        <strong></strong>
        <small>Táhni na cílovou složku</small>
      </span>`;

    document.body.appendChild(dragNahled);
    return dragNahled;
  }

  function nastavPoziciDragNahledu(x, y) {
    const nahled = zajistiDragNahled();
    const okraj = 12;
    const polovina = Math.min(170, Math.max(110, (nahled.offsetWidth || 260) / 2));
    const safeX = Math.max(okraj + polovina, Math.min(window.innerWidth - okraj - polovina, x));
    const safeY = Math.max(96, y - 26);
    nahled.style.left = `${Math.round(safeX)}px`;
    nahled.style.top = `${Math.round(safeY)}px`;
  }

  function zobrazDragNahled(row, x, y) {
    const nahled = zajistiDragNahled();
    const nazev = row?.querySelector('.documentsFileMain strong')?.textContent?.trim() || 'Dokument';
    const zdrojIkony = row?.querySelector('.documentsFileIcon');
    const nahledIkony = nahled.querySelector('.documentsDragPreviewIcon');
    nahled.querySelector('strong').textContent = nazev;
    nahled.querySelector('small').textContent = 'Táhni na cílovou složku';
    if (nahledIkony) {
      nahledIkony.textContent = zdrojIkony?.textContent?.trim() || 'DOC';
      nahledIkony.classList.toggle('is-docx', zdrojIkony?.classList.contains('is-docx') === true);
      nahledIkony.classList.toggle('is-doc', zdrojIkony?.classList.contains('is-doc') === true);
      nahledIkony.classList.toggle('is-epub', zdrojIkony?.classList.contains('is-epub') === true);
      nahledIkony.classList.toggle('is-sql', zdrojIkony?.classList.contains('is-sql') === true);
      if (zdrojIkony?.classList.contains('is-epub')) nahledIkony.textContent = 'EPUB';
    }
    nahled.classList.remove('is-active', 'has-target');
    nahled.hidden = false;
    nastavPoziciDragNahledu(x, y);
  }

  function skryjDragNahled() {
    if (!dragNahled) return;
    dragNahled.hidden = true;
    dragNahled.classList.remove('is-active', 'has-target');
  }

  function nastavDragCil(target) {
    vycistiDragCil();
    if (target) target.classList.add('drag-target');

    const nahled = dragNahled;
    if (!nahled || nahled.hidden) return;
    const popis = nahled.querySelector('small');

    if (target) {
      nahled.classList.add('has-target');
      if (popis) popis.textContent = `Pustit do „${nazevDragCile(target)}“`;
    } else {
      nahled.classList.remove('has-target');
      if (popis) popis.textContent = 'Táhni na cílovou složku';
    }
  }

  function zrusDragCasovac() {
    if (dragCasovac !== null) clearTimeout(dragCasovac);
    dragCasovac = null;
  }

  function ukonciDrag() {
    zrusDragCasovac();
    if (!dragStav) {
      skryjDragNahled();
      vycistiDragCil();
      dokumentyPrvky?.screen?.classList.remove('documents-drag-mode');
      return;
    }

    dragStav.row?.classList.remove('drag-ready', 'dragging');
    if (dragStav.pointerId !== null && dragStav.pointerId !== undefined) {
      try { dragStav.row?.releasePointerCapture?.(dragStav.pointerId); } catch (_error) {}
    }
    vycistiDragCil();
    skryjDragNahled();
    dokumentyPrvky?.screen?.classList.remove('documents-drag-mode');
    dragStav = null;
  }

  function aktivujLongPressSouboru() {
    if (!dragStav || dragStav.pripraven) return;
    dragStav.pripraven = true;
    dragStav.row?.classList.add('drag-ready');
    dokumentyPrvky?.screen?.classList.add('documents-drag-mode');
    zobrazDragNahled(dragStav.row, dragStav.lastX, dragStav.lastY);
    blokovatOtevreniDo = Date.now() + 700;
    try { window.getSelection()?.removeAllRanges(); } catch (_error) {}
    try { document.activeElement?.blur?.(); } catch (_error) {}
    try { navigator.vibrate?.(18); } catch (_error) {}
  }

  function pripravLongPressSouboru(row, idSouboru, x, y, typ, pointerId = null, touchId = null) {
    ukonciDrag();
    dragStav = {
      fileId: idSouboru,
      row,
      typ,
      pointerId,
      touchId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      pripraven: false,
      aktivni: false,
      target: null
    };

    dragCasovac = setTimeout(() => {
      dragCasovac = null;
      aktivujLongPressSouboru();
    }, DELKA_LONG_PRESS_SOUBORU);
  }

  function vzdalenostDragSouboru(x, y) {
    if (!dragStav) return 0;
    return Math.hypot(x - dragStav.startX, y - dragStav.startY);
  }

  function aktualizujDragSouboru(x, y) {
    if (!dragStav?.pripraven) return;
    dragStav.lastX = x;
    dragStav.lastY = y;
    nastavPoziciDragNahledu(x, y);

    if (!dragStav.aktivni && vzdalenostDragSouboru(x, y) >= START_DRAG_PO_LONGPRESS) {
      dragStav.aktivni = true;
      dragStav.row?.classList.remove('drag-ready');
      dragStav.row?.classList.add('dragging');
      dragNahled?.classList.add('is-active');
    }

    if (!dragStav.aktivni) return;
    const target = najdiDragCil(x, y);
    dragStav.target = target;
    nastavDragCil(target);
  }

  async function dokoncDragSouboru(x, y) {
    if (!dragStav) return;

    const stav = dragStav;
    const bylLongPress = Boolean(stav.pripraven);
    const aktivni = Boolean(stav.aktivni);
    const target = stav.target || (aktivni ? najdiDragCil(x, y) : null);

    if (bylLongPress) blokovatOtevreniDo = Date.now() + 700;
    ukonciDrag();

    if (!aktivni || !target) return;

    const folderId = target.classList.contains('documentsFolderAll')
      ? null
      : target.dataset.folderId || null;

    try {
      const zmeneno = await presunSouborDoSlozky(stav.fileId, folderId);
      if (!zmeneno) return;

      await refresh();
      try { navigator.vibrate?.([12, 28, 12]); } catch (_error) {}
    } catch (error) {
      console.error('Přesun souboru selhal:', error);
      zobrazChybu('Dokumenty', 'Soubor se nepodařilo přesunout.');
    }
  }

  function zapojLongPressSouboru(row, idSouboru) {
    /*
     * PATCH 636B – stejné gesto jako TODO/Bullet:
     * krátký tap = otevřít, long-press 420 ms = převzetí gesta pro MOVE.
     * Android contextmenu/callout na souborovém řádku záměrně blokujeme,
     * protože Debug Hub ukázal, že se spouštěl ~394 ms po touchstartu,
     * tedy těsně PŘED naším 420ms long-pressem a přesun byl nespolehlivý.
     */
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    row.addEventListener('selectstart', (event) => {
      event.preventDefault();
    });

    row.addEventListener('touchstart', (event) => {
      if (event.target.closest?.('.documentsFileMenuButton')) return;
      if (event.touches.length !== 1) return;
      const dotyk = event.touches[0];
      pripravLongPressSouboru(row, idSouboru, dotyk.clientX, dotyk.clientY, 'touch', null, dotyk.identifier);
    }, { passive: true });

    row.addEventListener('touchmove', (event) => {
      if (!dragStav || dragStav.typ !== 'touch') return;
      const dotyk = Array.from(event.touches || []).find((t) => t.identifier === dragStav.touchId);
      if (!dotyk) return;

      const dist = vzdalenostDragSouboru(dotyk.clientX, dotyk.clientY);
      if (!dragStav.pripraven) {
        if (dist > MAX_POHYB_PRED_LONGPRESS) ukonciDrag();
        return;
      }

      event.preventDefault();
      aktualizujDragSouboru(dotyk.clientX, dotyk.clientY);
    }, { passive: false });

    row.addEventListener('touchend', (event) => {
      if (!dragStav || dragStav.typ !== 'touch') return;
      const dotyk = Array.from(event.changedTouches || []).find((t) => t.identifier === dragStav.touchId);
      const x = dotyk?.clientX ?? dragStav.lastX;
      const y = dotyk?.clientY ?? dragStav.lastY;
      if (dragStav.pripraven) event.preventDefault();
      void dokoncDragSouboru(x, y);
    }, { passive: false });

    row.addEventListener('touchcancel', () => ukonciDrag(), { passive: true });

    row.addEventListener('pointerdown', (event) => {
      if (event.target.closest?.('.documentsFileMenuButton')) return;
      if (event.pointerType === 'touch') return;
      if (event.button !== undefined && event.button !== 0) return;
      pripravLongPressSouboru(row, idSouboru, event.clientX, event.clientY, 'pointer', event.pointerId, null);
    });

    row.addEventListener('pointermove', (event) => {
      if (!dragStav || dragStav.typ !== 'pointer' || dragStav.pointerId !== event.pointerId) return;
      const dist = vzdalenostDragSouboru(event.clientX, event.clientY);
      if (!dragStav.pripraven) {
        if (dist > MAX_POHYB_PRED_LONGPRESS) ukonciDrag();
        return;
      }

      event.preventDefault();
      if (dragStav.pointerId !== null) {
        try { row.setPointerCapture?.(dragStav.pointerId); } catch (_error) {}
      }
      aktualizujDragSouboru(event.clientX, event.clientY);
    });

    row.addEventListener('pointerup', (event) => {
      if (!dragStav || dragStav.typ !== 'pointer' || dragStav.pointerId !== event.pointerId) return;
      if (dragStav.pripraven) event.preventDefault();
      void dokoncDragSouboru(event.clientX, event.clientY);
    });

    row.addEventListener('pointercancel', () => {
      if (dragStav?.typ === 'pointer') ukonciDrag();
    });
  }

  function zrusFolderDragCasovac() {
    if (folderDragCasovac !== null) clearTimeout(folderDragCasovac);
    folderDragCasovac = null;
  }

  function zajistiFolderDragNahled() {
    if (folderDragNahled?.isConnected) return folderDragNahled;

    folderDragNahled = document.createElement('div');
    folderDragNahled.className = 'documentsFolderDragPreview';
    folderDragNahled.hidden = true;
    folderDragNahled.innerHTML = `
      <span class="documentsFolderDragPreviewIcon" aria-hidden="true">📁</span>
      <span class="documentsFolderDragPreviewText">
        <strong></strong>
        <small>Táhni pro změnu pořadí</small>
      </span>`;
    document.body.appendChild(folderDragNahled);
    return folderDragNahled;
  }

  function nastavPoziciFolderDragNahledu(x, y) {
    const nahled = zajistiFolderDragNahled();
    const sirka = nahled.offsetWidth || 240;
    const pul = sirka / 2;
    const safeX = Math.max(12 + pul, Math.min(window.innerWidth - 12 - pul, x));
    const safeY = Math.max(86, y - 24);
    nahled.style.left = `${Math.round(safeX)}px`;
    nahled.style.top = `${Math.round(safeY)}px`;
  }

  function zobrazFolderDragNahled(button, x, y) {
    const nahled = zajistiFolderDragNahled();
    const nazev = button?.querySelector('.documentsFolderCardName')?.textContent?.trim() || 'Složka';
    nahled.querySelector('strong').textContent = nazev;
    nahled.hidden = false;
    nahled.classList.remove('is-active');
    nastavPoziciFolderDragNahledu(x, y);
  }

  function skryjFolderDragNahled() {
    if (!folderDragNahled) return;
    folderDragNahled.hidden = true;
    folderDragNahled.classList.remove('is-active');
  }

  function vycistiFolderDropTarget() {
    document.querySelectorAll('.documentsFolderCard.folder-drop-target')
      .forEach((el) => el.classList.remove('folder-drop-target'));
  }

  function ukonciFolderDrag() {
    zrusFolderDragCasovac();
    vycistiFolderDropTarget();
    skryjFolderDragNahled();
    dokumentyPrvky?.screen?.classList.remove('documents-folder-drag-mode');

    if (folderDragStav?.button) {
      folderDragStav.button.classList.remove('folder-drag-ready', 'folder-dragging');
    }

    folderDragStav = null;
  }

  function aktivujLongPressSlozky() {
    if (!folderDragStav || folderDragStav.pripraven) return;
    folderDragStav.pripraven = true;
    folderDragStav.button.classList.add('folder-drag-ready');
    dokumentyPrvky?.screen?.classList.add('documents-folder-drag-mode');
    zobrazFolderDragNahled(folderDragStav.button, folderDragStav.lastX, folderDragStav.lastY);
    blokovatOtevreniSlozkyDo = Date.now() + 750;
    try { window.getSelection()?.removeAllRanges(); } catch (_error) {}
    try { document.activeElement?.blur?.(); } catch (_error) {}
    try { navigator.vibrate?.(18); } catch (_error) {}
  }

  function pripravLongPressSlozky(button, x, y, typ, touchId = null, pointerId = null) {
    ukonciFolderDrag();
    folderDragStav = {
      button,
      folderId: button.dataset.folderId,
      typ,
      touchId,
      pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      pripraven: false,
      aktivni: false
    };

    folderDragCasovac = setTimeout(() => {
      folderDragCasovac = null;
      aktivujLongPressSlozky();
    }, DELKA_LONG_PRESS_SLOZKY);
  }

  function vzdalenostFolderDrag(x, y) {
    if (!folderDragStav) return 0;
    return Math.hypot(x - folderDragStav.startX, y - folderDragStav.startY);
  }

  function najdiFolderReorderTarget(x, y) {
    const grid = dokumentyPrvky?.folders;
    if (!grid) return null;

    const prime = document.elementFromPoint(x, y)?.closest?.('.documentsFolderCard');
    if (prime && prime !== folderDragStav?.button) return prime;

    let nejblizsi = null;
    let nejmensi = Infinity;
    grid.querySelectorAll('.documentsFolderCard').forEach((button) => {
      if (button === folderDragStav?.button) return;
      const rect = button.getBoundingClientRect();
      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      const d = Math.hypot(dx, dy);
      if (d < nejmensi && d <= Math.max(rect.width, rect.height) * .9) {
        nejmensi = d;
        nejblizsi = button;
      }
    });
    return nejblizsi;
  }

  function presunFolderButtonVDomu(button, target, x, y) {
    if (!button || !target || button === target) return;
    const grid = dokumentyPrvky?.folders;
    if (!grid) return;

    vycistiFolderDropTarget();
    target.classList.add('folder-drop-target');

    const rect = target.getBoundingClientRect();
    const jeZa = y > rect.top + rect.height / 2 || (
      Math.abs(y - (rect.top + rect.height / 2)) < rect.height * .28 &&
      x > rect.left + rect.width / 2
    );

    if (jeZa) {
      grid.insertBefore(button, target.nextSibling);
    } else {
      grid.insertBefore(button, target);
    }
  }

  function aktualizujFolderDrag(x, y) {
    if (!folderDragStav?.pripraven) return;
    folderDragStav.lastX = x;
    folderDragStav.lastY = y;
    nastavPoziciFolderDragNahledu(x, y);

    if (!folderDragStav.aktivni && vzdalenostFolderDrag(x, y) >= START_DRAG_SLOZKY_PO_LONGPRESS) {
      folderDragStav.aktivni = true;
      folderDragStav.button.classList.remove('folder-drag-ready');
      folderDragStav.button.classList.add('folder-dragging');
      folderDragNahled?.classList.add('is-active');
    }

    if (!folderDragStav.aktivni) return;
    const target = najdiFolderReorderTarget(x, y);
    if (target) presunFolderButtonVDomu(folderDragStav.button, target, x, y);
    else vycistiFolderDropTarget();
  }

  async function dokoncFolderDrag() {
    if (!folderDragStav) return;
    const stav = folderDragStav;
    const bylLongPress = stav.pripraven;
    const aktivni = stav.aktivni;
    const grid = dokumentyPrvky?.folders;
    const ids = aktivni && grid
      ? [...grid.querySelectorAll('.documentsFolderCard[data-folder-id]')].map((el) => el.dataset.folderId)
      : [];

    if (bylLongPress) blokovatOtevreniSlozkyDo = Date.now() + 750;
    ukonciFolderDrag();

    if (!aktivni || ids.length < 1) return;
    try {
      await ulozPoradiSlozek(ids);
      await refresh();
      try { navigator.vibrate?.([12, 28, 12]); } catch (_error) {}
    } catch (error) {
      console.error('Změna pořadí složek selhala:', error);
      zobrazChybu('Dokumenty', 'Pořadí složek se nepodařilo uložit.');
      await refresh();
    }
  }

  function zapojLongPressSlozky(button) {
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    button.addEventListener('selectstart', (event) => event.preventDefault());

    button.addEventListener('touchstart', (event) => {
      if (event.target.closest?.('.documentsFolderMenuButton')) return;
      if (event.touches.length !== 1) return;
      const dotyk = event.touches[0];
      pripravLongPressSlozky(button, dotyk.clientX, dotyk.clientY, 'touch', dotyk.identifier, null);
    }, { passive: true });

    button.addEventListener('touchmove', (event) => {
      if (!folderDragStav || folderDragStav.typ !== 'touch') return;
      const dotyk = Array.from(event.touches || []).find((t) => t.identifier === folderDragStav.touchId);
      if (!dotyk) return;
      const dist = vzdalenostFolderDrag(dotyk.clientX, dotyk.clientY);
      if (!folderDragStav.pripraven) {
        if (dist > MAX_POHYB_SLOZKY_PRED_LONGPRESS) ukonciFolderDrag();
        return;
      }
      event.preventDefault();
      aktualizujFolderDrag(dotyk.clientX, dotyk.clientY);
    }, { passive: false });

    button.addEventListener('touchend', (event) => {
      if (!folderDragStav || folderDragStav.typ !== 'touch') return;
      if (folderDragStav.pripraven) event.preventDefault();
      void dokoncFolderDrag();
    }, { passive: false });

    button.addEventListener('touchcancel', () => ukonciFolderDrag(), { passive: true });

    button.addEventListener('pointerdown', (event) => {
      if (event.target.closest?.('.documentsFolderMenuButton')) return;
      if (event.pointerType === 'touch') return;
      if (event.button !== undefined && event.button !== 0) return;
      pripravLongPressSlozky(button, event.clientX, event.clientY, 'pointer', null, event.pointerId);
    });

    button.addEventListener('pointermove', (event) => {
      if (!folderDragStav || folderDragStav.typ !== 'pointer' || folderDragStav.pointerId !== event.pointerId) return;
      const dist = vzdalenostFolderDrag(event.clientX, event.clientY);
      if (!folderDragStav.pripraven) {
        if (dist > MAX_POHYB_SLOZKY_PRED_LONGPRESS) ukonciFolderDrag();
        return;
      }
      event.preventDefault();
      aktualizujFolderDrag(event.clientX, event.clientY);
    });

    button.addEventListener('pointerup', (event) => {
      if (!folderDragStav || folderDragStav.typ !== 'pointer' || folderDragStav.pointerId !== event.pointerId) return;
      if (folderDragStav.pripraven) event.preventDefault();
      void dokoncFolderDrag();
    });

    button.addEventListener('pointercancel', () => {
      if (folderDragStav?.typ === 'pointer') ukonciFolderDrag();
    });
  }

  function zobrazZpravu(nadpis, text) {
    if (typeof window.zobrazZpravuAplikace === 'function') {
      window.zobrazZpravuAplikace(nadpis, text);
      return;
    }
    console.info(`[${nadpis}] ${text}`);
  }

  function zobrazChybu(nadpis, text) {
    if (typeof window.zobrazZpravuAplikace === 'function') {
      window.zobrazZpravuAplikace(nadpis, text);
      return;
    }
    console.error(`[${nadpis}] ${text}`);
  }

  function zajistiPrvky() {
    if (dokumentyPrvky) return dokumentyPrvky;

    const screen = document.getElementById('documentsScreen');
    if (!screen) return null;

    dokumentyPrvky = {
      screen,
      folders: screen.querySelector('#documentsFolders'),
      files: screen.querySelector('#documentsFiles'),
      empty: screen.querySelector('#documentsEmpty'),
      status: screen.querySelector('#documentsLocalStatus'),
      activeFolder: screen.querySelector('#documentsActiveFolder'),
      addFolder: screen.querySelector('#documentsAddFolderButton'),
      addPdf: screen.querySelector('#documentsAddPdfButton'),
      addPdfFloating: screen.querySelector('#documentsFloatingAddButton'),
      allFolder: screen.querySelector('#documentsAllFolderButton'),
      search: screen.querySelector('#documentsSearchInput'),
      searchClear: screen.querySelector('#documentsSearchClear'),
      filterAll: screen.querySelector('#documentsFilterAll'),
      filterPdf: screen.querySelector('#documentsFilterPdf'),
      filterDocx: screen.querySelector('#documentsFilterDocx'),
      filterDoc: screen.querySelector('#documentsFilterDoc'),
      filterEpub: screen.querySelector('#documentsFilterEpub'),
      filterSql: screen.querySelector('#documentsFilterSql'),
      trash: screen.querySelector('#documentsTrashButton'),
      trashCount: screen.querySelector('#documentsTrashCount')
    };

    return dokumentyPrvky;
  }

  function zajistiModalSlozky() {
    let modal = document.getElementById('documentsFolderModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFolderModal';
    modal.className = 'documentsFolderModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFolderTitle">
        <div class="documentsFolderIcon" aria-hidden="true">📁</div>
        <h3 id="documentsFolderTitle">Nová složka</h3>
        <p id="documentsFolderHint">Složka je zatím pouze v tomto zařízení.</p>
        <label>
          <span>Název složky</span>
          <input id="documentsFolderName" type="text" maxlength="60" autocomplete="off" spellcheck="false" data-luba-keyboard-field="documents-folder-name">
        </label>
        <div class="documentsFolderActions">
          <button type="button" class="documentsFolderCancel">Zrušit</button>
          <button type="button" class="documentsFolderCreate">Vytvořit</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const title = modal.querySelector('#documentsFolderTitle');
    const hint = modal.querySelector('#documentsFolderHint');
    const input = modal.querySelector('#documentsFolderName');
    const cancel = modal.querySelector('.documentsFolderCancel');
    const create = modal.querySelector('.documentsFolderCreate');
    let editFolderId = null;

    const zavrit = () => {
      modal.hidden = true;
      editFolderId = null;
      input.value = '';
      input.blur();
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    const ulozit = async () => {
      const nazev = input.value.trim().replace(/\s+/g, ' ');
      if (!nazev) {
        input.focus();
        return;
      }

      if (nazevSlozkyExistuje(nazev, editFolderId)) {
        zobrazChybu('Dokumenty', `Složka „${nazev}“ už existuje.`);
        input.focus();
        return;
      }

      create.disabled = true;
      const bylaEditace = Boolean(editFolderId);
      try {
        if (editFolderId) {
          const folder = posledniSlozky.find((item) => item.id === editFolderId);
          if (!folder) throw new Error('Složka už není dostupná.');
          folder.name = nazev;
          folder.updatedAt = Date.now();
          await ulozDoStore(STORE_FOLDERS, folder);
        } else {
          await ulozDoStore(STORE_FOLDERS, {
            id: id(),
            name: nazev,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            poradi: posledniSlozky.length
          });
        }

        zavrit();
        await refresh();
        if (bylaEditace) {
          try { navigator.vibrate?.(14); } catch (_error) {}
        }
      } catch (error) {
        console.error(bylaEditace ? 'Přejmenování složky selhalo:' : 'Vytvoření složky selhalo:', error);
        zobrazChybu('Dokumenty', bylaEditace
          ? 'Složku se nepodařilo přejmenovat.'
          : 'Složku se nepodařilo vytvořit.');
      } finally {
        create.disabled = false;
      }
    };

    create.addEventListener('click', ulozit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ulozit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        zavrit();
      }
    });

    modal.otevrit = (options = {}) => {
      editFolderId = options.folderId || null;
      const folder = editFolderId
        ? posledniSlozky.find((item) => item.id === editFolderId)
        : null;

      title.textContent = folder ? 'Přejmenovat složku' : 'Nová složka';
      hint.textContent = folder
        ? 'Změní se pouze název složky. Dokumenty uvnitř zůstanou beze změny.'
        : 'Složka je zatím pouze v tomto zařízení.';
      create.textContent = folder ? 'Uložit' : 'Vytvořit';
      input.value = folder?.name || '';
      modal.hidden = false;

      requestAnimationFrame(() => {
        input.focus();
        if (folder) input.select();
      });
    };

    return modal;
  }

  function zajistiAkceSlozkyModal() {
    let modal = document.getElementById('documentsFolderManageModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFolderManageModal';
    modal.className = 'documentsFolderModal documentsFolderManageModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsFolderManageDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFolderManageTitle">
        <div class="documentsFolderIcon" aria-hidden="true">📁</div>
        <h3 id="documentsFolderManageTitle">Složka</h3>
        <p id="documentsFolderManageMeta"></p>
        <div class="documentsFolderManageActions">
          <button type="button" class="documentsFolderRenameAction">✏️ Přejmenovat</button>
          <button type="button" class="documentsFolderDeleteAction">🗑️ Smazat složku</button>
          <button type="button" class="documentsFolderManageCancel">Zrušit</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const title = modal.querySelector('#documentsFolderManageTitle');
    const meta = modal.querySelector('#documentsFolderManageMeta');
    const rename = modal.querySelector('.documentsFolderRenameAction');
    const remove = modal.querySelector('.documentsFolderDeleteAction');
    const cancel = modal.querySelector('.documentsFolderManageCancel');
    let folderId = null;

    const zavrit = () => {
      modal.hidden = true;
      folderId = null;
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    rename.addEventListener('click', () => {
      const idSlozky = folderId;
      zavrit();
      if (idSlozky) zajistiModalSlozky().otevrit({ folderId: idSlozky });
    });

    remove.addEventListener('click', () => {
      const idSlozky = folderId;
      zavrit();
      if (idSlozky) zajistiSmazaniSlozkyModal().otevrit(idSlozky);
    });

    modal.otevrit = (idSlozky) => {
      const folder = posledniSlozky.find((item) => item.id === idSlozky);
      if (!folder) return;
      folderId = idSlozky;
      const count = posledniSoubory.filter((soubor) => soubor.folderId === idSlozky).length;
      title.textContent = folder.name;
      meta.textContent = `${pocetSouboruText(count)} · lokálně v zařízení`;
      modal.hidden = false;
    };

    return modal;
  }

  function zajistiSmazaniSlozkyModal() {
    let modal = document.getElementById('documentsFolderDeleteModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFolderDeleteModal';
    modal.className = 'documentsFolderModal documentsFolderDeleteModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsFolderDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFolderDeleteTitle">
        <div class="documentsFolderDeleteIcon" aria-hidden="true">🗑️</div>
        <h3 id="documentsFolderDeleteTitle">Smazat složku?</h3>
        <p id="documentsFolderDeleteText"></p>
        <div class="documentsFolderActions">
          <button type="button" class="documentsFolderDeleteCancel">Zrušit</button>
          <button type="button" class="documentsFolderDeleteConfirm">Smazat složku</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const text = modal.querySelector('#documentsFolderDeleteText');
    const cancel = modal.querySelector('.documentsFolderDeleteCancel');
    const confirm = modal.querySelector('.documentsFolderDeleteConfirm');
    let folderId = null;

    const zavrit = () => {
      modal.hidden = true;
      folderId = null;
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    confirm.addEventListener('click', async () => {
      if (!folderId) return;
      const idSlozky = folderId;
      confirm.disabled = true;
      try {
        await smazSlozkuBezZtraty(idSlozky);
        zavrit();
        if (aktivniSlozkaId === idSlozky) aktivniSlozkaId = null;
        await refresh();
        try { navigator.vibrate?.([12, 28, 12]); } catch (_error) {}
      } catch (error) {
        console.error('Smazání složky selhalo:', error);
        zobrazChybu('Dokumenty', 'Složku se nepodařilo bezpečně smazat.');
      } finally {
        confirm.disabled = false;
      }
    });

    modal.otevrit = (idSlozky) => {
      const folder = posledniSlozky.find((item) => item.id === idSlozky);
      if (!folder) return;
      folderId = idSlozky;
      const count = posledniSoubory.filter((soubor) => soubor.folderId === idSlozky).length;
      text.textContent = count > 0
        ? `Složka „${folder.name}“ obsahuje ${pocetSouboruText(count)}. Dokumenty se NESMAŽOU – přesunou se do „Všechny soubory“. Potom se smaže pouze složka.`
        : `Složka „${folder.name}“ je prázdná. Smaže se pouze složka.`;
      modal.hidden = false;
    };

    return modal;
  }

  function zajistiPrejmenovaniSouboruModal() {
    let modal = document.getElementById('documentsFileRenameModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFileRenameModal';
    modal.className = 'documentsFolderModal documentsFileRenameModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsFileRenameDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFileRenameTitle">
        <div class="documentsFolderIcon" aria-hidden="true">📄</div>
        <h3 id="documentsFileRenameTitle">Přejmenovat dokument</h3>
        <p id="documentsFileRenameHint">Změní se pouze název v knihovně LubaNote. Obsah dokumentu zůstane beze změny.</p>
        <label>
          <span>Název souboru</span>
          <input id="documentsFileRenameInput" type="text" maxlength="120" autocomplete="off" spellcheck="false" data-luba-keyboard-field="documents-file-name">
        </label>
        <div class="documentsFolderActions">
          <button type="button" class="documentsFolderCancel documentsFileRenameCancel">Zrušit</button>
          <button type="button" class="documentsFolderCreate documentsFileRenameSave">Uložit</button>
        </div>
      </section>`;

    document.body.appendChild(modal);
    const title = modal.querySelector('#documentsFileRenameTitle');
    const hint = modal.querySelector('#documentsFileRenameHint');
    const input = modal.querySelector('#documentsFileRenameInput');
    const cancel = modal.querySelector('.documentsFileRenameCancel');
    const save = modal.querySelector('.documentsFileRenameSave');
    let fileId = null;

    const zavrit = () => {
      modal.hidden = true;
      fileId = null;
      input.value = '';
      input.blur();
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    const ulozit = async () => {
      if (!fileId) return;
      const record = posledniSoubory.find((item) => item.id === fileId);
      const nazev = normalizujNazevSouboru(input.value, priponaSouboru(record));
      if (!nazev) {
        input.focus();
        return;
      }

      save.disabled = true;
      try {
        await prejmenujSoubor(fileId, nazev);
        zavrit();
        await refresh();
        try { navigator.vibrate?.(14); } catch (_error) {}
      } catch (error) {
        console.error('Přejmenování dokumentu selhalo:', error);
        zobrazChybu('Dokumenty', 'Dokument se nepodařilo přejmenovat.');
      } finally {
        save.disabled = false;
      }
    };

    save.addEventListener('click', ulozit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void ulozit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        zavrit();
      }
    });

    modal.otevrit = (idSouboru) => {
      const record = posledniSoubory.find((item) => item.id === idSouboru);
      if (!record) return;
      fileId = idSouboru;
      const typ = popisTypuSouboru(record);
      const pripona = `.${priponaSouboru(record)}`;
      title.textContent = `Přejmenovat ${typ}`;
      hint.textContent = `Změní se pouze název v knihovně LubaNote. Obsah ${typ} zůstane beze změny.`;
      input.value = record.name || '';
      modal.hidden = false;
      requestAnimationFrame(() => {
        input.focus();
        const tecka = input.value.toLowerCase().lastIndexOf(pripona);
        if (tecka > 0 && input.setSelectionRange) input.setSelectionRange(0, tecka);
        else input.select();
      });
    };

    return modal;
  }

  function zajistiAkceSouboruModal() {
    let modal = document.getElementById('documentsFileManageModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFileManageModal';
    modal.className = 'documentsFolderModal documentsFileManageModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsFileManageDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFileManageTitle">
        <div class="documentsFolderIcon" aria-hidden="true">📄</div>
        <h3 id="documentsFileManageTitle">Dokument</h3>
        <p id="documentsFileManageMeta"></p>
        <div class="documentsFolderManageActions documentsFileManageActions">
          <button type="button" class="documentsFileRenameAction">✏️ Přejmenovat</button>
          <button type="button" class="documentsFileTrashAction">🗑️ Přesunout do koše</button>
          <button type="button" class="documentsFileRestoreAction" hidden>↩️ Obnovit z koše</button>
          <button type="button" class="documentsFileDeleteForeverAction" hidden>🗑️ Trvale smazat</button>
          <button type="button" class="documentsFolderManageCancel documentsFileManageCancel">Zrušit</button>
        </div>
      </section>`;

    document.body.appendChild(modal);
    const title = modal.querySelector('#documentsFileManageTitle');
    const meta = modal.querySelector('#documentsFileManageMeta');
    const rename = modal.querySelector('.documentsFileRenameAction');
    const trash = modal.querySelector('.documentsFileTrashAction');
    const restore = modal.querySelector('.documentsFileRestoreAction');
    const deleteForever = modal.querySelector('.documentsFileDeleteForeverAction');
    const cancel = modal.querySelector('.documentsFileManageCancel');
    let fileId = null;

    const zavrit = () => {
      modal.hidden = true;
      fileId = null;
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    rename.addEventListener('click', () => {
      const idSouboru = fileId;
      zavrit();
      if (idSouboru) zajistiPrejmenovaniSouboruModal().otevrit(idSouboru);
    });

    trash.addEventListener('click', async () => {
      if (!fileId) return;
      const idSouboru = fileId;
      trash.disabled = true;
      try {
        await presunSouborDoKose(idSouboru);
        zavrit();
        await refresh();
        try { navigator.vibrate?.([12, 28, 12]); } catch (_error) {}
      } catch (error) {
        console.error('Přesun dokumentu do koše selhal:', error);
        zobrazChybu('Dokumenty', 'Dokument se nepodařilo přesunout do koše.');
      } finally {
        trash.disabled = false;
      }
    });

    restore.addEventListener('click', async () => {
      if (!fileId) return;
      const idSouboru = fileId;
      restore.disabled = true;
      try {
        await obnovSouborZKose(idSouboru);
        zavrit();
        await refresh();
        try { navigator.vibrate?.([12, 28, 12]); } catch (_error) {}
      } catch (error) {
        console.error('Obnovení dokumentu z koše selhalo:', error);
        zobrazChybu('Dokumenty', 'Dokument se nepodařilo obnovit.');
      } finally {
        restore.disabled = false;
      }
    });

    deleteForever.addEventListener('click', () => {
      const idSouboru = fileId;
      zavrit();
      if (idSouboru) zajistiTrvaleSmazaniSouboruModal().otevrit(idSouboru);
    });

    modal.otevrit = (idSouboru) => {
      const record = posledniSoubory.find((item) => item.id === idSouboru);
      if (!record) return;
      fileId = idSouboru;
      const vKosi = jeSouborVKosi(record);
      title.textContent = record.name || 'Dokument';
      meta.textContent = `${popisTypuSouboru(record)} · ${formatBytes(record.size)} · ${formatDate(record.updatedAt)}`;
      rename.hidden = vKosi;
      trash.hidden = vKosi;
      restore.hidden = !vKosi;
      deleteForever.hidden = !vKosi;
      modal.hidden = false;
    };

    return modal;
  }

  function zajistiTrvaleSmazaniSouboruModal() {
    let modal = document.getElementById('documentsFileDeleteForeverModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsFileDeleteForeverModal';
    modal.className = 'documentsFolderModal documentsFileDeleteForeverModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsFileDeleteForeverDialog" role="dialog" aria-modal="true" aria-labelledby="documentsFileDeleteForeverTitle">
        <div class="documentsFolderDeleteIcon" aria-hidden="true">🗑️</div>
        <h3 id="documentsFileDeleteForeverTitle">Trvale smazat dokument?</h3>
        <p id="documentsFileDeleteForeverText"></p>
        <div class="documentsFolderActions">
          <button type="button" class="documentsFileDeleteForeverCancel">Zrušit</button>
          <button type="button" class="documentsFileDeleteForeverConfirm">Trvale smazat</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const text = modal.querySelector('#documentsFileDeleteForeverText');
    const cancel = modal.querySelector('.documentsFileDeleteForeverCancel');
    const confirm = modal.querySelector('.documentsFileDeleteForeverConfirm');
    let fileId = null;

    const zavrit = () => {
      modal.hidden = true;
      fileId = null;
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    confirm.addEventListener('click', async () => {
      if (!fileId) return;
      const idSouboru = fileId;
      confirm.disabled = true;
      try {
        await smazSouborTrvale(idSouboru);
        zavrit();
        await refresh();
        try { navigator.vibrate?.([18, 28, 18]); } catch (_error) {}
      } catch (error) {
        console.error('Trvalé smazání dokumentu selhalo:', error);
        zobrazChybu('Dokumenty', 'Dokument se nepodařilo trvale smazat.');
      } finally {
        confirm.disabled = false;
      }
    });

    modal.otevrit = (idSouboru) => {
      const record = posledniSoubory.find((item) => item.id === idSouboru);
      if (!record || !jeSouborVKosi(record)) return;
      fileId = idSouboru;
      text.textContent = `„${record.name || 'Dokument'}“ bude trvale odstraněn z tohoto zařízení. Tuto akci nelze vrátit zpět.`;
      modal.hidden = false;
    };

    return modal;
  }

  function zajistiPridatSouborModal() {
    let modal = document.getElementById('documentsAddFileModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'documentsAddFileModal';
    modal.className = 'documentsFolderModal documentsAddFileModal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="documentsFolderDialog documentsAddFileDialog" role="dialog" aria-modal="true" aria-labelledby="documentsAddFileTitle">
        <div class="documentsFolderIcon" aria-hidden="true">📄</div>
        <h3 id="documentsAddFileTitle">Přidat dokument</h3>
        <p>Vyber typ souboru. Dokument zůstane jen v tomto zařízení.</p>
        <div class="documentsAddFileChoices">
          <button type="button" class="documentsAddFileChoice documentsAddPdfChoice">
            <span class="documentsAddFileType is-pdf">PDF</span>
            <span><strong>PDF</strong><small>otevře se ve stávajícím PDF vieweru</small></span>
          </button>
          <button type="button" class="documentsAddFileChoice documentsAddDocxChoice">
            <span class="documentsAddFileType is-docx">DOCX</span>
            <span><strong>Word DOCX</strong><small>otevře se jen ke čtení v Dokumentech</small></span>
          </button>
          <button type="button" class="documentsAddFileChoice documentsAddDocChoice">
            <span class="documentsAddFileType is-doc">DOC</span>
            <span><strong>Word 97–2003 DOC</strong><small>lokální čtení textu starého formátu</small></span>
          </button>
          <button type="button" class="documentsAddFileChoice documentsAddEpubChoice">
            <span class="documentsAddFileType is-epub">EPUB</span>
            <span><strong>Elektronická kniha EPUB</strong><small>otevře se v lokálním LubaReaderu</small></span>
          </button>
          <button type="button" class="documentsAddFileChoice documentsAddSqlChoice">
            <span class="documentsAddFileType is-sql">SQL</span>
            <span><strong>SQL skript</strong><small>otevře se lokálně jen ke čtení jako zdrojový kód</small></span>
          </button>
        </div>
        <button type="button" class="documentsFolderManageCancel documentsAddFileCancel">Zrušit</button>
      </section>`;

    document.body.appendChild(modal);
    const pdf = modal.querySelector('.documentsAddPdfChoice');
    const docx = modal.querySelector('.documentsAddDocxChoice');
    const doc = modal.querySelector('.documentsAddDocChoice');
    const epub = modal.querySelector('.documentsAddEpubChoice');
    const sql = modal.querySelector('.documentsAddSqlChoice');
    const cancel = modal.querySelector('.documentsAddFileCancel');

    const zavrit = () => {
      modal.hidden = true;
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    pdf.addEventListener('click', () => {
      zavrit();
      void pridatPdf();
    });

    docx.addEventListener('click', () => {
      zavrit();
      void pridatDocx();
    });

    doc.addEventListener('click', () => {
      zavrit();
      void pridatDoc();
    });

    epub.addEventListener('click', () => {
      zavrit();
      void pridatEpub();
    });

    sql.addEventListener('click', () => {
      zavrit();
      void pridatSql();
    });

    modal.otevrit = () => {
      modal.hidden = false;
    };

    return modal;
  }

  async function vytvorRecordZVybranehoDokumentu(file) {
    if (!(file instanceof Blob)) return null;

    const nazev = String(file.name || '').trim();
    const typ = typSouboru({
      name: nazev,
      mime: file.type || ''
    });

    const zaklad = {
      id: id(),
      size: Number(file.size) || 0,
      folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
      storageMode: 'web',
      blob: file,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (typ === 'pdf') {
      if (file.size > MAX_PDF_BYTES) {
        zobrazChybu('Dokumenty', 'PDF je příliš velké. Maximální velikost je 100 MB.');
        return null;
      }

      return {
        ...zaklad,
        name: nazev || 'dokument.pdf',
        mime: 'application/pdf'
      };
    }

    if (typ === 'docx') {
      if (file.size > MAX_DOCX_BYTES) {
        zobrazChybu('Dokumenty', 'DOCX je příliš velký. Maximální velikost je 20 MB.');
        return null;
      }

      return {
        ...zaklad,
        name: normalizujNazevSouboru(nazev || 'dokument.docx', 'docx') || 'dokument.docx',
        mime: DOCX_MIME
      };
    }

    if (typ === 'doc') {
      if (file.size > MAX_DOC_BYTES) {
        zobrazChybu('Dokumenty', 'DOC je příliš velký. Maximální velikost je 24 MB.');
        return null;
      }

      return {
        ...zaklad,
        name: normalizujNazevSouboru(nazev || 'dokument.doc', 'doc') || 'dokument.doc',
        mime: DOC_MIME
      };
    }

    if (typ === 'epub') {
      if (file.size > MAX_EPUB_BYTES) {
        zobrazChybu('Dokumenty', 'EPUB je příliš velký. Maximální velikost je 100 MB.');
        return null;
      }

      if (!window.LubaNoteEpubReader?.inspect) {
        zobrazChybu('Dokumenty', 'EPUB čtečka není načtená.');
        return null;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const info = await window.LubaNoteEpubReader.inspect(arrayBuffer);

        return {
          ...zaklad,
          name: normalizujNazevSouboru(nazev || 'kniha.epub', 'epub') || 'kniha.epub',
          mime: EPUB_MIME,
          epubTitle: String(info?.title || '').trim(),
          epubAuthor: String(info?.author || '').trim(),
          epubCoverBlob: info?.coverBlob instanceof Blob ? info.coverBlob : null,
          epubChapterCount: Number(info?.chapterCount) || 0,
          epubChapterIndex: 0,
          epubScrollRatio: 0
        };
      } catch (error) {
        console.error('Kontrola EPUB při automatickém importu selhala:', error);
        zobrazChybu('Dokumenty', error?.message || 'EPUB se nepodařilo načíst.');
        return null;
      }
    }

    if (typ === 'sql') {
      if (file.size > MAX_SQL_BYTES) {
        zobrazChybu('Dokumenty', 'SQL je příliš velký. Maximální velikost je 10 MB.');
        return null;
      }

      try {
        const sqlText = await prectiSqlText(file);
        window.LubaNoteStartupDiag?.zapis?.(
          'SQL',
          `IMPORT AUTO | OK | bytes=${Number(file.size) || 0} chars=${sqlText.length}`
        );

        return {
          ...zaklad,
          name: normalizujNazevSouboru(nazev || 'skript.sql', 'sql') || 'skript.sql',
          mime: SQL_MIME,
          sqlText
        };
      } catch (error) {
        console.error('Čtení SQL při automatickém importu selhalo:', error);
        zobrazChybu('Dokumenty', 'SQL se nepodařilo přečíst.');
        return null;
      }
    }

    zobrazChybu(
      'Dokumenty',
      'Tento typ souboru zatím není podporovaný. Vyber PDF, DOCX, DOC, EPUB nebo SQL.'
    );
    return null;
  }

  async function vyberDokumentAutomaticky() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = [
        'application/pdf', '.pdf',
        DOCX_MIME, '.docx',
        DOC_MIME, '.doc',
        EPUB_MIME, '.epub',
        SQL_MIME, 'text/x-sql', '.sql'
      ].join(',');
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        try {
          const record = await vytvorRecordZVybranehoDokumentu(file);
          uklid();
          resolve(record);
        } catch (error) {
          uklid();
          console.error('Automatický import dokumentu selhal:', error);
          zobrazChybu('Dokumenty', 'Dokument se nepodařilo načíst.');
          resolve(null);
        }
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pridatDokumentAutomaticky() {
    const prvky = zajistiPrvky();
    if (!prvky || aktivniSlozkaId === TRASH_VIEW) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = await vyberDokumentAutomaticky();
      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();

      const typ = typSouboru(record).toUpperCase();
      const nazev = record.epubTitle || record.name || 'Dokument';
      zobrazZpravu('Dokumenty', `${typ} „${nazev}“ byl přidán.`);
    } catch (error) {
      console.error('Přidání dokumentu selhalo:', error);
      zobrazChybu('Dokumenty', 'Dokument se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  function otevriPridatSouborModal() {
    if (aktivniSlozkaId === TRASH_VIEW) return;
    void pridatDokumentAutomaticky();
  }

  async function importujPdfAndroid() {
    const plugin = ziskejNativniPlugin();
    if (!plugin?.importujPdfDokument) {
      throw new Error('Android PDF import není dostupný.');
    }

    const vysledek = await plugin.importujPdfDokument();
    if (!vysledek || vysledek.canceled === true) return null;

    return {
      id: id(),
      name: vysledek.nazevSouboru || 'dokument.pdf',
      mime: 'application/pdf',
      size: Number(vysledek.sizeBytes) || 0,
      folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
      storageMode: 'android',
      storageKey: vysledek.storageKey,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function vyberPdfWeb() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,.pdf';
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        if (file.size > MAX_PDF_BYTES) {
          uklid();
          zobrazChybu('Dokumenty', 'PDF je příliš velké. Maximální velikost je 100 MB.');
          resolve(null);
          return;
        }

        const record = {
          id: id(),
          name: file.name || 'dokument.pdf',
          mime: file.type || 'application/pdf',
          size: file.size,
          folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
          storageMode: 'web',
          blob: file,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        uklid();
        resolve(record);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function vyberDocxWeb() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `${DOCX_MIME},.docx`;
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        const jeDocx = /\.docx$/i.test(file.name || '') || file.type === DOCX_MIME;
        if (!jeDocx) {
          uklid();
          zobrazChybu('Dokumenty', 'Vybraný soubor není DOCX.');
          resolve(null);
          return;
        }

        if (file.size > MAX_DOCX_BYTES) {
          uklid();
          zobrazChybu('Dokumenty', 'DOCX je příliš velký. Maximální velikost je 20 MB.');
          resolve(null);
          return;
        }

        const record = {
          id: id(),
          name: normalizujNazevSouboru(file.name || 'dokument.docx', 'docx') || 'dokument.docx',
          mime: DOCX_MIME,
          size: file.size,
          folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
          storageMode: 'web',
          blob: file,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        uklid();
        resolve(record);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pridatDocx() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = await vyberDocxWeb();
      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();
      zobrazZpravu('Dokumenty', `DOCX „${record.name}“ byl přidán.`);
    } catch (error) {
      console.error('Import DOCX selhal:', error);
      zobrazChybu('Dokumenty', 'DOCX se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  async function vyberDocWeb() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `${DOC_MIME},.doc`;
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        const jeDoc = /\.doc$/i.test(file.name || '') || file.type === DOC_MIME;
        if (!jeDoc || /\.docx$/i.test(file.name || '')) {
          uklid();
          zobrazChybu('Dokumenty', 'Vybraný soubor není starý Word DOC.');
          resolve(null);
          return;
        }

        if (file.size > MAX_DOC_BYTES) {
          uklid();
          zobrazChybu('Dokumenty', 'DOC je příliš velký. Maximální velikost je 24 MB.');
          resolve(null);
          return;
        }

        const record = {
          id: id(),
          name: normalizujNazevSouboru(file.name || 'dokument.doc', 'doc') || 'dokument.doc',
          mime: DOC_MIME,
          size: file.size,
          folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
          storageMode: 'web',
          blob: file,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        uklid();
        resolve(record);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pridatDoc() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = await vyberDocWeb();
      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();
      zobrazZpravu('Dokumenty', `DOC „${record.name}“ byl přidán.`);
    } catch (error) {
      console.error('Import DOC selhal:', error);
      zobrazChybu('Dokumenty', 'DOC se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  async function vyberEpubWeb() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `${EPUB_MIME},.epub`;
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        const jeEpub = /\.epub$/i.test(file.name || '') || file.type === EPUB_MIME;
        if (!jeEpub) {
          uklid();
          zobrazChybu('Dokumenty', 'Vybraný soubor není EPUB.');
          resolve(null);
          return;
        }

        if (file.size > MAX_EPUB_BYTES) {
          uklid();
          zobrazChybu('Dokumenty', 'EPUB je příliš velký. Maximální velikost je 100 MB.');
          resolve(null);
          return;
        }

        if (!window.LubaNoteEpubReader?.inspect) {
          uklid();
          zobrazChybu('Dokumenty', 'EPUB čtečka není načtená.');
          resolve(null);
          return;
        }

        try {
          const arrayBuffer = await file.arrayBuffer();
          const info = await window.LubaNoteEpubReader.inspect(arrayBuffer);
          const record = {
            id: id(),
            name: normalizujNazevSouboru(file.name || 'kniha.epub', 'epub') || 'kniha.epub',
            mime: EPUB_MIME,
            size: file.size,
            folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
            storageMode: 'web',
            blob: file,
            epubTitle: String(info?.title || '').trim(),
            epubAuthor: String(info?.author || '').trim(),
            epubCoverBlob: info?.coverBlob instanceof Blob ? info.coverBlob : null,
            epubChapterCount: Number(info?.chapterCount) || 0,
            epubChapterIndex: 0,
            epubScrollRatio: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          uklid();
          resolve(record);
        } catch (error) {
          uklid();
          console.error('Kontrola EPUB selhala:', error);
          zobrazChybu('Dokumenty', error?.message || 'EPUB se nepodařilo načíst.');
          resolve(null);
        }
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pridatEpub() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = await vyberEpubWeb();
      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();
      const titul = record.epubTitle || record.name;
      zobrazZpravu('Dokumenty', `EPUB „${titul}“ byl přidán.`);
    } catch (error) {
      console.error('Import EPUB selhal:', error);
      zobrazChybu('Dokumenty', 'EPUB se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  function prectiSqlText(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob)) {
        reject(new Error('SQL data nejsou dostupná.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error || new Error('SQL se nepodařilo přečíst.'));
      reader.readAsText(blob, 'UTF-8');
    });
  }

  async function vyberSqlWeb() {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sql,text/plain,application/sql,text/x-sql';
      input.hidden = true;

      const uklid = () => input.remove();

      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        if (!file) {
          uklid();
          resolve(null);
          return;
        }

        if (!/\.sql$/i.test(file.name || '')) {
          uklid();
          zobrazChybu('Dokumenty', 'Vybraný soubor není SQL.');
          resolve(null);
          return;
        }

        if (file.size > MAX_SQL_BYTES) {
          uklid();
          zobrazChybu('Dokumenty', 'SQL je příliš velký. Maximální velikost je 10 MB.');
          resolve(null);
          return;
        }

        let sqlText = '';
        try {
          sqlText = await prectiSqlText(file);
          window.LubaNoteStartupDiag?.zapis?.(
            'SQL',
            `IMPORT | OK | bytes=${Number(file.size) || 0} chars=${sqlText.length}`
          );
        } catch (error) {
          console.error('Čtení SQL při importu selhalo:', error);
          uklid();
          zobrazChybu('Dokumenty', 'SQL se nepodařilo přečíst.');
          resolve(null);
          return;
        }

        const record = {
          id: id(),
          name: normalizujNazevSouboru(file.name || 'skript.sql', 'sql') || 'skript.sql',
          mime: SQL_MIME,
          size: file.size,
          folderId: aktivniSlozkaId === TRASH_VIEW ? null : aktivniSlozkaId,
          storageMode: 'web',
          blob: file,
          sqlText,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        uklid();
        resolve(record);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pridatSql() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = await vyberSqlWeb();
      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();
      zobrazZpravu('Dokumenty', `SQL „${record.name}“ byl přidán.`);
    } catch (error) {
      console.error('Import SQL selhal:', error);
      zobrazChybu('Dokumenty', 'SQL se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  async function pridatPdf() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addPdf.disabled = true;
    if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = true;

    try {
      const record = jeAndroid()
        ? await importujPdfAndroid()
        : await vyberPdfWeb();

      if (!record) return;

      await ulozDoStore(STORE_FILES, record);
      await refresh();
      zobrazZpravu('Dokumenty', `PDF „${record.name}“ bylo přidáno.`);
    } catch (error) {
      console.error('Import PDF selhal:', error);
      zobrazChybu('Dokumenty', 'PDF se nepodařilo přidat.');
    } finally {
      prvky.addPdf.disabled = false;
      if (prvky.addPdfFloating) prvky.addPdfFloating.disabled = false;
    }
  }

  function docxEscAttr(text) {
    return esc(text).replaceAll('`', '&#096;');
  }

  function docxAttr(prvek, localName) {
    if (!prvek?.attributes) return '';
    for (const atribut of prvek.attributes) {
      if (atribut.localName === localName || atribut.name === localName) {
        return atribut.value || '';
      }
    }
    return '';
  }

  function docxDeti(prvek, localName = null) {
    return Array.from(prvek?.children || []).filter((dite) => (
      !localName || dite.localName === localName
    ));
  }

  function docxPrvniDite(prvek, localName) {
    return docxDeti(prvek, localName)[0] || null;
  }

  function docxPotomci(prvek, localName) {
    if (!prvek?.getElementsByTagNameNS) return [];
    return Array.from(prvek.getElementsByTagNameNS('*', localName));
  }

  function docxXml(xml, popis) {
    const dokument = new DOMParser().parseFromString(xml, 'application/xml');
    if (dokument.getElementsByTagName('parsererror').length > 0) {
      throw new Error(`${popis} není platné XML.`);
    }
    return dokument;
  }

  function najdiZipEocd(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let pozice = view.byteLength - 22; pozice >= minimum; pozice -= 1) {
      if (view.getUint32(pozice, true) === 0x06054b50) return pozice;
    }
    return -1;
  }

  function vytvorDocxZipIndex(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const eocd = najdiZipEocd(view);
    if (eocd < 0) throw new Error('DOCX nemá platnou ZIP strukturu.');

    const pocetPolozek = view.getUint16(eocd + 10, true);
    if (pocetPolozek > MAX_DOCX_ZIP_ENTRIES) {
      throw new Error('DOCX obsahuje příliš mnoho částí.');
    }

    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const polozky = new Map();
    let pozice = centralOffset;

    for (let index = 0; index < pocetPolozek; index += 1) {
      if (pozice + 46 > view.byteLength || view.getUint32(pozice, true) !== 0x02014b50) {
        throw new Error('DOCX má poškozený centrální ZIP adresář.');
      }

      const metoda = view.getUint16(pozice + 10, true);
      const komprimovanaVelikost = view.getUint32(pozice + 20, true);
      const puvodniVelikost = view.getUint32(pozice + 24, true);
      const delkaNazvu = view.getUint16(pozice + 28, true);
      const delkaExtra = view.getUint16(pozice + 30, true);
      const delkaKomentare = view.getUint16(pozice + 32, true);
      const lokalniOffset = view.getUint32(pozice + 42, true);

      const konecNazvu = pozice + 46 + delkaNazvu;
      if (konecNazvu > view.byteLength) throw new Error('DOCX má neplatný název ZIP položky.');

      const nazev = decoder.decode(new Uint8Array(arrayBuffer, pozice + 46, delkaNazvu));
      polozky.set(nazev, {
        nazev,
        metoda,
        komprimovanaVelikost,
        puvodniVelikost,
        lokalniOffset
      });

      pozice = konecNazvu + delkaExtra + delkaKomentare;
    }

    return { arrayBuffer, polozky };
  }

  async function nactiDocxZipPolozku(zip, nazev, povinna = false) {
    const polozka = zip.polozky.get(nazev);
    if (!polozka) {
      if (povinna) throw new Error(`DOCX neobsahuje ${nazev}.`);
      return null;
    }

    const view = new DataView(zip.arrayBuffer);
    const offset = polozka.lokalniOffset;
    if (offset + 30 > view.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
      throw new Error(`DOCX má poškozenou ZIP položku ${nazev}.`);
    }

    const delkaNazvu = view.getUint16(offset + 26, true);
    const delkaExtra = view.getUint16(offset + 28, true);
    const zacatekDat = offset + 30 + delkaNazvu + delkaExtra;
    const konecDat = zacatekDat + polozka.komprimovanaVelikost;
    if (konecDat > view.byteLength) throw new Error(`DOCX má neúplná data ${nazev}.`);

    const komprimovana = new Uint8Array(zip.arrayBuffer, zacatekDat, polozka.komprimovanaVelikost);
    if (polozka.metoda === 0) return new Uint8Array(komprimovana);

    if (polozka.metoda !== 8) {
      throw new Error(`DOCX používá nepodporovanou ZIP kompresi (${polozka.metoda}).`);
    }

    if (polozka.puvodniVelikost > MAX_DOCX_PART_BYTES) {
      throw new Error(`DOCX část ${nazev} je příliš velká.`);
    }

    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tento WebView neumí rozbalit DOCX.');
    }

    const proud = new Blob([komprimovana])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = proud.getReader();
    const kusy = [];
    let celkem = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        celkem += value.byteLength;
        if (celkem > MAX_DOCX_PART_BYTES) {
          try { await reader.cancel(); } catch (_error) {}
          throw new Error(`DOCX část ${nazev} je po rozbalení příliš velká.`);
        }
        kusy.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch (_error) {}
    }

    if (polozka.puvodniVelikost > 0 && celkem !== polozka.puvodniVelikost) {
      throw new Error(`DOCX část ${nazev} má neplatnou velikost.`);
    }

    const rozbalene = new Uint8Array(celkem);
    let cursor = 0;
    for (const kus of kusy) {
      rozbalene.set(kus, cursor);
      cursor += kus.byteLength;
    }
    return rozbalene;
  }

  async function nactiDocxXml(zip, nazev, povinna = false) {
    const bytes = await nactiDocxZipPolozku(zip, nazev, povinna);
    if (!bytes) return '';
    return new TextDecoder('utf-8').decode(bytes);
  }

  function normalizujDocxCestu(zaklad, cil) {
    const raw = String(cil || '').replace(/\\/g, '/');
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;

    const casti = (raw.startsWith('/') ? raw.slice(1) : `${zaklad}/${raw}`).split('/');
    const vysledek = [];
    for (const cast of casti) {
      if (!cast || cast === '.') continue;
      if (cast === '..') {
        vysledek.pop();
        continue;
      }
      vysledek.push(cast);
    }
    return vysledek.join('/');
  }

  function nactiDocxRelace(xml) {
    const relace = new Map();
    if (!xml) return relace;
    const dokument = docxXml(xml, 'DOCX relace');
    for (const rel of Array.from(dokument.getElementsByTagNameNS('*', 'Relationship'))) {
      const idRelace = rel.getAttribute('Id') || '';
      if (!idRelace) continue;
      relace.set(idRelace, {
        target: rel.getAttribute('Target') || '',
        type: rel.getAttribute('Type') || '',
        external: String(rel.getAttribute('TargetMode') || '').toLowerCase() === 'external'
      });
    }
    return relace;
  }

  function docxMimeObrazku(cesta) {
    const ext = String(cesta || '').split('.').pop()?.toLowerCase() || '';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'bmp') return 'image/bmp';
    // SVG z cizího DOCX záměrně nevkládáme jako aktivní obsah.
    if (ext === 'webp') return 'image/webp';
    return '';
  }

  function docxBarvaZvyrazneni(value) {
    const barvy = {
      yellow: '#fff59d', green: '#b9f6ca', cyan: '#b2ebf2', magenta: '#f8bbd0',
      blue: '#bbdefb', red: '#ffcdd2', darkBlue: '#90caf9', darkCyan: '#80cbc4',
      darkGreen: '#a5d6a7', darkMagenta: '#ce93d8', darkRed: '#ef9a9a', darkYellow: '#ffe082',
      lightGray: '#e0e0e0', darkGray: '#9e9e9e', black: '#616161'
    };
    return barvy[String(value || '')] || '';
  }

  function docxJeZapnuto(prvek) {
    if (!prvek) return false;
    const hodnota = String(docxAttr(prvek, 'val') || '').toLowerCase();
    return !['0', 'false', 'off', 'none'].includes(hodnota);
  }

  async function vykresliDocxObrazek(prvek, kontext) {
    const blip = docxPotomci(prvek, 'blip')[0] || docxPotomci(prvek, 'imagedata')[0] || null;
    if (!blip) return '';

    const rid = docxAttr(blip, 'embed') || docxAttr(blip, 'id');
    const relace = kontext.relace.get(rid);
    if (!relace || relace.external) return '';

    const cesta = normalizujDocxCestu('word', relace.target);
    if (!cesta) return '';

    const mime = docxMimeObrazku(cesta);
    if (!mime) return '<span class="documentsDocxUnsupported">[Obrázek v nepodporovaném formátu]</span>';

    const bytes = await nactiDocxZipPolozku(kontext.zip, cesta, false);
    if (!bytes) return '<span class="documentsDocxUnsupported">[Obrázek není dostupný]</span>';

    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    kontext.objectUrls.push(url);

    const docPr = docxPotomci(prvek, 'docPr')[0] || null;
    const alt = docPr?.getAttribute?.('descr') || docPr?.getAttribute?.('name') || 'Obrázek v dokumentu';
    return `<img class="documentsDocxImage" src="${docxEscAttr(url)}" alt="${docxEscAttr(alt)}">`;
  }

  async function vykresliDocxRun(run, kontext) {
    const rPr = docxPrvniDite(run, 'rPr');
    const styly = [];

    if (docxJeZapnuto(docxPrvniDite(rPr, 'b'))) styly.push('font-weight:700');
    if (docxJeZapnuto(docxPrvniDite(rPr, 'i'))) styly.push('font-style:italic');
    const dekorace = [];
    if (docxJeZapnuto(docxPrvniDite(rPr, 'u'))) dekorace.push('underline');
    if (docxJeZapnuto(docxPrvniDite(rPr, 'strike'))) dekorace.push('line-through');
    if (dekorace.length) styly.push(`text-decoration:${dekorace.join(' ')}`);

    const color = docxAttr(docxPrvniDite(rPr, 'color'), 'val');
    if (/^[0-9a-f]{6}$/i.test(color)) styly.push(`color:#${color}`);

    const velikostRaw = Number(docxAttr(docxPrvniDite(rPr, 'sz'), 'val'));
    if (Number.isFinite(velikostRaw) && velikostRaw > 0) {
      const pt = Math.max(7, Math.min(72, velikostRaw / 2));
      styly.push(`font-size:${pt}pt`);
    }

    const zvyrazneni = docxBarvaZvyrazneni(docxAttr(docxPrvniDite(rPr, 'highlight'), 'val'));
    if (zvyrazneni) styly.push(`background:${zvyrazneni}`);

    let obsah = '';
    for (const cast of docxDeti(run)) {
      if (cast.localName === 'rPr') continue;
      if (cast.localName === 't') {
        obsah += esc(cast.textContent || '');
      } else if (cast.localName === 'tab') {
        obsah += '<span class="documentsDocxTab">\t</span>';
      } else if (cast.localName === 'br' || cast.localName === 'cr') {
        obsah += '<br>';
      } else if (cast.localName === 'noBreakHyphen') {
        obsah += '‑';
      } else if (cast.localName === 'drawing' || cast.localName === 'pict' || cast.localName === 'object') {
        obsah += await vykresliDocxObrazek(cast, kontext);
      }
    }

    if (!obsah) return '';
    const vert = String(docxAttr(docxPrvniDite(rPr, 'vertAlign'), 'val') || '').toLowerCase();
    if (vert === 'superscript') obsah = `<sup>${obsah}</sup>`;
    if (vert === 'subscript') obsah = `<sub>${obsah}</sub>`;

    return styly.length
      ? `<span style="${styly.join(';')}">${obsah}</span>`
      : obsah;
  }

  async function vykresliDocxInline(prvek, kontext) {
    let html = '';
    for (const cast of docxDeti(prvek)) {
      if (cast.localName === 'r') {
        html += await vykresliDocxRun(cast, kontext);
        continue;
      }

      if (cast.localName === 'hyperlink') {
        let obsah = '';
        for (const run of docxDeti(cast, 'r')) obsah += await vykresliDocxRun(run, kontext);
        const rid = docxAttr(cast, 'id');
        const relace = kontext.relace.get(rid);
        const cil = relace?.external ? String(relace.target || '') : '';
        if (obsah && /^(https?:|mailto:)/i.test(cil)) {
          html += `<a href="${docxEscAttr(cil)}" target="_blank" rel="noopener noreferrer">${obsah}</a>`;
        } else {
          html += obsah;
        }
        continue;
      }

      if (cast.localName === 'del') {
        continue;
      }

      if (cast.localName === 'fldSimple' || cast.localName === 'smartTag' || cast.localName === 'sdt' || cast.localName === 'ins') {
        const runy = docxPotomci(cast, 'r');
        for (const run of runy) html += await vykresliDocxRun(run, kontext);
      }
    }
    return html;
  }

  async function vykresliDocxOdstavec(p, kontext) {
    const pPr = docxPrvniDite(p, 'pPr');
    const stylId = String(docxAttr(docxPrvniDite(pPr, 'pStyle'), 'val') || '');
    const zarovnaniRaw = String(docxAttr(docxPrvniDite(pPr, 'jc'), 'val') || '').toLowerCase();
    const maCislovani = Boolean(docxPrvniDite(pPr, 'numPr'));
    const obsah = await vykresliDocxInline(p, kontext);

    let tag = 'p';
    if (/(heading|nadpis)\s*1/i.test(stylId)) tag = 'h1';
    else if (/(heading|nadpis)\s*2/i.test(stylId)) tag = 'h2';
    else if (/(heading|nadpis)\s*3/i.test(stylId)) tag = 'h3';

    const styly = [];
    const zarovnani = zarovnaniRaw === 'both' ? 'justify' : zarovnaniRaw;
    if (['left', 'center', 'right', 'justify'].includes(zarovnani)) styly.push(`text-align:${zarovnani}`);

    const style = styly.length ? ` style="${styly.join(';')}"` : '';
    const vnitrni = obsah || '<br>';

    if (maCislovani && tag === 'p') {
      return `<div class="documentsDocxListItem"${style}><span class="documentsDocxBullet">•</span><div>${vnitrni}</div></div>`;
    }

    return `<${tag}${style}>${vnitrni}</${tag}>`;
  }

  async function vykresliDocxTabulku(tabulka, kontext) {
    const radky = [];
    for (const tr of docxDeti(tabulka, 'tr')) {
      const bunky = [];
      for (const tc of docxDeti(tr, 'tc')) {
        const tcPr = docxPrvniDite(tc, 'tcPr');
        const colspanRaw = Number(docxAttr(docxPrvniDite(tcPr, 'gridSpan'), 'val'));
        const colspan = Number.isFinite(colspanRaw) && colspanRaw > 1 ? Math.min(20, colspanRaw) : 1;
        let obsah = '';
        for (const cast of docxDeti(tc)) {
          if (cast.localName === 'p') obsah += await vykresliDocxOdstavec(cast, kontext);
          if (cast.localName === 'tbl') obsah += await vykresliDocxTabulku(cast, kontext);
        }
        bunky.push(`<td${colspan > 1 ? ` colspan="${colspan}"` : ''}>${obsah || '<p><br></p>'}</td>`);
      }
      radky.push(`<tr>${bunky.join('')}</tr>`);
    }
    return `<div class="documentsDocxTableWrap"><table>${radky.join('')}</table></div>`;
  }

  async function vykresliDocxKontejner(prvek, kontext) {
    let html = '';
    for (const cast of docxDeti(prvek)) {
      if (cast.localName === 'p') html += await vykresliDocxOdstavec(cast, kontext);
      else if (cast.localName === 'tbl') html += await vykresliDocxTabulku(cast, kontext);
      else if (cast.localName === 'sdt') {
        const obsah = docxPotomci(cast, 'sdtContent')[0];
        if (obsah) html += await vykresliDocxKontejner(obsah, kontext);
      }
    }
    return html;
  }

  async function parsujDocx(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
      throw new Error('DOCX je prázdný.');
    }
    if (arrayBuffer.byteLength > MAX_DOCX_BYTES) {
      throw new Error('DOCX překročil maximální velikost 20 MB.');
    }

    const zip = vytvorDocxZipIndex(arrayBuffer);
    const dokumentXml = await nactiDocxXml(zip, 'word/document.xml', true);
    const relaceXml = await nactiDocxXml(zip, 'word/_rels/document.xml.rels', false);
    const dokument = docxXml(dokumentXml, 'DOCX dokument');
    const body = docxPotomci(dokument, 'body')[0];
    if (!body) throw new Error('DOCX neobsahuje tělo dokumentu.');

    const objectUrls = [];
    const kontext = {
      zip,
      relace: nactiDocxRelace(relaceXml),
      objectUrls
    };

    try {
      const html = await vykresliDocxKontejner(body, kontext);
      return { html, objectUrls };
    } catch (error) {
      for (const url of objectUrls) {
        try { URL.revokeObjectURL(url); } catch (_error) {}
      }
      throw error;
    }
  }

  function uvolniDocxObjectUrls() {
    for (const url of docxViewerObjectUrls) {
      try { URL.revokeObjectURL(url); } catch (_error) {}
    }
    docxViewerObjectUrls = [];
  }

  function zajistiDocxViewer() {
    if (docxViewerPrvky) return docxViewerPrvky;

    const overlay = document.createElement('div');
    overlay.id = 'documentsDocxViewer';
    overlay.className = 'documentsDocxViewer';
    overlay.hidden = true;
    overlay.innerHTML = `
      <header class="documentsDocxViewerHeader">
        <button type="button" class="documentsDocxViewerClose" aria-label="Zavřít dokument">‹</button>
        <div class="documentsDocxViewerTitle">
          <strong></strong>
          <small>WORD · POUZE ČTENÍ</small>
        </div>
        <button type="button" class="documentsDocxViewerCopy" aria-label="Kopírovat celý SQL skript" hidden>📋 Kopírovat</button>
      </header>
      <main class="documentsDocxViewerBody">
        <div class="documentsDocxViewerLoading" hidden>
          <span class="documentsDocxSpinner" aria-hidden="true"></span>
          <strong>Otevírám dokument…</strong>
        </div>
        <article class="documentsDocxViewerContent"></article>
      </main>`;

    document.body.appendChild(overlay);
    const close = overlay.querySelector('.documentsDocxViewerClose');
    const copy = overlay.querySelector('.documentsDocxViewerCopy');
    const title = overlay.querySelector('.documentsDocxViewerTitle strong');
    const subtitle = overlay.querySelector('.documentsDocxViewerTitle small');
    const body = overlay.querySelector('.documentsDocxViewerBody');
    const loading = overlay.querySelector('.documentsDocxViewerLoading');
    const loadingText = overlay.querySelector('.documentsDocxViewerLoading strong');
    const content = overlay.querySelector('.documentsDocxViewerContent');

    close.addEventListener('click', zavriDocxViewer);
    copy.addEventListener('click', () => { void kopirujSqlViewer(); });

    /*
     * PATCH 642 – stejné gesto jako u PDF vieweru:
     * 2× krátký tap bez scrollu přepne maximalizované zobrazení.
     * Záměrně nepoužíváme browser Fullscreen API; v APK/WebView tak zůstává
     * chování stejné jako u odladěného PDF vieweru.
     */
    let pointerTap = null;
    let posledniTap = null;

    body.addEventListener('pointerdown', (event) => {
      if (!docxViewerOtevren || event.pointerType !== 'touch') return;
      if (event.target.closest?.('a,button')) return;
      pointerTap = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        cas: performance.now(),
        pohyb: false
      };
    });

    body.addEventListener('pointermove', (event) => {
      if (!pointerTap || pointerTap.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerTap.x, event.clientY - pointerTap.y) > 14) {
        pointerTap.pohyb = true;
      }
    });

    body.addEventListener('pointercancel', () => {
      pointerTap = null;
    });

    body.addEventListener('pointerup', (event) => {
      if (
        !pointerTap ||
        pointerTap.id !== event.pointerId ||
        pointerTap.pohyb ||
        performance.now() - pointerTap.cas > 320
      ) {
        pointerTap = null;
        return;
      }

      const ted = performance.now();
      const jeDvojtap = Boolean(
        posledniTap &&
        ted - posledniTap.cas <= 360 &&
        Math.hypot(event.clientX - posledniTap.x, event.clientY - posledniTap.y) <= 38
      );

      if (jeDvojtap) {
        posledniTap = null;
        if (event.cancelable) event.preventDefault();
        nastavDocViewerFullscreen(!docxViewerFullscreen);
      } else {
        posledniTap = { x: event.clientX, y: event.clientY, cas: ted };
      }

      pointerTap = null;
    });

    docxViewerPrvky = {
      overlay,
      close,
      copy,
      title,
      subtitle,
      body,
      loading,
      loadingText,
      content
    };
    return docxViewerPrvky;
  }

  async function kopirujSqlViewer() {
    const text = String(docxViewerSqlText || '');
    if (!text) {
      zobrazChybu('SQL', 'Není co kopírovat.');
      return;
    }

    let zkopirovano = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        zkopirovano = true;
      }
    } catch (_error) {}

    if (!zkopirovano) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      try {
        zkopirovano = document.execCommand('copy') === true;
      } catch (_error) {
        zkopirovano = false;
      }
      textarea.remove();
    }

    window.getSelection?.()?.removeAllRanges?.();
    if (zkopirovano) {
      zobrazZpravu('SQL', 'Celý SQL skript byl zkopírován.');
      window.LubaNoteStartupDiag?.zapis?.('SQL', `COPY | OK | chars=${text.length}`);
    } else {
      zobrazChybu('SQL', 'Kopírování se nepodařilo. Zkus označit text dlouhým stiskem.');
      window.LubaNoteStartupDiag?.zapis?.('SQL', 'COPY | ERROR');
    }
  }

  function nastavDocViewerFullscreen(ano) {
    if (!docxViewerPrvky) return;
    docxViewerFullscreen = ano === true;
    docxViewerPrvky.overlay.classList.toggle('is-fullscreen', docxViewerFullscreen);
  }

  function zavriDocxViewer() {
    if (!docxViewerPrvky) return;
    docxViewerOtevren = false;
    nastavDocViewerFullscreen(false);
    docxViewerPrvky.overlay.hidden = true;
    docxViewerPrvky.loading.hidden = true;
    docxViewerPrvky.copy.hidden = true;
    docxViewerSqlText = '';
    docxViewerPrvky.content.innerHTML = '';
    docxViewerPrvky.content.classList.remove('is-legacy-doc', 'is-sql');
    document.body.classList.remove('documents-docx-viewer-open');
    uvolniDocxObjectUrls();
  }

  async function otevriDocxViewer(record) {
    if (!(record?.blob instanceof Blob)) {
      throw new Error('DOCX data nejsou dostupná.');
    }

    const prvky = zajistiDocxViewer();
    uvolniDocxObjectUrls();
    nastavDocViewerFullscreen(false);
    prvky.title.textContent = record.name || 'dokument.docx';
    prvky.subtitle.textContent = 'DOCX · POUZE ČTENÍ';
    prvky.copy.hidden = true;
    docxViewerSqlText = '';
    prvky.loadingText.textContent = 'Otevírám DOCX…';
    prvky.content.classList.remove('is-legacy-doc', 'is-sql');
    prvky.content.innerHTML = '';
    prvky.loading.hidden = false;
    prvky.overlay.hidden = false;
    docxViewerOtevren = true;
    document.body.classList.add('documents-docx-viewer-open');

    try {
      const arrayBuffer = await record.blob.arrayBuffer();
      const vysledek = await parsujDocx(arrayBuffer);
      docxViewerObjectUrls = vysledek.objectUrls;
      prvky.content.innerHTML = vysledek.html || '<p class="documentsDocxEmpty">Dokument neobsahuje zobrazitelný obsah.</p>';
      prvky.loading.hidden = true;
      prvky.body.scrollTop = 0;
    } catch (error) {
      prvky.loading.hidden = true;
      zavriDocxViewer();
      throw error;
    }
  }

  async function otevriDocViewer(record) {
    if (!(record?.blob instanceof Blob)) {
      throw new Error('DOC data nejsou dostupná.');
    }
    if (!window.LubaNoteLegacyDoc?.parse) {
      throw new Error('Legacy DOC parser není načtený.');
    }

    const prvky = zajistiDocxViewer();
    uvolniDocxObjectUrls();
    nastavDocViewerFullscreen(false);
    prvky.title.textContent = record.name || 'dokument.doc';
    prvky.subtitle.textContent = 'DOC · POUZE ČTENÍ';
    prvky.copy.hidden = true;
    docxViewerSqlText = '';
    prvky.loadingText.textContent = 'Otevírám DOC…';
    prvky.content.classList.remove('is-sql');
    prvky.content.classList.add('is-legacy-doc');
    prvky.content.innerHTML = '';
    prvky.loading.hidden = false;
    prvky.overlay.hidden = false;
    docxViewerOtevren = true;
    document.body.classList.add('documents-docx-viewer-open');

    try {
      const arrayBuffer = await record.blob.arrayBuffer();
      const vysledek = await window.LubaNoteLegacyDoc.parse(arrayBuffer);
      const text = String(vysledek?.text || '');
      prvky.content.innerHTML = text
        ? `<pre class="documentsLegacyDocText">${esc(text)}</pre>`
        : '<p class="documentsDocxEmpty">Dokument neobsahuje čitelný text.</p>';
      prvky.loading.hidden = true;
      prvky.body.scrollTop = 0;
    } catch (error) {
      prvky.loading.hidden = true;
      zavriDocxViewer();
      throw error;
    }
  }

  async function otevriSqlViewer(record) {
    if (!(record?.blob instanceof Blob)) {
      throw new Error('SQL data nejsou dostupná.');
    }

    const prvky = zajistiDocxViewer();
    uvolniDocxObjectUrls();
    nastavDocViewerFullscreen(false);
    prvky.title.textContent = record.name || 'skript.sql';
    prvky.subtitle.textContent = 'SQL · POUZE ČTENÍ';
    prvky.copy.hidden = true;
    docxViewerSqlText = '';
    prvky.loadingText.textContent = 'Otevírám SQL…';
    prvky.content.classList.remove('is-legacy-doc');
    prvky.content.classList.add('is-sql');
    prvky.content.innerHTML = '';
    prvky.loading.hidden = false;
    prvky.overlay.hidden = false;
    docxViewerOtevren = true;
    document.body.classList.add('documents-docx-viewer-open');

    try {
      const maSqlText = typeof record.sqlText === 'string';
      window.LubaNoteStartupDiag?.zapis?.(
        'SQL',
        `OPEN | record | blob=${record?.blob instanceof Blob ? 'yes' : 'no'} sqlText=${maSqlText ? 'yes' : 'no'} storedChars=${maSqlText ? record.sqlText.length : -1} bytes=${Number(record?.size) || Number(record?.blob?.size) || 0}`
      );

      const text = maSqlText
        ? record.sqlText
        : await prectiSqlText(record.blob);

      window.LubaNoteStartupDiag?.zapis?.(
        'SQL',
        `OPEN | text | source=${maSqlText ? 'sqlText' : 'blob'} chars=${text.length} head=${JSON.stringify(text.slice(0, 40))}`
      );

      docxViewerSqlText = text;
      prvky.copy.hidden = !text;

      if (text) {
        const code = document.createElement('div');
        code.className = 'documentsSqlCode';
        code.setAttribute('role', 'textbox');
        code.setAttribute('aria-readonly', 'true');
        code.textContent = text;
        prvky.content.replaceChildren(code);

        requestAnimationFrame(() => {
          try {
            const styl = getComputedStyle(code);
            const rect = code.getBoundingClientRect();
            const contentRect = prvky.content.getBoundingClientRect();
            window.LubaNoteStartupDiag?.zapis?.(
              'SQL',
              `RENDER | chars=${code.textContent?.length || 0} children=${prvky.content.children.length} display=${styl.display} visibility=${styl.visibility} opacity=${styl.opacity} color=${styl.color} font=${styl.fontSize} rect=${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)} content=${Math.round(contentRect.width)}x${Math.round(contentRect.height)}`
            );
          } catch (error) {
            window.LubaNoteStartupDiag?.zapis?.('SQL', `RENDER | DIAG ERROR | ${error?.message || 'unknown'}`);
          }
        });
      } else {
        const empty = document.createElement('p');
        empty.className = 'documentsDocxEmpty';
        empty.textContent = 'SQL soubor je prázdný.';
        prvky.content.replaceChildren(empty);
      }

      prvky.loading.hidden = true;
      prvky.body.scrollTop = 0;
      prvky.body.scrollLeft = 0;
      prvky.content.scrollTop = 0;
      prvky.content.scrollLeft = 0;
    } catch (error) {
      prvky.loading.hidden = true;
      zavriDocxViewer();
      throw error;
    }
  }

  function normalizujEpubReaderNastaveni(vstup = {}) {
    const align = ['book', 'left', 'justify'].includes(vstup.align) ? vstup.align : EPUB_READER_DEFAULTS.align;
    const lineHeight = ['compact', 'normal', 'airy'].includes(vstup.lineHeight) ? vstup.lineHeight : EPUB_READER_DEFAULTS.lineHeight;
    const margins = ['narrow', 'normal', 'wide'].includes(vstup.margins) ? vstup.margins : EPUB_READER_DEFAULTS.margins;
    const theme = ['light', 'sepia', 'dark'].includes(vstup.theme) ? vstup.theme : EPUB_READER_DEFAULTS.theme;
    const font = ['book', 'sans', 'serif'].includes(vstup.font) ? vstup.font : EPUB_READER_DEFAULTS.font;
    const fontSize = Math.max(75, Math.min(160, Math.round((Number(vstup.fontSize) || 100) / 5) * 5));
    return { align, fontSize, lineHeight, margins, theme, font };
  }

  function nactiEpubReaderNastaveni() {
    try {
      const raw = localStorage.getItem(EPUB_READER_SETTINGS_KEY);
      if (!raw) return { ...EPUB_READER_DEFAULTS };
      return normalizujEpubReaderNastaveni(JSON.parse(raw));
    } catch (_error) {
      return { ...EPUB_READER_DEFAULTS };
    }
  }

  function ulozEpubReaderNastaveni() {
    try {
      localStorage.setItem(EPUB_READER_SETTINGS_KEY, JSON.stringify(epubReaderNastaveni));
    } catch (_error) {}
  }

  function aktualizujEpubReaderNastaveniUi() {
    if (!epubViewerPrvky?.settings) return;
    const settings = epubViewerPrvky.settings;
    settings.querySelectorAll('[data-reader-setting][data-reader-value]').forEach((button) => {
      const klic = button.dataset.readerSetting;
      const hodnota = button.dataset.readerValue;
      button.classList.toggle('active', String(epubReaderNastaveni[klic]) === hodnota);
      button.setAttribute('aria-pressed', String(epubReaderNastaveni[klic]) === hodnota ? 'true' : 'false');
    });
    if (epubViewerPrvky.fontSizeValue) {
      epubViewerPrvky.fontSizeValue.textContent = `${epubReaderNastaveni.fontSize} %`;
    }
  }

  function aplikujEpubReaderNastaveni() {
    if (!epubViewerPrvky) return;
    const { overlay, content } = epubViewerPrvky;
    const n = epubReaderNastaveni;

    for (const trida of Array.from(overlay.classList)) {
      if (/^reader-(align|line|margins|theme|font)-/.test(trida)) overlay.classList.remove(trida);
    }

    overlay.classList.add(`reader-align-${n.align}`);
    overlay.classList.add(`reader-line-${n.lineHeight}`);
    overlay.classList.add(`reader-margins-${n.margins}`);
    overlay.classList.add(`reader-theme-${n.theme}`);
    overlay.classList.add(`reader-font-${n.font}`);

    const zaklad = window.innerWidth <= 520 ? 16 : 17;
    content.style.setProperty('--epub-reader-font-size', `${(zaklad * n.fontSize / 100).toFixed(2)}px`);
    aktualizujEpubReaderNastaveniUi();
  }

  function zmenEpubReaderNastaveni(klic, hodnota) {
    epubReaderNastaveni = normalizujEpubReaderNastaveni({
      ...epubReaderNastaveni,
      [klic]: hodnota
    });
    ulozEpubReaderNastaveni();
    aplikujEpubReaderNastaveni();
  }

  function zavriEpubReaderNastaveni() {
    if (epubViewerPrvky?.settings) epubViewerPrvky.settings.hidden = true;
  }

  function normalizujEpubZalozky(vstup) {
    if (!Array.isArray(vstup)) return [];
    return vstup.map((polozka) => ({
      id: String(polozka?.id || id()),
      chapterIndex: Math.max(0, Math.round(Number(polozka?.chapterIndex) || 0)),
      scrollRatio: Math.max(0, Math.min(1, Number(polozka?.scrollRatio) || 0)),
      chapterTitle: String(polozka?.chapterTitle || ''),
      createdAt: Number(polozka?.createdAt) || Date.now()
    })).filter((polozka) => polozka.id);
  }

  function normalizujEpubZvyrazneni(vstup) {
    if (!Array.isArray(vstup)) return [];
    const povoleneBarvy = new Set(['yellow', 'green', 'blue', 'violet']);
    return vstup.map((polozka) => {
      const start = Math.max(0, Math.round(Number(polozka?.start) || 0));
      const end = Math.max(start, Math.round(Number(polozka?.end) || 0));
      return {
        id: String(polozka?.id || id()),
        chapterIndex: Math.max(0, Math.round(Number(polozka?.chapterIndex) || 0)),
        start,
        end,
        quote: String(polozka?.quote || '').slice(0, 500),
        note: String(polozka?.note || '').slice(0, 2000),
        color: povoleneBarvy.has(polozka?.color) ? polozka.color : 'yellow',
        createdAt: Number(polozka?.createdAt) || Date.now()
      };
    }).filter((polozka) => polozka.id && polozka.end > polozka.start);
  }

  async function ulozEpubAnotace() {
    if (!epubAktualniRecordId) return;
    try {
      const record = await nactiSoubor(epubAktualniRecordId);
      if (!record || !jeEpubSoubor(record)) return;
      record.epubBookmarks = epubZalozky.map((polozka) => ({ ...polozka }));
      record.epubHighlights = epubZvyrazneni.map((polozka) => ({ ...polozka }));
      await ulozDoStore(STORE_FILES, record);
    } catch (error) {
      console.warn('Uložení EPUB záložek/označení selhalo:', error);
    }
  }

  function epubScrollRatioTed() {
    if (!epubViewerPrvky?.body) return 0;
    const maxScroll = Math.max(0, epubViewerPrvky.body.scrollHeight - epubViewerPrvky.body.clientHeight);
    return maxScroll > 0 ? Math.max(0, Math.min(1, epubViewerPrvky.body.scrollTop / maxScroll)) : 0;
  }

  function epubKapitolaNazev(index = epubAktualniKapitola) {
    return String(epubAktualniKniha?.chapters?.[index]?.title || `Kapitola ${Number(index) + 1}`);
  }

  function skryjEpubVyberBar() {
    window.getSelection?.()?.removeAllRanges?.();
    epubVyberTextu = null;
    epubVybraneZvyrazneniId = null;
    if (!epubViewerPrvky?.selectionBar) return;
    epubViewerPrvky.selectionBar.hidden = true;
    epubViewerPrvky.selectionColors.hidden = false;
    epubViewerPrvky.selectionNote.hidden = true;
    epubViewerPrvky.selectionRemove.hidden = true;
  }

  function zavriEpubAnotacePanel() {
    if (epubViewerPrvky?.marks) epubViewerPrvky.marks.hidden = true;
  }

  function textovyOffsetEpub(root, node, offset) {
    if (!root || !node || !root.contains(node)) return null;
    try {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (_error) {
      return null;
    }
  }

  function rozsahKolidujeSeZvyraznenim(range) {
    const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const endEl = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    if (startEl?.closest?.('.documentsEpubHighlight') || endEl?.closest?.('.documentsEpubHighlight')) return true;
    try {
      return Boolean(range.cloneContents().querySelector?.('.documentsEpubHighlight'));
    } catch (_error) {
      return false;
    }
  }

  function zachytEpubVyberTextu() {
    if (!epubViewerOtevren || !epubViewerPrvky?.content || !epubViewerPrvky.selectionBar) return;
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const root = epubViewerPrvky.content;
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    if (rozsahKolidujeSeZvyraznenim(range)) return;
    const quote = String(range.toString() || '');
    if (!quote.trim()) return;
    const start = textovyOffsetEpub(root, range.startContainer, range.startOffset);
    const end = textovyOffsetEpub(root, range.endContainer, range.endOffset);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    epubVyberTextu = { start, end, quote: quote.slice(0, 500) };
    epubVybraneZvyrazneniId = null;
    epubViewerPrvky.selectionColors.hidden = false;
    epubViewerPrvky.selectionNote.hidden = true;
    epubViewerPrvky.selectionRemove.hidden = true;
    epubViewerPrvky.selectionBar.hidden = false;
  }

  function rozbalEpubZvyrazneniDom() {
    if (!epubViewerPrvky?.content) return;
    const znacky = Array.from(epubViewerPrvky.content.querySelectorAll('.documentsEpubHighlight'));
    const rodice = new Set();
    znacky.forEach((znacka) => {
      const parent = znacka.parentNode;
      if (!parent) return;
      rodice.add(parent);
      while (znacka.firstChild) parent.insertBefore(znacka.firstChild, znacka);
      znacka.remove();
    });
    rodice.forEach((parent) => parent.normalize?.());
  }

  function textoveUsekyEpub(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const useky = [];
    let pozice = 0;
    let node = walker.nextNode();
    while (node) {
      const delka = node.nodeValue?.length || 0;
      const od = Math.max(0, start - pozice);
      const doPozice = Math.min(delka, end - pozice);
      if (od < doPozice) useky.push({ node, start: od, end: doPozice });
      pozice += delka;
      if (pozice >= end) break;
      node = walker.nextNode();
    }
    return useky;
  }

  function obalEpubTextovyUsek(usek, polozka) {
    let node = usek.node;
    if (!node?.parentNode) return;
    if (usek.end < node.nodeValue.length) node.splitText(usek.end);
    if (usek.start > 0) node = node.splitText(usek.start);
    const mark = document.createElement('mark');
    mark.className = `documentsEpubHighlight is-${polozka.color}`;
    mark.dataset.epubHighlightId = polozka.id;
    mark.title = 'Klepnutím lze označení odstranit';
    node.parentNode.insertBefore(mark, node);
    mark.appendChild(node);
  }

  function aplikujEpubZvyrazneni() {
    if (!epubViewerPrvky?.content) return;
    rozbalEpubZvyrazneniDom();
    const polozky = epubZvyrazneni
      .filter((polozka) => polozka.chapterIndex === epubAktualniKapitola)
      .sort((a, b) => b.start - a.start || b.end - a.end);
    polozky.forEach((polozka) => {
      const useky = textoveUsekyEpub(epubViewerPrvky.content, polozka.start, polozka.end);
      for (let index = useky.length - 1; index >= 0; index -= 1) {
        obalEpubTextovyUsek(useky[index], polozka);
      }
    });
  }

  async function pridejEpubZvyrazneni(barva) {
    if (!epubVyberTextu) return;
    const vyber = epubVyberTextu;
    epubZvyrazneni.push({
      id: id(),
      chapterIndex: epubAktualniKapitola,
      start: vyber.start,
      end: vyber.end,
      quote: vyber.quote,
      note: '',
      color: ['yellow', 'green', 'blue', 'violet'].includes(barva) ? barva : 'yellow',
      createdAt: Date.now()
    });
    window.getSelection?.()?.removeAllRanges?.();
    skryjEpubVyberBar();
    aplikujEpubZvyrazneni();
    await ulozEpubAnotace();
  }

  async function odstranEpubZvyrazneni(idZvyrazneni) {
    const idHodnota = String(idZvyrazneni || '');
    if (!idHodnota) return;
    epubZvyrazneni = epubZvyrazneni.filter((polozka) => polozka.id !== idHodnota);
    skryjEpubVyberBar();
    aplikujEpubZvyrazneni();
    await ulozEpubAnotace();
    vykresliEpubAnotacePanel();
  }

  async function pridejEpubZalozku() {
    const ratio = epubScrollRatioTed();
    const chapterIndex = epubAktualniKapitola;
    const existuje = epubZalozky.some((polozka) => (
      polozka.chapterIndex === chapterIndex && Math.abs(polozka.scrollRatio - ratio) < 0.012
    ));
    if (!existuje) {
      epubZalozky.push({
        id: id(),
        chapterIndex,
        scrollRatio: ratio,
        chapterTitle: epubKapitolaNazev(chapterIndex),
        createdAt: Date.now()
      });
      await ulozEpubAnotace();
    }
    vykresliEpubAnotacePanel();
  }

  async function odstranEpubZalozku(idZalozky) {
    epubZalozky = epubZalozky.filter((polozka) => polozka.id !== String(idZalozky || ''));
    await ulozEpubAnotace();
    vykresliEpubAnotacePanel();
  }

  function kratkyEpubCitace(text) {
    const cisty = String(text || '').replace(/\s+/g, ' ').trim();
    if (cisty.length <= 90) return cisty;
    return `${cisty.slice(0, 87)}…`;
  }

  function kratkyEpubPoznamka(text) {
    const cisty = String(text || '').replace(/\s+/g, ' ').trim();
    if (cisty.length <= 110) return cisty;
    return `${cisty.slice(0, 107)}…`;
  }

  function otevriEpubPoznamku(idZvyrazneni) {
    const polozka = epubZvyrazneni.find((item) => item.id === String(idZvyrazneni || ''));
    if (!polozka || !epubViewerPrvky?.noteDialog) return;
    epubViewerPrvky.noteDialog.dataset.highlightId = polozka.id;
    epubViewerPrvky.noteQuote.textContent = kratkyEpubCitace(polozka.quote);
    epubViewerPrvky.noteInput.value = polozka.note || '';
    epubViewerPrvky.noteDialog.hidden = false;
    /* PATCH 646A – LubaKeyboard: nový aria-modal nejdřív musí projít
       společným modal guardem. Focus proto pustíme až v dalším frame;
       jinak guard klávesnici otevřenou focusin eventem okamžitě schová. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => epubViewerPrvky.noteInput.focus());
    });
  }

  function zavriEpubPoznamku() {
    if (!epubViewerPrvky?.noteDialog) return;
    epubViewerPrvky.noteDialog.hidden = true;
    epubViewerPrvky.noteDialog.dataset.highlightId = '';
  }

  async function ulozEpubPoznamku() {
    const idZvyrazneni = epubViewerPrvky?.noteDialog?.dataset?.highlightId || '';
    const polozka = epubZvyrazneni.find((item) => item.id === idZvyrazneni);
    if (!polozka) return zavriEpubPoznamku();
    polozka.note = String(epubViewerPrvky.noteInput.value || '').trim().slice(0, 2000);
    await ulozEpubAnotace();
    zavriEpubPoznamku();
    vykresliEpubAnotacePanel();
  }

  function vykresliEpubAnotacePanel() {
    if (!epubViewerPrvky?.marksList) return;
    const zalozky = [...epubZalozky].sort((a, b) => a.chapterIndex - b.chapterIndex || a.scrollRatio - b.scrollRatio);
    const zvyrazneni = [...epubZvyrazneni].sort((a, b) => a.chapterIndex - b.chapterIndex || a.start - b.start);
    const zalozkyHtml = zalozky.length ? zalozky.map((polozka) => {
      const procenta = Math.round((Number(polozka.scrollRatio) || 0) * 100);
      return `<div class="documentsEpubMarkRow"><button type="button" class="documentsEpubMarkOpen" data-epub-bookmark-open="${esc(polozka.id)}"><strong>${esc(polozka.chapterTitle || epubKapitolaNazev(polozka.chapterIndex))}</strong><span>${procenta} %</span></button><button type="button" class="documentsEpubMarkDelete" data-epub-bookmark-delete="${esc(polozka.id)}" aria-label="Smazat záložku">×</button></div>`;
    }).join('') : '<p class="documentsEpubMarksEmpty">Zatím žádná záložka.</p>';
    const zvyrazneniHtml = zvyrazneni.length ? zvyrazneni.map((polozka) => (
      `<div class="documentsEpubMarkRow documentsEpubHighlightRow"><button type="button" class="documentsEpubMarkOpen" data-epub-highlight-open="${esc(polozka.id)}"><i class="documentsEpubMarkColor is-${esc(polozka.color)}" aria-hidden="true"></i><div class="documentsEpubMarkBody"><strong>${esc(kratkyEpubCitace(polozka.quote) || epubKapitolaNazev(polozka.chapterIndex))}</strong><div class="documentsEpubMarkMeta"><small class="documentsEpubMarkType">${polozka.note ? '📝 S poznámkou' : 'Označení'}</small><span>${esc(epubKapitolaNazev(polozka.chapterIndex))}</span></div>${polozka.note ? `<em class="documentsEpubMarkNote">${esc(kratkyEpubPoznamka(polozka.note))}</em>` : ''}</div></button><button type="button" class="documentsEpubMarkEditNote" data-epub-highlight-note="${esc(polozka.id)}" aria-label="${polozka.note ? 'Upravit poznámku' : 'Přidat poznámku'}">📝</button><button type="button" class="documentsEpubMarkDelete" data-epub-highlight-delete="${esc(polozka.id)}" aria-label="Smazat označení">×</button></div>`
    )).join('') : '<p class="documentsEpubMarksEmpty">Zatím žádné označení.</p>';
    epubViewerPrvky.marksList.innerHTML = `<section><h4>Záložky</h4>${zalozkyHtml}</section><section><h4>Označení</h4>${zvyrazneniHtml}</section>`;
  }

  function uvolniEpubKapitolaUrls() {
    for (const url of epubKapitolaObjectUrls) {
      try { URL.revokeObjectURL(url); } catch (_error) {}
    }
    epubKapitolaObjectUrls = [];
  }

  function nastavEpubFullscreen(ano) {
    if (!epubViewerPrvky) return;
    epubViewerFullscreen = ano === true;
    if (epubViewerFullscreen) {
      epubViewerPrvky.toc.hidden = true;
      zavriEpubReaderNastaveni();
      zavriEpubAnotacePanel();
      skryjEpubVyberBar();
    }
    epubViewerPrvky.overlay.classList.toggle('is-fullscreen', epubViewerFullscreen);
  }

  async function ulozEpubPoziciTed() {
    if (!epubViewerOtevren || !epubAktualniRecordId || !epubViewerPrvky) return;
    const recordId = epubAktualniRecordId;
    const chapterIndex = epubAktualniKapitola;
    const maxScroll = Math.max(0, epubViewerPrvky.body.scrollHeight - epubViewerPrvky.body.clientHeight);
    const scrollRatio = maxScroll > 0 ? epubViewerPrvky.body.scrollTop / maxScroll : 0;
    try {
      const record = await nactiSoubor(recordId);
      if (!record || !jeEpubSoubor(record)) return;
      record.epubChapterIndex = chapterIndex;
      record.epubScrollRatio = Math.max(0, Math.min(1, Number(scrollRatio) || 0));
      record.epubLastReadAt = Date.now();
      await ulozDoStore(STORE_FILES, record);
    } catch (error) {
      console.warn('Uložení pozice EPUB selhalo:', error);
    }
  }

  function naplanujUlozeniEpubPozice() {
    clearTimeout(epubUlozPoziciTimer);
    epubUlozPoziciTimer = setTimeout(() => {
      epubUlozPoziciTimer = null;
      void ulozEpubPoziciTed();
    }, 420);
  }

  function zavriEpubViewer() {
    if (!epubViewerPrvky) return;
    clearTimeout(epubUlozPoziciTimer);
    epubUlozPoziciTimer = null;
    if (epubViewerOtevren) void ulozEpubPoziciTed();
    epubViewerOtevren = false;
    nastavEpubFullscreen(false);
    epubViewerPrvky.overlay.hidden = true;
    epubViewerPrvky.toc.hidden = true;
    zavriEpubReaderNastaveni();
    zavriEpubAnotacePanel();
    zavriEpubPoznamku();
    skryjEpubVyberBar();
    epubViewerPrvky.loading.hidden = true;
    epubViewerPrvky.content.innerHTML = '';
    document.body.classList.remove('documents-epub-viewer-open');
    uvolniEpubKapitolaUrls();
    epubAktualniKniha = null;
    epubAktualniRecordId = null;
    epubAktualniKapitola = 0;
    epubZalozky = [];
    epubZvyrazneni = [];
  }

  async function zobrazEpubKapitolu(index, options = {}) {
    if (!epubAktualniKniha || !epubViewerPrvky) return;
    const pocet = epubAktualniKniha.chapters.length;
    if (!pocet) return;
    const cil = Math.max(0, Math.min(pocet - 1, Number(index) || 0));
    const ratio = Math.max(0, Math.min(1, Number(options.ratio) || 0));
    const fragment = String(options.fragment || '');
    const highlightId = String(options.highlightId || '');

    epubViewerPrvky.loading.hidden = false;
    epubViewerPrvky.loadingText.textContent = 'Otevírám kapitolu…';
    uvolniEpubKapitolaUrls();

    const rendered = await epubAktualniKniha.renderChapter(cil);
    epubAktualniKapitola = rendered.index;
    epubKapitolaObjectUrls = rendered.objectUrls || [];
    epubViewerPrvky.content.innerHTML = rendered.html || '<p class="documentsEpubEmpty">Kapitola neobsahuje zobrazitelný text.</p>';
    epubViewerPrvky.chapter.textContent = rendered.chapter?.title || `Kapitola ${epubAktualniKapitola + 1}`;
    epubViewerPrvky.counter.textContent = `${epubAktualniKapitola + 1} / ${pocet}`;
    epubViewerPrvky.prev.disabled = epubAktualniKapitola <= 0;
    epubViewerPrvky.next.disabled = epubAktualniKapitola >= pocet - 1;
    aplikujEpubZvyrazneni();
    skryjEpubVyberBar();
    epubViewerPrvky.loading.hidden = true;

    requestAnimationFrame(() => {
      if (!epubViewerPrvky || !epubViewerOtevren) return;
      if (highlightId) {
        const cilovy = epubViewerPrvky.content.querySelector(`[data-epub-highlight-id="${CSS.escape(highlightId)}"]`);
        if (cilovy) cilovy.scrollIntoView({ block: 'center' });
        else epubViewerPrvky.body.scrollTop = 0;
      } else if (fragment) {
        let cilovy = null;
        try { cilovy = epubViewerPrvky.content.querySelector(`#${CSS.escape(fragment)}`); } catch (_error) {}
        if (cilovy) {
          cilovy.scrollIntoView({ block: 'start' });
        } else {
          epubViewerPrvky.body.scrollTop = 0;
        }
      } else if (ratio > 0) {
        const nastav = () => {
          const maxScroll = Math.max(0, epubViewerPrvky.body.scrollHeight - epubViewerPrvky.body.clientHeight);
          epubViewerPrvky.body.scrollTop = maxScroll * ratio;
        };
        nastav();
        setTimeout(nastav, 120);
      } else {
        epubViewerPrvky.body.scrollTop = 0;
      }
    });

    naplanujUlozeniEpubPozice();
  }

  function vykresliEpubObsah() {
    if (!epubViewerPrvky || !epubAktualniKniha) return;
    epubViewerPrvky.tocList.innerHTML = epubAktualniKniha.chapters.map((chapter, index) => `
      <button type="button" class="documentsEpubTocItem${index === epubAktualniKapitola ? ' active' : ''}" data-epub-chapter="${index}">
        <span>${index + 1}</span><strong>${esc(chapter.title || `Kapitola ${index + 1}`)}</strong>
      </button>`).join('');

    epubViewerPrvky.tocList.querySelectorAll('[data-epub-chapter]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.epubChapter);
        epubViewerPrvky.toc.hidden = true;
        void zobrazEpubKapitolu(index, { ratio: 0 });
      });
    });
  }

  function zajistiEpubViewer() {
    if (epubViewerPrvky) return epubViewerPrvky;

    const overlay = document.createElement('div');
    overlay.id = 'documentsEpubViewer';
    overlay.className = 'documentsEpubViewer';
    overlay.hidden = true;
    overlay.innerHTML = `
      <header class="documentsEpubHeader">
        <button type="button" class="documentsEpubClose" aria-label="Zavřít knihu">‹</button>
        <div class="documentsEpubTitle">
          <strong></strong>
          <small class="documentsEpubAuthor"></small>
          <span class="documentsEpubChapter"></span>
        </div>
        <div class="documentsEpubHeaderActions">
          <button type="button" class="documentsEpubSettingsButton" aria-label="Nastavení čtení" title="Nastavení čtení">Aa</button>
          <button type="button" class="documentsEpubMarksButton" aria-label="Záložky a označení" title="Záložky a označení">🔖</button>
          <button type="button" class="documentsEpubTocButton" aria-label="Obsah knihy" title="Obsah">☰</button>
        </div>
      </header>
      <main class="documentsEpubBody">
        <div class="documentsEpubLoading" hidden>
          <span class="documentsDocxSpinner" aria-hidden="true"></span>
          <strong>Otevírám EPUB…</strong>
        </div>
        <article class="documentsEpubContent"></article>
      </main>
      <footer class="documentsEpubNav">
        <button type="button" class="documentsEpubPrev">‹ Předchozí</button>
        <span class="documentsEpubCounter"></span>
        <button type="button" class="documentsEpubNext">Další ›</button>
      </footer>
      <div class="documentsEpubToc" hidden>
        <section class="documentsEpubTocPanel" role="dialog" aria-modal="true" aria-label="Obsah knihy">
          <div class="documentsEpubTocHeader"><strong>Obsah</strong><button type="button" class="documentsEpubTocClose" aria-label="Zavřít obsah">×</button></div>
          <div class="documentsEpubTocList"></div>
        </section>
      </div>
      <div class="documentsEpubSettings" hidden>
        <section class="documentsEpubSettingsPanel" role="dialog" aria-modal="true" aria-label="Nastavení čtení">
          <div class="documentsEpubSettingsHeader"><strong>Nastavení čtení</strong><button type="button" class="documentsEpubSettingsClose" aria-label="Zavřít nastavení">×</button></div>
          <div class="documentsEpubSettingsBody">
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Zarovnání</span>
              <div class="documentsEpubSettingChoices">
                <button type="button" data-reader-setting="align" data-reader-value="book">Kniha</button>
                <button type="button" data-reader-setting="align" data-reader-value="left">Vlevo</button>
                <button type="button" data-reader-setting="align" data-reader-value="justify">Do bloku</button>
              </div>
            </div>
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Velikost písma</span>
              <div class="documentsEpubFontSizeControl">
                <button type="button" class="documentsEpubFontMinus" aria-label="Zmenšit písmo">−</button>
                <strong class="documentsEpubFontSizeValue">100 %</strong>
                <button type="button" class="documentsEpubFontPlus" aria-label="Zvětšit písmo">+</button>
              </div>
            </div>
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Řádkování</span>
              <div class="documentsEpubSettingChoices">
                <button type="button" data-reader-setting="lineHeight" data-reader-value="compact">Menší</button>
                <button type="button" data-reader-setting="lineHeight" data-reader-value="normal">Normální</button>
                <button type="button" data-reader-setting="lineHeight" data-reader-value="airy">Vzdušné</button>
              </div>
            </div>
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Okraje textu</span>
              <div class="documentsEpubSettingChoices">
                <button type="button" data-reader-setting="margins" data-reader-value="narrow">Úzké</button>
                <button type="button" data-reader-setting="margins" data-reader-value="normal">Normální</button>
                <button type="button" data-reader-setting="margins" data-reader-value="wide">Široké</button>
              </div>
            </div>
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Pozadí</span>
              <div class="documentsEpubSettingChoices">
                <button type="button" data-reader-setting="theme" data-reader-value="light">Světlé</button>
                <button type="button" data-reader-setting="theme" data-reader-value="sepia">Sépie</button>
                <button type="button" data-reader-setting="theme" data-reader-value="dark">Tmavé</button>
              </div>
            </div>
            <div class="documentsEpubSettingRow">
              <span class="documentsEpubSettingLabel">Písmo</span>
              <div class="documentsEpubSettingChoices">
                <button type="button" data-reader-setting="font" data-reader-value="book">Kniha</button>
                <button type="button" data-reader-setting="font" data-reader-value="serif">Patkové</button>
                <button type="button" data-reader-setting="font" data-reader-value="sans">Bezpatkové</button>
              </div>
            </div>
            <button type="button" class="documentsEpubSettingsReset">Obnovit výchozí</button>
          </div>
        </section>
      </div>
      <div class="documentsEpubMarks" hidden>
        <section class="documentsEpubMarksPanel" role="dialog" aria-modal="true" aria-label="Záložky a označení">
          <div class="documentsEpubMarksHeader"><strong>Záložky a označení</strong><button type="button" class="documentsEpubMarksClose" aria-label="Zavřít">×</button></div>
          <div class="documentsEpubMarksBody">
            <button type="button" class="documentsEpubAddBookmark">＋ Přidat záložku tady</button>
            <div class="documentsEpubMarksList"></div>
          </div>
        </section>
      </div>
      <div class="documentsEpubNoteDialog" hidden>
        <section class="documentsEpubNotePanel" role="dialog" aria-modal="true" aria-label="Poznámka k označení">
          <div class="documentsEpubNoteHeader"><strong>Poznámka k označení</strong><button type="button" class="documentsEpubNoteClose" aria-label="Zavřít">×</button></div>
          <p class="documentsEpubNoteQuote"></p>
          <textarea class="documentsEpubNoteInput" maxlength="2000" rows="5" placeholder="Napiš vlastní poznámku…" autocomplete="off" spellcheck="true" data-luba-keyboard-field="epub-highlight-note"></textarea>
          <div class="documentsEpubNoteActions"><button type="button" class="documentsEpubNoteCancel">Zrušit</button><button type="button" class="documentsEpubNoteSave">Uložit</button></div>
        </section>
      </div>
      <div class="documentsEpubSelectionBar" hidden>
        <div class="documentsEpubSelectionColors" aria-label="Barva označení">
          <button type="button" data-epub-highlight-color="yellow" aria-label="Žluté označení"></button>
          <button type="button" data-epub-highlight-color="green" aria-label="Zelené označení"></button>
          <button type="button" data-epub-highlight-color="blue" aria-label="Modré označení"></button>
          <button type="button" data-epub-highlight-color="violet" aria-label="Fialové označení"></button>
        </div>
        <button type="button" class="documentsEpubSelectionNote" hidden>📝 Poznámka</button>
        <button type="button" class="documentsEpubSelectionRemove" hidden>Odstranit označení</button>
        <button type="button" class="documentsEpubSelectionClose" aria-label="Zavřít">×</button>
      </div>`;

    document.body.appendChild(overlay);
    const close = overlay.querySelector('.documentsEpubClose');
    const title = overlay.querySelector('.documentsEpubTitle strong');
    const author = overlay.querySelector('.documentsEpubAuthor');
    const chapter = overlay.querySelector('.documentsEpubChapter');
    const settingsButton = overlay.querySelector('.documentsEpubSettingsButton');
    const marksButton = overlay.querySelector('.documentsEpubMarksButton');
    const tocButton = overlay.querySelector('.documentsEpubTocButton');
    const body = overlay.querySelector('.documentsEpubBody');
    const loading = overlay.querySelector('.documentsEpubLoading');
    const loadingText = overlay.querySelector('.documentsEpubLoading strong');
    const content = overlay.querySelector('.documentsEpubContent');
    const prev = overlay.querySelector('.documentsEpubPrev');
    const next = overlay.querySelector('.documentsEpubNext');
    const counter = overlay.querySelector('.documentsEpubCounter');
    const toc = overlay.querySelector('.documentsEpubToc');
    const tocList = overlay.querySelector('.documentsEpubTocList');
    const tocClose = overlay.querySelector('.documentsEpubTocClose');
    const settings = overlay.querySelector('.documentsEpubSettings');
    const settingsClose = overlay.querySelector('.documentsEpubSettingsClose');
    const fontMinus = overlay.querySelector('.documentsEpubFontMinus');
    const fontPlus = overlay.querySelector('.documentsEpubFontPlus');
    const fontSizeValue = overlay.querySelector('.documentsEpubFontSizeValue');
    const settingsReset = overlay.querySelector('.documentsEpubSettingsReset');
    const marks = overlay.querySelector('.documentsEpubMarks');
    const marksClose = overlay.querySelector('.documentsEpubMarksClose');
    const marksList = overlay.querySelector('.documentsEpubMarksList');
    const addBookmark = overlay.querySelector('.documentsEpubAddBookmark');
    const noteDialog = overlay.querySelector('.documentsEpubNoteDialog');
    const noteQuote = overlay.querySelector('.documentsEpubNoteQuote');
    const noteInput = overlay.querySelector('.documentsEpubNoteInput');
    const noteClose = overlay.querySelector('.documentsEpubNoteClose');
    const noteCancel = overlay.querySelector('.documentsEpubNoteCancel');
    const noteSave = overlay.querySelector('.documentsEpubNoteSave');
    const selectionBar = overlay.querySelector('.documentsEpubSelectionBar');
    const selectionColors = overlay.querySelector('.documentsEpubSelectionColors');
    const selectionNote = overlay.querySelector('.documentsEpubSelectionNote');
    const selectionRemove = overlay.querySelector('.documentsEpubSelectionRemove');
    const selectionClose = overlay.querySelector('.documentsEpubSelectionClose');

    close.addEventListener('click', zavriEpubViewer);
    prev.addEventListener('click', () => void zobrazEpubKapitolu(epubAktualniKapitola - 1, { ratio: 0 }));
    next.addEventListener('click', () => void zobrazEpubKapitolu(epubAktualniKapitola + 1, { ratio: 0 }));
    settingsButton.addEventListener('click', () => {
      toc.hidden = true;
      marks.hidden = true;
      skryjEpubVyberBar();
      aktualizujEpubReaderNastaveniUi();
      settings.hidden = false;
    });
    marksButton.addEventListener('click', () => {
      toc.hidden = true;
      settings.hidden = true;
      skryjEpubVyberBar();
      vykresliEpubAnotacePanel();
      marks.hidden = false;
    });
    settingsClose.addEventListener('click', zavriEpubReaderNastaveni);
    settings.addEventListener('pointerdown', (event) => {
      if (event.target === settings) zavriEpubReaderNastaveni();
    });
    settings.addEventListener('click', (event) => {
      const volba = event.target.closest?.('[data-reader-setting][data-reader-value]');
      if (!volba) return;
      zmenEpubReaderNastaveni(volba.dataset.readerSetting, volba.dataset.readerValue);
    });
    fontMinus.addEventListener('click', () => zmenEpubReaderNastaveni('fontSize', epubReaderNastaveni.fontSize - 5));
    fontPlus.addEventListener('click', () => zmenEpubReaderNastaveni('fontSize', epubReaderNastaveni.fontSize + 5));
    settingsReset.addEventListener('click', () => {
      epubReaderNastaveni = { ...EPUB_READER_DEFAULTS };
      ulozEpubReaderNastaveni();
      aplikujEpubReaderNastaveni();
    });
    tocButton.addEventListener('click', () => {
      settings.hidden = true;
      marks.hidden = true;
      skryjEpubVyberBar();
      vykresliEpubObsah();
      toc.hidden = false;
    });
    tocClose.addEventListener('click', () => { toc.hidden = true; });
    toc.addEventListener('pointerdown', (event) => {
      if (event.target === toc) toc.hidden = true;
    });
    marksClose.addEventListener('click', zavriEpubAnotacePanel);
    marks.addEventListener('pointerdown', (event) => {
      if (event.target === marks) zavriEpubAnotacePanel();
    });
    addBookmark.addEventListener('click', () => void pridejEpubZalozku());
    marksList.addEventListener('click', (event) => {
      const otevritZalozku = event.target.closest?.('[data-epub-bookmark-open]');
      if (otevritZalozku) {
        const polozka = epubZalozky.find((item) => item.id === otevritZalozku.dataset.epubBookmarkOpen);
        if (!polozka) return;
        marks.hidden = true;
        void zobrazEpubKapitolu(polozka.chapterIndex, { ratio: polozka.scrollRatio });
        return;
      }
      const smazatZalozku = event.target.closest?.('[data-epub-bookmark-delete]');
      if (smazatZalozku) {
        void odstranEpubZalozku(smazatZalozku.dataset.epubBookmarkDelete);
        return;
      }
      const otevritZvyrazneni = event.target.closest?.('[data-epub-highlight-open]');
      if (otevritZvyrazneni) {
        const polozka = epubZvyrazneni.find((item) => item.id === otevritZvyrazneni.dataset.epubHighlightOpen);
        if (!polozka) return;
        marks.hidden = true;
        void zobrazEpubKapitolu(polozka.chapterIndex, { highlightId: polozka.id });
        return;
      }
      const upravitPoznamku = event.target.closest?.('[data-epub-highlight-note]');
      if (upravitPoznamku) {
        otevriEpubPoznamku(upravitPoznamku.dataset.epubHighlightNote);
        return;
      }
      const smazatZvyrazneni = event.target.closest?.('[data-epub-highlight-delete]');
      if (smazatZvyrazneni) void odstranEpubZvyrazneni(smazatZvyrazneni.dataset.epubHighlightDelete);
    });
    selectionColors.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-epub-highlight-color]');
      if (button) void pridejEpubZvyrazneni(button.dataset.epubHighlightColor);
    });
    noteClose.addEventListener('click', zavriEpubPoznamku);
    noteCancel.addEventListener('click', zavriEpubPoznamku);
    noteSave.addEventListener('click', () => void ulozEpubPoznamku());
    noteDialog.addEventListener('pointerdown', (event) => {
      if (event.target === noteDialog) zavriEpubPoznamku();
    });
    selectionNote.addEventListener('click', () => {
      if (epubVybraneZvyrazneniId) otevriEpubPoznamku(epubVybraneZvyrazneniId);
    });
    selectionRemove.addEventListener('click', () => {
      if (epubVybraneZvyrazneniId) void odstranEpubZvyrazneni(epubVybraneZvyrazneniId);
    });
    selectionClose.addEventListener('click', () => {
      window.getSelection?.()?.removeAllRanges?.();
      skryjEpubVyberBar();
    });

    body.addEventListener('scroll', naplanujUlozeniEpubPozice, { passive: true });

    content.addEventListener('click', (event) => {
      const highlight = event.target.closest?.('.documentsEpubHighlight[data-epub-highlight-id]');
      if (highlight) {
        epubVyberTextu = null;
        epubVybraneZvyrazneniId = highlight.dataset.epubHighlightId || null;
        selectionColors.hidden = true;
        selectionNote.hidden = false;
        selectionRemove.hidden = false;
        selectionBar.hidden = false;
        return;
      }
      const link = event.target.closest?.('a[data-epub-link]');
      if (!link || !epubAktualniKniha) return;
      event.preventDefault();
      const current = epubAktualniKniha.chapters[epubAktualniKapitola]?.href || '';
      const cil = epubAktualniKniha.resolveLink(link.dataset.epubLink, current);
      if (cil.index < 0) return;
      if (cil.index === epubAktualniKapitola && cil.fragment) {
        let el = null;
        try { el = content.querySelector(`#${CSS.escape(cil.fragment)}`); } catch (_error) {}
        el?.scrollIntoView?.({ block: 'start' });
        return;
      }
      void zobrazEpubKapitolu(cil.index, { ratio: 0, fragment: cil.fragment });
    });

    content.addEventListener('pointerup', () => setTimeout(zachytEpubVyberTextu, 0));
    content.addEventListener('keyup', () => setTimeout(zachytEpubVyberTextu, 0));
    document.addEventListener('selectionchange', () => {
      if (!epubViewerOtevren) return;
      setTimeout(zachytEpubVyberTextu, 0);
    });

    // Stejný 2× tap fullscreen jako PDF/DOCX/DOC; ve fullscreenu není šipka.
    let pointerTap = null;
    let posledniTap = null;
    body.addEventListener('pointerdown', (event) => {
      if (!epubViewerOtevren || event.pointerType !== 'touch') return;
      if (event.target.closest?.('a,button,.documentsEpubHighlight')) return;
      pointerTap = { id: event.pointerId, x: event.clientX, y: event.clientY, cas: performance.now(), pohyb: false };
    });
    body.addEventListener('pointermove', (event) => {
      if (!pointerTap || pointerTap.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerTap.x, event.clientY - pointerTap.y) > 14) pointerTap.pohyb = true;
    });
    body.addEventListener('pointercancel', () => { pointerTap = null; });
    body.addEventListener('pointerup', (event) => {
      if (!pointerTap || pointerTap.id !== event.pointerId || pointerTap.pohyb || performance.now() - pointerTap.cas > 320) {
        pointerTap = null;
        return;
      }
      const ted = performance.now();
      const jeDvojtap = Boolean(
        posledniTap && ted - posledniTap.cas <= 360 && Math.hypot(event.clientX - posledniTap.x, event.clientY - posledniTap.y) <= 38
      );
      if (jeDvojtap) {
        posledniTap = null;
        if (event.cancelable) event.preventDefault();
        nastavEpubFullscreen(!epubViewerFullscreen);
      } else {
        posledniTap = { x: event.clientX, y: event.clientY, cas: ted };
      }
      pointerTap = null;
    });

    epubViewerPrvky = {
      overlay, close, title, author, chapter, settingsButton, marksButton, tocButton, body,
      loading, loadingText, content, prev, next, counter, toc, tocList, tocClose,
      settings, settingsClose, fontMinus, fontPlus, fontSizeValue, settingsReset,
      marks, marksClose, marksList, addBookmark, noteDialog, noteQuote, noteInput, selectionBar, selectionColors, selectionNote, selectionRemove, selectionClose
    };
    aplikujEpubReaderNastaveni();
    return epubViewerPrvky;
  }

  async function otevriEpubViewer(record) {
    if (!(record?.blob instanceof Blob)) throw new Error('EPUB data nejsou dostupná.');
    if (!window.LubaNoteEpubReader?.open) throw new Error('EPUB čtečka není načtená.');

    const prvky = zajistiEpubViewer();
    zavriDocxViewer();
    uvolniEpubKapitolaUrls();
    nastavEpubFullscreen(false);
    prvky.settings.hidden = true;
    prvky.marks.hidden = true;
    skryjEpubVyberBar();
    epubZalozky = normalizujEpubZalozky(record.epubBookmarks);
    epubZvyrazneni = normalizujEpubZvyrazneni(record.epubHighlights);
    aplikujEpubReaderNastaveni();
    prvky.overlay.hidden = false;
    prvky.loading.hidden = false;
    prvky.loadingText.textContent = 'Otevírám EPUB…';
    prvky.content.innerHTML = '';
    epubViewerOtevren = true;
    epubAktualniRecordId = record.id;
    document.body.classList.add('documents-epub-viewer-open');

    try {
      const arrayBuffer = await record.blob.arrayBuffer();
      epubAktualniKniha = await window.LubaNoteEpubReader.open(arrayBuffer);
      prvky.title.textContent = record.epubTitle || epubAktualniKniha.title || record.name || 'Kniha';
      prvky.author.textContent = record.epubAuthor || epubAktualniKniha.author || 'EPUB · LubaReader';
      vykresliEpubObsah();
      const index = Math.max(0, Math.min(epubAktualniKniha.chapters.length - 1, Number(record.epubChapterIndex) || 0));
      const ratio = Math.max(0, Math.min(1, Number(record.epubScrollRatio) || 0));
      await zobrazEpubKapitolu(index, { ratio });
    } catch (error) {
      prvky.loading.hidden = true;
      zavriEpubViewer();
      throw error;
    }
  }

  function zapojDocxAndroidBack() {
    if (docxAndroidBackZapojen) return;
    docxAndroidBackZapojen = true;
    const puvodniAndroidZpet = window.LubaNoteZpracujAndroidZpet;
    window.LubaNoteZpracujAndroidZpet = function () {
      if (epubViewerOtevren) {
        if (epubViewerPrvky && !epubViewerPrvky.selectionBar.hidden) {
          window.getSelection?.()?.removeAllRanges?.();
          skryjEpubVyberBar();
        } else if (epubViewerPrvky && !epubViewerPrvky.marks.hidden) {
          zavriEpubAnotacePanel();
        } else if (epubViewerPrvky && !epubViewerPrvky.settings.hidden) {
          zavriEpubReaderNastaveni();
        } else if (epubViewerPrvky && !epubViewerPrvky.toc.hidden) {
          epubViewerPrvky.toc.hidden = true;
        } else if (epubViewerFullscreen) {
          nastavEpubFullscreen(false);
        } else {
          zavriEpubViewer();
        }
        return true;
      }
      if (docxViewerOtevren) {
        if (docxViewerFullscreen) {
          nastavDocViewerFullscreen(false);
        } else {
          zavriDocxViewer();
        }
        return true;
      }
      if (typeof puvodniAndroidZpet === 'function') return puvodniAndroidZpet();
      return false;
    };
  }

  async function otevriSoubor(idSouboru) {
    const record = await nactiSoubor(idSouboru);
    if (!record) {
      zobrazChybu('Dokumenty', 'Soubor už není dostupný.');
      return;
    }

    const typ = typSouboru(record);

    if (typ === 'docx') {
      try {
        await otevriDocxViewer(record);
      } catch (error) {
        console.error('Otevření uloženého DOCX selhalo:', error);
        zobrazChybu(
          'Dokumenty',
          'DOCX se nepodařilo otevřít. Soubor může být poškozený nebo používá prvek, který tento viewer ještě neumí.'
        );
      }
      return;
    }

    if (typ === 'doc') {
      try {
        await otevriDocViewer(record);
      } catch (error) {
        console.error('Otevření uloženého DOC selhalo:', error);
        zobrazChybu(
          'Dokumenty',
          error?.message || 'DOC se nepodařilo otevřít. Podporovaný je Word 97–2003 a první verze zachovává hlavně čitelný text.'
        );
      }
      return;
    }

    if (typ === 'epub') {
      try {
        await otevriEpubViewer(record);
      } catch (error) {
        console.error('Otevření uloženého EPUB selhalo:', error);
        zobrazChybu(
          'Dokumenty',
          error?.message || 'EPUB se nepodařilo otevřít. Kniha může být poškozená nebo chráněná DRM.'
        );
      }
      return;
    }

    if (typ === 'sql') {
      try {
        await otevriSqlViewer(record);
      } catch (error) {
        console.error('Otevření uloženého SQL selhalo:', error);
        zobrazChybu('Dokumenty', error?.message || 'SQL se nepodařilo otevřít.');
      }
      return;
    }

    if (typ !== 'pdf') {
      zobrazChybu('Dokumenty', 'Tento typ souboru zatím neumím otevřít.');
      return;
    }

    const viewer = window.LubaNoteDocuments?.otevriPdfViewer;
    if (typeof viewer !== 'function') {
      zobrazChybu('Dokumenty', 'PDF prohlížeč není dostupný.');
      return;
    }

    try {
      if (record.storageMode === 'android') {
        const plugin = ziskejNativniPlugin();
        if (!plugin?.otevriUlozenyPdf) {
          throw new Error('Android uložený PDF viewer není dostupný.');
        }

        const vysledek = await plugin.otevriUlozenyPdf({
          storageKey: record.storageKey,
          nazevSouboru: record.name
        });

        await viewer({
          typ: 'pdf',
          native: true,
          pageCount: Number(vysledek?.pageCount) || 1,
          nazevSouboru: record.name,
          mimeType: 'application/pdf'
        });
        return;
      }

      if (!(record.blob instanceof Blob)) {
        throw new Error('PDF data nejsou dostupná.');
      }

      await viewer({
        typ: 'pdf',
        file: record.blob,
        nazevSouboru: record.name,
        mimeType: record.mime || 'application/pdf'
      });
    } catch (error) {
      console.error('Otevření uloženého PDF selhalo:', error);
      zobrazChybu('Dokumenty', 'PDF se nepodařilo otevřít.');
    }
  }

  function renderSlozky() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    const counts = new Map();
    posledniSoubory.forEach((soubor) => {
      if (jeSouborVKosi(soubor)) return;
      if (soubor.folderId) {
        counts.set(soubor.folderId, (counts.get(soubor.folderId) || 0) + 1);
      }
    });

    const cards = posledniSlozky
      .map((folder) => `
        <div class="documentsFolderCard${aktivniSlozkaId === folder.id ? ' active' : ''}" data-folder-id="${esc(folder.id)}" role="button" tabindex="0" title="Dlouhý stisk a táhni pro změnu pořadí">
          <span class="documentsFolderCardIcon" aria-hidden="true">📁</span>
          <span class="documentsFolderCardName">${esc(folder.name)}</span>
          <small>${pocetSouboruText(counts.get(folder.id) || 0)}</small>
          <button type="button" class="documentsFolderMenuButton" data-folder-menu="${esc(folder.id)}" aria-label="Akce složky ${esc(folder.name)}" title="Akce složky">⋮</button>
        </div>`)
      .join('');

    prvky.folders.innerHTML = cards || '<div class="documentsFoldersEmpty">Zatím nemáš žádnou složku.</div>';

    prvky.folders.querySelectorAll('.documentsFolderCard[data-folder-id]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event.target.closest?.('.documentsFolderMenuButton')) return;
        if (Date.now() < blokovatOtevreniSlozkyDo) return;
        aktivniSlozkaId = button.dataset.folderId || null;
        render();
      });

      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (Date.now() < blokovatOtevreniSlozkyDo) return;
        event.preventDefault();
        aktivniSlozkaId = button.dataset.folderId || null;
        render();
      });

      zapojLongPressSlozky(button);
    });

    prvky.folders.querySelectorAll('.documentsFolderMenuButton[data-folder-menu]').forEach((menuButton) => {
      for (const eventName of ['pointerdown', 'touchstart', 'mousedown', 'contextmenu']) {
        menuButton.addEventListener(eventName, (event) => {
          event.stopPropagation();
          if (eventName === 'contextmenu') event.preventDefault();
        }, eventName === 'touchstart' ? { passive: true } : undefined);
      }

      menuButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        ukonciFolderDrag();
        zajistiAkceSlozkyModal().otevrit(menuButton.dataset.folderMenu);
      });
    });

    prvky.allFolder.classList.toggle('active', aktivniSlozkaId === null);
    prvky.allFolder.hidden = aktivniSlozkaId === null;
    prvky.filterAll?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'all');
    prvky.filterPdf?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'pdf');
    prvky.filterDocx?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'docx');
    prvky.filterDoc?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'doc');
    prvky.filterEpub?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'epub');
    prvky.filterSql?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'sql');
    prvky.trash?.classList.toggle('active', aktivniSlozkaId === TRASH_VIEW);
    if (prvky.trashCount) {
      const pocetVKosi = posledniSoubory.filter(jeSouborVKosi).length;
      prvky.trashCount.textContent = pocetVKosi > 0 ? ` (${pocetVKosi})` : '';
    }
  }

  function renderSoubory() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    for (const url of epubListCoverUrls) {
      try { URL.revokeObjectURL(url); } catch (_error) {}
    }
    epubListCoverUrls = [];

    const folderMap = new Map(posledniSlozky.map((folder) => [folder.id, folder.name]));
    const zobrazujiKos = aktivniSlozkaId === TRASH_VIEW;
    const soubory = posledniSoubory
      .filter((soubor) => {
        if (zobrazujiKos) {
          if (!jeSouborVKosi(soubor)) return false;
        } else {
          if (jeSouborVKosi(soubor)) return false;
          if (aktivniSlozkaId !== null && soubor.folderId !== aktivniSlozkaId) return false;

          // Typové filtry jsou oddělené; Koš zůstává společný pro všechny dokumenty.
          if (aktivniTypFiltru === 'pdf' && !jePdfSoubor(soubor)) return false;
          if (aktivniTypFiltru === 'docx' && !jeDocxSoubor(soubor)) return false;
          if (aktivniTypFiltru === 'doc' && !jeDocSoubor(soubor)) return false;
          if (aktivniTypFiltru === 'epub' && !jeEpubSoubor(soubor)) return false;
          if (aktivniTypFiltru === 'sql' && !jeSqlSoubor(soubor)) return false;
        }

        return souborOdpovidaHledani(soubor, folderMap);
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    const nazevSlozky = zobrazujiKos
      ? 'Koš'
      : aktivniSlozkaId
        ? folderMap.get(aktivniSlozkaId) || 'Složka'
        : 'Všechny soubory';

    prvky.activeFolder.textContent = nazevSlozky;
    prvky.status.textContent = jeAndroid()
      ? 'Lokálně v tomto Android zařízení'
      : 'Lokálně v tomto prohlížeči';

    const prazdnyNadpis = prvky.empty.querySelector('strong');
    const prazdnyText = prvky.empty.querySelector('p');
    const prazdnaIkona = prvky.empty.querySelector('.documentsEmptyIcon');
    const maHledani = Boolean(normalizujHledani(hledaniDokumentu));
    if (maHledani) {
      if (prazdnaIkona) prazdnaIkona.textContent = '🔎';
      if (prazdnyNadpis) prazdnyNadpis.textContent = 'Nic jsme nenašli';
      if (prazdnyText) prazdnyText.textContent = `Pro „${hledaniDokumentu.trim()}“ tu není žádný odpovídající dokument.`;
    } else if (zobrazujiKos) {
      if (prazdnaIkona) prazdnaIkona.textContent = '🗑️';
      if (prazdnyNadpis) prazdnyNadpis.textContent = 'Koš je prázdný';
      if (prazdnyText) prazdnyText.textContent = 'Dokumenty přesunuté do koše se zobrazí tady a půjdou obnovit nebo trvale smazat.';
    } else {
      if (prazdnaIkona) prazdnaIkona.textContent = '📄';
      if (prazdnyNadpis) prazdnyNadpis.textContent = aktivniTypFiltru === 'pdf' ? 'Zatím tu není žádné PDF' : aktivniTypFiltru === 'docx' ? 'Zatím tu není žádný DOCX' : aktivniTypFiltru === 'doc' ? 'Zatím tu není žádný DOC' : aktivniTypFiltru === 'epub' ? 'Zatím tu není žádná kniha EPUB' : aktivniTypFiltru === 'sql' ? 'Zatím tu není žádný SQL soubor' : 'Zatím tu není žádný dokument';
      if (prazdnyText) prazdnyText.textContent = 'Přidej první PDF, DOCX, DOC, EPUB nebo SQL. SQL se otevře lokálně jen ke čtení.';
    }

    if (prvky.search && prvky.search.value !== hledaniDokumentu) {
      prvky.search.value = hledaniDokumentu;
    }
    if (prvky.searchClear) {
      prvky.searchClear.hidden = !maHledani;
    }

    prvky.addPdf.disabled = zobrazujiKos;
    if (prvky.addPdfFloating) {
      prvky.addPdfFloating.disabled = zobrazujiKos;
      prvky.addPdfFloating.hidden = zobrazujiKos;
    }

    prvky.empty.hidden = soubory.length !== 0;
    prvky.files.hidden = soubory.length === 0;

    if (!soubory.length) {
      prvky.files.innerHTML = '';
      return;
    }

    prvky.files.innerHTML = soubory.map((soubor) => {
      const folderName = soubor.folderId ? folderMap.get(soubor.folderId) : '';
      const metaFolder = zobrazujiKos && soubor.trashFolderId
        ? folderMap.get(soubor.trashFolderId) || 'Všechny soubory'
        : folderName;
      const typ = typSouboru(soubor);
      const typText = popisTypuSouboru(soubor);
      const ikonaTrida = typ === 'docx' ? ' is-docx' : typ === 'doc' ? ' is-doc' : typ === 'epub' ? ' is-epub' : typ === 'sql' ? ' is-sql' : '';
      let ikonaObsah = typText;
      if (typ === 'epub' && soubor.epubCoverBlob instanceof Blob) {
        const coverUrl = URL.createObjectURL(soubor.epubCoverBlob);
        epubListCoverUrls.push(coverUrl);
        ikonaObsah = `<img class="documentsEpubCoverThumb" src="${docxEscAttr(coverUrl)}" alt="">`;
      }
      const zobrazenyNazev = typ === 'epub' && String(soubor.epubTitle || '').trim() ? String(soubor.epubTitle).trim() : soubor.name;
      const epubMeta = typ === 'epub'
        ? [soubor.epubAuthor, zobrazenyNazev !== soubor.name ? soubor.name : ''].filter(Boolean).join(' · ')
        : '';
      return `
        <div class="documentsFileRow${zobrazujiKos ? ' is-trash' : ''}" data-file-id="${esc(soubor.id)}" title="${zobrazujiKos ? 'Dokument v koši' : 'Dlouhý stisk a táhni pro přesun'}">
          <button type="button" class="documentsFileOpenArea" data-file-open="${esc(soubor.id)}" aria-label="Otevřít ${esc(zobrazenyNazev)}">
            <span class="documentsFileIcon${ikonaTrida}" aria-hidden="true">${ikonaObsah}</span>
            <span class="documentsFileMain">
              <strong>${esc(zobrazenyNazev)}</strong>
              <small>${esc(typText)}${epubMeta ? ` · ${esc(epubMeta)}` : ''} · ${esc(formatBytes(soubor.size))} · ${esc(formatDate(soubor.updatedAt))}${metaFolder ? ` · ${esc(metaFolder)}` : ''}</small>
            </span>
            <span class="documentsFileOpen" aria-hidden="true">›</span>
          </button>
          <button type="button" class="documentsFileMenuButton" data-file-menu="${esc(soubor.id)}" aria-label="Akce souboru ${esc(soubor.name)}" title="Akce souboru">⋮</button>
        </div>`;
    }).join('');

    prvky.files.querySelectorAll('[data-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        if (Date.now() < blokovatOtevreniDo) return;

        // PATCH 640B – při otevření výsledku ukončíme vyhledávací režim
        // a schováme vlastní klávesnici, aby viewer nikdy neotevřel
        // dokument pod stále viditelnou LubaKeyboard.
        if (prvky.screen.classList.contains('documents-search-keyboard-active')) {
          prvky.screen.classList.remove('documents-search-keyboard-active');
          try {
            window.LubaNoteKeyboard?.skryj?.();
          } catch (_error) {}
        }

        otevriSoubor(button.dataset.fileOpen);
      });
    });

    prvky.files.querySelectorAll('.documentsFileMenuButton[data-file-menu]').forEach((menuButton) => {
      for (const eventName of ['pointerdown', 'touchstart', 'mousedown', 'contextmenu']) {
        menuButton.addEventListener(eventName, (event) => {
          event.stopPropagation();
          if (eventName === 'contextmenu') event.preventDefault();
        }, eventName === 'touchstart' ? { passive: true } : undefined);
      }

      menuButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        ukonciDrag();
        zajistiAkceSouboruModal().otevrit(menuButton.dataset.fileMenu);
      });
    });

    if (!zobrazujiKos) {
      prvky.files.querySelectorAll('.documentsFileRow[data-file-id]').forEach((row) => {
        zapojLongPressSouboru(row, row.dataset.fileId);
      });
    }
  }

  function render() {
    renderSlozky();
    renderSoubory();
  }

  async function refresh() {
    try {
      [posledniSlozky, posledniSoubory] = await Promise.all([
        vseZeStore(STORE_FOLDERS),
        vseZeStore(STORE_FILES)
      ]);

      const poradi = await zajistiPoradiSlozek(posledniSlozky);
      posledniSlozky = poradi.folders;

      if (
        aktivniSlozkaId !== null &&
        aktivniSlozkaId !== TRASH_VIEW &&
        !posledniSlozky.some((folder) => folder.id === aktivniSlozkaId)
      ) {
        aktivniSlozkaId = null;
      }

      render();
    } catch (error) {
      console.error('Dokumenty nelze načíst:', error);
      zobrazChybu('Dokumenty', 'Lokální knihovnu dokumentů se nepodařilo načíst.');
    }
  }

  function init() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    prvky.addFolder.addEventListener('click', () => {
      zajistiModalSlozky().otevrit();
    });

    prvky.addPdf.addEventListener('click', otevriPridatSouborModal);
    prvky.addPdfFloating?.addEventListener('click', otevriPridatSouborModal);
    zapojDocxAndroidBack();

    /*
     * PATCH 640B – HLEDÁNÍ + VÝSLEDKY MUSÍ BÝT NAD LubaKeyboard.
     * 640A správně vytáhl nad klávesnici samotné pole, ale výsledky zůstaly
     * v původním toku stránky a tím pádem pod klávesnicí. Při aktivním
     * hledání proto zvedáme jako jeden celek celou sekci Dokumenty: hlavičku,
     * hledání, filtry i scrollovatelný seznam výsledků. Horní hranu počítáme
     * podle skutečného spodku hlavních záložek, takže panel neleze přes navigaci.
     */
    const aktualizujSearchKeyboardPanelTop = () => {
      const tabs = document.querySelector('.moduleTabs');
      const rect = tabs?.getBoundingClientRect?.();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const navBottom = Number(rect?.bottom);
      const fallbackTop = 8;
      const vypocitano = Number.isFinite(navBottom) ? navBottom + 8 : fallbackTop;
      const rawKeyboardHeight = getComputedStyle(document.body).getPropertyValue('--ln-lk-height');
      const keyboardHeight = Number.parseFloat(rawKeyboardHeight) || 260;
      const panelBottom = viewportHeight > 0 ? viewportHeight - keyboardHeight - 6 : 0;
      const maxTop = panelBottom > 0 ? Math.max(fallbackTop, panelBottom - 180) : vypocitano;
      const top = Math.max(fallbackTop, Math.min(vypocitano, maxTop));
      prvky.screen.style.setProperty('--documents-search-panel-top', `${Math.round(top)}px`);
    };

    const nastavSearchKeyboardMode = (aktivni) => {
      const zapnout = Boolean(aktivni);
      if (zapnout) aktualizujSearchKeyboardPanelTop();
      prvky.screen.classList.toggle('documents-search-keyboard-active', zapnout);
    };

    prvky.search?.addEventListener('focus', () => {
      nastavSearchKeyboardMode(true);
      requestAnimationFrame(aktualizujSearchKeyboardPanelTop);
    });

    prvky.search?.addEventListener('blur', () => {
      // Krátké zpoždění dovolí dokončit tap na nalezený soubor / filtr.
      // Jinak by se fixed panel při pointerup přesunul zpět pod prstem.
      setTimeout(() => {
        if (document.activeElement !== prvky.search) {
          nastavSearchKeyboardMode(false);
        }
      }, 140);
    });

    window.addEventListener('resize', () => {
      if (prvky.screen.classList.contains('documents-search-keyboard-active')) {
        aktualizujSearchKeyboardPanelTop();
      }
    }, { passive: true });

    prvky.search?.addEventListener('input', () => {
      hledaniDokumentu = prvky.search.value;
      renderSoubory();
    });

    prvky.searchClear?.addEventListener('click', () => {
      hledaniDokumentu = '';
      if (prvky.search) {
        prvky.search.value = '';
        prvky.search.focus();
      }
      renderSoubory();
    });

    prvky.filterAll?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'all';
      render();
    });

    prvky.filterPdf?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'pdf';
      render();
    });


    prvky.filterDocx?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'docx';
      render();
    });

    prvky.filterDoc?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'doc';
      render();
    });

    prvky.filterEpub?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'epub';
      render();
    });

    prvky.filterSql?.addEventListener('click', () => {
      if (aktivniSlozkaId === TRASH_VIEW) aktivniSlozkaId = null;
      aktivniTypFiltru = 'sql';
      render();
    });

    prvky.allFolder.addEventListener('click', () => {
      aktivniSlozkaId = null;
      render();
    });

    prvky.trash?.addEventListener('click', () => {
      aktivniSlozkaId = TRASH_VIEW;
      render();
    });

    document.getElementById('documentsModuleButton')?.addEventListener('click', refresh);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.LubaNoteDocumentsHub = {
    refresh,
    pridatPdf,
    pridatDocx,
    pridatDoc,
    pridatEpub,
    otevriDocxViewer,
    otevriEpubViewer,
    otevriDocViewer,
    zavriDocxViewer,
    presunSouborDoSlozky,
    ulozPoradiSlozek,
    prejmenujSoubor,
    presunSouborDoKose,
    obnovSouborZKose
  };
})();
