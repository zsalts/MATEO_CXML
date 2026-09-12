// Service worker de Tag & View Pro.
// Subí CACHE_VERSION cada vez que cambien index.html / app.js / style.css,
// y subí igual APP_VERSION en app.js: es el número que la app muestra al lado
// del logo, así de un vistazo sabés qué versión quedó servida.
const CACHE_VERSION = 'tagview-v21';

const ASSETS = [
    './',
    './index.html',
    './nube-config.js',
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

// Cache-first sobre una caché versionada. Nada de refrescar archivos sueltos:
// hacerlo puede dejar un index.html nuevo con un app.js viejo, y con los IDs
// desfasados la app no engancha ningún botón. La versión entra completa o no
// entra: al cambiar CACHE_VERSION, el install baja todo de nuevo de una vez.
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== location.origin) return;

    event.respondWith(
        caches.open(CACHE_VERSION).then(cache =>
            cache.match(req).then(hit => {
                if (hit) return hit;
                return fetch(req)
                    .then(res => {
                        if (res && res.status === 200) cache.put(req, res.clone());
                        return res;
                    })
                    .catch(() => req.mode === 'navigate' ? cache.match('./index.html') : undefined);
            })
        )
    );
});
