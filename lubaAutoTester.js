/* LubaNote AutoTester 690A — developer-only in-app test screen.
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
  const suiteNames={all:'Všechny dostupné testy',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VÝVOJOVÝ NÁSTROJ</div>
    <h1>AutoTester <span>690A</span></h1><p>Jedno tlačítko pro lokální testy a izolované databázové kontroly na LubaServeru.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-notice"><strong>Bezpečný testovací režim</strong><p>Oddělený testovací Worker · umělé poznámky a klíč · žádné připojení k produkční databázi.</p>
    <p><b>DB LIVE PASS</b> = nový test spuštěný z APK v odděleném PostgreSQL na LubaServeru; <b>PASS</b> = skutečný E2E modul; <b>CLIENT PASS</b> = skutečný sync.js nad paměťovým RPC (bez DB); <b>SIM PASS</b> = samostatný protokolový model; <b>AUDIT</b> = kontrola zdrojového kódu; <b>NETESTOVÁNO</b> = plné triggery / reálná zařízení / Android integrace.</p></section>
    <section class="lat-actions" aria-label="Kategorie testů"><button data-lat="run" data-suite="all">▶ Spustit vše</button>
      <button data-lat="run" data-suite="e2e">E2E poznámky</button>
      <button data-lat="run" data-suite="sync">Synchronizace</button>
      <button data-lat="run" data-suite="ui">Android / UI</button>
      <button data-lat="run" data-suite="db" title="Spustí nový izolovaný databázový test na LubaServeru">Test databáze</button></section>
    <section class="lat-reportbar"><div id="lat-state" role="status">Připraveno k testování.</div>
      <button data-lat="copy" type="button" disabled>Kopírovat report</button></section>
    <div id="lat-summary" class="lat-summary" aria-live="polite"></div>
    <div id="lat-list" class="lat-list" aria-label="Výsledky testování"></div>
    <footer class="lat-footer">690A: „Spustit vše“ spustí lokální testy v APK a NOVÉ izolované SQL testy na LubaServeru. GitHub není potřeba. Žádné produkční poznámky ani triggery se netestují. Reálná synchronizace dvou zařízení a Android integrace zůstávají NETESTOVÁNO.</footer>`;}
  function open(){
    if(!isAllowed())return;
    if(!screen){
      screen=document.createElement('section');screen.id='ln-auto-tester';
      screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','LubaNote AutoTester');
      screen.innerHTML=`<div class="lat-inner">${header()}</div>`;
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
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0};for(const r of results)sum[r.status]=(sum[r.status]||0)+1;return sum;}
  function render(){
    const count=sums();const summary=screen.querySelector('#lat-summary');
    summary.innerHTML=`<div><b>${count.PASS}</b><span>PASS E2E</span></div><div><b>${count.CLIENT_PASS}</b><span>CLIENT PASS</span></div><div><b>${count.SIM_PASS}</b><span>SIM PASS</span></div><div><b>${count.DB_PASS}</b><span>DB LIVE PASS</span></div><div><b>${count.DB_FAIL}</b><span>DB LIVE FAIL</span></div><div><b>${count.DB_BLOCKED}</b><span>DB LIVE NEDOSTUPNÉ</span></div><div><b>${count.FAIL}</b><span>FAIL</span></div><div><b>${count.CLIENT_FAIL}</b><span>CLIENT FAIL</span></div><div><b>${count.SIM_FAIL}</b><span>SIM FAIL</span></div><div><b>${count.AUDIT}</b><span>AUDIT</span></div><div><b>${count.BLOCKED}</b><span>BLOKOVÁNO</span></div><div><b>${count.NOT_TESTED}</b><span>NETESTOVÁNO</span></div>`;
    const list=screen.querySelector('#lat-list');
    list.innerHTML=results.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
      return `<details class="lat-result" data-status="${safe(r.status)}"><summary><span class="lat-indicator" aria-hidden="true"></span><span class="lat-result-title">${safe(r.name)}</span><span class="lat-pill">${label}</span></summary><div class="lat-result-body"><div>Typ: ${safe(r.kind)} · Trvání: ${Number(r.ms)||0} ms</div><div>ID testu: ${safe(r.id)}</div>${r.detail?`<p>${safe(r.detail)}</p>`:''}</div></details>`;
    }).join('') || `<div class="lat-empty">Spusť automatické testy. Výsledky se objeví tady.</div>`;
    screen.querySelector('[data-lat="copy"]').disabled=results.length===0;
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
    setStatus(`Hotovo · ${count.PASS} E2E PASS, ${count.CLIENT_PASS} CLIENT PASS, ${count.SIM_PASS} SIM PASS, ${count.DB_PASS} DB LIVE PASS, ${count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL} FAIL, ${count.DB_BLOCKED+count.BLOCKED+count.NOT_TESTED} neověřeno`);
  }
  async function dokoncitWorker(generace){
    if(generace!==generaceBehu)return;
    if(runTimeout){clearTimeout(runTimeout);runTimeout=null;}
    worker?.terminate();worker=null;
    if(activeSuite==='all' || activeSuite==='sync'){
      setStatus('Místní testy hotovy · spouštím databázové testy na LubaServeru…');
      await spustitServeroveTesty(generace);
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
      'LUBANOTE AUTOTESTER / 690A',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${counts.PASS} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
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
