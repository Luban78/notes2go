/* LubaNote AutoTester 690F — 690B registry + isolated Core V2 bullet behavioral tests.
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
  const suiteNames={all:'Všechny dostupné testy + Core V2 bullet + MOVE + výběr 10× + pokrytí V1',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru',stability:'Centrum stability V1 – pokrytí',bullet:'Bullet / seznamy – Core V2 10× + MOVE'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VIZUÁLNÍ REGRESE</div>
    <h1>AutoTester <span>690F</span></h1><p>Skutečný testovací editor v izolovaném okně. Tvoje poznámky zůstávají nedotčené.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-main-controls">
      <button class="lat-main-run" type="button" data-lat="run" data-suite="all">▶ Spustit kompletní test</button>
      <div class="lat-subrun"><select id="lat-area" aria-label="Vybrat oblast">
        <option value="bullet">Bullet / seznamy (10×)</option><option value="e2e">E2E poznámky</option>
        <option value="sync">Synchronizace</option><option value="ui">Android / UI</option>
        <option value="db">Databáze</option><option value="stability">Pokrytí stability V1</option>
      </select><button type="button" data-lat="area">Spustit oblast</button></div>
    </section>
    <section class="lat-laboratory" aria-label="Živá vizuální laboratoř">
      <div class="lat-lab-top"><strong>Živý testovací editor</strong><button type="button" data-lat="visual" aria-pressed="true">Náhled zapnutý</button></div>
      <div class="lat-live-stage" id="lat-live-stage"><span class="lat-live-placeholder">Po spuštění testu se zde zobrazí skutečné testovací okno Core V2. Databázové testy obraz editoru nemají.</span></div>
      <div class="lat-progress-info"><span id="lat-live-step">Připraveno</span><span id="lat-progress-num">–</span></div>
      <div class="lat-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="lat-progress-track"><div id="lat-progress-fill"></div></div>
    </section>
    <div class="lat-result-head"><div><strong>Výsledek kontroly</strong><p id="lat-state" role="status">Zatím nic neproběhlo.</p></div><button data-lat="copy" type="button" disabled>Kopírovat report</button></div>
    <div id="lat-summary" class="lat-summary" aria-live="polite"></div>
    <details class="lat-details"><summary>Podrobnosti a jednotlivé testy</summary><div id="lat-list" class="lat-list" aria-label="Výsledky testování"></div></details>
    <footer class="lat-footer">690F: živý iframe ukazuje skutečný produkční Core V2 v odděleném sandboxu se syntetickými daty. Syntetický click/pointer/Range není fyzické Android gesto. PASS není důkaz nepokrytých oblastí. Spouští se pouze na vyžádání z APK.</footer>`;}
  let visualEnabled=true;
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
    const width=Math.max(240,host.clientWidth||320);
    const scale=Math.min(.80,(width-10)/420);
    frame.style.cssText='position:absolute;left:4px;top:0;width:420px;height:640px;transform:scale('+scale+');transform-origin:top left;opacity:1;pointer-events:none;border:0;background:#fff;';
    host.classList.add('lat-has-live-frame');
    host.appendChild(frame);return true;
  }
  window.LubaNoteAutoTesterVisual690F=Object.freeze({attachFrame:attachLiveFrame,isEnabled:()=>visualEnabled});
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
        document.head.appendChild(css);
      }
      document.body.appendChild(screen);
      screen.addEventListener('click',(e)=>{
        const btn=e.target.closest('button[data-lat]');if(!btn)return;
        const action=btn.dataset.lat;
        if(action==='close'){close();return;}
        if(action==='run'){void run(btn.dataset.suite);return;}
        if(action==='area'){void run(screen.querySelector('#lat-area')?.value || 'bullet');return;}
        if(action==='visual'){visualEnabled=!visualEnabled;btn.textContent=visualEnabled?'Náhled zapnutý':'Náhled vypnutý';btn.setAttribute('aria-pressed',String(visualEnabled));const lab=screen.querySelector('.lat-laboratory');if(lab)lab.dataset.off=visualEnabled?'0':'1';return;}
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
  function setStatus(s){
    const el=screen?.querySelector('#lat-state');if(el)el.textContent=s;
    if(!screen)return;
    const progress=String(s).match(/(\d+)\s*\/\s*(10|50)\b/);
    if(progress)updateProgress(Number(progress[1]),Number(progress[2]),s);
    else {const label=screen.querySelector('#lat-live-step');if(label)label.textContent=s;}
  }
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,CORE_PASS:0,CORE_FAIL:0,CORE_BLOCKED:0,PARTIAL:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0};for(const r of results)sum[r.status]=(sum[r.status]||0)+1;return sum;}
  function render(){
    if(!screen)return;
    const count=sums(), summary=screen.querySelector('#lat-summary');
    const passing=count.PASS+count.CLIENT_PASS+count.SIM_PASS+count.DB_PASS+count.CORE_PASS;
    const failing=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL;
    const blocked=count.BLOCKED+count.DB_BLOCKED+count.CORE_BLOCKED;
    const missing=count.NOT_TESTED+count.PARTIAL+count.AUDIT;
    summary.innerHTML=`<div><b>${passing}</b><span>PROVEDENO PASS</span></div><div><b>${failing}</b><span>CHYBY</span></div><div><b>${blocked}</b><span>BLOKOVÁNO</span></div><div><b>${missing}</b><span>NEOVĚŘENO / ČÁSTEČNĚ / AUDIT</span></div>`;
    const list=screen.querySelector('#lat-list');
    const priority={FAIL:0,CORE_FAIL:0,DB_FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,BLOCKED:1,CORE_BLOCKED:1,DB_BLOCKED:1,NOT_TESTED:2,PARTIAL:3,AUDIT:4};
    const ordered=results.slice().sort((a,b)=>(priority[a.status]??5)-(priority[b.status]??5));
    list.innerHTML=ordered.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',CORE_PASS:'CORE V2 PASS',CORE_FAIL:'CORE V2 FAIL',CORE_BLOCKED:'CORE V2 BLOKOVÁNO',PARTIAL:'ČÁSTEČNĚ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
      return `<details class="lat-result" data-status="${safe(r.status)}"><summary><span class="lat-indicator" aria-hidden="true"></span><span class="lat-result-title">${safe(r.name)}</span><span class="lat-pill">${label}</span></summary><div class="lat-result-body"><div>Typ: ${safe(r.kind)} · Trvání: ${Number(r.ms)||0} ms</div><div>ID testu: ${safe(r.id)}</div>${r.detail?`<p>${safe(r.detail)}</p>`:''}</div></details>`;
    }).join('')||'<div class="lat-empty">Spusť test. Průběh uvidíš výše, výsledky po dokončení zde.</div>';
    screen.querySelector('[data-lat="copy"]').disabled=results.length===0||running;
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
    const bulletProof=new Map([['list-toggle','core-list-toggle'],['list-badge','core-list-badge'],['list-levels','core-list-indent'],['list-move','core-list-move-pointer'],['list-selection','core-list-selection-collapse']]);
    for(const item of vybrane){
      const coreResult=results.find(r=>r.id===bulletProof.get(item.id));
      const partial=coreResult?.status==='CORE_PASS';
      results.push({id:'stability-v1-'+item.id,name:item.name,kind:'STABILITY_V1/'+item.group,
        status:partial?'PARTIAL':'NOT_TESTED',ms:0,
        detail:partial?'10× skutečný Core V2 v izolovaném DOM se syntetickými interakcemi PASS; nativní Android dotyky, gesta a selection handles nejsou plně ověřeny.':'Scénář V1 dosud není funkčně ověřen v celém rozsahu; ruční PASS se nepřebírá.'});
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
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
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
    if(activeSuite==='stability' || activeSuite==='bullet'){
      if(activeSuite==='bullet'){await spustitBulletCore690C(generace);if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);}
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
      'LUBANOTE AUTOTESTER / 690F',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${counts.PASS} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} CORE_PASS=${counts.CORE_PASS} CORE_FAIL=${counts.CORE_FAIL} CORE_BLOCKED=${counts.CORE_BLOCKED} PARTIAL=${counts.PARTIAL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
      `STABILITY_V1_TOTAL=${results.filter(x=>x.id.startsWith('stability-v1-')).length} STABILITY_V1_AUTOMATED_PASS=0 STABILITY_V1_PARTIAL=${counts.PARTIAL}`,
      '690F: LIVE VISUAL PREVIEW is actual sandbox Core V2. CORE_PASS means actual shipped editorCoreV2.js under synthetic DOM/keyboard/pointer/Range 10x. Physical Android touch, native text handles and system WebView gesture arbitration are NOT TESTED. V1 PARTIAL is not complete regression PASS.', 
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
