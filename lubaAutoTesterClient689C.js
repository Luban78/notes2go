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
    constructor(){this.rows=new Map();this.calls=[];this.readError=false;this.writeError=false;}
    async rpc(name,params){
      this.calls.push(name);
      if(name==='lubanote_get_notes_by_ids_safe'){
        if(this.readError)return {error:{message:'test_read_unavailable',status:503}};
        return {data:(params?.p_note_ids||[]).map(x=>this.rows.get(String(x)))
          .filter(row=>row?.user_id===OWNER).map(clone)};
      }
      if(name==='save_note_safe'){
        if(this.writeError)return {error:{message:'test_write_transport_down',status:503}};
        const key=String(params.p_id),previous=this.rows.get(key);
        if(previous && previous.user_id!==OWNER)return {error:{message:'not_owner',status:403}};
        const expected=Number(params.p_expected_revision);
        if((previous?.revision||0)!==expected)return {data:{ok:false,reason:params.p_delete?'revision_mismatch':'revision_conflict',revision:previous?.revision||0}};
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
    }],
    // 691AU: exercise the actual shipped sync.js error and retry path against
    // a strict RAM RPC. Not an offline IndexedDB persistence or device test.
    ['actual-write-retry','Produkční sync.js: výpadek zápisu RPC a bezpečné opakování',async()=>{
      const original=await protectedRow(107,4);
      const changed={...original,note:'edited_during_rpc_outage'};
      const before=clone(backend.rows.get(original.id));
      backend.writeError=true;
      const refused=await uploadLocalNoteToSupabase(changed,{vratitDetailV2:true});
      assert(refused?.ok!==true&&refused?.wrote!==true,'write_error_accepted');
      assert(backend.calls.includes('save_note_safe'),'real_write_path_not_called');
      assert(JSON.stringify(backend.rows.get(original.id))===JSON.stringify(before),'failed_write_mutated_server');
      assert(changed.note==='edited_during_rpc_outage','local_fixture_lost_after_error');
      backend.writeError=false;
      const retried=await uploadLocalNoteToSupabase(changed,{vratitDetailV2:true});
      assert(retried?.ok===true&&retried?.wrote===true,'retry_not_accepted');
      const saved=backend.rows.get(original.id);
      assert(saved?.revision===5&&saved.data?.__lubanoteE2ENote===true,'retry_revision_or_e2e_wrong');
      const plain=await self.LubaNoteNotesCrypto.desifruj(saved.data,OWNER,original.id);
      assert(plain.note===changed.note,'retry_lost_modified_text');
      assert(backend.calls.filter(x=>x==='save_note_safe').length===2,'retry_not_exactly_two_write_attempts');
    }],
    ['actual-revision-guard','Produkční sync.js: zastaralá revize nesmí přepsat novější E2E text',async()=>{
      const original=await protectedRow(108,5);
      const before=clone(backend.rows.get(original.id));
      setMeta(original.id,4); // This client's revision is stale; server is at 5.
      const edited={...original,note:'unsent_local_revision_4_edit'};
      const refused=await uploadLocalNoteToSupabase(edited,{vratitDetailV2:true});
      assert(refused?.ok!==true&&refused?.wrote!==true,'stale_revision_accepted');
      assert(backend.calls.includes('save_note_safe'),'revision_rpc_not_called');
      assert(JSON.stringify(backend.rows.get(original.id))===JSON.stringify(before),'stale_revision_overwrote_newer_cloud');
      const latest=await self.LubaNoteNotesCrypto.desifruj(before.data,OWNER,original.id);
      assert(latest.note===original.note,'server_original_changed');
      // Simulate an explicit revision reconciliation, not a real merge.
      setMeta(original.id,5);
      const retried=await uploadLocalNoteToSupabase(edited,{vratitDetailV2:true});
      assert(retried?.ok===true&&retried?.wrote===true,'write_after_revision_reconciliation_failed');
      const saved=backend.rows.get(original.id);
      assert(saved?.revision===6,'revision_after_reconciled_write_wrong');
      const plain=await self.LubaNoteNotesCrypto.desifruj(saved.data,OWNER,original.id);
      assert(plain.note===edited.note,'reconciled_write_lost_text');
    }],
    ['actual-trash-restore','Produkční sync.js: E2E Koš a obnovení přes skutečné revizní zápisy',async()=>{
      const original=await protectedRow(109,2);
      const moved={...original,trashedAt:'2026-10-21T05:00:00.000Z',updatedAt:'2026-10-21T05:01:00.000Z'};
      const trashWrite=await uploadLocalNoteToSupabase(moved,{vratitDetailV2:true});
      assert(trashWrite?.ok===true&&trashWrite?.wrote===true,'trash_write_failed');
      const trashed=backend.rows.get(original.id);
      assert(trashed?.revision===3&&trashed?.deleted_at===null,'trash_revision_wrong');
      const trashText=await self.LubaNoteNotesCrypto.desifruj(trashed.data,OWNER,original.id);
      assert(trashText.trashedAt===moved.trashedAt,'trash_field_missing');
      const restored={...original,updatedAt:'2026-10-21T05:02:00.000Z'};
      const restoreWrite=await uploadLocalNoteToSupabase(restored,{vratitDetailV2:true});
      assert(restoreWrite?.ok===true&&restoreWrite?.wrote===true,'restore_write_failed');
      const saved=backend.rows.get(original.id);
      assert(saved?.revision===4,'restore_revision_wrong');
      const plain=await self.LubaNoteNotesCrypto.desifruj(saved.data,OWNER,original.id);
      assert(!plain.trashedAt&&plain.note===original.note,'restore_reintroduced_trash_or_lost_content');
    }],
    ['actual-delete-queue-retry','Produkční sync.js: trvalé smazání přežije chybu RPC v persistentní frontě',async()=>{
      const original=await protectedRow(110,3);
      const count=pridejCekajiciSmazaniHromadne([original],'2026-10-21T05:03:00.000Z');
      assert(count===1,'tombstone_not_enqueued');
      const queue=JSON.parse(store.getItem('lubanotePendingDeletes')||'[]');
      assert(queue.length===1&&queue[0].id===original.id&&queue[0].expectedRevision===3,'queue_missing_expected_revision');
      backend.writeError=true;
      const failed=await odesliCekajiciSmazaniDoSupabase();
      assert(failed===false,'failed_delete_rpc_accepted');
      assert(backend.rows.get(original.id)?.deleted_at===null,'failed_delete_mutated_server');
      const retained=JSON.parse(store.getItem('lubanotePendingDeletes')||'[]');
      assert(retained.length===1&&!retained[0].uploadedRevision,'failed_delete_discarded_queue');
      backend.writeError=false;
      const sent=await odesliCekajiciSmazaniDoSupabase();
      assert(sent===true,'retry_delete_did_not_finish');
      const gone=backend.rows.get(original.id);
      assert(gone?.revision===4&&gone?.deleted_at,'retry_delete_tombstone_missing');
      const confirmed=JSON.parse(store.getItem('lubanotePendingDeletes')||'[]');
      assert(confirmed.length===1&&confirmed[0].uploadedRevision===4,'server_revision_not_persisted_to_queue');
      const oldDevice=await uploadLocalNoteToSupabase(original,{vratitDetailV2:true});
      assert(oldDevice?.ok!==true,'old_client_resurrected_deleted_note');
      assert(backend.rows.get(original.id).revision===4,'deleted_row_revision_changed_after_stale_upload');
    }],
    ['actual-delete-conflict','Produkční sync.js: zastaralý tombstone nesmí smazat novější revizi',async()=>{
      const original=await protectedRow(111,6);
      const before=clone(backend.rows.get(original.id));
      setMeta(original.id,5);
      assert(pridejCekajiciSmazaniHromadne([original],'2026-10-21T05:04:00.000Z')===1,'delete_conflict_queue_failed');
      const refused=await odesliCekajiciSmazaniDoSupabase();
      assert(refused===false,'stale_delete_was_accepted');
      assert(JSON.stringify(backend.rows.get(original.id))===JSON.stringify(before),'stale_delete_destroyed_newer_row');
      const queue=JSON.parse(store.getItem('lubanotePendingDeletes')||'[]');
      assert(queue.length===1&&queue[0].blockedReason==='revision_mismatch'&&queue[0].expectedRevision===5,
        'stale_delete_not_persistently_blocked');
      const calls=backend.calls.filter(x=>x==='save_note_safe').length;
      assert((await odesliCekajiciSmazaniDoSupabase())===false,'blocked_delete_retried');
      assert(backend.calls.filter(x=>x==='save_note_safe').length===calls,'blocked_tombstone_repeated_rpc');
    }]
  ];
  async function run(){
    const results=[];
    // 691AU: real sync.js can schedule an automatic follow-up after a revision
    // conflict or a tombstone enqueue. In this isolated, manually-driven test
    // runner it must not race the NEXT fixture and produce false positives.
    // Automatic retry timing, offline survival after process restart and the
    // real server are intentionally NOT covered here.
    const originalFetch=self.fetch;
    const originalXHR=self.XMLHttpRequest;
    const originalSetTimeout=self.setTimeout;
    const originalSetInterval=self.setInterval;
    const originalClearTimeout=self.clearTimeout;
    const originalClearInterval=self.clearInterval;
    let timerId=0;
    try {
      self.setTimeout=()=>++timerId;
      self.setInterval=()=>++timerId;
      self.clearTimeout=()=>{};
      self.clearInterval=()=>{};
      try {await initialize();}
      catch(error){return [{id:'actual-sync-bootstrap',name:'Načtení skutečného Sync V2 do izolovaného Workeru',kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'BLOCKED',detail:String(error?.code||error?.message||error).slice(0,230),ms:0}];}
      self.fetch=async()=>{throw Error('689C_external_network_forbidden');};
      self.XMLHttpRequest=function(){throw Error('689C_xml_http_forbidden');};
      for(const [id,name,test] of suite){
        reset();const started=performance.now();
        try{await test();results.push({id,name,kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'CLIENT_PASS',detail:'Skutečný sync.js + E2E modul; izolované RAM RPC. Neověřuje reálnou DB, offline úložiště ani dvě zařízení.',ms:Math.round(performance.now()-started)});}
        catch(error){results.push({id,name,kind:'ACTUAL_CLIENT_SYNC_RAM_BACKEND',status:'CLIENT_FAIL',detail:String(error?.code||error?.message||error).slice(0,230),ms:Math.round(performance.now()-started)});}
      }
      return results;
    } finally {
      self.fetch=originalFetch;
      self.XMLHttpRequest=originalXHR;
      self.setTimeout=originalSetTimeout;
      self.setInterval=originalSetInterval;
      self.clearTimeout=originalClearTimeout;
      self.clearInterval=originalClearInterval;
    }
  }
  self.LubaNoteAutoTesterClient689C=Object.freeze({run});
})();
