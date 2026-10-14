/* LubaNote 683BN — pouze lokální preference zobrazení. CoreV2 model a
   LubaKeyboard geometrie se nemění. Žádný zápis do obsahu poznámek. */
(() => {
  'use strict';
  const KLIC_EDITOR = 'ln683bn_editor_display_px';
  const KLIC_KLAVESY = 'ln683bn_keyboard_labels_pct';
  const koren = document.documentElement;
  const modal = document.getElementById('settingsModal');
  const sekce = document.querySelector('#ln683BJBody-editor .ln683BJBodyInner');
  if (!modal || !sekce || document.getElementById('ln683BNPreferences')) return;

  const popisky = {
    cs: ['Velikost textu editoru', 'Pouze zobrazení, nikoli formátování poznámky.', 'Velikost znaků LubaKeyboard', 'Mění pouze písmena na klávesách.', 'Původní', 'Zmenšit', 'Zvětšit', 'Obnovit původní hodnotu'],
    en: ['Editor text size', 'Display only; note formatting stays intact.', 'LubaKeyboard key labels', 'Only the key text changes.', 'Default', 'Decrease', 'Increase', 'Restore default'],
    sk: ['Veľkosť textu editora', 'Iba zobrazenie, nie formátovanie poznámky.', 'Veľkosť znakov LubaKeyboard', 'Menia sa iba znaky na klávesoch.', 'Pôvodné', 'Zmenšiť', 'Zväčšiť', 'Obnoviť pôvodné'],
    de: ['Textgröße im Editor', 'Nur Anzeige; Notizformatierung bleibt erhalten.', 'LubaKeyboard-Tastenbeschriftung', 'Nur die Zeichen auf den Tasten ändern sich.', 'Standard', 'Kleiner', 'Größer', 'Standard wiederherstellen'],
    pl: ['Rozmiar tekstu edytora', 'Tylko wyświetlanie; formatowanie notatek bez zmian.', 'Wielkość znaków LubaKeyboard', 'Zmieniają się tylko znaki na klawiszach.', 'Domyślne', 'Zmniejsz', 'Zwiększ', 'Przywróć domyślne'],
    es: ['Tamaño del texto del editor', 'Solo visualización; el formato de notas no cambia.', 'Letras de LubaKeyboard', 'Solo cambia el texto de las teclas.', 'Original', 'Reducir', 'Aumentar', 'Restaurar original']
  };
  const getJazyk = () => {
    const id = String(window.LubaNoteI18n?.ziskejLocale?.() || document.documentElement.lang || 'cs').slice(0,2).toLowerCase();
    return popisky[id] ? id : 'en';
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const cti = (klic, min, max) => {
    try {
      const raw = localStorage.getItem(klic);
      if (raw === null || raw === '') return null;
      const hodnota = Number(raw);
      return Number.isFinite(hodnota) && hodnota >= min && hodnota <= max ? Math.round(hodnota) : null;
    } catch (_) { return null; }
  };
  const uloz = (klic, hodnota) => {
    try { if (hodnota === null) localStorage.removeItem(klic); else localStorage.setItem(klic, String(hodnota)); }
    catch (_) { /* bez úložiště preference funguje do zavření */ }
  };
  let editorPx = cti(KLIC_EDITOR,12,28);
  let klavesyPct = cti(KLIC_KLAVESY,90,120) ?? 100;

  function pouzij() {
    if (editorPx === null) {
      delete koren.dataset.ln683bnEditorSize;
      koren.style.removeProperty('--ln683bn-editor-display-size');
    } else {
      koren.dataset.ln683bnEditorSize = 'custom';
      koren.style.setProperty('--ln683bn-editor-display-size', `${editorPx}px`);
    }
    if (klavesyPct === 100) {
      delete koren.dataset.ln683bnKeyLabels;
      koren.style.removeProperty('--ln683bn-key-label-scale');
    } else {
      koren.dataset.ln683bnKeyLabels = 'custom';
      koren.style.setProperty('--ln683bn-key-label-scale', String(klavesyPct / 100));
    }
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'ln683BNPreferences';
  wrapper.className = 'ln683BNPreferences';
  wrapper.innerHTML = `
    <div class="ln683BNRow" data-ln683bn-row="editor">
      <div class="ln683BNDescription"><strong data-label="0"></strong><small data-label="1"></small></div>
      <div class="ln683BNControls">
        <button type="button" data-op="editor-minus">−</button>
        <button type="button" class="ln683BNValue" data-op="editor-reset"></button>
        <button type="button" data-op="editor-plus">+</button>
      </div>
    </div>
    <div class="ln683BNRow" data-ln683bn-row="keyboard">
      <div class="ln683BNDescription"><strong data-label="2"></strong><small data-label="3"></small></div>
      <div class="ln683BNControls">
        <button type="button" data-op="keyboard-minus">−</button>
        <button type="button" class="ln683BNValue" data-op="keyboard-reset"></button>
        <button type="button" data-op="keyboard-plus">+</button>
      </div>
    </div>`;
  sekce.prepend(wrapper);

  function vykresli() {
    const t = popisky[getJazyk()];
    wrapper.querySelectorAll('[data-label]').forEach(el => {
      el.textContent = t[Number(el.dataset.label)];
    });
    const editorVal = wrapper.querySelector('[data-op="editor-reset"]');
    const keyboardVal = wrapper.querySelector('[data-op="keyboard-reset"]');
    editorVal.textContent = editorPx === null ? t[4] : `${editorPx} px`;
    keyboardVal.textContent = `${klavesyPct} %`;
    editorVal.setAttribute('aria-label', `${t[7]}: ${t[0]}`);
    keyboardVal.setAttribute('aria-label', `${t[7]}: ${t[2]}`);
    for (const [op,txt] of [['editor-minus',t[5]],['editor-plus',t[6]],['keyboard-minus',t[5]],['keyboard-plus',t[6]]]) {
      wrapper.querySelector(`[data-op="${op}"]`).setAttribute('aria-label',txt);
    }
    wrapper.querySelector('[data-op="editor-minus"]').disabled = editorPx === 12;
    wrapper.querySelector('[data-op="editor-plus"]').disabled = editorPx === 28;
    wrapper.querySelector('[data-op="keyboard-minus"]').disabled = klavesyPct === 90;
    wrapper.querySelector('[data-op="keyboard-plus"]').disabled = klavesyPct === 120;
  }
  function zakladniVelikostAplikace() {
    const cislo = Number.parseFloat(getComputedStyle(koren).fontSize);
    return Number.isFinite(cislo) ? Math.round(cislo) : 16;
  }
  wrapper.addEventListener('click', e => {
    const op = e.target.closest('button[data-op]')?.dataset.op;
    if (!op) return;
    if (op === 'editor-reset') editorPx = null;
    else if (op === 'editor-minus' || op === 'editor-plus') {
      const zaklad = editorPx ?? zakladniVelikostAplikace();
      editorPx = clamp(zaklad + (op.endsWith('plus') ? 1 : -1), 12, 28);
    } else if (op === 'keyboard-reset') klavesyPct = 100;
    else if (op === 'keyboard-minus' || op === 'keyboard-plus') {
      klavesyPct = clamp(klavesyPct + (op.endsWith('plus') ? 5 : -5), 90, 120);
    }
    uloz(KLIC_EDITOR, editorPx);
    uloz(KLIC_KLAVESY, klavesyPct === 100 ? null : klavesyPct);
    pouzij();
    vykresli();
  });
  window.addEventListener('lubanote:language-change', vykresli);
  pouzij();
  vykresli();
})();
