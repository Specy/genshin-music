<script lang="ts">
    import '$lib/css/App.css'
    import '$lib/css/Utility.scss'
    import '$lib/css/Theme.css'
    import {beforeNavigate, goto} from '$app/navigation'
    import {resolve} from '$app/paths'
    import ThemeVars from '$lib/components/theme/ThemeVars.svelte'
    import Logger from '$lib/components/shell/Logger.svelte'
    import AsyncPrompt from '$lib/components/shell/AsyncPrompt.svelte'
    import BodyDropper, {type DroppedFile} from '$lib/components/utility/BodyDropper.svelte'
    import AppInit from '$lib/components/shell/AppInit.svelte'
    import Home from '$lib/components/shell/Home.svelte'
    import {fileService, type UnknownSongImport} from '$core/Services/FileService'
    import {logger} from '$stores/LoggerStore.svelte'
    import {canLeave, navigationGuard, type NavigationTarget} from '$stores/navigationGuard.svelte'
    import {appPathname} from '$lib/utils/appPathname'
    import {t} from '$i18n/binding.svelte'

    // Provider stack final form (P3 Task 7, Home added in P3 Task 8). Order: ThemeVars (CSS vars
    // + background) wraps everything; BodyDropper is a leaf primitive with no children slot of
    // its own (same shape as the old React <BodyDropper .../> self-closing element - see old
    // components/shared/ProviderWrappers/DropZoneProviderWrapper.tsx, which rendered it as a
    // sibling ahead of {children} rather than a wrapper), so it and the rest of the stack sit as
    // siblings inside ThemeVars rather than nested further; AppInit runs its effects; Home is the
    // always-mounted welcome/launcher overlay (old: src/components/AppBase.tsx always rendered
    // <Home .../> regardless of route - this is that same mount point, one level up now that
    // AppBase itself isn't ported as a discrete component); the route content renders inside an
    // error boundary.
    let {children} = $props()

    // AppLink leave-guard, wired at the shell level (P4c Task 2; spec §4.4's guarded-navigation
    // contract). Old (NavigationProvider.tsx) wrapped every push/replace/back call: `const
    // mayNavigate = options.bypassLeaveHandler || await guard.canLeave(href); if (!mayNavigate)
    // return false; router.push(href, ...)` - the guard ran BEFORE the router was ever told to
    // navigate, so there was nothing to "cancel". SvelteKit has no equivalent per-call hook - the
    // only interception point is `beforeNavigate`, which fires for a navigation that has ALREADY
    // started (link click, `goto()`, or browser back/forward), and per its own contract must decide
    // SYNCHRONOUSLY whether to cancel: `nav.cancel()` has no effect once any `await` in the
    // callback has yielded control. That rules out porting old's "await first, navigate second"
    // shape directly; the pattern below is the officially documented workaround for exactly this
    // (spec §4.4 names `beforeNavigate` explicitly as the interception point) - a genuine
    // framework-shape deviation, not a behavior change:
    //   1. `bypassOnce` (module-scope-equivalent here - there is only ever one root layout
    //      instance - the plain `let` below) lets a PREVIOUSLY-APPROVED navigation, which this
    //      same handler is about to re-issue via `goto()`, through without re-asking. It is
    //      consumed (reset to false) the moment it is read, so it only ever covers the one
    //      `goto()` call that set it.
    //   2. Otherwise: if no leave handler is currently registered (`navigationGuard.hasHandler` -
    //      a small addition with no old equivalent, see navigationGuard.svelte.ts's own header for
    //      why it's needed), or this navigation would unload the document anyway (tab close /
    //      external link - `beforeunload` parity for THAT case stays with the pages, per this
    //      task's brief, not this shared guard), there is nothing to guard: let it proceed.
    //   3. Otherwise `nav.cancel()` FIRST (still synchronous - everything above this point in the
    //      callback is sync, matching the hard requirement), THEN resolve the target
    //      (`appPathname()` on `nav.to.url.pathname` for base-path safety, or the sentinel
    //      `'__back__'` for a `popstate` navigation, matching old's own `NavigationTarget` union)
    //      and `await canLeave(target)`. If approved, set `bypassOnce` and re-issue via
    //      `goto(nav.to.url)` - `nav.to.url` is already a fully-resolved URL (SvelteKit computed it
    //      when it determined this navigation's destination), not a hand-written route string, so
    //      it needs no separate `resolve()` call the way a literal path would.
    let bypassOnce = false
    beforeNavigate(async (nav) => {
        if (bypassOnce) {
            bypassOnce = false
            return
        }
        if (nav.willUnload || !navigationGuard.hasHandler) return
        const url = nav.to?.url
        if (!url) return
        nav.cancel()
        const target: NavigationTarget = nav.type === 'popstate' ? '__back__' : appPathname(url.pathname)
        const approved = await canLeave(target)
        if (approved) {
            bypassOnce = true
            // `url` is `nav.to.url`, a `URL` object SvelteKit itself already resolved for this
            // navigation (not a hand-written route string); the rule can only recognize resolve()'s
            // own `ResolvedPathname` return type or a handful of literal-safe shapes, none of which a
            // `URL` instance structurally matches, so it flags this even though the value is already
            // correctly base-prefixed - same category of justified suppression as AppLink.svelte's
            // own dynamic-href disable.
            // eslint-disable-next-line svelte/no-navigation-without-resolve -- see comment above
            await goto(url)
        }
    })

    // old DropZoneProviderWrapper.tsx: BodyDropper's onDrop -> fileService.importAndLog, with a
    // toast on failure.
    async function handleDrop(files: DroppedFile[]) {
        try {
            for (const file of files) {
                const data = file.data as UnknownSongImport
                await fileService.importAndLog(data)
            }
        } catch (e) {
            console.error(e)
            logger.error('Error importing file')
        }
    }

    function handleDropError() {
        logger.error('There was an error importing the file! Was it the correct format?')
    }

    // old components/shared/Utility/ErrorBoundaryRedirect.tsx (componentDidCatch): console.error
    // the caught error - captured into logsStore automatically via the console.error patch AppInit
    // installs (same mechanism the old code relied on, since that patch wraps console.error itself)
    // - then toast via logger.error, then redirect to /error unless running on localhost (dev
    // convenience; old: "Prevent localhost redirect"). `reset()` (svelte:boundary's recovery hook,
    // no old-code equivalent since React's error boundary didn't swap to its own fallback UI
    // either - render() unconditionally returned children) is called only after the navigation
    // completes, so the boundary re-renders with the already-navigated /error route's children
    // instead of retrying the page that just threw.
    async function handleShellError(error: unknown, reset: () => void) {
        console.error(error)
        logger.error(t('logs:error_with_the_app'))
        if (window.location.hostname === 'localhost') {
            console.error('Prevent localhost redirect')
            reset()
            return
        }
        // resolve() (not a bare string) to satisfy svelte/no-navigation-without-resolve - same
        // requirement AppLink.svelte's internal hrefs already follow.
        await goto(resolve('/error'))
        reset()
    }
</script>

<ThemeVars>
    <BodyDropper showDropArea={true} onDrop={handleDrop} as="json" onError={handleDropError} />
    <Logger />
    <AsyncPrompt />
    <AppInit />
    <Home />
    <svelte:boundary onerror={handleShellError}>
        {@render children()}
    </svelte:boundary>
</ThemeVars>
