/* 699D-CT: One service worker for Web Push AND offline Android/iOS PWA shell.
   Cache contains public static app files only. E2E data, API, auth, storage,
   uploaded media and user responses are never added to Cache Storage. */
const TAP_POLL = 'LUBANOTE_PWA_REMINDER_POLL';
const TAP_ACK = 'LUBANOTE_PWA_REMINDER_ACK';
const TAP_MESSAGE = 'LUBANOTE_PWA_REMINDER_TAP';
const TAP_STATUS = 'LUBANOTE_PWA_REMINDER_STATUS_699DCS';
const TAP_DB = 'lubanote-pwa-notification-tap-699DCR';
const TAP_LIFETIME_MS = 15 * 60 * 1000;
const SHELL_WARM = 'LUBANOTE_PWA_SHELL_WARM_699DCT';
const SHELL_STATUS = 'LUBANOTE_PWA_SHELL_STATUS_699DCT';
const SHELL_CACHE = 'lubanote-pwa-app-shell-699DCT';
const SHELL_CACHE_PREFIX = 'lubanote-pwa-app-shell-';
const SHELL_ROOT = new URL(self.registration.scope);
let memoryTap = null;

// The shell must be cached BEFORE a new SW can replace working notifications.
// A failed/offline install keeps the previous SW active and unchanged.
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch(SHELL_ROOT.href,{cache:'reload',credentials:'same-origin'});
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || ''))
    throw new Error('PWA_SHELL_INSTALL_UNAVAILABLE');
  await cache.put(SHELL_ROOT.href,response);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function safeShellAsset(value) {
  try {
    const url = new URL(value,SHELL_ROOT);
    if (url.origin !== SHELL_ROOT.origin ||
        !url.pathname.startsWith(SHELL_ROOT.pathname)) return null;
    const path = url.pathname.slice(SHELL_ROOT.pathname.length);
    if (!path || path.startsWith('.') || path.includes('..') ||
        /^(?:api|auth|rest|storage|functions|rpc|user|uploads)\//i.test(path))
      return null;
    const extension = path.split('.').at(-1)?.toLowerCase();
    if (!['js','css','woff','woff2','svg','png','ico','webmanifest'].includes(extension) &&
        path !== 'index.html')
      return null;
    // User images are not app-shell assets, even when served on our origin.
    if (['svg','png','ico'].includes(extension) &&
        !/^(?:icons|assets|images\/ui)\//i.test(path)) return null;
    if (url.search && !/^\?v=[a-zA-Z0-9_.-]{1,140}$/.test(url.search)) return null;
    return url.href;
  } catch (_) {return null;}
}

async function cachedShellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  return cache.match(request,{ignoreSearch:true});
}

async function navigateWithOfflineFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const url = new URL(request.url);
      if ((url.pathname === SHELL_ROOT.pathname ||
           url.pathname === SHELL_ROOT.pathname+'index.html') && !url.search)
        await cache.put(SHELL_ROOT.href,response.clone());
    }
    return response;
  } catch (_) {
    const saved = await cache.match(SHELL_ROOT.href);
    return saved || Response.error();
  }
}

async function staticAssetWithOfflineFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' &&
        !/text\/html/i.test(response.headers.get('content-type') || '')) {
      // Cache failures (quota / private browsing) must never prevent loading.
      try {await cache.put(request,response.clone());} catch (_) {}
    }
    return response;
  } catch (_) {
    return (await cache.match(request,{ignoreSearch:true})) || Response.error();
  }
}

// Same-origin public shell only. All API / auth / sync / media requests go to
// the network or the application's existing local data store unmodified.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SHELL_ROOT.origin ||
      !url.pathname.startsWith(SHELL_ROOT.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigateWithOfflineFallback(request));
    return;
  }
  if (!['script','style','font','image','manifest'].includes(request.destination) ||
      !safeShellAsset(request.url)) return;
  event.respondWith(staticAssetWithOfflineFallback(request));
});

async function warmAppShell(urls,source) {
  const files = [...new Set((Array.isArray(urls) ? urls : [])
    .slice(0,240).map(safeShellAsset).filter(Boolean))];
  const cache = await caches.open(SHELL_CACHE);
  let cached = 0;
  let missing = 0;
  // Bounded parallelism: avoid starving sync and push while warming ~150 files.
  for (let i=0;i<files.length;i+=8) {
    const batch = await Promise.all(files.slice(i,i+8).map(async url => {
      try {
        // Most files were already cached by normal online page loads.
        // Do not re-download the whole app on every foreground transition.
        if (await cache.match(url)) return true;
        const response = await fetch(url,{cache:'reload',credentials:'same-origin'});
        const isHtml = /text\/html/i.test(response.headers.get('content-type') || '');
        if (!response.ok || response.type !== 'basic' ||
            (isHtml && !url.split('?')[0].endsWith('/index.html'))) return false;
        await cache.put(url,response);
        return true;
      } catch (_) {return false;}
    }));
    for (const ok of batch) {if (ok) cached++;else missing++;}
  }
  const ready = files.length >= 50 && missing === 0;
  if (ready) {
    // Only our old PUBLIC shell caches; never app data, media or worker tap DB.
    for (const name of await caches.keys()) {
      if (name !== SHELL_CACHE && name.startsWith(SHELL_CACHE_PREFIX))
        await caches.delete(name);
    }
  }
  try {source?.postMessage({type:SHELL_STATUS,ready,cached,missing});} catch (_) {}
}

function tapDb(mode, run) {
  return new Promise((resolve,reject) => {
    const open = indexedDB.open(TAP_DB,1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('tap'))
        open.result.createObjectStore('tap');
    };
    open.onerror = () => reject(open.error || new Error('PWA_TAP_DB_OPEN'));
    open.onsuccess = () => {
      const db = open.result;
      let tx;
      try {tx = db.transaction('tap',mode);run(tx.objectStore('tap'));}
      catch (error) {db.close();reject(error);return;}
      tx.oncomplete = () => {db.close();resolve();};
      tx.onerror = () => {db.close();reject(tx.error || new Error('PWA_TAP_DB_TX'));};
      tx.onabort = () => {db.close();reject(tx.error || new Error('PWA_TAP_DB_ABORT'));};
    };
  });
}
async function rememberTap(key) {
  const row = {key,clicked:Date.now()};
  memoryTap = row;
  try {await tapDb('readwrite',store=>store.put(row,'latest'));}
  catch (_) {/* URL and message remain as safe fallbacks. */}
}
async function readTap() {
  let saved = null;
  try {
    await tapDb('readonly',store=>{
      const req = store.get('latest');
      req.onsuccess = () => {saved=req.result || null;};
    });
  } catch (_) {saved=memoryTap;}
  if (!saved) saved=memoryTap;
  if (saved && /^[a-f0-9]{40}$/.test(saved.key || '') &&
      Number.isFinite(saved.clicked) && Date.now()-saved.clicked < TAP_LIFETIME_MS &&
      saved.clicked <= Date.now()+60000) return saved.key;
  return null;
}
async function acknowledgeTap(key) {
  if (memoryTap?.key === key) memoryTap=null;
  try {
    await tapDb('readwrite',store=>{
      const req = store.get('latest');
      req.onsuccess = () => {if (req.result?.key === key) store.delete('latest');};
    });
  } catch (_) {}
}

self.addEventListener('message',event => {
  if (!event.source?.url?.startsWith(self.registration.scope)) return;
  const type = event.data?.type;
  if (type === SHELL_WARM) {
    event.waitUntil(warmAppShell(event.data?.urls,event.source));
  } else if (type === TAP_POLL) {
    event.waitUntil((async () => {
      const key = await readTap();
      try {
        // The PWA can distinguish an old/missing SW from an empty click queue.
        // Neither the key nor any note data is present in this status message.
        event.source.postMessage({type:TAP_STATUS,revision:'699D-CS',pending:!!key});
      } catch (_) {/* Diagnostic-only reply; keep the existing tap handoff. */}
      if (key) event.source.postMessage({type:TAP_MESSAGE,key});
    })());
  } else if (type === TAP_ACK && /^[a-f0-9]{40}$/.test(event.data?.key || '')) {
    event.waitUntil(acknowledgeTap(event.data.key));
  }
});
self.addEventListener('push', event => {
  let key = '';
  try {
    const payload = event.data?.json();
    if (payload?.v === 1 && /^[a-f0-9]{24,64}$/.test(payload?.key || '')) key = payload.key;
  } catch (_) {}
  event.waitUntil(self.registration.showNotification('LubaNote · Připomínka', {
    body: 'Máš naplánovanou připomínku.',
    icon: new URL('./icons/lubanote-192.png', self.registration.scope).href,
    badge: new URL('./icons/lubanote-192.png', self.registration.scope).href,
    tag: key ? `lubanote-pwa-${key}` : 'lubanote-pwa-reminder',
    // Only an opaque hash is passed to the PWA. No title, note ID or text.
    data: {url: self.registration.scope, key}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const root = self.registration.scope;
  event.waitUntil((async () => {
    const raw = event.notification.data?.key ||
      String(event.notification.tag || '').replace(/^lubanote-pwa-/, '');
    const key = /^[a-f0-9]{40}$/.test(raw) ? raw : '';
    if (key) await rememberTap(key);
    const target = new URL(root);
    if (key) target.searchParams.set('lnPwaReminder', key);
    const clientsOpen = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = clientsOpen.find(client => client.url.startsWith(root));
    if (existing) {
      try {
        await existing.focus();
        if (key) existing.postMessage({type:TAP_MESSAGE,key});
        return;
      } catch (_) { /* Fall through to launch if the old window disappeared. */ }
    }
    const opened = await self.clients.openWindow(target.href);
    if (key) opened?.postMessage({type:TAP_MESSAGE,key});
  })());
});


