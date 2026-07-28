<script lang="ts">
  import { SPEED_CHANGERS } from '$core/legacyConfig';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import PlayerSlider from './PlayerSlider.svelte';
  import PlayerVisualSheetRenderer from './PlayerPagesRenderer.svelte';
  import { t } from '$i18n/binding.svelte';
  import './Slider.css';
  import './VisualSheet.css';

  let {
    onRestart,
    onRawSpeedChange,
    onToggleRecordAudio,
    onToggleMetronome,
    speedChanger,
    loopEnabled,
    hidePracticeNotes,
    setHidePracticeNotes,
    setLoopEnabled,
    isVisualSheetVisible,
    visualSheetColumns,
    hasSong,
    isMetronomePlaying,
    isRecordingAudio,
  }: {
    onRestart: () => void;
    onRawSpeedChange: (event: Event & { currentTarget: EventTarget & HTMLSelectElement }) => void;
    onToggleRecordAudio: (override: boolean) => void;
    onToggleMetronome: () => void;
    speedChanger: (typeof SPEED_CHANGERS)[number];
    loopEnabled: boolean;
    hidePracticeNotes: boolean | undefined;
    setHidePracticeNotes: (hide: boolean) => void;
    setLoopEnabled: (enabled: boolean) => void;
    isVisualSheetVisible: boolean;
    visualSheetColumns: number;
    hasSong: boolean;
    isMetronomePlaying: boolean;
    isRecordingAudio: boolean;
  } = $props();

  // Aliasing the whole $state-backed object keeps reads through it reactive - only destructuring
  // individual primitive fields out would lose tracking.
  const songData = playerStore.state;
  let needsRefresh = $state(false);

  $effect(() => {
    void songData.key;
    needsRefresh = false;
  });

  function toggleNeedsRefresh() {
    needsRefresh = true;
  }
</script>

{#snippet faEyeIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 576 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"
    /></svg
  >
{/snippet}

{#snippet faEyeSlashIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 640 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"
    /></svg
  >
{/snippet}

{#snippet faStopIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z"
    /></svg
  >
{/snippet}

{#snippet vscDebugRestartIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 16 16"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M12.75 8a4.5 4.5 0 0 1-8.61 1.834l-1.391.565A6.001 6.001 0 0 0 14.25 8 6 6 0 0 0 3.5 4.334V2.5H2v4l.75.75h3.5v-1.5H4.352A4.5 4.5 0 0 1 12.75 8z"
    /></svg
  >
{/snippet}

{#snippet giMetronomeIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="22"
    width="22"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 81c-7.7 0-15.5.33-23 .95V119h46V81.95c-7.5-.62-15.3-.95-23-.95zm-41 3.07c-4.8.76-9.5 1.65-13.9 2.69-14.7 3.46-26.3 8.71-32.8 14.04l-22.4 140.3L215 341V137h-23v-18h23V84.07zm82 0V119h23v18h-23v238.4c30.6 2.8 54.5 19.5 73.7 40.5 11 12.2 20.6 25.8 29.6 39.4l-56.6-354.5c-6.5-5.33-18.1-10.58-32.8-14.04-4.4-1.04-9.1-1.93-13.9-2.69zM39.34 90.79L24.66 101.2l20.89 29.6 15.14-9.9-21.35-30.11zm54.81 29.71l-56.04 36.7L82.56 183l17.54-11.5-5.95-51zM233 137v46h46v-46h-46zm-124.8 50.8l-15.3 10 48.9 69.2-30.1 188.3c9-13.6 18.6-27.2 29.6-39.4 19.2-21 43.1-37.7 73.7-40.5v-2.8l-73.2-105.7 4.1-26-37.7-53.1zM233 201v46h46v-46h-46zm0 64v46h46v-46h-46zm0 64v38l5.5 8H279v-46h-46zm206 23v23h-33.2l2.9 18H439v23h18v-64h-18zm-215 41c-29 0-50.3 14.1-69.3 35.1-15.5 17-28.9 38.4-42.1 58.9h286.8c-13.2-20.5-26.6-41.9-42.1-58.9-19-21-40.3-35.1-69.3-35.1h-37l12.4 17.9-14.8 10.2-19.5-28.1H224z"
    /></svg
  >
{/snippet}

{#if songData.eventType === 'approaching'}
  <div class="approaching-accuracy">
    <table>
      <tbody>
        <tr>
          <td class="sc-2">{t('player:accuracy')}</td>
          <td class="sc-1"
            >{(
              (playerControlsStore.score.correct /
                (playerControlsStore.score.correct + playerControlsStore.score.wrong - 1)) *
              100
            ).toFixed(1)}%</td
          >
        </tr>
        <tr>
          <td class="sc-2">{t('player:score')}</td>
          <td class="sc-1">{playerControlsStore.score.score}</td>
        </tr>
        <tr>
          <td class="sc-2">{t('player:combo')}</td>
          <td class="sc-1">{playerControlsStore.score.combo}</td>
        </tr>
      </tbody>
    </table>
  </div>
{/if}
<div class="column player-controls">
  <!--this div is here to keep an empty element to keep the styling consistent -->
  <div>
    {#if songData.eventType !== 'approaching'}
      <AppButton toggled={isRecordingAudio} onclick={() => onToggleRecordAudio(!isRecordingAudio)}>
        {isRecordingAudio ? t('player:finish_recording') : t('player:record_audio')}
      </AppButton>
    {/if}
  </div>
  <div class="column slider-wrapper" style={!hasSong ? 'display:none' : ''}>
    <div class="row" style="width:100%;gap:0.4rem">
      {#if hidePracticeNotes !== undefined}
        <IconButton
          style="width:2.4rem"
          onclick={() => setHidePracticeNotes(!hidePracticeNotes)}
          tooltip={t('player:hide_practice_notes')}
          toggled={hidePracticeNotes}
          ariaLabel={t('player:hide_practice_notes')}
        >
          {#if hidePracticeNotes}
            {@render faEyeSlashIcon()}
          {:else}
            {@render faEyeIcon()}
          {/if}
        </IconButton>
      {/if}
      <AppButton
        style="flex:1;min-width:4rem"
        tooltip={t('player:loop_tooltip')}
        toggled={loopEnabled}
        onclick={() => setLoopEnabled(!loopEnabled)}
      >
        {t('player:loop')}
      </AppButton>
    </div>
    <div class="row" style="width:100%;gap:0.4rem">
      <div class={[hasTooltip(true), 'row']}>
        <!-- Deliberately a raw select, not the shared Select.svelte - that component
                     applies its own .select class and background-image arrow, which this one
                     explicitly cancels via background-image:none. -->
        <select
          class="slider-select"
          onchange={onRawSpeedChange}
          value={speedChanger.name}
          style="background-image:none"
        >
          <!-- QUIRK: hardcoded English — old never ran this label through t(). Translating it is a behaviour change, not a fix. -->
          <option disabled>Speed</option>
          {#each SPEED_CHANGERS as e (e.name)}
            <option value={e.name}>
              {e.name}
            </option>
          {/each}
        </select>
        <Tooltip position="left">
          {t('player:change_speed')}
        </Tooltip>
      </div>
      <IconButton
        onclick={() => {
          playerStore.resetSong();
          playerControlsStore.clearPages();
          playerControlsStore.resetScore();
        }}
        style="flex:1"
        tooltip={t('common:stop')}
        ariaLabel={t('player:stop_song')}
      >
        {@render faStopIcon()}
      </IconButton>
    </div>

    <PlayerSlider onChange={toggleNeedsRefresh} />
    <IconButton
      toggled={needsRefresh}
      onclick={onRestart}
      tooltip={t('shortcuts:props.restart')}
      ariaLabel={t('shortcuts:props.restart_description')}
    >
      {@render vscDebugRestartIcon()}
    </IconButton>
  </div>

  <IconButton
    toggled={isMetronomePlaying}
    onclick={onToggleMetronome}
    class="sidebar-metronome-button metronome-button"
    ariaLabel={t('settings:toggle_metronome')}
  >
    {@render giMetronomeIcon()}
  </IconButton>
</div>
{#if isVisualSheetVisible}
  <PlayerVisualSheetRenderer columns={visualSheetColumns} />
{/if}
