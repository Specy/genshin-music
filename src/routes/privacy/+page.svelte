<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';

  // QUIRK: this whole page is hardcoded English, no t() calls anywhere - preserved as-is, not
  // a missed translation.
  onMount(() => {
    setPageVisited('privacy');
  });
</script>

<DefaultPage>
  <PageMetadata text="Privacy" description="Privacy policy for the app" />
  <span>
    This website uses cookies to collect data about usage of the app through IP anonymized Google
    Analytics. We use this information to improve user experience and find how our users use the
    app. All data (songs, themes, folders, etc) produced by you is stored in the browser. If you
    wish to see how Google Analytics collects data, please visit
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
