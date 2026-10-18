/* LubaNote AutoTester 689B - isolated virtual sync protocol simulation.
 * Never imported by the application sync runtime; only in AutoTester's Worker.
 * REAL shipped e2eNotesCrypto.js performs every crypto action.
 * MOCK in-memory backend models expected note revision/guard semantics.
 * The mock is NOT a Postgres RPC, LubaServer integration or production sync.js.
 * Label all these cases SIM_PASS/SIM_FAIL; never claim integration PASS.
 * No fetch, storage, credentials, account, network or app state access.
 */
(() => {
  'use strict';
  const USER='11111111-1111-4111-8111-111111111111';
  const OTHER='22222222-2222-4222-8222-222222222222';
  const makeId=n=>`689b0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const expect=(condition,reason)=>{if(!condition)throw Error(reason);};
  const mod=()=>{
    const c=self.LubaNoteNotesCrypto;
    expect(Boolean(c?.zasifruj && c?.pripravCloudRadkyProCteni),'real_e2e_module_missing');
    return c;
  };
  const plain=(n,owner=USER)=>({id:makeId(n),owner, isSecret:false,title:`Fixture ${n}`,note:`synthetic ${n}`,todos:[]});
  const isProtected=data=>data?.__lubanoteE2ENote===true;
  class MockServer {
    constructor(){this.rows=new Map();this.feed=[];this.seq=0;this.calls=0;this.failRead=false;}
    async rpc(name,params,owner=USER){
      this.calls++;
      if(name==='lubanote_get_notes_by_ids_safe'){
        if(this.failRead)return {error:{message:'synthetic_failure'}};
        const ids=params?.p_note_ids||[];
        return {data:ids.map(id=>this.rows.get(id)).filter(row=>row?.user_id===owner).map(copy)};
      }
      if(name==='lubanote_get_note_changes_since'){
        const after=Number(params?.p_after_seq)||0;
        return {data:this.feed.filter(x=>x.seq>after && this.rows.get(x.note_id)?.user_id===owner).map(copy)};
      }
      if(name==='save_note_safe'){
        const id=params.p_id;
        const prev=this.rows.get(id);
        if(prev && prev.user_id!==owner)return {error:{status:403,message:'wrong_owner'}};
        if(prev && prev.revision!==Number(params.p_expected_revision))return {data:{ok:false,reason:'revision_conflict'}};
        if(!prev && Number(params.p_expected_revision)!==0)return {data:{ok:false,reason:'revision_conflict'}};
        if(prev?.deleted_at && !params.p_delete)return {data:{ok:false,reason:'note_already_deleted'}};
        if(!params.p_delete && prev && isProtected(prev.data) && !isProtected(params.p_data))return {error:{status:400,message:'e2e_downgrade_blocked'}};
        if(!params.p_delete && (!params.p_data || params.p_data.id && params.p_data.id!==id))return {error:{status:400,message:'malformed_note'}};
        const revision=(prev?.revision||0)+1;
        const deleted=params.p_delete===true;
        const row={id,user_id:owner,revision,deleted_at:deleted?'2026-10-18T00:00:00.000Z':null,
          data:deleted?(prev?.data||null):copy(params.p_data)};
        this.rows.set(id,row);
        this.feed.push({seq:++this.seq,note_id:id,revision,action:deleted?'remove':'upsert'});
        return {data:{ok:true,revision}};
      }
      return {error:{message:'unsupported_mock_rpc'}};
    }
  }
  class MockDevice {
    constructor(name,server){this.name=name;this.server=server;this.local=new Map();this.revisions=new Map();this.dirty=new Map();this.cursor=0;this.online=true;this.conflicts=[];}
    edit(note){this.local.set(note.id,copy(note));this.dirty.set(note.id,copy(note));}
    async pull(){
      if(!this.online)return false;
      const change=await this.server.rpc('lubanote_get_note_changes_since',{p_after_seq:this.cursor});
      expect(Array.isArray(change.data),'feed_not_available');
      for(const row of change.data){
        if(this.dirty.has(row.note_id))continue; // never overwrite unsent local edit
        const res=await this.server.rpc('lubanote_get_notes_by_ids_safe',{p_note_ids:[row.note_id]});
        expect(Array.isArray(res.data) && res.data.length===1,'cloud_note_missing');
        const cloud=res.data[0];
        if(cloud.deleted_at)this.local.delete(row.note_id);
        else {
          const read=await mod().pripravCloudRadkyProCteni([cloud],USER);
          this.local.set(row.note_id,copy(read[0].data));
        }
        this.revisions.set(row.note_id,cloud.revision);
      }
      const last=change.data.at(-1)?.seq;
      if(last)this.cursor=last;
      return true;
    }
    async flush(){
      if(!this.online)return {status:'OFFLINE'};
      for(const [id,local] of Array.from(this.dirty.entries())){
        const expected=this.revisions.get(id)||0;
        let protectedNow=false;
        if(expected!==0){
          const chk=await this.server.rpc('lubanote_get_notes_by_ids_safe',{p_note_ids:[id]});
          if(!Array.isArray(chk.data)||chk.data.length!==1)return {status:'DEFER',reason:'preflight_unavailable'};
          protectedNow=isProtected(chk.data[0].data);
        }
        const payload=expected===0 || protectedNow ? await mod().zasifruj(local,USER) : copy(local);
        const reply=await this.server.rpc('save_note_safe',{
          p_id:id,p_data:payload,p_expected_revision:expected,p_delete:false});
        if(reply.error)return {status:'DEFER',reason:reply.error.message};
        if(reply.data?.ok!==true){this.conflicts.push({id,reason:reply.data?.reason});return {status:'CONFLICT'};}
        this.revisions.set(id,reply.data.revision);
        this.dirty.delete(id);
      }
      return {status:'OK'};
    }
    async hardDelete(id){
      if(!this.online)return {status:'OFFLINE'};
      const expected=this.revisions.get(id)||0;
      const res=await this.server.rpc('save_note_safe',{
        p_id:id,p_expected_revision:expected,p_delete:true,p_deleted_by_device_id:this.name});
      if(res.data?.ok){this.revisions.set(id,res.data.revision);this.local.delete(id);this.dirty.delete(id);return {status:'OK'};}
      return {status:res.error?'DEFER':'CONFLICT'};
    }
  }
  const seq=[];
  async function test(id,name,fn){
    const started=performance.now();
    try{await fn();seq.push({id,name,kind:'SIMULATED_PROTOCOL+REAL_CRYPTO',status:'SIM_PASS',detail:'Model RPC v RAM; skutečný E2E modul; ne produkční sync.js ani server.',ms:Math.round(performance.now()-started)});}
    catch(error){seq.push({id,name,kind:'SIMULATED_PROTOCOL+REAL_CRYPTO',status:'SIM_FAIL',detail:String(error?.code||error?.message||'unknown').slice(0,220),ms:Math.round(performance.now()-started)});}
  }
  async function run(){
    mod();seq.length=0;
    await test('sim-create','Vytvoření E2E poznámky a potvrzení revize',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s);const n=plain(1);a.edit(n);
      expect((await a.flush()).status==='OK','create_failed');expect(s.rows.get(n.id).revision===1,'revision_not_1');
      expect(isProtected(s.rows.get(n.id).data),'not_encrypted');expect(!JSON.stringify(s.rows.get(n.id).data).includes(n.note),'plaintext_on_server');
    });
    await test('sim-two-devices','Virtuální klient A → B: cílené stažení a dešifrování',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),b=new MockDevice('B',s);const n=plain(2);a.edit(n);await a.flush();
      expect(await b.pull(),'pull_failed');expect(b.local.get(n.id)?.note===n.note,'remote_content_mismatch');expect(b.revisions.get(n.id)===1,'client_revision_mismatch');
    });
    await test('sim-edit','Změna E2E poznámky a postup revizí 1 → 2',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),b=new MockDevice('B',s);const n=plain(3);a.edit(n);await a.flush();await b.pull();
      b.edit({...b.local.get(n.id),note:'update'});expect((await b.flush()).status==='OK','edit_failed');
      await a.pull();expect(a.local.get(n.id).note==='update','updated_content_missing');
      expect(s.rows.get(n.id).revision===2,'revision_not_incremented');
    });
    await test('sim-trash','Přesun E2E poznámky do Koše na B a načtení na A',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),b=new MockDevice('B',s);const n=plain(4);a.edit(n);await a.flush();await b.pull();
      const trashTime='2026-10-18T08:00:00.000Z';b.edit({...b.local.get(n.id),trashedAt:trashTime});
      expect((await b.flush()).status==='OK','trash_upload_failed');await a.pull();
      expect(a.local.get(n.id)?.trashedAt===trashTime,'trash_marker_missing');
      expect(s.rows.get(n.id).revision===2 && isProtected(s.rows.get(n.id).data),'trash_not_e2e_revision2');
    });
    await test('sim-restore','Obnovení E2E poznámky z Koše synchronizací',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s);const n={...plain(5),trashedAt:'2026-10-18T08:00:00.000Z'};
      a.edit(n);await a.flush();const restored={...a.local.get(n.id)};delete restored.trashedAt;
      a.edit(restored);await a.flush();expect(s.rows.get(n.id).revision===2,'restore_revision');
      const out=await mod().pripravCloudRadkyProCteni([copy(s.rows.get(n.id))],USER);
      expect(out[0].data.trashedAt===undefined,'restored_still_in_trash');
    });
    await test('sim-conflict','Stará serverová revize nevytlačí novější změnu',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),b=new MockDevice('B',s);const n=plain(6);a.edit(n);await a.flush();await b.pull();
      a.edit({...n,note:'server_newer'});await a.flush();b.edit({...b.local.get(n.id),note:'offline_other'});
      const r=await b.flush();expect(r.status==='CONFLICT','stale_write_accepted');
      expect(b.dirty.has(n.id),'local_change_lost');expect(s.rows.get(n.id).revision===2,'server_changed_by_conflict');
      const out=await mod().pripravCloudRadkyProCteni([copy(s.rows.get(n.id))],USER);
      expect(out[0].data.note==='server_newer','server_payload_overwritten');
    });
    await test('sim-downgrade','Serverový model odmítne plaintext přepsání E2E',async()=>{
      const s=new MockServer();const note=plain(7),box=await mod().zasifruj(note,USER);
      await s.rpc('save_note_safe',{p_id:note.id,p_data:box,p_expected_revision:0});
      const res=await s.rpc('save_note_safe',{p_id:note.id,p_data:note,p_expected_revision:1});
      expect(res.error?.status===400,'downgrade_allowed');expect(s.rows.get(note.id).revision===1,'downgrade_changed_row');
    });
    await test('sim-offline','Offline fronta zůstane zachována a po připojení se odešle',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),n=plain(8);a.online=false;a.edit(n);
      expect((await a.flush()).status==='OFFLINE' && a.dirty.has(n.id),'offline_wrote_or_lost_change');
      expect(s.rows.size===0,'offline_server_mutated');a.online=true;
      expect((await a.flush()).status==='OK','reconnect_failed');expect(a.dirty.size===0,'queue_not_cleared');
    });
    await test('sim-preflight-fail','Nedostupný serverový preflight odloží zápis bez ztráty',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),n=plain(9);a.edit(n);await a.flush();
      a.edit({...n,note:'hold'});s.failRead=true;
      expect((await a.flush()).status==='DEFER','preflight_failure_not_deferred');
      expect(a.dirty.has(n.id),'pending_change_removed');expect(s.rows.get(n.id).revision===1,'server_changed_on_preflight_error');
    });
    await test('sim-tombstone','Trvalé smazání jako tombstone a odmítnutí starého zápisu',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),b=new MockDevice('B',s),n=plain(10);a.edit(n);await a.flush();await b.pull();
      expect((await a.hardDelete(n.id)).status==='OK','delete_failed');expect(s.rows.get(n.id).deleted_at!==null,'tombstone_missing');
      b.edit({...n,note:'stale'});expect((await b.flush()).status==='CONFLICT','deleted_note_resurrected');
      expect(b.dirty.has(n.id),'unsent_content_lost');
    });
    await test('sim-account-isolation','Jiný účet nečte ani nezapisuje testovací záznam',async()=>{
      const s=new MockServer(),n=plain(11),box=await mod().zasifruj(n,USER);
      await s.rpc('save_note_safe',{p_id:n.id,p_data:box,p_expected_revision:0},USER);
      const read=await s.rpc('lubanote_get_notes_by_ids_safe',{p_note_ids:[n.id]},OTHER);
      const write=await s.rpc('save_note_safe',{p_id:n.id,p_data:box,p_expected_revision:1},OTHER);
      expect(read.data.length===0 && write.error?.status===403,'cross_account_access_allowed');
    });
    await test('sim-feed','Změnový feed roste monotónně a obsahuje potvrzené revize',async()=>{
      const s=new MockServer(),a=new MockDevice('A',s),n=plain(12);a.edit(n);await a.flush();
      a.edit({...n,note:'revision_2'});await a.flush();
      const f=(await s.rpc('lubanote_get_note_changes_since',{p_after_seq:0})).data;
      expect(f.length===2 && f[0].seq===1 && f[1].seq===2 && f[0].revision===1 && f[1].revision===2,'feed_order_incorrect');
    });
    return seq.slice();
  }
  self.LubaNoteAutoTesterSync689B=Object.freeze({run});
})();
