// 699D-CP: isolated Web Push delivery worker. Does not use FCM APK tokens.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const base = (process.env.SUPABASE_URL || '').replace(/\/$/,'');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const subject = process.env.PWA_VAPID_SUBJECT || 'https://app.lubanote.com';
const keyFile = process.env.PWA_VAPID_FILE || '/data/vapid.json';
if (!/^https:\/\//.test(base) || !serviceKey || !/^https:\/\//.test(subject) && !/^mailto:/.test(subject)) {
  throw new Error('PWA worker needs HTTPS SUPABASE_URL, SERVICE_ROLE_KEY, VAPID subject');
}
async function request(pathname, body, prefer) {
  const response = await fetch(`${base}/rest/v1/${pathname}`, {
    method: 'POST',
    headers: {
      apikey:serviceKey,authorization:`Bearer ${serviceKey}`,
      'content-type':'application/json', ...(prefer ? {Prefer:prefer} : {})
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`PWA_DB_${response.status}`);
  return response.status === 204 || prefer?.includes('return=minimal') ? null : response.json();
}
function loadKeys() {
  fs.mkdirSync(path.dirname(keyFile),{recursive:true,mode:0o700});
  if (fs.existsSync(keyFile)) {
    const saved = JSON.parse(fs.readFileSync(keyFile,'utf8'));
    if (!saved?.publicKey || !saved?.privateKey) throw new Error('BAD_PWA_VAPID_FILE');
    return saved;
  }
  const generated = webpush.generateVAPIDKeys();
  // Exclusive creation: never silently replace keys on a race or restart.
  const fd = fs.openSync(keyFile,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify(generated));}
  finally {fs.closeSync(fd);}
  return generated;
}
function allowed(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.hostname === 'fcm.googleapis.com'
      && !url.port && !url.username && !url.password;
  } catch {return false;}
}
const vapid = loadKeys();
webpush.setVapidDetails(subject,vapid.publicKey,vapid.privateKey);

async function registerKey() {
  await request('lubanote_pwa_push_config_v1?on_conflict=singleton',
    {singleton:true,public_key:vapid.publicKey},'resolution=merge-duplicates,return=minimal');
}
async function ack(row,result) {
  await request('rpc/lubanote_pwa_push_ack_v1',{
    p_user_id:row.user_id,p_device_id:row.device_id,
    p_job_key:row.job_key,p_result:result
  });
}
async function deliver(row) {
  let outcome = 'retry';
  try {
    if (!allowed(row.endpoint)) outcome='invalid';
    else {
      await webpush.sendNotification({
        endpoint:row.endpoint,
        keys:{p256dh:row.p256dh,auth:row.auth_key}
      },JSON.stringify({v:1,key:row.job_key}),{
        TTL:3600,urgency:'normal',timeout:12000
      });
      outcome='sent';
    }
  } catch (error) {
    if ([404,410].includes(error?.statusCode)) outcome='invalid';
  }
  await ack(row,outcome);
  return outcome;
}
async function tick() {
  const rows = await request('rpc/lubanote_pwa_push_claim_v1',{p_limit:20});
  const results = await Promise.allSettled((Array.isArray(rows) ? rows : []).map(deliver));
  if (results.length) {
    const sent=results.filter(r=>r.status==='fulfilled'&&r.value==='sent').length;
    const invalid=results.filter(r=>r.status==='fulfilled'&&r.value==='invalid').length;
    const retry=results.length-sent-invalid;
    // No user IDs, endpoints or sensitive subscription credentials in logs.
    console.log(`PWA_PUSH_BATCH sent=${sent} invalid=${invalid} retry=${retry}`);
  }
}
await registerKey();
console.log('PWA_PUSH_WORKER_READY');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
while (!stopping) {
  try {await tick();}
  catch (error) {console.error('PWA_PUSH_TICK_ERROR',String(error?.message||error).slice(0,80));}
  await new Promise(resolve=>setTimeout(resolve,15000));
}
