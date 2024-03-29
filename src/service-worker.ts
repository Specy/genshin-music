/* eslint-disable no-restricted-globals */
/// <reference lib="webworker" />
// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME
const CACHE = `${APP_NAME}-${process.env.NEXT_PUBLIC_SW_VERSION}`
const IS_TAURI = process.env.NEXT_PUBLIC_IS_TAURI === 'true'
console.log(`CACHE NAME: "${CACHE}"`)
declare var self: ServiceWorkerGlobalScope
clientsClaim();

const PRECACHE_MANIFEST = self.__WB_MANIFEST as unknown as Array<{ url: string, revision: string }>
const FILTERED_MANIFEST = PRECACHE_MANIFEST.filter(e => !(
	e.url.includes(".mp3") || //runtime cached
	e.url.includes(".md") ||
	e.url.includes(".json") ||
	e.url.includes("media") ||//remove images and other static files as they are runtime cached and take too long to precache
	e.url.includes("manifestData") ||//not needed
	e.url.includes("service-worker") //not needed
))
console.log("Precached files:", FILTERED_MANIFEST)
if (IS_TAURI) {

} else {
	// Precache all of the assets generated by your build process.
	setCacheNameDetails({ prefix: "", suffix: "", precache: `precache-${CACHE}`, runtime: CACHE });
	precacheAndRoute(FILTERED_MANIFEST);
	console.log("registering routes")
	registerRoute(
		new RegExp('/*'),
		new CacheFirst({
			cacheName: CACHE
		})
	);
}

// This allows the web app to trigger skipWaiting via
// registration.waiting.postMessage({type: 'SKIP_WAITING'})
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

self.addEventListener('activate', (evt) => {
	console.log('[ServiceWorker] Activate');
	//Remove previous cached data from disk.
	evt.waitUntil(
		caches.keys().then(async (keyList) => {
			const promises = await Promise.all(keyList.map((key) => {
				if (!APP_NAME) return console.error("APP_NAME is not defined")
				console.log(`Verifying cache "${key}"`)
				if (key.includes(APP_NAME)) {
					//cache of this app
					if(key.includes("precache") && key !== `precache-${CACHE}`) {
						//handle precache versions
						console.log(`[ServiceWorker] Removing old precache: "${key}"`);
						return caches.delete(key)
					}
					if(!key.includes("precache") && key !== CACHE){
						//handle runtime versions
						console.log(`[ServiceWorker] Removing old cache: "${key}"`);
						return caches.delete(key)
					}
				}
				if(key.includes("workbox")) {
					console.log(`[ServiceWorker] Removing old workbox cache: "${key}"`);
					return caches.delete(key)
				}
				//@ts-ignore
				return new Promise(resolve => resolve())
			}));
			return promises
		})
	);
	self.clients.claim();
});