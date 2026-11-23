/* 699D-CP: Minimal service worker for Android installed PWA notifications.
   Intentionally NO fetch/cache handling: APK, PC and the app offline strategy stay unchanged. */
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
    const target = new URL(root);
    if (key) target.searchParams.set('lnPwaReminder', key);
    const clientsOpen = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = clientsOpen.find(client => client.url.startsWith(root));
    if (existing) {
      try {
        await existing.focus();
        if (key) existing.postMessage({type:'LUBANOTE_PWA_REMINDER_TAP',key});
        return;
      } catch (_) { /* Fall through to launch if the old window disappeared. */ }
    }
    const opened = await self.clients.openWindow(target.href);
    if (key) opened?.postMessage({type:'LUBANOTE_PWA_REMINDER_TAP',key});
  })());
});

