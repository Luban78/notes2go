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
    data: {url: self.registration.scope}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const root = self.registration.scope;
  event.waitUntil((async () => {
    const clientsOpen = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = clientsOpen.find(client => client.url.startsWith(root));
    if (existing) return existing.focus();
    return self.clients.openWindow(root);
  })());
});
