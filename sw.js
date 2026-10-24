// Service Worker — מקבל התראות על אירועים חדשים ומציג אותן גם כשהאתר סגור
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'חיפאית בתחתית', body: event.data && event.data.text() }; }
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: d.image,
    tag: d.tag,
    dir: 'rtl',
    lang: 'he',
    data: { url: d.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(d.title || 'חיפאית בתחתית', opts));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && 'navigate' in c) { await c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
