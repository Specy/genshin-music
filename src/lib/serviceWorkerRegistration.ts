// Port of old src/serviceWorkerRegistration.ts (~160 lines) - the manual registration half of
// Phase 5 Task 2 (see src/service-worker.ts for the worker itself, AppInit.svelte for the caller +
// update-prompt flow that wires the two halves together - AppInit's own update check already reads
// the `${APP_NAME}_repeat_update_notice` key this flow writes).
//
// UPDATE ELIGIBILITY: `navigator.serviceWorker.controller` alone cannot tell whether this page is
// stale. A navigation can be controlled by the previous worker while its network-first response
// has already loaded the newly deployed client. Before invoking `onUpdate`, this file now asks the
// waiting worker whether the client's build version differs and whether another in-scope tab is
// open. A fresh sole tab activates the worker without the pointless reload prompt; stale clients
// and multi-tab sessions preserve the manual prompt.
//
// -- old file's own top comment, unchanged --
// This optional code is used to register a service worker.
// register() is not called by default.
//
// This lets the app load faster on subsequent visits in production, and gives
// it offline capabilities. However, it also means that developers (and users)
// will only see deployed changelog on subsequent visits to a page, after all the
// existing tabs open on the page have been closed, since previously cached
// resources are updated in the background.
//
// To learn more about the benefits of this model and instructions on how to
// opt-in, read https://cra.link/PWA
//
// SUBSTITUTION 1: old's module-level `BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""` is
// gone; `base` from `$app/paths` is read directly where BASE_PATH was used (the same
// substitution Home.svelte's clearCache()/delete-cache's +page.svelte already established) -
// only one call site needs it here, `swUrl = \`${base}/service-worker.js\`` in register() below.
// Kit emits the worker at exactly that path (svelte.config.js's `kit.serviceWorker.register:
// false` + src/service-worker.ts's own header explain why Kit's default auto-registration is
// disabled in favor of this file), and `navigator.serviceWorker.register(swUrl)`'s default scope
// is the worker's own directory, i.e. `${base}/`, matching old's next.config.js
// `scope: NEXT_PUBLIC_BASE_PATH ?? '/'`.
//
// SUBSTITUTION 2: old's shouldRegister() checked `process.env.NODE_ENV === 'production'`
// (webpack/Next build-time env substitution); swapped for `!dev` from `$app/environment` - Kit's
// own equivalent production signal (the same module's `browser` export is already used the same
// way by src/routes/composer/+page.svelte). The `'serviceWorker' in navigator` half is unchanged.
//
// TYPE-LEVEL TIGHTENING (zero runtime/emit difference, same rationale as $i18n/i18n.ts's
// ToStringObject `any` -> `unknown` swap): old typed registerValidSW()/checkValidServiceWorker()'s
// `config` parameter as `any` (only register()'s own signature used the real `Config` type - a
// pre-existing old inconsistency) - this project's `@typescript-eslint/no-explicit-any` is an
// error, not a warning, so both are typed `Config` here instead. Every use of `config` below is a
// property read (`.onUpdate`/`.onSuccess`) that behaves identically either way.
//
// PRESERVED QUIRKS (flagged, not tidied):
//   - The `//TODO not sure what config type is` comment above register(), verbatim.
//   - waitForPageLoad()'s Promise executor keeps an unused `reject` parameter (old never called
//     it - the promise only ever resolves); needs its own eslint-disable since old's own tooling
//     never checked this.
//   - register()'s origin check (`publicUrl.origin !== window.location.origin`) is dead code on a
//     same-origin static host (this app has always been a single-origin deploy) but old shipped
//     it, console.log and all, so it stays.
import { base } from '$app/paths';
import { dev } from '$app/environment';
import {
  isServiceWorkerUpdateStatus,
  shouldPromptForServiceWorkerUpdate,
  type ServiceWorkerUpdateStatus,
} from '$lib/serviceWorkerUpdate';

const UPDATE_STATUS_TIMEOUT_MS = 1000;
const UNKNOWN_UPDATE_STATUS: ServiceWorkerUpdateStatus = {
  currentClientIsStale: true,
  hasOtherClients: false,
};

function isLocalhost() {
  return Boolean(
    window.location.hostname === 'localhost' ||
    // [::1] is the IPv6 localhost address.
    window.location.hostname === '[::1]' ||
    // 127.0.0.0/8 are considered localhost for IPv4.
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
  );
}

function shouldRegister() {
  return !dev && 'serviceWorker' in navigator;
}

type Config = {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
};

//TODO not sure what config type is
export async function register(config?: Config) {
  if (shouldRegister()) {
    // The URL constructor is available in all browsers that support SW.
    const publicUrl = new URL(window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      // Our service worker won't work if PUBLIC_URL is on a different origin
      // from what our page is served on. This might happen if a CDN is used to
      // serve assets; see https://github.com/facebook/create-react-app/issues/2374
      return console.log('public url is not the same as window location origin');
    }
    await waitForPageLoad();
    const swUrl = `${base}/service-worker.js`;
    if (isLocalhost()) {
      // This is running on localhost. Let's check if a service worker still exists or not.
      checkValidServiceWorker(swUrl, config);

      // Add some additional logging to localhost, pointing developers to the
      // service worker/PWA documentation.
      return navigator.serviceWorker.ready.then(() => {
        console.log(
          'This web app is being served cache-first by a service ' +
            'worker. To learn more, visit https://cra.link/PWA'
        );
      });
    } else {
      console.log('sw in production');
      // Is not localhost. Just register service worker
      return registerValidSW(swUrl, config);
    }
  } else {
    console.warn('Canceling service worker registration');
  }
}

async function registerValidSW(swUrl: string, config?: Config) {
  return navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = async () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // At this point, the updated precached content has been fetched,
              // but the previous service worker will still serve the older
              // content until all client tabs are closed.
              console.log(
                'New content is available and will be used when all ' +
                  'tabs for this page are closed. See https://cra.link/PWA.'
              );

              const status = await requestUpdateStatus(installingWorker);
              if (!shouldPromptForServiceWorkerUpdate(status)) {
                console.log(
                  'The current tab already has the new content; activating the service worker ' +
                    'without a reload prompt.'
                );
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
                return;
              }

              // Execute callback only when this client is stale or another tab is open.
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // At this point, everything has been precached.
              // It's the perfect time to display a
              // "Content is cached for offline use." message.
              console.log('Content is cached for offline use.');

              // Execute callback
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

function requestUpdateStatus(worker: ServiceWorker): Promise<ServiceWorkerUpdateStatus> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (status: ServiceWorkerUpdateStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      channel.port1.onmessage = null;
      channel.port1.close();
      resolve(status);
    };
    const timeout = setTimeout(() => finish(UNKNOWN_UPDATE_STATUS), UPDATE_STATUS_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      finish(isServiceWorkerUpdateStatus(event.data) ? event.data : UNKNOWN_UPDATE_STATUS);
    };

    try {
      worker.postMessage(
        {
          type: 'GET_UPDATE_STATUS',
          clientVersion: import.meta.env.PUBLIC_SW_VERSION,
        },
        [channel.port2]
      );
    } catch {
      finish(UNKNOWN_UPDATE_STATUS);
    }
  });
}

function checkValidServiceWorker(swUrl: string, config?: Config) {
  // Check if the service worker can be found. If it can't reload the page.
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      // Ensure service worker exists, and that we really are getting a JS file.
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // No service worker found. Probably a different app. Reload the page.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker found. Proceed as normal.
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.warn('No internet connection found. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}

function waitForPageLoad(): Promise<void> {
  // Preserved from old: reject is never invoked, the promise only ever resolves (see this
  // file's header, PRESERVED QUIRKS).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, reject) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', () => resolve());
    }
  });
}
