<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'

    // Old: src/app/_client-pages/privacy/index.tsx (28 lines). Fully static text, no i18n (old
    // had zero t() calls anywhere in this file - the whole page is hardcoded English, preserved
    // verbatim rather than newly translated).
    onMount(() => {
        setPageVisited('privacy')
    })
</script>

<DefaultPage>
    <PageMetadata text="Privacy" description="Privacy policy for the app" />
    <span>
        This website uses cookies to collect data about usage of the app through IP anonymized Google Analytics.
        We use this information to improve user experience and find how our users use the app.
        All data (songs, themes, folders, etc) produced by you is stored in the browser.

        If you wish to see how Google Analytics collects data, please visit
        <a
            href="https://support.google.com/analytics/answer/11593727"
            target="_blank"
            rel="noreferrer"
            style="color:var(--primary-text);text-decoration:underline;margin-left:0.3rem"
        >
            here.
        </a>
    </span>
</DefaultPage>
