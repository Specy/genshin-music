/// <reference lib="webworker" />
import { CacheFirst, NetworkFirst, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        // Serwist injects the precache manifest at this token (the `injectionPoint`).
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}
declare const self: ServiceWorkerGlobalScope;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME as string;
const CACHE = `${APP_NAME}-${process.env.NEXT_PUBLIC_SW_VERSION}`;
const IS_TAURI = process.env.NEXT_PUBLIC_IS_TAURI === "true";
const MAJOR_VERSION = 3;
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`;
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`;
console.log(`CACHE NAME: "${CACHE}"`);

// Referenced so Serwist's build finds the injection point. We intentionally keep
// runtime-only caching (precache list empty) to match the previous behavior.
const _precacheManifest = self.__SW_MANIFEST;
void _precacheManifest;

function forbiddenCachedItems(url: URL): boolean {
    return (
        url.pathname.includes("service-worker") ||
        url.pathname.includes("manifestData") ||
        url.pathname.endsWith(".json")
    );
}

const serwist = new Serwist({
    precacheEntries: [],
    precacheOptions: { cacheName: PRECACHE_CACHE },
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: IS_TAURI
        ? []
        : [
              {
                  // Catch-all (evaluated first): everything not explicitly forbidden.
                  matcher: ({ url }) => {
                      try {
                          if (forbiddenCachedItems(new URL(url))) return false;
                      } catch (e) {
                          console.error("Error caching", e);
                      }
                      return true;
                  },
                  handler: new NetworkFirst({ cacheName: RUNTIME_CACHE }),
              },
              {
                  // Audio. NOTE: shadowed by the catch-all above, preserved as in the
                  // original worker. Reorder before the catch-all if CacheFirst-for-audio
                  // is actually intended.
                  matcher: ({ url }) => {
                      try {
                          if (forbiddenCachedItems(new URL(url))) return false;
                          if (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".wav")) return true;
                      } catch (e) {
                          console.error("Error caching", e);
                      }
                      return false;
                  },
                  handler: new CacheFirst({ cacheName: RUNTIME_CACHE }),
              },
          ],
});

serwist.addEventListeners();

// Manual update prompt: the app posts { type: 'SKIP_WAITING' } when the user
// accepts an update (see src/serviceWorkerRegistration.ts + _app.tsx).
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        console.log("[ServiceWorker] skip waiting");
        self.skipWaiting();
    }
});

// On a MAJOR_VERSION cache-key change, skip waiting and refresh all open tabs.
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cacheKeys = await caches.keys();
            if (!cacheKeys.length) return console.log("Fresh install");
            const appKeys = cacheKeys.filter((e) => e.includes(APP_NAME));
            if (!appKeys.length) return console.log("Fresh install");
            const majorVersionKeys = appKeys.filter((e) => e.startsWith(`${MAJOR_VERSION}`));
            if (majorVersionKeys.length === 0) {
                console.log("Major version change, skipping waiting and refreshing all tabs");
                await self.skipWaiting();
                await self.clients.claim();
                const clients = await self.clients.matchAll({ type: "window" });
                clients.forEach((client) => client.navigate(client.url));
            }
        })()
    );
});

// Custom cache GC keyed on APP_NAME.
self.addEventListener("activate", (evt) => {
    console.log("[ServiceWorker] Activate");
    evt.waitUntil(
        caches.keys().then(async (keyList) => {
            await Promise.all(
                keyList.map((key) => {
                    if (!APP_NAME) {
                        console.error("APP_NAME is not defined");
                        return Promise.resolve();
                    }
                    if (key.includes(APP_NAME)) {
                        if (key.includes("precache"))
                            return key !== PRECACHE_CACHE ? caches.delete(key) : Promise.resolve();
                        if (key.includes("runtime"))
                            return key !== RUNTIME_CACHE ? caches.delete(key) : Promise.resolve();
                        return caches.delete(key);
                    }
                    if (key.includes("workbox")) return caches.delete(key);
                    return Promise.resolve();
                })
            );
            console.log("[ServiceWorker] Finished removing old caches");
        })
    );
    self.clients.claim();
});
