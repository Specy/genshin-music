<script lang="ts">
  import { game } from '$game';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import type { NoteNameType, Pitch } from '$lib/games/types';
  import { computeButtonLayerStatuses } from '$core/Songs/noteIds';
  import type { InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import type { Instrument, ObservableNote } from '$lib/audio/Instrument.svelte';
  import { t } from '$i18n/binding.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import Header from '$cmp/header/Header.svelte';
  import ShapeKeyboard from '$lib/games/shapes/ShapeKeyboard.svelte';
  import ComposerNote from './ComposerNote.svelte';

  let {
    data,
    functions,
  }: {
    data: {
      keyboard: Instrument;
      instruments: InstrumentData[];
      isRecordingAudio: boolean;
      currentLayer: number;
      currentColumn: NoteColumn;
      pitch: Pitch;
      settings: ComposerSettingsDataType;
      isPlaying: boolean;
      noteNameType: NoteNameType;
      heldButtons: Set<number>;
    };
    functions: {
      handleClick: (note: ObservableNote, pointerId: number) => void;
      handleNoteRelease: (note: ObservableNote, pointerId: number) => void;
      handleNoteLongPress: (note: ObservableNote, anchor: HTMLElement) => void;
      handleNoteDrag: (note: ObservableNote, deltaX: number) => void;
      startRecordingAudio: (override?: boolean) => void;
      selectColumnFromDirection: (direction: number) => void;
      handleTempoChanger: (tempoChanger: (typeof game.composer.tempoChangers)[number]) => void;
    };
  } = $props();

  // Keyed by the Buttons of the keyboard actually on screen (`data.keyboard`), which is the
  // number the `button` snippet below hands back — never the note's own track button, which
  // for a sub-grid instrument is a different coordinate space and lit the wrong key.
  //
  // `data.pitch` is the DISPLAYED track's effective Basepoint (Composer.svelte resolves the
  // override there), which is the Basepoint every note's number has to be read at to answer
  // "which of THIS keyboard's keys sounds it" (ADR-0007).
  const layerStatuses = $derived.by(() => {
    try {
      return computeButtonLayerStatuses(
        data.currentColumn.notes,
        data.currentLayer,
        data.instruments,
        data.keyboard.name,
        data.pitch
      );
    } catch {
      return null;
    }
  });
</script>

{#snippet chevronLeftIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"
    /></svg
  >
{/snippet}

{#snippet chevronRightIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z"
    /></svg
  >
{/snippet}

{#if data.keyboard === undefined}
  <div class="composer-keyboard-wrapper" style="margin-bottom:4rem">
    <h1>{t('composer:error_with_this_layer')}</h1>
  </div>
{:else if data.isRecordingAudio}
  <div
    class="composer-keyboard-wrapper"
    style="margin-bottom:4rem;flex-direction:column;align-items:center"
  >
    <Header>{t('composer:recording_audio')}...</Header>
    <AppButton onclick={() => functions.startRecordingAudio(false)} toggled>
      {t('composer:stop_recording_audio')}
    </AppButton>
  </div>
{:else}
  <div class="composer-keyboard-wrapper">
    {#if data.settings.useKeyboardSideButtons.value}
      <button
        onpointerdown={() => functions.selectColumnFromDirection(-1)}
        class={[
          'keyboard-column-selection-buttons',
          !data.isPlaying && 'keyboard-column-selection-buttons-visible',
        ]}
        style="padding-right:0.5rem;justify-content:flex-end;visibility:{data.isPlaying
          ? 'hidden'
          : 'visible'}"
      >
        {@render chevronLeftIcon()}
      </button>
    {/if}
    {#if data.keyboard.notes.length === 0}
      <div class="keyboard">
        <div class="loading">Loading...</div>
      </div>
    {:else}
      <ShapeKeyboard shape={data.keyboard.shape} notes={data.keyboard.notes} class="keyboard">
        <!-- Payload (ADR-0005 §3): the note itself, plus its BUTTON — never a bare slot the
             surface would have to resolve back into a note. The note goes straight to
             ComposerNote and back out through the handlers; the Button only addresses this
             surface's two per-button side tables (see Composer.svelte's `heldButtons`). -->
        {#snippet button(note, i)}
          {#if layerStatuses === null}
            Err
          {:else}
            <ComposerNote
              layer={layerStatuses.get(i) ?? 0}
              data={note}
              noteText={data.keyboard.getNoteText(i, data.noteNameType, data.pitch)}
              instrument={data.keyboard.name}
              noteImage={note.icon}
              clickAction={functions.handleClick}
              releaseAction={functions.handleNoteRelease}
              longPressAction={functions.handleNoteLongPress}
              dragAction={functions.handleNoteDrag}
              held={data.heldButtons.has(i)}
            />
          {/if}
        {/snippet}
      </ShapeKeyboard>
    {/if}
    {#if data.settings.useKeyboardSideButtons.value}
      <button
        onpointerdown={() => functions.selectColumnFromDirection(1)}
        class={[
          'keyboard-column-selection-buttons',
          !data.isPlaying && 'keyboard-column-selection-buttons-visible',
        ]}
        style="padding-left:0.5rem;justify-content:flex-start;visibility:{data.isPlaying
          ? 'hidden'
          : 'visible'}"
      >
        {@render chevronRightIcon()}
      </button>
    {/if}
  </div>
  <div class={['tempo-changers-wrapper', data.isPlaying && 'tempo-changers-wrapper-hidden']}>
    <div class="bottom-right-text">
      {t('composer:tempo')}
    </div>
    {#each game.composer.tempoChangers as tempoChanger (tempoChanger.id)}
      <button
        onclick={() => functions.handleTempoChanger(tempoChanger)}
        style="{tempoChanger.changer === 1
          ? `background-color:${ThemeProvider.get('primary').toString()};color:${ThemeProvider.getText('primary').toString()}`
          : `background-color:#${tempoChanger.color.toString(16)}`};outline:{data.currentColumn
          .tempoChanger === tempoChanger.id
          ? `3px ${ThemeProvider.get('composer_accent').toString()} solid`
          : 'unset'};outline-offset:-3px"
      >
        {tempoChanger.text}
      </button>
    {/each}
  </div>
{/if}
