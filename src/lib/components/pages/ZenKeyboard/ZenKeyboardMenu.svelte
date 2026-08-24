<script lang="ts">
  import { game } from '$game';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { PITCHES } from '$core/sharedConfig';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import MenuSidebar from '$cmp/menu/MenuSidebar.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import MenuItem from '$cmp/menu/MenuItem.svelte';
  import MenuPanel from '$cmp/menu/MenuPanel.svelte';
  import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte';
  import SettingsPane from '$cmp/settings/SettingsPane.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import FloatingSelection from '$cmp/utility/FloatingSelection.svelte';
  import type { ZenKeyboardSettingsDataType } from '$core/BaseSettings';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';

  let {
    settings,
    isMetronomePlaying,
    handleSettingChange,
    onVolumeChange,
    setIsMetronomePlaying,
  }: {
    settings: ZenKeyboardSettingsDataType;
    isMetronomePlaying: boolean;
    handleSettingChange: (setting: SettingUpdate) => void;
    onVolumeChange: (data: SettingVolumeUpdate) => void;
    setIsMetronomePlaying: (val: boolean) => void;
  } = $props();

  const pitchesLabels = PITCHES.map((p) => ({ value: p, label: p }));

  let selectedPage = $state('Settings');
  let isOpen = $state(true);
  let isVisible = $state(false);
  let wrapperEl: HTMLDivElement | undefined = $state();

  const instrumentLabels = $derived(
    game.instruments.list.map((i) => ({ value: i, label: tInstrument(i) }))
  );

  $effect(() => {
    if (!wrapperEl) return;
    const action = clickOutside(wrapperEl, {
      active: selectedPage !== '',
      ignoreFocusable: true,
      onOutside: () => {
        isVisible = false;
      },
    });
    return () => action.destroy?.();
  });
</script>

{#snippet faBarsIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M16 132h416c8.837 0 16-7.163 16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16z"
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

{#snippet faCogIcon()}
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
      d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
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

{#snippet giMetronomeIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 81c-7.7 0-15.5.33-23 .95V119h46V81.95c-7.5-.62-15.3-.95-23-.95zm-41 3.07c-4.8.76-9.5 1.65-13.9 2.69-14.7 3.46-26.3 8.71-32.8 14.04l-22.4 140.3L215 341V137h-23v-18h23V84.07zm82 0V119h23v18h-23v238.4c30.6 2.8 54.5 19.5 73.7 40.5 11 12.2 20.6 25.8 29.6 39.4l-56.6-354.5c-6.5-5.33-18.1-10.58-32.8-14.04-4.4-1.04-9.1-1.93-13.9-2.69zM39.34 90.79L24.66 101.2l20.89 29.6 15.14-9.9-21.35-30.11zm54.81 29.71l-56.04 36.7L82.56 183l17.54-11.5-5.95-51zM233 137v46h46v-46h-46zm-124.8 50.8l-15.3 10 48.9 69.2-30.1 188.3c9-13.6 18.6-27.2 29.6-39.4 19.2-21 43.1-37.7 73.7-40.5v-2.8l-73.2-105.7 4.1-26-37.7-53.1zM233 201v46h46v-46h-46zm0 64v46h46v-46h-46zm0 64v38l5.5 8H279v-46h-46zm206 23v23h-33.2l2.9 18H439v23h18v-64h-18zm-215 41c-29 0-50.3 14.1-69.3 35.1-15.5 17-28.9 38.4-42.1 58.9h286.8c-13.2-20.5-26.6-41.9-42.1-58.9-19-21-40.3-35.1-69.3-35.1h-37l12.4 17.9-14.8 10.2-19.5-28.1H224z"
    /></svg
  >
{/snippet}

{#snippet ioMdMusicalNoteIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 64v225.1c-12.6-7.3-27.1-11.7-42.7-11.7-47.1 0-85.3 38.2-85.3 85.3s38.2 85.3 85.3 85.3 85.3-38.2 85.3-85.3V149.3H384V64H256z"
    /></svg
  >
{/snippet}

{#snippet mdPianoIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 24 24"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    ><path fill="none" d="M0 0h24v24H0z" /><path
      d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 11.5h.25V19h-4.5v-4.5H10c.55 0 1-.45 1-1V5h2v8.5c0 .55.45 1 1 1zM5 5h2v8.5c0 .55.45 1 1 1h.25V19H5V5zm14 14h-3.25v-4.5H16c.55 0 1-.45 1-1V5h2v14z"
    /></svg
  >
{/snippet}

<IconButton
  toggled={isMetronomePlaying}
  onclick={() => setIsMetronomePlaying(!isMetronomePlaying)}
  class="metronome-button"
  style="position:absolute;top:0.5rem;right:5.1rem;border-radius:1rem;border:solid 0.1rem var(--secondary)"
  ariaLabel={t('settings:toggle_metronome')}
>
  {@render giMetronomeIcon()}
</IconButton>
<div style="position:absolute;top:0.5rem;right:2.8rem">
  <FloatingSelection
    value={settings.pitch.value}
    items={pitchesLabels}
    Icon={ioMdMusicalNoteIcon}
    onChange={(pitch) =>
      handleSettingChange({
        key: 'pitch',
        data: { ...settings.pitch, value: pitch },
      })}
  />
</div>
<div style="position:absolute;top:0.5rem;right:0.5rem">
  <FloatingSelection
    value={settings.instrument.value}
    items={instrumentLabels}
    Icon={mdPianoIcon}
    onChange={(instrument) =>
      handleSettingChange({
        key: 'instrument',
        data: { ...settings.instrument, value: instrument },
      })}
  />
</div>
<MenuSidebar
  bind:wrapperEl
  menuStyle="justify-content:flex-end"
  current={selectedPage}
  setCurrent={(c) => (selectedPage = c)}
  open={isOpen}
  setOpen={(o) => (isOpen = o)}
  visible={isVisible}
  setVisible={(v) => (isVisible = v)}
>
  {#snippet hamburger()}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="hamburger-top" onclick={() => (isVisible = !isVisible)}>
      {@render faBarsIcon()}
    </div>
  {/snippet}
  <MenuButton
    ariaLabel={t('menu:toggle_menu')}
    style="margin-bottom:auto"
    onclick={() => (isVisible = !isVisible)}
  >
    {@render faTimesIcon()}
  </MenuButton>
  <MenuItem id="Settings" ariaLabel={t('menu:open_settings_menu')}>
    {@render faCogIcon()}
  </MenuItem>
  <!-- Navigates to '/' (the home page) rather than opening the old home overlay - see
       HomeContent.svelte's header. -->
  <MenuButton
    onclick={() => goto(resolve('/'))}
    ariaLabel={t('menu:open_home_menu')}
    style="border:solid 0.1rem var(--secondary)"
  >
    {@render faHomeIcon()}
  </MenuButton>

  {#snippet panel()}
    <MenuPanelWrapper>
      <MenuPanel title={t('menu:settings')} id="Settings">
        <SettingsPane {settings} onUpdate={handleSettingChange} changeVolume={onVolumeChange} />
      </MenuPanel>
    </MenuPanelWrapper>
  {/snippet}
</MenuSidebar>
