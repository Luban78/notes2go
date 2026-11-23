/* 699D-CS: Android installed PWA push, plus anonymous tap-pipeline diagnostics.
   NO fetch/cache handling; APK/PC notifications and offline strategy unchanged. */
const TAP_POLL = 'LUBANOTE_PWA_REMINDER_POLL';
const TAP_ACK = 'LUBANOTE_PWA_REMINDER_ACK';
const TAP_MESSAGE = 'LUBANOTE_PWA_REMINDER_TAP';
const TAP_STATUS = 'LUBANOTE_PWA_REMINDER_STATUS_699DCS';
const TAP_DB = 'lubanote-pwa-notification-tap-699DCR';
const TAP_LIFETIME_MS = 15 * 60 * 1000;
let memoryTap = null;

// The previous version can otherwise remain active indefinitely while PWA
// windows exist, so its old notificationclick handler keeps opening only home.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
  if (type === TAP_POLL) {
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


