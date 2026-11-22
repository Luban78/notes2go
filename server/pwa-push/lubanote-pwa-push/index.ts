// 699D-CP: Android installed PWA only. Separate from existing APK FCM relay.
// PWA sends only anonymous reminder hashes and UTC timestamps, never note content.
const BASE = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ORIGINS = new Set(['https://app.lubanote.com', 'https://test.lubanote.com', 'https://www.lubanote.com']);

function cors(request: Request): HeadersInit {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store', 'Vary': 'Origin'
  };
}
function json(request: Request, status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status, headers: {'Content-Type':'application/json',...cors(request)}
  });
}
async function userId(request: Request): Promise<string | null> {
  const bearer = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(bearer)) return null;
  const response = await fetch(`${BASE}/auth/v1/user`, {
    headers: {'Authorization':bearer,'apikey':ANON},signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const profile = await response.json().catch(() => ({}));
  return typeof profile?.id === 'string' && /^[0-9a-f-]{36}$/i.test(profile.id) ? profile.id : null;
}
async function service(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':SERVICE,'Authorization':`Bearer ${SERVICE}`,
      'Content-Type':'application/json',
      'Prefer':'return=representation'
    },
    body:body === undefined ? undefined : JSON.stringify(body),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`PWA_DB_${response.status}`);
  return response.status === 204 ? null : response.json();
}
const goodDevice = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9:_-]{8,128}$/.test(id);
function goodEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value.length < 40) return false;
  try {
    const url = new URL(value);
    // Do not let a forged subscription direct the delivery worker to intranet URLs.
    return url.protocol === 'https:' && url.hostname === 'fcm.googleapis.com'
      && url.port === '' && url.username === '' && url.password === '';
  } catch {return false;}
}
function validJobs(items: unknown): items is {k:string;t:number}[] {
  const now = Date.now();
  return Array.isArray(items) && items.length <= 400 && items.every(entry =>
    entry && typeof entry === 'object' && !Array.isArray(entry) &&
    Object.keys(entry).length === 2 &&
    typeof entry.k === 'string' && /^[a-f0-9]{24,64}$/.test(entry.k) &&
    Number.isSafeInteger(entry.t) && entry.t > now + 1000 &&
    entry.t <= now + 366 * 86400000
  );
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(request)});
  if (request.method !== 'POST') return json(request,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if (!BASE || !ANON || !SERVICE) return json(request,503,{ok:false,error:'PWA_NOT_CONFIGURED'});
  try {
    const id = await userId(request);
    if (!id) return json(request,401,{ok:false,error:'AUTH_REQUIRED'});
    const raw = await request.text();
    if (raw.length > 38000) return json(request,413,{ok:false,error:'TOO_LARGE'});
    let data: Record<string, unknown>;
    try {data = JSON.parse(raw);} catch {return json(request,400,{ok:false,error:'BAD_JSON'});}
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json(request,400,{ok:false,error:'BAD_JSON'});
    if (data.action === 'config') {
      const rows = await service('lubanote_pwa_push_config_v1?select=public_key&singleton=eq.true&limit=1');
      const key = Array.isArray(rows) ? rows[0]?.public_key : null;
      if (!key) return json(request,503,{ok:false,error:'PWA_VAPID_NOT_READY'});
      return json(request,200,{ok:true,publicKey:key});
    }
    if (!goodDevice(data.deviceId)) return json(request,400,{ok:false,error:'BAD_DEVICE'});
    if (data.action === 'subscribe') {
      const subscription = data.subscription as Record<string, unknown> | null;
      const keys = subscription?.keys as Record<string, unknown> | null;
      if (!goodEndpoint(subscription?.endpoint) ||
          typeof keys?.p256dh !== 'string' || !/^[A-Za-z0-9_-]{40,256}$/.test(keys.p256dh) ||
          typeof keys?.auth !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(keys.auth))
        return json(request,400,{ok:false,error:'BAD_SUBSCRIPTION'});
      await service('rpc/lubanote_pwa_push_register_v1','POST',{
        p_user_id:id,p_device_id:data.deviceId,
        p_endpoint:subscription.endpoint,p_p256dh:keys.p256dh,p_auth_key:keys.auth
      });
      return json(request,200,{ok:true,registered:true});
    }
    if (data.action === 'sync') {
      const revision = data.revision;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0 || !validJobs(data.jobs))
        return json(request,400,{ok:false,error:'BAD_SCHEDULE'});
      const applied = await service('rpc/lubanote_pwa_push_replace_v1','POST',{
        p_user_id:id,p_device_id:data.deviceId,p_revision:revision,
        p_jobs:data.jobs
      });
      if (applied !== true) return json(request,409,{ok:false,error:'NOT_REGISTERED_OR_OLD_REVISION'});
      return json(request,200,{ok:true,scheduled:data.jobs.length});
    }
    if (data.action === 'unsubscribe') {
      await service(`lubanote_pwa_push_subscriptions_v1?user_id=eq.${encodeURIComponent(id)}&device_id=eq.${encodeURIComponent(data.deviceId)}`,'DELETE');
      return json(request,200,{ok:true});
    }
    return json(request,400,{ok:false,error:'UNKNOWN_ACTION'});
  } catch (error) {
    const code = error instanceof Error && /^PWA_DB_\d+$/.test(error.message)
      ? error.message : 'PWA_SERVER_ERROR';
    return json(request,503,{ok:false,error:code});
  }
});
