<script lang="ts">
  import type { Snippet } from 'svelte';
  import Color from 'color';
  import { game } from '$game';
  import type {
    VsrgHitObject,
    VsrgSong,
    VsrgTrack,
    VsrgTrackInstrumentIdentity,
  } from '$core/Songs/VsrgSong.svelte';
  import { effectiveTrackPitch, numberToButton } from '$core/Songs/noteIds';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import VsrgTrackSettings from './VsrgTrackSettings.svelte';
  import VsrgComposerKeyboard from './VsrgComposerKeyboard.svelte';

  // TrackSelector is folded into this file as the trackSelector snippet below rather than a
  // separate sibling file: it's called directly here, never handed to a generic
  // `Component<T>`-typed prop the way SongMenu's row components are.
  let {
    vsrg,
    selectedTrack,
    children,
    onTrackAdd,
    onTrackChange,
    onTrackSelect,
    onTrackDelete,
    onNoteSelect,
    onBreakpointChange,
    onBreakpointSelect,
    lastCreatedHitObject,
    selectedHitObject,
  }: {
    vsrg: VsrgSong;
    selectedTrack: number;
    // QUIRK: required here (and the page still passes it) but never destructured/read below -
    // dead, matching old's identical omission. Wiring it up would add behavior old never had.
    isHorizontal: boolean;
    onTrackAdd: () => void;
    onTrackDelete: (index: number) => void;
    onTrackSelect: (index: number) => void;
    onTrackChange: (
      track: VsrgTrack,
      index: number,
      previousInstrument?: VsrgTrackInstrumentIdentity
    ) => void;
    onNoteSelect: (note: number) => void;
    onBreakpointChange: (remove: boolean) => void;
    onBreakpointSelect: (index: -1 | 1) => void;
    children: Snippet;
    lastCreatedHitObject: VsrgHitObject | null;
    selectedHitObject: VsrgHitObject | null;
  } = $props();

  const keyboardElements = new Array(game.notes.perColumn).fill(0).map((_, index) => index);

  let isTrackSettingsOpen = $state(false);

  /**
   * THE RULE THIS FILE FOLLOWS, since the 2026-08-06 reactive-model plan's phase 2 replaced the
   * page's `vsrg = vsrg.clone()` with signals: read `vsrg.tracks` at the POINT OF USE, and never
   * hold a VsrgTrack in a `$derived`, a `{@const}` or an `{#each}` item binding.
   *
   * Verified against a mounted component rather than reasoned about, because the three shapes look
   * identical in source. With the song's structure signal bumped and a track edited IN PLACE (which
   * is what VsrgTrackSettings does):
   *   `<Child track={vsrg.tracks[i]} />`          updates - the prop expression is a lazy getter
   *                                               evaluated inside the child's own effect
   *   `{@render snippet(vsrg.tracks[i], i)}`      updates - snippet arguments are thunks, same thing
   *   `{...vsrg.tracks[i].color...}` in a template updates
   *   `const t = $derived(vsrg.tracks[i])`        DOES NOT - the derived re-runs but its value is
   *                                               `===` the old one, so Svelte skips downstream
   *   `{@const t = vsrg.tracks[i]}`               DOES NOT - `{@const}` compiles to a $derived
   *   `{#each vsrg.tracks as track}` item binding DOES NOT - an item whose value is unchanged is
   *                                               not re-rendered
   * A `$derived` is fine as long as its VALUE changes: a primitive that differs, or a freshly built
   * array/object (see selectedNoteButtons below).
   *
   * This used to be `const currentTrack = $derived(vsrg.tracks[selectedTrack])`, which worked only
   * because every refreshVsrg() rebuilt the tracks with .map() and gave it a new identity.
   */
  const trackIndexes = $derived([...vsrg.tracks.keys()]);

  /**
   * Which mini-keyboard buttons the selected hit object plays. A `$derived` rather than an inline
   * prop expression for one reason: it must read `vsrg.tracks` UNCONDITIONALLY, before the
   * selection check. Written inline, the read sat inside a `.map()` callback over
   * `selectedHitObject.notes`, so with no notes yet the callback never ran, nothing subscribed to
   * the structure signal, and adding the first note left the grid unlit.
   *
   * It returns a NEW array each run (so the value genuinely changes), and `undefined` rather than
   * `[]` when nothing is selected - VsrgComposerKeyboard dims and disables itself on `undefined`,
   * and an empty array is truthy.
   */
  const selectedNoteButtons = $derived.by(() => {
    const track = vsrg.tracks[selectedTrack];
    if (selectedHitObject === null) return undefined;
    //the mini keyboard IS this track's instrument, so its keys are resolved at this track's own
    //effective Basepoint — the same question onNoteSelect answers in the other direction
    const pitch = effectiveTrackPitch(track?.instrument, vsrg.pitch);
    return selectedHitObject.notes
      .map((number) => numberToButton(track?.instrument.name ?? '', pitch, number))
      .filter((button) => button !== -1);
  });
</script>

{#snippet faStepBackwardIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M64 468V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12v176.4l195.5-181C352.1 22.3 384 36.6 384 64v384c0 27.4-31.9 41.7-52.5 24.6L136 292.7V468c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12z"
    /></svg
  >
{/snippet}

{#snippet faMinusIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet faPlusIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet faStepForwardIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M384 44v424c0 6.6-5.4 12-12 12h-48c-6.6 0-12-5.4-12-12V291.6l-195.5 181C95.9 489.7 64 475.4 64 448V64c0-27.4 31.9-41.7 52.5-24.6L312 219.3V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12z"
    /></svg
  >
{/snippet}

{#snippet faCogIcon(color: string)}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style="color:{color}"
    ><path
      d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
    /></svg
  >
{/snippet}

{#snippet trackSelector(track: VsrgTrack, index: number)}
  {@const selected = index === selectedTrack}
  {@const themeColor = ThemeProvider.get('primary')}
  {@const mixed = themeColor.mix(new Color(track.color), 0.3)}
  {@const selectedBackground = mixed.toString()}
  {@const selectedText = mixed.isDark() ? 'var(--text-light)' : 'var(--text-dark)'}
  {@const trackColor = new Color(track.color)}
  {@const buttonBackground = trackColor.toString()}
  {@const buttonText = trackColor.isDark() ? 'rgb(220 219 216)' : 'rgb(55 55 55)'}
  <!-- role/tabindex/onkeydown below make this keyboard-operable - an accessibility addition, not
         present in old. -->
  <div
    class="vsrg-track row-centered"
    style="background-color:{selected ? selectedBackground : 'var(--primary)'};color:{selected
      ? selectedText
      : 'var(--primary-text)'}"
    onclick={() => onTrackSelect(index)}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTrackSelect(index);
      }
    }}
  >
    <span
      class="text-ellipsis"
      style="color:{selected
        ? selectedText
        : 'var(--text-color)'};padding-left:0.6rem;padding-right:0.2rem;flex:1"
    >
      {track.instrument.alias || tInstrument(track.instrument.name)}
    </span>
    <AppButton
      onclick={() => selected && (isTrackSettingsOpen = !isTrackSettingsOpen)}
      style="background-color:{buttonBackground}"
      class="vsrg-track-left flex-centered"
    >
      {#if selected}
        {@render faCogIcon(buttonText)}
      {/if}
    </AppButton>
  </div>
{/snippet}

{@render children()}
<div class={['vsrg-top-right', lastCreatedHitObject !== null && 'vsrg-top-right-disabled']}>
  {#if isTrackSettingsOpen}
    <VsrgTrackSettings
      track={vsrg.tracks[selectedTrack]}
      onSave={() => (isTrackSettingsOpen = false)}
      onDelete={() => onTrackDelete(selectedTrack)}
      onChange={(track, previousInstrument) =>
        onTrackChange(track, selectedTrack, previousInstrument)}
    />
  {/if}
  <Row align="center" class="vsrg-breakpoints-buttons" style="margin-bottom:0.4rem">
    <AppButton style="margin-left:0" onclick={() => onBreakpointSelect(-1)}
      >{@render faStepBackwardIcon()}</AppButton
    >
    <AppButton onclick={() => onBreakpointChange(true)}>{@render faMinusIcon()}</AppButton>
    <AppButton onclick={() => onBreakpointChange(false)}>{@render faPlusIcon()}</AppButton>
    <AppButton onclick={() => onBreakpointSelect(1)}>{@render faStepForwardIcon()}</AppButton>
  </Row>
  <div class="vsrg-track-wrapper column">
    {#each trackIndexes as index (index)}
      {@render trackSelector(vsrg.tracks[index], index)}
    {/each}
    <div style="width:100%;height:1.4rem"></div>
    <AppButton
      onclick={(e) => {
        setTimeout(() => {
          onTrackAdd();
          (e.target as HTMLElement | null)?.scrollIntoView();
        }, 50);
      }}
      ariaLabel={t('common:add_new_instrument')}
      class="flex-centered"
      style="margin-top:auto;padding:0.3rem"
    >
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 448 512"
        height="16"
        width="16"
        xmlns="http://www.w3.org/2000/svg"
        style="color:var(--icon-color)"
        ><path
          d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
        /></svg
      >
    </AppButton>
  </div>
  <VsrgComposerKeyboard
    elements={keyboardElements}
    selected={selectedNoteButtons}
    perRow={game.notes.perRow}
    onClick={onNoteSelect}
  />
</div>
