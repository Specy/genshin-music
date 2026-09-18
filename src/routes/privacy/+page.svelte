<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import PageHeading from '$cmp/shell/PageHeading.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';

  // QUIRK: this whole page is hardcoded English, no t() calls anywhere - preserved as-is, not
  // a missed translation.
  onMount(() => {
    setPageVisited('privacy');
  });
</script>

<DefaultPage>
  <PageMetadata text="Privacy" description="Privacy policy for the app" />
  <PageHeading text="Privacy" />
  <span class="privacy-text">
    This website uses cookies to collect data about usage of the app through IP anonymized Google
    Analytics. We use this information to improve user experience and find how our users use the
    app. All data (songs, themes, folders, etc) produced by you is stored in the browser. If you
    wish to see how Google Analytics collects data, please visit
    <a
      href="https://support.google.com/analytics/answer/11593727"
      target="_blank"
      rel="noreferrer"
      class="privacy-link"
    >
      here.
    </a>
  </span>
</DefaultPage>

<style>
  /* Was three inline declarations on the anchor; moved into a class purely so the portrait
     query below can grow it into a real tap target (an inline `margin-left` outranks any
     stylesheet rule short of !important). The three values are unchanged. */
  .privacy-link {
    color: var(--primary-text);
    text-decoration: underline;
    margin-left: 0.3rem;
  }

  /* PORTRAIT: the only control on the page is that one word of prose - 39x20px, well under a
     fingertip. It becomes a padded chip on its own baseline, and the paragraph gets the extra
     leading a narrow measure wants. */
  @media (orientation: portrait) {
    .privacy-text {
      line-height: 1.5;
    }

    .privacy-link {
      display: inline-block;
      /* the padding replaces most of the inline gap the old margin provided */
      margin-left: 0.1rem;
      padding: 0.4rem 0.6rem;
      border-radius: 0.4rem;
      background-color: var(--primary);
      text-decoration-thickness: 0.1rem;
    }
  }
</style>
