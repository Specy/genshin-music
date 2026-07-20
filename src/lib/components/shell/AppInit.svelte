<script lang="ts">
    import {onMount} from 'svelte'
    import {afterNavigate} from '$app/navigation'
    import {page} from '$app/state'
    import isMobile from 'is-mobile'
    import {homeStore} from '$stores/HomeStore.svelte'
    import {logsStore} from '$stores/LogsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {folderStore} from '$stores/FoldersStore.svelte'
    import {themeStore} from '$stores/ThemeStore.svelte'
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {pwaStore} from '$stores/PwaStore.svelte'
    import {browserHistoryStore} from '$stores/BrowserHistoryStore'
    import {asyncConfirm} from '$stores/AsyncPromptStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {linkServices} from '$core/Services/globalServices'
    import {settingsService} from '$core/Services/SettingsService'
    import {fileService} from '$core/Services/FileService'
    import {checkIfneedsUpdate} from '$core/needsUpdate'
    import {delay} from '$core/utils/Utilities'
    import {APP_NAME, APP_VERSION, LANG_PREFERENCE_KEY_NAME, UPDATE_MESSAGE} from '$core/legacyConfig'
    import {AVAILABLE_LANGUAGES, i18n, setI18nLanguage, type AppLanguage} from '$i18n/i18n'
    import {t} from '$i18n/binding.svelte'
    import rotateImg from '$lib/assets/images/rotate.svg'

    // Old: src/components/AppBase.tsx (+ src/app/providers.tsx's console.error/window-error/SW
    // effects, + src/components/shared/ProviderWrappers/GeneralProvidersWrapper.tsx's init
    // effects). This component is the AppBase-equivalent orchestrator the brief describes:
    // effects only, no visual output except the rotate-screen overlay markup below. Each block
    // is commented with the old effect it corresponds to; `// Phase 4:`/`// Phase 5:` markers
    // stand in for behavior that depends on files not ported yet (audio/input providers, service
    // worker, analytics).
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
    const inBlog = $derived(page.url.pathname.startsWith('/blog'))

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

    // Phase 5: service worker registration (old providers.tsx effect 3 - serwist register() +
    // virtualKeyboard.overlaysContent + the update-available asyncConfirm/SKIP_WAITING/reload
    // flow). Needs src/service-worker.ts (Phase 5 accumulator item, see progress.md) ported first.

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

    // Phase 4/5: analytics — old AppBase.tsx effect 6 (`Analytics.UIEvent('version', {version:
    // APP_VERSION})`, mount-once) and the `Analytics.pageView({page_title: pagePath})` call inside
    // effect 7 below are both omitted; GoogleAnalyticsScript/Analytics wiring is page-head
    // territory for a later phase. The same effect 7's page-tracking half (browserHistoryStore),
    // which does NOT depend on analytics, is implemented for real below.

    // old AppBase.tsx effect 7 (page-tracking half only - see marker above): afterNavigate fires
    // once for the initial load too, so the first call is skipped (old: `hasTrackedInitialPage`
    // ref) and only real client-side navigations get pushed into browserHistoryStore.
    let hasTrackedInitialPage = false
    afterNavigate((navigation) => {
        const url = navigation.to?.url
        if (url && hasTrackedInitialPage) {
            browserHistoryStore.addPage(`${url.pathname}${url.search}`)
        }
        hasTrackedInitialPage = true
    })

    // old GeneralProvidersWrapper.tsx effect 1 (init batch; unmount cleanup never runs in
    // practice since AppInit lives for the whole app session in the root layout, same as the old
    // wrapper did, but noted for parity).
    onMount(() => {
        // Phase 4: AudioProvider.init().catch(console.error); metronome.init(AudioProvider.getAudioContext());
        // Phase 4: KeyboardProvider.create(); MIDIProvider.init().catch(console.error)
        // Phase 4 cleanup: AudioProvider.destroy(); KeyboardProvider.destroy(); MIDIProvider.destroy()
        globalConfigStore.load() //before songsStore
        songsStore.sync().catch(console.error)
        folderStore.sync().catch(console.error)
        themeStore.sync().catch(console.error)
        keyBinds.load()
        pwaStore.load()
        ThemeProvider.load().catch(console.error)
        // Phase 4: setupProtocol().catch(console.error) - $lib/Hooks/useWindowProtocol, the
        // /transfer page's window-message protocol. Not part of this task's checklist; noted here
        // only because it shared this exact effect in the old blob.
    })

    // Phase 4: old GeneralProvidersWrapper.tsx effect 2 - MIDIProvider.addInputsListener/
    // removeInputsListener, logging 'MIDI device connected'/'disconnected' on input-count change.
</script>

<!-- old AppBase.tsx render tail: rotate-screen overlay, hidden for the blog. CSS (.rotate-screen)
     lives in the old Player/menu.css, not yet ported (Phase 4, same as FloatingDropdown's menu.css
     dependency noted in Task 5) - this markup is unstyled until that file lands. -->
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
