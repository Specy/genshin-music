// SvelteKit auto-detects this exact path, bundles it separately with `lib: webworker` and emits
// it to `${base}/service-worker.js`. svelte.config.js's `kit.serviceWorker.register: false` is
// deliberate: the app registers the worker itself ($lib/serviceWorkerRegistration.ts) so it can
// drive its own install/update prompt — see the SKIP_WAITING listener below.
//
// Import $game/identity, never a full GameDefinition: a GameDefinition transitively pulls in that
// game's .svelte glyph components, which cannot load in this DOM-free ServiceWorkerGlobalScope.
// Rationale at GameIdentity in $lib/games/types.ts.
//
// Second, independent reason, and the one that fails SILENTLY: Kit builds this file with
// `configFile: false`, so vite-plugin-svelte is absent and RUNES CANNOT BE COMPILED HERE. Reaching
// a `.svelte.ts` module - $core/Songs/Song.svelte.ts, ComposedSong.svelte.ts and
// VsrgSong.svelte.ts since the 2026-08-06 reactive-model plan, ThemeProvider.svelte.ts,
// Instrument.svelte.ts - emits `$state(…)`
// verbatim into the bundle. `$state` is a legal JS identifier, so the build stays green and the
// worker dies at module-eval with `ReferenceError: $state is not defined`, i.e. it simply never
// installs. Nothing enforces this; keep this file's import graph to erased `import type`s, virtual
// modules and npm packages.
//
// PUBLIC_SW_VERSION must come from $env/static/public, not `import.meta.env`: Kit builds this
// file in a second, isolated Vite build that never loads the project's vite.config.ts, so its
// `envPrefix` does not apply there and `import.meta.env.PUBLIC_SW_VERSION` bakes in `undefined` —
// a cache name frozen across every deploy, which defeats the only thing the version exists for.
// $env/static/public is populated by Kit's own env scan, which that isolated build does run.
//
// `svelte-check` cannot see this file: it needs `lib: webworker` while the app project uses
// `lib: DOM` and there is no per-file override — hence tsconfig.json's "exclude", and the
// standalone type-check that covers it instead.
/// <reference lib="webworker" />
import { GAME_IDENTITY } from '$game/identity';
import { PUBLIC_SW_VERSION } from '$env/static/public';
import { CacheFirst, NetworkFirst, Serwist } from 'serwist';

declare const self: ServiceWorkerGlobalScope;

const APP_NAME = GAME_IDENTITY.storageId;
const CACHE = `${APP_NAME}-${PUBLIC_SW_VERSION}`;
const MAJOR_VERSION = 3;
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`;
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`;
console.log(`CACHE NAME: "${CACHE}"`);

function forbiddenCachedItems(url: URL): boolean {
  return (
    url.pathname.includes('service-worker') ||
    url.pathname.includes('manifestData') ||
    url.pathname.endsWith('.json')
  );
}

const serwist = new Serwist({
  precacheEntries: [],
  precacheOptions: { cacheName: PRECACHE_CACHE },
  skipWaiting: false,
  clientsClaim: true,
  runtimeCaching: [
    {
      // Catch-all (evaluated first): everything not explicitly forbidden.
      matcher: ({ url }) => {
        try {
          if (forbiddenCachedItems(new URL(url))) return false;
        } catch (e) {
          console.error('Error caching', e);
        }
        return true;
      },
      handler: new NetworkFirst({ cacheName: RUNTIME_CACHE }),
    },
    {
      // Audio. QUIRK: shadowed by the catch-all above, preserved as in the
      // original worker. Reorder before the catch-all if CacheFirst-for-audio
      // is actually intended.
      matcher: ({ url }) => {
        try {
          if (forbiddenCachedItems(new URL(url))) return false;
          if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav')) return true;
        } catch (e) {
          console.error('Error caching', e);
        }
        return false;
      },
      handler: new CacheFirst({ cacheName: RUNTIME_CACHE }),
    },
  ],
});

serwist.addEventListeners();

// Manual update prompt: the app posts { type: 'SKIP_WAITING' } when the user
// accepts an update (see $lib/serviceWorkerRegistration.ts).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] skip waiting');
    self.skipWaiting();
  }
});

// On a MAJOR_VERSION cache-key change, skip waiting and refresh all open tabs.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      if (!cacheKeys.length) return console.log('Fresh install');
      const appKeys = cacheKeys.filter((e) => e.includes(APP_NAME));
      if (!appKeys.length) return console.log('Fresh install');
      const majorVersionKeys = appKeys.filter((e) => e.startsWith(`${MAJOR_VERSION}`));
      if (majorVersionKeys.length === 0) {
        console.log('Major version change, skipping waiting and refreshing all tabs');
        await self.skipWaiting();
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
      }
    })()
  );
});

// Custom cache GC keyed on APP_NAME.
self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  evt.waitUntil(
    caches.keys().then(async (keyList) => {
      await Promise.all(
        keyList.map((key) => {
          if (!APP_NAME) {
            console.error('APP_NAME is not defined');
            return Promise.resolve();
          }
          if (key.includes(APP_NAME)) {
            if (key.includes('precache'))
              return key !== PRECACHE_CACHE ? caches.delete(key) : Promise.resolve();
            if (key.includes('runtime'))
              return key !== RUNTIME_CACHE ? caches.delete(key) : Promise.resolve();
            return caches.delete(key);
          }
          if (key.includes('workbox')) return caches.delete(key);
          return Promise.resolve();
        })
      );
      console.log('[ServiceWorker] Finished removing old caches');
    })
  );
  self.clients.claim();
});
