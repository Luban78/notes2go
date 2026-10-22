/* 691BQ – Repeatable FPS + actual-operation benchmark, admin-only controls.
   Measurement only. No synthetic edits to user data, no background sync.
   Real quick sync executes only after an explicit user click, sequentially. */
(() => {
  'use strict';
  const VERSION = '691BQ';
  const STORE_KEY = 'lubanoteLocalPerfBaselines691BQ';
  const REPEATS = 20;
  const WINDOW_MS = 800;
  const ACTION_MODES = new Set(['backspace', 'typing']);
  const names = {
    backspace: 'Backspace (reálný)', typing: 'Psaní (reálné)',
    'sync-quick': 'Rychlý sync (reálný)', idle: 'Klid aplikace',
    'card-hold': 'Dlouhý stisk karty', 'card-drag': 'Přesun karet',
    'note-open': 'Otevírání poznámek', 'note-save': 'Uložení / zavření poznámek',
    'todo-toggle': 'ToDo označení', 'bullet-move': 'Bullet/ToDo MOVE',
    selection: 'Výběr textu / úchyty', 'editor-scroll': 'Scroll editoru',
    planner: 'Planner / připomínky', documents: 'Dokumenty', search: 'Hledání / filtry', tags: 'Štítky / filtry',
    images: 'Obrázky', navigation: 'Přepínání modulů', 'sync-live': 'Běžná synchronizace'
  };
  let active = null;
  let latest = null;
  let store = {version:1, baseline:{}, runs:[]};
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.version === 1 && Array.isArray(saved.runs) && saved.baseline) {
      store = { version:1, baseline:saved.baseline, runs:saved.runs.slice(-80) };
      latest = store.runs.at(-1) || null;
    }
  } catch (_error) {}
  const byId = id => document.getElementById(id);
  const fmt = (n, digits=1) => Number.isFinite(n) ? Number(n).toFixed(digits) : 'N/A';
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0) / a.length : null;
  const percentile = (values, pct) => {
    if (!values.length) return null;
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil(pct*sorted.length)-1))];
  };
  const summarize = values => ({
    avg:avg(values), median:percentile(values,.5), p95:percentile(values,.95),
    min:values.length ? Math.min(...values):null, max:values.length ? Math.max(...values):null
  });
  function save() {
    try {localStorage.setItem(STORE_KEY,JSON.stringify(store)); return true;}
    catch (_error) {return false;}
  }
  function isAllowed() {return window.LubaNoteAdminTools?.isAllowed?.() === true;}
  function label(scenario) {return names[scenario]||scenario;}
  function modeOf(scenario) {return ACTION_MODES.has(scenario)?'real-operation':scenario==='sync-quick'?'real-network':'fps-windows';}
  function guidance(scenario) {
    if(scenario==='backspace') return 'Připrav si testovací poznámku s textem. Spusť měření, zavři Dashboard a 20× stiskni Backspace nebo jej podrž. Měří se skutečné volání Core V2, historie, model a render. Neděje se žádné automatické mazání.';
    if(scenario==='typing') return 'Spusť měření, přejdi do testovací poznámky a napiš 20 znaků na LubaKeyboard. Nic se nevkládá automaticky. Typické znaky a mezery se počítají jako skutečné operace.';
    if(scenario==='sync-quick') return 'POZOR: 20× postupně vyvolá existující rychlý sync přes LubaServer (reálná síť). Test probíhá jen na výslovné spuštění, zastaví se po chybě; nic nevytváří jako testovací poznámku. Tento test je rychlý sync, ne plný přenos všech dat.';
    if(scenario==='idle') return 'Po spuštění zavři Admin Dashboard a nech aplikaci bez dotyku. Proběhne 20 měřicích oken po 0,8 s, tedy celkem přibližně 16 s.';
    return 'Po spuštění zavři Dashboard a prováděj tuto činnost; měření se zapne 0,9 s po zavření. Nasbíráme 20 po sobě jdoucích časových oken FPS (0,8 s). Jde o časové vzorky během reálného používání, NE o automatické 20násobné provedení funkce.';
  }
  function hud() {
    let el=byId('ln-fb-hud-691BQ');
    if(!el) {el=document.createElement('div');el.id='ln-fb-hud-691BQ';el.hidden=true;el.setAttribute('aria-hidden','true');document.body.append(el);}
    return el;
  }
  function uiProgress(s) {
    if (!s) return;
    const count=Math.min(REPEATS,s.samples.length);
    const p=byId('ln-fb-progress');if(p)p.value=count;
    const text=`${label(s.scenario)} · ${count}/${REPEATS}`;
    const st=byId('ln-fb-status');if(st)st.textContent=s.cancelled?'Přerušeno':text;
    const h=hud();h.hidden=false;h.textContent=`BENCH ${count}/${REPEATS}`;
  }
  function switchButtons(running) {
    const start=byId('ln-fb-start');const stop=byId('ln-fb-stop');const select=byId('ln-fb-scenario');
    if(start)start.disabled=running;if(stop)stop.disabled=!running;if(select)select.disabled=running;
  }
  function frameLoop(s, timestamp) {
    if(active!==s || s.cancelled || document.hidden) return;
    if(s.lastFrame!==null) {
      const dt=timestamp-s.lastFrame;
      if(dt>0 && dt<60000) s.frameGaps.push(dt);
    }
    s.lastFrame=timestamp;
    if(s.scenarioMode==='fps-windows') {
      if(!s.windowStart) s.windowStart=timestamp;
      s.windowFrames++;
      const elapsed=timestamp-s.windowStart;
      if(elapsed>=WINDOW_MS) {
        s.samples.push({fps:Math.max(0,(s.windowFrames-1)*1000/elapsed), durationMs:elapsed});
        s.windowStart=timestamp;s.windowFrames=0;
        uiProgress(s);
        if(s.samples.length>=REPEATS) {complete(s);return;}
      }
    }
    s.frameRequest=requestAnimationFrame(t=>frameLoop(s,t));
  }
  function stopFrame(s) {
    if(s?.frameRequest) cancelAnimationFrame(s.frameRequest);
    if(s?.armTimer)clearTimeout(s.armTimer);
    s?.armObserver?.disconnect?.();
    if(s) {s.frameRequest=0;s.observer?.disconnect?.();}
  }
  function stop() {
    const s=active;if(!s)return;
    s.cancelled=true;active=null;stopFrame(s);
    hud().hidden=true;switchButtons(false);
    const st=byId('ln-fb-status');if(st)st.textContent=`Zrušeno · ${s.samples.length}/${REPEATS}, neuloženo`;
  }
  function summarizeFrames(gaps) {
    const clean=gaps.filter(x=>Number.isFinite(x)&&x>0);
    return {
      frameCount:clean.length, avgFps:clean.length ? 1000/avg(clean):null,
      medianFrameMs:percentile(clean,.5), p95FrameMs:percentile(clean,.95),
      worstFrameMs:clean.length?Math.max(...clean):null,
      framesOver33:clean.filter(x=>x>33.3).length,
      framesOver50:clean.filter(x=>x>50).length,
      estimatedRefreshHz:clean.length ? 1000/percentile(clean,.5):null
    };
  }
  function baselineDiff(run,base) {
    if(!base) return 'První baseline pro tento scénář.';
    const a=run.metrics;const b=base.metrics;
    const fields=[];
    if(Number.isFinite(a.frames.avgFps)&&Number.isFinite(b.frames.avgFps)&&b.frames.avgFps>0) {
      const diff=100*(a.frames.avgFps/b.frames.avgFps-1);
      fields.push(`prům. FPS ${diff>=0?'+':''}${fmt(diff)} %`);
    }
    if(Number.isFinite(a.operationMs?.avg)&&Number.isFinite(b.operationMs?.avg)&&b.operationMs.avg>0) {
      const diff=100*(a.operationMs.avg/b.operationMs.avg-1);
      fields.push(`doba akce ${diff>=0?'+':''}${fmt(diff)} % (méně je lépe)`);
    }
    return fields.length?`Proti baseline: ${fields.join(' · ')}`:'Pro tento scénář zatím nejsou srovnatelné metriky.';
  }
  function reportRun(r) {
    if(!r)return 'Zatím žádná uložená měření.';
    const m=r.metrics,base=store.baseline[r.scenario];
    let txt=`LUBANOTE FPS BENCHMARK / ${VERSION}\nScénář: ${label(r.scenario)}\nTyp: ${r.mode}\nVzorky: ${r.count}/${REPEATS}\nČas: ${r.date}\nProstředí: ${r.environment}\n`;
    txt+=`FPS průměr: ${fmt(m.frames.avgFps)} | refresh odhad: ${fmt(m.frames.estimatedRefreshHz)} Hz\n`;
    txt+=`FPS panel při měření: ${r.fpsOverlayEnabled?'ZAP':'VYP'} | viewport: ${r.viewport}\n`;
    txt+=`Frame p95: ${fmt(m.frames.p95FrameMs)} ms | nejhorší frame: ${fmt(m.frames.worstFrameMs)} ms\n`;
    txt+=`Frame >33 ms: ${m.frames.framesOver33} | frame >50 ms: ${m.frames.framesOver50}\n`;
    txt+=`LongTask >50 ms: ${m.longTasks.supported?m.longTasks.count:'N/A'} | nejhorší: ${fmt(m.longTasks.worstMs)} ms\n`;
    if(m.fpsWindows) txt+=`20 oken FPS: průměr ${fmt(m.fpsWindows.avg)}, minimum ${fmt(m.fpsWindows.min)}, p95 ${fmt(m.fpsWindows.p95)}\n`;
    if(m.operationMs) txt+=`Akce: průměr ${fmt(m.operationMs.avg)} ms | medián ${fmt(m.operationMs.median)} ms | p95 ${fmt(m.operationMs.p95)} ms | maximum ${fmt(m.operationMs.max)} ms\n`;
    if(m.blockCount) txt+=`Délka poznámky: cca ${fmt(m.blockCount.avg,0)} modelových bloků (průměr)\n`;
    if(m.breakdown) {
      for(const [k,v] of Object.entries(m.breakdown)) txt+=`${k} průměr: ${fmt(v.avg)} ms | p95: ${fmt(v.p95)} ms\n`;
    }
    if(r.scenario==='sync-quick') txt+=`Sync PASS: ${m.syncSuccess}/${REPEATS} | jde o rychlý fingerprint/delta sync, nemusí proběhnout plný přenos.\n`;
    txt+=`${baselineDiff(r,base)}\n`;
    txt+=`Pozn.: FPS je WebView requestAnimationFrame, ne GPU profiler. 20 časových oken != 20 akcí. Měření Backspace a psaní vzniká jen při reálném vstupu uživatele.\n`;
    return txt;
  }
  function render(r=latest) {
    const el=byId('ln-fb-result');if(!el)return;
    if(!r){el.textContent='Zatím žádné uložené měření.';return;}
    const count=store.runs.filter(x=>x.scenario===r.scenario).length;
    el.textContent=`${reportRun(r)}\nUložené běhy scénáře: ${count} · celkem ${store.runs.length}`;
  }
  function complete(s) {
    if(active!==s || s.cancelled)return;
    active=null;stopFrame(s);hud().hidden=true;switchButtons(false);
    const frames=summarizeFrames(s.frameGaps);
    const m={frames,longTasks:{supported:s.longTaskSupported,count:s.longTaskRecords.length,worstMs:s.longTaskRecords.length?Math.max(...s.longTaskRecords):null}};
    if(s.scenarioMode==='fps-windows') m.fpsWindows=summarize(s.samples.map(x=>x.fps));
    else {
      m.operationMs=summarize(s.samples.map(x=>x.durationMs));
      if(s.scenarioMode==='real-operation') {
        const keys=['snapshotMs','modelMs','historyMs','renderMs','extraMs'];
        m.breakdown=Object.fromEntries(keys.map(k=>[k,summarize(s.samples.map(v=>v[k]).filter(Number.isFinite))]));
        m.blockCount=summarize(s.samples.map(v=>v.blockCount).filter(Number.isFinite));
      }
      if(s.scenario==='sync-quick')m.syncSuccess=s.samples.filter(x=>x.ok).length;
    }
    const r={scenario:s.scenario,mode:s.scenarioMode,date:new Date().toISOString(),environment:window.Capacitor?.isNativePlatform?.()?'APK/WebView':'WEB',
      viewport:`${innerWidth}x${innerHeight}`,fpsOverlayEnabled:localStorage.getItem('lubanoteFpsVisible691BP')==='1',count:s.samples.length,metrics:m,samples:s.samples};
    // Only full, comparable series become baselines. A failed sync is never a PASS.
    if(s.samples.length===REPEATS && (s.scenario!=='sync-quick' || m.syncSuccess===REPEATS)) {
      if(!store.baseline[r.scenario])store.baseline[r.scenario]=r;
      store.runs.push(r);store.runs=store.runs.slice(-80);latest=r;
      const saved=save();const st=byId('ln-fb-status');if(st)st.textContent=`Dokončeno ${REPEATS}/${REPEATS} · ${saved?'uloženo do localStorage':'POZOR: místní uložení selhalo'}`;
      render(r);
    } else {
      const st=byId('ln-fb-status');if(st)st.textContent=`Nedokončeno: ${s.samples.length}/${REPEATS} · neuloženo do baseline`;
    }
  }
  function beginMonitor(s) {
    if(active!==s||s.cancelled||s.frameRequest)return;
    if(window.PerformanceObserver?.supportedEntryTypes?.includes?.('longtask')) {
      try {s.observer=new PerformanceObserver(list=>list.getEntries().forEach(x=>s.longTaskRecords.push(x.duration)));
        s.observer.observe({type:'longtask',buffered:false});s.longTaskSupported=true;}catch(_e){}
    }
    s.frameRequest=requestAnimationFrame(t=>frameLoop(s,t));
  }
  function armWindowsAfterModal(s) {
    const modal=byId('adminDashboardModal');
    const arm=()=>{
      if(active!==s||s.cancelled||modal && !modal.hidden)return;
      s.armObserver?.disconnect?.();
      s.armTimer=setTimeout(()=>{
        if(active!==s||s.cancelled)return;
        beginMonitor(s);
        const st=byId('ln-fb-status');if(st)st.textContent=`Měřím ${label(s.scenario)} · 0/${REPEATS}`;
      },900);
    };
    if(!modal || modal.hidden) {arm();return;}
    const st=byId('ln-fb-status');if(st)st.textContent='Připraveno: zavři Admin Dashboard a začni používat zvolenou funkci.';
    s.armObserver=new MutationObserver(arm);
    s.armObserver.observe(modal,{attributes:true,attributeFilter:['hidden']});
  }
  function start(scenario) {
    if(active || !isAllowed() || !names[scenario])return false;
    const s={scenario,scenarioMode:modeOf(scenario),samples:[],cancelled:false,lastFrame:null,frameGaps:[],frameRequest:0,windowStart:0,windowFrames:0,
      longTaskRecords:[],longTaskSupported:false,observer:null,armTimer:0,armObserver:null};
    if(document.hidden) return false;
    active=s;switchButtons(true);
    const st=byId('ln-fb-status');if(st)st.textContent=`Připraveno: ${label(scenario)} · 0/${REPEATS}`;
    if(byId('ln-fb-progress'))byId('ln-fb-progress').value=0;
    uiProgress(s);
    if(scenario==='sync-quick') {beginMonitor(s);runQuickSync(s);}
    else if(s.scenarioMode==='fps-windows')armWindowsAfterModal(s);
    // Reálné Backspace/psaní: start měření až první operací v editoru,
    // nikoli cestou z Admin Dashboardu – přesnější FPS baseline.
    return true;
  }
  async function runQuickSync(s) {
    const sync=window.LubaNoteSync?.spustRychle;
    if(typeof sync!=='function' || !navigator.onLine){stop();const st=byId('ln-fb-status');if(st)st.textContent='Rychlý sync není dostupný nebo je zařízení offline.';return;}
    for(let i=0;i<REPEATS;i++) {
      if(active!==s||s.cancelled||document.hidden||!isAllowed()) {if(active===s)stop();return;}
      const begin=performance.now();let ok=false;
      try {ok=(await sync())===true;}catch(_error){ok=false;}
      if(active!==s||s.cancelled)return;
      const durationMs=performance.now()-begin;
      s.samples.push({durationMs,ok});uiProgress(s);
      if(!ok) {stop();const st=byId('ln-fb-status');if(st)st.textContent=`Sync nevrátil PASS (${i+1}/${REPEATS}). Série zastavena, baseline se neuložila.`;return;}
      if(i<REPEATS-1) await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(active===s)requestAnimationFrame(()=>complete(s));
  }
  // Called exclusively from the already successful real Core V2 keyboard path.
  function meriAkci(typ) {
    const s=active;if(!s||s.cancelled||s.samples.length>=REPEATS||!isAllowed()||s.scenarioMode!=='real-operation')return false;
    return s.scenario==='backspace' ? typ==='backspace' : s.scenario==='typing'&&(typ==='text'||typ==='space');
  }
  function zaznamAkce(m) {
    const s=active;if(!s||!meriAkci(m.typ))return;
    if(!Number.isFinite(m.totalMs)||m.totalMs<0)return;
    if(!s.frameRequest)beginMonitor(s);
    s.samples.push({durationMs:m.totalMs,snapshotMs:m.snapshotMs,modelMs:m.modelMs,historyMs:m.historyMs,renderMs:m.renderMs,extraMs:m.extraMs,blockCount:m.blockCount});
    if(s.samples.length%5===0)uiProgress(s);
    if(s.samples.length>=REPEATS) requestAnimationFrame(()=>complete(s));
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && active){
      const s=active;stop();const st=byId('ln-fb-status');if(st)st.textContent=`Přerušeno při přechodu na pozadí (${s.samples.length}/${REPEATS}) – neuloženo.`;
    }
  });
  function init() {
    const panel=byId('ln-fps-benchmark-691BQ');if(!panel)return;
    const style=document.createElement('style');style.id='ln-fps-benchmark-style-691BQ';
    style.textContent=`
    #ln-fps-benchmark-691BQ {display:grid;gap:9px;padding:14px;margin-top:14px;background:var(--color-surface,rgba(128,128,128,.1));border:1px solid var(--color-border,rgba(128,128,128,.25));border-radius:16px;color:inherit}
    #ln-fps-benchmark-691BQ .ln-fb-heading {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
    #ln-fps-benchmark-691BQ p {margin:2px 0;font-size:12px;line-height:1.45;opacity:.85}
    #ln-fps-benchmark-691BQ label {font-size:13px;font-weight:600}
    #ln-fps-benchmark-691BQ select {color:inherit;background:var(--color-surface, #333);border:1px solid var(--color-border,#666);border-radius:9px;padding:10px;min-width:0;width:100%;font-size:14px}
    #ln-fps-benchmark-691BQ option,#ln-fps-benchmark-691BQ optgroup {color:initial;background:white}
    #ln-fps-benchmark-691BQ .ln-fb-buttons {display:flex;flex-wrap:wrap;gap:7px}
    #ln-fps-benchmark-691BQ button {border-radius:9px;border:1px solid var(--color-border, #777);background:var(--color-surface, #333);color:inherit;padding:9px 10px;font-size:12px}
    #ln-fps-benchmark-691BQ button:first-child {font-weight:700}
    #ln-fps-benchmark-691BQ button:disabled {opacity:.42}
    #ln-fps-benchmark-691BQ .ln-fb-hint {font-size:12px;opacity:.8}
    #ln-fps-benchmark-691BQ .ln-fb-result {font-family:monospace;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:350px;overflow:auto;border-radius:10px;padding:10px;background:rgba(128,128,128,.09)}
    #ln-fps-benchmark-691BQ progress {accent-color:var(--color-accent,#26b46b)}
    #ln-fb-hud-691BQ {position:fixed;top:calc(env(safe-area-inset-top,0px) + 66px);right:9px;z-index:2147482000;pointer-events:none;background:rgba(10,13,17,.81);color:#c9ffe0;border:1px solid #48856a;border-radius:10px;padding:6px 8px;font:700 12px/1.2 monospace;box-shadow:0 3px 10px rgba(0,0,0,.25)}
    #ln-fb-hud-691BQ[hidden] {display:none!important}
    `;
    document.head.append(style);
    const scenario=byId('ln-fb-scenario');
    const refresh=()=>{const val=scenario?.value||'backspace';const g=byId('ln-fb-guidance');if(g)g.textContent=guidance(val);
      const found=store.runs.filter(x=>x.scenario===val).at(-1);render(found||latest);};
    scenario?.addEventListener('change',refresh);refresh();
    byId('ln-fb-start')?.addEventListener('click',()=>{if(!isAllowed()){alert('Benchmark je určen pouze pro ověřeného admina.');return;}start(scenario.value);});
    byId('ln-fb-stop')?.addEventListener('click',stop);
    byId('ln-fb-copy')?.addEventListener('click',async()=>{
      const r=store.runs.filter(x=>x.scenario===scenario.value).at(-1)||latest;
      const report=reportRun(r);
      try {await navigator.clipboard.writeText(report);const st=byId('ln-fb-status');if(st)st.textContent='Report zkopírován.';}
      catch(_e){const area=document.createElement('textarea');area.value=report;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();}
    });
    byId('ln-fb-baseline')?.addEventListener('click',()=>{
      if(!isAllowed())return;const r=store.runs.filter(x=>x.scenario===scenario.value).at(-1);
      if(!r){const st=byId('ln-fb-status');if(st)st.textContent='Nejdřív dokonči 20 měření vybraného scénáře.';return;}
      store.baseline[scenario.value]=r;save();render(r);const st=byId('ln-fb-status');if(st)st.textContent='Poslední dokončený běh je nová baseline.';
    });
  }
  window.LubaNoteFpsBenchmark691BQ={meriAkci,zaznamAkce,stop,verze:VERSION};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
