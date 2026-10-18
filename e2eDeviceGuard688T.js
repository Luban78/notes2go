/* 688T – other-device E2E password epoch guard.
 * Only server metadata are read. Never persist passwords or crypto keys.
 * No automatic cloud upload, data deletion or IndexedDB reset here.
 * A stale device must obtain a NEW password before normal online sync.
 */
(() => {
  'use strict';
  const KLIC='lubanoteE2ETrustedEpoch688T';
  const LIMIT_MS=15000;
  let userId='';
  let blocked=false;
  let pendingSalt='';
  let mistniZmena=false;
  let lastChecked=0;
  let request=null;
  let loadedInitialSalt='';
  try { loadedInitialSalt=nactiLokalniTajneNastaveni()?.salt || ''; } catch(_e) {}

  const ulozeno=(uid)=>{
    try {
      const row=JSON.parse(localStorage.getItem(KLIC)||'null');
      return row?.uid===uid && typeof row?.salt==='string' ? row : null;
    } catch(_e) {return null;}
  };
  const uloz=(uid,salt,stav)=>{
    try {localStorage.setItem(KLIC,JSON.stringify({uid,salt,blocked:Boolean(stav)}));return true;}
    catch(_e){return false;}
  };
  const jeOnline=()=>navigator.onLine===true;
  const poznamenat=(text)=>{try{window.LubaNoteStartupDiag?.zapis?.('E2E','688T '+text);}catch(_e){}};
  const cekaniUI=()=>{
    window.dispatchEvent(new CustomEvent('lubanote:sync-state',{detail:{stav:'pending'}}));
  };
  function zobrazZamceni(){
    cekaniUI();
    // Use existing mandatory LubaNote password modal, never a system dialog.
    const onboarding=window.LubaNoteMasterPasswordOnboarding;
    if(!onboarding?.jeAktivni?.()) onboarding?.zobraz?.('zarizeni');
    const text=document.getElementById('secretUnlockDescription');
    if(text) text.textContent='Hlavní E2E heslo bylo změněno na jiném zařízení. Zadej NOVÉ heslo. Aplikace se pak bezpečně obnoví bez mazání lokálních dat.';
    const title=document.getElementById('secretUnlockTitle');
    if(title) title.textContent='E2E heslo změněno';
    poznamenat('STALE PASSWORD | MANDATORY NEW PASSWORD');
  }
  function blokuj(uid,serverSalt,oldSalt){
    blocked=true;userId=uid;pendingSalt=serverSalt;
    // Persist a stale epoch so a refresh cannot silently bypass the gate.
    uloz(uid,oldSalt||'',true);
    zobrazZamceni();
  }
  function aktualniUid(){
    try {return localStorage.getItem('lubanoteLocalOwnerUserId')||'';}catch(_e){return '';}
  }
  async function zjistiUid(requested){
    if(requested)return String(requested);
    if(userId)return userId;
    if(typeof getCurrentUser==='function'){
      try {return String((await getCurrentUser())?.id||'');}catch(_e){}
    }
    return aktualniUid();
  }
  async function doKontroly(uid){
    if(!jeOnline())return false;
    if(typeof supabaseClient==='undefined' || !supabaseClient)return false;
    const {data,error}=await supabaseClient.from('secret_settings')
      .select('salt,verifier,kdf_iterations').eq('user_id',uid).maybeSingle();
    if(error || !data?.salt || !data?.verifier){
      poznamenat('EPOCH READ FAILED | ONLINE FAIL CLOSED');
      return false;
    }
    const serverSalt=String(data.salt);
    const saved=ulozeno(uid);
    // Existing installations start from the PRE-REFRESH local cache.
    // Stored epoch wins over a cache that a different background task may refresh.
    const local=nactiLokalniTajneNastaveni?.();
    const knownSalt=saved?.salt || (loadedInitialSalt && (!local?.userId || local.userId===uid)
      ? loadedInitialSalt : (local?.userId===uid ? String(local?.salt||'') : ''));
    if(saved?.blocked || (knownSalt && knownSalt!==serverSalt)){
      blokuj(uid,serverSalt,knownSalt);
      return false;
    }
    if(!knownSalt){
      // New device: don't pretend to trust a key without verified media context.
      // The regular existing-device onboarding still checks that context.
      uloz(uid,serverSalt,false);
    } else if(!saved){
      uloz(uid,knownSalt,false);
    }
    userId=uid;
    return true;
  }
  async function overAktualnost(uid=null,{vynutit=false}={}){
    if(mistniZmena)return true; // source device is applying an atomic change
    if(blocked){zobrazZamceni();return false;}
    if(!jeOnline()) return false; // no ONLINE sync without online server check
    const id=await zjistiUid(uid);
    if(!id)return false;
    const stav=ulozeno(id);
    // Persisted lock still needs a fresh server read to learn the NEW salt.
    // Never allow a stale epoch marker to skip that read after a reload.
    if(stav?.blocked) vynutit=true;
    if(!vynutit && id===userId && Date.now()-lastChecked<LIMIT_MS)return true;
    if(request)return request;
    request=(async()=>{
      try {
        const ok=await doKontroly(id);
        if(ok)lastChecked=Date.now();
        return ok;
      }catch(_e){poznamenat('EPOCH CHECK ERROR | ONLINE FAIL CLOSED');return false;}
    })();
    try{return await request;}finally{request=null;}
  }
  function poNoveHesle(){
    if(!blocked)return;
    if(!pendingSalt){ // after reload, gate performs a fresh server read
      poznamenat('NO VERIFIED NEW EPOCH | RELOAD BLOCKED');return;
    }
    // Existing mandatory dialog verifies new password against live server,
    // then installs media KEK. Only at that point may trust be advanced.
    if(!window.LubaNoteMediaCrypto?.jeKlicDostupny?.()){
      poznamenat('NEW MEDIA KEK NOT READY | RELOAD BLOCKED');return;
    }
    if(!uloz(userId,pendingSalt,false)){
      poznamenat('NEW EPOCH COULD NOT PERSIST | RELOAD BLOCKED');return;
    }
    poznamenat('NEW PASSWORD ACCEPTED | RELOAD');
    window.location.reload();
  }
  function potvrdMistniZmenu(uid,novySalt){
    if(!uid || !novySalt)return false;
    const ok=uloz(uid,novySalt,false);
    if(ok){userId=uid;loadedInitialSalt=novySalt;blocked=false;pendingSalt='';lastChecked=Date.now();}
    return ok;
  }
  window.LubaNoteE2EDeviceGuard688T=Object.freeze({
    overAktualnost,jeBlokovano:()=>blocked,
    zacinaMistniZmenu:()=>{mistniZmena=true;},
    potvrdMistniZmenu,
    konciMistniZmena:()=>{mistniZmena=false;}
  });
  window.addEventListener('lubanote:master-password-ready',poNoveHesle);
  window.addEventListener('lubanote:account-active',(event)=>{
    const uid=event?.detail?.userId;
    if(uid) void overAktualnost(uid,{vynutit:true});
  });
  window.addEventListener('focus',()=>{if(jeOnline())void overAktualnost(null,{vynutit:true});});
  window.addEventListener('online',()=>{void overAktualnost(null,{vynutit:true});});
  setInterval(()=>{if(jeOnline() && document.visibilityState==='visible' && userId)
    void overAktualnost(userId,{vynutit:true});},20000);

  // Keep E2E password dialog above the own keyboard, without browser IME.
  function posunFormular(){
    const form=document.getElementById('ln688a-change-password');
    if(!form || form.style.display==='none')return;
    const lk=document.querySelector('.ln-luba-keyboard:not([hidden])');
    const height=lk ? Math.max(0,Math.round(window.innerHeight-lk.getBoundingClientRect().top)) : 0;
    form.style.setProperty('--ln688t-keyboard-bottom',`${Math.min(height,Math.round(window.innerHeight*.65))}px`);
    const active=document.activeElement;
    if(active?.closest?.('#ln688a-change-password')){
      try{active.scrollIntoView({block:'nearest',behavior:'instant'});}catch(_e){}
    }
  }
  window.addEventListener('lubanote:luba-keyboard-state',()=>{
    requestAnimationFrame(posunFormular);
    setTimeout(posunFormular,100);
  });
  window.addEventListener('resize',posunFormular);
  document.addEventListener('focusin',event=>{
    if(event.target?.closest?.('#ln688a-change-password')){
      requestAnimationFrame(posunFormular);setTimeout(posunFormular,110);
    }
  },true);
})();
