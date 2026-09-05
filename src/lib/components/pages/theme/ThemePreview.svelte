<script lang="ts">
  import Color from 'color';
  import { APP_NAME } from '$core/legacyConfig';
  import { fileService } from '$core/Services/FileService';
  import { logger } from '$stores/LoggerStore.svelte';
  import type { SerializedTheme } from '$core/theme/ThemeProvider.svelte';

  let {
    theme,
    onClick,
    onDelete,
    current,
    downloadable,
  }: {
    theme: SerializedTheme;
    current: boolean;
    onClick?: (theme: SerializedTheme) => void;
    onDelete?: (theme: SerializedTheme) => void;
    downloadable?: boolean;
  } = $props();

  const image = $derived(theme.other.backgroundImageMain || theme.other.backgroundImageComposer);

  function handleDownload(e: MouseEvent) {
    e.stopPropagation();
    logger.success(`The theme "${theme.other.name}" was downloaded`);
    fileService.downloadTheme(
      theme,
      `${theme.other.name || APP_NAME}.${APP_NAME.toLowerCase()}theme`
    );
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    onDelete?.(theme);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="theme-preview"
  onclick={() => onClick?.(theme)}
  style="background-color:{theme.data.background.value};color:{theme.data.background.text};{current
    ? 'outline:solid 0.2rem var(--accent)'
    : 'box-shadow:0px 0px 10px 0px rgba(0,0,0,0.4)'}"
>
  <div class="theme-preview-bg" style="background-image:url({image});z-index:1"></div>
  <div
    class="theme-preview-row"
    style="background-color:{Color(theme.data.background.value)
      .fade(0.3)
      .toString()};z-index:2;text-shadow:{image ? '0px 0px 10px rgba(0,0,0,0.4)' : 'none'}"
  >
    <div class="text-ellipsis" style="z-index:2;padding:0.4rem 0.2rem">
      {theme.other.name}
    </div>
    <!-- The half that used to carry these four declarations inline: they are a class now so the
         portrait rule below can drop the padding once the icons carry their own. -->
    <div class="theme-preview-actions">
      {#if downloadable}
        <svg
          onclick={handleDownload}
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 512 512"
          height="18"
          width="18"
          style="color:{theme.data.background.text}"
          cursor="pointer"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"
          /></svg
        >
      {/if}
      {#if onDelete}
        <svg
          onclick={handleDelete}
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 448 512"
          height="18"
          width="18"
          style="margin-left:0.5rem;color:var(--red)"
          cursor="pointer"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
          /></svg
        >
      {/if}
    </div>
  </div>
  <div class="theme-preview-colors" style="z-index:2">
    {#each Object.entries(theme.data) as [key, prop] (key)}
      <div style="background-color:{prop.value};color:{prop.text}"></div>
    {/each}
  </div>
</div>

<style>
  .theme-preview {
    display: flex;
    position: relative;
    flex-direction: column;
    width: 100%;
    height: fit-content;
    border-radius: 0.6rem;
    transition: filter 0.2s;
    cursor: pointer;
    overflow: hidden;
    min-height: 7rem;
  }

  .theme-preview-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background-repeat: no-repeat;
    background-size: cover;
  }

  /* Pointer-only (see App.css's `.app-button:hover`): applying a theme leaves its card mounted, so
     on touch the last-tapped card would stay lit and read as selected - which the outline set
     inline above already says, about a card that may well be a different one. */
  @media (hover: hover) {
    .theme-preview:hover {
      filter: brightness(1.1);
    }
  }

  .theme-preview-row {
    display: flex;
    justify-content: space-between;
    padding: 0 0.4rem;
  }

  .theme-preview-colors {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    flex: 1;
  }

  .theme-preview-colors div {
    flex: 1;
    font-size: 0.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theme-preview-actions {
    display: flex;
    margin-left: 0.2rem;
    z-index: 2;
    padding: 0.4rem 0.2rem;
  }

  /* PORTRAIT: the download and delete glyphs are 18px squares (the `height`/`width` ATTRIBUTES on
     the svgs, which these rules override) with no padding of their own - a fine mouse target, and
     well under half of what a thumb needs. The padding is what grows the hit box; the glyph only
     goes up a couple of pixels, so the name beside it keeps most of the tile it gained when the
     grid dropped to two columns. */
  @media (orientation: portrait) {
    .theme-preview-row svg {
      width: 1.4rem;
      height: 1.4rem;
      padding: 0.4rem;
    }

    /* The half's own padding would now double up on the icons' side, standing the row taller than
       the name beside it needs. */
    .theme-preview-actions {
      padding: 0;
    }
  }
</style>
