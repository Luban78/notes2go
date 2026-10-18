/* LubaNote AutoTester 689A — isolated worker, synthetic fixtures only.
 * No access to document, localStorage, IndexedDB of the application,
 * Supabase client, user account, or E2E production keys.
 * Only imports the actual shipped E2E notes module and reads shipped JS text.
 */
'use strict';
self.window = self;
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const NOTE = '33333333-3333-4333-8333-333333333333';
const OTHER_NOTE = '44444444-4444-4444-8444-444444444444';
let syntheticKey;
let rootReady = true;
const meta = {ready:true,userId:ACCOUNT,keyId:'autotester-synthetic-key-v1'};
function assert(ok, reason) {if(!ok)throw Error(reason || 'assertion_failed');}
async function shouldReject(action, code){let seen='';try{await action();}catch(e){seen=String(e?.code || e?.name || 'error');}assert(seen===code,`expected_${code}_received_${seen || 'success'}`);}
function entry(id,name,kind,status,detail,elapsed){return {id,name,kind,status,detail: String(detail || '').slice(0,230),ms:elapsed};}
async function caseRun(id,name,kind,fn){const start=performance.now();try{await fn();return entry(id,name,kind,kind==='AUDIT'?'AUDIT':'PASS','',Math.round(performance.now()-start));}catch(e){return entry(id,name,kind,'FAIL',e?.code || e?.message || 'unknown',Math.round(performance.now()-start));}}
async function initializeRealCrypto(){
  assert(Boolean(self.crypto?.subtle), 'WebCrypto_unavailable');
  syntheticKey=await crypto.subtle.importKey('raw',crypto.getRandomValues(new Uint8Array(32)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  self.LubaNoteE2ECore=Object.freeze({
    getStav:()=>({...meta,ready:rootReady}),
    pripravRootKlicProUcet:async (id)=>({...meta,ready:rootReady && id===ACCOUNT}),
    odvodDomenovyKlic:async (domain)=>{assert(domain==='private-notes-v1','wrong_domain');assert(rootReady,'root_unavailable');return syntheticKey;}
  });
  self.LubaNoteStartupDiag={zapis:()=>{}};
  importScripts('e2eNotesCrypto.js');
  assert(typeof self.LubaNoteNotesCrypto?.zasifruj==='function','real_e2e_module_not_loaded');
}
const fixture = (id=NOTE)=>({id,isSecret:false,title:'AUTOTESTER ONLY',note:'text testovacich dat',todos:[{text:'umely ukol'}]});
async function cryptoTests(){
  const tests=[];
  const add=async(id,name,fn)=>tests.push(await caseRun(id,name,'REAL',fn));
  try {await initializeRealCrypto();}catch(e){return {tests:[entry('crypto-bootstrap','Skutečný E2E modul načten','REAL','BLOCKED',e?.message || 'module_unavailable',0)], blocked:true};}
  const mod=self.LubaNoteNotesCrypto;
  await add('e2e-self','Šifrování a zpětné dešifrování – skutečný modul',async()=>{const r=await mod.selfTest(ACCOUNT);assert(r.ok===true,'selftest_not_ok');});
  await add('e2e-cloud','Cloud E2E čtení a ochranné chyby – skutečný modul',async()=>{const r=await mod.selfTestCloudRead(ACCOUNT);assert(r.ok===true,'cloud_selftest_not_ok');});
  await add('e2e-trash','E2E poznámka po přesunu do Koše',async()=>{const src={...fixture(),trashedAt:'2026-10-18T00:00:00.000Z'};const box=await mod.zasifruj(src,ACCOUNT);const plain=await mod.desifruj(box,ACCOUNT,NOTE);assert(JSON.stringify(src)===JSON.stringify(plain),'trash_content_changed');});
  await add('e2e-no-plaintext','E2E obálka neobsahuje otevřený text',async()=>{const box=await mod.zasifruj(fixture(),ACCOUNT);const asText=JSON.stringify(box);assert(!asText.includes('AUTOTESTER ONLY')&&!asText.includes('umely ukol'),'plaintext_leak');});
  await add('e2e-tamper','Změněný ciphertext je odmítnut',async()=>{const box=await mod.zasifruj(fixture(),ACCOUNT);const b=atob(box.ciphertext);const bytes=Uint8Array.from(b,c=>c.charCodeAt(0));bytes[0]^=1;const invalid={...box,ciphertext:btoa(String.fromCharCode(...bytes))};await shouldReject(()=>mod.desifruj(invalid,ACCOUNT,NOTE),'E2E_AUTH_FAILED');});
  await add('e2e-note-binding','Ciphertext nelze přiřadit jiné poznámce',async()=>{const box=await mod.zasifruj(fixture(),ACCOUNT);await shouldReject(()=>mod.desifruj(box,ACCOUNT,OTHER_NOTE),'E2E_AUTH_FAILED');});
  await add('e2e-owner-binding','Ciphertext nelze odemknout pro jiný účet',async()=>{const box=await mod.zasifruj(fixture(),ACCOUNT);await shouldReject(()=>mod.desifruj(box,OTHER_ACCOUNT,NOTE),'E2E_ROOT_LOCKED');});
  await add('e2e-no-secret','Secret nelze chybně zapsat jako běžnou E2E poznámku',async()=>{await shouldReject(()=>mod.zasifruj({...fixture(),isSecret:true},ACCOUNT),'E2E_INVALID_NOTE');});
  await add('e2e-no-rewrap','Zašifrovanou obálku nelze znovu zabalit jako plaintext',async()=>{const box=await mod.zasifruj(fixture(),ACCOUNT);await shouldReject(()=>mod.zasifruj(box,ACCOUNT),'E2E_INVALID_NOTE');});
  await add('e2e-marker','Neplatný E2E marker se nesmí ignorovat',async()=>{const bad={...fixture(),__lubanoteE2ENote:false};await shouldReject(()=>mod.pripravCloudRadkyProCteni([{id:NOTE,user_id:ACCOUNT,data:bad}],ACCOUNT),'E2E_INVALID_ENVELOPE');});
  await add('e2e-legacy','Historická nešifrovaná poznámka zůstává čitelná',async()=>{const row={id:NOTE,data:fixture()};const out=await mod.pripravCloudRadkyProCteni([row],ACCOUNT);assert(out.length===1 && out[0]===row,'legacy_modified');});
  await add('e2e-cloud-guard','E2E cloudová poznámka aktivuje ochranu zápisu',async()=>{const data=await mod.zasifruj(fixture(),ACCOUNT);await mod.pripravCloudRadkyProCteni([{id:NOTE,user_id:ACCOUNT,data}],ACCOUNT);assert(mod.jeChraneneCloudId(NOTE)===true,'missing_write_guard');});
  await add('e2e-no-root','Chybějící Root Key neumožní E2E zápis',async()=>{rootReady=false;try{await shouldReject(()=>mod.zasifruj(fixture(OTHER_NOTE),ACCOUNT),'E2E_ROOT_LOCKED');}finally{rootReady=true;}});
  return {tests,blocked:false};
}
async function source(path){const url=new URL(path,self.location.href);assert(url.origin===self.location.origin,'unexpected_file_origin');const response=await fetch(url.href,{credentials:'omit',cache:'no-store',redirect:'error'});assert(response.ok,'source_unavailable_'+path+'_'+response.status);const text=await response.text();assert(text.length>100,'source_empty_'+path);return text;}
async function codeAudits(){
  const tests=[];
  let sync,guard;
  try { [sync,guard]=await Promise.all([source('sync.js'),source('e2eDeviceGuard688T.js')]);}
  catch(e){return [entry('source-unavailable','Zdrojový kód pro audit','AUDIT','BLOCKED',e?.message || 'unavailable',0)];}
  const add=async(id,name,fn)=>tests.push(await caseRun(id,name,'AUDIT',fn));
  await add('audit-e2e-server-check','Existující poznámka: serverový E2E preflight přítomen',()=>{assert(sync.includes('overServerovouOchranuPredZapiskem688U')&&sync.includes('e2e_preflight_invalid_envelope')&&sync.includes('lubanote_get_notes_by_ids_safe'),'preflight_missing');});
  await add('audit-rotation','Kontrola změny hesla mezi zařízeními přítomna',()=>{assert(guard.includes('function blokuj(')&&guard.includes('overAktualnost')&&guard.includes('pendingSalt'),'cross_device_guard_missing');});
  await add('audit-revision','Zápis používá očekávanou serverovou revizi',()=>{assert(sync.includes('p_expected_revision:')&&sync.includes('expectedRevision'),'expected_revision_missing');});
  await add('audit-trash','Koš používá bezpečnou frontu smazání',()=>{assert(sync.includes('pridejCekajiciSmazaniHromadne')&&sync.includes('odesliCekajiciSmazaniDoSupabase'),'trash_queue_missing');});
  await add('audit-retry','Synchronizace rozpoznává odmítnutý zápis',()=>{assert(sync.includes('688U TARGET RPC REJECTED')&&sync.includes('Number(error.status) === 400'),'http_400_path_not_identified');});
  return tests;
}
const pending=[
  entry('sync-real-two-devices','Reálný sync mezi dvěma izolovanými zařízeními','INTEGRATION','NOT_TESTED','Vyžaduje oddělený testovací backend a dva testovací klienty.',0),
  entry('sync-real-trash','Reálný zápis do Koše a potvrzení revize serverem','INTEGRATION','NOT_TESTED','Statický audit není náhradou za RPC a zápis na testovací server.',0),
  entry('security-real-rotation','Změna E2E hesla na druhém zařízení','INTEGRATION','NOT_TESTED','Vyžaduje samostatné testovací účty a testovací backend.',0),
  entry('ui-real-keyboard','LubaKeyboard a posun heslového dialogu v Android APK','NATIVE','NOT_TESTED','Vyžaduje testování nativního WebView a Android klávesnice.',0)
];
let busy=false;
self.addEventListener('message',async(e)=>{
  if(e.data?.action!=='run' || busy)return;
  busy=true;
  const suite=['all','e2e','sync','ui'].includes(e.data.suite)?e.data.suite:'all';
  const tests=[];
  const emit=(r)=>{tests.push(r);self.postMessage({type:'result',result:r});};
  try{
    if(suite==='all'||suite==='e2e'){
      const result=await cryptoTests();for(const t of result.tests)emit(t);
    }
    if(suite==='all'||suite==='sync'){
      const result=await codeAudits();for(const t of result)emit(t);
    }
    for(const r of pending){if(suite==='all'||suite==='sync'&&r.id.startsWith('sync')||suite==='e2e'&&r.id.startsWith('security')||suite==='ui'&&r.id.startsWith('ui'))emit(r);}
    self.postMessage({type:'done',count:tests.length});
  }catch(error){emit(entry('internal-error','Chyba testovacího enginu','REAL','FAIL',error?.message || 'unknown',0));self.postMessage({type:'done',count:tests.length});}
  finally{busy=false;}
});
