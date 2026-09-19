/* ============================================================
   LUBANOTE – DOKUMENTY V1.5 SEARCH + FILTERS (PATCH 640)
   ------------------------------------------------------------
   První skutečný souborový tok modulu Dokumenty:
   - lokální složky v samostatném IndexedDB
   - import PDF
   - seznam souborů
   - otevření PDF ve stávajícím LubaNote PDF vieweru
   - bezpečný přesun souboru mezi složkami přes long-press + drag
   - změna pořadí složek přes stejný long-press + drag vzor
   - přejmenování složky
   - bezpečné smazání složky bez smazání PDF
   - přejmenování PDF
   - vlastní Koš Dokumentů + obnovení PDF
   - živé hledání podle názvu dokumentu / složky
   - připravený typový filtr Vše / PDF + rychlý vstup do Koše

   DŮLEŽITÉ:
   - zatím pouze lokálně v zařízení / prohlížeči
   - žádný cloud, Shared ani konverze
   - Poznámky, Sync a existující PDF export se nemění
   ============================================================ */

(() => {
  'use strict';

  const DB_NAME = 'lubanote_documents_v1';
  const DB_VERSION = 1;
  const STORE_FOLDERS = 'folders';
  const STORE_FILES = 'files';
  const MAX_PDF_BYTES = 100 * 1024 * 1024;
  const TRASH_VIEW = '__documents_trash__';

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

    return normalizujHledani(`${soubor.name || ''} ${slozka}`).includes(dotaz);
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

  function normalizujPdfNazev(value) {
    let nazev = String(value || '').trim().replace(/\s+/g, ' ');
    if (!nazev) return '';

    if (/\.pdf$/i.test(nazev)) {
      const zaklad = nazev.slice(0, -4).trim().slice(0, 116);
      return zaklad ? `${zaklad}.pdf` : '';
    }

    nazev = nazev.slice(0, 116);
    return nazev ? `${nazev}.pdf` : '';
  }

  async function prejmenujSoubor(idSouboru, novyNazev) {
    const record = await nactiSoubor(idSouboru);
    if (!record) throw new Error('Soubor už není dostupný.');

    const nazev = normalizujPdfNazev(novyNazev);
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
    const nazev = row?.querySelector('.documentsFileMain strong')?.textContent?.trim() || 'PDF soubor';
    nahled.querySelector('strong').textContent = nazev;
    nahled.querySelector('small').textContent = 'Táhni na cílovou složku';
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
        ? 'Změní se pouze název složky. PDF uvnitř zůstanou beze změny.'
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
      meta.textContent = `${count} ${count === 1 ? 'PDF' : 'PDF'} · lokálně v zařízení`;
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
        ? `Složka „${folder.name}“ obsahuje ${count} PDF. PDF se NESMAŽOU – přesunou se do „Všechny soubory“. Potom se smaže pouze složka.`
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
        <h3 id="documentsFileRenameTitle">Přejmenovat PDF</h3>
        <p>Změní se pouze název v knihovně LubaNote. Obsah PDF zůstane beze změny.</p>
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
      const nazev = normalizujPdfNazev(input.value);
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
        console.error('Přejmenování PDF selhalo:', error);
        zobrazChybu('Dokumenty', 'PDF se nepodařilo přejmenovat.');
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
      input.value = record.name || '';
      modal.hidden = false;
      requestAnimationFrame(() => {
        input.focus();
        const tecka = input.value.toLowerCase().lastIndexOf('.pdf');
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
        <h3 id="documentsFileManageTitle">PDF</h3>
        <p id="documentsFileManageMeta"></p>
        <div class="documentsFolderManageActions documentsFileManageActions">
          <button type="button" class="documentsFileRenameAction">✏️ Přejmenovat</button>
          <button type="button" class="documentsFileTrashAction">🗑️ Přesunout do koše</button>
          <button type="button" class="documentsFileRestoreAction" hidden>↩️ Obnovit z koše</button>
          <button type="button" class="documentsFolderManageCancel documentsFileManageCancel">Zrušit</button>
        </div>
      </section>`;

    document.body.appendChild(modal);
    const title = modal.querySelector('#documentsFileManageTitle');
    const meta = modal.querySelector('#documentsFileManageMeta');
    const rename = modal.querySelector('.documentsFileRenameAction');
    const trash = modal.querySelector('.documentsFileTrashAction');
    const restore = modal.querySelector('.documentsFileRestoreAction');
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
        console.error('Přesun PDF do koše selhal:', error);
        zobrazChybu('Dokumenty', 'PDF se nepodařilo přesunout do koše.');
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
        console.error('Obnovení PDF z koše selhalo:', error);
        zobrazChybu('Dokumenty', 'PDF se nepodařilo obnovit.');
      } finally {
        restore.disabled = false;
      }
    });

    modal.otevrit = (idSouboru) => {
      const record = posledniSoubory.find((item) => item.id === idSouboru);
      if (!record) return;
      fileId = idSouboru;
      const vKosi = jeSouborVKosi(record);
      title.textContent = record.name || 'PDF';
      meta.textContent = `${formatBytes(record.size)} · ${formatDate(record.updatedAt)}`;
      rename.hidden = vKosi;
      trash.hidden = vKosi;
      restore.hidden = !vKosi;
      modal.hidden = false;
    };

    return modal;
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

  async function otevriSoubor(idSouboru) {
    const record = await nactiSoubor(idSouboru);
    if (!record) {
      zobrazChybu('Dokumenty', 'Soubor už není dostupný.');
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
          <small>${counts.get(folder.id) || 0} PDF</small>
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
    prvky.filterAll?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'all');
    prvky.filterPdf?.classList.toggle('active', aktivniSlozkaId !== TRASH_VIEW && aktivniTypFiltru === 'pdf');
    prvky.trash?.classList.toggle('active', aktivniSlozkaId === TRASH_VIEW);
    if (prvky.trashCount) {
      const pocetVKosi = posledniSoubory.filter(jeSouborVKosi).length;
      prvky.trashCount.textContent = pocetVKosi > 0 ? ` (${pocetVKosi})` : '';
    }
  }

  function renderSoubory() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    const folderMap = new Map(posledniSlozky.map((folder) => [folder.id, folder.name]));
    const zobrazujiKos = aktivniSlozkaId === TRASH_VIEW;
    const soubory = posledniSoubory
      .filter((soubor) => {
        if (zobrazujiKos) {
          if (!jeSouborVKosi(soubor)) return false;
        } else {
          if (jeSouborVKosi(soubor)) return false;
          if (aktivniSlozkaId !== null && soubor.folderId !== aktivniSlozkaId) return false;

          // PATCH 640: typový filtr je připravený i pro budoucí DOCX/obrázky.
          if (aktivniTypFiltru === 'pdf') {
            const mime = String(soubor.mime || '').toLocaleLowerCase('en');
            const nazev = String(soubor.name || '').toLocaleLowerCase('en');
            if (mime !== 'application/pdf' && !nazev.endsWith('.pdf')) return false;
          }
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
      if (prazdnyText) prazdnyText.textContent = 'PDF přesunutá do koše se zobrazí tady a půjdou obnovit.';
    } else {
      if (prazdnaIkona) prazdnaIkona.textContent = '📄';
      if (prazdnyNadpis) prazdnyNadpis.textContent = aktivniTypFiltru === 'pdf' ? 'Zatím tu není žádné PDF' : 'Zatím tu není žádný dokument';
      if (prazdnyText) prazdnyText.textContent = 'Přidej první soubor. Otevře se potom ve stávajícím LubaNote PDF vieweru.';
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
      return `
        <div class="documentsFileRow${zobrazujiKos ? ' is-trash' : ''}" data-file-id="${esc(soubor.id)}" title="${zobrazujiKos ? 'PDF v koši' : 'Dlouhý stisk a táhni pro přesun'}">
          <button type="button" class="documentsFileOpenArea" data-file-open="${esc(soubor.id)}" aria-label="Otevřít ${esc(soubor.name)}">
            <span class="documentsFileIcon" aria-hidden="true">PDF</span>
            <span class="documentsFileMain">
              <strong>${esc(soubor.name)}</strong>
              <small>${esc(formatBytes(soubor.size))} · ${esc(formatDate(soubor.updatedAt))}${metaFolder ? ` · ${esc(metaFolder)}` : ''}</small>
            </span>
            <span class="documentsFileOpen" aria-hidden="true">›</span>
          </button>
          <button type="button" class="documentsFileMenuButton" data-file-menu="${esc(soubor.id)}" aria-label="Akce souboru ${esc(soubor.name)}" title="Akce souboru">⋮</button>
        </div>`;
    }).join('');

    prvky.files.querySelectorAll('[data-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        if (Date.now() < blokovatOtevreniDo) return;
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

    prvky.addPdf.addEventListener('click', pridatPdf);
    prvky.addPdfFloating?.addEventListener('click', pridatPdf);

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
    presunSouborDoSlozky,
    ulozPoradiSlozek,
    prejmenujSoubor,
    presunSouborDoKose,
    obnovSouborZKose
  };
})();
