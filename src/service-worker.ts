// SvelteKit's native service-worker entry point (this exact path/name — Kit auto-detects
// src/service-worker.ts and, when present, bundles it separately with `lib: webworker`
// and emits it to `${base}/service-worker.js`). svelte.config.js's
// `kit.serviceWorker: {register: false}` (added in this same commit) stops Kit from
// auto-registering this file — Task 2 registers it manually, for the same reason old's
// next.config.js set `register: false`: this app has always driven its own install/update
// UX (see the SKIP_WAITING message listener below, and Task 2's registration + prompt).
//
// Port of old src/service-worker.ts (128 lines) — same behavior, same order, with two
// disclosed drops. Both were plumbing for `@serwist/next` (old's Next.js serwist
// integration), not caching behavior:
//   1. The `self.__SW_MANIFEST` ambient declaration + the `_precacheManifest` void-read
//      that followed it. They existed only to give `@serwist/next`'s build plugin an
//      injection point for a real precache manifest; this worker's `precacheEntries` was
//      already the literal `[]` in old (runtime-only caching), so the injection point had
//      nothing to inject. Kit's build has no equivalent injection step and nothing left
//      for one to point at.
//   2. The `IS_TAURI` branch of the `runtimeCaching` ternary. Spec §8 deletes the Tauri
//      desktop build from this migration entirely, so the ternary collapses to old's
//      non-Tauri branch unconditionally.
//
// GAME_IDENTITY (games/<id>/identity.ts, deliberately NOT games/<id>/index.ts) is one of
// two new imports versus old: this file must never import a full GameDefinition, because
// every GameDefinition transitively pulls in that game's .svelte glyph components
// (notes.svgGlyphs), and this worker runs in a DOM-free ServiceWorkerGlobalScope that
// never renders anything and can't load the Svelte runtime. See GameIdentity in
// $lib/games/types.ts for the full rationale.
//
// PUBLIC_SW_VERSION comes from $env/static/public, not raw `import.meta.env` — a deviation
// from the original plan, forced by something only empirically discoverable (both facts
// below were verified by grepping this game's actual built output, not assumed):
//   - `import.meta.env.PUBLIC_SW_VERSION` DOES work under `npm run dev` — Vite's dev
//     transform runs this file through the project's real, resolved vite.config.ts, so
//     `envPrefix: ['VITE_', 'PUBLIC_']` applies and the live value shows up.
//   - It does NOT work in the production build. SvelteKit builds src/service-worker.ts via
//     a second, fully isolated `vite.build()` call with `configFile: false`
//     (node_modules/@sveltejs/kit/src/exports/vite/build/build_service_worker.js) that
//     never loads this project's vite.config.ts and so never applies its `envPrefix` —
//     confirmed by grepping a `build:genshin` output: every emitted service-worker.js
//     baked in the literal, permanent cache name "Genshin-undefined", regardless of the
//     real timestamp scripts/buildApp.js had actually passed as PUBLIC_SW_VERSION.
// That is a real, newly-introduced defect, not a preserved old quirk — old's build
// pipeline (webpack DefinePlugin) substituted `process.env.NEXT_PUBLIC_SW_VERSION`
// uniformly across its whole bundle including its service worker, so old's equivalent
// value was real on every build that ever shipped; a cache name that never changes
// between deploys defeats the one thing PUBLIC_SW_VERSION exists for.
// $env/static/public is one of exactly three modules SvelteKit's isolated
// service-worker build allows ($service-worker, $env/static/public, $app/env/public — see
// that same file's thrown error text) and, unlike `import.meta.env`, it's populated by
// Kit's own env scan (`get_env`), which runs independently of the isolated build's skipped
// vite.config.ts — that's why it sees the real value. Its trade-off: importing a name that
// truly isn't present in `process.env` at sync/build time is a hard compile error, not
// old's silent "undefined" text (same characteristic $lib/env.ts's header describes for
// PUBLIC_IS_BETA) — acceptable here because PUBLIC_SW_VERSION is unconditionally set by
// both scripts/buildApp.js (build) and scripts/startApp.js (dev; updated in this same
// commit to also set it — it previously didn't, and unlike the isolated production build,
// this file's dev-mode transform would otherwise hard-fail the moment `$env/static/public`
// were imported without it).
//
// This file is invisible to `svelte-check` by design — see tsconfig.json's "exclude" for
// why (it needs `lib: webworker`, not the app project's `lib: DOM`) and for how it is
// instead type-checked standalone.
/// <reference lib="webworker" />
import {GAME_IDENTITY} from '$game/identity'
import {PUBLIC_SW_VERSION} from '$env/static/public'
import {CacheFirst, NetworkFirst, Serwist} from 'serwist'

declare const self: ServiceWorkerGlobalScope

const APP_NAME = GAME_IDENTITY.storageId
const CACHE = `${APP_NAME}-${PUBLIC_SW_VERSION}`
const MAJOR_VERSION = 3
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`
console.log(`CACHE NAME: "${CACHE}"`)

function forbiddenCachedItems(url: URL): boolean {
    return (
        url.pathname.includes('service-worker') ||
        url.pathname.includes('manifestData') ||
        url.pathname.endsWith('.json')
    )
}

const serwist = new Serwist({
    precacheEntries: [],
    precacheOptions: {cacheName: PRECACHE_CACHE},
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: [
        {
            // Catch-all (evaluated first): everything not explicitly forbidden.
            matcher: ({url}) => {
                try {
                    if (forbiddenCachedItems(new URL(url))) return false
                } catch (e) {
                    console.error('Error caching', e)
                }
                return true
            },
            handler: new NetworkFirst({cacheName: RUNTIME_CACHE}),
        },
        {
            // Audio. QUIRK: shadowed by the catch-all above, preserved as in the
            // original worker. Reorder before the catch-all if CacheFirst-for-audio
            // is actually intended.
            matcher: ({url}) => {
                try {
                    if (forbiddenCachedItems(new URL(url))) return false
                    if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav')) return true
                } catch (e) {
                    console.error('Error caching', e)
                }
                return false
            },
            handler: new CacheFirst({cacheName: RUNTIME_CACHE}),
        },
    ],
})

serwist.addEventListeners()

// Manual update prompt: the app posts { type: 'SKIP_WAITING' } when the user
// accepts an update (see Task 2's registration + prompt code).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[ServiceWorker] skip waiting')
        self.skipWaiting()
    }
})

// On a MAJOR_VERSION cache-key change, skip waiting and refresh all open tabs.
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cacheKeys = await caches.keys()
            if (!cacheKeys.length) return console.log('Fresh install')
            const appKeys = cacheKeys.filter((e) => e.includes(APP_NAME))
            if (!appKeys.length) return console.log('Fresh install')
            const majorVersionKeys = appKeys.filter((e) => e.startsWith(`${MAJOR_VERSION}`))
            if (majorVersionKeys.length === 0) {
                console.log('Major version change, skipping waiting and refreshing all tabs')
                await self.skipWaiting()
                await self.clients.claim()
                const clients = await self.clients.matchAll({type: 'window'})
                clients.forEach((client) => client.navigate(client.url))
            }
        })()
    )
})

// Custom cache GC keyed on APP_NAME.
self.addEventListener('activate', (evt) => {
    console.log('[ServiceWorker] Activate')
    evt.waitUntil(
        caches.keys().then(async (keyList) => {
            await Promise.all(
                keyList.map((key) => {
                    if (!APP_NAME) {
                        console.error('APP_NAME is not defined')
                        return Promise.resolve()
                    }
                    if (key.includes(APP_NAME)) {
                        if (key.includes('precache'))
                            return key !== PRECACHE_CACHE ? caches.delete(key) : Promise.resolve()
                        if (key.includes('runtime'))
                            return key !== RUNTIME_CACHE ? caches.delete(key) : Promise.resolve()
                        return caches.delete(key)
                    }
                    if (key.includes('workbox')) return caches.delete(key)
                    return Promise.resolve()
                })
            )
            console.log('[ServiceWorker] Finished removing old caches')
        })
    )
    self.clients.claim()
})
