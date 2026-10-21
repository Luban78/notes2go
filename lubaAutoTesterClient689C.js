/* 689C - CLIENT integration checks: load the ACTUAL shipped sync.js in
 * AutoTester's isolated Worker, replace network RPC with a strict RAM fake.
 * No real credentials, account, IndexedDB, application localStorage or DB.
 * Outcomes are CLIENT_PASS, NEVER a real LubaServer integration PASS.
 */
(() => {
  'use strict';
  const OWNER='11111111-1111-4111-8111-111111111111';
  const OTHER='22222222-2222-4222-8222-222222222222';
  const id=n=>`689c0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const assert=(condition,code)=>{if(!condition)throw Error(code||'assertion_failed');};
  const sample=n=>({id:id(n),isSecret:false,title:'TEST ONLY',note:`synthetic_${n}`,todos:[]});
  let backend=null, authReady=false, loaded=false;
  const db=new Map();
  const store={
    getItem:(k)=>db.has(String(k))?db.get(String(k)):null,
    setItem:(k,v)=>{db.set(String(k),String(v));},
    removeItem:k=>db.delete(String(k)),
    clear:()=>db.clear()
  };
  class RamBackend {
    constructor(){this.rows=new Map();this.calls=[];this.readError=false;}
    async rpc(name,params){
      this.calls.push(name);
      if(name==='lubanote_get_notes_by_ids_safe'){
        if(this.readError)return {error:{message:'test_read_unavailable',status:503}};
        return {data:(params?.p_note_ids||[]).map(x=>this.rows.get(String(x)))
          .filter(row=>row?.user_id===OWNER).map(clone)};
      }
      if(name==='save_note_safe'){
        const key=String(params.p_id),previous=this.rows.get(key);
        if(previous && previous.user_id!==OWNER)return {error:{message:'not_owner',status:403}};
        const expected=Number(params.p_expected_revision);
        if((previous?.revision||0)!==expected)return {data:{ok:false,reason:'revision_conflict',revision:previous?.revision||0}};
        if(previous?.deleted_at && !params.p_delete)return {data:{ok:false,reason:'already_deleted'}};
        const protectedOld=previous?.data?.__lubanoteE2ENote===true;
        if(protectedOld && params.p_data?.__lubanoteE2ENote!==true && !params.p_delete){
          return {error:{message:'synthetic_e2e_downgrade',status:400}};
        }
        if(!params.p_delete && (!params.p_data || typeof params.p_data!=='object'))return {error:{status:400,message:'invalid_payload'}};
        const revision=(previous?.revision||0)+1;
        this.rows.set(key,{id:key,user_id:OWNER,revision,
          deleted_at:params.p_delete?'2026-10-18T00:00:00.000Z':null,
          data:params.p_delete?(previous?.data||null):clone(params.p_data),
          updated_at:'2026-10-18T01:00:00.000Z'});
        return {data:{ok:true,revision,updated_at:'2026-10-18T01:00:00.000Z'}};
      }
      return {error:{message:'unsupported_test_rpc_'+name,status:501}};
    }
  }
  function installLocalFixtures(){
    // These names are resolved by the real sync.js, in this WORKER only.
    self.localStorage=store;
    if(typeof self.dispatchEvent!=='function')self.dispatchEvent=()=>true;
    if(typeof navigator==='undefined')self.navigator={onLine:false};
    if(typeof setTimeout==='undefined'){self.setTimeout=()=>1;self.clearTimeout=()=>{};self.setInterval=()=>1;self.clearInterval=()=>{};}
    self.document={visibilityState:'hidden',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
    self.getCurrentUser=async()=>authReady?{id:OWNER}:null;
    self.supabaseClient={rpc:(name,params)=>backend.rpc(name,params)};
    self.LubaNoteE2EDeviceGuard688T={overAktualnost:async()=>true};
    self.LubaNoteAttachmentsCloud=undefined;
    self.LubaNoteSharingNotes=undefined;
    self.LubaNoteRegularNotesStore=undefined;
    self.LubaNoteStorageScope=undefined;
    self.LubaNoteMediaCrypto={maPlaintextFotografie:()=>false};
    self.LubaNoteSyncTraffic={zacniSync:()=>{},dokonciSync:()=>{}};
    self.LubaNoteSyncStatus={setState:()=>{}};
    self.LubaNoteStorageState={ziskejReviziLokalnichZmenPoznamek:()=>0};
    self.LubaNoteStartupDiag={zapis:()=>{},zacni:()=>null,konec:()=>{}};
    self.CustomEvent=self.CustomEvent||class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
  }
  async function initialize(){
    if(loaded)return;
    assert(self.LubaNoteNotesCrypto?.zasifruj,'real_e2e_module_unavailable');
    installLocalFixtures();
    backend=new RamBackend();
    // Nothing imported from user application data: sync.js is source from APK.
    // Auth is disabled while real sync.js initializes its startup listeners.
    importScripts('sync.js');
    assert(typeof uploadLocalNoteToSupabase==='function','actual_sync_upload_not_loaded');
    assert(typeof overServerovouOchranuPredZapiskem688U==='function','actual_688U_preflight_not_loaded');
    loaded=true;
    await Promise.resolve();await Promise.resolve();
    authReady=true;
    // Deny all network reads after the worker finished asset imports.
    // Restored in finally of run() because this worker also runs other suites.
  }
  function reset(){backend=new RamBackend();db.clear();}
  function setMeta(noteId,revision){
    const key='lubanoteCloudSyncMetaV1';
    const all=JSON.parse(store.getItem(key)||'{}');
    all[noteId]={revision,localUpdatedAt:'2026-10-18T00:00:00.000Z',serverUpdatedAt:'2026-10-18T00:00:00.000Z'};
    store.setItem(key,JSON.stringify(all));
  }
  async function protectedRow(n,revision=4){
    const src=sample(n),data=await self.LubaNoteNotesCrypto.zasifruj(src,OWNER);
    backend.rows.set(src.id,{id:src.id,user_id:OWNER,revision,deleted_at:null,
      data,updated_at:'2026-10-18T00:00:00.000Z'});
    setMeta(src.id,revision);
    return src;
  }
  async function legacyRow(n,revision=2){
    const src=sample(n);
    backend.rows.set(src.id,{id:src.id,user_id:OWNER,revision,deleted_at:null,
      data:clone(src),updated_at:'2026-10-18T00:00:00.000Z'});
    setMeta(src.id,revision);
    return src;
  }
  const suite=[
    ['actual-trash','Produkční sync.js: E2E přesun do Koše',async()=>{
      const note=await protectedRow(101);
      const t='2026-10-18T01:15:00.000Z';
      const detail=await uploadLocalNoteToSupabase({...note,updatedAt:t,trashedAt:t},{vratitDetailV2:true});
      assert(detail?.ok===true,'trash_upload_not_successful:'+JSON.stringify({detail, calls:backend.calls}));
      const row=backend.rows.get(note.id);
      assert(row?.revision===5,'revision_not_5');
      assert(row?.data?.__lubanoteE2ENote===true,'e2e_downgrade');
      const decrypted=await self.LubaNoteNotesCrypto.desifruj(row.data,OWNER,note.id);
      assert(decrypted.trashedAt===t,'trash_field_missing');
      assert(backend.calls.includes('lubanote_get_notes_by_ids_safe') && backend.calls.includes('save_note_safe'),'production_preflight_not_used');
    }],
    ['actual-legacy','Produkční sync.js: stará plaintext poznámka zůstane kompatibilní',async()=>{
      const note=await legacyRow(102);
      const detail=await uploadLocalNoteToSupabase({...note,note:'legacy_changed'},{vratitDetailV2:true});
      assert(detail?.ok===true,'legacy_write_failed');
      const row=backend.rows.get(note.id);
      assert(row?.revision===3,'legacy_revision_wrong');
      assert(!row.data.__lubanoteE2ENote && row.data.note==='legacy_changed','legacy_was_migrated');
    }],
    ['actual-no-server','Produkční sync.js: chyba E2E preflight neodešle zápis',async()=>{
      const note=await protectedRow(103);
      backend.readError=true;
      const detail=await uploadLocalNoteToSupabase({...note,note:'must_not_save'},{vratitDetailV2:true});
      assert(detail?.ok!==true,'read_failure_was_accepted');
      assert(backend.calls.filter(x=>x==='save_note_safe').length===0,'save_called_after_read_error');
      assert(backend.rows.get(note.id).revision===4,'server_modified_on_read_error');
    }],
    ['actual-invalid-marker','Produkční sync.js: neplatný E2E marker je odmítnut',async()=>{
      const note=await legacyRow(104);
      const row=backend.rows.get(note.id);row.data={__lubanoteE2ENote:false};
      const detail=await uploadLocalNoteToSupabase({...note,note:'should_not_save'},{vratitDetailV2:true});
      assert(detail?.ok!==true,'invalid_marker_accepted');
      assert(backend.calls.filter(x=>x==='save_note_safe').length===0,'write_followed_invalid_marker');
    }],
    ['actual-new-e2e','Produkční sync.js: nová poznámka vznikne jako E2E',async()=>{
      const note=sample(105);
      const detail=await uploadLocalNoteToSupabase(note,{vratitDetailV2:true});
      assert(detail?.ok===true,'new_save_failed');
      assert(backend.rows.get(note.id)?.data?.__lubanoteE2ENote===true,'new_plaintext_leak');
      assert(backend.rows.get(note.id)?.revision===1,'new_revision_wrong');
    }],
    // 691AT: real shipped sync.js must NEVER upload explicit LOCAL note content.
    // The strict RAM RPC records any request; this test fails if LOCAL scope
    // accidentally enters preflight, E2E upload or cloud write path.
    ['actual-local-no-rpc','Produkční sync.js: LOCAL poznámka nevolá žádné cloudové RPC',async()=>{
      const note={...sample(106),storageScope:'local'};
      const detail=await uploadLocalNoteToSupabase(note,{vratitDetailV2:true});
      assert(detail?.ok===true && detail?.wrote===false && detail?.reason==='local_only',
        'local_scope_did_not_short_circuit_upload');
      assert(backend.calls.length===0,'local_scope_caused_remote_rpc');
      assert(backend.rows.size===0,'local_scope_created_cloud_row');
    }]
  ];
  async function run(){
    const results=[];
    try {await initialize();}
    catch(error){return [{id:'actual-sync-bootstrap',name:'Načtení skutečného Sync V2 do izolovaného Workeru',kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'BLOCKED',detail:String(error?.code||error?.message||error).slice(0,230),ms:0}];}
    const originalFetch=self.fetch;
    const originalXHR=self.XMLHttpRequest;
    try {
      self.fetch=async()=>{throw Error('689C_external_network_forbidden');};
      self.XMLHttpRequest=function(){throw Error('689C_xml_http_forbidden');};
      for(const [id,name,test] of suite){
        reset();const started=performance.now();
        try{await test();results.push({id,name,kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'CLIENT_PASS',detail:'Skutečný sync.js + E2E modul; RPC pouze v paměti. NE skutečná DB.',ms:Math.round(performance.now()-started)});}
        catch(error){results.push({id,name,kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'CLIENT_FAIL',detail:String(error?.code||error?.message||error).slice(0,230),ms:Math.round(performance.now()-started)});}
      }
      return results;
    } finally {self.fetch=originalFetch;self.XMLHttpRequest=originalXHR;}
  }
  self.LubaNoteAutoTesterClient689C=Object.freeze({run});
})();
