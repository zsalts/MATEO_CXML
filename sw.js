// Service worker de Tag & View Pro.
// Subí CACHE_VERSION cada vez que cambien index.html / app.js / style.css.
const CACHE_VERSION = 'tagview-v2';

const ASSETS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './tailwind.css',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Stale-while-revalidate: abre al instante desde caché (sirve sin señal en la cancha)
// y se actualiza de fondo para el próximo arranque.
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== location.origin) return;

    event.respondWith(
        caches.open(CACHE_VERSION).then(cache =>
            cache.match(req).then(hit => {
                const fresh = fetch(req)
                    .then(res => {
                        if (res && res.status === 200) cache.put(req, res.clone());
                        return res;
                    })
                    .catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
                return hit || fresh;
            })
        )
    );
});
