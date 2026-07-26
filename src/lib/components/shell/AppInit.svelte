<script lang="ts">
    import {onMount} from 'svelte'
    import {afterNavigate} from '$app/navigation'
    import {page} from '$app/state'
    import isMobile from 'is-mobile'
    import {game} from '$game'
    import {homeStore} from '$stores/HomeStore.svelte'
    import {logsStore} from '$stores/LogsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {folderStore} from '$stores/FoldersStore.svelte'
    import {themeStore} from '$stores/ThemeStore.svelte'
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {pwaStore} from '$stores/PwaStore.svelte'
    import {KeyboardProvider} from '$lib/providers/KeyboardProvider'
    import {AudioProvider} from '$lib/providers/AudioProvider'
    import {MIDIProvider} from '$lib/providers/MIDIProvider'
    import {metronome} from '$lib/audio/Metronome'
    import {setupProtocol} from '$lib/protocol/appProtocol'
    import {browserHistoryStore} from '$stores/BrowserHistoryStore'
    import {asyncConfirm} from '$stores/AsyncPromptStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {linkServices} from '$core/Services/globalServices'
    import {settingsService} from '$core/Services/SettingsService'
    import {fileService} from '$core/Services/FileService'
    import {checkIfneedsUpdate} from '$core/needsUpdate'
    import Analytics from '$core/Analytics'
    import {delay, setIfInTWA} from '$core/utils/Utilities'
    import {appPathname} from '$lib/utils/appPathname'
    import * as serviceWorker from '$lib/serviceWorkerRegistration'
    import {APP_NAME, APP_VERSION, LANG_PREFERENCE_KEY_NAME, UPDATE_MESSAGE} from '$core/legacyConfig'
    import {AVAILABLE_LANGUAGES, i18n, setI18nLanguage, type AppLanguage} from '$i18n/i18n'
    import {t} from '$i18n/binding.svelte'
    import rotateImg from '$lib/assets/images/rotate.svg'

    // Old: src/components/AppBase.tsx (+ src/app/providers.tsx's console.error/window-error/SW
    // effects, + src/components/shared/ProviderWrappers/GeneralProvidersWrapper.tsx's init
    // effects, + src/components/GoogleAnalyticsScript.tsx - see that block's own header below for
    // why a separate old component is folded in here instead of a new GoogleAnalytics.svelte).
    // This component is the AppBase-equivalent orchestrator the brief describes: effects only, no
    // visual output except the rotate-screen overlay markup below. Each block is commented with
    // the old effect it corresponds to. KeyboardProvider (Phase 4a Task 1), AudioProvider/
    // metronome/MIDIProvider (Phase 4a Task 2), the service worker registration + update-prompt
    // flow (Phase 5 Task 2), and analytics - both the GA script/tag setup and the AppBase.tsx
    // UIEvent/pageView effects (Phase 5 Task 5, this task) - are all wired for real below now.
    //
    // Ordering note: the brief's checklist lists `linkServices()` right after the
    // globalConfigStore/songsStore/.../ThemeProvider.load() batch, but that batch is
    // GeneralProvidersWrapper's effect while linkServices() was actually called from AppBase's
    // own (separate) effect in the old code. Read as an enumeration of required behavior rather
    // than a strict single-block ordering mandate, linkServices() below stays where the old
    // source actually put it (grouped with checkIfneedsUpdate()/the backup warning) - preserving
    // each old effect's own internal order is more directly verifiable against the cited blobs
    // than inventing a new merged order.

    let isOnMobile = $state(false)
    // page.url.pathname includes the SvelteKit base prefix on no-root builds - appPathname()
    // strips it before the route-literal comparison (Phase-3 final review, Important-1).
    const inBlog = $derived(appPathname(page.url.pathname).startsWith('/blog'))

    // old providers.tsx effect 1: console.error -> logsStore, skipped entirely on localhost (dev
    // convenience - keep the native console.error there).
    onMount(() => {
        if (window.location.hostname === 'localhost') return
        const originalErrorLog = console.error.bind(console)
        console.error = (...args: unknown[]) => {
            try {
                originalErrorLog(...args)
                logsStore.addLog({
                    error: args.find((arg): arg is Error => arg instanceof Error),
                    message: args.map((arg) => {
                        if (arg instanceof Error) return arg.stack ?? arg.message
                        return typeof arg === 'object' ? JSON.stringify(arg, null, 4) : String(arg)
                    }).join(' '),
                })
            } catch (error) {
                originalErrorLog('Error logging error', error)
            }
        }
        return () => {
            console.error = originalErrorLog
        }
    })

    // old providers.tsx effect 2: window 'error' -> logsStore (no localhost guard on this one).
    onMount(() => {
        const windowInterceptor = (event: ErrorEvent) => {
            const error = event.error instanceof Error ? event.error : undefined
            logsStore.addLog({
                error,
                message: error?.stack ?? error?.message ?? event.message,
            })
        }
        window.addEventListener('error', windowInterceptor)
        return () => window.removeEventListener('error', windowInterceptor)
    })

    // old providers.tsx effect 3: serwist registration + virtual-keyboard overlay + the
    // update-available asyncConfirm/SKIP_WAITING/reload flow. `getVirtualKeyboard()`/
    // `VirtualKeyboard` are old module-level bindings (declared above `export default function
    // Providers`), used only by this one effect - kept at this same script-top-level scope rather
    // than nested inside the onMount below, matching old's actual structure.
    //
    // Old gated the whole `setIfInTWA()` + register() call behind `if (!IS_TAURI)`; spec §8
    // deletes the Tauri/desktop build from this migration entirely (same precedent as
    // needsUpdate.ts's identical `!IS_TAURI` collapse), so that branch is always-true and the
    // guard itself is dropped rather than ported as permanently-dead code.
    //
    // Old called `i18n.t('logs:update_available')` - the i18next instance directly, not the
    // React hook's `t` - because `asyncConfirm`'s question is resolved once at call time, not
    // re-rendered on language change; `t` from $i18n/binding.svelte exists precisely to give
    // templates/$derived/$effect that re-render tracking (see that file's own header), which this
    // one-shot callback has no use for. `i18n.t(...)` reproduces old's call exactly.
    type VirtualKeyboard = {
        overlaysContent: boolean
    }

    function getVirtualKeyboard(): VirtualKeyboard | undefined {
        return (navigator as Navigator & {virtualKeyboard?: VirtualKeyboard}).virtualKeyboard
    }

    onMount(() => {
        async function registerServiceWorker() {
            try {
                const virtualKeyboard = getVirtualKeyboard()
                if (virtualKeyboard) {
                    virtualKeyboard.overlaysContent = true
                    console.warn('virtual keyboard supported')
                } else {
                    console.warn('virtual keyboard not supported')
                }
                setIfInTWA()
                console.log('Registering service worker')
                await serviceWorker.register({
                    onUpdate: async (registration) => {
                        await delay(3000)
                        const shouldUpdate = await asyncConfirm(i18n.t('logs:update_available'), false)
                        if (!shouldUpdate) return
                        registration.waiting?.postMessage({type: 'SKIP_WAITING'})
                        localStorage.setItem(APP_NAME + '_repeat_update_notice', 'true')
                        await delay(1000)
                        window.location.reload()
                    },
                })
            } catch (error) {
                console.error(error)
            }
        }

        console.log('Checking for changelog...')
        void registerServiceWorker()
    })

    // old AppBase.tsx effect 1 (no dependency array - re-runs every render, but net-equivalent to
    // a mount-once listener since each run's cleanup removes exactly that run's own closure
    // before the next add). Auto-blurs a focused <input> when the window itself loses focus.
    onMount(() => {
        function handleBlur() {
            const active = document.activeElement
            if (active && active.tagName === 'INPUT') (active as HTMLElement).blur()
        }

        window.addEventListener('blur', handleBlur)
        return () => window.removeEventListener('blur', handleBlur)
    })

    // old AppBase.tsx effect 2: initial homeStore state from the two localStorage flags (blog
    // pages never show the welcome overlay), mobile detection for the rotate-screen markup below,
    // the update check, exposing services on window.__link, and the backup-warning nudge.
    onMount(() => {
        let canShowHomeStorage = localStorage.getItem(APP_NAME + '_ShowHome')
        canShowHomeStorage = canShowHomeStorage === null ? 'true' : canShowHomeStorage
        const canShowHome = canShowHomeStorage === 'true' && !window.location.pathname.startsWith('/blog')
        homeStore.setState({
            canShow: canShowHome,
            visible: canShowHome,
            isInPosition: false,
            hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
        })
        isOnMobile = 'ontouchstart' in window || isMobile()
        checkIfneedsUpdate()
        linkServices()
        const shouldShowBackupWarning = settingsService.shouldShowBackupWarning(1000 * 60 * 60 * 24 * 7 * 3) //3 weeks
        if (shouldShowBackupWarning) {
            logger.warn(t('logs:suggest_backup'), 8000)
            settingsService.setLastBackupWarningTime(Date.now())
        }
    })

    // old AppBase.tsx effect 3: File Handling API launch consumer -> confirm -> fileService.importAndLog.
    onMount(() => {
        if (!('launchQueue' in window)) return
        async function consumer(launchParams: {files?: FileSystemFileHandle[]}) {
            if (launchParams.files && launchParams.files.length) {
                const name = launchParams.files.join(', ')
                const confirmed = await asyncConfirm(t('confirm:confirm_import_opened_file', {files_names: name}), false)
                if (!confirmed) return
                for (const file of launchParams.files) {
                    const blob = await file.getFile() as File & {handle?: FileSystemFileHandle}
                    blob.handle = file
                    const text = await blob.text()
                    const parsedFile = JSON.parse(text)
                    if (parsedFile) {
                        fileService.importAndLog(parsedFile)
                    }
                }
            }
        }

        // @ts-expect-error launchQueue (File Handling API) not in Window type definitions
        window.launchQueue.setConsumer(consumer)
        return () => {
            // @ts-expect-error launchQueue (File Handling API) not in Window type definitions
            window.launchQueue.setConsumer(() => {
            })
        }
    })

    // old AppBase.tsx effect 4: stored preference -> navigator -> exact-then-root match -> 'en'.
    onMount(() => {
        try {
            const lang = (localStorage.getItem(LANG_PREFERENCE_KEY_NAME) ?? navigator.language ?? 'en') as string | string[]
            const langName = (Array.isArray(lang) ? lang[0] : lang)
            const rootLang = langName.split('-')[0].toLowerCase()
            const langToUse = AVAILABLE_LANGUAGES.includes(langName as AppLanguage)
                ? langName as AppLanguage
                : AVAILABLE_LANGUAGES.includes(rootLang as AppLanguage)
                    ? rootLang as AppLanguage
                    : 'en'
            window.document.documentElement.lang = langToUse
            setI18nLanguage(i18n, langToUse)
        } catch (e) {
            console.error(e)
        }
    })

    // old AppBase.tsx effect 5 (update-notice toast). Simplified from the old
    // `[checkedUpdate]`-dependency re-trigger dance: that second invocation (after
    // `setCheckedUpdate(true)`) always re-hit its own `if (checkedUpdate) return` guard first
    // (after another pointless 1s delay) before reaching anything else, and the *first* run's
    // trailing `if (!visited) return` was already unreachable (the earlier `if (!visited) return`
    // a few lines up always fires first) - so the old effect's only real, reachable behavior is
    // exactly the once-per-mount body below (verified against the old blob line-by-line).
    onMount(() => {
        async function checkUpdate() {
            await delay(1000)
            const visited = localStorage.getItem(APP_NAME + '_Visited')
            const storedVersion = localStorage.getItem(APP_NAME + '_Version')
            const repeatNotice = localStorage.getItem(APP_NAME + '_repeat_update_notice') === 'true'
            if (!visited) {
                localStorage.setItem(APP_NAME + '_Version', APP_VERSION)
                return
            }
            if (APP_VERSION !== storedVersion || repeatNotice) {
                logger.log('Update V' + APP_VERSION + '\n' + UPDATE_MESSAGE, 6000)
                localStorage.setItem(APP_NAME + '_repeat_update_notice', 'false')
                localStorage.setItem(APP_NAME + '_Version', APP_VERSION)
            }
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                console.log(isPersisted ? 'Storage Persisted' : 'Storage Not persisted')
            }
        }

        checkUpdate()
    })

    // Old: src/components/GoogleAnalyticsScript.tsx, mounted as a sibling of <Providers> directly
    // in src/app/layout.tsx's <body> - i.e. one level ABOVE AppBase.tsx, not one of its numbered
    // effects - via `next/script`'s DEFAULT strategy, `afterInteractive`. Per Next's own docs that
    // strategy injects the tag(s) client-side, AFTER hydration, not at initial SSR/HTML-string
    // time - exactly what a plain `onMount` already gives in a component that itself mounts once
    // at the SvelteKit root layout (this file, via `<AppInit />` in +layout.svelte). So this is
    // folded in here as one more onMount block rather than a new `GoogleAnalytics.svelte`
    // component: this file already exists specifically to consolidate several old always-mounted,
    // effects-only, no-visible-markup components (providers.tsx, AppBase.tsx,
    // GeneralProvidersWrapper.tsx - see this file's own header above), and
    // GoogleAnalyticsScript.tsx is exactly that same shape (old rendered only two invisible
    // <Script> tags, no markup of its own). A <svelte:head> block was NOT used because
    // `afterInteractive` is deliberately NOT head-time/SSR-time injection; a literal tag in
    // app.html was NOT used because that file is game-agnostic (one static shell shared by both
    // games) and cannot carry a per-game analytics id.
    //
    // PRESERVED UPSTREAM QUIRK, not a bug to fix: old's Genshin branch loads
    // `gtag/js?id=G-T3TJDT2NFS` (the script src) but then calls `gtag('config', 'G-BSC3PC58G4',
    // ...)` (A DIFFERENT property id) - two distinct GA properties, an upstream bug in old itself.
    // `game.meta.analytics` already captures this split (tagId vs configId - see
    // games/genshin/index.ts's own header comment on that field); using tagId for the script src
    // and configId for the config call below reproduces the split automatically. Sky's tagId and
    // configId happen to be equal, so nothing is visible there. Do not "fix" Genshin's split.
    //
    // NO DEV GUARD, preserved deliberately: old rendered these tags in every environment,
    // development included (no NODE_ENV/env check anywhere in GoogleAnalyticsScript.tsx or its
    // call site) - a decision, not an oversight.
    //
    // Deviation from old's literal inline-script TEXT (behavior-equivalent, disclosed): old's
    // second <Script> body is a STRING the browser parses as its own classic (non-module) script,
    // where a bare top-level `function gtag(){dataLayer.push(arguments)}` implicitly becomes
    // `window.gtag` (classic-script global scope) and `arguments` collects the call's params.
    // Here that has to be explicit: `window.gtag` is assigned directly and `arguments` becomes a
    // `...args` rest parameter. Declared `async` (returning `Promise<void>`) only to satisfy
    // Analytics.ts's own already-existing `Window.gtag` ambient type
    // (`(...args: any[]) => Promise<void>`, unchanged by this task, header rewritten below it) -
    // the body is still the same synchronous `dataLayer.push(...)` queueing, so this is a
    // type-level formality, not a behavior change (GA's own design tolerates `gtag()` being called
    // as a fire-and-forget queue function before the real gtag.js has even finished loading).
    type GtagWindow = Window & {dataLayer?: unknown[][]}
    onMount(() => {
        const script = document.createElement('script')
        script.async = true
        script.src = `https://www.googletagmanager.com/gtag/js?id=${game.meta.analytics.tagId}`
        document.head.appendChild(script)

        const gaWindow = window as GtagWindow
        gaWindow.dataLayer = gaWindow.dataLayer || []
        gaWindow.gtag = async (...args: unknown[]) => {
            gaWindow.dataLayer?.push(args)
        }
        gaWindow.gtag?.('js', new Date())
        gaWindow.gtag?.('config', game.meta.analytics.configId, {send_page_view: false, anonymize_ip: true})
    })

    // old AppBase.tsx effect 6, mount-once.
    onMount(() => {
        Analytics.UIEvent('version', {version: APP_VERSION})
    })

    // old AppBase.tsx effect 7: fires `Analytics.pageView` on every `pagePath` change INCLUDING
    // the first (old had no guard around that call), then guards only the
    // `browserHistoryStore.addPage` half with `hasTrackedInitialPage` - the shape already
    // implemented below for the addPage half alone; `Analytics.pageView` now joins it ahead of
    // that guard, inside the same pre-existing `if (url)` check (afterNavigate fires once for the
    // initial load too, so the first call would otherwise skip nothing for pageView - matching old
    // firing pageView on the very first render). `pagePath` reuses old's own
    // `query.length > 0 ? path + '?' + query : path`: raw, un-appPathname'd pathname - this is an
    // analytics LABEL (GA page_title + the browserHistoryStore entry), not a route comparison, so
    // the base-path-stripping convention does not apply here, same as this effect's pre-existing
    // `${url.pathname}${url.search}` form. That form was byte-compared in-session (node) against
    // old's computation across query-bearing URLs: the two are byte-identical for the
    // overwhelmingly common case (plain `key=value[&key=value]*` query strings, repeated keys, no
    // query at all) but NOT universally - two edge cases diverge: (a) `URLSearchParams.toString()`
    // (old, via `useSearchParams()`) re-serializes percent-encoded reserved characters using
    // form-encoding rules, e.g. a literal `%20` becomes `+`, while the raw `url.search` used here
    // keeps whatever encoding was actually in the URL; (b) a valueless param like `?noval`
    // serializes to `noval=` through `URLSearchParams` but stays `noval` (no `=`) in the raw
    // `url.search`. Both are cosmetic-only, since this string only ever becomes a GA label and a
    // history-tracking entry, never a route comparison - so the divergence has no behavioral
    // consequence, but asserting outright byte-identity here would be false, so it isn't asserted.
    // (The `if (url)` guard itself is unchanged in shape from before this task; old's own
    // `path`/`query` were never possibly-undefined, so a `url`-less afterNavigate call, if it ever
    // happens, now also skips `pageView` alongside `addPage` - a narrow, likely-unreachable
    // safety net inherited from this file's existing pattern, not a new gap introduced here.)
    let hasTrackedInitialPage = false
    afterNavigate((navigation) => {
        const url = navigation.to?.url
        if (url) {
            const pagePath = `${url.pathname}${url.search}`
            Analytics.pageView({page_title: pagePath})
            if (hasTrackedInitialPage) {
                browserHistoryStore.addPage(pagePath)
            }
        }
        hasTrackedInitialPage = true
    })

    // old GeneralProvidersWrapper.tsx effect 1 (init batch; unmount cleanup never runs in
    // practice since AppInit lives for the whole app session in the root layout, same as the old
    // wrapper did, but noted for parity).
    onMount(() => {
        AudioProvider.init().catch(console.error)
        metronome.init(AudioProvider.getAudioContext())
        KeyboardProvider.create()
        MIDIProvider.init().catch(console.error)
        globalConfigStore.load() //before songsStore
        songsStore.sync().catch(console.error)
        folderStore.sync().catch(console.error)
        themeStore.sync().catch(console.error)
        keyBinds.load()
        pwaStore.load()
        ThemeProvider.load().catch(console.error)
        // Phase 4a Task 8: setupProtocol() wired for real (was a marker-only comment through Task
        // 2). Old GeneralProvidersWrapper.tsx never disposed the protocol on unmount either (its
        // cleanup only destroyed Audio/Keyboard/MIDI providers, same trio returned below) -
        // preserved: no protocol.dispose() call added here.
        setupProtocol().catch(console.error)
        return () => {
            AudioProvider.destroy()
            KeyboardProvider.destroy()
            MIDIProvider.destroy()
        }
    })

    // old GeneralProvidersWrapper.tsx effect 2 - MIDI input hotplug: logs a toast whenever the
    // connected-input count changes (literal English strings in the old blob, not i18n keys -
    // verified directly, kept as-is for byte parity).
    onMount(() => {
        let sources = MIDIProvider.inputs
        // WebMidi is an ambient global namespace (@types/webmidi, referenced in src/app.d.ts);
        // plain .ts files resolve it fine (typescript-eslint's recommended config turns off
        // no-undef there, deferring to tsc), but .svelte script blocks go through
        // eslint-plugin-svelte's own recommended config, which doesn't carry that same override -
        // MIDIProvider.ts's identical `WebMidi.MIDIInput[]` usage needs no such disable
        // eslint-disable-next-line no-undef
        const cb = (inputs: WebMidi.MIDIInput[]) => {
            if (sources.length > inputs.length)
                logger.warn('MIDI device disconnected')
            else if (inputs.length > 0)
                logger.warn('MIDI device connected')
            sources = inputs
        }
        MIDIProvider.addInputsListener(cb)
        return () => {
            MIDIProvider.removeInputsListener(cb)
        }
    })
</script>

<!-- old AppBase.tsx render tail: rotate-screen overlay, hidden for the blog. CSS (.rotate-screen)
     was ported into src/lib/css/App.css by Phase 4a Task 3's full Player/menu.css port (the shared
     --menu-size/--panel-size root vars were pulled forward even earlier, P3 Task 8) - this markup
     is fully styled. -->
{#if !inBlog}
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
            ><path d="M212.686 315.314L120 408l32.922 31.029c15.12 15.12 4.412 40.971-16.97 40.971h-112C10.697 480 0 469.255 0 456V344c0-21.382 25.803-32.09 40.922-16.971L72 360l92.686-92.686c6.248-6.248 16.379-6.248 22.627 0l25.373 25.373c6.249 6.248 6.249 16.378 0 22.627zm22.628-118.628L328 104l-32.922-31.029C279.958 57.851 290.666 32 312.048 32h112C437.303 32 448 42.745 448 56v112c0 21.382-25.803 32.09-40.922 16.971L376 152l-92.686 92.686c-6.248 6.248-16.379 6.248-22.627 0l-25.373-25.373c-6.249-6.248-6.249-16.378 0-22.627z"/></svg>
            <p>{t('home:expand_screen')}</p>
        {/if}
    </div>
{/if}
