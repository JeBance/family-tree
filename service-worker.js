const CACHE_NAME = 'family-tree-v1';
const BASE_URL = '/family-tree/';

const ASSETS = [
    BASE_URL,
    BASE_URL + 'index.html',
    BASE_URL + 'styles.css',
    BASE_URL + 'app.js',
    BASE_URL + 'manifest.json',
    BASE_URL + 'icons/icon-72x72.png',
    BASE_URL + 'icons/icon-96x96.png',
    BASE_URL + 'icons/icon-128x128.png',
    BASE_URL + 'icons/icon-144x144.png',
    BASE_URL + 'icons/icon-152x152.png',
    BASE_URL + 'icons/icon-192x192.png',
    BASE_URL + 'icons/icon-384x384.png',
    BASE_URL + 'icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => 
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached);
            
            return cached || fetchPromise;
        })
    );
});
