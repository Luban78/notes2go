/* LubaNote AutoTester 691L — 690B registry + isolated Core V2 bullet behavioral tests.
 * Explicit opt-in; isolated Worker runs synthetic cases only.
 * Local Testy smoke suite uses production storage for its own UUID; no credentials/keys are logged or sent to the runner.
 * A secure administrator-only LubaServer runner executes isolated SQL tests on demand.
 */
(() => {
  'use strict';
  let screen=null, worker=null, results=[], startedAt='',activeSuite='all';
  let liveFirstDone=false;
  let runTimeout=null;
  let running=false;
  let activeRep=1;
  let lastTestNoteId=null;
  let generaceBehu=0;
  const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const suiteNames={notes:'Poznámky LOCAL / štítek Testy',extended:'Code / obrázky / jazyky – skutečné moduly',image:'Obrázky – živý editor / native zoom / ořez / velikost / obtékání',i18n:'Šest jazyků – kompletnost balíčků',caret:'Kurzor, úchyty a mazání ToDo dle nastavení',planner:'Planner / opakování (dle nastavení)',editor:'Editor Core V2 dle nastavení',todo:'ToDo Core V2 dle nastavení',all:'Všechny dostupné testy – Bullet, Editor, ToDo, Planner, E2E, DB a pokrytí V1',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru',stability:'Izolované regrese + pokrytí V1',bullet:'Bullet / seznamy – Core V2 dle nastavení + MOVE'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VIZUÁLNÍ REGRESE</div>
    <h1>AutoTester <span>691AS</span></h1><p>Živé regresní testy aplikace a doplňkové izolované kontroly. Produkční poznámky se nemění.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-main-controls">
      <button class="lat-main-run" type="button" data-lat="run" data-suite="all">▶ Spustit vše</button>
      <button id="lat-show-results" type="button" data-lat="show-results" hidden>↓ Výsledky testu</button>
      <div class="lat-subrun"><select id="lat-area" aria-label="Vybrat oblast">
        <option value="bullet">Bullet / seznamy (dle nastavení)</option><option value="editor">Editor / Core V2 (dle nastavení)</option><option value="todo">ToDo (dle nastavení)</option><option value="caret">Kurzor / úchyty / mazání (dle nastavení)</option><option value="planner">Planner / opakování (dle nastavení)</option><option value="e2e">E2E poznámky</option>
        <option value="notes">Poznámky LOCAL / Testy</option><option value="sync">Synchronizace</option><option value="ui">Android / UI</option>
        <option value="db">Databáze</option><option value="extended">Code / obrázky / jazyky (Core V2)</option><option value="image">Obrázky – živé testy a Core V2</option><option value="i18n">Šest jazykových balíčků</option><option value="stability">Izolované regrese + pokrytí V1</option>
      </select><button type="button" data-lat="area">Spustit oblast</button></div>
      <label class="lat-repeat-control" for="lat-repetitions">Opakování Core / Planner / Android WebView testů <input id="lat-repetitions" type="number" inputmode="numeric" min="1" max="50" step="1" value="1"></label>
      <small class="lat-repeat-help">Výchozí 1×, vlastní počet 1–50. Spustit vše upřednostňuje skutečný editor; staré izolované testy Bullet/Editor/ToDo zůstávají ve volbě Izolované regrese. E2E a DB běží 1×. Android používá MotionEvent ve WebView, ne fyzický prst.</small>
    </section>
    <section class="lat-laboratory" data-compact="1" aria-label="Izolované diagnostické testy">
      <div class="lat-lab-top"><strong>Doplňkové izolované testy Core V2</strong>
        <div class="lat-lab-buttons"><button type="button" data-lat="speed" aria-pressed="true">🐢 Pomalu</button><button type="button" data-lat="expand" aria-pressed="false">⛶ Zvětšit</button><button type="button" data-lat="visual" aria-pressed="true">Náhled zapnutý</button></div></div>
      <div class="lat-live-stage" id="lat-live-stage"><span class="lat-live-placeholder">Zde se zobrazují pouze izolované regresní testy Core V2. Testy skutečného UI běží v běžné poznámce LubaNote Testy. Databázové testy obraz editoru nemají.</span></div>
      <div class="lat-progress-info"><span id="lat-live-step">Připraveno</span><span id="lat-progress-num">–</span></div>
      <div class="lat-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="lat-progress-track"><div id="lat-progress-fill"></div></div>
    </section>
    <div class="lat-result-head"><div><strong>Výsledek kontroly</strong><p id="lat-state" role="status">Zatím nic neproběhlo.</p></div><div class="lat-result-actions"><button type="button" data-lat="jump-first-problem" id="lat-jump-first-problem" hidden>↓ Přejít na chybu</button><button data-lat="copy" type="button" disabled>Kopírovat report</button></div></div>
    <div id="lat-summary" class="lat-summary" aria-live="polite"></div>
    <div class="lat-note-review"><button type="button" data-lat="review-note" id="lat-review-note" hidden>Otevřít poslední poznámku Testy v aplikaci</button><small>Poznámky z testů zůstávají v prostoru LOCAL pod štítkem Testy.</small></div>
    <details class="lat-details"><summary>Podrobnosti a jednotlivé testy</summary><div id="lat-list" class="lat-list" aria-label="Výsledky testování"></div></details>
    <footer class="lat-footer">690Y: viditelný Bullet / číslovaný seznam / ToDo / formátování a přechod na neověřené. 690W: oprava modalni kolize kapek a prechod na chybu. 690U: vlastní LubaNote caret, kapky a výběr se testují v běžném editoru. 690T: Testovací LOCAL poznámky se štítkem Testy zůstávají po běhu k prohlédnutí. Viditelný průchod editorem je skutečná UI obrazovka, nikoli Android UIAutomator. 690N: živý sandbox testuje skutečný Core V2 (Bullet/Editor/ToDo) a recurringTasks.js (opakování). Syntetický click/pointer/Range není fyzické Android gesto. PASS není důkaz nepokrytých oblastí. Spouští se pouze na vyžádání z APK.</footer>`;}
  let visualEnabled=true;
  let slowMode=true;
  let extraSlowMode=false;
  let expanded=false;
  let phase='';
  function setPhase(title){phase=title;setStatus(title);updateProgress(0,10,title);}
  function updateProgress(current,total,label){
    if(!screen)return;
    const n=Number(current)||0, t=Math.max(1,Number(total)||1);
    const percent=Math.round(Math.max(0,Math.min(100,100*n/t)));
    const fill=screen.querySelector('#lat-progress-fill');if(fill)fill.style.width=percent+'%';
    const track=screen.querySelector('#lat-progress-track');if(track)track.setAttribute('aria-valuenow',String(percent));
    const num=screen.querySelector('#lat-progress-num');if(num)num.textContent=n+' / '+t;
    const text=screen.querySelector('#lat-live-step');if(text)text.textContent=label||phase||'Testování';
    const hud=screen.querySelector('#lat-app-hud-text');if(hud&&label)hud.textContent=label;
  }
  function attachLiveFrame(frame){
    const host=screen?.querySelector('#lat-live-stage');
    if(!host||!visualEnabled||screen.hidden||host.closest('[data-compact="1"]'))return false;
    // Bez zmensovaci transformace: testovaci WebView vyuzije celou sirku panelu.
    frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:1;pointer-events:none;border:0;background:#fff;';
    host.classList.add('lat-has-live-frame');
    host.appendChild(frame);return true;
  }
  window.LubaNoteAutoTesterVisual690F=Object.freeze({attachFrame:attachLiveFrame,isEnabled:()=>visualEnabled,isSlow:()=>visualEnabled&&slowMode,getSpeedFactor:()=>!visualEnabled||!slowMode||screen?.querySelector('.lat-laboratory')?.dataset.compact==='1'?0:(extraSlowMode?2.5:1)});
  // 690M: Dvojtap admina ukaze POUZE panel VD / DH / T, zadny nastroj neotvira.
  window.LubaNoteDockBuild='690U';
  let lastAdminTap=null;
  function povolenDok(){
    try{return window.LubaNoteAdminTools?.isAllowed?.()===true;}catch(_){return false;}
  }
  function zajistiTesterVDocku(){
    if(!povolenDok())return;
    const tabs=document.getElementById('ln-vd-dock-tabs');
    if(!tabs)return;
    if(!document.getElementById('ln-vd-dock-t')){
      const button=document.createElement('button');
      button.id='ln-vd-dock-t';button.type='button';button.textContent='T';
      button.setAttribute('aria-label','Otevřít nebo minimalizovat AutoTester');
      button.title='AutoTester';
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if(!povolenDok())return;
        const tester=document.getElementById('ln-auto-tester');
        if(tester&&!tester.hidden)window.LubaNoteAutoTester?.close?.();
        else window.LubaNoteAutoTester?.open?.();
      });
      tabs.appendChild(button);
    }
    if(!document.getElementById('ln-vd-dock-t-690m-style')){
      const css=document.createElement('style');css.id='ln-vd-dock-t-690m-style';
      css.textContent='#ln-vd-quickbar #ln-vd-dock-tabs{grid-template-columns:repeat(3,minmax(0,1fr))!important}';
      css.textContent+=`#ln-auto-tester .lat-note-review{display:grid;gap:5px;margin:10px 0;color:#a5c6b0;font-size:.75rem}#ln-auto-tester #lat-review-note{background:#194e38;border-color:#31ac70;color:#e2fff0}#ln-auto-tester.lat-app-playback{background:transparent!important;overflow:hidden!important;pointer-events:none!important}#ln-auto-tester.lat-app-playback .lat-inner{display:none!important}#ln-auto-tester.lat-app-playback #lat-app-hud{display:flex!important;position:fixed;left:8px;right:8px;bottom:calc(10px + env(safe-area-inset-bottom));min-height:43px;border:1px solid #32b979;border-radius:12px;align-items:center;gap:8px;background:#10251de9;color:#dff7e7;padding:6px 10px;pointer-events:auto!important;box-shadow:0 6px 20px #0008;font:12px/1.2 system-ui;z-index:2147483600}#ln-auto-tester #lat-app-hud[hidden]{display:none!important}#ln-auto-tester #lat-app-hud-text{flex:1;min-width:0}#ln-auto-tester #lat-app-hud button{min-height:34px;padding:5px 8px;font-size:12px;border-color:#bd7658}`;
        document.head.appendChild(css);
    }
    const tester=document.getElementById('ln-auto-tester');
    document.getElementById('ln-vd-dock-t')?.classList.toggle('active',Boolean(tester&&!tester.hidden));
  }
  document.addEventListener('lubanote:visual-debug-ready',zajistiTesterVDocku);
  function zobrazDebugDockPokudJeTreba(){
    if(!povolenDok())return false;
    let dock=document.getElementById('ln-vd-quickbar');
    if(!dock||dock.hidden||getComputedStyle(dock).display==='none'){
      window.LubaNoteVisualDebug?.showDock?.();
      dock=document.getElementById('ln-vd-quickbar');
    }
    if(!dock||dock.hidden||getComputedStyle(dock).display==='none')return false;
    zajistiTesterVDocku();
    const rect=dock.getBoundingClientRect();
    if(rect.width&&rect.height&&(rect.right<24||rect.left>innerWidth-24||rect.bottom<24||rect.top>innerHeight-24)){
      for(const side of ['left','right','top','bottom'])dock.style.removeProperty(side);
    }
    return true;
  }
  function setupAdminDoubleTap(){
    const excluded=target=>Boolean(target?.closest?.('#ln-auto-tester,#ln-debug-hub,#ln-vd-panel,#ln-vd-quickbar'));
    const logo=target=>Boolean(target?.closest?.('.desktopSidebarBrand'));
    let start=null;
    document.addEventListener('pointerdown',e=>{
      start=null;
      if(!e.isPrimary||e.button!==0||excluded(e.target))return;
      const mobileCorner=e.clientX>=0&&e.clientX<=70&&e.clientY>=0&&e.clientY<=70;
      if(!logo(e.target)&&!mobileCorner)return;
      start={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),desktop:logo(e.target)};
    },true);
    document.addEventListener('pointerup',e=>{
      const prev=start;start=null;
      if(!prev||!e.isPrimary||e.pointerId!==prev.id||Math.hypot(e.clientX-prev.x,e.clientY-prev.y)>18||performance.now()-prev.t>520)return;
      if(!povolenDok()){lastAdminTap=null;return;}
      const now=performance.now();
      if(lastAdminTap&&now-lastAdminTap.t<520&&lastAdminTap.desktop===prev.desktop&&Math.hypot(lastAdminTap.x-e.clientX,lastAdminTap.y-e.clientY)<44){
        lastAdminTap=null;
        zobrazDebugDockPokudJeTreba();
        if(prev.desktop){e.preventDefault();e.stopImmediatePropagation();}
      }else lastAdminTap={t:now,x:e.clientX,y:e.clientY,desktop:prev.desktop};
    },true);
    document.addEventListener('pointercancel',()=>{start=null;},true);
    // Na PC se pracuje dvojklikem mysi; logo neni ve viewportovem rohu.
    document.addEventListener('dblclick',e=>{
      if(!logo(e.target)||excluded(e.target)||!povolenDok())return;
      e.preventDefault();
      e.stopImmediatePropagation();
      zobrazDebugDockPokudJeTreba();
    },true);
  }
  setupAdminDoubleTap();
  zajistiTesterVDocku();
  function open(){
    if(!isAllowed())return;
    if(!screen){
      screen=document.createElement('section');screen.id='ln-auto-tester';
      screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','LubaNote AutoTester');
      screen.innerHTML=`<div class="lat-inner">${header()}</div><div id="lat-app-hud" hidden><span id="lat-app-hud-text">Testuji v aplikaci…</span><button data-lat="stop-playback" type="button">Zpět / Stop</button></div>`;
      // A touchmove originating inside the modal must not reach the production
      // Core V2 document-level MOVE listeners. Those can preventDefault when a
      // previous native drag has left a temporary touch state. Stop propagation
      // without cancelling the scroll gesture of our own scroll container.
      screen.addEventListener('touchmove', event => {
        if(!screen.hidden && !screen.classList.contains('lat-app-playback')) event.stopPropagation();
      }, {passive:true});
      if(!document.getElementById('lat-core-colors-690c')){
        const css=document.createElement('style');css.id='lat-core-colors-690c';
        css.textContent=`#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-indicator{background:#40d38e}#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-pill{color:#88f2b7;border-color:#287c54}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-pill{color:#ff9292;border-color:#93463e}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-pill{color:#ffd89b;border-color:#937242}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-pill{color:#ffd89b;border-color:#937242}`;
        css.textContent+=`#ln-auto-tester .lat-main-controls{display:grid;gap:10px;margin:16px 0}#ln-auto-tester .lat-main-run{background:#187b51;border-color:#1ea86d;font-size:1.08rem;min-height:58px;color:#fff}#ln-auto-tester .lat-subrun{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}#ln-auto-tester .lat-subrun select{min-width:0;background:#26362e;color:#fff;border:1px solid #52675b;border-radius:10px;padding:10px;font:inherit}#ln-auto-tester .lat-subrun button{min-height:48px}#ln-auto-tester .lat-laboratory{background:#1b2b23;border:1px solid #38654b;border-radius:15px;padding:12px;margin:14px 0}#ln-auto-tester .lat-lab-top{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:.9rem}#ln-auto-tester .lat-lab-top button{font-size:.75rem;min-height:35px;padding:6px 9px}#ln-auto-tester .lat-live-stage{height:340px;position:relative;overflow:hidden;background:#f5f8f4;border-radius:11px;border:2px solid #4c705c;margin:11px 0;color:#4e6254}#ln-auto-tester .lat-live-placeholder{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:22px;font-size:.9rem;line-height:1.5}#ln-auto-tester .lat-live-stage.lat-has-live-frame .lat-live-placeholder{display:none}#ln-auto-tester .lat-progress-info{display:flex;gap:8px;justify-content:space-between;font-size:.82rem;color:#c5d7ca}#ln-auto-tester .lat-progress-track{height:9px;background:#32483c;border-radius:9px;overflow:hidden;margin-top:10px}#ln-auto-tester #lat-progress-fill{height:100%;width:0;background:#37c681;transition:width .22s}#ln-auto-tester .lat-result-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0 8px}#ln-auto-tester .lat-result-head p{font-size:.82rem;line-height:1.4;margin-top:5px}#ln-auto-tester .lat-result-head button{flex:none;font-size:.84rem}#ln-auto-tester .lat-summary{grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0 18px}#ln-auto-tester .lat-summary>div{padding:11px 4px}#ln-auto-tester .lat-details{border:1px solid #45584b;border-radius:12px;overflow:hidden}#ln-auto-tester .lat-details>summary{padding:15px;cursor:pointer;font-weight:700;background:#26352d}#ln-auto-tester .lat-details .lat-list{padding:10px}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-pill{color:#ffd89b}#ln-auto-tester .lat-footer{padding-bottom:28px}#ln-auto-tester .lat-live-stage[data-off='1']{height:90px;background:#24362b;color:#bfd1c5}#ln-auto-tester .lat-laboratory[data-off='1'] .lat-live-placeholder{display:grid}@media(max-width:380px){#ln-auto-tester .lat-subrun{grid-template-columns:minmax(0,1fr)}#ln-auto-tester .lat-live-stage{height:300px}#ln-auto-tester .lat-result-head{flex-wrap:wrap}}`;
        css.textContent += `#ln-auto-tester .lat-result[data-status='APP_PASS'] .lat-indicator{background:#3bcf8b}#ln-auto-tester .lat-result[data-status='APP_PASS'] .lat-pill{color:#87eeb2;border-color:#287c54}#ln-auto-tester .lat-result[data-status='APP_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='APP_FAIL'] .lat-pill{color:#ff9690;border-color:#93463e}#ln-auto-tester .lat-result[data-status='APP_BLOCKED'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='APP_BLOCKED'] .lat-pill{color:#ffd89b;border-color:#937242}`;
        css.textContent+='#ln-auto-tester .lat-repeat-control{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#def2e5;font-weight:750}#ln-auto-tester #lat-repetitions{width:78px;min-height:44px;background:#14241c;color:#fff;border:1px solid #62bb8a;border-radius:9px;padding:6px;text-align:center;font:inherit}#ln-auto-tester .lat-repeat-help{color:#a8beb1;font-size:.75rem;line-height:1.4}';
        css.textContent += "#ln-auto-tester .lat-result[data-status='NATIVE_PASS'] .lat-indicator{background:#41d49c}#ln-auto-tester .lat-result[data-status='NATIVE_PASS'] .lat-pill{color:#a6ffd8;border-color:#278d5e}#ln-auto-tester .lat-result[data-status='NATIVE_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='NATIVE_FAIL'] .lat-pill{color:#ff9ca5;border-color:#943d45}#ln-auto-tester .lat-result[data-status='NATIVE_BLOCKED'] .lat-indicator{background:#f3b763}#ln-auto-tester .lat-result[data-status='NATIVE_BLOCKED'] .lat-pill{color:#ffdfa0;border-color:#927541}";
        document.head.appendChild(css);
      }
      if(!document.getElementById('lat-690f1-large-preview')){
        const extra=document.createElement('style');extra.id='lat-690f1-large-preview';
        extra.textContent=`#ln-auto-tester .lat-live-stage{height:clamp(490px,65dvh,780px);border-width:1px}`+
        `#ln-auto-tester .lat-lab-top{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px}`+
        `#ln-auto-tester .lat-lab-buttons{display:flex;gap:5px;align-items:center;flex-wrap:wrap}`+
        `#ln-auto-tester .lat-lab-buttons button{min-height:34px;padding:5px 7px;font-size:.74rem}`+
        `#ln-auto-tester .lat-lab-buttons button[aria-pressed='true']{border-color:#42c88a;color:#b1ffd8}`+
        `#ln-auto-tester .lat-laboratory.lat-expanded{position:fixed;inset:0;z-index:2147483605;background:#17251e;margin:0;border-radius:0;display:flex;flex-direction:column;max-height:100dvh;padding:max(12px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom))}`+
        `#ln-auto-tester .lat-laboratory.lat-expanded .lat-live-stage{height:auto;flex:1;min-height:0;margin:10px 0}`+
        `#ln-auto-tester .lat-laboratory.lat-expanded .lat-progress-info{font-size:.95rem}`;
        document.head.appendChild(extra);
      }
      if(!document.getElementById('lat-690w-clickable-problems')){
        const jumpStyle=document.createElement('style');jumpStyle.id='lat-690w-clickable-problems';
        jumpStyle.textContent=`#ln-auto-tester .lat-result-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center}`+
          `#ln-auto-tester #lat-jump-first-problem:not([hidden]){background:#552c2a;border-color:#dc7774;color:#fff1ed}`+
          `#ln-auto-tester .lat-summary>button{background:#223029;border:1px solid #b66e65;border-radius:10px;padding:10px 4px;color:#fff;font:inherit;text-align:center;cursor:pointer;min-width:0}`+
          `#ln-auto-tester .lat-summary>button b{display:block;font-size:1.45rem;font-variant-numeric:tabular-nums}`+
          `#ln-auto-tester .lat-summary>button span{display:block;font-size:.59rem;letter-spacing:.02em;overflow-wrap:anywhere;color:#ffe4db}`+
          `#ln-auto-tester #lat-state[data-jump='yes']{cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-decoration-color:#e68d7c;text-underline-offset:3px}`+
          `#ln-auto-tester .lat-summary>button.lat-coverage-button{border-color:#bf975a;color:#ffe5a8}`+
          `#ln-auto-tester .lat-summary>button.lat-coverage-button span{color:#f0d7a7}`+
          `#ln-auto-tester .lat-result.lat-jump-highlight{border-color:#f28a78;box-shadow:0 0 0 2px #f28a7860}`+
          `@media(max-width:380px){#ln-auto-tester .lat-summary>button b{font-size:1.23rem}#ln-auto-tester .lat-summary>button span{font-size:.51rem}}`;
        document.head.appendChild(jumpStyle);
      }
      // Graphite Compact vyber oblasti: nativni Android select je pouze datovy zdroj.
      // Uzivatel vidi vlastni panel ve stylu LubaNote; zadne systemove sede menu.
      const areaSelect=screen.querySelector('#lat-area');
      const areaChooser=document.createElement('button');
      areaChooser.type='button';areaChooser.className='lat-area-chooser';
      areaChooser.dataset.lat='choose';areaChooser.setAttribute('aria-haspopup','dialog');
      areaChooser.setAttribute('aria-expanded','false');
      areaChooser.textContent=(areaSelect.selectedOptions?.[0]?.textContent||'Vybrat oblast')+'  ▾';
      areaSelect.hidden=true;
      areaSelect.after(areaChooser);
      const picker=document.createElement('div');picker.id='lat-area-picker';picker.className='lat-area-picker';
      picker.hidden=true;
      picker.innerHTML='<div class="lat-area-picker-shade" data-picker-close="1"></div>'+
        '<div class="lat-area-picker-panel" role="dialog" aria-modal="true" aria-label="Vybrat testovanou oblast">'+
        '<div class="lat-area-picker-head"><strong>Vybrat oblast</strong><button type="button" class="lat-area-picker-x" data-picker-close="1" aria-label="Zavřít výběr">×</button></div>'+
        '<div class="lat-area-picker-options" role="radiogroup" aria-label="Oblasti AutoTesteru">'+
        Array.from(areaSelect.options).map(o=>'<button type="button" class="lat-area-picker-option" role="radio" data-picker-value="'+safe(o.value)+'" aria-checked="'+String(o.selected)+'"><span>'+safe(o.textContent)+'</span><span class="lat-area-picker-check" aria-hidden="true">'+(o.selected?'✓':'')+'</span></button>').join('')+'</div></div>';
      screen.appendChild(picker);
      picker.addEventListener('click',e=>{
        if(e.target.closest('[data-picker-close]')){closeAreaPicker();return;}
        const item=e.target.closest('[data-picker-value]');
        if(!item)return;
        const val=item.dataset.pickerValue;
        if(!Array.from(areaSelect.options).some(o=>o.value===val))return;
        areaSelect.value=val;
        areaChooser.textContent=(areaSelect.selectedOptions?.[0]?.textContent||'Vybrat oblast')+'  ▾';
        closeAreaPicker();
      });
      picker.addEventListener('keydown',e=>{
        if(!['ArrowDown','ArrowUp'].includes(e.key))return;
        const options=Array.from(picker.querySelectorAll('.lat-area-picker-option'));
        const index=options.indexOf(document.activeElement);
        if(!options.length)return;
        e.preventDefault();options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
      });
      const pickerStyle=document.createElement('style');pickerStyle.id='lat-area-picker-690i3';
      pickerStyle.textContent=`
        #ln-auto-tester #lat-area[hidden]{display:none!important}
        #ln-auto-tester .lat-area-chooser{width:100%;min-width:0;min-height:52px;padding:12px 15px;text-align:left;background:#25382f;color:#e8f3ed;border:1px solid #567162;border-radius:13px;font:inherit;line-height:1.35}
        #ln-auto-tester .lat-area-chooser:focus-visible,#ln-auto-tester .lat-area-picker-option:focus-visible{outline:2px solid #41c993;outline-offset:2px}
        #ln-auto-tester .lat-area-picker[hidden]{display:none!important}
        #ln-auto-tester .lat-area-picker{position:fixed;inset:0;z-index:2147483620;display:flex;align-items:center;justify-content:center;padding:14px}
        #ln-auto-tester .lat-area-picker-shade{position:absolute;inset:0;background:rgba(0,0,0,.78)}
        #ln-auto-tester .lat-area-picker-panel{position:relative;width:min(100%,520px);max-height:min(79dvh,750px);display:flex;flex-direction:column;overflow:hidden;background:#192a23;border:1px solid #416e54;border-radius:16px;box-shadow:0 18px 50px #0009;color:#eef8f1}
        #ln-auto-tester .lat-area-picker-head{padding:13px 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #405749;font-size:1rem}
        #ln-auto-tester .lat-area-picker-x{height:36px;min-width:36px;border-radius:9px;border:1px solid #587261;background:#293a31;color:#fff;font-size:1.35rem}
        #ln-auto-tester .lat-area-picker-options{overflow-y:auto;overscroll-behavior:contain;padding:6px}
        #ln-auto-tester .lat-area-picker-option{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;gap:12px;min-height:52px;padding:12px 13px;background:transparent;color:#e3f0e6;border:0;border-bottom:1px solid #344b3d;border-radius:7px;font:inherit;font-size:.92rem;line-height:1.35}
        #ln-auto-tester .lat-area-picker-option[aria-checked='true']{background:#184c38;color:#baffd6}
        #ln-auto-tester .lat-area-picker-check{font-weight:800;color:#55d695;min-width:20px;text-align:right}
      `;
      document.head.appendChild(pickerStyle);
      document.body.appendChild(screen);
      screen.addEventListener('click',(e)=>{
        const btn=e.target.closest('button[data-lat]');if(!btn)return;
        const action=btn.dataset.lat;
        if(action==='close'){close();return;}
        if(action==='show-results'){showResults();return;}
        if(action==='stop-playback'){if(running)stop();restoreTestScreen();return;}
        if(action==='review-note'){void reviewLastNote();return;}
        if(action==='run'){void run(btn.dataset.suite);return;}
        if(action==='choose'){openAreaPicker();return;}
        if(action==='area'){void run(screen.querySelector('#lat-area')?.value || 'bullet');return;}
        if(action==='speed'){if(slowMode&&!extraSlowMode){extraSlowMode=true;}else if(extraSlowMode){slowMode=false;extraSlowMode=false;}else{slowMode=true;}btn.textContent=extraSlowMode?'🐌 Velmi pomalu':slowMode?'🐢 Pomalu':'⚡ Rychle';btn.setAttribute('aria-pressed',String(slowMode));return;}
        if(action==='expand'){expanded=!expanded;screen.querySelector('.lat-laboratory')?.classList.toggle('lat-expanded',expanded);btn.textContent=expanded?'↙ Zmenšit':'⛶ Zvětšit';btn.setAttribute('aria-pressed',String(expanded));return;}
        if(action==='visual'){visualEnabled=!visualEnabled;btn.textContent=visualEnabled?'Náhled zapnutý':'Náhled vypnutý';btn.setAttribute('aria-pressed',String(visualEnabled));const lab=screen.querySelector('.lat-laboratory');if(lab)lab.dataset.off=visualEnabled?'0':'1';return;}
                if(action==='jump-first-problem'){jumpToFirstProblem();return;}
        if(action==='jump-coverage'){jumpToCoverage();return;}
        if(action==='copy'){void copyReport(btn);}
      });
      // Tapping the displayed error itself should jump to its diagnosis.
      screen.querySelector('#lat-state')?.addEventListener('click',()=>jumpToFirstProblem());
      screen.querySelector('#lat-state')?.addEventListener('keydown',e=>{
        if((e.key==='Enter'||e.key===' ')&&screen.querySelector('#lat-state')?.dataset.jump==='yes'){
          e.preventDefault();jumpToFirstProblem();
        }
      });
      document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!screen.hidden){e.preventDefault();e.stopImmediatePropagation();handleTesterBack();}},true);
    }
    screen.hidden=false;document.body.classList.add('lat-open');
    restoreTesterScroll();
    zajistiTesterVDocku();
  }
  function collapseExpanded(){
    if(!screen||!expanded)return false;
    expanded=false;
    screen.querySelector('.lat-laboratory')?.classList.remove('lat-expanded');
    const btn=screen.querySelector('[data-lat="expand"]');
    if(btn){btn.textContent='⛶ Zvětšit';btn.setAttribute('aria-pressed','false');}
    return true;
  }
  function closeAreaPicker(){
    const picker=screen?.querySelector('#lat-area-picker');
    if(!picker||picker.hidden)return false;
    picker.hidden=true;
    screen.querySelector('.lat-area-chooser')?.setAttribute('aria-expanded','false');
    screen.querySelector('.lat-area-chooser')?.focus({preventScroll:true});
    return true;
  }
  function openAreaPicker(){
    const picker=screen?.querySelector('#lat-area-picker');
    if(!picker||!screen||screen.hidden)return;
    const selected=screen.querySelector('#lat-area')?.value;
    picker.querySelectorAll('[data-picker-value]').forEach(btn=>{
      const on=btn.dataset.pickerValue===selected;
      btn.setAttribute('aria-checked',String(on));
      btn.querySelector('.lat-area-picker-check').textContent=on?'✓':'';
    });
    picker.hidden=false;
    screen.querySelector('.lat-area-chooser')?.setAttribute('aria-expanded','true');
    (picker.querySelector('[aria-checked="true"]')||picker.querySelector('[data-picker-value]'))?.focus({preventScroll:true});
  }
  function handleTesterBack(){
    if(!screen||screen.hidden)return false;
    if(closeAreaPicker())return true;
    if(collapseExpanded())return true;
    close();return true;
  }
  // MainActivity calls this global synchronously and closes Activity on false.
  // Preserve the existing Android Back chain for every other LubaNote view.
  const backHandlerBeforeTester=window.LubaNoteZpracujAndroidZpet;
  window.LubaNoteZpracujAndroidZpet=function(){
    if(screen&&!screen.hidden)return handleTesterBack();
    return typeof backHandlerBeforeTester==='function'?backHandlerBeforeTester.apply(this,arguments):false;
  };
  // 690W: While testing the REAL editor, the AutoTester is a small HUD,
  // NOT a modal dialog. Its old aria-modal=true caused the production
  // selection guard [role=dialog][aria-modal=true] to HIDE OWN caret handles.
  // Revert modal semantics BEFORE returning to the full test screen.
  function minimizeTestScreen(){
    if(!screen||screen.hidden)return;
    screen.removeAttribute('aria-modal');
    // 691E: Never leave 691D's inline !important pointer-events / overflow
    // on the full-screen overlay: it would eat REAL editor MotionEvents even
    // though .lat-app-playback is meant to be click-through.
    clearTesterScrollOverrides();
    screen.classList.add('lat-app-playback'); // observed by Core V2 UI-overlay guard
    const hud=screen.querySelector('#lat-app-hud');if(hud)hud.hidden=false;
    document.body.classList.remove('lat-open');
  }
  // 691E: Two exclusive modes are controlled by the existing CSS rules:
  // .lat-app-playback = transparent, pointer-events:none (except bottom HUD)
  // normal tester     = scrollable, pointer-events:auto, touch-action:pan-y
  // Inline !important rules added by 691D overrode the playback rule and
  // blocked native touches in our own editor. Clear, never re-add them.
  function clearTesterScrollOverrides(){
    if(!screen)return;
    for(const prop of ['overflow-y','overflow-x','touch-action','pointer-events','-webkit-overflow-scrolling']){
      screen.style.removeProperty(prop);
    }
  }
  function restoreTesterScroll(){
    if(!screen || screen.hidden || screen.classList.contains('lat-app-playback'))return;
    clearTesterScrollOverrides(); // existing 691D CSS owns normal scrolling
  }
  function showResults(){
    if(!screen || screen.hidden || screen.classList.contains('lat-app-playback'))return false;
    restoreTesterScroll();
    const target=screen.querySelector('.lat-result-head');
    if(!target)return false;
    const top=screen.scrollTop + target.getBoundingClientRect().top - screen.getBoundingClientRect().top - 12;
    screen.scrollTop=Math.max(0,Math.min(top,screen.scrollHeight-screen.clientHeight));
    return true;
  }
  function restoreTestScreen(){
    if(!screen)return;
    screen.setAttribute('aria-modal','true');
    screen.classList.remove('lat-app-playback'); // observed by Core V2 UI-overlay guard
    const hud=screen.querySelector('#lat-app-hud');if(hud)hud.hidden=true;
    if(!screen.hidden)document.body.classList.add('lat-open');
    restoreTesterScroll();
  }
  async function reviewLastNote(){
    const id=lastTestNoteId;
    if(!id||!window.loadTask?.().some(n=>n?.id===id&&n.storageScope==='local'&&n.tags?.includes('Testy'))){
      setStatus('Testovaci poznamka uz v LOCAL neni.');return;
    }
    if(typeof window.openTaskEditorById!=='function'){setStatus('Otevreni poznamky neni dostupne.');return;}
    minimizeTestScreen();
    try{
      const ok=await window.openTaskEditorById(id);
      if(ok===false||document.getElementById('taskModal')?.hidden)throw Error('editor_not_opened');
      setStatus('Poznamka Testy je otevrena. Pro navrat do testeru pouzij dolni panel.');
    }catch(e){restoreTestScreen();setStatus('Otevreni selhalo: '+String(e?.message||e));}
  }
  async function spustitSkutecnyEditor690T(generace){
    const id=lastTestNoteId;
    if(!id)return;
    const module=window.LubaNoteAutoTesterUi690T;
    if(!module?.run){results.push({id:'ui-visible-run',name:'Viditelne ovladani skutecneho editoru',kind:'REAL_UI',status:'APP_BLOCKED',ms:0,detail:'UI modul chybi'});return;}
    const ready=()=>generace===generaceBehu&&running&&screen&&!screen.hidden;
    const emit=m=>{if(ready())setStatus(m);};
    try{
      const rows=await module.run(id,ready,emit,minimizeTestScreen,restoreTestScreen);
      if(!ready())return;
      if(!Array.isArray(rows)||rows.length!==9||rows.some(r=>!['APP_PASS','APP_FAIL','APP_BLOCKED','NATIVE_PASS','NATIVE_FAIL','NATIVE_BLOCKED'].includes(r.status)))throw Error('ui_results_invalid');
      results.push(...rows);render();
    }catch(e){if(ready())results.push({id:'ui-visible-run',name:'Viditelne ovladani skutecneho editoru',kind:'REAL_UI',status:'APP_FAIL',ms:0,detail:String(e?.message||e).slice(0,170)});}
    finally{restoreTestScreen();}
  }
  async function spustitViditelneNastroje690Y(generace){
    const expected=['ui-live-list-open','ui-live-bullet','ui-live-ordered','ui-live-todo','ui-live-todo-check','ui-live-format','ui-live-save-reopen'];
    const blocked=reason=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_BLOCKED',ms:0,detail:String(reason).slice(0,190)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('missing_owned_test_note'));render();return;}
      if(!results.some(r=>r.id==='ui-real-save'&&r.status==='APP_PASS')){
        results.push(...blocked('previous_visible_editor_test_not_passed'));render();return;
      }
      const mod=window.LubaNoteAutoTesterVisible690Y;
      if(!mod?.run){results.push(...blocked('visible_690Y_module_unavailable'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,
        msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||
        new Set(rows.map(r=>r.id)).size!==expected.length||
        rows.some(r=>!expected.includes(r.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('visible_690Y_invalid_results');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||'visible_690Y_error'));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitLive690Z(generace){
    const expected=['ui-livez-open','ui-livez-bullet-root','ui-livez-bullet-indent','ui-livez-bullet-collapse','ui-livez-bullet-expand','ui-livez-bullet-outdent','ui-livez-bullet-undo','ui-livez-save','ui-livez-deep-open','ui-livez-deep-indent','ui-livez-deep-collapse','ui-livez-deep-expand','ui-livez-deep-outdent','ui-livez-deep-persist','ui-livez-scroll-nojump'];
    const blocked=m=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_LIVE_690Z',status:'APP_BLOCKED',ms:0,detail:String(m).slice(0,175)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybí vlastní LOCAL Testy poznámka'));render();return;}
      if(!results.some(x=>x.id==='ui-live-save-reopen'&&x.status==='APP_PASS')){
        results.push(...blocked('Předchozí skutečný toolbar test nedokončen'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive690Z;
      if(!mod?.run){results.push(...blocked('690Z live modul se nenačetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(x=>x.id)).size!==expected.length||
         rows.some(x=>!expected.includes(x.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(x.status)))throw Error('690Z invalid results');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitSmiseneTodo691A(generace){
    const expected=['ui-livea-open','ui-livea-heading','ui-livea-previous','ui-livea-middle','ui-livea-next','ui-livea-reload','ui-livea-clear','ui-livea-delete','ui-livea-persist'];
    const blocked=m=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_MIXED_TODO_691A',status:'APP_BLOCKED',ms:0,detail:String(m).slice(0,175)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybí vlastní LOCAL Testy poznámka'));render();return;}
      if(!results.some(x=>x.id==='ui-livez-save'&&x.status==='APP_PASS')){
        results.push(...blocked('Předchozí živá Bullet regrese nedokončena'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive691A;
      if(!mod?.run){results.push(...blocked('691A modul se nenačetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(x=>x.id)).size!==expected.length||
        rows.some(x=>!expected.includes(x.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(x.status)))throw Error('691A invalid results');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitBarvyFormat691B(generace){
    const expected=['ui-liveb-open','ui-liveb-italic','ui-liveb-underline','ui-liveb-color','ui-liveb-highlight','ui-liveb-heading','ui-liveb-size','ui-liveb-highlight-clear','ui-liveb-persist','ui-liveb-neighbors'];
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_FORMAT_COLORS_691B',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,190)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybí vlastní LOCAL Testy poznámka'));render();return;}
      if(!results.some(r=>r.id==='ui-livea-persist'&&r.status==='APP_PASS')){
        results.push(...blocked('Předchozí živá ToDo regrese není PASS'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive691B;
      if(!mod?.run){results.push(...blocked('Modul 691B se nenačetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(r=>r.id)).size!==expected.length||
        rows.some(r=>!expected.includes(r.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691B invalid results');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitNativniBulletMove691C(generace){
    const expected=['ui-livec-open','ui-livec-parent','ui-livec-child','ui-livec-target','ui-livec-native-move','ui-livec-verify','ui-livec-history','ui-livec-persist'];
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_NATIVE_BULLET_MOVE_691C',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,185)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybí testovací poznámka LOCAL Testy'));render();return;}
      if(!results.some(r=>r.id==='ui-liveb-neighbors'&&r.status==='APP_PASS')){
        results.push(...blocked('Předchozí regrese 691B není kompletní PASS'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive691C;
      if(!mod?.run){results.push(...blocked('Modul 691C se nenačetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(r=>r.id)).size!==expected.length||
        rows.some(r=>!expected.includes(r.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED','NATIVE_PASS','NATIVE_FAIL','NATIVE_BLOCKED'].includes(r.status)))throw Error('691C neplatny vysledek');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitHledaniZarovnani691F(generace){
    const expected=['ui-livef-open','ui-livef-seed','ui-livef-find-open','ui-livef-find-count','ui-livef-find-navigation','ui-livef-find-missing','ui-livef-find-close','ui-livef-align-center','ui-livef-align-right','ui-livef-align-left','ui-livef-persist','ui-livef-find-reopen','ui-livef-preserve'];
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_FIND_ALIGN_691F',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,190)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybí vlastní LOCAL Testy poznámka'));render();return;}
      if(!results.some(r=>r.id==='ui-livec-persist'&&r.status==='APP_PASS')){
        results.push(...blocked('Předchozí nativní Bullet MOVE nebyl potvrzen'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive691F;
      if(!mod?.run){results.push(...blocked('Modul 691F se nenačetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(r=>r.id)).size!==expected.length||
        rows.some(r=>!expected.includes(r.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691F neplatné výsledky');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  // 691K: Production UI text/caret/Undo/Redo. Owned LOCAL Testy note only.
  async function spustitTextHistorii691K(generace){
    const expected=['ui-livek-open','ui-livek-plain-write','ui-livek-plain-middle','ui-livek-plain-delete','ui-livek-undo-text','ui-livek-undo-format','ui-livek-persist','ui-livek-preserve'];
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'REAL_EDITOR_PLAIN_HISTORY_691K',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,190)}));
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybi vlastni LOCAL Testy poznamka'));render();return;}
      if(!results.some(r=>r.id==='ui-livef-preserve'&&r.status==='APP_PASS')){
        results.push(...blocked('Predchozi zive hledani a zarovnani nebylo potvrzeno'));render();return;
      }
      const mod=window.LubaNoteAutoTesterLive691K;
      if(!mod?.run){results.push(...blocked('691K live modul nebyl nacten'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(r=>r.id)).size!==expected.length||
         rows.some(r=>!expected.includes(r.id)||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691K neplatne vysledky');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitHledaniSeznamu691L(generace){
    const expected=['ui-livel-ready','ui-livel-title','ui-livel-missing','ui-livel-clear','ui-livel-preserve'];
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'REAL_NOTES_TEXT_SEARCH_691L',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,190)}));
    try{
      if(!alive())return;
      if(!lastTestNoteId){results.push(...blocked('Chybi vlastni LOCAL Testy poznamka'));render();return;}
      if(!results.some(r=>r.id==='ui-livek-preserve'&&r.status==='APP_PASS')){results.push(...blocked('691K predchozi test neprosel'));render();return;}
      const mod=window.LubaNoteAutoTesterLive691L;
      if(!mod?.run){results.push(...blocked('691L modul se nenacetl'));render();return;}
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);});
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||rows.some((r,i)=>r.id!==expected[i]||!['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691L neplatny report');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{if(alive())render();}
  }
  // 691N – independent REAL image suite: never gated by earlier caret test.
  async function spustitObrazky691N(generace){
    const mod=window.LubaNoteAutoTesterLive691N;
    const expected=mod?.expected||[];
    const alive=()=>generace===generaceBehu&&running&&!screen?.hidden;
    if(!alive())return;
    if(!lastTestNoteId){
      results.push({id:'ui-img-setup',name:'Obrázky – LOCAL Testy fixture',kind:'REAL_EDITOR_IMAGE_691N',status:'APP_BLOCKED',ms:0,detail:'No owned Testy note.'});
      render();return;
    }
    try{
      if(!mod?.run||expected.length!==15)throw Error('691N live image module missing or invalid');
      const rows=await mod.run(lastTestNoteId,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||expected.some(id=>!rows.some(r=>r.id===id))||
        rows.some(r=>!['APP_PASS','APP_FAIL','APP_BLOCKED','NATIVE_PASS','NATIVE_FAIL','NATIVE_BLOCKED'].includes(r.status)))
        throw Error('691N image results invalid');
      results.push(...rows);
    }catch(e){if(alive())results.push({id:'ui-img-run',name:'Obrázky – živý test',kind:'REAL_EDITOR_IMAGE_691N',status:'APP_FAIL',ms:0,detail:String(e?.message||e).slice(0,190)});}
    finally{restoreTestScreen();if(alive())render();}
  }
  async function spustitZivePredIzolaci690Z(generace){
    if(generace!==generaceBehu||!running)return;
    setStatus('1/2: Skutečná LubaNote – vytvářím poznámku Testy…');
    await spustitPoznamky690S(generace);
    if(generace!==generaceBehu||!running)return;
    await spustitNativniWebView690R(generace);
    if(generace!==generaceBehu||!running)return;
    if(lastTestNoteId){
      await spustitSkutecnyEditor690T(generace);
      if(generace===generaceBehu)await spustitViditelneNastroje690Y(generace);
      if(generace===generaceBehu)await spustitLive690Z(generace);
      if(generace===generaceBehu)await spustitSmiseneTodo691A(generace);
      if(generace===generaceBehu)await spustitBarvyFormat691B(generace);
      if(generace===generaceBehu)await spustitNativniBulletMove691C(generace);
      if(generace===generaceBehu)await spustitHledaniZarovnani691F(generace);
      if(generace===generaceBehu)await spustitTextHistorii691K(generace);
      if(generace===generaceBehu)await spustitHledaniSeznamu691L(generace);
      if(generace===generaceBehu)await spustitObrazky691N(generace);
    }
    liveFirstDone=true;
    if(generace===generaceBehu&&running)setStatus('2/2: Doplňkové izolované regrese Core V2, E2E, DB a pokrytí V1…');
  }
  function close(){if(!screen)return;restoreTestScreen();closeAreaPicker();expanded=false;screen.querySelector('.lat-laboratory')?.classList.remove('lat-expanded');const expand=screen.querySelector('[data-lat="expand"]');if(expand){expand.textContent='⛶ Zvětšit';expand.setAttribute('aria-pressed','false');}screen.hidden=true;document.body.classList.remove('lat-open');stop();zajistiTesterVDocku();}
  function stop(){
    generaceBehu++; // Ignore late remote test responses from a closed or superseded run.
    if(runTimeout){clearTimeout(runTimeout);runTimeout=null;}
    if(worker){worker.terminate();worker=null;}
    if(running){running=false;setStatus('Přerušeno. Nedokončené testy se nepovažují za PASS.');}
  }
  function setStatus(s){
    const el=screen?.querySelector('#lat-state');if(el)el.textContent=s;
    if(!screen)return;
    const progress=running ? String(s).match(/(\d+)\s*\/\s*(\d+)\b/) : null;
    if(progress)updateProgress(Number(progress[1]),Number(progress[2]),s);
    else {const label=screen.querySelector('#lat-live-step');if(label)label.textContent=s;}
    const hud=screen.querySelector('#lat-app-hud-text');if(hud)hud.textContent=s;
  }
  const problemStatuses=new Set(['FAIL','CLIENT_FAIL','SIM_FAIL','DB_FAIL','CORE_FAIL','APP_FAIL','NATIVE_FAIL']);
  const blockedStatuses=new Set(['BLOCKED','DB_BLOCKED','CORE_BLOCKED','APP_BLOCKED','NATIVE_BLOCKED']);
  function jumpToFirstProblem(){
    if(!screen||screen.hidden)return false;
    const issue=results.find(r=>problemStatuses.has(r.status)) || results.find(r=>blockedStatuses.has(r.status));
    if(!issue)return false;
    const details=screen.querySelector('.lat-details');
    if(!details)return false;
    details.open=true;
    const target=Array.from(details.querySelectorAll('.lat-result')).find(el=>el.dataset.resultId===issue.id);
    if(!target)return false;
    target.open=true;
    details.querySelectorAll('.lat-result.lat-jump-highlight').forEach(el=>el.classList.remove('lat-jump-highlight'));
    target.classList.add('lat-jump-highlight');
    requestAnimationFrame(()=>{
      target.scrollIntoView({behavior:'smooth',block:'center'});
      const line=target.querySelector('summary');
      line?.setAttribute('tabindex','-1');
      try{line?.focus({preventScroll:true});}catch(_error){}
    });
    return true;
  }
  function jumpToCoverage(){
    if(!screen||screen.hidden)return false;
    const chosen=results.find(r=>r.status==='NOT_TESTED')||
      results.find(r=>r.status==='PARTIAL')||results.find(r=>r.status==='AUDIT');
    if(!chosen)return false;
    const details=screen.querySelector('.lat-details');if(!details)return false;
    details.open=true;
    const row=Array.from(details.querySelectorAll('.lat-result')).find(el=>el.dataset.resultId===chosen.id);
    if(!row)return false;
    row.open=true;row.classList.add('lat-jump-highlight');
    requestAnimationFrame(()=>{row.scrollIntoView({behavior:'smooth',block:'center'});
      row.querySelector('summary')?.focus({preventScroll:true});});
    return true;
  }
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,CORE_PASS:0,CORE_FAIL:0,CORE_BLOCKED:0,APP_PASS:0,APP_FAIL:0,APP_BLOCKED:0,NATIVE_PASS:0,NATIVE_FAIL:0,NATIVE_BLOCKED:0,PARTIAL:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0,V1_PASS:0};for(const r of results){if(r.id.startsWith('stability-v1-')&&r.status==='PASS'){sum.V1_PASS++;continue;}sum[r.status]=(sum[r.status]||0)+1;}return sum;}
  function render(){
    if(!screen)return;
    const count=sums(), summary=screen.querySelector('#lat-summary');
    const passing=count.PASS+count.CLIENT_PASS+count.SIM_PASS+count.DB_PASS+count.CORE_PASS+count.APP_PASS+count.NATIVE_PASS;
    const failing=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL+count.NATIVE_FAIL;
    const blocked=count.BLOCKED+count.DB_BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED+count.NATIVE_BLOCKED;
    const missing=count.NOT_TESTED+count.PARTIAL+count.AUDIT;
    summary.innerHTML=`<div><b>${passing}</b><span>PROVEDENO PASS</span></div>${failing ? `<button type="button" data-lat="jump-first-problem" aria-label="Přejít na první chybu"><b>${failing}</b><span>CHYBY ↓</span></button>` : `<div><b>${failing}</b><span>CHYBY</span></div>`}${blocked&&!failing ? `<button type="button" data-lat="jump-first-problem" aria-label="Přejít na první blokovaný test"><b>${blocked}</b><span>BLOKOVÁNO ↓</span></button>` : `<div><b>${blocked}</b><span>BLOKOVÁNO</span></div>`}${missing ? `<button type="button" data-lat="jump-coverage" class="lat-coverage-button" aria-label="Přejít na první netestovaný nebo částečný scénář"><b>${missing}</b><span>NEOVĚŘENO / ČÁSTEČNĚ / AUDIT ↓</span></button>` : `<div><b>0</b><span>NEOVĚŘENO / ČÁSTEČNĚ / AUDIT</span></div>`}`;
    const state=screen.querySelector('#lat-state');
    const haveProblem=failing>0||blocked>0;
    const jump=screen.querySelector('#lat-jump-first-problem');
    if(jump){jump.hidden=!haveProblem||running;jump.textContent=failing>0?'↓ Přejít na chybu':'↓ Přejít na blokování';}
    if(state){
      state.dataset.jump=haveProblem&&!running?'yes':'no';
      state.setAttribute('tabindex',haveProblem&&!running?'0':'-1');
      state.title=haveProblem&&!running?'Klepnutím zobrazíš přesný chybný test':'';
    }
    if(state&&!running){
      if(failing>0)state.textContent=`⛔ CHYBA: ${failing} testů selhalo. ${blocked} dalších je blokovaných. Zkopíruj report.`;
      else if(blocked>0)state.textContent=`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Není to PASS celé aplikace! Zkopíruj report.`;
      else if(missing>0)state.textContent=`Dokončeno bez zjištěné chyby v provedených testech. ${missing} položek je jen audit / částečně / netestováno.`;
    }
    const showButton=screen.querySelector('#lat-show-results');
    if(showButton)showButton.hidden=results.length===0 || screen.classList.contains('lat-app-playback');
    const list=screen.querySelector('#lat-list');
    const priority={FAIL:0,CORE_FAIL:0,APP_FAIL:0,DB_FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,NATIVE_FAIL:0,BLOCKED:1,NATIVE_BLOCKED:1,CORE_BLOCKED:1,APP_BLOCKED:1,DB_BLOCKED:1,NOT_TESTED:2,PARTIAL:3,AUDIT:4};
    const ordered=results.slice().sort((a,b)=>(priority[a.status]??5)-(priority[b.status]??5));
    list.innerHTML=ordered.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',CORE_PASS:'CORE V2 PASS',CORE_FAIL:'CORE V2 FAIL',CORE_BLOCKED:'CORE V2 BLOKOVÁNO',APP_PASS:'MODUL PASS',APP_FAIL:'MODUL FAIL',APP_BLOCKED:'MODUL BLOKOVÁNO',NATIVE_PASS:'ANDROID WEBVIEW PASS',NATIVE_FAIL:'ANDROID WEBVIEW FAIL',NATIVE_BLOCKED:'ANDROID BLOKOVÁNO',PARTIAL:'ČÁSTEČNĚ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
      const ownLabel=r.id.startsWith('stability-v1-')&&r.status==='PASS'?'V1 AUTOMATICKY PASS':r.kind==='OWN_LUBANOTE_NATIVE_INPUT_690U' ?
        ({NATIVE_PASS:'LUBANOTE VLASTNÍ PASS',NATIVE_FAIL:'LUBANOTE VLASTNÍ FAIL',NATIVE_BLOCKED:'LUBANOTE BLOKOVÁNO'}[r.status]||label):label;
      return `<details class="lat-result" data-result-id="${safe(r.id)}" data-status="${safe(r.status)}"><summary><span class="lat-indicator" aria-hidden="true"></span><span class="lat-result-title">${safe(r.name)}</span><span class="lat-pill">${ownLabel}</span></summary><div class="lat-result-body"><div>Typ: ${safe(r.kind)} · Trvání: ${Number(r.ms)||0} ms</div><div>ID testu: ${safe(r.id)}</div>${r.detail?`<p>${safe(r.detail)}</p>`:''}</div></details>`;
    }).join('')||'<div class="lat-empty">Spusť test. Průběh uvidíš výše, výsledky po dokončení zde.</div>';
    screen.querySelector('[data-lat="copy"]').disabled=results.length===0||running;
    const speedButton=screen.querySelector('[data-lat="speed"]');if(speedButton)speedButton.disabled=running;
  }
  /* 690B: Single source of truth = STABILITA_TESTY in the shipped debugHub.js.
   * Read source text ONLY, never evaluate it or load any user's data.
   * Coverage is NOT a functional test; NOT_TESTED is intentional until a
   * real isolated behavioral runner for a scenario is implemented.
   */
  async function nacistScenareV1(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try {
      const url=new URL('debugHub.js?v=690B-stability-registry',location.href);
      if(url.origin!==location.origin)throw Error('stability_source_other_origin');
      const response=await fetch(url.href,{credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      if(!response.ok)throw Error('stability_source_http_'+response.status);
      const src=await response.text();
      const marker='const STABILITA_TESTY = Object.freeze([';
      const start=src.indexOf(marker);
      if(start<0)throw Error('stability_registry_missing');
      const end=src.indexOf('\n  ]);',start);
      if(end<0 || end-start>25000)throw Error('stability_registry_end_missing');
      const rows=src.slice(start+marker.length,end).split('\n').filter(x=>/^\s*\{\s*id:/.test(x));
      const names=new Set();
      const result=[];
      const pattern=/^\s*\{\s*id:\s*"([^"\\]+)"\s*,\s*skupina:\s*"([^"\\]+)"\s*,\s*nazev:\s*"([^"\\]+)"/;
      for(const row of rows){
        const hit=row.match(pattern);
        if(!hit || !/^[a-z0-9-]{2,64}$/.test(hit[1]) || names.has(hit[1]))throw Error('stability_registry_invalid_row');
        names.add(hit[1]);
        // Human-readable procedural steps are intentionally not interpreted as proof.
        result.push({id:hit[1],group:hit[2],name:hit[3]});
      }
      if(result.length<30 || result.length!==rows.length)throw Error('stability_registry_incomplete');
      for(const required of ['editor-plain','list-toggle','list-move','notes-trash','app-planner']){
        if(!names.has(required))throw Error('stability_registry_key_missing_'+required);
      }
      return result;
    }finally {clearTimeout(timer);}
  }
  async function pridejPokrytiV1(generace,scope){
    let scenare;
    try {scenare=await nacistScenareV1();}
    catch(e){
      if(generace!==generaceBehu || !screen || screen.hidden)return;
      results.push({id:'stability-registry-unavailable',name:'Centrum stability V1 – registr nelze ověřit',
        kind:'STABILITY_REGISTRY',status:'BLOCKED',ms:0,detail:String(e?.message||'read_error').slice(0,150)});
      render();
      return;
    }
    if(generace!==generaceBehu || !screen || screen.hidden)return;
    const vybrane=scope==='bullet'?scenare.filter(x=>x.group==='Seznamy'):scope==='editor'?scenare.filter(x=>x.group==='Editor'):scope==='todo'?[]:scope==='planner'?scenare.filter(x=>x.id==='app-planner'):scenare;
    if(scope==='bullet' && vybrane.length<5){
      results.push({id:'stability-bullet-registry-incomplete',name:'Bullet / seznamy – chybí scénáře',
        kind:'STABILITY_REGISTRY',status:'BLOCKED',ms:0,detail:'Očekáváno alespoň 5 scénářů Seznamy.'});
      render();return;
    }
    // 691J: 30 scenarios from debugHub.js are the canonical V1 checklist.
    // Provenance must be an executed, successful result in THIS run.
    // Only full UI/native behavior may prove a complete manual scenario.
    const uplneDukazy=new Map([
      ['editor-plain',['ui-livek-plain-write','ui-livek-plain-middle','ui-livek-plain-delete','ui-livek-persist']],
      ['editor-undo',['ui-livek-undo-text','ui-livek-undo-format','ui-livek-persist']],
      ['editor-format',['ui-live-format','ui-liveb-italic','ui-liveb-underline','ui-liveb-heading','ui-liveb-persist']],
      ['list-move',['ui-livec-native-move','ui-livec-verify','ui-livec-history','ui-livec-persist']],
      // 691Z: the complete multi-level list case runs actual Tab, Shift+Tab,
      // two nested collapse/expand pairs and UI save/reopen in ONE APK run.
      // A missing/failed independent step never counts as a V1 PASS.
      ['list-levels',[
        'ui-livez-bullet-indent','ui-livez-bullet-outdent','ui-livez-save',
        'ui-livez-deep-open','ui-livez-deep-indent','ui-livez-deep-collapse',
        'ui-livez-deep-expand','ui-livez-deep-outdent','ui-livez-deep-persist'
      ]],
      // 691Y: the full manual Find scenario requires actual editor and list UI,
      // multiple editor hits, next/previous, absence, clearing and persistence.
      // Every dependency must pass in this SAME run; no partial green status.
      ['notes-search',[
        'ui-livef-find-open','ui-livef-find-count','ui-livef-find-navigation',
        'ui-livef-find-missing','ui-livef-find-close','ui-livef-find-reopen',
        'ui-livel-ready','ui-livel-title','ui-livel-missing',
        'ui-livel-clear','ui-livel-preserve'
      ]],
      // 691Y: image roundtrip now verifies pixels, CSS appearance, sizing,
      // alignment and neighboring text before and after a real UI save/reopen.
      ['image-reopen',['ui-img-persist']]
    ]);
    const castecneDukazy=new Map([
      ['editor-plain',['ui-real-keyboard','ui-livea-clear','core-editor-keyboard']],
      ['editor-undo',['ui-livez-bullet-undo','ui-livec-history','core-editor-history']],
      ['editor-caret',['ui-own-tap','ui-own-caret-drag','caret-todo-reopen']],
      ['editor-selection',['ui-own-selection','ui-own-handle-drag','caret-todo-range']],
      ['editor-edge',['caret-editor-scroll']],
      ['editor-format',['ui-live-format','ui-liveb-italic','ui-liveb-persist','caret-editor-format']],
      ['list-toggle',['ui-livez-bullet-collapse','ui-livez-bullet-expand','ui-livez-scroll-nojump','core-list-toggle']],
      ['list-badge',['ui-livez-bullet-expand','core-list-badge']],
      ['list-levels',['ui-livez-bullet-indent','ui-livez-bullet-outdent','core-list-indent']],
      ['list-move',['ui-livec-native-move','core-list-move-pointer']],
      ['list-selection',['core-list-selection-collapse']],
      ['code-integrity',['core-code-import']],
      ['code-caret',['core-code-caret']],
      ['code-image',['core-code-image']],
      ['image-between',['core-image-order','caret-editor-image','ui-img-insert']],
      ['image-wrap',['core-image-size','ui-img-wrap','ui-img-persist']],
      ['image-move',['core-image-size','ui-img-size','ui-img-wrap']],
      ['image-reopen',['core-image-roundtrip','ui-img-persist']],
      ['notes-create',['local-notes-create','ui-real-open']],
      ['notes-trash',['local-notes-trash','local-notes-restore']],
      ['notes-search',['ui-livel-ready','ui-livel-title','ui-livel-missing','ui-livel-clear']],
      ['security-e2e',['e2e-self','e2e-no-plaintext']],
      ['app-planner',['planner-repeat-daily','planner-repeat-weekly','planner-repeat-month-end','planner-repeat-bounds','planner-repeat-next','planner-repeat-future','planner-repeat-copy','planner-live-picker-routing','planner-live-reminder-toggle','planner-ar-open','planner-ar-save','planner-ar-reopen','planner-ar-cleanup','planner-as-open','planner-as-schedule','planner-as-cancel','planner-as-reopen','planner-as-cleanup']],
      ['app-i18n',['app-i18n-packs']]
    ]);
    const dukazy=new Map(results.map(x=>[x.id,x]));
    const prosel=id=>['PASS','CORE_PASS','APP_PASS','NATIVE_PASS'].includes(dukazy.get(id)?.status);
    for(const item of vybrane){
      const uplne=uplneDukazy.get(item.id)||[];
      const celkove=uplne.length>0&&uplne.every(prosel);
      const castecne=castecneDukazy.get(item.id)||[];
      const dilci=castecne.filter(prosel);
      const stav=celkove?'PASS':dilci.length?'PARTIAL':'NOT_TESTED';
      // PARTIAL never means the manual scenario has passed. Even a module
      // test running shipped code can cover only a narrower behavior.
      results.push({id:'stability-v1-'+item.id,name:item.name,kind:'STABILITY_V1/'+item.group,
        status:stav,ms:0,
        detail:celkove
          ?'V1 scénář ověřen vykonanými produkčními kroky: '+uplne.join(', ')+'. Android dotyky jsou MotionEvent ve WebView, nikoliv fyzický prst.'
          :dilci.length
            ?'Částečné důkazy: '+dilci.join(', ')+'. Zbytek scénáře není ověřen, automatický PASS se nepřiznává.'
            :'V tomto běhu chybí funkční důkaz; žádný ruční PASS se nepřebírá.'});
    }
    render();
  }
  // 690C: run the ACTUAL shipped Core V2 in opaque-origin sandbox only.
  // The module is loaded on demand, so old builds fail CLOSED (not PASS).
  async function spustitBulletCore690C(generace){
    const expected=['core-list-import','core-list-render','core-list-toggle','core-list-badge'];
    const blocked=(reason)=>expected.map(id=>({id,name:id,kind:'CORE_V2_SANDBOX',status:'CORE_BLOCKED',ms:0,detail:String(reason||'not_loaded').slice(0,165)}));
    try {
      if(window.LubaNoteAutoTesterBullet690C?.supportsRepeatCount!==true){
        const js=new URL('lubaAutoTesterBullet690C_690J.js?v=690J-690J-repeat-count',location.href);
        if(js.origin!==location.origin)throw Error('bullet_module_origin_blocked');
        await new Promise((resolve,reject)=>{
          const element=document.createElement('script');
          const timeout=setTimeout(()=>{element.remove();reject(Error('bullet_module_load_timeout'));},12000);
          element.src=js.href;
          element.onload=()=>{clearTimeout(timeout);resolve();};
          element.onerror=()=>{clearTimeout(timeout);reject(Error('bullet_module_load_failed'));};
          document.head.appendChild(element);
        });
      }
      if(generace!==generaceBehu || screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterBullet690C.runRepeated(
        ()=>generace===generaceBehu && !screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep
      );
      if(generace!==generaceBehu || screen.hidden)return;
      const good=Array.isArray(rows) && rows.length===4 &&
        rows.every(r=>expected.includes(r.id) && ['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status)) &&
        new Set(rows.map(r=>r.id)).size===4;
      results.push(...(good?rows:blocked('bullet_test_results_invalid')));
    }catch(e){
      if(generace!==generaceBehu || screen.hidden)return;
      results.push(...blocked(e?.message||'bullet_module_unavailable'));
    }
    if(generace===generaceBehu && !screen.hidden)render();
  }

  // 690D: isolated production Core V2 Tab/Shift+Tab, hierarchy and Undo/Redo.
  async function spustitBulletHierarchie690D(generace){
    const expected=['core-list-indent','core-list-level-history'];
    const blocked=why=>expected.map(id=>({id,name:id,kind:'CORE_V2_SANDBOX_KEYBOARD',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,165)}));
    try{
      if(window.LubaNoteAutoTesterBullet690D?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterBullet690D_690J.js?v=690J-690D-level-hierarchy',location.href);
        if(url.origin!==location.origin)throw Error('cross_origin_module');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('levels_module_timeout'));},12000);
          tag.src=url.href;
          tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('levels_module_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterBullet690D.runRepeated(
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep
      );
      if(generace!==generaceBehu||screen.hidden)return;
      const valid=Array.isArray(rows)&&rows.length===2&&new Set(rows.map(r=>r.id)).size===2&&
          rows.every(r=>expected.includes(r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status));
      results.push(...(valid?rows:blocked('invalid_levels_rows')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'levels_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 690E: actual Core V2 receives synthetic pointer long-press/MOVE and browser Selection Range.
  async function spustitBulletMoveVyber690E(generace){
    const expected=['core-list-move-pointer','core-list-selection-collapse'];
    const blocked=why=>expected.map(id=>({id,name:id,kind:'CORE_V2_SANDBOX_POINTER',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,165)}));
    try{
      if(window.LubaNoteAutoTesterBullet690E?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterBullet690E_690J.js?v=690J-690J-repeat-count-move-selection',location.href);
        if(url.origin!==location.origin)throw Error('cross_origin_module');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('move_module_timeout'));},12000);
          tag.src=url.href;
          tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('move_module_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterBullet690E.runRepeated(
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep
      );
      if(generace!==generaceBehu||screen.hidden)return;
      const valid=Array.isArray(rows)&&rows.length===2&&new Set(rows.map(r=>r.id)).size===2&&
        rows.every(r=>expected.includes(r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status));
      results.push(...(valid?rows:blocked('invalid_move_selection_rows')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'move_selection_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 690G: real shipped Core V2 runs Editor and TODO operations on artificial data only.
  async function spustitEditorTodo690G(generace,scope='all'){
    const ids=['core-editor-keyboard','core-editor-history','core-todo-state','core-todo-history','core-todo-export'];
    const expected=ids.filter(id=>scope==='all'||(scope==='editor'?id.startsWith('core-editor-'):id.startsWith('core-todo-')));
    const blocked=why=>expected.map(id=>({id,name:id,kind:'CORE_V2_SANDBOX_690G',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,165)}));
    try{
      if(window.LubaNoteAutoTesterEditorTodo690G?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterEditorTodo690G_690J.js?v=690J-690G-v1',location.href);
        if(url.origin!==location.origin)throw Error('editor_todo_cross_origin');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('editor_todo_load_timeout'));},12000);
          tag.src=url.href;tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('editor_todo_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterEditorTodo690G.runRepeated(scope,
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const valid=Array.isArray(rows)&&rows.length===expected.length&&new Set(rows.map(r=>r.id)).size===expected.length&&
        rows.every(r=>expected.includes(r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status));
      results.push(...(valid?rows:blocked('invalid_editor_todo_rows')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'editor_todo_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 690H: actual shipped recurrence algorithms, no production planner records or notifications.
  async function spustitPlanner690H(generace){
    const expected=['planner-repeat-daily','planner-repeat-weekly','planner-repeat-month-end',
      'planner-repeat-bounds','planner-repeat-next','planner-repeat-future','planner-repeat-copy'];
    const blocked=why=>expected.map(id=>({id,name:id,kind:'SHIPPED_RECURRING_TASKS_ISOLATED',status:'APP_BLOCKED',ms:0,detail:String(why||'missing').slice(0,160)}));
    try{
      if(window.LubaNoteAutoTesterPlanner690H?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterPlanner690H_690J.js?v=690J-690J-repeat-count',location.href);
        if(url.origin!==location.origin)throw Error('planner_cross_origin');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('planner_module_load_timeout'));},12000);
          tag.src=url.href;tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('planner_module_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterPlanner690H.runRepeated(
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const valid=Array.isArray(rows)&&rows.length===expected.length&&new Set(rows.map(r=>r.id)).size===expected.length&&
        rows.every(r=>expected.includes(r.id)&&['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status));
      results.push(...(valid?rows:blocked('invalid_planner_results')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'planner_runner_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 691AQ: real Planner button handlers, no Planner records or notifications touched.
  async function spustitPlannerLive691AQ(generace){
    if(generace!==generaceBehu||screen.hidden)return;
    const expected=['planner-live-picker-routing','planner-live-reminder-toggle'];
    try{
      const mod=window.LubaNoteAutoTesterPlannerLive691AQ;
      if(!mod?.runRepeated)throw Error('691AQ_script_missing');
      const rows=await mod.runRepeated(()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      if(!Array.isArray(rows)||rows.length!==expected.length||rows.some((r,i)=>r.id!==expected[i]||!['APP_PASS','APP_FAIL'].includes(r.status)))throw Error('691AQ_invalid_rows');
      results.push(...rows);
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...expected.map(id=>({id,name:id,kind:'PLANNER_LIVE_UI_691AQ',status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,160)})));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 691AR: production Planner modal + real LOCAL Testy note, safely cleaned after proof.
  async function spustitPlannerLive691AR(generace){
    const expected=['planner-ar-fixture','planner-ar-open','planner-ar-save','planner-ar-reopen','planner-ar-cleanup','planner-as-open','planner-as-schedule','planner-as-cancel','planner-as-reopen','planner-as-cleanup'];
    const alive=()=>generace===generaceBehu&&running&&screen&&!screen.hidden;
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'PLANNER_LIVE_STORAGE_691AR',status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,190)}));
    if(!alive())return;
    try{
      const mod=window.LubaNoteAutoTesterPlannerLive691AR;
      if(!mod?.run)throw Error('691AR_live_module_not_loaded');
      const rows=await mod.run(null,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||rows.some((r,i)=>r.id!==expected[i]||
        !['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691AR_invalid_rows');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }

  // 691AS: real Android notification requested by real Planner UI; scoped native cancel.
  async function spustitPlannerLive691AS(generace){
    const expected=['planner-as-preflight','planner-as-open','planner-as-schedule',
      'planner-as-cancel','planner-as-reopen','planner-as-cleanup'];
    const alive=()=>generace===generaceBehu&&running&&screen&&!screen.hidden;
    const blocked=msg=>expected.map(id=>({id,name:id,kind:'PLANNER_ANDROID_REMINDER_691AS',
      status:'APP_BLOCKED',ms:0,detail:String(msg).slice(0,195)}));
    if(!alive())return;
    try{
      const mod=window.LubaNoteAutoTesterPlannerLive691AS;
      if(!mod?.run)throw Error('691AS_planner_module_not_loaded');
      const rows=await mod.run(null,alive,msg=>{if(alive())setStatus(msg);},minimizeTestScreen,restoreTestScreen);
      if(!alive())return;
      if(!Array.isArray(rows)||rows.length!==expected.length||rows.some((r,i)=>r.id!==expected[i]||
        !['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)))throw Error('691AS_invalid_rows');
      results.push(...rows);
    }catch(e){if(alive())results.push(...blocked(e?.message||e));}
    finally{restoreTestScreen();if(alive())render();}
  }

  // 690I: synthetic caret, DOM selection and TODO edge cases in the actual shipped Core V2.
  // Blue selection marks and red pointer dot are VISUAL diagnostics, not native Android handles.
  async function spustitKurzorTodo690I(generace,scope='all'){
    const allIds=['caret-todo-middle','caret-todo-clear','caret-todo-empty','caret-todo-mixed','caret-todo-legacy-html','caret-todo-last','caret-todo-range','caret-todo-reopen','caret-todo-done-move','caret-todo-done-longpress','caret-bullet-first-move','caret-bullet-last-move','caret-editor-plain','caret-bullet-text','caret-editor-format','caret-editor-colors','caret-editor-scroll','caret-editor-image'];
    const needed=scope==='editor'?allIds.filter(id=>id.startsWith('caret-editor-')||['caret-todo-range','caret-todo-reopen'].includes(id)):scope==='todo'?allIds.filter(id=>id.startsWith('caret-todo-')):scope==='bullet'?allIds.filter(id=>id.startsWith('caret-bullet-')):allIds;
    const blocked=why=>needed.map(id=>({id,name:'Kurzor / ToDo – '+id,kind:'CORE_V2_CARET_SANDBOX_690I',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,180)}));
    try{
      if(window.LubaNoteAutoTesterCaretTodo690I?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterCaretTodo690I.js?v=690T-hint-bottom-1',location.href);
        if(url.origin!==location.origin)throw Error('caret_module_cross_origin');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('caret_module_load_timeout'));},12000);
          tag.src=url.href;
          tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('caret_module_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterCaretTodo690I.runRepeated(scope,
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const good=Array.isArray(rows)&&rows.length===needed.length&&new Set(rows.map(r=>r.id)).size===needed.length&&
        rows.every(r=>needed.includes(r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status));
      results.push(...(good?rows:blocked('invalid_caret_results')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'caret_module_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 690Q: additional shipped Core V2 code/image/roundtrip + real language pack parity.
  // Neither a SIM result nor complete user-flow/Android regression proof.
  async function spustitPokrocile690Q(generace,scope='all'){
    const catalog=[
      ['core-code-import','Code – skutečný import, export a nedělitelný blok','CORE'],
      ['core-code-caret','Code – skutečný DOM Range uvnitř bloku','CORE'],
      ['core-code-image','Code – vložení obrázku zachová dva code bloky','CORE'],
      ['core-code-toggle','Code – převod běžného textu na code a zpět','CORE'],
      ['core-image-roundtrip','Obrázek – export a znovunačtení dokumentu','CORE'],
      ['core-image-size','Obrázek – změna velikosti a zarovnání','CORE'],
      ['core-image-delete-undo','Obrázek – odstranění a skutečné Undo','CORE'],
      ['core-image-order','Obrázek mezi texty – zachování pořadí a obsahu','CORE'],
      ['core-mixed-html','Smíšený obsah – nadpis, ToDo, code a HTML roundtrip','CORE'],
      ['app-i18n-packs','Překlady – 6 skutečných balíčků a shoda klíčů','APP']
    ];
    const expected=catalog.filter(x=>scope==='all'||scope==='editor'&&x[0].startsWith('core-code')||scope==='image'&&x[0].startsWith('core-image')||scope==='i18n'&&x[0].startsWith('app-i18n'));
    const blocked=why=>expected.map(([id,name,type])=>({id,name,kind:'REAL_MODULE_690Q_SANDBOX',status:type==='APP'?'APP_BLOCKED':'CORE_BLOCKED',ms:0,detail:String(why||'runner_missing').slice(0,200)}));
    try{
      if(window.LubaNoteAutoTesterExtended690Q?.supportsRepeatCount!==true){
        const u=new URL('lubaAutoTesterExtended690Q.js?v=690Q-first-coverage',location.href);
        if(u.origin!==location.origin)throw Error('extended_runner_cross_origin');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('extended_runner_load_timeout'));},12000);
          tag.src=u.href;tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('extended_runner_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterExtended690Q.runRepeated(scope,
        ()=>generace===generaceBehu&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const valid=Array.isArray(rows)&&rows.length===expected.length&&new Set(rows.map(r=>r.id)).size===expected.length&&
        rows.every(r=>expected.some(x=>x[0]===r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED','APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status));
      results.push(...(valid?rows:blocked('extended_runner_invalid_rows')));
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'extended_runner_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }

  // 690R – skutečné Android MotionEvent ve WebView. Java ověřuje
  // admin oprávnění i souřadnice izolované testovací plochy.
  async function spustitNativniWebView690R(generace){
    const cases=[
      ['native-webview-tap','Android WebView – doručení klepnutí'],
      ['native-webview-doubletap','Android WebView – doručení dvojklepnutí'],
      ['native-webview-swipe','Android WebView – doručení tažení'],
      ['native-webview-longpress','Android WebView – doručení dlouhého stisku']
    ];
    const blocked=why=>cases.map(([id,name])=>({id,name,kind:'ANDROID_WEBVIEW_NATIVE_MOTIONEVENT',status:'NATIVE_BLOCKED',ms:0,detail:String(why||'native_missing').slice(0,210)}));
    try {
      if(!window.LubaNoteAutoTesterNative690R){
        const url=new URL('lubaAutoTesterNative690R.js?v=690X-no-system-selection',location.href);
        if(url.origin!==location.origin)throw Error('native_script_cross_origin');
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          const timer=setTimeout(()=>{tag.remove();reject(Error('native_script_timeout'));},12000);
          tag.src=url.href;
          tag.onload=()=>{clearTimeout(timer);resolve();};
          tag.onerror=()=>{clearTimeout(timer);reject(Error('native_script_load_failed'));};
          document.head.appendChild(tag);
        });
      }
      if(generace!==generaceBehu || !running || screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterNative690R.runRepeated(
        ()=>generace===generaceBehu && running && !screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const ok=Array.isArray(rows) && rows.length===cases.length &&
        new Set(rows.map(r=>r.id)).size===cases.length &&
        rows.every(r=>cases.some(c=>c[0]===r.id) &&
        ['NATIVE_PASS','NATIVE_FAIL','NATIVE_BLOCKED'].includes(r.status));
      results.push(...(ok?rows:blocked('invalid_native_result_schema')));
    }catch(error){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(error?.message||'native_error'));
    }
    if(generace===generaceBehu && !screen.hidden)render();
  }

  // 690T: real LOCAL note lifecycle; admin/Testy gate, unique IDs and retained results.
  async function spustitPoznamky690S(generace){
    const expected=['local-notes-create','local-notes-edit','local-notes-reload','local-notes-trash','local-notes-restore','local-notes-retained'];
    const blocked=why=>expected.map(id=>({id,name:id,kind:'REAL_LOCAL_NOTE_STORAGE_690S',status:'APP_BLOCKED',ms:0,detail:String(why).slice(0,165)}));
    try{
      if(!window.LubaNoteAutoTesterNotes690S){
        const u=new URL('lubaAutoTesterNotes690S.js?v=690T-notes-retained-1',location.href);
        if(u.origin!==location.origin)throw Error('notes_module_other_origin');
        await new Promise((resolve,reject)=>{
          const element=document.createElement('script');
          const timeout=setTimeout(()=>{element.remove();reject(Error('notes_script_timeout'));},12000);
          element.src=u.href;
          element.onload=()=>{clearTimeout(timeout);resolve();};
          element.onerror=()=>{clearTimeout(timeout);reject(Error('notes_script_missing'));};
          document.head.appendChild(element);
        });
      }
      if(generace!==generaceBehu||!running||screen.hidden)return;
      const rows=await window.LubaNoteAutoTesterNotes690S.runRepeated(
        ()=>generace===generaceBehu&&running&&!screen.hidden,
        msg=>{if(generace===generaceBehu)setStatus(msg);},activeRep);
      if(generace!==generaceBehu||screen.hidden)return;
      const good=Array.isArray(rows)&&rows.length===expected.length&&new Set(rows.map(x=>x.id)).size===expected.length&&
        rows.every(x=>expected.includes(x.id)&&['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(x.status));
      results.push(...(good?rows:blocked('local_notes_result_schema_invalid')));
      if(good){lastTestNoteId=window.LubaNoteAutoTesterNotes690S.getLastCreatedId?.()||null;
        try{window.renderTasks?.();}catch(_e){}
        const review=screen?.querySelector('#lat-review-note');if(review)review.hidden=!lastTestNoteId;}
    }catch(e){
      if(generace!==generaceBehu||screen.hidden)return;
      results.push(...blocked(e?.message||'local_notes_unavailable'));
    }
    if(generace===generaceBehu&&!screen.hidden)render();
  }
  async function spustitServeroveTesty(generace){
    let vysledky;
    try {
      vysledky=await window.LubaNoteAutoTesterRemote690A?.runLive?.(
        ()=>generace===generaceBehu && !screen.hidden,
        (zprava)=>{if(generace===generaceBehu)setStatus(zprava);}
      );
    }catch(_error){ /* Fail closed below. */ }
    if(generace!==generaceBehu || !screen || screen.hidden)return;
    if(!Array.isArray(vysledky)||vysledky.length!==2){
      vysledky=window.LubaNoteAutoTesterRemote690A?.failAll?.('Serverový testovací modul není dostupný.')||[
        {id:'db-server-missing',name:'Serverové testování není dostupné',kind:'ISOLATED_SERVER',status:'DB_BLOCKED',detail:'Modul nenalezen.',ms:0}
      ];
    }
    results.push(...vysledky.filter(r=>['DB_PASS','DB_FAIL','DB_BLOCKED'].includes(r?.status)));
    render();
  }
  function dokoncitBeh(){
    running=false;
    restoreTestScreen();
    collapseExpanded();
    screen?.classList.add('lat-finished');
    restoreTesterScroll();
    screen?.querySelector('#lat-live-stage')?.classList.remove('lat-has-live-frame');
    const placeholder=screen?.querySelector('.lat-live-placeholder');
    if(placeholder)placeholder.textContent='Běh skončil. Tento náhled není záznamem testu. Pro sledování živého editoru zvol 🐌 Velmi pomalu a spusť konkrétní oblast.';
    render();
    const count=sums();
    const registr=results.filter(x=>x.id.startsWith('stability-v1-'));
    const partialV1=registr.filter(x=>x.status==='PARTIAL').length;
    const automatickyV1=registr.filter(x=>x.status==='PASS').length;
    const suffix=registr.length?` · Centrum V1: ${automatickyV1}/${registr.length} automaticky ověřeno, ${partialV1} částečně`:'';
    updateProgress(activeRep,activeRep,'Dokončeno – výsledky jsou níže');
    const failed=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL+count.NATIVE_FAIL;
    const blocked=count.DB_BLOCKED+count.BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED+count.NATIVE_BLOCKED;
    if(failed) setStatus(`⛔ CHYBA: ${failed} testů FAIL, ${blocked} BLOKOVÁNO. Kopírovat report.`);
    else if(blocked) setStatus(`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Výsledek NENÍ PASS! Kopírovat report.`);
    else if(count.NOT_TESTED||count.PARTIAL||count.AUDIT) setStatus(`DOČASNÝ VÝSLEDEK – bez nalezeného FAIL v testované části; ${count.NOT_TESTED} NETESTOVÁNO, ${count.PARTIAL} ČÁSTEČNĚ, ${count.AUDIT} AUDIT. Nejde o kompletní PASS.${suffix}`);
    else setStatus('Dokončeno – všechny dostupné vykonané kontroly prošly.');
    updateProgress(1,1,'Dokončeno – podrobnosti a rozsah pokrytí níže');
    // Let the last render/layout finish, then scroll the real modal to results.
    // This does not rely on the Android scroll gesture remaining usable.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(screen&&!screen.hidden&&!running)showResults();}));
  }
  async function dokoncitWorker(generace){
    if(generace!==generaceBehu)return;
    if(runTimeout){clearTimeout(runTimeout);runTimeout=null;}
    worker?.terminate();worker=null;
    if(activeSuite==='all' || activeSuite==='sync'){
      setStatus('Místní testy hotovy · spouštím databázové testy na LubaServeru…');
      await spustitServeroveTesty(generace);
    }
    if(generace===generaceBehu && activeSuite==='all'){
      // 691J: overlap of 690C/D/E/G/I with real editor regression is skipped
      // in Spustit vse. Original runners remain in the optional Stability area.
      // Unique code/image/i18n and recurrence tests must still run here.
      setStatus('Doplňkové testy Code / obrázky / překlady / opakování…');
      await spustitPokrocile690Q(generace,'all');
      if(generace===generaceBehu)await spustitPlanner690H(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AQ(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AR(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AS(generace);
    }
    if(generace===generaceBehu&&activeSuite==='all'&&!liveFirstDone){
      setStatus('Skutečné LOCAL poznámky – vytvoření/Koš/obnova, pak je ponechám pod Testy…');
      await spustitPoznamky690S(generace);
    }
    if(generace===generaceBehu && activeSuite==='ui' && !liveFirstDone && !lastTestNoteId) await spustitPoznamky690S(generace);
    if(generace===generaceBehu && (activeSuite==='all'||activeSuite==='ui')&&!liveFirstDone){
      setStatus('Ověřuji doručení nativních dotyků do WebView (ne vlastní selection)…');
      await spustitNativniWebView690R(generace);
    }
    if(generace===generaceBehu && activeSuite==='all'){
      setStatus('Načítám pokrytí Centra stability V1…');
      await pridejPokrytiV1(generace,'all');
    }
    if(generace===generaceBehu&&(activeSuite==='all'||activeSuite==='ui')&&lastTestNoteId&&!liveFirstDone){
      await spustitSkutecnyEditor690T(generace);
      if(generace===generaceBehu)await spustitViditelneNastroje690Y(generace);
    }
    if(generace===generaceBehu)dokoncitBeh();
  }
  async function run(suite){
    if(running)return;
    const requested=Number(screen?.querySelector('#lat-repetitions')?.value);
    if(!Number.isInteger(requested)||requested<1||requested>50){setStatus('Zadej celý počet opakování od 1 do 50.');return;}
    activeRep=requested;
    stop();
    const generace=generaceBehu;
    screen?.classList.remove('lat-finished');
    results=[];running=true;lastTestNoteId=null;liveFirstDone=false;const reviewButton=screen?.querySelector('#lat-review-note');if(reviewButton)reviewButton.hidden=true;
    startedAt=new Date().toISOString();activeSuite=suiteNames[suite]?suite:'all';
    // 691AD: only explicit isolated diagnostic suites need the large visual lab.
    // In the regular one-button run the same sandbox checks execute offscreen.
    const lab=screen?.querySelector('.lat-laboratory');
    if(lab)lab.dataset.compact=['all','ui','notes','e2e','sync','db'].includes(activeSuite)?'1':'0';
    screen?.querySelector('#lat-live-stage')?.classList.remove('lat-has-live-frame');
    const placeholder=screen?.querySelector('.lat-live-placeholder');
    if(placeholder)placeholder.textContent='Spouštím živé testovací okno Core V2…';
    restoreTesterScroll();
    render();updateProgress(0,activeRep,'Připravuji test…');
    setStatus(`Spouštím ${suiteNames[activeSuite].toLowerCase()}…`);
    if(activeSuite==='stability' || activeSuite==='bullet' || activeSuite==='editor' || activeSuite==='todo' || activeSuite==='planner' || activeSuite==='caret'||activeSuite==='extended'||activeSuite==='image'||activeSuite==='i18n'){
      if(activeSuite==='editor'||activeSuite==='todo'){await spustitEditorTodo690G(generace,activeSuite);if(generace===generaceBehu)await spustitKurzorTodo690I(generace,activeSuite);}
      if(activeSuite==='caret')await spustitKurzorTodo690I(generace,'all');
      if(activeSuite==='planner'){await spustitPlanner690H(generace);if(generace===generaceBehu)await spustitPlannerLive691AQ(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AR(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AS(generace);}
      if(['extended','image','i18n'].includes(activeSuite))await spustitPokrocile690Q(generace,activeSuite==='extended'?'all':activeSuite);
      if(activeSuite==='image' && generace===generaceBehu){
        await spustitPoznamky690S(generace);
        if(generace===generaceBehu)await spustitObrazky691N(generace);
      }
      if(activeSuite==='editor' && generace===generaceBehu)await spustitPokrocile690Q(generace,'editor');
      if(activeSuite==='stability' && generace===generaceBehu){
        await spustitBulletCore690C(generace);
        if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
        if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
        if(generace===generaceBehu)await spustitEditorTodo690G(generace,'all');
        if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'all');
        if(generace===generaceBehu)await spustitPokrocile690Q(generace,'all');
        if(generace===generaceBehu)await spustitPlanner690H(generace);
        if(generace===generaceBehu)await spustitPlannerLive691AQ(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AR(generace);
      if(generace===generaceBehu)await spustitPlannerLive691AS(generace);
      }
      if(activeSuite==='bullet'){await spustitBulletCore690C(generace);if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
      if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'bullet');}
      if(generace===generaceBehu && !['extended','i18n'].includes(activeSuite))await pridejPokrytiV1(generace,activeSuite==='bullet'?'bullet':activeSuite==='editor'?'editor':activeSuite==='todo'?'todo':activeSuite==='planner'?'planner':activeSuite==='caret'?'editor':'all');
      if(generace===generaceBehu)dokoncitBeh();
      return;
    }
    if(activeSuite==='notes'){
      await spustitPoznamky690S(generace);
      if(generace===generaceBehu&&lastTestNoteId){await spustitSkutecnyEditor690T(generace);
        if(generace===generaceBehu)await spustitViditelneNastroje690Y(generace);
        if(generace===generaceBehu)await spustitLive690Z(generace);
        if(generace===generaceBehu)await spustitSmiseneTodo691A(generace);
        if(generace===generaceBehu)await spustitBarvyFormat691B(generace);
        if(generace===generaceBehu)await spustitNativniBulletMove691C(generace);
      if(generace===generaceBehu)await spustitHledaniZarovnani691F(generace);
      if(generace===generaceBehu)await spustitTextHistorii691K(generace);
      if(generace===generaceBehu)await spustitHledaniSeznamu691L(generace);
      if(generace===generaceBehu)await spustitObrazky691N(generace);}
      if(generace===generaceBehu)dokoncitBeh();
      return;
    }
    if(activeSuite==='db'){
      await spustitServeroveTesty(generace);
      if(generace===generaceBehu)dokoncitBeh();
      return;
    }
    // 690Z: visible real-editor workflows FIRST; isolated unit tests SECOND.
    // Never silently replace real UI coverage with the sandbox test cases.
    if(activeSuite==='all'||activeSuite==='ui'){
      await spustitZivePredIzolaci690Z(generace);
      if(generace!==generaceBehu||!running)return;
    }
    try {worker=new Worker('lubaAutoTesterWorker.js?v=689C');}
    catch(e){running=false;results=[{id:'worker-start',name:'Testovací engine nelze spustit',kind:'REAL',status:'BLOCKED',detail:String(e?.message||'Worker_unavailable'),ms:0}];render();setStatus('Tester BLOKOVÁN. Nejde o PASS.');return;}
    worker.addEventListener('message',(e)=>{
      if(!running)return;
      if(e.data?.type==='result'){
        const r=e.data.result;
        if(!r || !['PASS','CLIENT_PASS','SIM_PASS','FAIL','CLIENT_FAIL','SIM_FAIL','AUDIT','BLOCKED','NOT_TESTED'].includes(r.status))return;
        results.push(r);render();setStatus(`Probíhá testování · ${results.length} výsledků`);
      }else if(e.data?.type==='done'){
        void dokoncitWorker(generace);
      }
    });
    worker.addEventListener('error',(e)=>{
      if(!running)return;
      results.push({id:'worker-error',name:'Chyba testovacího enginu',kind:'REAL',status:'BLOCKED',detail:'worker_runtime_error',ms:0});
      running=false;render();setStatus('Testovací engine selhal. Výsledek není PASS.');stop();
    });
    runTimeout=setTimeout(()=>{
      if(!running)return;
      results.push({id:'worker-timeout',name:'Časový limit testů',kind:'REAL',status:'BLOCKED',detail:'test_runner_timeout_30s',ms:30000});
      running=false;render();setStatus('Časový limit. Nedokončené testy nejsou PASS.');stop();
    },30000);
    worker.postMessage({action:'run',suite:activeSuite});
  }
  function report(){
    const counts=sums();
    const lines=[
      'LUBANOTE AUTOTESTER / 691AS',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `pozadovana_opakovani_core_planner=${activeRep}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${results.filter(x=>x.id.startsWith('e2e-')&&x.status==='PASS').length} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} CORE_PASS=${counts.CORE_PASS} CORE_FAIL=${counts.CORE_FAIL} CORE_BLOCKED=${counts.CORE_BLOCKED} APP_PASS=${counts.APP_PASS} APP_FAIL=${counts.APP_FAIL} APP_BLOCKED=${counts.APP_BLOCKED} NATIVE_PASS=${counts.NATIVE_PASS} NATIVE_FAIL=${counts.NATIVE_FAIL} NATIVE_BLOCKED=${counts.NATIVE_BLOCKED} PARTIAL=${counts.PARTIAL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
      `RUN_OUTCOME=${(counts.FAIL+counts.CLIENT_FAIL+counts.SIM_FAIL+counts.DB_FAIL+counts.CORE_FAIL+counts.APP_FAIL+counts.NATIVE_FAIL)>0?'FAIL':(counts.BLOCKED+counts.DB_BLOCKED+counts.CORE_BLOCKED+counts.APP_BLOCKED+counts.NATIVE_BLOCKED)>0?'INCOMPLETE_BLOCKED':'CHECKED_WITH_COVERAGE_GAPS'}`,
      `STABILITY_V1_TOTAL=${results.filter(x=>x.id.startsWith('stability-v1-')).length} STABILITY_V1_AUTOMATED_PASS=${counts.V1_PASS} STABILITY_V1_PARTIAL=${results.filter(x=>x.id.startsWith('stability-v1-')&&x.status==='PARTIAL').length}`,
      '691N: Obrazek nevyvolava textovy caret/menu/klavesnici; nativni obrazkovy test LOCAL Testy zahrnuje dvojtap na horni/spodni cast, pinch/pan fullscreen, orez, velikost, zarovnani, float-obtekani, delete/Undo/Redo a save/reopen. V1 obrazkove scenare zustavaji PARTIAL, dokud nejsou overene kompletne. 691M: Ochrana dvojtapu obrázku proti překrytí tlačítky Nastavení/Smazat a dovoleno kliknutí na figure. NATIVE OWN text vybere viditelný znak, případné NATIVE_FAIL nezablokuje nezávislé testy; 691L: hledání textu v seznamu poznámek. 691K: Vlastni LOCAL Testy poznamka: modelovy caret uprostred textu, znakovani/Backspace, Undo/Redo textu i formatu a trvale ulozeni; V1 editor-plain/editor-undo se meni na PASS jen po vsech zive vykonanych krocich. 691J: Spustit vse bez starych 690C/D/E/G/I duplicit; samostatna oblast Izolovane regrese je zachovana. V1 PASS jen podle zdokumentovane kombinace skutecnych testu Android/editoru. Pocet V1 PASS neni znovu prictan k poctu vykonanych testu. 691H: Vlastni uchyty – overeni smeru gesta, alternativni skutecny tah pri nezmenenem vyberu, zachovani FAIL bez blokovani ulozeni a dalsich nezavislych zivych testu. 691G: Find skenuje reálné Core V2 textové segmenty, test čeká na výsledek a hlásí model/DOM/pole; 691F: ŽIVÉ hledání uvnitř poznámky, navigace výsledků a zarovnání přes skutečné UI s uložením; 691E: FIX modal overlay pointer-events over actual editor; maintain result scrolling. 691D: FIX scrollování výsledků po nativním Bullet MOVE; ochrana před globálním touchmove a automatický přechod na report. 691C: REAL native Android WebView Bullet subtree MOVE via guarded Java MotionEvent + own editor model/Undo/Redo/persistence. 691B: LIVE real toolbar italic, underline, text color, highlight, H2, font size, clear highlight, and save/reopen; 691A: REAL APP mixed ToDo regression – text-by-text Backspace, empty checkbox removal, caret to previous ToDo, persisted re-open. 690Z: REAL APP FIRST – Bullet hierarchy Tab/ShiftTab, collapse, badge, Undo/Redo and save/reopen. Isolated tests remain separate. 690Y: LIVE 7-step UI toolbar regression on owned Testy LOCAL note (programmatic clicks, real model checks); PARTIAL/NOT_TESTED link navigates to coverage. 690X: OWN tap compares two separate native touches in the production editor; 690R transport stage cannot select system text. 690W: AutoTester HUD is nonmodal during live edit; error summary jumps to first FAIL.',
      '690U: OWN CARET/HANDLES tested inside owned Testy note by Java MotionEvent, not OS selection. 690T: LOCAL notes tagged Testy are saved, edited, restored and RETAINED for review. Visible editor walkthrough uses actual app screen, toolbar button, production keyboard command and save button; not OS UIAutomator or physical finger. 690R transport smoke uses isolated overlay only; own-editor touch, caret and selection are separate ui-own-* tests.',
      '690N: Isolated CORE_PASS runs shipped Core V2 with synthetic DOM events, not Android native input. 690U adds separate tests of LubaNote OWN caret, OWN handles and OWN selection inside the real editor using Java MotionEvent; system Android selection handles are deliberately disabled in the modern LubaKeyboard APK. No physical finger/OS UIAutomator and no complete V1 regression are claimed.', 
      'UPOZORNENI: DB_LIVE_PASS je NOVY izolovany PostgreSQL test vyvolany z APK na LubaServeru. 689D=SQL model, 689F=exportovana tela skutecnych RPC s testovacimi zavislostmi. NEtestuje produkcni databazi, realne triggery, prava RLS, dve zarizeni ani Android UI. CLIENT_PASS=skutecny sync.js s RAM RPC, SIM_PASS=model.',
      ...results.map(r=>`${r.status} | ${r.id} | ${r.name} | ${r.ms||0}ms | ${r.detail||'-'}`),
      'Bez hesel, klicu, poznamek, uzivatelskych identifikatoru a obsahu databaze.'
    ];
    return lines.join('\n');
  }
  async function copyReport(btn){
    const value=report();
    let success=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);success=true;}}catch(_e){}
    if(!success){
      const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.top='-10000px';document.body.appendChild(area);area.select();
      try{success=document.execCommand('copy');}catch(_e){}area.remove();
    }
    btn.textContent=success?'Zkopírováno ✓':'Kopírování selhalo';
    setTimeout(()=>{if(btn.isConnected)btn.textContent='Kopírovat report';},2500);
  }
  function addLaunch(){
    const hub=document.getElementById('ln-debug-hub');
    if(!hub || hub.querySelector('.lat-launch'))return;
    const place=hub.querySelector('.ln-dh-run-actions') || hub.querySelector('.ln-dh-head');
    if(!place)return;
    const btn=document.createElement('button');btn.type='button';btn.className='lat-launch';btn.textContent='AutoTester';
    btn.title='Otevřít izolovaný LubaNote AutoTester';
    btn.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();open();});
    place.appendChild(btn);
  }
  // Debug Hub emits this only when a developer opens it; no global DOM observer.
  document.addEventListener('lubanote:debug-hub-visibility',(event)=>{
    if(event?.detail?.open===true){
      // Take pri otevreni pres desktopove Admin menu musi byt dock viditelny.
      zobrazDebugDockPokudJeTreba();
      addLaunch();
    }
  });
  addLaunch();
  window.LubaNoteAutoTester=Object.freeze({open,close});
})();
