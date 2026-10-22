/* 691BQ – Repeatable FPS + actual-operation benchmark, admin-only controls.
   Measurement only. No synthetic edits to user data, no background sync.
   Real quick sync executes only after an explicit user click, sequentially. */
(() => {
  'use strict';
  const VERSION = '691BZ';
  const INPUT_TAIL_MS = 240; // initial action-local frame tagging
  const POST_TAIL_MS = 10000; // 10 seconds AFTER input #20, including continued hold
  const STORE_KEY = 'lubanoteLocalPerfBaselines691BQ';
  const REPEATS = 20;
  const WINDOW_MS = 800;
  // Guided batch: manual interactions cannot be safely synthesized, and are never
  // reported as 20 real actions unless Core V2 emits 20 action measurements.
  const SUITE_ORDER = [
    'idle', 'backspace', 'typing', 'editor-scroll', 'selection',
    'todo-toggle', 'bullet-move', 'note-open', 'note-save',
    'card-hold', 'card-drag', 'search', 'tags', 'planner', 'documents',
    'images', 'navigation', 'sync-live', 'sync-quick'
  ];
  let opakovaniBackspace = false; // set only by LubaKeyboard repeat interval
  let suite = null;
  let latestSuite = null;

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
  let store = {version:1, baseline:{}, comparableBaseline:{}, runs:[], suites:[]};
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.version === 1 && Array.isArray(saved.runs) && saved.baseline) {
      store = { version:1, baseline:saved.baseline, comparableBaseline:saved.comparableBaseline || {}, runs:saved.runs.slice(-160), suites:Array.isArray(saved.suites)?saved.suites.slice(-10):[] };
      latest = store.runs.at(-1) || null;
      latestSuite = store.suites.at(-1) || null;
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
    if(scenario==='backspace') return 'V téže poznámce podrž Backspace. Nejdřív změříme 20 příkazů, pak se na obrazovce ODPOČÍTÁ dalších 10 sekund. Během odpočtu DRŽ Backspace dál. Teprve po skončení odpočtu je výsledek uložen. Hlavní hodnota historie = FPS při dosledování po 20. příkazu.';
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
  /* 691BZ: the post-20 counter shows REAL remaining seconds (monotonic time).
     Only update when the displayed second changes; do not write UI every rAF. */
  function uiProgress(s) {
    if (!s) return;
    const count=Math.min(REPEATS,s.samples.length);
    const p=byId('ln-fb-progress');if(p)p.value=count;
    const remaining=s.finishing ? Math.max(0,Math.ceil((s.finishedAt+POST_TAIL_MS-performance.now())/1000)) : null;
    if(s.finishing && s.lastShownSecond===remaining)return;
    s.lastShownSecond=remaining;
    const text=s.finishing
      ?`${label(s.scenario)} · 20/20 · JEŠTĚ ${remaining} s (drž dál, pak se uloží)`
      :`${label(s.scenario)} · ${count}/${REPEATS}`;
    const st=byId('ln-fb-status');if(st)st.textContent=s.cancelled?'Přerušeno':text;
    if(suite) {
      hud().hidden=true;
      refreshSuiteOverlay();
    } else {
      const h=hud();h.hidden=false;
      h.textContent=s.finishing?`BENCH 20/20 · ZBÝVÁ ${remaining} s`:`BENCH ${count}/${REPEATS}`;
    }
  }
  function switchButtons(running) {
    const start=byId('ln-fb-start');const stop=byId('ln-fb-stop');const select=byId('ln-fb-scenario');
    const locked=running||Boolean(suite);
    if(start)start.disabled=locked;
    if(stop)stop.disabled=!running;
    if(select)select.disabled=locked;
    const all=byId('ln-fb-all');if(all)all.disabled=locked;
    const picker=byId('ln-fb-picker-button');if(picker)picker.disabled=locked;
  }
  function frameLoop(s, timestamp) {
    if(active!==s || s.cancelled || document.hidden) return;
    if(s.lastFrame!==null) {
      const dt=timestamp-s.lastFrame;
      if(dt>0 && dt<60000) {
        s.frameGaps.push(dt);
        if(s.scenarioMode==='real-operation' && s.finishing && timestamp>=s.finishedAt) {
          s.postFrameGaps.push(dt);
          const second=Math.max(0,Math.min(9,Math.floor((timestamp-s.finishedAt)/1000)));
          s.postFrameGapsBySecond[second].push(dt);
        } else if(s.scenarioMode==='real-operation') {
          s.preFrameGaps.push(dt);
        }
        if(s.scenarioMode==='real-operation' && s.lastActionAt!=null &&
           (s.lastActionAt>=s.lastFrame-1 || timestamp-s.lastActionAt<=INPUT_TAIL_MS)) {
          s.activeFrameGaps.push(dt);
        }
      }
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
    if(s.scenarioMode==='real-operation' && s.finishing &&
       timestamp>=s.finishedAt+POST_TAIL_MS) {
      complete(s);
      return;
    }
    s.frameRequest=requestAnimationFrame(t=>frameLoop(s,t));
  }
  function stopFrame(s) {
    if(s?.frameRequest) cancelAnimationFrame(s.frameRequest);
    if(s?.armTimer)clearTimeout(s.armTimer);
    if(s?.postTimer)clearTimeout(s.postTimer);
    if(s?.countdownTimer)clearInterval(s.countdownTimer);
    s?.armObserver?.disconnect?.();
    if(s) {s.frameRequest=0;s.observer?.disconnect?.();}
  }
  function stop(duvod = '') {
    const s=active;if(!s)return;
    s.cancelled=true;active=null;stopFrame(s);
    hud().hidden=true;
    if(suite && suite.phase==='running') {
      suite.phase='waiting';
      suite.message=duvod||`Opakuj nedokončený scénář (${s.samples.length}/${REPEATS}).`;
      refreshSuiteOverlay();
    }
    switchButtons(false);
    const st=byId('ln-fb-status');if(st)st.textContent=`Přerušeno · ${s.samples.length}/${REPEATS}, neuloženo`;
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
  /* 691BW: same sampling method + hold/taps + document size + FPS overlay.
     Never silently compare 691BV's all-window FPS with action-local FPS.
     Earlier measurements are preserved in history as historical data. */
  const isNewInput = r => (r?.scenario==='backspace'||r?.scenario==='typing') && ['691BW','691BY','691BZ'].includes(r?.measurementVersion);
  const noteSizeClass = chars => chars<1000?'0–999 znaků':chars<5000?'1000–4999 znaků':chars<20000?'5000–19999 znaků':'20000+ znaků';
  const noteBlockClass = count => count<=10?'1–10 bloků':count<=100?'11–100 bloků':'101+ bloků';
  function comparabilityKey(r) {
    if(!isNewInput(r)) return null;
    return [r.scenario,'input-active-'+r.measurementVersion,r.environment,r.viewport,
      r.inputMode,r.noteSizeClass,noteBlockClass(r.noteBlocks),r.fpsOverlayEnabled?'fps-on':'fps-off',
      ...(r.measurementVersion==='691BZ'?[]:[r.refreshClass])].join('|');
  }
  function baselineFor(r) {
    if(!r)return null;
    if(r.scenario==='backspace'||r.scenario==='typing') {
      const key=comparabilityKey(r);
      return key ? store.comparableBaseline?.[key] || null : null;
    }
    return store.baseline[r.scenario] || null;
  }
  function comparable(a,b){
    if(!a||!b)return false;
    if(a.scenario==='backspace'||a.scenario==='typing'||b.scenario==='backspace'||b.scenario==='typing') {
      const keyA=comparabilityKey(a),keyB=comparabilityKey(b);
      return Boolean(keyA&&keyB&&keyA===keyB);
    }
    return a.mode===b.mode && a.scenario===b.scenario;
  }
  function inputDisplayMode(mode){return mode==='hold'?'podržení Backspace':mode==='mixed'?'kombinované klepnutí/podržení':'jednotlivé stisky';}
  function baselineDiff(run,base) {
    if(!base) return 'První baseline pro tento scénář.';
    if(!comparable(run,base))return 'Nesrovnatelné metody / podmínky – rozdíl nezobrazen.';
    const a=run.metrics;const b=base.metrics;
    if(isNewInput(run)) {
      const fields=[];
      const aMain=run.measurementVersion==='691BZ'?a.after20:a.activeFrames;
      const bMain=run.measurementVersion==='691BZ'?b.after20:b.activeFrames;
      if(aMain?.avgFps>0&&bMain?.avgFps>0) {
        const d=100*(aMain.avgFps/bMain.avgFps-1);
        fields.push(`${run.measurementVersion==='691BZ'?'FPS v 10s dosledování':'FPS během vstupu'} ${d>=0?'+':''}${fmt(d)} %`);
      }
      if(run.measurementVersion==='691BZ' && base.extraActions>0 &&
          Math.abs((run.extraActions||0)/base.extraActions-1)>.20) {
        fields.push(`POZOR: různý počet mazání po 20. vstupu (${run.extraActions||0} oproti ${base.extraActions}); porovnání FPS jen orientační`);
      }
      if(a.operationMs?.avg>0&&b.operationMs?.avg>0) {
        const d=100*(a.operationMs.avg/b.operationMs.avg-1);
        fields.push(`doba příkazu ${d>=0?'+':''}${fmt(d)} % (méně je lépe)`);
      }
      if(a.breakdown?.nextFrameMs?.p95>0&&b.breakdown?.nextFrameMs?.p95>0) {
        const d=100*(a.breakdown.nextFrameMs.p95/b.breakdown.nextFrameMs.p95-1);
        fields.push(`p95 čekání na další rAF ${d>=0?'+':''}${fmt(d)} % (méně je lépe)`);
      }
      return fields.length?`Proti SROVNATELNÉ baseline: ${fields.join(' · ')}`:'Bez společné srovnatelné metriky.';
    }
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
    const m=r.metrics,base=baselineFor(r);
    let txt=`LUBANOTE FPS BENCHMARK / ${VERSION}\nScénář: ${label(r.scenario)}\nBuild: ${r.build||'historické měření'}\nTyp: ${r.mode}\nVzorky: ${r.count}/${REPEATS}\nČas: ${r.date}\nProstředí: ${r.environment}\n`;
    txt+=`FPS celého měřicího intervalu: ${fmt(m.frames.avgFps)} | mediánová frekvence rAF: ${fmt(m.frames.estimatedRefreshHz)} Hz (NENÍ fyzická obnovovací frekvence displeje)\n`;
    txt+=`FPS panel při měření: ${r.fpsOverlayEnabled?'ZAP':'VYP'} | viewport: ${r.viewport}\n`;
    if(isNewInput(r)) {
      txt+=['691BY','691BZ'].includes(r.measurementVersion)
        ?`METODIKA ${r.measurementVersion}: 20 příkazů + 10 sekund pokračujícího sběru PO 20. příkazu; stará 691BW není srovnatelná.\n`
        :`METODIKA 691BW: 20 reálných příkazů, rAF jen do 240 ms po každém vstupu; ne plošný FPS průměr.\n`;
      txt+=`Vstup: ${inputDisplayMode(r.inputMode)} | opakování držení=${r.repeatCount}/${REPEATS} | velikost poznámky≈${r.noteChars} znaků (${r.noteSizeClass}), ${r.noteBlocks} bloků\n`;
      txt+=`FPS BĚHEM MAZÁNÍ/PSANÍ (aktivní rAF intervaly): ${fmt(m.activeFrames?.avgFps)} | vzorků snímků: ${m.activeFrames?.frameCount||0} | p95: ${fmt(m.activeFrames?.p95FrameMs)} ms | nejhorší: ${fmt(m.activeFrames?.worstFrameMs)} ms\n`;
      txt+=`LongTask V OKOLÍ VSTUPU: ${m.inputLongTasks?.count??'N/A'} | nejhorší ${fmt(m.inputLongTasks?.worstMs)} ms\n`;
      if(['691BY','691BZ'].includes(r.measurementVersion)){
        const before=m.before20,after=m.after20;
        txt+=`PRVNÍCH 20 VSTUPŮ: frame n=${before?.frameCount||0} | FPS=${fmt(before?.avgFps)} | p95=${fmt(before?.p95FrameMs)}ms | nejhorší=${fmt(before?.worstFrameMs)}ms\n`;
        txt+=`DALŠÍCH 10 s PO 20. VSTUPU: frame n=${after?.frameCount||0} | FPS=${fmt(after?.avgFps)} | p95=${fmt(after?.p95FrameMs)}ms | nejhorší=${fmt(after?.worstFrameMs)}ms | >50ms=${after?.framesOver50||0}\n`;
        txt+=`LONGTASK PO 20. VSTUPU: počet=${m.postLongTasks?.count??'N/A'} | nejhorší=${fmt(m.postLongTasks?.worstMs)}ms\n`;
        txt+=`PŘÍKAZY NAD RÁMEC 20 BĚHEM DOSLEDOVÁNÍ: ${r.extraActions||0} (bez měření doby, jen počet).\n`;
        if(r.measurementVersion==='691BZ') {
          txt+=`691BZ: 10s odpočet skončil; uložený report už zahrnuje celou fázi dosledování.\n`;
          txt+=`FPS PO SEKUNDÁCH OD 20. VSTUPU (1–10; skutečné rAF intervaly):\n`;
          for(let i=0;i<10;i++) {
            const row=m.postSeconds?.[i];
            txt+=`${i+1}. sekunda | FPS ${fmt(row?.fps)} | snímky ${row?.frameCount||0} | nejhorší ${fmt(row?.worstFrameMs)} ms | další Backspace ${r.postActionsBySecond?.[i]||0}\n`;
          }
          txt+=`HISTORIE: hlavní hodnota = FPS po 20. vstupu, nikoli FPS prvních 20 příkazů. Pro srovnání drž Backspace celý odpočet a používej podobně dlouhou poznámku.\n`;
        }
        txt+=`POSLOUPNOST 20 PŘÍKAZŮ (ms, pořadí): ${m.actionSequence?.map(v=>fmt(v)).join(', ')||'N/A'}\n`;
        txt+=`Pozor: FPS před/po je průměr ze skutečných rAF intervalů, není to GPU paint ani identifikace příčiny zpoždění.\n`;
      }
      txt+=`Poznámka: odhad rAF není GPU paint profiler a 1/čas dalšího rAF není okamžité FPS displeje.\n`;
    }
    txt+=`Frame p95: ${fmt(m.frames.p95FrameMs)} ms | nejhorší frame: ${fmt(m.frames.worstFrameMs)} ms\n`;
    txt+=`Frame >33 ms: ${m.frames.framesOver33} | frame >50 ms: ${m.frames.framesOver50}\n`;
    txt+=`LongTask >50 ms: ${m.longTasks.supported?m.longTasks.count:'N/A'} | nejhorší: ${fmt(m.longTasks.worstMs)} ms\n`;
    if(m.fpsWindows) txt+=`20 oken FPS: průměr ${fmt(m.fpsWindows.avg)}, minimum ${fmt(m.fpsWindows.min)}, p95 ${fmt(m.fpsWindows.p95)}\n`;
    if(m.operationMs) txt+=`Akce: průměr ${fmt(m.operationMs.avg)} ms | medián ${fmt(m.operationMs.median)} ms | p95 ${fmt(m.operationMs.p95)} ms | maximum ${fmt(m.operationMs.max)} ms\n`;
    if(m.blockCount) txt+=`Délka poznámky: cca ${fmt(m.blockCount.avg,0)} modelových bloků (průměr)\n`;
    if(m.breakdown?.nextFrameMs)txt+=`Odezva do DALŠÍHO rAF callbacku: avg ${fmt(m.breakdown.nextFrameMs.avg)} ms | p95 ${fmt(m.breakdown.nextFrameMs.p95)} ms | max ${fmt(m.breakdown.nextFrameMs.max)} ms (nikoli čas hotového vykreslení)\n`;
    if(m.breakdown) {
      for(const [k,v] of Object.entries(m.breakdown)) txt+=`${k} průměr: ${fmt(v.avg)} ms | p95: ${fmt(v.p95)} ms\n`;
    }
    if(r.scenario==='sync-quick') txt+=`Sync PASS: ${m.syncSuccess}/${REPEATS} | jde o rychlý fingerprint/delta sync, nemusí proběhnout plný přenos.\n`;
    txt+=`${baselineDiff(r,base)}\n`;
    if(isNewInput(r) && !base) txt+='Baseline: zatím žádný srovnatelný běh; starší 691BV se NEPOROVNÁVÁ.\n';
    txt+=`Pozn.: FPS je WebView requestAnimationFrame, ne GPU profiler. 20 časových oken != 20 akcí. Měření Backspace a psaní vzniká jen při reálném vstupu uživatele.\n`;
    return txt;
  }
  /* 691BV: persistent per-scenario trend, including previous 691BQ/691BR runs.
     Keep automatic 691BS results separate: synthetic DOM is not comparable to
     manual frame samples or real keyboard operations. */
  const hEsc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function numericValue(run){
    if (!run?.metrics)return null;
    if(isNewInput(run))return (run.measurementVersion==='691BZ' ? run.metrics.after20?.avgFps : run.metrics.activeFrames?.avgFps) ?? null;
    if(run.mode==='fps-windows')return run.metrics.fpsWindows?.avg ?? null;
    return run.metrics.operationMs?.avg ?? null;
  }
  function goodDelta(now,baseline,mode,run){
    if(!Number.isFinite(now)||!Number.isFinite(baseline)||baseline<=0)return null;
    return ((mode==='fps-windows'||isNewInput(run)) ? 1 : -1)*100*(now/baseline-1);
  }
  function renderHistory(){
    const scenario=byId('ln-fb-scenario')?.value||'backspace';
    const items=store.runs.filter(r=>r.scenario===scenario);
    const latestOne=items.at(-1),baseline=baselineFor(latestOne);
    const base=numericValue(baseline),now=numericValue(latestOne);
    const oldMethod=(scenario==='backspace'||scenario==='typing') && !isNewInput(latestOne);
    const compatible=items.filter(item=>baseline&&comparable(item,baseline));
    const delta=oldMethod||!compatible.length?null:goodDelta(now,base,latestOne?.mode,latestOne);
    const trend=byId('ln-fb-trend');
    const lower=latestOne?.mode!=='fps-windows'&&!isNewInput(latestOne);
    if(trend){
      const unit=lower?'ms/akce':'FPS';
      const description=oldMethod?'Poslední měření používá starší metodiku; předchozí procenta nejsou srovnatelná.':
        !baseline?'První měření stejné metody a velikosti poznámky vytvoří baseline.':
        delta===null?'Srovnatelná baseline existuje, ale zatím bez odpovídající metriky.':
        `${delta>=0?'+':''}${fmt(delta)} % ${delta>=0?'zlepšení':'zhoršení'} ${isNewInput(latestOne)?(latestOne.measurementVersion==='691BZ'?'FPS po 20. vstupu':'aktivního FPS'):'doby operace'}`;
      const mode=isNewInput(latestOne)?` · ${inputDisplayMode(latestOne.inputMode)} · ${latestOne.noteSizeClass}`:'';
      trend.textContent=`${items.length} měření celkem · ${compatible.length} srovnatelných${mode} · baseline ${fmt(base)} ${unit} · poslední ${fmt(now)} ${unit} · ${description}`;
      trend.dataset.direction=delta===null?'none':delta>=0?'better':'worse';
    }
    const out=byId('ln-fb-history-list');
    if(out){
      if(!items.length)out.textContent='Pro tuto akci dosud nemáme dokončené měření.';
      else {
        const rev=items.slice(-12).reverse();
        const values=items.map(numericValue).filter(Number.isFinite);
        const high=Math.max(...values,Number.isFinite(base)?base:0,1);
        out.innerHTML=rev.map(item=>{
          const val=numericValue(item),pct=Number.isFinite(val)?Math.max(2,Math.min(100,100*val/high)):0;
          const isCmp=baseline&&comparable(item,baseline);
          const diff=isCmp?goodDelta(val,base,item.mode,item):null;
          const date=new Date(item.date);
          const when=Number.isFinite(date.getTime()) ? date.toLocaleString('cs-CZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Bez data';
          const trendText=!isCmp?'jiná metoda':diff===null?'bez dat':`${diff>=0?'+':''}${fmt(diff)} %`;
          return `<div class="ln-fb-history-row"><span class="ln-fb-history-date">${hEsc(when)}<small>${hEsc(item.build||'starší')}</small></span><div class="ln-fb-history-bar"><span style="width:${pct.toFixed(1)}%"></span></div><strong>${fmt(val)} ${isNewInput(item)||item.mode==='fps-windows'?'FPS':'ms'}</strong><small class="${!isCmp?'':diff>=0?'ln-fb-better':'ln-fb-worse'}">${hEsc(trendText)}</small></div>`;
        }).join('');
      }
    }
    const auto=byId('ln-fb-auto-history-list');
    if(auto){
      try{
        const saved=JSON.parse(localStorage.getItem('lubanoteAutoTesterPerfBaseline691BS')||'null');
        const runs=Array.isArray(saved?.runs)?saved.runs.slice(-12).reverse():[];
        if(!runs.length)auto.textContent='AutoTester nemá uloženou výkonovou historii.';
        else auto.innerHTML=runs.map((r,i)=>{
          const date=new Date(r.date);const when=Number.isFinite(date.getTime())?date.toLocaleString('cs-CZ'):String(r.date||'');
          const f=r.fps?.avg,b=r.actualInput?.backspace?.avg;
          const gaps=r.frames?.p95;
          return `<div class="ln-fb-auto-row"><strong>${hEsc(when)} · build ${hEsc(r.build||'starší')}</strong><span>AutoTester: FPS ${fmt(f)} · Backspace ${fmt(b)} ms · P95 snímku ${fmt(gaps)} ms</span></div>`;
        }).join('');
      }catch(_e){auto.textContent='Historii AutoTesteru nelze načíst.';}
    }
  }
  function historyReport(){
    const id=byId('ln-fb-scenario')?.value||'backspace';
    const rows=store.runs.filter(r=>r.scenario===id);
    const latestComparable=rows.at(-1);
    const baseline=baselineFor(latestComparable);
    const base=numericValue(baseline);
    const lines=[`LUBANOTE – MANUAL PERF HISTORIE ${VERSION}`,`Scénář: ${label(id)}`,
      `Baseline: ${fmt(base)} ${isNewInput(latestComparable)||latestComparable?.mode==='fps-windows'?'FPS':'ms'}`,`Uložené běhy: ${rows.length}`];
    rows.forEach((r,i)=>{
      const cmp=baseline&&comparable(r,baseline);
      lines.push(`${i+1}. ${r.date} | build=${r.build||'-'} | ${fmt(numericValue(r))} ${isNewInput(r)||r.mode==='fps-windows'?'FPS':'ms'} | ${cmp?`změna=${fmt(goodDelta(numericValue(r),base,r.mode,r))}%`:'NEPOROVNATELNÉ'} | ${r.count}/20 | ${r.noteSizeClass||'-'} | ${r.inputMode||'-'}`);
    });
    return lines.join('\n');
  }
  function render(r=latest) {
    const el=byId('ln-fb-result');
    if(el) {
      if(!r)el.textContent='Zatím žádné uložené měření.';
      else {
        const count=store.runs.filter(x=>x.scenario===r.scenario).length;
        el.textContent=`${reportRun(r)}\nUložené běhy scénáře: ${count} · celkem ${store.runs.length}`;
      }
    }
    renderHistory();
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
        m.activeFrames=summarizeFrames(s.activeFrameGaps);
        m.before20=summarizeFrames(s.preFrameGaps);
        m.after20=summarizeFrames(s.postFrameGaps);
        m.postSeconds=s.postFrameGapsBySecond.map(bucket=>{
          const v=summarizeFrames(bucket);
          return {fps:v.avgFps,frameCount:v.frameCount,worstFrameMs:v.worstFrameMs};
        });
        m.actionSequence=s.samples.map(x=>x.durationMs);
        const postLong=s.longTaskEntries.filter(entry=>s.finishedAt && entry.at>=s.finishedAt);
        m.postLongTasks={count:postLong.length,worstMs:postLong.length?Math.max(...postLong.map(x=>x.duration)):null};
        const longDuringInput=s.longTaskEntries.filter(entry=>s.actionTimes.some(t=>entry.at<=t+INPUT_TAIL_MS && entry.at+entry.duration>=t-5));
        m.inputLongTasks={count:longDuringInput.length,worstMs:longDuringInput.length?Math.max(...longDuringInput.map(v=>v.duration)):null};
        const keys=['snapshotMs','modelMs','historyMs','renderMs','extraMs','nextFrameMs'];
        m.breakdown=Object.fromEntries(keys.map(k=>[k,summarize(s.samples.map(v=>v[k]).filter(Number.isFinite))]));
        m.blockCount=summarize(s.samples.map(v=>v.blockCount).filter(Number.isFinite));
      }
      if(s.scenario==='sync-quick')m.syncSuccess=s.samples.filter(x=>x.ok).length;
    }
    const r={scenario:s.scenario,mode:s.scenarioMode,date:new Date().toISOString(),build:String(window.LUBANOTE_VERSION||'neuveden'),environment:window.Capacitor?.isNativePlatform?.()?'APK/WebView':'WEB',
      viewport:`${innerWidth}x${innerHeight}`,fpsOverlayEnabled:localStorage.getItem('lubanoteFpsVisible691BP')==='1',count:s.samples.length,metrics:m,samples:s.samples,
      ...(s.scenarioMode==='real-operation'?{
        measurementVersion:'691BZ',extraActions:s.extraActions||0,postActionsBySecond:s.postActionsBySecond,inputMode:s.repeatCount>=10?'hold':s.repeatCount?'mixed':'single',
        repeatCount:s.repeatCount,noteChars:s.noteChars??0,noteBlocks:s.noteBlocks??0,
        noteSizeClass:noteSizeClass(s.noteChars??0),
        refreshClass:Math.round((m.activeFrames.estimatedRefreshHz||m.frames.estimatedRefreshHz||60)/30)*30+'Hz'
      }:{})};
    // Only full, comparable series become baselines. A failed sync is never a PASS.
    if(s.samples.length===REPEATS && (s.scenario!=='sync-quick' || m.syncSuccess===REPEATS)) {
      if(isNewInput(r)) {
        const key=comparabilityKey(r);
        if(key && !store.comparableBaseline[key])store.comparableBaseline[key]=r;
      } else if(!store.baseline[r.scenario])store.baseline[r.scenario]=r;
      store.runs.push(r);store.runs=store.runs.slice(-160);latest=r;
      const saved=save();const st=byId('ln-fb-status');if(st)st.textContent=`Dokončeno ${REPEATS}/${REPEATS} · ${saved?'uloženo do localStorage':'POZOR: místní uložení selhalo'}`;
      render(r);
      if(suite && suite.phase==='running') finishSuiteStep('PASS',r);
    } else {
      const st=byId('ln-fb-status');if(st)st.textContent=`Nedokončeno: ${s.samples.length}/${REPEATS} · neuloženo do baseline`;
      if(suite && suite.phase==='running') finishSuiteStep('FAIL',null);
    }
  }
  function beginMonitor(s) {
    if(active!==s||s.cancelled||s.frameRequest)return;
    if(window.PerformanceObserver?.supportedEntryTypes?.includes?.('longtask')) {
      try {s.observer=new PerformanceObserver(list=>list.getEntries().forEach(x=>(s.longTaskRecords.push(x.duration),s.longTaskEntries.push({at:x.startTime,duration:x.duration}))));
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
  function start(scenario, bySuite = false) {
    if(active || !isAllowed() || !names[scenario] || (suite && !bySuite))return false;
    const s={scenario,scenarioMode:modeOf(scenario),samples:[],cancelled:false,lastFrame:null,frameGaps:[],frameRequest:0,windowStart:0,windowFrames:0,
      longTaskRecords:[],longTaskEntries:[],longTaskSupported:false,observer:null,armTimer:0,armObserver:null,
      activeFrameGaps:[],preFrameGaps:[],postFrameGaps:[],postFrameGapsBySecond:Array.from({length:10},()=>[]),
      lastActionAt:null,actionTimes:[],repeatCount:0,finishing:false,finishedAt:0,postTimer:0,countdownTimer:0,lastShownSecond:null,extraActions:0,postActionsBySecond:Array(10).fill(0),
      noteChars:null,noteBlocks:null,noteToken:null};
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
    if(typeof sync!=='function' || !navigator.onLine){stop('Rychlý sync není dostupný nebo je zařízení offline.');const st=byId('ln-fb-status');if(st)st.textContent='Rychlý sync není dostupný nebo je zařízení offline.';return;}
    for(let i=0;i<REPEATS;i++) {
      if(active!==s||s.cancelled||document.hidden||!isAllowed()) {if(active===s)stop();return;}
      const begin=performance.now();let ok=false;
      try {ok=(await sync())===true;}catch(_error){ok=false;}
      if(active!==s||s.cancelled)return;
      const durationMs=performance.now()-begin;
      s.samples.push({durationMs,ok});uiProgress(s);
      if(!ok) {stop(`Sync nevrátil PASS (${i+1}/${REPEATS}). Zkus znovu nebo přeskoč.`);const st=byId('ln-fb-status');if(st)st.textContent=`Sync nevrátil PASS (${i+1}/${REPEATS}). Série zastavena, baseline se neuložila.`;return;}
      if(i<REPEATS-1) await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(active===s)requestAnimationFrame(()=>complete(s));
  }
  // Called exclusively from the already successful real Core V2 keyboard path.
  function meriAkci(typ) {
    const autoPerf=window.LubaNoteAutoTesterPerf691BS;
    if(autoPerf?.meriAkci?.(typ) === true) return true;
    const s=active;if(!s||s.cancelled||!isAllowed()||s.scenarioMode!=='real-operation')return false;
    return s.scenario==='backspace' ? typ==='backspace' : s.scenario==='typing'&&(typ==='text'||typ==='space');
  }
  function zaznamAkce(m) {
    try { window.LubaNoteAutoTesterPerf691BS?.zaznamAkce?.(m); } catch (_) {}
    const s=active;if(!s||s.cancelled||s.scenarioMode!=='real-operation'||!isAllowed())return;
    if(s.scenario==='backspace' ? m.typ!=='backspace' : !['text','space'].includes(m.typ))return;
    if(s.finishing){
      s.extraActions++;
      const sec=Math.max(0,Math.min(9,Math.floor((performance.now()-s.finishedAt)/1000)));
      s.postActionsBySecond[sec]++;
      return;
    }
    if(s.samples.length>=REPEATS)return;
    if(!Number.isFinite(m.totalMs)||m.totalMs<0)return;
    const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
    const modal=byId('taskModal');
    const token=modal?.dataset?.taskId || null; // memory-only; never persisted
    if(s.noteToken===null) s.noteToken=token;
    else if(s.noteToken!==token) {
      stop('Během měření byla otevřena jiná poznámka – série není srovnatelná.');return;
    }
    if(s.noteChars===null) {
      // Approximate textual size. No note text or IDs enter localStorage/report.
      s.noteChars=editor?.textContent?.length||0;
      s.noteBlocks=Math.max(0,Number(m.blockCount)||0);
    }
    const now=performance.now();
    s.actionTimes.push(now);s.lastActionAt=now;
    if(m.typ==='backspace' && opakovaniBackspace)s.repeatCount++;
    if(!s.frameRequest) {
      s.lastFrame=now; // include first post-input wait in active-frame timing
      beginMonitor(s);
    }
    const sample={durationMs:m.totalMs,snapshotMs:m.snapshotMs,modelMs:m.modelMs,historyMs:m.historyMs,renderMs:m.renderMs,extraMs:m.extraMs,blockCount:m.blockCount};
    s.samples.push(sample);
    // 691BV: delay up to NEXT rAF callback after a real Core V2 operation.
    // This is not paint-completion time; report distinctly from synchronous Core ms.
    const returnedAt=performance.now();
    requestAnimationFrame(()=>{if(!s.cancelled)sample.nextFrameMs=performance.now()-returnedAt;});
    uiProgress(s);
    if(s.samples.length>=REPEATS){
      s.finishing=true;s.finishedAt=performance.now();
      // Timer also completes the run if WebView throttles or suppresses rAF.
      s.postTimer=setTimeout(()=>{if(active===s&&!s.cancelled)complete(s);},POST_TAIL_MS+100);
      // Low-rate countdown; if rAF stalls, the timer will catch up from performance.now().
      s.countdownTimer=setInterval(()=>{if(active===s&&!s.cancelled)uiProgress(s);},250);
      uiProgress(s);
    }
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && active){
      const s=active;stop();const st=byId('ln-fb-status');if(st)st.textContent=`Přerušeno při přechodu na pozadí (${s.samples.length}/${REPEATS}) – neuloženo.`;
    }
  });
  // 691BR – modeless guide. The benchmark remains visible when leaving the
  // Dashboard. No data editing or synthetic gestures are hidden in this flow.
  function suiteGuide(scenario) {
    const extras={
      'card-hold':'Na kartách opakuj dlouhé stisky. 20 FPS oken, nikoliv 20 potvrzených long-pressů.',
      'card-drag':'Přesouvej několik karet a nech je přeskládat. 20 FPS oken.',
      'note-open':'Otevírej poznámky, zavírej je a opakuj. 20 FPS oken.',
      'note-save':'V editoru proveď změnu a zavírej/ukládej poznámku. 20 FPS oken.',
      'todo-toggle':'Přepínej dokončení TODO. 20 FPS oken, nikoliv počet kliknutí.',
      'bullet-move':'V editoru přesouvej Bullet/ToDo včetně podstromů. 20 FPS oken.',
      selection:'V editoru vybírej text a posouvej červené úchyty. 20 FPS oken.',
      'editor-scroll':'Otevři dlouhou poznámku a opakovaně roluj. 20 FPS oken.',
      planner:'Přepínej Planner a připomínky. 20 FPS oken.',
      documents:'Otevírej dokumenty a jejich přehledy. 20 FPS oken.',
      images:'Otevírej fotografie a fullscreen. 20 FPS oken.',
      search:'Vyhledávej a měň dotazy. 20 FPS oken.',
      tags:'Přepínej štítky a filtry. 20 FPS oken.',
      navigation:'Přepínej sekce aplikace. 20 FPS oken.',
      'sync-live':'Používej aplikaci během běžného syncu. Tento test sám sync nevyvolává; 20 FPS oken.',
      'sync-quick':'20 skutečných postupných rychlých síťových synců. Pouze na tento výslovně spuštěný krok.'
    };
    return extras[scenario]||guidance(scenario);
  }
  function suiteOverlay() {
    let el=byId('ln-fb-suite-guide-691BR');
    if(el)return el;
    el=document.createElement('section');
    el.id='ln-fb-suite-guide-691BR';el.hidden=true;
    el.setAttribute('aria-label','Průvodce výkonovým benchmarkem');
    el.innerHTML=`<div class="ln-fb-suite-head"><strong id="ln-fb-suite-head">Sada 20×</strong><span id="ln-fb-suite-count"></span></div>
      <div id="ln-fb-suite-instruction" class="ln-fb-suite-instruction"></div>
      <div class="ln-fb-suite-actions">
        <button type="button" data-suite-action="begin">▶ Měřit nyní</button>
        <button type="button" data-suite-action="skip">Přeskočit</button>
        <button type="button" data-suite-action="cancel">Ukončit sadu</button>
      </div>`;
    el.addEventListener('click',event=>{
      const action=event.target.closest('[data-suite-action]')?.dataset.suiteAction;
      if(action==='begin')beginSuiteStep();
      else if(action==='skip')skipSuiteStep();
      else if(action==='cancel')endSuite('PŘERUŠENO');
    });
    document.body.append(el);
    return el;
  }
  function suiteStatus() {
    const box=byId('ln-fb-suite-summary-691BR');
    if(!box)return;
    if(suite) {
      box.textContent=`Celá sada · ${suite.index}/${SUITE_ORDER.length} dokončených/přeskočených · právě ${label(SUITE_ORDER[suite.index])}`;
    } else if(latestSuite) {
      const ok=latestSuite.steps.filter(x=>x.status==='PASS').length;
      box.textContent=`Poslední sada: ${latestSuite.status} · ${ok}/${SUITE_ORDER.length} hotových · ${latestSuite.date}`;
    } else box.textContent='Zatím žádná celá sada. První kompletní scénář vytvoří baseline.';
  }
  function refreshSuiteOverlay() {
    const box=suiteOverlay();
    if(!suite){box.hidden=true;suiteStatus();return;}
    const current=SUITE_ORDER[suite.index];
    const s=active;
    box.hidden=false;
    box.classList.toggle('ln-fb-suite-running',suite.phase==='running');
    byId('ln-fb-suite-head').textContent=`${suite.index+1}/${SUITE_ORDER.length} · ${label(current)}`;
    byId('ln-fb-suite-count').textContent=(suite.phase==='running'?`${Math.min(20,s?.samples.length||0)}/20`:'PŘIPRAVENO');
    byId('ln-fb-suite-instruction').textContent=suite.phase==='running'
      ? (modeOf(current)==='fps-windows'?'Měřím 20 FPS oken · pokračuj v uvedené činnosti.':
         current==='sync-quick'?'Probíhá 20 skutečných rychlých synců…':'Proveď 20 skutečných vstupů v editoru.')
      : `${suite.message?suite.message+' · ':''}${suiteGuide(current)}`;
    const begin=box.querySelector('[data-suite-action="begin"]');
    const skip=box.querySelector('[data-suite-action="skip"]');
    if(begin)begin.hidden=suite.phase==='running';
    if(skip)skip.hidden=suite.phase==='running';
    if(begin)begin.textContent='▶ Měřit nyní';
    suiteStatus();
    switchButtons(Boolean(active));
  }
  function beginSuite() {
    if(suite||active||!isAllowed())return false;
    suite={startedAt:new Date().toISOString(),index:0,steps:[],phase:'waiting',message:''};
    refreshSuiteOverlay();return true;
  }
  function beginSuiteStep() {
    if(!suite||suite.phase!=='waiting'||active||!isAllowed())return;
    const scenario=SUITE_ORDER[suite.index];
    suite.message='';suite.phase='running';
    // Dashboard is not the tested surface. Close it with its existing handler.
    const modal=byId('adminDashboardModal');
    if(modal&&!modal.hidden)byId('closeAdminDashboardButton')?.click();
    if(!start(scenario,true)) {
      suite.phase='waiting';suite.message='Spuštění se nepodařilo. Zkus to znovu.';
    }
    refreshSuiteOverlay();
  }
  function finishSuiteStep(status,run) {
    if(!suite)return;
    const scenario=SUITE_ORDER[suite.index];
    suite.steps.push({scenario,status,run:run?{
      date:run.date,mode:run.mode,count:run.count,metrics:run.metrics
    }:null});
    suite.index++;
    suite.phase='waiting';suite.message='';
    if(suite.index>=SUITE_ORDER.length)endSuite('DOKONČENO');
    else refreshSuiteOverlay();
  }
  function skipSuiteStep() {
    if(!suite||!isAllowed())return;
    if(active)stop();
    finishSuiteStep('PŘESKOČENO',null);
  }
  function endSuite(status) {
    if(!suite)return;
    const finished=suite;
    suite=null;
    if(active)stop();
    const summary={date:new Date().toISOString(),startedAt:finished.startedAt,status,steps:finished.steps};
    store.suites.push(summary);store.suites=store.suites.slice(-10);
    latestSuite=summary;
    const saved=save();
    hud().hidden=true;refreshSuiteOverlay();switchButtons(false);
    const el=byId('ln-fb-status');
    if(el)el.textContent=`Sada ${status.toLowerCase()} · ${finished.steps.filter(x=>x.status==='PASS').length}/${SUITE_ORDER.length} PASS · ${saved?'uloženo':'uložení selhalo'}`;
    render(latest);
  }
  function suiteReport() {
    const item=latestSuite;
    if(!item)return 'Ještě neproběhla žádná sada „Spustit vše“. ';
    const lines=[`LUBANOTE / PERFORMANCE BATCH ${VERSION}`,`Datum: ${item.date}`,`Stav: ${item.status}`,`Začátek: ${item.startedAt}`,`Scénáře: ${item.steps.length}/${SUITE_ORDER.length}`];
    for(const step of item.steps){
      const f=step.run?.metrics?.frames;
      const op=step.run?.metrics?.operationMs;
      const w=step.run?.metrics?.fpsWindows;
      lines.push(`${step.status} | ${label(step.scenario)} | režim=${step.run?.mode||'—'} | vzorků=${step.run?.count||0}/20 | FPS=${fmt(w?.avg??f?.avgFps)} | operace=${fmt(op?.avg)} ms | frame p95=${fmt(f?.p95FrameMs)} ms`);
    }
    lines.push('20 FPS oken = časové vzorky, nikoli 20 provedení funkce. Jen psaní, Backspace a quick sync mají 20 reálných operací.');
    return lines.join('\n');
  }
  async function copyText(text) {
    try {await navigator.clipboard.writeText(text);return true;}
    catch(_e){
      try {const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();return true;}
      catch(_e2){return false;}
    }
  }
  // Own LubaNote picker: never opens Android's native SELECT UI.
  function initPicker(select) {
    const trigger=byId('ln-fb-picker-button');
    const popup=byId('ln-fb-picker-popup');
    if(!select||!trigger||!popup)return () => {};
    const hide=()=>{popup.hidden=true;trigger.setAttribute('aria-expanded','false');};
    const update=()=>{
      trigger.querySelector('.ln-fb-picker-value').textContent=select.selectedOptions[0]?.textContent||'Vyber scénář';
      popup.querySelectorAll('[data-scenario]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.scenario===select.value)));
    };
    for(const group of select.querySelectorAll('optgroup')){
      const groupLabel=document.createElement('div');groupLabel.className='ln-fb-picker-group';groupLabel.textContent=group.label;popup.append(groupLabel);
      for(const option of group.querySelectorAll('option')){
        const b=document.createElement('button');b.type='button';b.className='ln-fb-picker-option';
        b.dataset.scenario=option.value;b.setAttribute('role','option');b.textContent=option.textContent;
        b.addEventListener('click',()=>{if(select.disabled)return;select.value=option.value;hide();update();select.dispatchEvent(new Event('change',{bubbles:true}));trigger.focus();});
        popup.append(b);
      }
    }
    function position() {
      const r=trigger.getBoundingClientRect();
      const below=Math.max(0,innerHeight-r.bottom-10),above=Math.max(0,r.top-10);
      const up=below<210 && above>below;
      popup.style.position='fixed';
      popup.style.left=`${Math.round(Math.max(6,r.left))}px`;
      popup.style.width=`${Math.round(Math.min(r.width,innerWidth-12))}px`;
      popup.style.maxHeight=`${Math.round(Math.max(110,Math.min(340,up?above:below)))}px`;
      popup.style.top=up?'auto':`${Math.round(r.bottom+3)}px`;
      popup.style.bottom=up?`${Math.round(innerHeight-r.top+3)}px`:'auto';
    }
    trigger.addEventListener('click',()=>{if(trigger.disabled)return;
      if(!popup.hidden){hide();return;}
      position();popup.hidden=false;trigger.setAttribute('aria-expanded','true');update();
    });
    trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='Enter'&&popup.hidden){e.preventDefault();trigger.click();}});
    popup.addEventListener('keydown',e=>{if(e.key==='Escape'){hide();trigger.focus();}});
    document.addEventListener('pointerdown',e=>{if(!popup.hidden&&!popup.contains(e.target)&&!trigger.contains(e.target))hide();},true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden)hide();});
    window.addEventListener('resize',()=>{if(!popup.hidden)position();});
    select.addEventListener('change',update);
    update();return hide;
  }

  function init() {
    const panel=byId('ln-fps-benchmark-691BQ');if(!panel)return;
    const style=document.createElement('style');style.id='ln-fps-benchmark-style-691BQ';
    style.textContent=`
    #ln-fps-benchmark-691BQ {display:grid;gap:9px;padding:14px;margin-top:14px;background:var(--color-surface,rgba(128,128,128,.1));border:1px solid var(--color-border,rgba(128,128,128,.25));border-radius:16px;color:inherit}
    #ln-fps-benchmark-691BQ .ln-fb-heading {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
    #ln-fps-benchmark-691BQ p {margin:2px 0;font-size:12px;line-height:1.45;opacity:.85}
    #ln-fps-benchmark-691BQ label {font-size:13px;font-weight:600}
    #ln-fps-benchmark-691BQ #ln-fb-scenario {display:none!important}
    #ln-fps-benchmark-691BQ .ln-fb-picker {position:relative;width:100%}
    #ln-fps-benchmark-691BQ #ln-fb-picker-button {display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:11px 13px;text-align:left;border:1px solid var(--color-border,#666);border-radius:13px;background:var(--color-surface,#30343a);font-size:13px;min-height:46px}
    #ln-fps-benchmark-691BQ #ln-fb-picker-button[aria-expanded="true"] {outline:2px solid var(--color-accent,#31aa7a)}
    #ln-fps-benchmark-691BQ .ln-fb-picker-value {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ln-fps-benchmark-691BQ .ln-fb-picker-arrow {color:var(--color-accent,#31aa7a);font-size:19px}
    #ln-fb-picker-popup {z-index:2147483001;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:7px;background:var(--color-surface,#23262a);border:1px solid var(--color-border,#707070);box-shadow:0 12px 38px rgba(0,0,0,.48);border-radius:14px;color:var(--color-text,#f0f0f0)}
    #ln-fb-picker-popup[hidden] {display:none!important}
    #ln-fb-picker-popup .ln-fb-picker-group {padding:11px 9px 4px;font-size:10px;letter-spacing:.04em;opacity:.65;font-weight:750}
    #ln-fb-picker-popup .ln-fb-picker-option {display:block;width:100%;text-align:left;padding:12px 11px;border:0;border-radius:10px;color:inherit;background:transparent;font-size:13px;line-height:1.3}
    #ln-fb-picker-popup .ln-fb-picker-option[aria-selected="true"] {background:color-mix(in srgb,var(--color-accent,#31aa7a) 19%,transparent);outline:1px solid var(--color-accent,#31aa7a)}
    #ln-fb-picker-popup .ln-fb-picker-option:active {background:color-mix(in srgb,var(--color-accent,#31aa7a) 32%,transparent)}
    #ln-fps-benchmark-691BQ .ln-fb-buttons {display:flex;flex-wrap:wrap;gap:7px}
    #ln-fps-benchmark-691BQ button {border-radius:9px;border:1px solid var(--color-border, #777);background:var(--color-surface, #333);color:inherit;padding:9px 10px;font-size:12px}
    #ln-fps-benchmark-691BQ button:first-child {font-weight:700}
    #ln-fps-benchmark-691BQ button:disabled {opacity:.42}
    #ln-fps-benchmark-691BQ button[hidden] {display:none!important}
    #ln-fps-benchmark-691BQ .ln-fb-hint {font-size:12px;opacity:.8}
    #ln-fps-benchmark-691BQ .ln-fb-result {font-family:monospace;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:350px;overflow:auto;border-radius:10px;padding:10px;background:rgba(128,128,128,.09)}
    #ln-fps-benchmark-691BQ progress {accent-color:var(--color-accent,#26b46b)}
    #ln-fb-hud-691BQ {position:fixed;top:calc(env(safe-area-inset-top,0px) + 66px);right:9px;z-index:2147482000;pointer-events:none;background:rgba(10,13,17,.81);color:#c9ffe0;border:1px solid #48856a;border-radius:10px;padding:6px 8px;font:700 12px/1.2 monospace;box-shadow:0 3px 10px rgba(0,0,0,.25)}
    #ln-fb-hud-691BQ[hidden] {display:none!important}
    #ln-fps-benchmark-691BQ .ln-fb-history {display:grid;gap:9px;border-top:1px solid var(--color-border,#666);padding-top:13px;margin-top:7px}
    #ln-fps-benchmark-691BQ #ln-fb-trend {font-size:12px;line-height:1.5;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--color-accent,#2c9e74) 9%,transparent)}
    #ln-fps-benchmark-691BQ #ln-fb-trend[data-direction="better"] {border-left:3px solid #31b77f}
    #ln-fps-benchmark-691BQ #ln-fb-trend[data-direction="worse"] {border-left:3px solid #dc845c}
    #ln-fps-benchmark-691BQ .ln-fb-history-list {display:grid;gap:7px;max-height:320px;overflow-y:auto}
    #ln-fps-benchmark-691BQ .ln-fb-history-row {display:grid;grid-template-columns:74px minmax(10px,1fr) 77px 67px;gap:6px;align-items:center;font:11px/1.35 system-ui,sans-serif}
    #ln-fps-benchmark-691BQ .ln-fb-history-date {opacity:.75;white-space:nowrap;display:grid;gap:1px}
    #ln-fps-benchmark-691BQ .ln-fb-history-date small {font-size:10px;opacity:.78}
    #ln-fps-benchmark-691BQ .ln-fb-history-bar {height:9px;background:color-mix(in srgb,currentColor 13%,transparent);border-radius:6px;overflow:hidden}
    #ln-fps-benchmark-691BQ .ln-fb-history-bar span {display:block;height:100%;background:var(--color-accent,#31aa7a);border-radius:6px}
    #ln-fps-benchmark-691BQ .ln-fb-history-row strong {font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
    #ln-fps-benchmark-691BQ .ln-fb-history-row small {text-align:right;white-space:nowrap}
    #ln-fps-benchmark-691BQ .ln-fb-better {color:#54d79e}
    #ln-fps-benchmark-691BQ .ln-fb-worse {color:#e6a184}
    #ln-fps-benchmark-691BQ .ln-fb-auto-history {border-top:1px solid var(--color-border,#666);padding-top:10px}
    #ln-fps-benchmark-691BQ .ln-fb-auto-history summary {cursor:pointer;font-size:12px;font-weight:700}
    #ln-fps-benchmark-691BQ #ln-fb-auto-history-list {margin-top:8px;max-height:250px;overflow:auto;display:grid;gap:8px}
    #ln-fps-benchmark-691BQ .ln-fb-auto-row {display:grid;gap:2px;padding:7px;border-radius:8px;background:color-mix(in srgb,currentColor 5%,transparent);font-size:11px}
    #ln-fps-benchmark-691BQ .ln-fb-auto-row span {opacity:.8}

    #ln-fps-benchmark-691BQ .ln-fb-all {background:var(--color-accent,#187d60)!important;color:#fff!important;border-color:transparent!important;font-weight:800;font-size:13px}
    #ln-fps-benchmark-691BQ #ln-fb-suite-summary-691BR {padding:8px 10px;border:1px solid var(--color-border,#666);border-radius:11px;font-size:11px;line-height:1.4}
    #ln-fb-suite-guide-691BR {position:fixed;top:calc(env(safe-area-inset-top,0px) + 70px);right:7px;max-width:min(290px,calc(100vw - 18px));width:290px;z-index:2147483000;padding:11px 12px;box-sizing:border-box;border-radius:15px;border:1px solid var(--color-accent,#31aa7a);color:var(--color-text,#eee);background:var(--color-surface,#232b30);box-shadow:0 9px 28px rgba(0,0,0,.48);font-size:12px}
    #ln-fb-suite-guide-691BR[hidden] {display:none!important}
    #ln-fb-suite-guide-691BR .ln-fb-suite-head {display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:12px}
    #ln-fb-suite-guide-691BR .ln-fb-suite-head span {font-size:11px;opacity:.8;white-space:nowrap}
    #ln-fb-suite-guide-691BR .ln-fb-suite-instruction {line-height:1.4;margin:8px 0;font-size:11px;max-height:145px;overflow:auto}
    #ln-fb-suite-guide-691BR .ln-fb-suite-actions {display:flex;gap:5px;flex-wrap:wrap}
    #ln-fb-suite-guide-691BR button {padding:8px;border:1px solid var(--color-border,#666);color:inherit;background:transparent;border-radius:10px;font-size:11px}
    #ln-fb-suite-guide-691BR button[data-suite-action="begin"] {background:var(--color-accent,#187d60);color:white;border-color:transparent;font-weight:700}
    #ln-fb-suite-guide-691BR.ln-fb-suite-running {width:auto;max-width:270px;padding:7px 9px}
    #ln-fb-suite-guide-691BR.ln-fb-suite-running .ln-fb-suite-instruction {display:none}
    #ln-fb-suite-guide-691BR.ln-fb-suite-running .ln-fb-suite-actions {margin-top:5px}
    `;
    document.head.append(style);
    const scenario=byId('ln-fb-scenario');
    initPicker(scenario);
    // 691BV: pouze jednotlivé ruční scénáře; hromadné testy zůstávají v AutoTesteru.
    const refresh=()=>{const val=scenario?.value||'backspace';const g=byId('ln-fb-guidance');if(g)g.textContent=guidance(val);
      const found=store.runs.filter(x=>x.scenario===val).at(-1);render(found||latest);};
    scenario?.addEventListener('change',refresh);refresh();
    byId('ln-fb-start')?.addEventListener('click',()=>{if(!isAllowed()){alert('Benchmark je určen pouze pro ověřeného admina.');return;}start(scenario.value);});

    byId('ln-fb-stop')?.addEventListener('click',()=>stop());

    byId('ln-fb-copy')?.addEventListener('click',async()=>{
      const r=store.runs.filter(x=>x.scenario===scenario.value).at(-1)||latest;
      const report=reportRun(r);
      try {await navigator.clipboard.writeText(report);const st=byId('ln-fb-status');if(st)st.textContent='Report zkopírován.';}
      catch(_e){const area=document.createElement('textarea');area.value=report;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();}
    });
    /* 691BZ: no system/native dialog. Two-step confirmation on the dashboard.
       Only the MANUAL benchmark history is cleared; AutoTester perf history stays. */
    const copyHistoryButton=byId('ln-fb-copy-history');
    const clearWrap=document.createElement('div');
    clearWrap.className='ln-fb-buttons';
    clearWrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:5px';
    const clearStart=document.createElement('button');clearStart.type='button';
    clearStart.textContent='Vymazat historii měření';
    const clearConfirm=document.createElement('button');clearConfirm.type='button';
    clearConfirm.textContent='Ano, vymazat historii i baseline';
    const clearCancel=document.createElement('button');clearCancel.type='button';
    clearCancel.textContent='Zrušit';
    clearConfirm.hidden=true;clearCancel.hidden=true;
    clearWrap.append(clearStart,clearConfirm,clearCancel);
    copyHistoryButton?.insertAdjacentElement('afterend',clearWrap);
    clearStart.addEventListener('click',()=>{
      if(!isAllowed()||active||suite)return;
      clearStart.hidden=true;clearConfirm.hidden=false;clearCancel.hidden=false;
      const status=byId('ln-fb-status');
      if(status)status.textContent='Potvrď smazání POUZE ruční historie a baseline. AutoTester zůstane zachován.';
    });
    clearCancel.addEventListener('click',()=>{
      clearStart.hidden=false;clearConfirm.hidden=true;clearCancel.hidden=true;
    });
    clearConfirm.addEventListener('click',()=>{
      if(!isAllowed()||active||suite)return;
      const empty={version:1,baseline:{},comparableBaseline:{},runs:[],suites:[]};
      // Remove the key first; do not falsely announce success on blocked storage.
      let ok=false;
      try{localStorage.removeItem(STORE_KEY);ok=localStorage.getItem(STORE_KEY)===null;}catch(_error){}
      if(ok){store=empty;latest=null;latestSuite=null;render(null);}
      clearStart.hidden=false;clearConfirm.hidden=true;clearCancel.hidden=true;
      const status=byId('ln-fb-status');
      if(status)status.textContent=ok?'Ruční měření i baseline vymazány. Historie AutoTesteru zůstala.':'Smazání selhalo – localStorage je nedostupné.';
    });
    byId('ln-fb-copy-history')?.addEventListener('click',async()=>{
      const ok=await copyText(historyReport());
      const st=byId('ln-fb-status');if(st)st.textContent=ok?'Historie zkopírována.':'Kopírování historie se nepodařilo.';
    });
    byId('ln-fb-baseline')?.addEventListener('click',()=>{
      if(!isAllowed())return;const r=store.runs.filter(x=>x.scenario===scenario.value).at(-1);
      if(!r){const st=byId('ln-fb-status');if(st)st.textContent='Nejdřív dokonči 20 měření vybraného scénáře.';return;}
      if((r.scenario==='backspace'||r.scenario==='typing') && !isNewInput(r)) {
        const st=byId('ln-fb-status');if(st)st.textContent='Starší metodiku nelze nastavit jako novou baseline. Nejprve změř 20 vstupů v 691BW.';return;
      }
      const key=comparabilityKey(r);
      if(key)store.comparableBaseline[key]=r;
      else store.baseline[scenario.value]=r;
      save();render(r);const st=byId('ln-fb-status');if(st)st.textContent='Poslední dokončený běh je nová baseline.';
    });
  }
  // Called only around the real keyboard hold-repeat callback (68 ms cadence).
  function oznacOpakovaniBackspace(active){opakovaniBackspace=active===true;}
  window.LubaNoteFpsBenchmark691BQ={meriAkci,zaznamAkce,oznacOpakovaniBackspace,stop,verze:VERSION,spustVse:beginSuite};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
