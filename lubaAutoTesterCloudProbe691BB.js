/* LubaNote 691BB – explicit-admin, live, read-only LubaServer SYNC smoke tests.
 * Uses the application's real authenticated Supabase client and existing RPCs.
 * No insert/update/delete, no browser-local notes, no private content in reports.
 * Does NOT prove two-device sync or production write/conflict behavior.
 */
(() => {
  'use strict';
  const names=Object.freeze([
    ['server-auth','LubaServer – aktivní účet a ověřená session'],
    ['server-fingerprint','LubaServer – skutečný private SYNC fingerprint RPC'],
    ['server-manifest','LubaServer – aktuální manifest revizí bez obsahu'],
    ['server-missing-id','LubaServer – cílený dotaz na neexistující UUID'],
    ['server-targeted-read','LubaServer – cílené čtení existující běžné poznámky']
  ]);
  const kind='LIVE_LUBASERVER_READ_ONLY_691BB';
  let running=false;
  const mk=(id,name,status,detail,ms=0)=>({id,name,kind,status,detail:String(detail||'').slice(0,210),ms:Math.round(ms)});
  const blocked=why=>names.map(([id,name])=>mk(id,name,'SERVER_BLOCKED',why));
  const err=(code,status='SERVER_FAIL')=>{const e=new Error(code);e.status=status;return e;};
  const check=(ok,code)=>{if(!ok)throw err(code);};
  function client(){try{return typeof supabaseClient!=='undefined' ? supabaseClient : window.supabaseClient;}catch(_){return window.supabaseClient;}}
  // Fail closed: this module cannot invoke a write RPC, even by mistake.
  const READ_ONLY_RPC=new Set([
    'lubanote_get_private_sync_fingerprint',
    'lubanote_get_private_bootstrap_manifest',
    'lubanote_get_notes_by_ids_safe'
  ]);
  async function rpc(c,name,args){
    if(!READ_ONLY_RPC.has(name))throw err('write_rpc_forbidden');
    let timer;
    try{
      const response=await Promise.race([
        args===undefined ? c.rpc(name):c.rpc(name,args),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(err('rpc_timeout','SERVER_BLOCKED')),18000);})
      ]);
      if(response?.error){
        const code=Number(response.error.status);
        throw err(Number.isFinite(code) ? 'server_rpc_http_'+code : 'server_rpc_rejected');
      }
      check(response && Object.prototype.hasOwnProperty.call(response,'data'),'missing_rpc_data');
      return response.data;
    }catch(e){
      if(e?.status)throw e;
      throw err('rpc_unavailable','SERVER_BLOCKED');
    }finally{clearTimeout(timer);}
  }
  function activeProfile(){
    try{return window.LubaNoteBackendConfig?.nactiAktivniProfil?.()?.backendId==='lubaserver';}
    catch(_){return false;}
  }
  async function run(shouldContinue=()=>true,onProgress=()=>{}){
    if(running)return blocked('runner_already_running');
    running=true;
    const output=[];
    let c,uid,manifest=[];
    const add=async(index,task)=>{
      const [id,name]=names[index],t=performance.now();
      if(!shouldContinue()){
        output.push(mk(id,name,'SERVER_BLOCKED','run_cancelled',0));return false;
      }
      onProgress('LubaServer READ-ONLY · '+(index+1)+'/5');
      try{
        const detail=await task();
        if(!shouldContinue())throw err('run_cancelled','SERVER_BLOCKED');
        output.push(mk(id,name,'SERVER_PASS',detail,performance.now()-t));return true;
      }catch(e){
        // Never copy raw server error objects, stack, tokens or note content.
        const safeCode=(typeof e?.message==='string'&&/^[a-z0-9_-]{2,80}$/.test(e.message))?e.message:'read_only_check_failed';
        output.push(mk(id,name,e?.status==='SERVER_BLOCKED'?'SERVER_BLOCKED':'SERVER_FAIL',safeCode,performance.now()-t));
        return false;
      }
    };
    try{
      if(window.LubaNoteAdminTools?.isAllowed?.()!==true)return blocked('admin_gate_required');
      if(!activeProfile())return blocked('active_backend_not_lubaserver');
      if(!navigator.onLine)return blocked('offline_no_server_probe');
      const authOk=await add(0,async()=>{
        check(window.LubaNoteSupabase?.jeAktivniUcetPotvrzenProTentoBeh?.()===true,'account_not_active');
        c=client();check(Boolean(c?.auth?.getSession&&c?.rpc),'production_client_missing');
        const session=await c.auth.getSession();
        check(!session?.error&&Boolean(session?.data?.session?.access_token),'session_not_available');
        uid=String(session.data.session.user?.id||'');
        check(/^[0-9a-f-]{36}$/i.test(uid),'session_user_missing');
        if(typeof getCurrentUser==='function'){
          const current=await getCurrentUser();
          check(current?.id===uid,'session_user_mismatch');
        }
        return 'PASS: session a uživatel aktuálního LubaServeru ověřeni; bez zápisu.';
      });
      if(!authOk){
        for(const [id,name] of names.slice(1))output.push(mk(id,name,'SERVER_BLOCKED','requires_server_auth_preflight'));
        return output;
      }
      let noteCount=null;
      await add(1,async()=>{
        const result=await rpc(c,'lubanote_get_private_sync_fingerprint');
        const data=Array.isArray(result)?result[0]:result;
        const fingerprint=typeof data==='string'?data:data?.fingerprint;
        check(typeof fingerprint==='string'&&fingerprint.length>0,'fingerprint_invalid');
        const n=Number(data?.note_count);
        check(Number.isFinite(n)&&n>=0,'note_count_invalid');
        noteCount=n;
        return 'PASS: skutečné RPC odpovědělo; počet serverových záznamů='+n+' (bez obsahu).';
      });
      const manifestOk=await add(2,async()=>{
        manifest=await rpc(c,'lubanote_get_private_bootstrap_manifest');
        check(Array.isArray(manifest),'manifest_not_array');
        check(manifest.length<=25000,'manifest_unbounded');
        const ids=new Set();
        for(const row of manifest){
          check(typeof row?.id==='string'&&/^[0-9a-f-]{36}$/i.test(row.id),'manifest_id_invalid');
          check(!ids.has(row.id),'manifest_duplicate_id');ids.add(row.id);
          check(Number.isFinite(Number(row.revision))&&Number(row.revision)>=0,'manifest_revision_invalid');
        }
        return 'PASS: načteno '+manifest.length+' revizních metadat; kontrola formátu a duplicit; žádný obsah.';
      });
      await add(3,async()=>{
        check(typeof crypto?.randomUUID==='function','secure_random_uuid_unavailable');
        const id=crypto.randomUUID();
        const data=await rpc(c,'lubanote_get_notes_by_ids_safe',{p_note_ids:[id]});
        check(Array.isArray(data),'targeted_result_not_array');
        check(data.length===0,'unknown_uuid_returned_private_note');
        return 'PASS: skutečné cílené RPC vrátilo 0 záznamů pro nové UUID; bez zápisu.';
      });
      if(!manifestOk){
        output.push(mk(names[4][0],names[4][1],'SERVER_BLOCKED','manifest_required_for_targeted_proof'));
      }else{
        await add(4,async()=>{
          const target=manifest.find(row=>row?.is_secret!==true&&!row.deleted_at);
          if(!target)throw err('no_regular_manifest_row','SERVER_BLOCKED');
          const data=await rpc(c,'lubanote_get_notes_by_ids_safe',{p_note_ids:[target.id]});
          check(Array.isArray(data)&&data.length===1,'targeted_existing_row_not_one');
          const row=data[0];
          check(row?.id===target.id,'targeted_wrong_row');
          check(Number.isFinite(Number(row?.revision))&&Number(row.revision)>=0,'targeted_revision_invalid');
          if(String(row?.user_id||'')!==uid)throw err('targeted_user_scope_mismatch');
          if(Number(row.revision)!==Number(target.revision))
            throw err('concurrent_revision_change','SERVER_BLOCKED');
          // The returned payload stays transient in this function. Never log/store/print it.
          const encrypted=row?.data?.__lubanoteE2ENote===true;
          if(encrypted){
            check(window.LubaNoteNotesCrypto?.jeObalka?.(row.data)===true,'targeted_e2e_envelope_invalid');
          }
          return 'PASS: skutečná existující poznámka načtena přes RPC, vlastník/revize ověřeny; payload nezobrazen ani neuložen.';
        });
      }
      return output;
    }catch(_){return blocked('runner_unavailable');}
    finally{running=false;}
  }
  window.LubaNoteAutoTesterCloudProbe691BB=Object.freeze({run,blocked});
})();
