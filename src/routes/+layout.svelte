<script lang="ts">
    import '$lib/css/App.css'
    import '$lib/css/Utility.scss'
    import {goto} from '$app/navigation'
    import {resolve} from '$app/paths'
    import ThemeVars from '$lib/components/theme/ThemeVars.svelte'
    import Logger from '$lib/components/shell/Logger.svelte'
    import AsyncPrompt from '$lib/components/shell/AsyncPrompt.svelte'
    import BodyDropper, {type DroppedFile} from '$lib/components/utility/BodyDropper.svelte'
    import AppInit from '$lib/components/shell/AppInit.svelte'
    import Home from '$lib/components/shell/Home.svelte'
    import {fileService, type UnknownSongImport} from '$core/Services/FileService'
    import {logger} from '$stores/LoggerStore.svelte'
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
