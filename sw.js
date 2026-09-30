// Service Worker du WW Tracker : permet d'ouvrir l'appli sans réseau.
// Stratégie : réseau d'abord (on a toujours la dernière version quand on est en ligne),
// cache en secours (hors-ligne, ou connexion trop lente / zone blanche).
// Quand tu modifies l'appli, il n'y a rien à changer ici : la nouvelle version est récupérée toute seule.

const CACHE_NAME = 'ww-tracker-v1';
const NETWORK_TIMEOUT_MS = 4000;

// Adresses (relatives au dossier où se trouve sw.js) mises en cache dès l'installation
const PRECACHE = ['./', './index.html'];

const abs = path => new URL(path, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        PRECACHE.map(path => cache.add(new Request(abs(path), { cache: 'reload' })).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Open Food Facts, lecteur ZXing, etc. : directement sur le réseau, sans passer par le cache
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event, req));
});

function fetchWithTimeout(url, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

async function networkFirst(event, req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetchWithTimeout(req.url, NETWORK_TIMEOUT_MS);
    if (res && res.ok) event.waitUntil(cache.put(req.url, res.clone()).catch(() => {}));
    return res;
  } catch (err) {
    const cached = await cache.match(req.url, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const page = (await cache.match(abs('./index.html'))) || (await cache.match(abs('./')));
      if (page) return page;
    }
    return Response.error();
  }
}
