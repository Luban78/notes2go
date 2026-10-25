/* 693J – mobile one-row test. Does not alter native fullscreen or sync writes. */
(() => {
  'use strict';
  const mq=matchMedia('(max-width:899px)');
  if (!mq.matches) return;
  const date=document.getElementById('lnHomeDate683BC');
  const time=document.getElementById('lnHomeTime683BC');
  const sync=document.getElementById('lnMobileSync693J');
  const palette=document.getElementById('lnMobilePalette693J');
  const night=document.getElementById('lnMobileNight693J');
  if(!date||!time||!sync||!palette||!night)return;
  let latest='pending';
  const states={synced:'✓ SYNC',syncing:'⟳ SYNC',pending:'◷ SYNC',local:'▣ LOCAL','auth-expired':'⚠ SYNC',conflict:'⚠ SYNC'};
  function state(){return window.LubaNoteStorageScope?.ziskejAktivni?.()==='local'?'local':latest;}
  function render(){sync.textContent=states[state()]||states.pending;sync.title=state()==='local'?'Pouze v zařízení':'Informace o synchronizaci';}
  window.addEventListener('lubanote:sync-state',e=>{const s=e?.detail?.stav;if(states[s]){latest=s;render();}});
  window.addEventListener('focus',render);render();
  palette.addEventListener('click',()=>document.getElementById('openThemeModalButton')?.click());
  // 693M: mobile icon mirrors the existing day/night controller in settings.js.
  // The underlying button changes data-quick-theme-mode when the theme changes.
  const baseNightToggle = document.getElementById('quickThemeButton');
  function updateNightIcon693M() {
    const isNight = baseNightToggle?.dataset.quickThemeMode === 'night';
    night.textContent = isNight ? '☀' : '☾';
    const label = isNight ? 'Zapnout denní režim' : 'Zapnout noční režim';
    night.setAttribute('aria-label', label);
    night.title = label;
  }
  if (baseNightToggle) {
    new MutationObserver(updateNightIcon693M).observe(baseNightToggle, {
      attributes: true, attributeFilter: ['data-quick-theme-mode']
    });
  }
  updateNightIcon693M();
  night.addEventListener('click', () => baseNightToggle?.click());
  const overlay=document.createElement('div');overlay.className='lnSyncModal693J';overlay.hidden=true;
  overlay.innerHTML='<div class="lnSyncBox693J" role="dialog" aria-modal="true" aria-label="Stav synchronizace"><header><span>Stav LubaNote</span><button type="button" data-close>✕</button></header><div data-state></div><div data-usage>Načítám využití prostoru…</div><div class="lnSyncTrack693J"><span data-fill></span></div><div data-free></div></div>';
  document.body.appendChild(overlay);
  const close=()=>{overlay.hidden=true;};overlay.querySelector('[data-close]').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  const fmt=n=>Number.isFinite(n)?`${(n/1048576).toLocaleString('cs-CZ',{maximumFractionDigits:2})} MB`:'—';
  sync.addEventListener('click',async()=>{
    overlay.hidden=false;overlay.querySelector('[data-state]').textContent=states[state()]||states.pending;
    const used=overlay.querySelector('[data-usage]'),free=overlay.querySelector('[data-free]'),fill=overlay.querySelector('[data-fill]');
    used.textContent='Zjišťuji využití prostoru…';free.textContent='';fill.style.width='0%';
    if(state()==='local'){used.textContent='Pouze místní uložení – bez cloudové kvóty';return;}
    try{
      const ready=await window.LubaNoteSupabase?.pripravClient?.();
      if(!ready||typeof supabaseClient==='undefined'||!supabaseClient){used.textContent='Údaj není dostupný';return;}
      const session=await supabaseClient.auth.getSession();
      if(!session?.data?.session?.user){used.textContent='Nepřihlášeno';return;}
      const {data,error}=await supabaseClient.rpc('lubanote_get_account_cloud_usage_v1');
      if(error||!data?.ok){used.textContent='Údaj není dostupný';return;}
      const u=Number(data.usage_bytes),limit=data.cloud_bytes_limit==null?null:Number(data.cloud_bytes_limit);
      if(!Number.isFinite(u)||u<0||(limit!==null&&(!Number.isFinite(limit)||limit<=0))){used.textContent='Údaj není dostupný';return;}
      used.textContent=`Využito: ${fmt(u)} / ${limit===null?'bez limitu':fmt(limit)}`;
      free.textContent=limit===null?'Bez stanoveného limitu':`Volné místo: ${fmt(Math.max(0,limit-u))}`;
      fill.style.width=limit===null?'0%':`${Math.max(0,Math.min(100,100*u/limit))}%`;
    }catch(e){used.textContent='Údaj není dostupný';}
  });
  // Respect native cutout actual rectangle even if other handsets place it off-centre.
  async function protect(){
    try{
      const plugin=window.Capacitor?.Plugins?.LubaNoteCutoutDiagnostic693I;
      const d=await plugin?.read?.();if(!d?.hasCutout||!Array.isArray(d.rectsPx))return;
      const z=Number(d.density)||devicePixelRatio||1;
      const cutouts=d.rectsPx.map(r=>({l:r.left/z-5,r:r.right/z+5,t:r.top/z,b:r.bottom/z}));
      const conflict=el=>{if(el.hidden)return false;const r=el.getBoundingClientRect();return cutouts.some(c=>r.right>c.l&&r.left<c.r&&r.bottom>c.t&&r.top<c.b);};
      // First sacrifice optional controls, preserve date and clock whenever possible.
      for(const el of [palette,night,sync])if(conflict(el))el.hidden=true;
      if(conflict(date)){sync.hidden=true;date.style.maxWidth='25vw';}
      if(conflict(time)){palette.hidden=true;night.hidden=true;}
    }catch(_){/* no native plugin: retain original edge-anchored layout */}
  }
  requestAnimationFrame(()=>{void protect();});
})();
