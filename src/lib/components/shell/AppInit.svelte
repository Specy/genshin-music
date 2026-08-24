<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import isMobile from 'is-mobile';
  import { game } from '$game';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logsStore } from '$stores/LogsStore.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { themeStore } from '$stores/ThemeStore.svelte';
  import { keyBinds } from '$stores/KeybindsStore.svelte';
  import { pwaStore } from '$stores/PwaStore.svelte';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { MIDIProvider } from '$lib/providers/MIDIProvider';
  import { metronome } from '$lib/audio/Metronome';
  import { setupProtocol } from '$lib/protocol/appProtocol';
  import { browserHistoryStore } from '$stores/BrowserHistoryStore';
  import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { linkServices } from '$core/Services/globalServices';
  import { settingsService } from '$core/Services/SettingsService';
  import { fileService } from '$core/Services/FileService';
  import { checkIfneedsUpdate } from '$core/needsUpdate';
  import Analytics from '$core/Analytics';
  import { delay, setIfInTWA } from '$core/utils/Utilities';
  import { appPathname } from '$lib/utils/appPathname';
  import * as serviceWorker from '$lib/serviceWorkerRegistration';
  import {
    APP_NAME,
    APP_VERSION,
    LANG_PREFERENCE_KEY_NAME,
    UPDATE_MESSAGE,
  } from '$core/legacyConfig';
  import { AVAILABLE_LANGUAGES, i18n, setI18nLanguage, type AppLanguage } from '$i18n/i18n';
  import { t } from '$i18n/binding.svelte';
  import rotateImg from '$lib/assets/images/rotate.svg';

  // Effects-only orchestrator: no visual output except the rotate-screen
  // overlay markup below. Each block is commented with what it does.

  let isOnMobile = $state(false);

  // THE ROTATE WARNING IS NOT GLOBAL, and the list below is the whole of what it covers: the
  // editing/performance surfaces whose layout is landscape-only (a canvas with a keyboard under
  // it, a scrolling track, a rail of tools). It used to show on EVERY route but /blog, which
  // meant a phone held upright was refused the donate page, the changelog, the theme picker and
  // the blog index - pages that are just text and cards and read fine in portrait. Those now
  // render normally and get the bottom-bar menu instead (App.css' "Portrait shell" block).
  //
  // Not to be confused with the '/blog' string in the dormant home-popup wiring further down -
  // that one gates the OLD home overlay, not this.
  //
  // Typed as readonly string[] rather than a const tuple so `.includes()` takes a plain string.
  const LANDSCAPE_ONLY_ROUTES: readonly string[] = [
    '/composer',
    '/player',
    '/vsrg-composer',
    '/vsrg-player',
    '/zen-keyboard',
  ];

  // Read from $app/state's `page` (not a one-shot at mount) so a client-side navigation between
  // a warned and a de-warned route flips the overlay without a reload. page.url.pathname carries
  // the SvelteKit base prefix on no-root builds - appPathname() strips it before the route-literal
  // comparison - and a trailing slash is normalised away so a `trailingSlash: 'always'` build
  // still matches. The ORIENTATION half of the condition stays in CSS
  // (@media (orientation: portrait) on .rotate-screen).
  const isLandscapeOnlyRoute = $derived.by(() => {
    const path = appPathname(page.url.pathname).replace(/\/+$/, '');
    return LANDSCAPE_ONLY_ROUTES.includes(path === '' ? '/' : path);
  });

  // Skipped entirely on localhost (dev convenience - keep the native
  // console.error there).
  onMount(() => {
    if (window.location.hostname === 'localhost') return;
    const originalErrorLog = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      try {
        originalErrorLog(...args);
        logsStore.addLog({
          error: args.find((arg): arg is Error => arg instanceof Error),
          message: args
            .map((arg) => {
              if (arg instanceof Error) return arg.stack ?? arg.message;
              return typeof arg === 'object' ? JSON.stringify(arg, null, 4) : String(arg);
            })
            .join(' '),
        });
      } catch (error) {
        originalErrorLog('Error logging error', error);
      }
    };
    return () => {
      console.error = originalErrorLog;
    };
  });

  // Unlike the error-log override above, this one has no localhost guard.
  onMount(() => {
    const windowInterceptor = (event: ErrorEvent) => {
      const error = event.error instanceof Error ? event.error : undefined;
      logsStore.addLog({
        error,
        message: error?.stack ?? error?.message ?? event.message,
      });
    };
    window.addEventListener('error', windowInterceptor);
    return () => window.removeEventListener('error', windowInterceptor);
  });

  type VirtualKeyboard = {
    overlaysContent: boolean;
  };

  function getVirtualKeyboard(): VirtualKeyboard | undefined {
    return (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
  }

  onMount(() => {
    async function registerServiceWorker() {
      try {
        const virtualKeyboard = getVirtualKeyboard();
        if (virtualKeyboard) {
          virtualKeyboard.overlaysContent = true;
          console.warn('virtual keyboard supported');
        } else {
          console.warn('virtual keyboard not supported');
        }
        setIfInTWA();
        console.log('Registering service worker');
        await serviceWorker.register({
          onUpdate: async (registration) => {
            await delay(3000);
            // `i18n.t(...)`, not the reactive `t` from
            // $i18n/binding.svelte used elsewhere in this file:
            // this question is resolved once at call time, not
            // re-rendered on language change.
            const shouldUpdate = await asyncConfirm(i18n.t('logs:update_available'), false);
            if (!shouldUpdate) return;
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            localStorage.setItem(APP_NAME + '_repeat_update_notice', 'true');
            await delay(1000);
            window.location.reload();
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.log('Checking for changelog...');
    void registerServiceWorker();
  });

  // Auto-blurs a focused <input> when the window itself loses focus.
  onMount(() => {
    function handleBlur() {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT') (active as HTMLElement).blur();
    }

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  });

  // Persistent-storage capability probe (the first-visit welcome offers the prompt only where the
  // browser has one), mobile detection for the rotate-screen markup, exposing services via
  // linkServices(), and the backup-warning nudge.
  //
  // THE HOME AUTO-OPEN THAT USED TO LEAD THIS BLOCK IS GONE. Home is a page now
  // (routes/+page.svelte -> HomePage.svelte); nothing opens the old popup, so nothing seeds it.
  // What was removed, if the popup is ever restored (see HomeContent.svelte's header for the rest
  // of the revert): read APP_NAME + '_ShowHome' from localStorage, defaulting a missing value to
  // 'true', AND it with `!window.location.pathname.startsWith('/blog')` (raw pathname, not
  // appPathname() - the one deliberate exception to that convention, and a latent no-root bug that
  // let the overlay show on blog pages behind a base prefix), then setState canShow/visible to that
  // result with isInPosition: false.
  onMount(() => {
    homeStore.setState({
      hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist),
    });
    isOnMobile = 'ontouchstart' in window || isMobile();
    checkIfneedsUpdate();
    linkServices();
    const shouldShowBackupWarning = settingsService.shouldShowBackupWarning(
      1000 * 60 * 60 * 24 * 7 * 3
    ); //3 weeks
    if (shouldShowBackupWarning) {
      logger.warn(t('logs:suggest_backup'), 8000);
      settingsService.setLastBackupWarningTime(Date.now());
    }
  });

  // File Handling API launch consumer -> confirm -> fileService.importAndLog.
  onMount(() => {
    if (!('launchQueue' in window)) return;
    async function consumer(launchParams: { files?: FileSystemFileHandle[] }) {
      if (launchParams.files && launchParams.files.length) {
        const name = launchParams.files.join(', ');
        const confirmed = await asyncConfirm(
          t('confirm:confirm_import_opened_file', { files_names: name }),
          false
        );
        if (!confirmed) return;
        for (const file of launchParams.files) {
          const blob = (await file.getFile()) as File & { handle?: FileSystemFileHandle };
          blob.handle = file;
          const text = await blob.text();
          const parsedFile = JSON.parse(text);
          if (parsedFile) {
            fileService.importAndLog(parsedFile);
          }
        }
      }
    }

    // @ts-expect-error launchQueue (File Handling API) not in Window type definitions
    window.launchQueue.setConsumer(consumer);
    return () => {
      // @ts-expect-error launchQueue (File Handling API) not in Window type definitions
      window.launchQueue.setConsumer(() => {});
    };
  });

  // Stored preference -> navigator -> exact-then-root match -> 'en'.
  onMount(() => {
    try {
      const lang = (localStorage.getItem(LANG_PREFERENCE_KEY_NAME) ??
        navigator.language ??
        'en') as string | string[];
      const langName = Array.isArray(lang) ? lang[0] : lang;
      const rootLang = langName.split('-')[0].toLowerCase();
      const langToUse = AVAILABLE_LANGUAGES.includes(langName as AppLanguage)
        ? (langName as AppLanguage)
        : AVAILABLE_LANGUAGES.includes(rootLang as AppLanguage)
          ? (rootLang as AppLanguage)
          : 'en';
      window.document.documentElement.lang = langToUse;
      setI18nLanguage(i18n, langToUse);
    } catch (e) {
      console.error(e);
    }
  });

  onMount(() => {
    async function checkUpdate() {
      await delay(1000);
      const visited = localStorage.getItem(APP_NAME + '_Visited');
      const storedVersion = localStorage.getItem(APP_NAME + '_Version');
      const repeatNotice = localStorage.getItem(APP_NAME + '_repeat_update_notice') === 'true';
      if (!visited) {
        localStorage.setItem(APP_NAME + '_Version', APP_VERSION);
        return;
      }
      if (APP_VERSION !== storedVersion || repeatNotice) {
        logger.log('Update V' + APP_VERSION + '\n' + UPDATE_MESSAGE, 6000);
        localStorage.setItem(APP_NAME + '_repeat_update_notice', 'false');
        localStorage.setItem(APP_NAME + '_Version', APP_VERSION);
      }
      if (navigator.storage && navigator.storage.persist) {
        let isPersisted = await navigator.storage.persisted();
        if (!isPersisted) isPersisted = await navigator.storage.persist();
        console.log(isPersisted ? 'Storage Persisted' : 'Storage Not persisted');
      }
    }

    checkUpdate();
  });

  // Injected via onMount + document.createElement, not <svelte:head> or a
  // static tag in app.html: it must run after hydration (not at SSR/head
  // time), and app.html is a single game-agnostic shell that can't carry a
  // per-game analytics id.
  //
  // QUIRK: Genshin's tagId (script src, below) and configId (config call,
  // below) are two different GA property ids - an upstream bug, not a
  // transcription error. game.meta.analytics captures the split; Sky's two
  // ids happen to be equal. Do not "fix" Genshin's split.
  //
  // QUIRK: no dev-environment guard - this fires in every environment,
  // development included. A deliberate decision, not an oversight.
  //
  // `gtag` below is declared async only to satisfy Analytics.ts's existing
  // Window.gtag ambient type - the body is still synchronous
  // dataLayer.push(...) queueing; GA's own design tolerates that as a
  // fire-and-forget queue.
  type GtagWindow = Window & { dataLayer?: unknown[][] };
  onMount(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${game.meta.analytics.tagId}`;
    document.head.appendChild(script);

    const gaWindow = window as GtagWindow;
    gaWindow.dataLayer = gaWindow.dataLayer || [];
    gaWindow.gtag = async (...args: unknown[]) => {
      gaWindow.dataLayer?.push(args);
    };
    gaWindow.gtag?.('js', new Date());
    gaWindow.gtag?.('config', game.meta.analytics.configId, {
      send_page_view: false,
      anonymize_ip: true,
    });
  });

  onMount(() => {
    Analytics.UIEvent('version', { version: APP_VERSION });
  });

  // pageView fires unconditionally on every navigation (including the
  // first); addPage is deliberately gated by hasTrackedInitialPage so the
  // very first (already-current) page isn't added to history again.
  let hasTrackedInitialPage = false;
  afterNavigate((navigation) => {
    const url = navigation.to?.url;
    if (url) {
      // Raw url.pathname/url.search, not appPathname(): this becomes an
      // analytics LABEL (GA page_title + the history-store entry), not
      // a route comparison, so base-path-stripping doesn't apply here.
      const pagePath = `${url.pathname}${url.search}`;
      Analytics.pageView({ page_title: pagePath });
      if (hasTrackedInitialPage) {
        browserHistoryStore.addPage(pagePath);
      }
    }
    hasTrackedInitialPage = true;
  });

  // The returned cleanup below never runs in practice - this component
  // lives for the whole app session in the root layout - but is kept for
  // parity/correctness.
  onMount(() => {
    AudioProvider.init().catch(console.error);
    metronome.init(AudioProvider.getAudioContext());
    // The metronome owns a gain node and a queue of beats committed to the audio clock, none of
    // which AudioProvider's node registry can see, so a context rebuild has to hand it over
    // explicitly. Teardown runs while the outgoing context is still open - stopping a committed
    // beat on a closed one throws - and the rebuilt hook re-creates the node and re-decodes the
    // click samples against the replacement.
    // destroy() stops it and init() does not start anything, so a metronome that was ticking
    // would come back silent while its toggle still read ON - the page-level flags mirror it in
    // component state and nothing would rerun to correct them.
    let metronomeWasRunning = false;
    const disposeTeardown = AudioProvider.onContextTeardown(() => {
      metronomeWasRunning = metronome.running;
      metronome.destroy();
    });
    const disposeRebuilt = AudioProvider.onContextRebuilt((context) => {
      metronome.init(context);
      if (metronomeWasRunning) metronome.start();
      metronomeWasRunning = false;
    });
    KeyboardProvider.create();
    MIDIProvider.init().catch(console.error);
    globalConfigStore.load(); //before songsStore
    songsStore.sync().catch(console.error);
    folderStore.sync().catch(console.error);
    themeStore.sync().catch(console.error);
    keyBinds.load();
    pwaStore.load();
    ThemeProvider.load().catch(console.error);
    // QUIRK: setupProtocol() has no matching cleanup below, unlike
    // Audio/Keyboard/MIDI - preserved as-is, not an oversight.
    setupProtocol().catch(console.error);
    return () => {
      disposeTeardown();
      disposeRebuilt();
      AudioProvider.destroy();
      KeyboardProvider.destroy();
      MIDIProvider.destroy();
      // Symmetry with the init() above. metronome.destroy() stops the scheduler and cancels
      // beats already committed to the audio clock before it drops the gain node.
      metronome.destroy();
    };
  });

  // QUIRK: the two toast messages below are hardcoded English, not run
  // through i18n - not something to translate as a "fix".
  onMount(() => {
    let sources = MIDIProvider.inputs;
    // `.svelte` script blocks go through eslint-plugin-svelte's own
    // config (not typescript-eslint's no-undef override), so WebMidi (an
    // ambient global, @types/webmidi) needs an explicit disable here even
    // though plain .ts files (e.g. MIDIProvider.ts) resolve it fine.
    // eslint-disable-next-line no-undef
    const cb = (inputs: WebMidi.MIDIInput[]) => {
      if (sources.length > inputs.length) logger.warn('MIDI device disconnected');
      else if (inputs.length > 0) logger.warn('MIDI device connected');
      sources = inputs;
    };
    MIDIProvider.addInputsListener(cb);
    return () => {
      MIDIProvider.removeInputsListener(cb);
    };
  });
</script>

<!-- CSS (.rotate-screen) lives in global App.css, which supplies the other half of the condition:
     the overlay is `display: none` until @media (orientation: portrait) matches. This {#if} is the
     ROUTE half - see LANDSCAPE_ONLY_ROUTES above for which pages earn a warning at all. -->
{#if isLandscapeOnlyRoute}
  <div class="rotate-screen">
    {#if isOnMobile}
      <img src={rotateImg} alt="icon for the rotating screen" />
      <p>{t('home:rotate_screen')}</p>
    {:else}
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 448 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
        ><path
          d="M212.686 315.314L120 408l32.922 31.029c15.12 15.12 4.412 40.971-16.97 40.971h-112C10.697 480 0 469.255 0 456V344c0-21.382 25.803-32.09 40.922-16.971L72 360l92.686-92.686c6.248-6.248 16.379-6.248 22.627 0l25.373 25.373c6.249 6.248 6.249 16.378 0 22.627zm22.628-118.628L328 104l-32.922-31.029C279.958 57.851 290.666 32 312.048 32h112C437.303 32 448 42.745 448 56v112c0 21.382-25.803 32.09-40.922 16.971L376 152l-92.686 92.686c-6.248 6.248-16.379 6.248-22.627 0l-25.373-25.373c-6.249-6.248-6.249-16.378 0-22.627z"
        /></svg
      >
      <p>{t('home:expand_screen')}</p>
    {/if}
  </div>
{/if}
