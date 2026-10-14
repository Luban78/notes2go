/* 683BJ – stejny zivy datum/cas take v editoru.
 * Jen zrcadli jiz hotove domaci hodiny, bez zmeny editoru/IME/MainActivity.
 * Stejny nativni signal kratkeho swipu jako home – zdrojem je 683BI.
 */
(() => {
  'use strict';
  const domaci = document.getElementById('lnHomeDateTime683BC');
  const datumDomaci = document.getElementById('lnHomeDate683BC');
  const casDomaci = document.getElementById('lnHomeTime683BC');
  const editor = document.getElementById('taskModal');
  if (!domaci || !datumDomaci || !casDomaci || !editor || editor.querySelector('.lnEditorDateTime683BJ')) return;

  const radek = document.createElement('div');
  radek.className = 'lnEditorDateTime683BJ';
  radek.setAttribute('role','group');
  radek.setAttribute('aria-label','Datum a čas');
  const datum = document.createElement('time');
  datum.id = 'lnEditorDate683BJ';
  datum.className = 'lnHomeDate683BC';
  const cas = document.createElement('time');
  cas.id = 'lnEditorTime683BJ';
  cas.className = 'lnHomeTime683BC';
  radek.append(datum, cas);
  editor.prepend(radek);

  function aktualizuj() {
    datum.textContent = datumDomaci.textContent;
    cas.textContent = casDomaci.textContent;
    datum.dateTime = datumDomaci.dateTime;
    cas.dateTime = casDomaci.dateTime;
  }
  const sledovani = new MutationObserver(aktualizuj);
  sledovani.observe(datumDomaci,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['datetime']});
  sledovani.observe(casDomaci,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['datetime']});
  window.addEventListener('pageshow', aktualizuj);
  window.addEventListener('lubanote:language-change', aktualizuj);
  aktualizuj();
})();
