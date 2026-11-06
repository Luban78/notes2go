/* 699AR – uživatelská cloudová kvóta: serverová agregace, read-only. */
(() => {
  'use strict';
  const format = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1048576) return `${(n / 1024).toLocaleString('cs-CZ',{maximumFractionDigits:1})} kB`;
    return `${(n / 1048576).toLocaleString('cs-CZ',{maximumFractionDigits:2})} MB`;
  };
  const modal=document.createElement('div');
  modal.className='lnCloudUsageOverlay699AR';
  modal.hidden=true;
  modal.innerHTML=`<section class="lnCloudUsageBox699AR" role="dialog" aria-modal="true" aria-labelledby="lnCuTitle699AR">
    <header class="lnCloudUsageHead699AR"><div><h2 id="lnCuTitle699AR">Stav LubaNote</h2><span id="lnCuState699AR">SYNC</span></div>
      <button type="button" id="lnCuClose699AR" aria-label="Zavřít">×</button></header>
    <div id="lnCuStatus699AR" role="status">Připraveno</div>
    <div class="lnCloudUsageTotals699AR"><div><small>Obsazeno</small><strong id="lnCuUsed699AR">—</strong></div>
      <div><small>Limit</small><strong id="lnCuLimit699AR">—</strong></div>
      <div><small>Volné místo</small><strong id="lnCuFree699AR">—</strong></div></div>
    <div class="lnCloudUsageBar699AR" role="progressbar" aria-label="Využití cloudové kvóty" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="lnCuFill699AR"></span></div>
    <p id="lnCuExact699AR" class="lnCloudUsageHint699AR" aria-live="polite"></p>
    <h3>Co zabírá místo</h3><div id="lnCuCategories699AR" class="lnCloudUsageBreakdown699AR"></div>
    <p id="lnCuReserved699AR" class="lnCloudUsageHint699AR"></p>
    <details id="lnCuNotesDetail699AR"><summary>Největší poznámky (orientačně)</summary>
      <p class="lnCloudUsageHint699AR">Odhad délky místního obsahu, nikoliv přesná velikost na serveru. E2E a přílohy mohou zabírat jiné množství dat. Tajné a pouze místní poznámky zde nezobrazujeme.</p>
      <div id="lnCuNotes699AR" class="lnCloudUsageBreakdown699AR"></div></details>
    <div class="lnCloudUsageActions699AR"><button type="button" id="lnCuRefresh699AR">Aktualizovat</button>
      <span id="lnCuUpdated699AR">Zatím nenačteno</span></div>
    <p class="lnCloudUsageHint699AR">Údaje čteme z aktivního serveru LubaNote. Nejde o velikost aplikace, zařízení ani záloh. Vymazání poznámky nemusí okamžitě uvolnit kvótu, pokud zůstává v Koši nebo obsahuje přílohy.</p>
  </section>`;
  document.body.append(modal);
  const find=id=>modal.querySelector('#'+id);
  const closeButton=find('lnCuClose699AR');
  const refreshButton=find('lnCuRefresh699AR');
  const status=find('lnCuStatus699AR');
  const categories=find('lnCuCategories699AR');
  const notesList=find('lnCuNotes699AR');
  const notesDetail=find('lnCuNotesDetail699AR');
  const reserved=find('lnCuReserved699AR');
  const bar=modal.querySelector('.lnCloudUsageBar699AR');
  const fill=find('lnCuFill699AR');
  let inFlight=false, lastFocus=null, generation=0, latestState='pending';
  const states={synced:'✓ Synchronizováno',syncing:'⟳ Synchronizace probíhá',pending:'◷ Čeká na synchronizaci',local:'▣ Pouze v zařízení','auth-expired':'⚠ Přihlášení vypršelo',conflict:'⚠ Konflikt'};
  window.addEventListener('lubanote:sync-state',e=>{
    if(states[e?.detail?.stav]) latestState=e.detail.stav;
    if(!modal.hidden) vykresliStav();
  });
  function vykresliStav(){
    const local=window.LubaNoteStorageScope?.ziskejAktivni?.()==='local';
    find('lnCuState699AR').textContent=states[local?'local':latestState]||states.pending;
  }
  function radek(parent,label,value){
    const line=document.createElement('div');line.className='lnCloudUsageRow699AR';
    const a=document.createElement('span');a.textContent=label;
    const b=document.createElement('strong');b.textContent=value;
    line.append(a,b);parent.append(line);
  }
  function reset(){
    for(const id of ['lnCuUsed699AR','lnCuLimit699AR','lnCuFree699AR']) find(id).textContent='—';
    fill.style.width='0%';bar.setAttribute('aria-valuenow','0');
    categories.replaceChildren();notesList.replaceChildren();reserved.textContent='';
    find('lnCuExact699AR').textContent='';
    find('lnCuUpdated699AR').textContent='Zatím nenačteno';
  }
  function zmenStav(text){status.textContent=text;}
  function zobrazOrientaCniPoznamky(){
    notesList.replaceChildren();
    let data=[];
    try {
      if(typeof window.loadTask==='function')data=window.loadTask();
      else if(typeof loadTask==='function')data=loadTask();
    }catch(_){data=[];}
    if(!Array.isArray(data)){notesList.textContent='Místní data nejsou dostupná.';return;}
    const encoder=new TextEncoder();
    const nejvetsi=data.filter(n=>n && n.isSecret!==true && n.storageScope!=='local' && !n.trashedAt)
      .map(n=>{
        const obsah={title:n.title||'',note:n.note||'',richContent:n.richContent||'',todos:n.todos||[]};
        return { title:String(n.title||'Bez názvu').slice(0,120),bytes:encoder.encode(JSON.stringify(obsah)).byteLength };
      }).sort((a,b)=>b.bytes-a.bytes).slice(0,10);
    if(!nejvetsi.length){notesList.textContent='Žádné dostupné běžné cloudové poznámky.';return;}
    for(const item of nejvetsi)radek(notesList,item.title,`~ ${format(item.bytes)}`);
  }
  async function nacti(){
    if(inFlight) return;
    const request=++generation;
    inFlight=true;refreshButton.disabled=true;
    zmenStav('Načítám aktuální spotřebu ze serveru…');
    try {
      if(window.LubaNoteStorageScope?.ziskejAktivni?.()==='local'){
        reset(); zmenStav('Pouze místní úložiště – data se do cloudové kvóty nepočítají.');return;
      }
      if(!navigator.onLine){zmenStav('Jsi offline. Údaje lze obnovit po připojení.');return;}
      const ok=await window.LubaNoteSupabase?.pripravClient?.();
      if(!ok||typeof supabaseClient==='undefined'||!supabaseClient){zmenStav('Cloudové úložiště není dostupné.');return;}
      const {data:auth,error:authError}=await supabaseClient.auth.getSession();
      if(authError||!auth?.session?.user){reset();zmenStav('Je potřeba přihlášení.');return;}
      const userId=auth.session.user.id;
      const {data,error}=await supabaseClient.rpc('lubanote_get_account_cloud_usage_v1');
      if(request!==generation||modal.hidden)return;
      const current=await supabaseClient.auth.getSession();
      if(current?.data?.session?.user?.id!==userId){reset();zmenStav('Účet se změnil. Načti údaje znovu.');return;}
      if(error||!data?.ok){reset();zmenStav(data?.reason==='account_not_active'?'Účet není aktivní.':'Server nevrátil použitelnou kvótu.');return;}
      const used=Number(data.usage_bytes);
      const limit=data.cloud_bytes_limit==null?null:Number(data.cloud_bytes_limit);
      if(!Number.isFinite(used)||used<0||(limit!==null&&(!Number.isFinite(limit)||limit<=0))){reset();zmenStav('Server vrátil neplatnou velikost.');return;}
      const note=Number(data.note_bytes),media=Number(data.shared_media_bytes),att=Number(data.attachment_bytes);
      const safe=v=>Number.isFinite(v)&&v>=0?v:null;
      const breakdown=[['Poznámky',data.note_bytes==null?null:safe(note)],['Sdílená média',data.shared_media_bytes==null?null:safe(media)],['Přílohy',data.attachment_bytes==null?null:safe(att)]];
      find('lnCuUsed699AR').textContent=format(used);
      find('lnCuExact699AR').textContent=`Přesně podle serverového výpočtu: ${Math.round(used).toLocaleString('cs-CZ')} B. Zaokrouhlení na MB může skrýt malé změny.`;
      find('lnCuLimit699AR').textContent=limit===null?'Bez limitu':format(limit);
      find('lnCuFree699AR').textContent=limit===null?'Bez stanoveného limitu':format(Math.max(0,limit-used));
      const percent=limit===null?0:Math.max(0,Math.min(100,Math.round(used*100/limit)));
      fill.style.width=percent+'%';bar.setAttribute('aria-valuenow',String(percent));
      categories.replaceChildren();
      for(const [name,n] of breakdown)radek(categories,name,n===null?'Nezjištěno':format(n));
      const known=breakdown.map(x=>x[1]);
      if(known.every(x=>x!==null)){
        const difference=used-known.reduce((a,b)=>a+b,0);
        if(difference>0)radek(categories,'Ostatní započítaná data',format(difference));
        if(difference< -1)radek(categories,'Rozdíl v metodice výpočtu',`−${format(-difference)}`);
      }
      const reservedBytes=data.reserved_bytes==null?null:safe(Number(data.reserved_bytes));
      reserved.textContent=reservedBytes===null?'Rezervace místa: údaj není dostupný.':`Rezervované místo: ${format(reservedBytes)} (podle serverové funkce mimo zobrazenou spotřebu).`;
      const stamp=new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      find('lnCuUpdated699AR').textContent=`Aktualizováno v ${stamp}`;
      zmenStav('Aktuální údaje ze serveru');
      if(notesDetail.open)zobrazOrientaCniPoznamky();
    }catch(_){zmenStav('Načtení selhalo. Zkus Aktualizovat.');}
    finally{if(request===generation){inFlight=false;refreshButton.disabled=false;}}
  }
  function zavri(){
    generation++;inFlight=false;refreshButton.disabled=false;
    modal.hidden=true;
    try{lastFocus?.focus?.({preventScroll:true});}catch(_){}
  }
  function otevri(){
    lastFocus=document.activeElement;
    modal.hidden=false;
    notesDetail.open=false;
    vykresliStav();reset();
    closeButton.focus();
    void nacti();
  }
  closeButton.addEventListener('click',zavri);
  refreshButton.addEventListener('click',()=>void nacti());
  notesDetail.addEventListener('toggle',()=>{if(notesDetail.open)zobrazOrientaCniPoznamky();});
  modal.addEventListener('click',e=>{if(e.target===modal)zavri();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!modal.hidden){e.stopImmediatePropagation();e.preventDefault();zavri();}
  },true);
  const predchoziBack699AR=window.LubaNoteZpracujAndroidZpet;
  window.LubaNoteZpracujAndroidZpet=function(){
    if(!modal.hidden){zavri();return true;}
    return typeof predchoziBack699AR==='function'?predchoziBack699AR():false;
  };
  window.LubaNoteCloudUsage699AR=Object.freeze({otevri,zavri,aktualizuj:nacti});
})();
