const CACHE = 'webdrop-v3';
const STATIC = ['/', '/app.js', '/style.css', '/i18n.js', '/icon-192.svg', '/manifest.json'];
const SHARE_DB = 'webdrop-share-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('files', { autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Web Share Target: intercept POST from iOS/Android share sheet
  if (url.pathname === '/share-target' && e.request.method === 'POST') {
    e.respondWith((async () => {
      try {
        const data = await e.request.formData();
        const files = data.getAll('files').filter(f => f instanceof File);
        if (files.length) {
          const db = await openShareDb();
          await new Promise((res, rej) => {
            const tx = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            store.clear();
            files.forEach(f => store.add(f));
            tx.oncomplete = res;
            tx.onerror = rej;
          });
          db.close();
        }
        // Notify any already-open clients so they can pick up the files immediately
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(c => c.postMessage({ type: 'share-files-ready' }));
      } catch (err) {}
      return Response.redirect('/?share=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/') || url.pathname === '/qr') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
