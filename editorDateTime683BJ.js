/* 683BL – oprava regrese PC editoru po 683BK.
 * Jediny panel hodin se presouva do #taskModal POUZE na uzkem mobilnim
 * rozlozeni (stejna hranice jako fixed hodiny z 683BD: max-width 899px).
 * Na PC zustava v HOME: #taskModal je fullscreen flex overlay a pridany
 * sourozenec .modalContent by posouval samotne okno editoru doprava.
 * Bez zmen CoreV2, Visual Debug CSS, oznámeni a Nastaveni A3.
 */
(() => {
  'use strict';
  const hodiny = document.getElementById('lnHomeDateTime683BC');
  const editor = document.getElementById('taskModal');
  if (!hodiny || !editor) return;
  const domov = hodiny.parentNode;
  const dalsi = hodiny.nextSibling;
  if (!domov || editor === domov) return;

  const mobilniRozlozeni = window.matchMedia('(max-width: 899px)');

  function umisti() {
    const otevren = !editor.hidden && !editor.classList.contains('editorClosing');
    const hodinyPatriDoEditoru = mobilniRozlozeni.matches && otevren;

    if (hodinyPatriDoEditoru && hodiny.parentNode !== editor) {
      editor.insertBefore(hodiny, editor.firstChild);
    } else if (!hodinyPatriDoEditoru && hodiny.parentNode !== domov) {
      if (dalsi && dalsi.parentNode === domov) {
        domov.insertBefore(hodiny, dalsi);
      } else {
        domov.append(hodiny);
      }
    }
  }

  new MutationObserver(umisti).observe(editor, {
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
  // Pri zmene sirky mezi mobilem a PC obnovime spravne umisteni.
  if (typeof mobilniRozlozeni.addEventListener === 'function') {
    mobilniRozlozeni.addEventListener('change', umisti);
  } else if (typeof mobilniRozlozeni.addListener === 'function') {
    mobilniRozlozeni.addListener(umisti);
  }
  window.addEventListener('pageshow', umisti);
  umisti();
})();
