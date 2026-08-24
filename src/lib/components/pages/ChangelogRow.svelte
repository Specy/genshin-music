<script lang="ts">
  import { t } from '$i18n/binding.svelte';

  interface ChangelogRowProps {
    version: string | number;
    changes: string[];
    date: Date;
  }

  let { version, date, changes: rawChanges }: ChangelogRowProps = $props();

  const v = $derived(`${version}`.replaceAll('.', '-'));
  const title = $derived(t(`versions:${v}.title`));

  // QUIRK: rawChanges' own string values are never shown — only its length is used, as a loop
  // counter into the versions:<v>.change-N locale keys. Don't "simplify" this into using the
  // array's actual content.
  const changes = $derived(rawChanges.map((_, i) => t(`versions:${v}.change-${i + 1}`)));

  const localDate = $derived(
    new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(date)
  );
</script>

<div>
  <div class="changelog-title">
    <div class="clt-1">{version}</div>
    <div class="clt-2">{localDate}</div>
  </div>
  <div class="changelog-list">
    <div class="cll-1">{title}</div>
    <ul>
      {#each changes as change, i (i)}
        <li>
          <!-- QUIRK: splits on a "$l" in-string marker for manual line breaks. No current
                         locale string contains it, so this looks unused — kept so a future
                         translation can still use it. -->
          {#each change.split('$l') as part, j (j)}
            {#if j === 0}
              <div>{part}</div>
            {:else}
              <p class="cll-new-line">{part}</p>
            {/if}
          {/each}
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  /* The remaining two selectors from this feature's stylesheet (.changelog-page-title,
       .changelog-ending) are owned by the changelog route's own +page.svelte, not this file. */
  .changelog-title {
    display: flex;
    width: 100%;
    align-items: center;
    margin: 0.4rem;
    margin-left: 0;
  }

  .clt-1 {
    background-color: var(--accent);
    color: var(--accent-text);
    padding: 0.2rem;
    border-radius: 0.2rem;
    width: 5rem;
    text-align: center;
  }

  .clt-2 {
    margin-left: 1rem;
    color: var(--background-text);
  }

  .cll-1 {
    font-size: 1.5rem;
    color: var(--accent);
  }

  .changelog-list {
    margin: 0;
    margin-left: 2.5rem;
    border-left: solid 2px var(--secondary);
    padding: 1rem 2rem;
    padding-right: 1rem;
  }

  .changelog-list ul li {
    margin-top: 0.4rem;
  }

  .cll-new-line {
    margin: 0;
    margin-top: 0.2rem;
    margin-left: 1rem;
  }

  /* PORTRAIT. Width-tiered as well as orientation-keyed to match App.css's own
     `max-width: 920px and (orientation: portrait)` block - a portrait tablet is a wide window that
     keeps the desktop margins and does not need any of this. */
  @media screen and (orientation: portrait) and (max-width: 920px) {
    /* THE INDENT WAS THE WHOLE PROBLEM: 2.5rem of margin + 2rem of left padding + the list's own
       ~40px marker gutter is 112px, nearly a third of a 393px screen, and the changes are long
       sentences. The timeline rail stays - it is what makes this read as a changelog - it just
       costs a quarter of what it did, which buys the text back about 23% of its line length.
       The route's `.changelog-ending` repeats this margin so the dashed tail still lines up. */
    .changelog-list {
      margin-left: 1.25rem;
      padding: 0.85rem 0 0.85rem 1rem;
    }

    .changelog-list ul {
      padding-left: 1.2rem;
    }

    /* Release titles run long ("New app, sustained notes, smooth scrolling, new instruments"), and
       at 1.5rem the newest one spent three lines of a 393px screen saying so before a single
       change was visible. Still clearly the heading of its block, just not the whole first screen. */
    .cll-1 {
      font-size: 1.25rem;
    }
  }
</style>
