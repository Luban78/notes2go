/* 683BQ — vizualni volba pisem; poznamky, editorovy model a sync se nemeni. */
(() => {
  'use strict';
  const root = document.documentElement;
  const modal = document.getElementById('settingsModal');
  const vzhled = document.querySelector('#ln683BJBody-appearance .ln683BJBodyInner');
  const editor = document.querySelector('#ln683BJBody-editor .ln683BJBodyInner');
  if (!modal || !vzhled || !editor || document.getElementById('ln683BQApp')) return;

  const FONTY = [
    {id:'default', name:'LubaNote', actual:''},
    {id:'arimo', name:'Arial', actual:'Arimo'},
    {id:'carlito', name:'Calibri', actual:'Carlito'},
    {id:'tinos', name:'Times New Roman', actual:'Tinos'},
    {id:'cousine', name:'Courier New', actual:'Cousine'},
    {id:'gelasio', name:'Georgia', actual:'Gelasio'}
  ];
  const KLIC_APP = 'ln683bq_app_font';
  const KLIC_EDITOR = 'ln683bq_editor_font';
  const PREKLADY = {
    cs:['Písmo aplikace','Změní běžné texty v celé aplikaci.','Výchozí LubaNote','Písmo editoru','Stejné jako aplikace','Vlastní písmo poznámek','Kompatibilní alternativa:', 'Výběr písma'],
    en:['App font','Changes common text throughout the app.','LubaNote default','Editor font','Same as the app','Note editor font','Compatible alternative:', 'Choose font'],
    sk:['Písmo aplikácie','Zmení bežný text v celej aplikácii.','Pôvodné LubaNote','Písmo editora','Rovnaké ako aplikácia','Písmo poznámok','Kompatibilná alternatíva:', 'Vybrať písmo'],
    de:['App-Schrift','Ändert den üblichen Text in der App.','LubaNote Standard','Editor-Schrift','Wie in der App','Schrift im Notizeditor','Kompatibler Ersatz:', 'Schrift wählen'],
    pl:['Czcionka aplikacji','Zmienia zwykły tekst w całej aplikacji.','Domyślna LubaNote','Czcionka edytora','Jak w aplikacji','Czcionka notatek','Zgodny zamiennik:', 'Wybierz czcionkę'],
    es:['Letra de la aplicación','Cambia el texto habitual de la aplicación.','Predeterminada LubaNote','Letra del editor','Igual que la aplicación','Letra de las notas','Alternativa compatible:', 'Elegir fuente']
  };
  const locale = () => {
    const id=String(window.LubaNoteI18n?.ziskejLocale?.() || root.lang || 'cs').slice(0,2).toLowerCase();
    return PREKLADY[id] ? id : 'en';
  };
  function uloz(k,v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k,v); } catch (_) {}
  }
  function nacti(k,allowed,def) {
    try { const val=localStorage.getItem(k); return allowed.includes(val) ? val : def; } catch (_) { return def; }
  }
  let appFont=nacti(KLIC_APP,FONTY.map(p=>p.id),'default');
  let editorFont=nacti(KLIC_EDITOR,['app',...FONTY.map(p=>p.id)],'app');

  function blok(typ) {
    const blok=document.createElement('section');
    blok.className='ln683BQFontSetting';
    blok.id=typ==='app'?'ln683BQApp':'ln683BQEditor';
    const ids=typ==='app'?FONTY.map(p=>p.id):['app', ...FONTY.map(p=>p.id)];
    blok.innerHTML=`<button type="button" class="ln683BQHeader" aria-expanded="false" aria-controls="${blok.id}-choices">
      <span class="ln683BQCopy"><strong class="ln683BQTitle"></strong><small class="ln683BQHint"></small></span>
      <span class="ln683BQSelected"></span></button>
      <div class="ln683BQChoices" id="${blok.id}-choices" hidden role="group">
      ${ids.map(id=>{
        const font=FONTY.find(p=>p.id===id);
        return `<button type="button" class="ln683BQOption" data-option="${id}" aria-pressed="false">
          <span class="ln683BQOptionLabel"><strong class="ln683BQName"></strong><small class="ln683BQAlt"></small></span>
          <span class="ln683BQPreview" data-sample-font="${id}" aria-hidden="true">Aa Čč Žž</span>
        </button>`;
      }).join('')}</div>`;
    const head=blok.querySelector('.ln683BQHeader');
    const choices=blok.querySelector('.ln683BQChoices');
    function zavri() {choices.hidden=true; head.setAttribute('aria-expanded','false');}
    head.addEventListener('click',()=>{
      const open=choices.hidden;
      document.querySelectorAll('.ln683BQFontSetting .ln683BQChoices').forEach(ol=>{
        ol.hidden=true;
        ol.parentElement.querySelector('.ln683BQHeader').setAttribute('aria-expanded','false');
      });
      choices.hidden=!open;
      head.setAttribute('aria-expanded',String(open));
    });
    choices.addEventListener('click',ev=>{
      const opt=ev.target.closest('[data-option]');
      if (!opt || !choices.contains(opt)) return;
      const id=opt.dataset.option;
      if (!ids.includes(id)) return;
      if (typ==='app') {appFont=id; uloz(KLIC_APP,id==='default'?null:id);}
      else {editorFont=id; uloz(KLIC_EDITOR,id==='app'?null:id);}
      pouzij(); vykresli(); zavri();
      head.focus({preventScroll:true});
    });
    document.addEventListener('click',ev=>{if(!blok.contains(ev.target)) zavri();});
    modal.addEventListener('keydown',ev=>{
      if (ev.key==='Escape' && !choices.hidden) {ev.preventDefault();ev.stopPropagation();zavri();head.focus({preventScroll:true});}
    });
    return blok;
  }
  const vzhledBlok=blok('app');
  const editorBlok=blok('editor');
  vzhled.prepend(vzhledBlok);
  const size=editor.querySelector('#ln683BNPreferences');
  if(size) size.after(editorBlok); else editor.prepend(editorBlok);

  function pouzij() {
    if (appFont==='default') delete root.dataset.ln683bqAppFont;
    else root.dataset.ln683bqAppFont=appFont;
    root.dataset.ln683bqEditorFont=editorFont;
    window.dispatchEvent(new CustomEvent('lubanote:font-change', {detail:{app:appFont,editor:editorFont}}));
  }
  function jmeno(id,t) {
    if(id==='app') return t[4];
    if(id==='default') return t[2];
    return FONTY.find(p=>p.id===id)?.name || t[2];
  }
  function vykresli() {
    const t=PREKLADY[locale()];
    [[vzhledBlok,'app',appFont],[editorBlok,'editor',editorFont]].forEach(([p,typ,current])=>{
      p.querySelector('.ln683BQTitle').textContent=t[typ==='app'?0:3];
      p.querySelector('.ln683BQHint').textContent=t[typ==='app'?1:5];
      p.querySelector('.ln683BQSelected').textContent=jmeno(current,t);
      p.querySelector('.ln683BQHeader').setAttribute('aria-label',t[7]+': '+jmeno(current,t));
      p.querySelectorAll('[data-option]').forEach(el=>{
        const id=el.dataset.option;
        el.querySelector('.ln683BQName').textContent=jmeno(id,t);
        const detail=FONTY.find(p=>p.id===id);
        el.querySelector('.ln683BQAlt').textContent=detail?.actual?t[6]+' '+detail.actual:'';
        el.setAttribute('aria-pressed',String(id===current));
      });
    });
  }
  window.addEventListener('lubanote:language-change', vykresli);
  pouzij();vykresli();
})();
