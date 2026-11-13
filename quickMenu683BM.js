/* 683BM – rychle menu zustava rychlym menu, razeni novych karet patri do Vzhledu.
 * Puvodni cardSortButton zustava v DOM i s listenerem z cardView.js.
 * Zadna kopie datove logiky ani zmena localStorage kontraktu.
 */
(() => {
  'use strict';
  const menu = document.getElementById('mainMenu');
  const puvodni = document.getElementById('cardSortButton');
  const popisek = document.getElementById('cardSortMenuLabel');
  const vzhled = document.querySelector('#ln683BJAccordion [data-ln683bj-category="appearance"] .ln683BJOriginal');
  if (!menu || !puvodni || !popisek || !vzhled || document.getElementById('ln683BMCardSortSettings')) return;

  puvodni.hidden = true; // Skryty zdrojni prvek, zachovava fungujici listener.

  // Jeden poradek rychlych voleb na Androidu, navazany na puvodni DOM listenery.
  const pred = document.getElementById('accountPlanMenuInfo') || menu.querySelector('hr');
  if (pred) {
    ['fontSizeSettingsButton','storageScopeMenuButton','manageTagsMenuButton',
     'backupRestoreButton','aboutAppButton','adminDashboardButton'].forEach(id => {
      const tlacitkoMenu = document.getElementById(id);
      if (tlacitkoMenu) menu.insertBefore(tlacitkoMenu, pred);
    });
  }

  /* 699D-H: Informace o Demu ma byt uplne prvni polozka tri tecek.
   * Predchozi sestaveni samo preskladava rychle volby PRED demo, proto
   * presun provedeme AZ po serazeni. Pri skrytem/Full planu neni videt.
   * Existujici prvek a vsechny jeho aktualizace ze serveru zustavaji. */
  const planInfo = document.getElementById('accountPlanMenuInfo');
  if (planInfo?.parentElement === menu) menu.insertBefore(planInfo, menu.firstChild);

  const radek = document.createElement('div');
  radek.className = 'themeSetting ln683BMCardSortRow';
  radek.id = 'ln683BMCardSortSettings';
  const nazev = document.createElement('span');
  const tlacitko = document.createElement('button');
  tlacitko.id = 'ln683BMCardSortChoice';
  tlacitko.type = 'button';
  tlacitko.className = 'themeSelectButton';
  const hodnota = document.createElement('span');
  hodnota.id = 'ln683BMCardSortValue';
  tlacitko.append(hodnota);
  radek.append(nazev,tlacitko);
  vzhled.append(radek);

  const preloz = (klic, fallback) => window.LubaNoteI18n?.t?.(klic, fallback) || fallback;
  const aktualizuj = () => {
    nazev.textContent = preloz('sort.title', 'Umístění nových karet');
    const smer = localStorage.getItem('cardSortDirection') === 'asc' ? 'Oldest' : 'Newest';
    const cele = preloz('sort.label'+smer, smer === 'Oldest' ? 'Nové karty: dole' : 'Nové karty: nahoře');
    hodnota.textContent = cele.includes(':') ? cele.split(':').slice(1).join(':').trim() : cele;
    tlacitko.setAttribute('aria-label', nazev.textContent + ': ' + hodnota.textContent);
  };
  tlacitko.addEventListener('click', () => puvodni.click());
  new MutationObserver(aktualizuj).observe(popisek, {childList:true,subtree:true,characterData:true});
  window.addEventListener('lubanote:language-change', aktualizuj);
  window.addEventListener('focus', aktualizuj);
  aktualizuj();

  /* 699D-J: Objevit zachranene konflikty bez rucniho prepinani uloziste.
   * POUZE cteme mistni poznamky s syncConflict.originalId; nemenime
   * sync.js, cloudovou revizi, local vault ani originalni poznamku.
   * Zobrazeni / otevreni vyuziva existujici choice modal a editor. */
  const slovnik = {
    cs: ['Konflikty', 'Zachráněné konfliktní verze', 'Na tomto zařízení nejsou žádné zachráněné konfliktní verze.', 'Tyto kopie jsou pouze v tomto zařízení. Pro jistotu je zazálohuj.', 'Hlavní nabídka'],
    sk: ['Konflikty', 'Zachránené konfliktné verzie', 'V tomto zariadení nie sú žiadne zachránené konfliktné verzie.', 'Tieto kópie sú iba v tomto zariadení. Pre istotu si ich zálohuj.', 'Hlavná ponuka'],
    en: ['Conflicts', 'Saved conflicting versions', 'There are no saved conflicting versions on this device.', 'These copies exist only on this device. Back them up.', 'Main menu'],
    de: ['Konflikte', 'Gesicherte Konfliktversionen', 'Auf diesem Gerät sind keine gesicherten Konfliktversionen vorhanden.', 'Diese Kopien sind nur auf diesem Gerät gespeichert. Bitte sichere sie.', 'Hauptmenü'],
    pl: ['Konflikty', 'Zachowane wersje konfliktowe', 'Na tym urządzeniu nie ma zachowanych wersji konfliktowych.', 'Te kopie są tylko na tym urządzeniu. Zrób ich kopię zapasową.', 'Menu główne'],
    es: ['Conflictos', 'Versiones en conflicto guardadas', 'No hay versiones en conflicto guardadas en este dispositivo.', 'Estas copias solo están en este dispositivo. Haz una copia de seguridad.', 'Menú principal']
  };
  const slova = () => slovnik[(window.LubaNoteI18n?.ziskejJazyk?.() || document.documentElement.lang || 'cs').split('-')[0]] || slovnik.en;

  const nactiKonflikty = () => {
    // loadTask zahrnuje i desifrovane poznamky z LOCAL vaultu, bez kose.
    try {
      if (typeof loadTask !== 'function') return [];
      return loadTask().filter(note =>
        note?.id && note.storageScope === 'local' &&
        note.syncConflict?.originalId && !note.trashedAt &&
        note.isSecret !== true
      ).sort((a, b) => String(b.syncConflict?.preservedAt || '').localeCompare(String(a.syncConflict?.preservedAt || '')));
    } catch (error) {
      console.warn('699D-J: Nelze nacist mistni konflikty', error);
      return [];
    }
  };

  const nabidka = document.createElement('button');
  nabidka.id = 'ln699DJConflictsButton';
  nabidka.type = 'button';
  nabidka.setAttribute('role', 'menuitem');
  const ikona = document.createElement('span');
  ikona.className = 'mainMenuIcon';
  ikona.textContent = '⚠️';
  ikona.setAttribute('aria-hidden', 'true');
  const popis = document.createElement('span');
  popis.className = 'mainMenuLabel';
  nabidka.append(ikona, popis);
  const misto = document.getElementById('storageScopeMenuButton');
  if (misto?.parentElement === menu) misto.after(nabidka);
  else menu.append(nabidka);

  const hlavniTlacitko = document.getElementById('mainMenuButton');
  const pocitadlo = document.createElement('span');
  pocitadlo.id = 'ln699DJConflictCount';
  pocitadlo.hidden = true;
  pocitadlo.style.display = 'none';
  pocitadlo.setAttribute('aria-hidden', 'true');
  pocitadlo.style.cssText = 'position:absolute;right:-3px;top:-4px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:9px;background:var(--color-danger-text,#dc8751);color:#151515;font:700 10px/16px sans-serif;text-align:center;pointer-events:none;';
  const puvodniAria = hlavniTlacitko?.getAttribute('aria-label') || 'Hlavní nabídka';
  if (hlavniTlacitko) {
    // Neprepisuj pozicovani hlavicky, pokud je tlacitko uz absolutni/fixed.
    if (typeof getComputedStyle === 'function' &&
        getComputedStyle(hlavniTlacitko).position === 'static') {
      hlavniTlacitko.style.position = 'relative';
    }
    hlavniTlacitko.append(pocitadlo);
  }

  const aktualizujKonflikty = () => {
    const pocet = nactiKonflikty().length;
    const problemy = Math.max(0, Number(window.LubaNoteProblems699DL?.count || 0));
    const celkem = pocet + problemy;
    const jazyk = slova();
    popis.textContent = `${jazyk[0]} (${pocet})`;
    if (hlavniTlacitko) {
      pocitadlo.hidden = celkem === 0;
      pocitadlo.style.display = celkem ? 'block' : 'none';
      pocitadlo.textContent = celkem > 99 ? '99+' : String(celkem);
      hlavniTlacitko.setAttribute('aria-label', celkem ? `${jazyk[4]} – ${jazyk[0]}: ${pocet}, problémy: ${problemy}` : puvodniAria);
    }
  };

  nabidka.addEventListener('click', () => {
    menu.hidden = true;
    if (hlavniTlacitko) hlavniTlacitko.setAttribute('aria-expanded', 'false');
    const konflikty = nactiKonflikty();
    const jazyk = slova();
    if (typeof window.otevriVyberovyModal !== 'function') return;
    window.otevriVyberovyModal({
      nadpis: `${jazyk[1]} (${konflikty.length})`,
      popis: konflikty.length ? jazyk[3] : jazyk[2],
      moznosti: konflikty.map(note => ({
        hodnota: String(note.id),
        popisek: String(note.title || '⚠️')
      })),
      poVyberu: async (id) => {
        // Otevre mistni kopii podle ID bez prepnuti aktualniho prostoru.
        // Editor sam rozpoznava storageScope=local a nevola cloudovou cestu.
        if (typeof openTaskEditorById !== 'function') throw new Error('Editor nedostupny');
        const aktualni = nactiKonflikty().find(note => String(note.id) === id);
        if (!aktualni) throw new Error('Konfliktni kopie uz neni dostupna');
        const otevreno = await openTaskEditorById(id);
        if (otevreno === false) throw new Error('Editor konfliktni kopii neotevrel');
      }
    });
  });
  hlavniTlacitko?.addEventListener('click', aktualizujKonflikty);
  window.addEventListener('lubanote:sync-state', (e) => {
    if (e?.detail?.state === 'synced' || e?.detail?.stav === 'synced') aktualizujKonflikty();
  });
  window.addEventListener('lubanote:problems-updated', aktualizujKonflikty);
  window.addEventListener('lubanote:account-active', aktualizujKonflikty);
  window.addEventListener('lubanote:language-change', aktualizujKonflikty);
  window.addEventListener('focus', aktualizujKonflikty);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) aktualizujKonflikty(); });
  aktualizujKonflikty();
})();
