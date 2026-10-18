/* LubaNote AutoTester 690A – on-demand isolated PostgreSQL test, controlled ONLY from APK.
 * Calls an administrator-gated LubaServer runner through Cloudflare Tunnel.
 * No GitHub API, no personal notes, no passwords, keys, content or private user IDs in reports.
 */
(() => {
  'use strict';
  const ROOT='https://autotest.lubanote.com/autotester/v1';
  const REQUIRED=['db-fixture-689d','real-rpc-689f'];
  const allowed=new Set(['DB_PASS','DB_FAIL','DB_BLOCKED']);
  const blocked=(id,reason)=>({id,name:id==='real-rpc-689f'?'Skutečné serverové RPC (689F)':'PostgreSQL DB LAB (689D)',
    kind:'ISOLATED_LUBASERVER_TEST',status:'DB_BLOCKED',ms:0,
    detail:String(reason||'server_unavailable').slice(0,220)});
  function failAll(reason){return REQUIRED.map(id=>blocked(id,reason));}
  function isActiveLubaServer(){
    try{return window.LubaNoteBackendConfig?.nactiAktivniProfil?.()?.backendId==='lubaserver';}
    catch(_){return false;}
  }
  async function getToken(){
    if(!isActiveLubaServer())throw Error('Není aktivní produkční profil LubaServer. Serverový tester nesmí použít jiný účet/backend.');
    if(typeof pripravClient==='function')await pripravClient();
    const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
    if(!client?.auth?.getSession)throw Error('Přihlášení není připraveno.');
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.access_token)throw Error('Pro serverové testy je nutné přihlášení administrátora.');
    return data.session.access_token;
  }
  async function request(path,method,token,body){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),11000);
    try{
      const res=await fetch(ROOT+path,{
        method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
        headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'},
        body:body?JSON.stringify(body):undefined,signal:controller.signal
      });
      const payload=await res.json();
      if(!payload||typeof payload!=='object')throw Error('Neplatná odpověď serveru.');
      if(res.status===409 && payload.error==='already_running' && typeof payload.run_id==='string')return payload;
      if(!res.ok || payload.ok!==true){
        const code=String(payload.error||'server_error');
        const desc={not_admin:'Účet není administrátor.',missing_or_invalid_bearer:'Neplatná session.',
          admin_auth_unavailable:'Server nemůže ověřit administrátora.',server_not_active_normal_backend:'Server není aktivní v NORMAL režimu.',
          control_point_unavailable:'Server nemá dostupný Control Point.',cooldown:'Počkej asi 30 sekund před dalším testem.'};
        throw Error(desc[code]||'Serverové testy odmítnuty ('+code.slice(0,45)+').');
      }
      return payload;
    }finally{clearTimeout(timer);}
  }
  const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  async function runLive(shouldContinue=()=>true,onProgress=()=>{}){
    const start=Date.now();
    let token;
    try{token=await getToken();}
    catch(e){return failAll(String(e.message||'auth_unavailable'));}
    try{
      onProgress('Spouštím izolované databázové testy na LubaServeru…');
      const job=await request('/start','POST',token,{suite:'all'});
      const jobId=job.run_id;
      if(!/^[a-f0-9]{24}$/.test(String(jobId||'')))return failAll('Server nevrátil ověřitelné ID běhu.');
      for(let attempts=0;attempts<110;attempts++){
        if(!shouldContinue())return failAll('Běh v aplikaci byl přerušen; serverový test může pokračovat.');
        await pause(2200);
        if(!shouldContinue())return failAll('Běh v aplikaci byl přerušen; serverový test může pokračovat.');
        const status=await request('/status','GET',token);
        if(status.run_id!==jobId)return failAll('Serverový běh byl mezitím změněn, PASS nelze potvrdit.');
        if(status.state==='completed'){
          const items=Array.isArray(status.results)?status.results:[];
          return REQUIRED.map(id=>{
            const row=items.find(x=>x?.id===id);
            if(!row||!allowed.has(row.status))return blocked(id,'Chybí potvrzený výsledek tohoto testu.');
            if(row.status==='DB_PASS' && (Number(row.count)!==(id==='db-fixture-689d'?12:22)))
              return blocked(id,'Počet úspěšných SQL kontrol není potvrzen.');
            return {id,name:row.name||id,kind:id==='real-rpc-689f'?'REAL_RPC_BODY_ISOLATED':'MODEL_POSTGRES_ISOLATED',
              status:row.status,ms:Date.now()-start,
              detail:String(row.detail||'').slice(0,250)+(id==='real-rpc-689f'?' Jde o exportovaný snapshot RPC; aktuální serverové triggery a Auth/RLS nejsou testovány.':' Testovací SQL model, nikoli produkční RPC.')};
          });
        }
        if(status.state!=='running')return failAll('Server hlásí neočekávaný stav testu.');
        if(attempts%3===0){
          const first=Array.isArray(status.results)?status.results.find(r=>r?.id==='db-fixture-689d'):null;
          onProgress(first?'PostgreSQL model dokončen · testuji skutečné serverové RPC…':'Databázové testy běží izolovaně na LubaServeru…');
        }
      }
      return failAll('Vypršel čas čekání na serverové testy. Nejde o PASS.');
    }catch(_e){
      // Do not expose tokens/network headers/stack; give actionable, fixed-size reason only.
      const message=String(_e?.message||'server_unavailable');
      const friendly=/Failed to fetch|NetworkError|fetch failed|abort/i.test(message)
        ?'Testovací server není dostupný. Zkontroluj jednorázové nastavení Cloudflare Tunnel a služby AutoTester.'
        :message;
      return failAll(friendly);
    }
  }
  window.LubaNoteAutoTesterRemote690A=Object.freeze({runLive,failAll,isActiveLubaServer});
})();
