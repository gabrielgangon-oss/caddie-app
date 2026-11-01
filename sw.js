/* Caddie offline cache. Bump CACHE when any precached asset changes. */
const CACHE = 'caddie-v7';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/plus-jakarta-sans-400.woff2',
  './fonts/plus-jakarta-sans-500.woff2',
  './fonts/plus-jakarta-sans-600.woff2',
  './fonts/plus-jakarta-sans-700.woff2',
  './fonts/OFL.txt',
  './images/course.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fromCache(request));
});

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async (path) => {
    try {
      const response = await fetch(new Request(path, { cache: 'reload' }));
      if (!response.ok) {
        if (path === './') return;
        throw new Error('Failed to cache ' + path + ' (' + response.status + ')');
      }
      await cache.put(path, await cleanResponse(response));
    } catch (error) {
      if (path === './') return;
      throw error;
    }
  }));
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      await cache.put(request, await cleanResponse(fresh.clone()));
    }
    return fresh;
  } catch (error) {
    if (request.mode === 'navigate') {
      const index = await cache.match('./index.html');
      if (index) return index;
    }
    throw error;
  }
}

async function cleanResponse(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
