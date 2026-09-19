/* ============================================================
   LUBANOTE – DOKUMENTY V1.1 MOVE (PATCH 636)
   ------------------------------------------------------------
   První skutečný souborový tok modulu Dokumenty:
   - lokální složky v samostatném IndexedDB
   - import PDF
   - seznam souborů
   - otevření PDF ve stávajícím LubaNote PDF vieweru
   - bezpečný přesun souboru mezi složkami přes drag handle

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

  let dbPromise = null;
  let aktivniSlozkaId = null;
  let dokumentyPrvky = null;
  let posledniSlozky = [];
  let posledniSoubory = [];
  let dragStav = null;
  let blokovatOtevreniDo = 0;

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

  async function nactiSoubor(idSouboru) {
    const db = await otevriDb();
    const tx = db.transaction(STORE_FILES, 'readonly');
    return await requestPromise(tx.objectStore(STORE_FILES).get(idSouboru));
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

  function najdiDragCil(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest?.('.documentsFolderCard, .documentsFolderAll') || null;
  }

  function nastavDragCil(target) {
    vycistiDragCil();
    if (target) target.classList.add('drag-target');
  }

  function ukonciDrag() {
    if (!dragStav) return;
    dragStav.row?.classList.remove('dragging');
    dragStav.handle?.releasePointerCapture?.(dragStav.pointerId);
    vycistiDragCil();
    dragStav = null;
  }

  function zapojDragHandle(row, handle, idSouboru) {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      dragStav = {
        fileId: idSouboru,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        row,
        handle,
        target: null
      };

      handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragStav || dragStav.pointerId !== event.pointerId) return;

      const dx = event.clientX - dragStav.startX;
      const dy = event.clientY - dragStav.startY;
      if (!dragStav.moved && Math.hypot(dx, dy) < 8) return;

      dragStav.moved = true;
      row.classList.add('dragging');

      const target = najdiDragCil(event.clientX, event.clientY);
      dragStav.target = target;
      nastavDragCil(target);
    });

    handle.addEventListener('pointerup', async (event) => {
      if (!dragStav || dragStav.pointerId !== event.pointerId) return;

      const stav = dragStav;
      const target = stav.target || najdiDragCil(event.clientX, event.clientY);
      const moved = stav.moved;
      ukonciDrag();

      if (!moved || !target) return;

      const folderId = target.classList.contains('documentsFolderAll')
        ? null
        : target.dataset.folderId || null;

      try {
        const zmeneno = await presunSouborDoSlozky(stav.fileId, folderId);
        if (!zmeneno) return;

        blokovatOtevreniDo = Date.now() + 350;
        await refresh();

        const nazev = folderId
          ? posledniSlozky.find((folder) => folder.id === folderId)?.name || 'složky'
          : 'Všechny soubory';
        zobrazZpravu('Dokumenty', `Soubor byl přesunut do „${nazev}“.`);
      } catch (error) {
        console.error('Přesun souboru selhal:', error);
        zobrazChybu('Dokumenty', 'Soubor se nepodařilo přesunout.');
      }
    });

    handle.addEventListener('pointercancel', () => ukonciDrag());
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
      allFolder: screen.querySelector('#documentsAllFolderButton')
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
        <p>Složka je zatím pouze v tomto zařízení.</p>
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

    const input = modal.querySelector('#documentsFolderName');
    const cancel = modal.querySelector('.documentsFolderCancel');
    const create = modal.querySelector('.documentsFolderCreate');

    const zavrit = () => {
      modal.hidden = true;
      input.value = '';
      input.blur();
    };

    cancel.addEventListener('click', zavrit);
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) zavrit();
    });

    const vytvorit = async () => {
      const nazev = input.value.trim().replace(/\s+/g, ' ');
      if (!nazev) {
        input.focus();
        return;
      }

      create.disabled = true;
      try {
        await ulozDoStore(STORE_FOLDERS, {
          id: id(),
          name: nazev,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        zavrit();
        await refresh();
      } catch (error) {
        console.error('Vytvoření složky selhalo:', error);
        zobrazChybu('Dokumenty', 'Složku se nepodařilo vytvořit.');
      } finally {
        create.disabled = false;
      }
    };

    create.addEventListener('click', vytvorit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        vytvorit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        zavrit();
      }
    });

    modal.otevrit = () => {
      modal.hidden = false;
      input.value = '';
      requestAnimationFrame(() => input.focus());
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
      folderId: aktivniSlozkaId,
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
          folderId: aktivniSlozkaId,
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
      if (soubor.folderId) {
        counts.set(soubor.folderId, (counts.get(soubor.folderId) || 0) + 1);
      }
    });

    const cards = posledniSlozky
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'))
      .map((folder) => `
        <button type="button" class="documentsFolderCard${aktivniSlozkaId === folder.id ? ' active' : ''}" data-folder-id="${esc(folder.id)}">
          <span class="documentsFolderCardIcon" aria-hidden="true">📁</span>
          <span class="documentsFolderCardName">${esc(folder.name)}</span>
          <small>${counts.get(folder.id) || 0} PDF</small>
        </button>`)
      .join('');

    prvky.folders.innerHTML = cards || '<div class="documentsFoldersEmpty">Zatím nemáš žádnou složku.</div>';

    prvky.folders.querySelectorAll('[data-folder-id]').forEach((button) => {
      button.addEventListener('click', () => {
        aktivniSlozkaId = button.dataset.folderId || null;
        render();
      });
    });

    prvky.allFolder.classList.toggle('active', aktivniSlozkaId === null);
  }

  function renderSoubory() {
    const prvky = zajistiPrvky();
    if (!prvky) return;

    const folderMap = new Map(posledniSlozky.map((folder) => [folder.id, folder.name]));
    const soubory = posledniSoubory
      .filter((soubor) => aktivniSlozkaId === null || soubor.folderId === aktivniSlozkaId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    const nazevSlozky = aktivniSlozkaId
      ? folderMap.get(aktivniSlozkaId) || 'Složka'
      : 'Všechny soubory';

    prvky.activeFolder.textContent = nazevSlozky;
    prvky.status.textContent = jeAndroid()
      ? 'Lokálně v tomto Android zařízení'
      : 'Lokálně v tomto prohlížeči';

    prvky.empty.hidden = soubory.length !== 0;
    prvky.files.hidden = soubory.length === 0;

    if (!soubory.length) {
      prvky.files.innerHTML = '';
      return;
    }

    prvky.files.innerHTML = soubory.map((soubor) => {
      const folderName = soubor.folderId ? folderMap.get(soubor.folderId) : '';
      return `
        <div class="documentsFileRow" data-file-id="${esc(soubor.id)}">
          <button type="button" class="documentsFileOpenArea" data-file-open="${esc(soubor.id)}" aria-label="Otevřít ${esc(soubor.name)}">
            <span class="documentsFileIcon" aria-hidden="true">PDF</span>
            <span class="documentsFileMain">
              <strong>${esc(soubor.name)}</strong>
              <small>${esc(formatBytes(soubor.size))} · ${esc(formatDate(soubor.updatedAt))}${folderName ? ` · ${esc(folderName)}` : ''}</small>
            </span>
            <span class="documentsFileOpen" aria-hidden="true">›</span>
          </button>
          <button type="button" class="documentsFileDrag" data-file-drag="${esc(soubor.id)}" aria-label="Přesunout ${esc(soubor.name)} do jiné složky" title="Přetáhnout do složky">⠿</button>
        </div>`;
    }).join('');

    prvky.files.querySelectorAll('[data-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        if (Date.now() < blokovatOtevreniDo) return;
        otevriSoubor(button.dataset.fileOpen);
      });
    });

    prvky.files.querySelectorAll('[data-file-drag]').forEach((handle) => {
      const row = handle.closest('.documentsFileRow');
      if (!row) return;
      zapojDragHandle(row, handle, handle.dataset.fileDrag);
    });
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

      if (
        aktivniSlozkaId !== null &&
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

    prvky.allFolder.addEventListener('click', () => {
      aktivniSlozkaId = null;
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
    presunSouborDoSlozky
  };
})();
