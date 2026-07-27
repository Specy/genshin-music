<script lang="ts">
    import {page} from '$app/state'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import {t} from '$i18n/binding.svelte'

    // SvelteKit's +error.svelte covers "route not found" and every other thrown/load error in one
    // place: status===404 gets its own content below; every other status falls through to the
    // generic fallback. No setPageVisited call here - PAGES_VERSIONS has no '404' key.
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
