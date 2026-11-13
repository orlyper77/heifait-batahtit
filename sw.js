// v4 — Service Worker — מקבל התראות על אירועים חדשים ומציג אותן גם כשהאתר סגור
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'חיפאית בתחתית', body: event.data && event.data.text() }; }
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',   // אייקון קטן בשורת המצב: לבן על שקוף (אנדרואיד צובע אותו)
    image: d.image,
    tag: d.tag,
    renotify: !!d.tag,
    requireInteraction: !!d.sticky,   // סיכום יומי: נשאר על המסך עד שסוגרים אותו
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : undefined,
    timestamp: Date.now(),
    dir: 'rtl',
    lang: 'he',
    data: { url: d.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(d.title || 'חיפאית בתחתית', opts));
});

// לחיצה על התראה: פותחים את האתר בכתובת של ההתראה.
// v4: קודם מביאים חלון קיים לחזית ורק אחר כך מעבירים אותו לכתובת. בגרסה הקודמת הסדר היה הפוך,
// וכשהאתר כבר היה פתוח ברקע המעבר נכשל — ההתראה נסגרה ושום דבר לא נפתח.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    let all = [];
    try { all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); } catch (_) {}
    const c = all.find(x => x.url.startsWith(self.location.origin));
    if (c) {
      try {
        const win = (await c.focus()) || c;
        try { await win.navigate(url); }
        catch (_) { win.postMessage({ type: 'open-url', url }); }   // חלון שה-SW לא שולט בו: הדף עובר לכתובת בעצמו
        return;
      } catch (_) { /* לא הצלחנו להביא את החלון לחזית — פותחים חלון חדש */ }
    }
    return self.clients.openWindow(url);
  })());
});
