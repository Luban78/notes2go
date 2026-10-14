/* LubaNote 683BP – pouze lokalni vizualni font CoreV2 editoru.
 * Bez zmeny modelu poznamek, HTML, vyberu textu, historii nebo synchronizace.
 * Volby pouzivaji systemove fonty: nic se nestahuje, APK neroste.
 */
(() => {
  'use strict';
  const KLIC = 'ln683bp_editor_font';
  const FONTY = ['puvodni', 'moderni', 'knizni', 'uzke', 'strojopis'];
  const root = document.documentElement;
  const modal = document.getElementById('settingsModal');
  const sekce = document.querySelector('#ln683BJBody-editor .ln683BJBodyInner');
  if (!modal || !sekce || document.getElementById('ln683BPFont')) return;

  const PREKLADY = {
    cs: ['Typ písma editoru', 'Mění vzhled textu jen v editoru, nikoli uložené poznámky.', 'Výchozí', 'Moderní', 'Knižní', 'Úzké', 'Strojopis', 'Vybrat typ písma', 'Možnosti písma'],
    en: ['Editor font', 'Changes only how notes look in the editor, not the saved content.', 'Default', 'Modern', 'Book', 'Condensed', 'Typewriter', 'Choose editor font', 'Font options'],
    sk: ['Typ písma editora', 'Mení iba zobrazenie v editore, nie uložené poznámky.', 'Pôvodné', 'Moderné', 'Knižné', 'Úzke', 'Strojopis', 'Vybrať písmo', 'Možnosti písma'],
    de: ['Schriftart im Editor', 'Ändert nur die Anzeige im Editor, nicht gespeicherte Notizen.', 'Standard', 'Modern', 'Buchschrift', 'Schmal', 'Schreibmaschine', 'Schriftart wählen', 'Schriftarten'],
    pl: ['Czcionka edytora', 'Zmienia wyłącznie wygląd w edytorze, nie zapisane notatki.', 'Domyślna', 'Nowoczesna', 'Książkowa', 'Wąska', 'Maszynowa', 'Wybierz czcionkę', 'Czcionki'],
    es: ['Tipo de letra del editor', 'Solo cambia la visualización, no el contenido guardado.', 'Original', 'Moderna', 'Libro', 'Estrecha', 'Máquina de escribir', 'Elegir fuente', 'Opciones de letra']
  };
  const jazyk = () => {
    const id = String(window.LubaNoteI18n?.ziskejLocale?.() || root.lang || 'cs').slice(0, 2).toLowerCase();
    return PREKLADY[id] ? id : 'en';
  };
  const nacti = () => {
    try {
      const ulozena = localStorage.getItem(KLIC);
      return FONTY.includes(ulozena) ? ulozena : 'puvodni';
    } catch (_) { return 'puvodni'; }
  };
  let vybrany = nacti();

  const blok = document.createElement('section');
  blok.id = 'ln683BPFont';
  blok.className = 'ln683BPFont';
  blok.innerHTML = `
    <button type="button" class="ln683BPMain" id="ln683BPMain" aria-expanded="false" aria-controls="ln683BPChoices">
      <span class="ln683BPDescription"><strong id="ln683BPTitle"></strong><small id="ln683BPHint"></small></span>
      <span class="ln683BPCurrent" id="ln683BPCurrent"></span>
    </button>
    <div id="ln683BPChoices" class="ln683BPChoices" hidden>
      ${FONTY.map((id, i) => `<button type="button" class="ln683BPChoice" data-font="${id}" aria-pressed="false"><span class="ln683BPChoiceName" data-font-name="${i}"></span><span class="ln683BPSample" data-sample-font="${id}" aria-hidden="true">Aa Bb Čč Žž 123</span></button>`).join('')}
    </div>`;
  const velikosti = sekce.querySelector('#ln683BNPreferences');
  if (velikosti) velikosti.after(blok);
  else sekce.prepend(blok);
  const hlavni = blok.querySelector('#ln683BPMain');
  const seznam = blok.querySelector('#ln683BPChoices');

  function nastavFont() {
    if (vybrany === 'puvodni') delete root.dataset.ln683bpEditorFont;
    else root.dataset.ln683bpEditorFont = vybrany;
  }
  function prekresli() {
    const t = PREKLADY[jazyk()];
    blok.querySelector('#ln683BPTitle').textContent = t[0];
    blok.querySelector('#ln683BPHint').textContent = t[1];
    blok.querySelector('#ln683BPCurrent').textContent = t[FONTY.indexOf(vybrany) + 2];
    hlavni.setAttribute('aria-label', `${t[7]}: ${t[FONTY.indexOf(vybrany) + 2]}`);
    seznam.setAttribute('aria-label', t[8]);
    blok.querySelectorAll('[data-font]').forEach(button => {
      const pozice = FONTY.indexOf(button.dataset.font);
      button.querySelector('.ln683BPChoiceName').textContent = t[pozice + 2];
      button.setAttribute('aria-pressed', String(button.dataset.font === vybrany));
    });
  }
  function prepni(otevrit) {
    seznam.hidden = !otevrit;
    hlavni.setAttribute('aria-expanded', String(otevrit));
    blok.classList.toggle('ln683BPOpen', otevrit);
  }
  hlavni.addEventListener('click', () => prepni(seznam.hidden));
  seznam.addEventListener('click', e => {
    const volba = e.target.closest('button[data-font]');
    if (!volba || !FONTY.includes(volba.dataset.font)) return;
    vybrany = volba.dataset.font;
    try {
      if (vybrany === 'puvodni') localStorage.removeItem(KLIC);
      else localStorage.setItem(KLIC, vybrany);
    } catch (_) { /* volba plati alespon do noveho spusteni */ }
    nastavFont();
    prekresli();
    prepni(false);
    hlavni.focus({ preventScroll: true });
  });
  document.addEventListener('click', e => {
    if (!seznam.hidden && !blok.contains(e.target)) prepni(false);
  });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !seznam.hidden) {
      e.stopPropagation();
      e.preventDefault();
      prepni(false);
      hlavni.focus({ preventScroll: true });
    }
  });
  const sledovani = new MutationObserver(() => {
    if (modal.hidden && !seznam.hidden) prepni(false);
  });
  sledovani.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('lubanote:language-change', prekresli);
  nastavFont();
  prekresli();
})();
