// Bumped to v4 when src/backup.js was added to PRECACHE_URLS for the Backup button.
const CACHE = 'pocket-ledger-shell-v4';
const CACHE_PREFIX = 'pocket-ledger-shell-';

// The first five entries are the app shell; the ./src/ modules are what ./app.js
// imports at runtime and must be precached for the page to run offline after one visit.
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/parse.js',
  './src/categorise.js',
  './src/storage.js',
  './src/ui.js',
  './src/totals.js',
  './src/format.js',
  './src/backup.js', // imported by ./src/app.js for the Backup button
  // Raster app icons: added to PRECACHE_URLS so Android's installability
  // check and offline installs both find them; apple-touch-icon.png is here
  // too so iOS Safari's Home Screen add flow also works offline.
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
