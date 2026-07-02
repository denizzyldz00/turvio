// =====================================================================
// sw.js - Servis Calisani (Service Worker)
// Uygulama kabugunu (HTML/JS/CSS/A-Frame/ikonlar) cihaza onbellekler; boylece
// ilk acilistan sonra uygulama INTERNET OLMADAN calisir. Turlar burada degil,
// IndexedDB'de saklanir (app.js). PWA olarak kurulum ve APK icin gereklidir.
// =====================================================================

const CACHE = 'turvio-vr-v1';
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'styles.css',
  'manifest.webmanifest',
  'lib/aframe.min.js',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Onbellekte varsa oradan ver (cevrimdisi); yoksa agdan dene
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
