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
})();
