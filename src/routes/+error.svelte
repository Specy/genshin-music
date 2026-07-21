<script lang="ts">
    import {page} from '$app/state'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old had a DEDICATED route for 404 (src/app/_client-pages/404/index.tsx, 21 lines, `page404`
    // i18n ns, rendered via src/app/not-found.tsx) - SvelteKit's own +error.svelte already covers
    // "route not found" (and every other thrown/load error) in one place, so old's 404-only content
    // is ported into the status===404 branch here rather than as a separate route (adjudicated per
    // this task's brief). Every OTHER status keeps the pre-existing generic fallback below,
    // unchanged. Old's 404 page had no useSetPageVisited call and PAGES_VERSIONS has no '404'/
    // 'notFound' key either - correctly not wired here either.
</script>

{#if page.status === 404}
    <DefaultPage>
        <PageMetadata text="404" description="oh no!" />
        <AppLink href="/" className="link" style="text-align:center">
            <div style="font-size:6rem">404</div>
            <div>{t('page404:page_not_found')}</div>
        </AppLink>
    </DefaultPage>
{:else}
    <main>
        <h1>{page.status}</h1>
        <p>{page.error?.message ?? 'Something went wrong'}</p>
    </main>
{/if}
