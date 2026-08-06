<script lang="ts">
  import type { SerializedSong } from '$core/Songs/Song';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { browserHistoryStore } from '$stores/BrowserHistoryStore';
  import { homeStore } from '$stores/HomeStore.svelte';
  import type { ClassValue } from 'svelte/elements';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { t } from '$i18n/binding.svelte';
  import MenuSidebar from '$cmp/menu/MenuSidebar.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import MenuItem from '$cmp/menu/MenuItem.svelte';
  import MenuPanel from '$cmp/menu/MenuPanel.svelte';
  import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte';
  import Header from '$cmp/header/Header.svelte';
  import SongMenu from '$cmp/SongMenu.svelte';
  import SheetVisualizerSongRow from './SheetVisualizerSongRow.svelte';

  // wrapperEl is owned by the child MenuSidebar's own template, not this file's markup, so a
  // `use:clickOutside` directive can't attach to it (use: only attaches within the component that
  // renders the element) - calling the action function directly inside an effect below is the
  // documented escape hatch.
  let {
    currentSong,
    onSongLoaded,
    class: cls = '',
    style = '',
  }: {
    currentSong: SerializedSong | null;
    onSongLoaded: (song: SerializedSong) => void;
    class?: ClassValue;
    style?: string;
  } = $props();

  //the page is useless without a song, so it opens straight onto the song list
  let selectedPage = $state('Songs');
  let open = $state(true);
  let wrapperEl: HTMLDivElement | undefined = $state();

  // QUIRK: open is read only inside the onOutside closure below, not the effect body, so toggling
  // open does not retrigger this effect - only wrapperEl/selectedPage do. Reading it directly here
  // instead would retrigger a teardown/reattach of the listener on every open toggle.
  $effect(() => {
    if (!wrapperEl) return;
    const action = clickOutside(wrapperEl, {
      active: selectedPage !== '',
      ignoreFocusable: true,
      onOutside: () => {
        open = false;
      },
    });
    return () => action.destroy?.();
  });
</script>

{#snippet faArrowLeftIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z"
    /></svg
  >
{/snippet}

{#snippet faTimesIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

{#snippet faMusicIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M470.38 1.51L150.41 96A32 32 0 0 0 128 126.51v261.41A139 139 0 0 0 96 384c-53 0-96 28.66-96 64s43 64 96 64 96-28.66 96-64V214.32l256-75v184.61a138.4 138.4 0 0 0-32-3.93c-53 0-96 28.66-96 64s43 64 96 64 96-28.65 96-64V32a32 32 0 0 0-41.62-30.49z"
    /></svg
  >
{/snippet}

{#snippet faHomeIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 576 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"
    /></svg
  >
{/snippet}

<MenuSidebar
  bind:wrapperEl
  class={cls}
  {style}
  menuStyle="justify-content:flex-end"
  current={selectedPage}
  setCurrent={(c) => (selectedPage = c)}
  {open}
  setOpen={(o) => (open = o)}
>
  {#if browserHistoryStore.hasNavigated && !open}
    <MenuButton
      ariaLabel={t('menu:go_back')}
      style="margin-bottom:auto"
      onclick={() => window.history.back()}
    >
      {@render faArrowLeftIcon()}
    </MenuButton>
  {/if}
  {#if open}
    <MenuButton
      ariaLabel={t('menu:close_menu')}
      style="margin-bottom:auto"
      onclick={() => (open = false)}
    >
      {@render faTimesIcon()}
    </MenuButton>
  {/if}
  <MenuItem id="Songs" ariaLabel={t('menu:song_menu')}>
    {@render faMusicIcon()}
  </MenuItem>
  <MenuButton
    onclick={homeStore.open}
    ariaLabel={t('menu:open_home_menu')}
    style="border:solid 0.1rem var(--secondary)"
  >
    {@render faHomeIcon()}
  </MenuButton>

  {#snippet panel()}
    <MenuPanelWrapper>
      <MenuPanel id="Songs">
        <Header type="h2" style="margin-bottom:0.6rem">
          {t('common:select_song')}
        </Header>
        <SongMenu
          songs={songsStore.songs}
          class="noprint"
          exclude={['vsrg']}
          SongComponent={SheetVisualizerSongRow}
          componentProps={{ current: currentSong, onClick: onSongLoaded }}
        />
      </MenuPanel>
    </MenuPanelWrapper>
  {/snippet}
</MenuSidebar>
