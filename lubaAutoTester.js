/* LubaNote AutoTester 690M — 690B registry + isolated Core V2 bullet behavioral tests.
 * Explicit opt-in; isolated Worker runs synthetic cases only.
 * No local user notes, credentials, keys or production LubaServer data are read.
 * A secure administrator-only LubaServer runner executes isolated SQL tests on demand.
 */
(() => {
  'use strict';
  let screen=null, worker=null, results=[], startedAt='',activeSuite='all';
  let runTimeout=null;
  let running=false;
  let activeRep=1;
  let generaceBehu=0;
  const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const suiteNames={extended:'Code / obrázky / jazyky – skutečné moduly',image:'Obrázky Core V2 – skutečný modul',i18n:'Šest jazyků – kompletnost balíčků',caret:'Kurzor, úchyty a mazání ToDo dle nastavení',planner:'Planner / opakování (dle nastavení)',editor:'Editor Core V2 dle nastavení',todo:'ToDo Core V2 dle nastavení',all:'Všechny dostupné testy – Bullet, Editor, ToDo, Planner, E2E, DB a pokrytí V1',e2e:'E2E a bezpečnost',sync:'Synchronizace',ui:'Android a ovládání',db:'Databáze na LubaServeru',stability:'Centrum stability V1 – pokrytí',bullet:'Bullet / seznamy – Core V2 dle nastavení + MOVE'};
  function isAllowed(){
    try {return window.LubaNoteAdminTools?.isAllowed?.()===true || document.getElementById('ln-debug-hub')?.hidden===false;}catch(_e){return false;}
  }
  function header(){return `
    <header class="lat-head"><div><div class="lat-eyebrow">LUBANOTE · VIZUÁLNÍ REGRESE</div>
    <h1>AutoTester <span>690R</span></h1><p>Skutečný testovací editor v izolovaném okně. Tvoje poznámky zůstávají nedotčené.</p></div>
    <button type="button" class="lat-close" data-lat="close" aria-label="Zavřít AutoTester">×</button></header>
    <section class="lat-main-controls">
      <button class="lat-main-run" type="button" data-lat="run" data-suite="all">▶ Spustit vše</button>
      <div class="lat-subrun"><select id="lat-area" aria-label="Vybrat oblast">
        <option value="bullet">Bullet / seznamy (dle nastavení)</option><option value="editor">Editor / Core V2 (dle nastavení)</option><option value="todo">ToDo (dle nastavení)</option><option value="caret">Kurzor / úchyty / mazání (dle nastavení)</option><option value="planner">Planner / opakování (dle nastavení)</option><option value="e2e">E2E poznámky</option>
        <option value="sync">Synchronizace</option><option value="ui">Android / UI</option>
        <option value="db">Databáze</option><option value="extended">Code / obrázky / jazyky (Core V2)</option><option value="image">Obrázky Core V2</option><option value="i18n">Šest jazykových balíčků</option><option value="stability">Centrum stability V1 – dostupná automatizace</option>
      </select><button type="button" data-lat="area">Spustit oblast</button></div>
      <label class="lat-repeat-control" for="lat-repetitions">Opakování Core / Planner / Android WebView testů <input id="lat-repetitions" type="number" inputmode="numeric" min="1" max="50" step="1" value="1"></label>
      <small class="lat-repeat-help">Výchozí 1×, vlastní počet 1–50. E2E a izolované DB testy zatím běží 1×. Android používá skutečné MotionEvent ve WebView, ne fyzický prst.</small>
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
    <footer class="lat-footer">690N: živý sandbox testuje skutečný Core V2 (Bullet/Editor/ToDo) a recurringTasks.js (opakování). Syntetický click/pointer/Range není fyzické Android gesto. PASS není důkaz nepokrytých oblastí. Spouští se pouze na vyžádání z APK.</footer>`;}
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
  // 690M: Dvojtap admina ukaze POUZE panel VD / DH / T, zadny nastroj neotvira.
  window.LubaNoteDockBuild='690R';
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
      screen.innerHTML=`<div class="lat-inner">${header()}</div>`;
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
        if(action==='run'){void run(btn.dataset.suite);return;}
        if(action==='choose'){openAreaPicker();return;}
        if(action==='area'){void run(screen.querySelector('#lat-area')?.value || 'bullet');return;}
        if(action==='speed'){if(slowMode&&!extraSlowMode){extraSlowMode=true;}else if(extraSlowMode){slowMode=false;extraSlowMode=false;}else{slowMode=true;}btn.textContent=extraSlowMode?'🐌 Velmi pomalu':slowMode?'🐢 Pomalu':'⚡ Rychle';btn.setAttribute('aria-pressed',String(slowMode));return;}
        if(action==='expand'){expanded=!expanded;screen.querySelector('.lat-laboratory')?.classList.toggle('lat-expanded',expanded);btn.textContent=expanded?'↙ Zmenšit':'⛶ Zvětšit';btn.setAttribute('aria-pressed',String(expanded));return;}
        if(action==='visual'){visualEnabled=!visualEnabled;btn.textContent=visualEnabled?'Náhled zapnutý':'Náhled vypnutý';btn.setAttribute('aria-pressed',String(visualEnabled));const lab=screen.querySelector('.lat-laboratory');if(lab)lab.dataset.off=visualEnabled?'0':'1';return;}
        if(action==='copy'){void copyReport(btn);}
      });
      document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!screen.hidden){e.preventDefault();e.stopImmediatePropagation();handleTesterBack();}},true);
    }
    screen.hidden=false;document.body.classList.add('lat-open');
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
  function close(){if(!screen)return;closeAreaPicker();expanded=false;screen.querySelector('.lat-laboratory')?.classList.remove('lat-expanded');const expand=screen.querySelector('[data-lat="expand"]');if(expand){expand.textContent='⛶ Zvětšit';expand.setAttribute('aria-pressed','false');}screen.hidden=true;document.body.classList.remove('lat-open');stop();zajistiTesterVDocku();}
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
  }
  function sums(){const sum={PASS:0,CLIENT_PASS:0,SIM_PASS:0,FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,DB_PASS:0,DB_FAIL:0,DB_BLOCKED:0,CORE_PASS:0,CORE_FAIL:0,CORE_BLOCKED:0,APP_PASS:0,APP_FAIL:0,APP_BLOCKED:0,NATIVE_PASS:0,NATIVE_FAIL:0,NATIVE_BLOCKED:0,PARTIAL:0,AUDIT:0,BLOCKED:0,NOT_TESTED:0};for(const r of results)sum[r.status]=(sum[r.status]||0)+1;return sum;}
  function render(){
    if(!screen)return;
    const count=sums(), summary=screen.querySelector('#lat-summary');
    const passing=count.PASS+count.CLIENT_PASS+count.SIM_PASS+count.DB_PASS+count.CORE_PASS+count.APP_PASS+count.NATIVE_PASS;
    const failing=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL+count.NATIVE_FAIL;
    const blocked=count.BLOCKED+count.DB_BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED+count.NATIVE_BLOCKED;
    const missing=count.NOT_TESTED+count.PARTIAL+count.AUDIT;
    summary.innerHTML=`<div><b>${passing}</b><span>PROVEDENO PASS</span></div><div><b>${failing}</b><span>CHYBY</span></div><div><b>${blocked}</b><span>BLOKOVÁNO</span></div><div><b>${missing}</b><span>NEOVĚŘENO / ČÁSTEČNĚ / AUDIT</span></div>`;
    const state=screen.querySelector('#lat-state');
    if(state&&!running){
      if(failing>0)state.textContent=`⛔ CHYBA: ${failing} testů selhalo. ${blocked} dalších je blokovaných. Zkopíruj report.`;
      else if(blocked>0)state.textContent=`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Není to PASS celé aplikace! Zkopíruj report.`;
      else if(missing>0)state.textContent=`Dokončeno bez zjištěné chyby v provedených testech. ${missing} položek je jen audit / částečně / netestováno.`;
    }
    const list=screen.querySelector('#lat-list');
    const priority={FAIL:0,CORE_FAIL:0,APP_FAIL:0,DB_FAIL:0,CLIENT_FAIL:0,SIM_FAIL:0,NATIVE_FAIL:0,BLOCKED:1,NATIVE_BLOCKED:1,CORE_BLOCKED:1,APP_BLOCKED:1,DB_BLOCKED:1,NOT_TESTED:2,PARTIAL:3,AUDIT:4};
    const ordered=results.slice().sort((a,b)=>(priority[a.status]??5)-(priority[b.status]??5));
    list.innerHTML=ordered.map(r=>{
      const label={PASS:'PASS',FAIL:'FAIL',CLIENT_PASS:'CLIENT PASS',CLIENT_FAIL:'CLIENT FAIL',SIM_PASS:'SIM PASS',SIM_FAIL:'SIM FAIL',DB_PASS:'DB LIVE PASS',DB_FAIL:'DB LIVE FAIL',DB_BLOCKED:'DB LIVE NEDOSTUPNÉ',CORE_PASS:'CORE V2 PASS',CORE_FAIL:'CORE V2 FAIL',CORE_BLOCKED:'CORE V2 BLOKOVÁNO',APP_PASS:'MODUL PASS',APP_FAIL:'MODUL FAIL',APP_BLOCKED:'MODUL BLOKOVÁNO',NATIVE_PASS:'ANDROID WEBVIEW PASS',NATIVE_FAIL:'ANDROID WEBVIEW FAIL',NATIVE_BLOCKED:'ANDROID BLOKOVÁNO',PARTIAL:'ČÁSTEČNĚ',AUDIT:'AUDIT',BLOCKED:'BLOKOVÁNO',NOT_TESTED:'NETESTOVÁNO'}[r.status]||'NEZNÁMÉ';
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
    const bulletProof=new Map([['editor-plain','core-editor-keyboard'],['editor-undo','core-editor-history'],['editor-caret','caret-todo-reopen'],['editor-format','caret-editor-format'],['editor-edge','caret-editor-scroll'],['image-between','caret-editor-image'],['editor-selection','caret-todo-range'],['list-toggle','core-list-toggle'],['list-badge','core-list-badge'],['list-levels','core-list-indent'],['list-move','core-list-move-pointer'],['list-selection','core-list-selection-collapse'],
      // 690Q – nove skutecne Core V2 operace. Pouze PARTIAL: nativni gesta a cela aplikace nejsou timto potvrzene.
      ['code-integrity','core-code-import'],['code-caret','core-code-caret'],['code-image','core-code-image'],['image-wrap','core-image-size'],['image-reopen','core-image-roundtrip']]);
    for(const item of vybrane){
      const coreResult=results.find(r=>r.id===bulletProof.get(item.id));
      const partial=item.id==='app-planner'
        ? ['planner-repeat-daily','planner-repeat-weekly','planner-repeat-month-end','planner-repeat-bounds','planner-repeat-next','planner-repeat-future','planner-repeat-copy'].every(id=>results.some(r=>r.id===id&&r.status==='APP_PASS'))
        :coreResult?.status==='CORE_PASS';
      results.push({id:'stability-v1-'+item.id,name:item.name,kind:'STABILITY_V1/'+item.group,
        status:partial?'PARTIAL':'NOT_TESTED',ms:0,
        detail:partial?(item.id==='app-planner'?`7×${activeRep} testů skutečného recurringTasks.js PASS v izolaci; neověřuje uložené události, Android alarmy ani doručení připomínek.`:`${activeRep}× skutečný Core V2 v izolovaném DOM se syntetickými interakcemi PASS; nativní Android dotyky, gesta a selection handles nejsou plně ověřeny.`):'Scénář V1 dosud není funkčně ověřen v celém rozsahu; ruční PASS se nepřebírá.'});
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

  // 690I: synthetic caret, DOM selection and TODO edge cases in the actual shipped Core V2.
  // Blue selection marks and red pointer dot are VISUAL diagnostics, not native Android handles.
  async function spustitKurzorTodo690I(generace,scope='all'){
    const allIds=['caret-todo-middle','caret-todo-clear','caret-todo-empty','caret-todo-mixed','caret-todo-legacy-html','caret-todo-last','caret-todo-range','caret-todo-reopen','caret-todo-done-move','caret-todo-done-longpress','caret-bullet-first-move','caret-bullet-last-move','caret-editor-plain','caret-bullet-text','caret-editor-format','caret-editor-colors','caret-editor-scroll','caret-editor-image'];
    const needed=scope==='editor'?allIds.filter(id=>id.startsWith('caret-editor-')||['caret-todo-range','caret-todo-reopen'].includes(id)):scope==='todo'?allIds.filter(id=>id.startsWith('caret-todo-')):scope==='bullet'?allIds.filter(id=>id.startsWith('caret-bullet-')):allIds;
    const blocked=why=>needed.map(id=>({id,name:'Kurzor / ToDo – '+id,kind:'CORE_V2_CARET_SANDBOX_690I',status:'CORE_BLOCKED',ms:0,detail:String(why||'missing').slice(0,180)}));
    try{
      if(window.LubaNoteAutoTesterCaretTodo690I?.supportsRepeatCount!==true){
        const url=new URL('lubaAutoTesterCaretTodo690I.js?v=690N-mixed-delete-text',location.href);
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
      ['native-webview-longpress','Android WebView – doručení dlouhého stisku'],
      ['native-webview-selection','Android WebView – výběr slova dlouhým stiskem']
    ];
    const blocked=why=>cases.map(([id,name])=>({id,name,kind:'ANDROID_WEBVIEW_NATIVE_MOTIONEVENT',status:'NATIVE_BLOCKED',ms:0,detail:String(why||'native_missing').slice(0,210)}));
    try {
      if(!window.LubaNoteAutoTesterNative690R){
        const url=new URL('lubaAutoTesterNative690R.js?v=690R-native-webview-v1',location.href);
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
    const placeholder=screen?.querySelector('.lat-live-placeholder');
    if(placeholder)placeholder.textContent='Běh skončil. Tento náhled není záznamem testu. Pro sledování živého editoru zvol 🐌 Velmi pomalu a spusť konkrétní oblast.';
    render();
    const count=sums();
    const registr=results.filter(x=>x.id.startsWith('stability-v1-'));
    const partialV1=registr.filter(x=>x.status==='PARTIAL').length;
    const suffix=registr.length?` · Centrum V1: 0/${registr.length} plně ověřeno, ${partialV1} částečně`:'';
    updateProgress(activeRep,activeRep,'Dokončeno – výsledky jsou níže');
    const failed=count.FAIL+count.CLIENT_FAIL+count.SIM_FAIL+count.DB_FAIL+count.CORE_FAIL+count.APP_FAIL+count.NATIVE_FAIL;
    const blocked=count.DB_BLOCKED+count.BLOCKED+count.CORE_BLOCKED+count.APP_BLOCKED+count.NATIVE_BLOCKED;
    if(failed) setStatus(`⛔ CHYBA: ${failed} testů FAIL, ${blocked} BLOKOVÁNO. Kopírovat report.`);
    else if(blocked) setStatus(`⚠️ NEDOKONČENO: ${blocked} testů BLOKOVÁNO. Výsledek NENÍ PASS! Kopírovat report.`);
    else if(count.NOT_TESTED||count.PARTIAL||count.AUDIT) setStatus(`DOČASNÝ VÝSLEDEK – bez nalezeného FAIL v testované části; ${count.NOT_TESTED} NETESTOVÁNO, ${count.PARTIAL} ČÁSTEČNĚ, ${count.AUDIT} AUDIT. Nejde o kompletní PASS.${suffix}`);
    else setStatus('Dokončeno – všechny dostupné vykonané kontroly prošly.');
    updateProgress(1,1,'Dokončeno – podrobnosti a rozsah pokrytí níže');
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
      setStatus(`Provádím ${activeRep}× bullet testy skutečného Core V2…`);
      await spustitBulletCore690C(generace);
      if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
      if(generace===generaceBehu)await spustitEditorTodo690G(generace,'all');
      if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'all');
      if(generace===generaceBehu)await spustitPokrocile690Q(generace,'all');
      if(generace===generaceBehu)await spustitPlanner690H(generace);
    }
    if(generace===generaceBehu && (activeSuite==='all'||activeSuite==='ui')){
      setStatus('Spouštím nativní Android WebView testy…');
      await spustitNativniWebView690R(generace);
    }
    if(generace===generaceBehu && activeSuite==='all'){
      setStatus('Načítám pokrytí Centra stability V1…');
      await pridejPokrytiV1(generace,'all');
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
    results=[];running=true;
    startedAt=new Date().toISOString();activeSuite=suiteNames[suite]?suite:'all';
    screen?.querySelector('#lat-live-stage')?.classList.remove('lat-has-live-frame');
    const placeholder=screen?.querySelector('.lat-live-placeholder');
    if(placeholder)placeholder.textContent='Spouštím živé testovací okno Core V2…';
    render();updateProgress(0,activeRep,'Připravuji test…');
    setStatus(`Spouštím ${suiteNames[activeSuite].toLowerCase()}…`);
    if(activeSuite==='stability' || activeSuite==='bullet' || activeSuite==='editor' || activeSuite==='todo' || activeSuite==='planner' || activeSuite==='caret'||activeSuite==='extended'||activeSuite==='image'||activeSuite==='i18n'){
      if(activeSuite==='editor'||activeSuite==='todo'){await spustitEditorTodo690G(generace,activeSuite);if(generace===generaceBehu)await spustitKurzorTodo690I(generace,activeSuite);}
      if(activeSuite==='caret')await spustitKurzorTodo690I(generace,'all');
      if(activeSuite==='planner')await spustitPlanner690H(generace);
      if(['extended','image','i18n'].includes(activeSuite))await spustitPokrocile690Q(generace,activeSuite==='extended'?'all':activeSuite);
      if(activeSuite==='editor' && generace===generaceBehu)await spustitPokrocile690Q(generace,'editor');
      if(activeSuite==='stability' && generace===generaceBehu){
        await spustitBulletCore690C(generace);
        if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
        if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
        if(generace===generaceBehu)await spustitEditorTodo690G(generace,'all');
        if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'all');
        if(generace===generaceBehu)await spustitPokrocile690Q(generace,'all');
        if(generace===generaceBehu)await spustitPlanner690H(generace);
      }
      if(activeSuite==='bullet'){await spustitBulletCore690C(generace);if(generace===generaceBehu)await spustitBulletHierarchie690D(generace);
      if(generace===generaceBehu)await spustitBulletMoveVyber690E(generace);
      if(generace===generaceBehu)await spustitKurzorTodo690I(generace,'bullet');}
      if(generace===generaceBehu && !['extended','image','i18n'].includes(activeSuite))await pridejPokrytiV1(generace,activeSuite==='bullet'?'bullet':activeSuite==='editor'?'editor':activeSuite==='todo'?'todo':activeSuite==='planner'?'planner':activeSuite==='caret'?'editor':'all');
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
      'LUBANOTE AUTOTESTER / 690R',
      `build: ${window.LUBANOTE_VERSION||'neznama'}`,
      `cas: ${startedAt||'-'}`,
      `pozadovana_opakovani_core_planner=${activeRep}`,
      `sada: ${suiteNames[activeSuite]||activeSuite}`,
      `PASS_E2E=${counts.PASS} CLIENT_PASS=${counts.CLIENT_PASS} SIM_PASS=${counts.SIM_PASS} DB_LIVE_PASS=${counts.DB_PASS} DB_LIVE_FAIL=${counts.DB_FAIL} DB_LIVE_BLOCKED=${counts.DB_BLOCKED} FAIL=${counts.FAIL} CLIENT_FAIL=${counts.CLIENT_FAIL} SIM_FAIL=${counts.SIM_FAIL} CORE_PASS=${counts.CORE_PASS} CORE_FAIL=${counts.CORE_FAIL} CORE_BLOCKED=${counts.CORE_BLOCKED} APP_PASS=${counts.APP_PASS} APP_FAIL=${counts.APP_FAIL} APP_BLOCKED=${counts.APP_BLOCKED} NATIVE_PASS=${counts.NATIVE_PASS} NATIVE_FAIL=${counts.NATIVE_FAIL} NATIVE_BLOCKED=${counts.NATIVE_BLOCKED} PARTIAL=${counts.PARTIAL} AUDIT=${counts.AUDIT} BLOCKED=${counts.BLOCKED} NOT_TESTED=${counts.NOT_TESTED}`,
      `RUN_OUTCOME=${(counts.FAIL+counts.CLIENT_FAIL+counts.SIM_FAIL+counts.DB_FAIL+counts.CORE_FAIL+counts.APP_FAIL+counts.NATIVE_FAIL)>0?'FAIL':(counts.BLOCKED+counts.DB_BLOCKED+counts.CORE_BLOCKED+counts.APP_BLOCKED+counts.NATIVE_BLOCKED)>0?'INCOMPLETE_BLOCKED':'CHECKED_WITH_COVERAGE_GAPS'}`,
      `STABILITY_V1_TOTAL=${results.filter(x=>x.id.startsWith('stability-v1-')).length} STABILITY_V1_AUTOMATED_PASS=0 STABILITY_V1_PARTIAL=${counts.PARTIAL}`,
      '690R: Android probe injects Java MotionEvent into real WebView and checks trusted touch events in an ephemeral overlay; it is NOT a physical finger, Android OS UIAutomator nor a guarantee of native selection handles. PC reports NATIVE_BLOCKED. Test label Testy is reserved for future isolated create/save/trash workflow; no user notes are modified.',
      '690N: LIVE VISUAL PREVIEW uses sandbox Core V2 for Bullet, Editor and ToDo plus recurringTasks.js for Planner calculations. CORE_PASS means actual shipped editorCoreV2.js under synthetic DOM/keyboard/pointer/Range with the reported repetition count. Red pointer only denotes an actual synthetic PointerEvent; blue marks represent the actual DOM Range, not Android handles, NOT Android system touch/handles. Physical Android touch, native text handles and system WebView gesture arbitration remain NOT TESTED. V1 PARTIAL is not complete regression PASS.', 
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
