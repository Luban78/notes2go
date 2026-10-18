/* In-app remote adapter protocol tests. No actual network, tokens or real server. */
const fs=require('fs');const vm=require('vm');const assert=require('assert');
const file=require('path').join(__dirname,'..','lubaAutoTesterRemote690A.js');
const source=fs.readFileSync(file,'utf8');
function contextWith(responses=[], backendId='lubaserver',withToken=true){
  const calls=[];
  const fetch=async(url,opts)=>{
    calls.push({url,method:opts.method,creds:opts.credentials,body:opts.body,headers:opts.headers});
    const entry=responses.shift()||{status:500,payload:{ok:false,error:'unavailable'}};
    return {ok:entry.status>=200&&entry.status<300,status:entry.status,json:async()=>entry.payload};
  };
  const nativeSetTimeout=setTimeout;
  const context={window:{LubaNoteBackendConfig:{nactiAktivniProfil:()=>({backendId})}},
    supabaseClient:{auth:{getSession:async()=>({data:{session:withToken?{access_token:'FAKE.TEST.JWT'}:null},error:null})}},
    fetch,AbortController,Date,Promise,console,
    setTimeout:(fn,ms)=>ms===2200?setImmediate(fn):nativeSetTimeout(fn,ms),
    clearTimeout};
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.window.LubaNoteAutoTesterRemote690A,calls};
}
const id='abcdef123456abcdef123456';
const done=(rows)=>( {status:200,payload:{ok:true,run_id:id,state:'completed',results:rows}} );
const start={status:202,payload:{ok:true,run_id:id,state:'running'}};
const goodRows=[{id:'db-fixture-689d',name:'test model',status:'DB_PASS',count:12,detail:'PASS'},
  {id:'real-rpc-689f',name:'real RPC',status:'DB_PASS',count:22,detail:'PASS'}];
(async()=>{
  const c1=contextWith([start,done(goodRows)]);const r1=await c1.api.runLive();
  assert.deepEqual(Array.from(r1.map(x=>x.status)),['DB_PASS','DB_PASS']);
  assert.equal(c1.calls.length,2);assert.equal(c1.calls[0].method,'POST');
  assert.equal(c1.calls[0].url,'https://autotest.lubanote.com/autotester/v1/start');
  assert.equal(c1.calls[0].creds,'omit');assert.equal(c1.calls[0].headers.Authorization,'Bearer FAKE.TEST.JWT');
  assert.equal(c1.calls[1].method,'GET');
  console.log('PASS 01: live start→poll→2 confirmed DB_PASS, no GitHub');
  const c2=contextWith([],'cloud');const r2=await c2.api.runLive();
  assert(r2.every(x=>x.status==='DB_BLOCKED'));assert.equal(c2.calls.length,0);
  console.log('PASS 02: non-LubaServer backend blocks before network');
  const c3=contextWith([],'lubaserver',false);const r3=await c3.api.runLive();
  assert(r3.every(x=>x.status==='DB_BLOCKED'));assert.equal(c3.calls.length,0);
  console.log('PASS 03: missing session blocks before network');
  const c4=contextWith([{status:403,payload:{ok:false,error:'not_admin'}}]);const r4=await c4.api.runLive();
  assert(r4.every(x=>x.status==='DB_BLOCKED'));
  console.log('PASS 04: non-admin rejected by backend');
  const c5=contextWith([start,done([{...goodRows[0],count:11},goodRows[1]])]);const r5=await c5.api.runLive();
  assert.equal(r5[0].status,'DB_BLOCKED');assert.equal(r5[1].status,'DB_PASS');
  console.log('PASS 05: false count cannot display PASS');
  const c6=contextWith([start,done([{...goodRows[0],status:'DB_FAIL'},goodRows[1]])]);const r6=await c6.api.runLive();
  assert.equal(r6[0].status,'DB_FAIL');assert.equal(r6[1].status,'DB_PASS');
  console.log('PASS 06: one suite failed does not hide other suite result');
  const c7=contextWith([start,{status:200,payload:{ok:true,run_id:'deadbeef00000000deadbeef',state:'completed',results:goodRows}}]);const r7=await c7.api.runLive();
  assert(r7.every(x=>x.status==='DB_BLOCKED'));
  console.log('PASS 07: stale/replaced server run cannot give PASS');
  const c8=contextWith([start,done(goodRows)]);const r8=await c8.api.runLive(()=>false);
  assert(r8.every(x=>x.status==='DB_BLOCKED'));assert.equal(c8.calls.length,1);
  console.log('PASS 08: cancelled APK run does not show green');
  const c9=contextWith([{status:409,payload:{ok:false,error:'already_running',run_id:id}},done(goodRows)]);
  assert((await c9.api.runLive()).every(x=>x.status==='DB_PASS'));
  console.log('PASS 09: existing run resumed instead of double-start');
  console.log('AUTOTESTER 690A REMOTE TEST 9/9 PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
