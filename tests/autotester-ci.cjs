/* 689B: real E2E, simulated sync protocol and source audit suite as in the APK.
 * Node 20 builtins only; no application, account, DB or network access.
 * CI fails on FAIL/BLOCKED. Integration NOT_TESTED is explicitly reported.
 */
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const listeners={};
const results=[];
let done=false;
const contextGlobal={
  URL,crypto:webcrypto,performance,TextEncoder,TextDecoder,
  Uint8Array,Set,Map,Math,JSON,Date,Number,String,Array,Boolean,Object,Promise,
  Error,TypeError,atob,btoa,console
};
contextGlobal.self=contextGlobal;
contextGlobal.location=new URL('http://autotester.invalid/lubaAutoTesterWorker.js');
contextGlobal.addEventListener=(type,handler)=>{(listeners[type]??=[]).push(handler);};
contextGlobal.postMessage=(msg)=>{
  if(msg?.type==='result')results.push(msg.result);
  if(msg?.type==='done')done=true;
};
const sandbox=vm.createContext(contextGlobal);
contextGlobal.importScripts=(filename)=>{
  const safe=path.basename(filename);
  if(safe!==filename)throw Error('Cannot import from another directory');
  vm.runInContext(fs.readFileSync(path.join(root,safe),'utf8'),sandbox,{filename:safe,timeout:8000});
};
contextGlobal.fetch=async url=>{
  const parsed=new URL(url);
  if(parsed.origin!==contextGlobal.location.origin)throw Error('Network is forbidden in CI');
  const safe=decodeURIComponent(parsed.pathname.slice(1));
  if(!['sync.js','e2eDeviceGuard688T.js'].includes(safe))throw Error('File not approved: '+safe);
  const text=fs.readFileSync(path.join(root,safe),'utf8');
  return {ok:true,text:async()=>text};
};
async function main(){
  vm.runInContext(fs.readFileSync(path.join(root,'lubaAutoTesterWorker.js'),'utf8'),sandbox,{filename:'lubaAutoTesterWorker.js',timeout:8000});
  const go=listeners.message?.[0];
  if(!go)throw Error('No test-runner message handler');
  let timeLimit;
  try {
    await Promise.race([go({data:{action:'run',suite:'all'}}),new Promise((_,reject)=>{timeLimit=setTimeout(()=>reject(Error('Timeout: 30s')),30000);})]);
  } finally {clearTimeout(timeLimit);}
  if(!done)throw Error('Tester failed to send DONE');
  for(const row of results){
    console.log(`${String(row.status).padEnd(11)} ${String(row.id).padEnd(27)} ${row.detail||''}`);
  }
  const counts={};for(const row of results)counts[row.status]=(counts[row.status]||0)+1;
  console.log('AUTOTESTER',JSON.stringify(counts));
  if((counts.PASS||0)<13)throw Error('Too few real tests were run');
  if((counts.SIM_PASS||0)<12)throw Error('Too few simulated sync scenarios passed');
  if((counts.AUDIT||0)<5)throw Error('Source audits missing');
  if((counts.NOT_TESTED||0)<4)throw Error('Unimplemented scenarios not disclosed');
  if((counts.FAIL||0)||(counts.SIM_FAIL||0)||(counts.BLOCKED||0))throw Error('Regression: at least one test failed/blocked');
  console.log('AUTOTESTER 689B: actual E2E PASS, virtual protocol SIM_PASS; production backend remains NOT_TESTED.');
}
main().catch(err=>{console.error('AUTOTESTER CI FAILED:',err.message);process.exitCode=1;});
