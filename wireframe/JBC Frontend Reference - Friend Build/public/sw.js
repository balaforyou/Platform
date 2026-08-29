const CACHE_NAME = 'smashsync-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/index.css',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {
        // Safe fallback in case some dev files aren't fully resolved yet during install
      });
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});

// Listener for future server-driven Push Notifications
self.addEventListener('push', (e) => {
  let data = { title: 'SmashSync Alert', body: 'Session update!' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'SmashSync Alert', body: e.data.text() };
    }
  }
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { dateOfArrival: Date.now() }
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});
