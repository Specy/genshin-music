<script lang="ts">
  import { SPEED_CHANGERS } from '$core/legacyConfig';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import IconPlay from '~icons/fa6-solid/play';
  import IconPause from '~icons/fa6-solid/pause';
  import PlayerSlider from './PlayerSlider.svelte';
  import PlayerSheetCard from './PlayerSheetCard.svelte';
  import { t } from '$i18n/binding.svelte';

  let {
    onRestart,
    onSeek,
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
    isMetronomePlaying,
    isRecordingAudio,
  }: {
    onRestart: () => void;
    onSeek: (noteIndex: number) => void;
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
    isMetronomePlaying: boolean;
    isRecordingAudio: boolean;
  } = $props();

  // Aliasing the whole $state-backed object keeps reads through it reactive - only destructuring
  // individual primitive fields out would lose tracking.
  const songData = playerStore.state;
  let needsRefresh = $state(false);

  // A new run clears the hint - but a SEEK is not a new run's worth of Section (ADR-0010): "Go to
  // here" restarts from a frame while leaving `position`/`end` exactly as the user drew them, so a
  // Section edit that has not been applied yet is still pending after it and the hint has to stay.
  $effect(() => {
    void songData.key;
    if (!songData.preservesSection) needsRefresh = false;
  });

  function toggleNeedsRefresh() {
    needsRefresh = true;
  }

  function handleSectionChange() {
    if (hasActiveSong) onRestart();
    else toggleNeedsRefresh();
  }

  // ONE SLOT, TWO CONTROLS - and which one is in it is the mode's own question. Practice is the
  // only mode the hide-notes flag is read in (PlayerKeyboard applies it as
  // `hideNotesInPracticeMode && mode === 'practice'`) and the only one with nothing to pause: its
  // notes wait for the user, so there is no clock to stop. Play and approaching are the mirror of
  // that on both counts, so they get the play/pause button and the eye goes away entirely rather
  // than sitting there disabled - the slot is filled either way, so no row shifts on a mode change.
  const canHidePracticeNotes = $derived(songData.eventType === 'practice');

  // The record-audio button and the song controls under it must swap in the same flush, so both
  // key off this one synchronous store field. Player's `hasSong` can drive neither: PlayerKeyboard
  // flips it a debounced tick after eventType changes, and that lag painted the button one frame
  // before the sliders vanished - a visible layout shift on leaving approaching mode.
  const hasActiveSong = $derived(songData.eventType !== 'stop');
  // Song playback owns the audio graph; offer recording only in free-play/recording mode.
  const canRecordAudio = $derived(songData.eventType === 'stop');
  const canChangeSpeed = $derived(songData.eventType !== 'practice');
  const isPaused = $derived(songData.paused);
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
  {#if canRecordAudio}
    <div>
      <AppButton toggled={isRecordingAudio} onclick={() => onToggleRecordAudio(!isRecordingAudio)}>
        {isRecordingAudio ? t('player:finish_recording') : t('player:record_audio')}
      </AppButton>
    </div>
  {/if}
  <div class="column slider-wrapper" style={!hasActiveSong ? 'display:none' : ''}>
    <div class="row" style="width:100%;gap:0.4rem">
      <div class={[hasTooltip(true), 'row']} style="flex:1">
        <!-- Deliberately a raw select, not the shared Select.svelte - that component
                     applies its own .select class and background-image arrow, which this one
                     explicitly cancels via background-image:none. -->
        <select
          class="slider-select practice-mode-control"
          onchange={onRawSpeedChange}
          value={speedChanger.name}
          style="background-image:none"
          disabled={!canChangeSpeed}
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
      {#if !canHidePracticeNotes}
        <IconButton
          class="play-pause-control"
          style="width:2.4rem"
          onclick={() => playerStore.togglePause()}
          tooltip={isPaused ? t('common:play') : t('common:pause')}
          ariaLabel={isPaused ? t('common:play') : t('common:pause')}
        >
          {#if isPaused}
            <IconPlay />
          {:else}
            <IconPause />
          {/if}
        </IconButton>
      {:else if hidePracticeNotes !== undefined}
        <IconButton
          class="practice-mode-control"
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

    <PlayerSlider onChange={toggleNeedsRefresh} onCommit={handleSectionChange} />
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
  <PlayerSheetCard columns={visualSheetColumns} {onSeek} onSectionChange={handleSectionChange} />
{/if}

<style>
  .player-controls {
    position: absolute;
    align-items: flex-end;
    padding: 0.8rem;
    right: 0.2rem;
    height: 100%;
    margin-left: 3.5rem;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .slider-select {
    font-size: 0.8rem;
    flex: 1;
    height: 2rem;
    text-align: center;
    font-weight: bold;
    border: none;
    -moz-appearance: none;
    appearance: none;
    -webkit-appearance: none;
    background-image: none;
    border-radius: 0.3rem;
    background-color: var(--primary);
    color: var(--primary-text);
  }

  .slider-wrapper {
    height: 100%;
    align-self: center;
    width: 100%;
    align-items: center;
    gap: 0.4rem;
    max-height: 25rem;
  }

  .slider-wrapper :global(.practice-mode-control:disabled) {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .slider-wrapper :global(button) {
    margin: 0;
  }

  @media only screen and (max-width: 920px) {
    .player-controls {
      right: 0;
    }
  }

  @media screen and (max-width: 920px) {
    .sidebar-metronome-button {
      position: absolute;
      right: 0.8rem;
      bottom: 0.8rem;
    }
  }

  /* TOP-LEFT, beside the Sheet Card rather than under it (ADR-0010). Its containing block is body
     (every ancestor is static), and with no `left` it took its static position - which
     `.app { justify-content: center }` centres, i.e. exactly where the card now sits. Anchoring it to
     the viewport edge means it must clear the fixed menu column itself. */
  .approaching-accuracy {
    position: absolute;
    top: 0.5rem;
    left: calc(var(--menu-size) + 0.4rem);
    color: var(--primary-text);
    padding: 0.4rem;
    background-color: var(--primary);
    font-weight: bold;
    border-radius: 0.4rem;
  }

  .approaching-accuracy table {
    font-size: 0.8rem;
    border-collapse: collapse;
  }

  /* THE STRIP THIS BOX LIVES IN IS NARROWEST JUST ABOVE THE CARD'S OWN BREAKPOINT, not below it.
     The card is centred, so the room to its left is (100vw - card width)/2 minus the menu column -
     and the card goes from 55vw to 65vw at 921px, which CUTS that room from 0.225 to 0.175 of the
     window. Keying a compact tier to `max-width: 920px` therefore shrank the box exactly where it
     had the most space and left it full-size where it had the least.
     Measured against BonoboBold's advances: the two-column table is ~208px wide from the viewport's
     left edge at 0.8rem (label 59.8px + 3.5rem value column + paddings + the 4.4rem menu offset),
     which only clears the card from ~1140px up. At 0.7rem it is still ~187px and would need
     ~1070px, so below 1140px the label goes ABOVE its value instead: a ~62px column - the width of
     the word "Accuracy" - that clears the card at every width down to ~590px. */
  @media only screen and (max-width: 1139px) {
    .approaching-accuracy {
      padding: 0.3rem;
    }

    .approaching-accuracy table {
      font-size: 0.7rem;
    }

    .approaching-accuracy tbody,
    .approaching-accuracy tr,
    .approaching-accuracy td {
      display: block;
    }

    .approaching-accuracy tr + tr {
      margin-top: 0.25rem;
    }

    /* the border-left that separated the two columns has no side to sit on once they are stacked */
    .approaching-accuracy .sc-2 {
      padding-right: 0;
      opacity: 0.75;
    }

    .approaching-accuracy .sc-1 {
      padding-left: 0;
      min-width: 0;
      border-left: none;
    }
  }

  .sc-2 {
    padding-right: 0.5rem;
  }

  .sc-1 {
    padding-left: 0.5rem;
    min-width: 3.5rem;
    border-left: solid 2px var(--secondary);
  }
</style>
