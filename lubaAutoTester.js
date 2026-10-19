/* LubaNote AutoTester 690I2 — 690B registry + isolated Core V2 bullet behavioral tests.
 * Explicit opt-in; isolated Worker runs synthetic cases only.
 * No local user notes, credentials, keys or production LubaServer data are read.
 * A secure administrator-only LubaServer runner executes isolated SQL tests on demand.
 */
(() => {
  'use strict';
  let screen=null, worker=null, results=[], startedAt='',activeSuite='all';
  let runTimeout=null;
  let running=false;
  let generaceBehu=0;
  const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const suiteNames={caret:'Kurzor, úchyty a mazání ToDo 10×',planner:'Planner / opakování (10×)',editor:'Editor Core V2 10×',todo:'ToDo Core V2 10×',all:'Všechny dostupné testy – Bullet, Editor, ToDo, Planner, E2E, DB a pokrytí V1',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru',stability:'Centrum stability V1 – pokrytí',bullet:'Bullet / seznamy – Core V2 10× + MOVE'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VIZUÁLNÍ REGRESE</div>
    <h1>AutoTester <span>690I2</span></h1><p>Skutečný testovací editor v izolovaném okně. Tvoje poznámky zůstávají nedotčené.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-main-controls">
      <button class="lat-main-run" type="button" data-lat="run" data-suite="all">▶ Spustit kompletní test</button>
      <div class="lat-subrun"><select id="lat-area" aria-label="Vybrat oblast">
        <option value="bullet">Bullet / seznamy (10×)</option><option value="editor">Editor / Core V2 (10×)</option><option value="todo">ToDo (10×)</option><option value="caret">Kurzor / úchyty / mazání (10×)</option><option value="planner">Planner / opakování (10×)</option><option value="e2e">E2E poznámky</option>
        <option value="sync">Synchronizace</option><option value="ui">Android / UI</option>
        <option value="db">Databáze</option><option value="stability">Pokrytí stability V1</option>
      </select><button type="button" data-lat="area">Spustit oblast</button></div>
    </section>
    <section class="lat-laboratory" aria-label="Živá vizuální laboratoř">
      <div class="lat-lab-top"><strong>Živý testovací editor</strong>
        <div class="lat-lab-buttons"><button type="button" data-lat="speed" aria-pressed="true">🐢 Pomalu</button><button type="button" data-lat="expand" aria-pressed="false">⛶ Zvětšit</button><button type="button" data-lat="visual" aria-pressed="true">Náhled zapnutý</button></div></div>
      <div class="lat-live-stage" id="lat-live-stage"><span class="lat-live-placeholder">Po spuštění testu se zde zobrazí skutečné testovací okno Core V2. Databázové testy obraz editoru nemají.</span></div>
      <div class="lat-progress-info"><span id="lat-live-step">Připraveno</span><span id="lat-progress-num">–</span></div>
      <div class="lat-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="lat-progress-track"><div id="lat-progress-fill"></div></div>
    </section>
    <div class="lat-result-head"><div><strong>Výsledek kontroly</strong><p id="lat-state" role="status">Zatím nic neproběhlo.</p></div><button data-lat="copy" type="button" disabled>Kopírovat report</button></div>
    <div id="lat-summary" class="lat-summary" aria-live="polite"></div>
    <details class="lat-details"><summary>Podrobnosti a jednotlivé testy</summary><div id="lat-list" class="lat-list" aria-label="Výsledky testování"></div></details>
    <footer class="lat-footer">690I2: živý sandbox testuje skutečný Core V2 (Bullet/Editor/ToDo) a recurringTasks.js (opakování). Syntetický click/pointer/Range není fyzické Android gesto. PASS není důkaz nepokrytých oblastí. Spouští se pouze na vyžádání z APK.</footer>`;}
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
  }
  function attachLiveFrame(frame){
    const host=screen?.querySelector('#lat-live-stage');
    if(!host||!visualEnabled||screen.hidden)return false;
    // Bez zmensovaci transformace: testovaci WebView vyuzije celou sirku panelu.
    frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:1;pointer-events:none;border:0;background:#fff;';
    host.classList.add('lat-has-live-frame');
    host.appendChild(frame);return true;
  }
  window.LubaNoteAutoTesterVisual690F=Object.freeze({attachFrame:attachLiveFrame,isEnabled:()=>visualEnabled,isSlow:()=>visualEnabled&&slowMode,getSpeedFactor:()=>!visualEnabled||!slowMode?0:(extraSlowMode?2.5:1)});
  // Two taps in the same 70px upper-left region, only after server-verified admin login.
  // The old emergency five-tap fallback stays unchanged for this UI-only patch.
  let lastAdminTap=null;
  function setupAdminDoubleTap(){
    const allowed=()=>{const button=document.getElementById('adminDashboardButton');return Boolean(button && !button.hidden && window.LubaNoteAdminTools?.isAllowed?.()===true);};
    const excluded=target=>Boolean(target?.closest?.('#ln-auto-tester,#ln-debug-hub,#ln-vd-panel,#ln-vd-quickbar'));
    let start=null;
    document.addEventListener('pointerdown',e=>{
      start=null;
      if(!e.isPrimary||e.button!==0||excluded(e.target)||e.clientX<0||e.clientX>70||e.clientY<0||e.clientY>70)return;
      start={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now()};
    },true);
    document.addEventListener('pointerup',e=>{
      const x=start;start=null;
      if(!x||!e.isPrimary||e.pointerId!==x.id||Math.hypot(e.clientX-x.x,e.clientY-x.y)>18||performance.now()-x.t>520)return;
      if(!allowed()){lastAdminTap=null;return;}
      const now=performance.now();
      if(lastAdminTap && now-lastAdminTap.t<480 && Math.hypot(lastAdminTap.x-e.clientX,lastAdminTap.y-e.clientY)<44){
        lastAdminTap=null;
        window.LubaNoteDebugHub?.open?.();
      }else{lastAdminTap={t:now,x:e.clientX,y:e.clientY};}
    },true);
    document.addEventListener('pointercancel',()=>{start=null;},true);
  }
  setupAdminDoubleTap();
  function open(){
    if(!isAllowed())return;
    if(!screen){
      screen=document.createElement('section');screen.id='ln-auto-tester';
      screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','LubaNote AutoTester');
      screen.innerHTML=`<div class="lat-inner">${header()}</div>`;
      if(!document.getElementById('lat-core-colors-690c')){
        const css=document.createElement('style');css.id='lat-core-colors-690c';
        css.textContent=`#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-indicator{background:#40d38e}#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-pill{color:#88f2b7;border-color:#287c54}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-pill{color:#ff9292;border-color:#93463e}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-pill{color:#ffd89b;border-color:#937242}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-pill{color:#ffd89b;border-color:#937242}`;
        css.textContent+=`#ln-auto-tester .lat-main-controls{display:grid;gap:10px;margin:16px 0}#ln-auto-tester .lat-main-run{background:#187b51;border-color:#1ea86d;font-size:1.08rem;min-height:58px;color:#fff}#ln-auto-tester .lat-subrun{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}#ln-auto-tester .lat-subrun select{min-width:0;background:#26362e;color:#fff;border:1px solid #52675b;border-radius:10px;padding:10px;font:inherit}#ln-auto-tester .lat-subrun button{min-height:48px}#ln-auto-tester .lat-laboratory{background:#1b2b23;border:1px solid #38654b;border-radius:15px;padding:12px;margin:14px 0}#ln-auto-tester .lat-lab-top{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:.9rem}#ln-auto-tester .lat-lab-top button{font-size:.75rem;min-height:35px;padding:6px 9px}#ln-auto-tester .lat-live-stage{height:340px;position:relative;overflow:hidden;background:#f5f8f4;border-radius:11px;border:2px solid #4c705c;margin:11px 0;color:#4e6254}#ln-auto-tester .lat-live-placeholder{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:22px;font-size:.9rem;line-height:1.5}#ln-auto-tester .lat-live-stage.lat-has-live-frame .lat-live-placeholder{display:none}#ln-auto-tester .lat-progress-info{display:flex;gap:8px;justify-content:space-between;font-size:.82rem;color:#c5d7ca}#ln-auto-tester .lat-progress-track{height:9px;background:#32483c;border-radius:9px;overflow:hidden;margin-top:10px}#ln-auto-tester #lat-progress-fill{height:100%;width:0;background:#37c681;transition:width .22s}#ln-auto-tester .lat-result-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0 8px}#ln-auto-tester .lat-result-head p{font-size:.82rem;line-height:1.4;margin-top:5px}#ln-auto-tester .lat-result-head button{flex:none;font-size:.84rem}#ln-auto-tester .lat-summary{grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0 18px}#ln-auto-tester .lat-summary>div{padding:11px 4px}#ln-auto-tester .lat-details{border:1px solid #45584b;border-radius:12px;overflow:hidden}#ln-auto-tester .lat-details>summary{padding:15px;cursor:pointer;font-weight:700;background:#26352d}#ln-auto-tester .lat-details .lat-list{padding:10px}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-pill{color:#ffd89b}#ln-auto-tester .lat-footer{padding-bottom:28px}#ln-auto-tester .lat-live-stage[data-off='1']{height:90px;background:#24362b;color:#bfd1c5}#ln-auto-tester .lat-laboratory[data-off='1'] .lat-live-placeholder{display:grid}@media(max-width:380px){#ln-auto-tester .lat-subrun{grid-template-columns:minmax(0,1fr)}#ln-auto-tester .lat-live-stage{height:300px}#ln-auto-tester .lat-result-head{flex-wrap:wrap}}`;
        css.textContent += `#ln-auto-tester .lat-result[data-status='APP_PASS'] .lat-indicator{background:#3bcf8b}#ln-auto-tester .lat-result[data-status='APP_PASS'] .lat-pill{color:#87eeb2;border-color:#287c54}#ln-auto-tester .lat-result[data-status='APP_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='APP_FAIL'] .lat-pill{color:#ff9690;border-color:#93463e}#ln-auto-tester .lat-result[data-status='APP_BLOCKED'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='APP_BLOCKED'] .lat-pill{color:#ffd89b;border-color:#937242}`;
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
      document.body.appendChild(screen);
      screen.addEventListener('click',(e)=>{
        const btn=e.target.closest('button[data-lat]');if(!btn)return;
        const action=btn.dataset.lat;
        if(action==='close'){close();return;}
        if(action==='run'){void run(btn.dataset.suite);return;}
        if(action==='area'){void run(screen.querySelector('#lat-area')?.value || 'bullet');return;}
        if(action==='speed'){if(slowMode&&!extraSlowMode){extraSlowMode=true;}else if(extraSlowMode){slowMode=false;extraSlowMode=false;}else{slowMode=true;}btn.textContent=extraSlowMode?'🐌 Velmi pomalu':slowMode?'🐢 Pomalu':'⚡ Rychle';btn.setAttribute('aria-pressed',String(slowMode));return;}
        if(action==='expand'){expanded=!expanded;screen.querySelector('.lat-laboratory')?.classList.toggle('lat-expanded',expanded);btn.textContent=expanded?'↙ Zmenšit':'⛶ Zvětšit';btn.setAttribute('aria-pressed',String(expanded));return;}
        if(action==='visual'){visualEnabled=!visualEnabled;btn.textContent=visualEnabled?'Náhled zapnutý':'Náhled vypnutý';btn.setAttribute('aria-pressed',String(visualEnabled));const lab=screen.querySelector('.lat-laboratory');if(lab)lab.dataset.off=visualEnabled?'0':'1';return;}
        if(action==='copy'){void copyReport(btn);}
      });
      document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!screen.hidden){e.preventDefault();e.stopImmediatePropagation();handleTesterBack();}},true);
    }
    screen.hidden=false;document.body.classList.add('lat-open');
  }
  function collapseExpanded(){
    if(!screen||!expanded)return false;
    expanded=false;
    screen.querySelector('.lat-laboratory')?.classList.remove('lat-expanded');
    const btn=screen.querySelector('[data-lat="expand"]');
    if(btn){btn.textContent='⛶ Zvětšit';btn.setAttribute('aria-pressed','false');}
    return true;
  }
  function handleTesterBack(){
    if(!screen||screen.hidden)return false;
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
  function close(){if(!screen)return;expanded=false;screen.querySelector('.lat-laboratory')?.classList.remove('lat-expanded');const expand=screen.querySelector('[data-lat="expand"]');if(expand){expand.textContent='⛶ Zvětšit';expand.setAttribute('aria-pressed','false');}screen.hidden=true;document.body.classList.remove('lat-open');stop();}
  function stop(){
    generaceBehu++; // Ignore late remote test responses from a closed or superseded run.
    if(runTimeout){clearTimeout(runTimeout);runTimeout=null;}
    if(worker){worker.terminate();worker=null;}
    if(running){running=false;setStatus('Přerušeno. Nedokončené testy se nepovažují za PASS.');}
  }
  function setStatus(s){
    const el=screen?.querySelector('#lat-state');if(el)el.textContent=s;
    if(!screen)return;
    const progress=String(s).match(/(\d+)\s*\/\s*(10|50)\b/);
    if(progress)updateProgress(Number(progress[1]),Number(progress[2]),s);
    else {const label=screen.querySelector('#lat-live-step');if(label)label.textContent=s;}
  }
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,CORE_PASS:0,CORE_FAIL:0,CORE_BLOCKED:0,APP_PASS:0,APP_FAIL:0,APP_BLOCKED:0,PARTIAL:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0};for(const r of results)sum[r.status]=(sum[r.status]||0)+1;return sum;}
  function render(){
    if(!screen)return;
    const count=sums(), summary=screen.querySelector('#lat-summary');
    const passing=count.PASS+count.CLIENT_PASS+count.SIM_PASS+count.DB_PASS+count.CORE_PASS+count.APP_PASS;
    const failing=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL;
    const blocked=count.BLOCKED+count.DB_BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED;
    const missing=count.NOT_TESTED+count.PARTIAL+count.AUDIT;
    summary.innerHTML=`<div><b>${passing}</b><span>PROVEDENO PASS</span></div><div><b>${failing}</b><span>CHYBY</span></div><div><b>${blocked}</b><span>BLOKOVÁNO</span></div><div><b>${missing}</b><span>NEOVĚŘENO / ČÁSTEČNĚ / AUDIT</span></div>`;
    const state=screen.querySelector('#lat-state');
    if(state&&!running){
      if(failing>0)state.textContent=`⛔ CHYBA: ${failing} testů selhalo. ${blocked} dalších je blokovaných. Zkopíruj report.`;
      else if(blocked>0)state.textContent=`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Není to PASS celé aplikace! Zkopíruj report.`;
      else if(missing>0)state.textContent=`Dokončeno bez zjištěné chyby v provedených testech. ${missing} položek je jen audit / částečně / netestováno.`;
    }
    const list=screen.querySelector('#lat-list');
    const priority={FAIL:0,CORE_FAIL:0,APP_FAIL:0,DB_FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,BLOCKED:1,CORE_BLOCKED:1,APP_BLOCKED:1,DB_BLOCKED:1,NOT_TESTED:2,PARTIAL:3,AUDIT:4};
    const ordered=results.slice().sort((a,b)=>(priority[a.status]??5)-(priority[b.status]??5));
    list.innerHTML=ordered.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',CORE_PASS:'CORE V2 PASS',CORE_FAIL:'CORE V2 FAIL',CORE_BLOCKED:'CORE V2 BLOKOVÁNO',APP_PASS:'PLANNER PASS',APP_FAIL:'PLANNER FAIL',APP_BLOCKED:'PLANNER BLOKOVÁNO',PARTIAL:'ČÁSTEČNĚ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
      return `<details class="lat-result" data-status="${safe(r.status)}"><summary><span class="lat-indicator" aria-hidden="true"></span><span class="lat-result-title">${safe(r.name)}</span><span class="lat-pill">${label}</span></summary><div class="lat-result-body"><div>Typ: ${safe(r.kind)} · Trvání: ${Number(r.ms)||0} ms</div><div>ID testu: ${safe(r.id)}</div>${r.detail?`<p>${safe(r.detail)}</p>`:''}</div></details>`;
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
    const bulletProof=new Map([['editor-plain','core-editor-keyboard'],['editor-undo','core-editor-history'],['editor-caret','caret-editor-plain'],['editor-format','caret-editor-format'],['editor-edge','caret-editor-scroll'],['image-between','caret-editor-image'],['editor-caret','caret-todo-reopen'],['editor-selection','caret-todo-range'],['list-toggle','core-list-toggle'],['list-badge','core-list-badge'],['list-levels','core-list-indent'],['list-move','core-list-move-pointer'],['list-selection','core-list-selection-collapse']]);
    for(const item of vybrane){
      const coreResult=results.find(r=>r.id===bulletProof.get(item.id));
      const partial=item.id==='app-planner'
        ? ['planner-repeat-daily','planner-repeat-weekly','planner-repeat-month-end','planner-repeat-bounds','planner-repeat-next','planner-repeat-future','planner-repeat-copy'].every(id=>results.some(r=>r.id===id&&r.status==='APP_PASS'))
        :coreResult?.status==='CORE_PASS';
      results.push({id:'stability-v1-'+item.id,name:item.name,kind:'STABILITY_V1/'+item.group,
        status:partial?'PARTIAL':'NOT_TESTED',ms:0,
        detail:partial?(item.id==='app-planner'?'7×10 testů skutečného recurringTasks.js PASS v izolaci; neověřuje uložené události, Android alarmy ani doručení připomínek.':'10× skutečný Core V2 v izolovaném DOM se syntetickými interakcemi PASS; nativní Android dotyky, gesta a selection handles nejsou plně ověřeny.'):'Scénář V1 dosud není funkčně ověřen v celém rozsahu; ruční PASS se nepřebírá.'});
    }
    render();
  }
  // 690C: run the ACTUAL shipped Core V2 in opaque-origin sandbox only.
  // The module is loaded on demand, so old builds fail CLOSED (not PASS).
  async function spustitBulletCore690C(generace){
    const expected=['core-list-import','core-list-render','core-list-toggle','core-list-badge'];
    const blocked=(reason)=>expected.map(id=>({id,name:id,kind:'CORE_V2_SANDBOX',status:'CORE_BLOCKED',ms:0,detail:String(reason||'not_loaded').slice(0,165)}));
    try {
      if(!window.LubaNoteAutoTesterBullet690C?.runRepeated){
        const js=new URL('lubaAutoTesterBullet690C.js?v=690C-real-dom-bullet',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);}
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
      if(!window.LubaNoteAutoTesterBullet690D?.runRepeated){
        const url=new URL('lubaAutoTesterBullet690D.js?v=690D-level-hierarchy',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);}
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
      if(!window.LubaNoteAutoTesterBullet690E?.runRepeated){
        const url=new URL('lubaAutoTesterBullet690E.js?v=690E-pointer-move-selection',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);}
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
      if(!window.LubaNoteAutoTesterEditorTodo690G?.runRepeated){
        const url=new URL('lubaAutoTesterEditorTodo690G.js?v=690G-v1',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);});
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
      if(!window.LubaNoteAutoTesterPlanner690H?.runRepeated){
        const url=new URL('lubaAutoTesterPlanner690H.js?v=690H-planner-repeat',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);});
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

  // 690I: synthetic caret, DOM selection and TODO edge cases in the actual shipped Core V2.
  // Blue selection marks and red pointer dot are VISUAL diagnostics, not native Android handles.
  async function spustitKurzorTodo690I(generace,scope='all'){
    const allIds=['caret-todo-middle','caret-todo-clear','caret-todo-empty','caret-todo-last','caret-todo-range','caret-todo-reopen','caret-todo-done-move','caret-todo-done-longpress','caret-bullet-first-move','caret-bullet-last-move','caret-editor-plain','caret-bullet-text','caret-editor-format','caret-editor-colors','caret-editor-scroll','caret-editor-image'];
    const needed=scope==='editor'?allIds.filter(id=>id.startsWith('caret-editor-')||['caret-todo-range','caret-todo-reopen'].includes(id)):scope==='todo'?allIds.filter(id=>id.startsWith('caret-todo-')):scope==='bullet'?allIds.filter(id=>id.startsWith('caret-bullet-')):allIds;
    const blocked=why=>needed.map(id=>({id,name:'Kurzor / ToDo – '+id,kind:'CORE_V2_CARET_SANDBOX_690I',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,180)}));
    try{
      if(!window.LubaNoteAutoTesterCaretTodo690I?.runRepeated){
        const url=new URL('lubaAutoTesterCaretTodo690I.js?v=690I2-csp-fix',location.href);
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
        msg=>{if(generace===generaceBehu)setStatus(msg);});
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
    screen?.querySelector('#lat-live-stage')?.classList.remove('lat-has-live-frame');
    render();
    const count=sums();
    const registr=results.filter(x=>x.id.startsWith('stability-v1-'));
    const suffix=registr.length?` · Centrum V1: 0/${registr.length} plně ověřeno, ${count.PARTIAL} částečně`:'';
    updateProgress(10,10,'Dokončeno – výsledky jsou níže');
    const failed=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL;
    const blocked=count.DB_BLOCKED+count.BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED;
    if(failed) setStatus(`⛔ CHYBA: ${failed} testů FAIL, ${blocked} BLOKOVÁNO. Kopírovat report.`);
    else if(blocked) setStatus(`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Výsledek NENÍ PASS! Kopírovat report.`);
    else setStatus(`Hotovo · všechny vykonané kontroly bez chyby; ${count.NOT_TESTED} netestováno, ${count.PARTIAL} částečně${suffix}`);
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
      setStatus('Provádím 10× bullet testy skutečného Core V2…');
      await spustitBulletCore690C(generace);
      if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
      if(generace===generaceBehu)await spustitEditorTodo690G(generace,'all');
      if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'all');
      if(generace===generaceBehu)await spustitPlanner690H(generace);
    }
    if(generace===generaceBehu && activeSuite==='all'){
      setStatus('Načítám pokrytí Centra stability V1…');
      await pridejPokrytiV1(generace,'all');
    }
    if(generace===generaceBehu)dokoncitBeh();
  }
  async function run(suite){
    if(running)return;
    stop();
    const generace=generaceBehu;
    results=[];running=true;
    startedAt=new Date().toISOString();activeSuite=suiteNames[suite]?suite:'all';
    screen?.querySelector('#lat-live-stage')?.classList.remove('lat-has-live-frame');
    render();updateProgress(0,10,'Připravuji test…');
    setStatus(`Spouštím ${suiteNames[activeSuite].toLowerCase()}…`);
    if(activeSuite==='stability' || activeSuite==='bullet' || activeSuite==='editor' || activeSuite==='todo' || activeSuite==='planner' || activeSuite==='caret'){
      if(activeSuite==='editor'||activeSuite==='todo'){await spustitEditorTodo690G(generace,activeSuite);if(generace===generaceBehu)await spustitKurzorTodo690I(generace,activeSuite);}
      if(activeSuite==='caret')await spustitKurzorTodo690I(generace,'all');
      if(activeSuite==='planner')await spustitPlanner690H(generace);
      if(activeSuite==='bullet'){await spustitBulletCore690C(generace);if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
      if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'bullet');}
      if(generace===generaceBehu)await pridejPokrytiV1(generace,activeSuite==='bullet'?'bullet':activeSuite==='editor'?'editor':activeSuite==='todo'?'todo':activeSuite==='planner'?'planner':activeSuite==='caret'?'editor':'all');
      if(generace===generaceBehu)dokoncitBeh();
      return;
    }
    if(activeSuite==='db'){
      await spustitServeroveTesty(generace);
      if(generace===generaceBehu)dokoncitBeh();
      return;
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
      'LUBANOTE AUTOTESTER / 690I2',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${counts.PASS} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} CORE_PASS=${counts.CORE_PASS} CORE_FAIL=${counts.CORE_FAIL} CORE_BLOCKED=${counts.CORE_BLOCKED} APP_PASS=${counts.APP_PASS} APP_FAIL=${counts.APP_FAIL} APP_BLOCKED=${counts.APP_BLOCKED} PARTIAL=${counts.PARTIAL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
      `RUN_OUTCOME=${(counts.FAIL+counts.CLIENT_FAIL+counts.SIM_FAIL+counts.DB_FAIL+counts.CORE_FAIL+counts.APP_FAIL)>0?'FAIL':(counts.BLOCKED+counts.DB_BLOCKED+counts.CORE_BLOCKED+counts.APP_BLOCKED)>0?'INCOMPLETE_BLOCKED':'CHECKED_WITH_COVERAGE_GAPS'}`,
      `STABILITY_V1_TOTAL=${results.filter(x=>x.id.startsWith('stability-v1-')).length} STABILITY_V1_AUTOMATED_PASS=0 STABILITY_V1_PARTIAL=${counts.PARTIAL}`,
      '690I2: LIVE VISUAL PREVIEW uses sandbox Core V2 for Bullet, Editor and ToDo plus recurringTasks.js for Planner calculations. CORE_PASS means actual shipped editorCoreV2.js under synthetic DOM/keyboard/pointer/Range 10x. Red dots and blue simulated caret/selection handles in 690I are diagnostic drawings, NOT Android system touch/handles. Physical Android touch, native text handles and system WebView gesture arbitration remain NOT TESTED. V1 PARTIAL is not complete regression PASS.', 
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
    if(event?.detail?.open===true)addLaunch();
  });
  addLaunch();
  window.LubaNoteAutoTester=Object.freeze({open,close});
})();
