/* LubaNote AutoTester 690D — 690B registry + isolated Core V2 bullet behavioral tests.
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
  const suiteNames={all:'Všechny dostupné testy + Core V2 bullet a hierarchie 10× + pokrytí V1',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru',stability:'Centrum stability V1 – pokrytí',bullet:'Bullet / seznamy – Core V2 10× + Tab'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VÝVOJOVÝ NÁSTROJ</div>
    <h1>AutoTester <span>690D</span></h1><p>Skutečný Core V2 · 10× bullet + Tab/Shift+Tab + Undo/Redo · stabilita V1.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-notice"><strong>Bezpečný testovací režim</strong><p>Oddělený testovací Worker · umělé poznámky a klíč · žádné připojení k produkční databázi.</p>
    <p><b>PASS</b> = provedený test, <b>CLIENT PASS</b> = produkční sync.js s RAM RPC, <b>SIM PASS</b> = model, <b>DB LIVE PASS</b> = izolovaný PostgreSQL na LubaServeru. <b>AUDIT</b> není funkční test. <b>NETESTOVÁNO</b> znamená, že automatické provedení příslušného scénáře zatím chybí. Scénáře V1 se nepovažují za PASS podle ruční historie. <b>CORE PASS</b> = skutečný Core V2 se syntetickými daty a DOM klikem / Tab; nikoli Android touch/MOVE.</p></section>
    <section class="lat-actions" aria-label="Kategorie testů"><button data-lat="run" data-suite="all">▶ Spustit vše</button>
      <button data-lat="run" data-suite="e2e">E2E poznámky</button>
      <button data-lat="run" data-suite="sync">Synchronizace</button>
      <button data-lat="run" data-suite="ui">Android / UI</button>
      <button data-lat="run" data-suite="db" title="Spustí nový izolovaný databázový test na LubaServeru">Test databáze</button>
      <button data-lat="run" data-suite="stability" title="Vypíše skutečný registr Centra stability V1 a dosud nezautomatizované scénáře">Pokrytí stability V1</button>
      <button data-lat="run" data-suite="bullet" title="Provádí 10× funkční testy skutečného Core V2 nad izolovanou syntetickou poznámkou">Bullet / seznamy</button></section>
    <section class="lat-reportbar"><div id="lat-state" role="status">Připraveno k testování.</div>
      <button data-lat="copy" type="button" disabled>Kopírovat report</button></section>
    <div id="lat-summary" class="lat-summary" aria-live="polite"></div>
    <div id="lat-list" class="lat-list" aria-label="Výsledky testování"></div>
    <footer class="lat-footer">690D: „Spustit vše“ provede 690A i 10× test bullet a 10× zanoření v odděleném sandboxu, a načte registr Centra stability V1. PASS z DOM click není důkaz nativního Android dotyku nebo MOVE. Produkční poznámky ani aplikovaný Core se nemění.</footer>`;}
  function open(){
    if(!isAllowed())return;
    if(!screen){
      screen=document.createElement('section');screen.id='ln-auto-tester';
      screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','LubaNote AutoTester');
      screen.innerHTML=`<div class="lat-inner">${header()}</div>`;
      if(!document.getElementById('lat-core-colors-690c')){
        const css=document.createElement('style');css.id='lat-core-colors-690c';
        css.textContent=`#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-indicator{background:#40d38e}#ln-auto-tester .lat-result[data-status='CORE_PASS'] .lat-pill{color:#88f2b7;border-color:#287c54}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-indicator{background:#f06e70}#ln-auto-tester .lat-result[data-status='CORE_FAIL'] .lat-pill{color:#ff9292;border-color:#93463e}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='CORE_BLOCKED'] .lat-pill{color:#ffd89b;border-color:#937242}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-indicator{background:#efb65d}#ln-auto-tester .lat-result[data-status='PARTIAL'] .lat-pill{color:#ffd89b;border-color:#937242}`;
        document.head.appendChild(css);
      }
      document.body.appendChild(screen);
      screen.addEventListener('click',(e)=>{
        const btn=e.target.closest('button[data-lat]');if(!btn)return;
        const action=btn.dataset.lat;
        if(action==='close'){close();return;}
        if(action==='run'){void run(btn.dataset.suite);return;}
        if(action==='copy'){void copyReport(btn);}
      });
      document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!screen.hidden){e.preventDefault();close();}},true);
    }
    screen.hidden=false;document.body.classList.add('lat-open');
  }
  function close(){if(!screen)return;screen.hidden=true;document.body.classList.remove('lat-open');stop();}
  function stop(){
    generaceBehu++; // Ignore late remote test responses from a closed or superseded run.
    if(runTimeout){clearTimeout(runTimeout);runTimeout=null;}
    if(worker){worker.terminate();worker=null;}
    if(running){running=false;setStatus('Přerušeno. Nedokončené testy se nepovažují za PASS.');}
  }
  function setStatus(s){const el=screen?.querySelector('#lat-state');if(el)el.textContent=s;}
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,CORE_PASS:0,CORE_FAIL:0,CORE_BLOCKED:0,PARTIAL:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0};for(const r of results)sum[r.status]=(sum[r.status]||0)+1;return sum;}
  function render(){
    const count=sums();const summary=screen.querySelector('#lat-summary');
    summary.innerHTML=`<div><b>${count.PASS}</b><span>PASS E2E</span></div><div><b>${count.CLIENT_PASS}</b><span>CLIENT PASS</span></div><div><b>${count.SIM_PASS}</b><span>SIM PASS</span></div><div><b>${count.DB_PASS}</b><span>DB LIVE PASS</span></div><div><b>${count.DB_FAIL}</b><span>DB LIVE FAIL</span></div><div><b>${count.DB_BLOCKED}</b><span>DB LIVE NEDOSTUPNÉ</span></div><div><b>${count.FAIL}</b><span>FAIL</span></div><div><b>${count.CLIENT_FAIL}</b><span>CLIENT FAIL</span></div><div><b>${count.SIM_FAIL}</b><span>SIM FAIL</span></div><div><b>${count.AUDIT}</b><span>AUDIT</span></div><div><b>${count.BLOCKED}</b><span>BLOKOVÁNO</span></div><div><b>${count.NOT_TESTED}</b><span>NETESTOVÁNO</span></div><div><b>${count.CORE_PASS}</b><span>CORE V2 PASS</span></div><div><b>${count.CORE_FAIL}</b><span>CORE V2 FAIL</span></div><div><b>${count.CORE_BLOCKED}</b><span>CORE V2 BLOK</span></div><div><b>${count.PARTIAL}</b><span>ČÁSTEČNĚ</span></div>`;
    const list=screen.querySelector('#lat-list');
    list.innerHTML=results.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',CORE_PASS:'CORE V2 PASS',CORE_FAIL:'CORE V2 FAIL',CORE_BLOCKED:'CORE V2 BLOKOVÁNO',PARTIAL:'ČÁSTEČNĚ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
      return `<details class="lat-result" data-status="${safe(r.status)}"><summary><span class="lat-indicator" aria-hidden="true"></span><span class="lat-result-title">${safe(r.name)}</span><span class="lat-pill">${label}</span></summary><div class="lat-result-body"><div>Typ: ${safe(r.kind)} · Trvání: ${Number(r.ms)||0} ms</div><div>ID testu: ${safe(r.id)}</div>${r.detail?`<p>${safe(r.detail)}</p>`:''}</div></details>`;
    }).join('') || `<div class="lat-empty">Spusť automatické testy. Výsledky se objeví tady.</div>`;
    screen.querySelector('[data-lat="copy"]').disabled=results.length===0;
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
    const vybrane=scope==='bullet'?scenare.filter(x=>x.group==='Seznamy'):scenare;
    if(scope==='bullet' && vybrane.length<5){
      results.push({id:'stability-bullet-registry-incomplete',name:'Bullet / seznamy – chybí scénáře',
        kind:'STABILITY_REGISTRY',status:'BLOCKED',ms:0,detail:'Očekáváno alespoň 5 scénářů Seznamy.'});
      render();return;
    }
    const bulletProof=new Map([['list-toggle','core-list-toggle'],['list-badge','core-list-badge'],['list-levels','core-list-indent']]);
    for(const item of vybrane){
      const coreResult=results.find(r=>r.id===bulletProof.get(item.id));
      const partial=coreResult?.status==='CORE_PASS';
      results.push({id:'stability-v1-'+item.id,name:item.name,kind:'STABILITY_V1/'+item.group,
        status:partial?'PARTIAL':'NOT_TESTED',ms:0,
        detail:partial?'10× skutečný Core V2 v izolovaném DOM s automatickou interakcí PASS; nativní Android dotyky / WebView scroll a MOVE nejsou plně ověřeny.':'Scénář V1 dosud není funkčně ověřen v celém rozsahu; ruční PASS se nepřebírá.'});
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
    const count=sums();
    const registr=results.filter(x=>x.id.startsWith('stability-v1-'));
    const suffix=registr.length?` · Centrum V1: 0/${registr.length} plně ověřeno, ${count.PARTIAL} částečně`:'';
    setStatus(`Hotovo · ${count.PASS} E2E PASS, ${count.CLIENT_PASS} CLIENT PASS, ${count.SIM_PASS} SIM PASS, ${count.DB_PASS} DB LIVE PASS, ${count.CORE_PASS} CORE PASS, ${count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL} FAIL, ${count.DB_BLOCKED+count.BLOCKED+count.CORE_BLOCKED+count.NOT_TESTED} neověřeno${suffix}`);
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
    startedAt=new Date().toISOString();activeSuite=suiteNames[suite]?suite:'all';render();
    setStatus(`Spouštím ${suiteNames[activeSuite].toLowerCase()}…`);
    if(activeSuite==='stability' || activeSuite==='bullet'){
      if(activeSuite==='bullet'){await spustitBulletCore690C(generace);if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);}
      if(generace===generaceBehu)await pridejPokrytiV1(generace,activeSuite==='bullet'?'bullet':'all');
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
      'LUBANOTE AUTOTESTER / 690D',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${counts.PASS} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} CORE_PASS=${counts.CORE_PASS} CORE_FAIL=${counts.CORE_FAIL} CORE_BLOCKED=${counts.CORE_BLOCKED} PARTIAL=${counts.PARTIAL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
      `STABILITY_V1_TOTAL=${results.filter(x=>x.id.startsWith('stability-v1-')).length} STABILITY_V1_AUTOMATED_PASS=0 STABILITY_V1_PARTIAL=${counts.PARTIAL}`,
      '690D: CORE_PASS means actual shipped editorCoreV2.js under synthetic sandbox DOM/keyboard 10x. Native Android touch, MOVE and selection remain NOT TESTED. V1 PARTIAL is not complete regression PASS.', 
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
