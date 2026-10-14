/* 683BK – jedna instance data/casu na HOME i v EDITORU.
 * Zachovava puvodni #lnHomeDateTime683BC, #lnHomeDate683BC, #lnHomeTime683BC
 * a tim i skutecne hodnoty z debugMobileGenerated.css. Bez klonovani.
 * Bez zasahu do CoreV2 / IME / Android fullscreen.
 */
(() => {
  'use strict';
  const hodiny = document.getElementById('lnHomeDateTime683BC');
  const editor = document.getElementById('taskModal');
  if (!hodiny || !editor) return;
  const domov = hodiny.parentNode;
  const dalsi = hodiny.nextSibling;
  if (!domov || editor === domov) return;

  function umisti() {
    const otevren = !editor.hidden && !editor.classList.contains('editorClosing');
    if (otevren && hodiny.parentNode !== editor) {
      editor.insertBefore(hodiny, editor.firstChild);
    } else if (!otevren && hodiny.parentNode !== domov) {
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
  window.addEventListener('pageshow', umisti);
  umisti();
})();
