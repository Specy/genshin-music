
console.log(self.__WB_MANIFEST)
const CACHE = "V6.7";

const FILES_TO_CACHE = [

    ];
    
importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.0.0/workbox-sw.js');

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

workbox.routing.registerRoute(
    new RegExp('/*'),
    new workbox.strategies.CacheFirst({
        cacheName: CACHE
    })
);

self.addEventListener('install', (evt) => {
    console.log('[ServiceWorker] Install');
    evt.waitUntil(
        caches.open(CACHE).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline page');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
    console.log('[ServiceWorker] Activate');
    // CODELAB: Remove previous cached data from disk.
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});