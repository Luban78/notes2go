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
  /* 693P: Reuse LubaNote's existing SVG palette when SVG icon mode is selected.
     For classic/auto-on-mobile keep the original colored emoji. */
  function updatePaletteIcon693P() {
    const icons = window.LubaNoteIcons;
    if (icons?.pouzitSvgIkony?.()) {
      const svg = icons.vytvorSvgIkonu?.('paleta');
      if (svg) {
        palette.replaceChildren(svg);
        return;
      }
    }
    palette.textContent = '🎨';
  }
  updatePaletteIcon693P();
  window.addEventListener('lubanote:icon-style-change', updatePaletteIcon693P);
  // 693M: mobile icon mirrors the existing day/night controller in settings.js.
  // The underlying button changes data-quick-theme-mode when the theme changes.
  const baseNightToggle = document.getElementById('quickThemeButton');
  function updateNightIcon693M() {
    const isNight = baseNightToggle?.dataset.quickThemeMode === 'night';
    night.innerHTML = isNight
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.6 15.3A8.6 8.6 0 0 1 8.7 3.4 8.7 8.7 0 1 0 20.6 15.3Z"/></svg>';
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
  /* 699AR: SYNC je uzivatelsky stav a cloudova spotreba.
     Technicke casy startu se presunuly do Admin Dashboardu. */
  sync.addEventListener('click', () => window.LubaNoteCloudUsage699AR?.otevri?.());
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
