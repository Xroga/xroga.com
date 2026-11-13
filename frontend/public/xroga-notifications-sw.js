/* Xroga Smart Notifications: only generic text reaches the OS lock screen. */
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (!data || typeof data.id !== 'string') return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === 'visible')) return;
    const title = data.title === 'Xroga task needs attention' ? data.title : 'Your Xroga task has an update';
    const link = typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/workspace';
    await self.registration.showNotification(title, {
      body: 'Open Xroga to see the details.',
      icon: '/brand/xroga-orb-mark-v2.png',
      badge: '/brand/xroga-orb-mark-v2.png',
      tag: `xroga-notification-${data.id}`,
      data: { link },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const link = event.notification.data?.link;
    const path = typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : '/workspace';
    const target = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});
