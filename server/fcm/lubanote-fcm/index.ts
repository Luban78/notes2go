// 692O: Authenticated FCM alarm projection relay. Data-only messages contain
// only timestamps, note IDs and Android notification IDs, NEVER E2E text.
const URL_BASE = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ORIGINS = new Set(['https://app.lubanote.com', 'https://test.lubanote.com', 'https://www.lubanote.com', 'https://localhost', 'http://localhost', 'capacitor://localhost']);
const MAX_DEVICES = 20;

function cors(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Cache-Control': 'no-store',
  };
}
function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...cors(req)}});
}
function serviceHeaders() {
  return {'apikey': SERVICE_KEY, 'authorization': `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json'};
}
async function authenticatedUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(auth) || !URL_BASE || !ANON_KEY) return null;
  const answer = await fetch(`${URL_BASE}/auth/v1/user`, {
    headers: {'authorization': auth, 'apikey': ANON_KEY}, signal: AbortSignal.timeout(7000)
  });
  if (!answer.ok) return null;
  const profile = await answer.json().catch(() => null);
  return typeof profile?.id === 'string' && /^[0-9a-f-]{36}$/i.test(profile.id) ? profile.id : null;
}
async function rest(path: string, method: string, body?: unknown, prefer?: string) {
  const headers: Record<string, string> = {...serviceHeaders()};
  if (prefer) headers['Prefer'] = prefer;
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error(`DB_${response.status}`);
  return response.status === 204 ? null : await response.json().catch(() => null);
}
function b64url(bytes: Uint8Array): string {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function str64(value: object) {return b64url(new TextEncoder().encode(JSON.stringify(value)));}
let cachedOAuth: {accessToken: string, until: number} | null = null;
async function oauthToken(): Promise<{token: string, projectId: string}> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') || (() => {
    const b64 = Deno.env.get('FCM_SERVICE_ACCOUNT_BASE64');
    return b64 ? atob(b64) : '';
  })();
  if (!raw) throw new Error('FCM_NOT_CONFIGURED');
  const sa = JSON.parse(raw);
  if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string' || typeof sa.project_id !== 'string') throw new Error('FCM_BAD_SERVICE_ACCOUNT');
  if (cachedOAuth && Date.now() < cachedOAuth.until) return {token:cachedOAuth.accessToken, projectId:sa.project_id};
  const parts = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(parts), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['sign']);
  const now = Math.floor(Date.now()/1000);
  const unsigned = `${str64({alg:'RS256',typ:'JWT'})}.${str64({iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})}`;
  const signed = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(signed)}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}), signal:AbortSignal.timeout(10000)});
  if (!resp.ok) throw new Error(`FCM_OAUTH_${resp.status}`);
  const data = await resp.json();
  if (typeof data.access_token !== 'string') throw new Error('FCM_BAD_OAUTH_RESPONSE');
  cachedOAuth = {accessToken:data.access_token, until:Date.now() + Math.max(60,Number(data.expires_in||3600)-180)*1000};
  return {token:cachedOAuth.accessToken, projectId:sa.project_id};
}
async function ownerHash(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId)));
  return Array.from(bytes.slice(0,8), x=>x.toString(16).padStart(2,'0')).join('');
}
async function send(token: string, auth: {token: string, projectId: string}, payload: Record<string,string>, ttl: string) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(auth.projectId)}/messages:send`, {
    method:'POST', headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},
    body:JSON.stringify({message:{token,data:payload,android:{priority:'HIGH',ttl}}}),
    signal:AbortSignal.timeout(10000)
  });
  if (response.ok) return {ok:true, invalid:false};
  const detail = await response.json().catch(() => ({}));
  const codes = (detail?.error?.details || []).map((x: any) => x?.errorCode).filter(Boolean);
  return {ok:false, invalid:codes.includes('UNREGISTERED') || codes.includes('INVALID_ARGUMENT') && response.status === 404};
}
async function sendToDevices(userId: string, deviceId: string, payload: Record<string,string>, ttl: string) {
  const devices = await rest(`lubanote_fcm_tokens?user_id=eq.${encodeURIComponent(userId)}&select=device_id,token&limit=${MAX_DEVICES}`, 'GET');
  const recipients = (Array.isArray(devices) ? devices : []).filter((d: any) => d?.device_id !== deviceId && typeof d?.token === 'string');
  if (recipients.length === 0) return {ok:true,queued:0};
  const google = await oauthToken();
  const results = await Promise.all(recipients.map(async (device: any) => {
    try {
      const result = await send(device.token,google,payload,ttl);
      if (result.invalid) await rest(`lubanote_fcm_tokens?user_id=eq.${encodeURIComponent(userId)}&token=eq.${encodeURIComponent(device.token)}`, 'DELETE');
      return result.ok;
    } catch {return false;}
  }));
  return {ok:true,queued:results.filter(Boolean).length,failed:results.filter(x => !x).length};
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:cors(req)});
  if (req.method !== 'POST') return json(req,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if (!URL_BASE || !SERVICE_KEY || !ANON_KEY) return json(req,503,{ok:false,error:'BACKEND_NOT_CONFIGURED'});
  try {
    const userId = await authenticatedUser(req);
    if (!userId) return json(req,401,{ok:false,error:'AUTH_REQUIRED'});
    const bodyText = await req.text();
    if (bodyText.length > 10000) return json(req,413,{ok:false,error:'PAYLOAD_TOO_LARGE'});
    const body = JSON.parse(bodyText);
    const action = String(body?.action || '');
    if (action === 'register') {
      const deviceId = String(body?.deviceId || '');
      const token = String(body?.token || '');
      if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(deviceId) || token.length < 30 || token.length > 4096 || !/^[\w:.-]+$/.test(token)) return json(req,400,{ok:false,error:'BAD_DEVICE'});
      await rest(`lubanote_fcm_tokens?token=eq.${encodeURIComponent(token)}`, 'DELETE');
      await rest('lubanote_fcm_tokens?on_conflict=user_id,device_id', 'POST', {user_id:userId,device_id:deviceId,token,updated_at:new Date().toISOString()}, 'resolution=merge-duplicates,return=minimal');
      return json(req,200,{ok:true,registered:true});
    }
    if (action === 'unregister') {
      const deviceId = String(body?.deviceId || '');
      if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(deviceId)) return json(req,400,{ok:false,error:'BAD_DEVICE'});
      await rest(`lubanote_fcm_tokens?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}`, 'DELETE');
      return json(req,200,{ok:true});
    }
    if (action === 'wake') {
      const deviceId = String(body?.deviceId || '');
      const rate = await rest('rpc/lubanote_fcm_allow_send', 'POST', {p_user_id:userId});
      if (rate !== true) return json(req,200,{ok:true,throttled:true,queued:0});
      return json(req,200,await sendToDevices(userId,deviceId,{kind:'lubanote_sync_pending',v:'1'},'3600s'));
    }
    if (action === 'alarm_update') {
      const deviceId = String(body?.deviceId || '');
      const noteId = String(body?.noteId || '');
      const revision = Number(body?.revision);
      const times = body?.at;
      const cancel = body?.cancel;
      const title = body?.title;
      const preview = body?.preview;
      if (deviceId && !/^[\w:-]{8,128}$/.test(deviceId)) return json(req,400,{ok:false,error:'BAD_DEVICE'});
      if (!/^[\w:-]{1,128}$/.test(noteId) || !Number.isSafeInteger(revision) || revision<=0 ||
          !Array.isArray(times) || times.length>48 || !Array.isArray(cancel) || cancel.length>128 ||
          typeof title !== 'string' || title.length>120 || typeof preview !== 'string' || preview.length>160)
        return json(req,400,{ok:false,error:'BAD_ALARM_DATA'});
      const now = Date.now();
      if (Math.abs(revision-now)>7*24*3600*1000 ||
          !times.every((t: unknown) => typeof t === 'number' && Number.isSafeInteger(t) && t>now && t<now+366*24*3600*1000) ||
          !cancel.every((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id>0 && id<2147483647))
        return json(req,400,{ok:false,error:'BAD_ALARM_TIMES'});
      const payload = {
        kind:'lubanote_alarm_update_692O',v:'1',owner:await ownerHash(userId),
        noteId,revision:String(revision),at:JSON.stringify(times),cancel:JSON.stringify(cancel),
        title,preview
      };
      if (Object.values(payload).reduce((sum,value)=>sum+value.length,0)>3300)
        return json(req,413,{ok:false,error:'ALARM_PAYLOAD_TOO_LARGE'});
      return json(req,200,await sendToDevices(userId,deviceId,payload,'604800s'));
    }
    return json(req,400,{ok:false,error:'UNKNOWN_ACTION'});
  } catch (error) {
    const code = error instanceof Error && (/^DB_\d+$|^FCM_[A-Z_0-9]+$/.test(error.message)) ? error.message : 'RELAY_ERROR';
    return json(req,503,{ok:false,error:code});
  }
});
