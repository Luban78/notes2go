/* 689E: no remote requests or secrets. Test GitHub CI status parsing incl. fail-closed.
 * A standalone module used by both the in-APK UI and Actions workflow.
 */
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','lubaAutoTesterCi689E.js'),'utf8');
const h='a'.repeat(40),old='b'.repeat(40),now=Date.parse('2026-10-18T09:45:00.000Z');
const base=()=>({workflow_runs:[{id:123,head_sha:h,head_branch:'main',status:'completed',conclusion:'success',created_at:'2026-10-18T09:33:00Z'}]});
const ctx={window:{},AbortController,Date,Number,String,Object,Array,Promise,Error,setTimeout,clearTimeout,console};
let requested=[];let responder=async url=>{
  requested.push(url);
  return {ok:true,json:async()=> url.includes('/runs?')?base():{sha:h}};
};
ctx.fetch=async(url,opts)=>{
  assert.equal(opts.method,'GET');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.ok(url.startsWith('https://api.github.com/repos/Luban78/notes2go/'));
  return responder(url);
};
vm.runInNewContext(src,ctx,{filename:'lubaAutoTesterCi689E.js',timeout:5000});
const api=ctx.window.LubaNoteAutoTesterCi689E;
assert.ok(Object.isFrozen(api));
let tests=0;
const check=(name,exp,edit,commit={sha:h},time=now)=>{
  const data=base();if(edit)edit(data);
  const v=api.vyhodnot(data,commit,time);
  assert.equal(v.status,exp,name+' '+v.detail);tests++;
};
check('verified current pass','DB_PASS');
check('latest fail cannot use older pass','DB_FAIL',x=>{x.workflow_runs[0].conclusion='failure';x.workflow_runs.push({...x.workflow_runs[0],conclusion:'success',id:122})});
check('timeout','DB_FAIL',x=>{x.workflow_runs[0].conclusion='timed_out'});
check('queued','DB_BLOCKED',x=>{x.workflow_runs[0].status='queued';x.workflow_runs[0].conclusion=null});
check('cancelled','DB_BLOCKED',x=>{x.workflow_runs[0].conclusion='cancelled'});
check('sha mismatch','DB_BLOCKED',x=>{x.workflow_runs[0].head_sha=old});
check('head moved','DB_BLOCKED',null,{sha:old});
check('unknown sha','DB_BLOCKED',null,{sha:'invalid'});
check('empty runs','DB_BLOCKED',x=>{x.workflow_runs=[]});
check('missing runs','DB_BLOCKED',x=>{delete x.workflow_runs});
check('wrong branch','DB_BLOCKED',x=>{x.workflow_runs[0].head_branch='other'});
check('malformed id','DB_BLOCKED',x=>{x.workflow_runs[0].id=-1});
check('old run','DB_BLOCKED',null,{sha:h},Date.parse('2026-10-27T09:45:00Z'));
check('future run','DB_BLOCKED',x=>{x.workflow_runs[0].created_at='2026-10-19T09:33:00Z'});
check('unknown conclusion','DB_BLOCKED',x=>{x.workflow_runs[0].conclusion='other'});
check('sanitized detail','DB_PASS',x=>{x.workflow_runs[0].some_field='<script>alert(1)</script>'});
(async()=>{
 const ok=await api.zjistiStav();
 assert.equal(ok.status,'DB_PASS');assert.equal(requested.length,2);
 requested=[];responder=async()=>({ok:false,status:403});
 const err=await api.zjistiStav();assert.equal(err.status,'DB_BLOCKED');
 console.log(`AUTOTESTER 689E STATUS TEST: ${tests} cases PASS + public-only GET PASS + failure BLOCKED PASS`);
})().catch(e=>{console.error('689E FAIL',e);process.exitCode=1});
