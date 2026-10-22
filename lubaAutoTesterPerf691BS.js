/* LubaNote 691BS — Performance baselines inside AutoTester / Spustit vse.
 * Observational rAF + actual Core V2 keyboard measurements + isolated 20x
 * synthetic DOM tests. Never edits real notes or triggers production sync.
 * No background timers while inactive. Distinguish AUDIT from functional PASS.
 */
(() => {
  'use strict';
  const KEY='lubanoteAutoTesterPerfBaseline691BS';
  const COUNT=20, WINDOW=800;
  const TASKS=[
    ['cards-render-100','Render 100 syntetických karet','cards'],
    ['cards-reorder-100','Přeskládání 100 syntetických karet','reorder'],
    ['editor-render-200','Render 200 syntetických řádků','editor'],
    ['search-500','Hledání v 500 syntetických poznámkách','search']
  ];
  let current=null, last=null;
  const average=arr=>arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
  const percentile=(arr,p)=>arr.length ? [...arr].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*arr.length)-1)] : null;
  const num=v=>Number.isFinite(v)?Math.round(v*10)/10:null;
  const stats=arr=>{const a=arr.filter(v=>Number.isFinite(v)&&v>=0);return {count:a.length,avg:num(average(a)),median:num(percentile(a,.5)),p95:num(percentile(a,.95)),min:num(a.length?Math.min(...a):NaN),max:num(a.length?Math.max(...a):NaN)};};
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null;}}
  function store(data){try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch{return false;}}
  function stopCapture(s){if(!s)return;s.runningFrames=false;if(s.raf)cancelAnimationFrame(s.raf);s.raf=0;
    try{s.observer?.disconnect();}catch(_){} s.observer=null;}
  function frame(s,t){if(current!==s||!s.runningFrames||document.hidden)return;
    if(s.lastTs!==null){const dt=t-s.lastTs;if(dt>0&&dt<60000){s.currentFrames+=1;s.gaps.push(dt);}}
    s.lastTs=t;
    if(!s.windowStart)s.windowStart=t;
    const elapsed=t-s.windowStart;
    if(elapsed>=WINDOW){if(s.windows.length<COUNT){s.windows.push({fps:num(s.currentFrames*1000/elapsed),stage:s.stage||'autotester'});}
      s.currentFrames=0;s.windowStart=t;}
    if(s.windows.length<COUNT)s.raf=requestAnimationFrame(x=>frame(s,x));else s.raf=0;
  }
  function start(){if(current)stopCapture(current);
    const s={startDate:new Date().toISOString(),stage:'start',runningFrames:true,raf:0,lastTs:null,windowStart:0,currentFrames:0,
      windows:[],gaps:[],longTasks:[],observer:null,ops:{backspace:[],typing:[]},started:performance.now(),cancelled:false};
    current=s;
    if(window.PerformanceObserver?.supportedEntryTypes?.includes?.('longtask'))try{
      s.observer=new PerformanceObserver(list=>{if(current!==s)return;for(const e of list.getEntries())if(s.longTasks.length<1000)s.longTasks.push(e.duration);});
      s.observer.observe({entryTypes:['longtask']});
    }catch(_){}
    s.raf=requestAnimationFrame(t=>frame(s,t));return true;
  }
  function phase(label){if(current)current.stage=String(label||'test').slice(0,80);}
  function cancel(){const s=current;current=null;if(s){s.cancelled=true;stopCapture(s);}}
  function meriAkci(typ){return !!(current&&!current.cancelled&&((typ==='backspace'&&current.ops.backspace.length<COUNT)||
      (['text','space'].includes(typ)&&current.ops.typing.length<COUNT)));}
  function zaznamAkce(m){const s=current;if(!s||!meriAkci(m.typ)||!Number.isFinite(m.totalMs))return;
    const bucket=m.typ==='backspace'?s.ops.backspace:s.ops.typing;
    const item={total:num(m.totalMs),snapshot:num(m.snapshotMs),model:num(m.modelMs),history:num(m.historyMs),render:num(m.renderMs),blocks:Number(m.blockCount)||0,afterFrame:null};
    bucket.push(item);
    // 691BV – skutečný produkční Core V2: jak dlouho od konce příkazu
    // do příštího requestAnimationFrame callbacku. Měří reakci fronty UI,
    // NENÍ to čas dokončeného GPU vykreslení.
    const ended=performance.now();
    requestAnimationFrame(()=>{
      if(current===s&&!s.cancelled)item.afterFrame=num(performance.now()-ended);
    });
  }
  function createSandbox(){const el=document.createElement('div');el.setAttribute('aria-hidden','true');
    el.style.cssText='position:fixed;left:-15000px;top:0;width:375px;height:800px;overflow:auto;visibility:hidden;pointer-events:none;contain:layout style paint;';
    document.body.appendChild(el);return el;}
  function buildCards(){const fragment=document.createDocumentFragment();for(let i=0;i<100;i++){
    const c=document.createElement('article');c.className='taskCard';c.style.cssText='padding:8px;margin:5px;border-radius:10px;min-height:40px;';
    const h=document.createElement('h3');h.textContent='Syntetická karta '+i;
    const p=document.createElement('p');p.textContent='Test lokálního rozložení a vykreslení, bez reálných poznámek';c.append(h,p);fragment.append(c);
  }return fragment;}
  function buildEditor(){const fragment=document.createDocumentFragment();for(let i=0;i<200;i++){
    const el=document.createElement('div');el.className='ln-v2-odstavec'+(i%3===0?' ln-v2-todo':i%3===1?' ln-v2-bullet':'');
    const span=document.createElement('span');span.className='ln-v2-cast';span.textContent='Syntetický text bloku '+i+' pro benchmark rendereru';el.append(span);fragment.append(el);
  }return fragment;}
  /* 691BU — isolated deep delete trace, never the user's document.
     Timing is split into model clone, model update, DOM replacement and forced
     layout. It is explicitly NOT an exact Core V2 model or real key gesture. */
  function buildDeepRows(lines, value='syntetický text pro mazání a výkonové měření') {
    const root=document.createDocumentFragment();
    for(let i=0;i<lines;i++){
      const row=document.createElement('div');row.className='ln-v2-odstavec';
      const span=document.createElement('span');span.className='ln-v2-cast';
      span.textContent=value+' '+i+' — '+('obsah řádku '.repeat(5));
      row.append(span);root.append(row);
    }return root;
  }
  function measureDeepDelete(lines, sandbox){
    const t0=performance.now();
    // Represent the required source/document copy separately from DOM work.
    const blocks=Array.from({length:lines},(_,i)=>({id:i,text:'syntetický text '+i+' '+('obsah '.repeat(16))}));
    const snapshot=typeof structuredClone==='function'?structuredClone(blocks):JSON.parse(JSON.stringify(blocks));
    const t1=performance.now();
    blocks[blocks.length-1].text=blocks[blocks.length-1].text.slice(0,-1);
    const t2=performance.now();
    sandbox.replaceChildren(buildDeepRows(lines));
    const t3=performance.now();
    void sandbox.scrollHeight;
    const t4=performance.now();
    if(snapshot.length!==lines)throw Error('deep_clone_count_mismatch');
    return {clone:t1-t0,model:t2-t1,dom:t3-t2,layout:t4-t3,total:t4-t0};
  }
  const haystack=Array.from({length:500},(_,i)=>('Syntetická poznámka '+i+' — hledání test benchmark bez reálných dat').toLocaleLowerCase('cs'));
  async function nextFrame(){await new Promise(resolve=>requestAnimationFrame(()=>resolve()));}
  function measureOne(type, sandbox){let target;
    const began=performance.now();
    if(type==='cards'){sandbox.replaceChildren(buildCards());target=sandbox.lastElementChild;}
    else if(type==='reorder'){
      if(!sandbox.children.length)sandbox.replaceChildren(buildCards());
      target=sandbox.firstElementChild;for(let j=0;j<25;j++)sandbox.appendChild(sandbox.firstElementChild);
    }else if(type==='editor'){sandbox.replaceChildren(buildEditor());target=sandbox.lastElementChild;}
    else {let found=0;for(let j=0;j<100;j++){const needle='syntetická '+(j%10);for(const text of haystack)if(text.includes(needle))found++;}
      if(found<0)throw Error('search_unexpected');return performance.now()-began;}
    // Force layout; this measures isolated DOM + style/layout, not actual Core V2.
    if(target){void target.getBoundingClientRect().height;void sandbox.scrollHeight;}
    return performance.now()-began;
  }
  /* 691BS: exact 20x Backspace + 20x typing on the CURRENT AutoTester-owned
     LOCAL Testy note ONLY. This never touches regular / secret / shared notes.
     The new paragraph is deliberately left empty, not merged with existing
     content. All calls go through the shipping Core V2 LubaKeyboard path. */
  async function ownNoteKeyboard(noteId,alive,progress){
    const fail=reason=>({ok:false,reason});
    if(!noteId || window.LubaNoteAdminTools?.isAllowed?.()!==true)return fail('Testy LOCAL note/admin unavailable');
    const tasks=window.loadTask?.();
    const own=Array.isArray(tasks)&&tasks.some(n=>String(n?.id||'')===String(noteId)&&
      n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes?.('Testy')&&
      String(n.title||'').startsWith('[AutoTester 690T]'));
    if(!own)return fail('Only freshly owned LOCAL Testy note is permitted');
    const still=()=>current && !current.cancelled && !document.hidden && (!alive||alive());
    const modal=document.getElementById('taskModal');
    if(!modal)return fail('taskModal unavailable');
    if(!modal.hidden && modal.dataset?.taskId!==String(noteId))return fail('Another note is open');
    let open=false;let reason='';let frameReq=0;let collecting=false;let prev=null;let gaps=[];
    const track=ts=>{if(!collecting)return;if(prev!==null&&ts>prev)gaps.push(ts-prev);prev=ts;frameReq=requestAnimationFrame(track);};
    try{
      if(typeof window.openTaskEditorById!=='function')return fail('Open editor API unavailable');
      if(progress)progress('Výkon Core V2: připravuji vlastní LOCAL poznámku Testy…');
      if(modal.hidden){await window.openTaskEditorById(noteId);}
      for(let i=0;i<20 && (modal.hidden || modal.dataset.taskId!==String(noteId));i++){
        await new Promise(r=>setTimeout(r,75));if(!still())throw Error('Test cancelled');
      }
      if(modal.hidden||modal.dataset.taskId!==String(noteId))throw Error('Opened a different note / editor unavailable');
      open=true;
      if(window.LubaNoteEditorV2Bridge?.jeAktivni?.()!==true)throw Error('Core V2 bridge not active');
      const core=window.LubaNoteEditorV2;
      if(typeof core?.provedPrikazVlastniKlavesnice!=='function'||
         typeof core.nastavPoziciOtevreni!=='function')throw Error('Core V2 keyboard API unavailable');
      if(!still())throw Error('Test cancelled');
      if(core.nastavPoziciOtevreni('end')!==true)throw Error('Cannot select end of own test note');
      if(core.provedPrikazVlastniKlavesnice('enter')!==true)throw Error('Cannot create isolated test paragraph');
      collecting=true;frameReq=requestAnimationFrame(track);
      if(progress)progress('Výkon Core V2: 20× psaní do vlastní Testy poznámky…');
      for(let i=0;i<20;i++){
        if(!still())throw Error('Test interrupted');
        if(core.provedPrikazVlastniKlavesnice('text','x')!==true)throw Error('Typing command failed '+(i+1));
        await nextFrame();
      }
      if(progress)progress('Výkon Core V2: 20× Backspace v téže testovací poznámce…');
      for(let i=0;i<20;i++){
        if(!still())throw Error('Test interrupted');
        if(core.provedPrikazVlastniKlavesnice('backspace')!==true)throw Error('Backspace command failed '+(i+1));
        await nextFrame();
      }
      await nextFrame();
      const c=current;if(!c||c.ops.typing.length!==20||c.ops.backspace.length!==20)
        throw Error('20 real Core V2 operations were not instrumented');
      return {ok:true,frameStats:stats(gaps),note:'20× keyboard API in AutoTester-owned LOCAL note (synthetic text, real production Core V2)'};
    }catch(error){reason=String(error?.message||error);return fail(reason);}
    finally{
      collecting=false;if(frameReq)cancelAnimationFrame(frameReq);
      if(open && modal.dataset?.taskId===String(noteId) && !modal.hidden){
        try{const save=document.getElementById('editorBackButton');
          if(save && !save.disabled)save.click();
          await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
        }catch(_){}
      }
    }
  }
  /* 691BZ: 3DMark-inspired but NEVER claims to be 3DMark or a universal speed rank.
     Composite relative to the first fully comparable AutoTester run (1000 points).
     Weighted geometric mean avoids additive metric units and treats smaller times
     as better; all eight metrics must be present in full. Component ratio capped
     at 0.5..2 per test to avoid one noisy sub-millisecond metric dominating. */
  const SCORE_VERSION='691CB-v2';
  const SCORE_PARTS=[
    ['real-backspace','Core V2 Backspace / Testy LOCAL',.25,'lower',c=>c.actualInput?.backspace],
    ['real-typing','Core V2 psaní / Testy LOCAL',.05,'lower',c=>c.actualInput?.typing],
    ['raf','FPS při regresích',.20,'higher',c=>c.fps],
    ['editor-200','200 řádků syntetického DOM',.15,'lower',c=>c.synthetic?.['editor-render-200']],
    ['cards-render','100 karet syntetického DOM',.10,'lower',c=>c.synthetic?.['cards-render-100']],
    ['cards-reorder','Přeskládání karet syntetického DOM',.10,'lower',c=>c.synthetic?.['cards-reorder-100']],
    ['search','Hledání 500 syntetických poznámek',.05,'lower',c=>c.synthetic?.['search-500']],
    ['deep-600','600 řádků syntetického DOM + layout',.10,'lower',c=>c.deepDelete?.['600']?.total]
  ];
  function scoreKey(c){
    // Score is only comparable on the same screen geometry, platform, engine,
    // and score methodology. Build/version is reported but NOT part of the key.
    const platform=window.Capacitor?.isNativePlatform?.()?'APK':'WEB';
    return [SCORE_VERSION,platform,c.environment,c.viewport].join('|');
  }
  function computeScore(c,prior,ownedOk,fpsCount,functionalStatus){
    /* 691CB: a failed/blocked AutoTester run must NEVER seed a score reference.
       Old 691BZ-v1 references remain historical but are not used by v2. */
    const validated=functionalStatus?.completed===true &&
      Number(functionalStatus.passed)>0 &&
      Number(functionalStatus.failed)===0 &&
      Number(functionalStatus.blocked)===0;
    if(!validated) {
      const f=Number.isFinite(functionalStatus?.failed)?functionalStatus.failed:'?';
      const b=Number.isFinite(functionalStatus?.blocked)?functionalStatus.blocked:'?';
      return {version:SCORE_VERSION,value:null,reason:`Funkční regrese není bez chyb: FAIL=${f}, BLOCKED=${b}. Referenčních 1000 bodů se neukládá.`};
    }
    const unavailable=[];
    const parts=SCORE_PARTS.map(([id,label,weight,direction,pick])=>{
      const stat=pick(c);
      if(!stat||stat.count!==COUNT||!(Number(stat.avg)>0))unavailable.push(label);
      return {id,label,weight,direction,msOrFps:stat?.avg};
    });
    if(!ownedOk||fpsCount!==COUNT||unavailable.length){
      return {version:SCORE_VERSION,value:null,reason:[!ownedOk?'Neúplný reálný Core V2 test':null,fpsCount!==COUNT?'Neúplná FPS okna':null,...unavailable].filter(Boolean).join('; ')};
    }
    prior.scoreBaselines ||= {};
    const key=scoreKey(c);
    if(!prior.scoreBaselines[key])prior.scoreBaselines[key]={date:c.date,build:c.build,validated:true,values:Object.fromEntries(parts.map(x=>[x.id,x.msOrFps]))};
    const baseline=prior.scoreBaselines[key];
    const ratios=[];
    for(const part of parts){
      const reference=Number(baseline.values?.[part.id]);
      if(!(reference>0))return {version:SCORE_VERSION,value:null,reason:'Poškozená referenční hodnota '+part.id};
      const raw=part.direction==='higher'?part.msOrFps/reference:reference/part.msOrFps;
      ratios.push({...part,reference,ratio:Math.min(2,Math.max(.5,raw))});
    }
    const value=Math.round(1000*Math.exp(ratios.reduce((sum,p)=>sum+p.weight*Math.log(p.ratio),0)));
    return {version:SCORE_VERSION,value,baseline:1000,changePercent:Math.round((value/1000-1)*1000)/10,
      referenceDate:baseline.date,referenceBuild:baseline.build,platformKey:key,
      components:ratios.map(p=>({id:p.id,label:p.label,weight:p.weight,reference:p.reference,current:p.msOrFps,ratio:Math.round(p.ratio*1000)/1000}))};
  }
  function comparableId(name){return name+'@'+(window.innerWidth>=900?'desktop':'mobile');}
  function metricRow(id,name,kind,status,ms,detail){return {id:'perf691bs-'+id,name,kind,status,ms:Math.round(ms||0),detail};}
  async function finish(alive, progress, options={}){const s=current;if(!s)return [metricRow('missing','Výkonový sběr není dostupný','PERF_AUDIT','PARTIAL',0,'Běh výkonového monitoru nebyl zahájen.')];
    stopCapture(s);
    const ownedResult=await ownNoteKeyboard(options.testNoteId,alive,progress);
    const still=()=>current===s&&!s.cancelled&&(!alive||alive())&&!document.hidden;
    const prior=load()||{v:1,baseline:{},runs:[]};if(prior.v!==1||!prior.baseline||!Array.isArray(prior.runs)){prior.v=1;prior.baseline={};prior.runs=[];}
    const rows=[];
    rows.push(metricRow('owned-keyboard','20× produkční Core V2 / LubaKeyboard na vlastní LOCAL Testy poznámce','PERF_OWNED_EDITOR',ownedResult.ok?'AUDIT':'PARTIAL',0,ownedResult.ok?
      `${ownedResult.note}; FPS odhad=${ownedResult.frameStats.avg?num(1000/ownedResult.frameStats.avg):'N/A'}; p95 snímku=${ownedResult.frameStats.p95??'N/A'}ms; činnost byla automatická, ne fyzické dotyky.`:
      `Nevykonáno: ${ownedResult.reason}; žádné běžné poznámky nebyly záměrně upravovány.`));
    const fps=s.windows.map(x=>x.fps).filter(Number.isFinite),fpsStats=stats(fps),gaps=stats(s.gaps);
    const frameOver33=s.gaps.filter(x=>x>33.3).length;const worstLong=stats(s.longTasks);
    const previousFps=prior.baseline.fps?.avg;const fpsChange=previousFps>0 && fpsStats.avg!==null?num((fpsStats.avg/previousFps-1)*100):null;
    rows.push(metricRow('fps-real','FPS při reálném běhu AutoTesteru (20 časových oken)','PERF_REAL_FRAMES',fps.length===COUNT?'AUDIT':'PARTIAL',
      fpsStats.avg?1000/fpsStats.avg:0,
      `okna=${fps.length}/${COUNT}; FPS průměr=${fpsStats.avg??'N/A'}; změna proti baseline=${fpsChange===null?'první/neúplná série':`${fpsChange>0?'+':''}${fpsChange}%`}; p95 frame=${gaps.p95??'N/A'}ms; nejhorší frame=${gaps.max??'N/A'}ms; >33ms=${frameOver33}; longtask=${s.longTasks.length}, worst=${worstLong.max??'N/A'}ms; měří běh testů, nikoliv konkrétní uživatelské gesto.`));
    for(const [key,name] of [['backspace','Skutečný Backspace Core V2'],['typing','Skutečné psaní Core V2']]){
      const a=s.ops[key],t=stats(a.map(v=>v.total));
      const baselineInput=prior.baseline[key]?.avg;const inputDelta=baselineInput>0&&t.avg!==null?num((t.avg/baselineInput-1)*100):null;
      if(a.length===COUNT&&!prior.baseline[key])prior.baseline[key]={avg:t.avg,date:s.startDate};
      const response=stats(a.map(v=>v.afterFrame));
      rows.push(metricRow(key,name,'PERF_REAL_INPUT',a.length===COUNT?'AUDIT':a.length?'PARTIAL':'NOT_TESTED',t.avg||0,
        `akce=${a.length}/${COUNT}; průměr=${t.avg??'N/A'}ms; proti baseline=${inputDelta===null?'bez srovnání':`${inputDelta>0?'+':''}${inputDelta}%`}; p95=${t.p95??'N/A'}ms; max=${t.max??'N/A'}ms; kopie=${stats(a.map(v=>v.snapshot)).avg??'N/A'}ms; model=${stats(a.map(v=>v.model)).avg??'N/A'}ms; historie=${stats(a.map(v=>v.history)).avg??'N/A'}ms; render=${stats(a.map(v=>v.render)).avg??'N/A'}ms; příští rAF průměr=${response.avg??'N/A'}ms, p95=${response.p95??'N/A'}ms, max=${response.max??'N/A'}ms (čekání na callback, ne dokončené vykreslení); bloků=${stats(a.map(v=>v.blocks)).avg??'N/A'}. Test neprovádí žádné dodatečné mazání uživatelských poznámek.`));
    }
    const captured={date:s.startDate,build:String(window.LUBANOTE_VERSION||'neuveden'),environment:navigator.userAgent.match(/Chrome\/\d+/)?.[0]||'WebView',viewport:`${innerWidth}x${innerHeight}`,
      fps:fpsStats,frames:gaps,actualInput:{backspace:stats(s.ops.backspace.map(x=>x.total)),typing:stats(s.ops.typing.map(x=>x.total))},
      realCoreTrace:Object.fromEntries(['backspace','typing'].map(key=>[key,{
        nextRaf:stats(s.ops[key].map(x=>x.afterFrame)),
        history:stats(s.ops[key].map(x=>x.history)),
        render:stats(s.ops[key].map(x=>x.render)),
        snapshot:stats(s.ops[key].map(x=>x.snapshot)),
        model:stats(s.ops[key].map(x=>x.model)),
        blocks:stats(s.ops[key].map(x=>x.blocks))
      }])),synthetic:{}};
    let sandbox;
    try{
      if(!still())throw Error('Přerušený běh');
      sandbox=createSandbox();
      for(const [name,title,type] of TASKS){
        const values=[];
        for(let i=0;i<COUNT;i++){
          if(!still())throw Error('Přerušený běh');
          if(progress)progress(`Výkon 20×: ${title} ${i+1}/${COUNT}`);
          await nextFrame();if(!still())throw Error('Přerušený běh');
          values.push(measureOne(type,sandbox));
        }
        const data=stats(values);captured.synthetic[name]=data;
        const baseline=prior.baseline[comparableId(name)];const delta=baseline?.avg>0?num((data.avg/baseline.avg-1)*100):null;
        rows.push(metricRow(name,title+' (izolovaný DOM)','PERF_SYNTHETIC_20X','AUDIT',data.avg,
          `opakování=20/20; průměr=${data.avg}ms; p95=${data.p95}ms; nejhorší=${data.max}ms; změna vůči baseline=${delta===null?'první měření':`${delta>0?'+':''}${delta}%`}; jde o syntetické DOM, ne skutečné gesto.`));
        if(!baseline)prior.baseline[comparableId(name)]={avg:data.avg,p95:data.p95,date:s.startDate};
      }
      /* 691BU: three workloads, twenty repeats each, same per-run sandbox.
         The local test note is untouched. Report phase timings, not fake FPS. */
      captured.deepDelete={};
      for(const lineCount of [40,200,600]){
        const times={clone:[],model:[],dom:[],layout:[],total:[]};
        for(let i=0;i<COUNT;i++){
          if(!still())throw Error('Přerušený 691BU deep trace');
          if(progress)progress(`Deep Trace: mazání ${lineCount} řádků ${i+1}/${COUNT}`);
          await nextFrame();
          if(!still())throw Error('Přerušený 691BU deep trace');
          const one=measureDeepDelete(lineCount,sandbox);
          for(const [name,val] of Object.entries(one))times[name].push(val);
        }
        const entry={};for(const [name,values] of Object.entries(times))entry[name]=stats(values);
        captured.deepDelete[String(lineCount)]=entry;
        const total=entry.total;
        rows.push(metricRow(`deep-delete-${lineCount}`,`691BU Deep Trace – mazání a render ${lineCount} syntetických řádků`,
          'PERF_SYNTHETIC_DEEP_TRACE','AUDIT',total.avg,
          `20/20; CELKEM avg=${total.avg}ms, p95=${total.p95}ms, max=${total.max}ms; `+
          `kopie modelu=${entry.clone.avg}ms, změna modelu=${entry.model.avg}ms, DOM=${entry.dom.avg}ms, layout=${entry.layout.avg}ms; `+
          'IZOLOVANÉ syntetické měření, ne skutečný Backspace Core V2 ani FPS editoru.'));
      }
    }catch(e){if(still())rows.push(metricRow('incomplete','Výkonové 20× testy nedokončeny','PERF_AUDIT','PARTIAL',0,String(e?.message||e)));}
    finally{sandbox?.remove();}
    if(!still()){current=null;return [];} 
    captured.score=computeScore(captured,prior,ownedResult.ok,fps.length,options.functionalStatus);
    const score=captured.score;
    rows.push(metricRow('performance-score','LubaNote Performance Score – index výkonu','PERF_COMPOSITE_INDEX',
      score.value!==null?'AUDIT':'PARTIAL',0,score.value!==null?
      `SKÓRE ${score.value} bodů; reference=1000 bodů (${score.referenceDate}); změna=${score.changePercent>0?'+':''}${score.changePercent} %; ${score.components.length} složek. Relativní index tohoto zařízení, není funkční PASS ani měření dlouhého Backspace; 20% váhy připadá na FPS během regresí a ostatní na Core V2 a syntetické DOM.`:
      `Skóre nelze spočítat: ${score.reason}`));
    captured.completed=performance.now()-s.started;captured.rows=rows.map(r=>({id:r.id,status:r.status,ms:r.ms}));
    if(fps.length===COUNT&&!prior.baseline.fps)prior.baseline.fps={avg:fpsStats.avg,date:s.startDate};
    prior.runs.push(captured);prior.runs=prior.runs.slice(-12);
    const saved=store(prior);if(!saved)rows.push(metricRow('storage','Místní uložení výkonových měření','PERF_AUDIT','PARTIAL',0,'localStorage nedostupné; výsledek zůstává jen v reportu.'));
    last={rows,date:s.startDate,saved,score:captured.score};current=null;
    return rows;
  }
  /* 691CB: explicit confirmed admin action only. Deletes performance-local
     AutoTester history/baselines, NOT manual history or the test notes. */
  function clearSaved(){
    if(current || window.LubaNoteAdminTools?.isAllowed?.()!==true)return false;
    try{
      localStorage.removeItem(KEY);
      if(localStorage.getItem(KEY)!==null)return false;
      last=null;return true;
    }catch(_error){return false;}
  }
  window.LubaNoteAutoTesterPerf691BS=Object.freeze({start,phase,cancel,finish,meriAkci,zaznamAkce,last:()=>last,clearSaved});
})();
