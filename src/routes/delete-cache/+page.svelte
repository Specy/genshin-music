<script lang="ts">
    import {onMount} from 'svelte'
    import {base} from '$app/paths'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import Header from '$cmp/header/Header.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {clearClientCache} from '$core/utils/Utilities'
    import {logger} from '$stores/LoggerStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import {game} from '$game'

    // Old: src/app/_client-pages/delete-cache/index.tsx (63 lines).
    //
    // No PageMetadata call in old code (grepped: absent), and no page-level Next `metadata`
    // export either (src/app/delete-cache/page.tsx has none) - this route genuinely inherited the
    // ROOT title ("Genshin Music Nightly"/"Sky Music Nightly", no per-page override) in old.
    // SvelteKit's <svelte:head> has no automatic cross-navigation fallback the way Next's
    // metadata-cascade does (a page that renders no <title> leaves the PREVIOUS page's title
    // showing, not the root default), so the root title is reproduced explicitly here via
    // PageMetadata rather than adding a title old never actually had for this route.
    //
    // clearClientCache: $core/utils/Utilities.ts already carries this (restored in an earlier
    // Phase-4a task - Home.svelte's own clearCache() already consumes it) - nothing to newly
    // port, just a new caller here.
    //
    // BASE_PATH (old $config) -> `base` from $app/paths, the same substitution Home.svelte's
    // clearCache() already established.
    //
    // PRESERVED BUG: the manual clearCache() button handler below calls logger.success/error with
    // the RAW i18n key strings 'home:cache_cleared'/'home:error_clearing_cache' (not wrapped in
    // t(...)), while the automatic on-mount run() DOES call t(...) correctly - a pre-existing
    // inconsistency in old code (clicking the button shows the literal text "home:cache_cleared"
    // as the toast, not the translated "Cache cleared"). Reproduced byte-for-byte per this
    // migration's "preserve quirks, flag don't silently fix" rule - not unified into one function.
    onMount(() => {
        setPageVisited('deleteCache')
        run()
    })

    async function run() {
        try {
            if (await clearClientCache()) {
                logger.success(t('home:cache_cleared'))
                setTimeout(() => {
                    window.location.href = base || '/' //important, "" causes a reload loop
                }, 1000)
            }
        } catch (e) {
            console.error(e)
            logger.error(t('home:error_clearing_cache'))
        }
    }

    function clearCache() {
        clearClientCache()
            .then(() => {
                logger.success('home:cache_cleared')
                setTimeout(() => {
                    window.location.href = base || '/'
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error('home:error_clearing_cache')
            })
    }
</script>

<DefaultPage>
    <PageMetadata text={game.meta.title} />
    <Column gap="1rem">
        <Header>{t('cache:reset_cache')}</Header>
        <div>{t('cache:reset_cache_message')}</div>
        <AppButton onclick={clearCache}>{t('cache:clear_cache')}</AppButton>
    </Column>
</DefaultPage>
