<script module lang="ts">
  import type { InstrumentNoteIcon } from '$core/Songs/SongClasses';

  function getReverbValue(reverb: boolean | null): 'Unset' | 'On' | 'Off' {
    if (reverb === null) return 'Unset';
    return reverb ? 'On' : 'Off';
  }

  function toReverbValue(value: string): boolean | null {
    if (value === 'Unset') return null;
    return value === 'On';
  }

  const noteIcons: InstrumentNoteIcon[] = ['circle', 'border', 'line'];
</script>

<script lang="ts">
  import type { Pitch } from '$lib/games/types';
  import { InstrumentData } from '$core/Songs/SongClasses';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import { clickOutside } from '$lib/utils/clickOutside';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import PitchSelect from '$cmp/inputs/PitchSelect.svelte';
  import InstrumentSelect from '$cmp/inputs/InstrumentSelect.svelte';
  import Select from '$cmp/inputs/Select.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';

  let {
    instrument,
    onChange,
    onDelete,
    onClose,
    onChangePosition,
    onMerge,
    onEditGroupStart,
    onEditGroupEnd,
    currentLayer,
    instruments,
    disabled = false,
  }: {
    currentLayer: number;
    instruments: InstrumentData[];
    instrument: InstrumentData;
    onChange: (instrument: InstrumentData) => void;
    onChangePosition: (direction: 1 | -1) => void;
    onMerge: (direction: 1 | -1) => void;
    onDelete: () => void;
    onClose: () => void;
    /**
     * Brackets around ONE CONTINUOUS GESTURE - a volume drag, a name being typed - for the
     * composer to collapse into a single Undo Step. See the group bookkeeping below.
     */
    onEditGroupStart?: () => void;
    onEditGroupEnd?: () => void;
    disabled?: boolean;
  } = $props();

  /**
   * ONE GESTURE, ONE UNDO STEP (design §5). The volume slider and the alias field emit an
   * `onChange` PER TICK and each one is a whole `setInstrument` - one Step each. Ungrouped, a
   * single drag from 0 to 125 lands ~125 Steps: past the history's cap, so the session's real edits
   * are evicted from the bottom, the Savepoint is stranded, and undoing the drag costs 125 presses.
   *
   * The two brackets are INDEPENDENT and idempotent rather than one shared flag, because they
   * overlap: a pointerdown on the slider is dispatched before the alias field's blur, so a single
   * flag would be closed by that blur and leave the rest of the drag ungrouped. The composer's
   * groups are reentrant, which is exactly what that nesting needs.
   *
   * CLOSED FROM EVERY END A GESTURE CAN HAVE - pointerup, pointercancel, lost capture, blur - plus
   * the popup being taken away mid-drag (delete/merge close it): a group nobody closes never lands
   * its Step and silently swallows every edit made after it.
   */
  let volumeGrouped = false;
  let aliasGrouped = false;

  function startVolumeGroup() {
    if (volumeGrouped) return;
    volumeGrouped = true;
    onEditGroupStart?.();
  }

  function endVolumeGroup() {
    if (!volumeGrouped) return;
    volumeGrouped = false;
    onEditGroupEnd?.();
  }

  function startAliasGroup() {
    if (aliasGrouped) return;
    aliasGrouped = true;
    onEditGroupStart?.();
  }

  function endAliasGroup() {
    if (!aliasGrouped) return;
    aliasGrouped = false;
    onEditGroupEnd?.();
  }

  $effect(() => () => {
    endVolumeGroup();
    endAliasGroup();
  });

  /**
   * EVERY EDIT BELOW GOES THROUGH HERE, and the clone is the point: `instrument` is the LIVE
   * roster entry (InstrumentControls passes `instruments[selected]`), and `InstrumentData.set`
   * assigns onto the object it is called on. Editing it in place hands the song an object that is
   * already the new value, so `ComposedSong.setInstrument`'s `previous` — read out of the roster —
   * IS the edited object, and its "did the name or the Basepoint move?" comparison answers NO for
   * an edit that moved both.
   *
   * That is harmless for a colour or a volume, and it was silently fatal for the two halves of the
   * instrument's IDENTITY once ADR-0007 made them note edits: an instrument swap never ran its
   * button-preserving rewrite and a per-layer Basepoint override never moved its track's notes, so
   * Lyre → Vintage-Lyre stopped re-flavoring and the Undo Step for the edit held the roster change
   * without the notes it should have moved. The vsrg panel states the same fact the other way
   * round, by handing `VsrgSong.setTrack` the previous identity explicitly.
   *
   * A fresh object per edit, therefore: the popup DESCRIBES the entry it wants, and the song is
   * left able to see what moved.
   */
  const edited = (changes: Partial<InstrumentData>) => instrument.clone().set(changes);
</script>

{#if !instrument}
  <div class="floating-instrument-settings box-shadow">
    {t('instrument_settings:no_instrument_selected')}
  </div>
{:else}
  <div
    class="floating-instrument-settings box-shadow"
    use:clickOutside={{ active: true, ignoreFocusable: true, onOutside: onClose }}
  >
    <div class="row space-between items-center">
      {t('instrument_settings:layer_name')}
      <input
        type="text"
        maxlength="50"
        class="input"
        style="width:7.4rem"
        value={instrument.alias}
        {disabled}
        onfocus={startAliasGroup}
        onblur={endAliasGroup}
        oninput={(e) => onChange(edited({ alias: e.currentTarget.value }))}
        placeholder={tInstrument(instrument.name)}
      />
    </div>

    <div class="row space-between items-center">
      {t('common:instrument')}
      <InstrumentSelect
        style="width:8rem"
        selected={instrument.name}
        {disabled}
        onChange={(name) => onChange(edited({ name }))}
      />
    </div>
    <div class="row space-between items-center">
      {t('common:pitch')}
      <PitchSelect
        style="padding:0.3rem;width:8rem"
        selected={instrument.pitch as Pitch}
        {disabled}
        onChange={(pitch) => onChange(edited({ pitch }))}
      >
        <option value="">
          {t('instrument_settings:use_song_pitch')}
        </option>
      </PitchSelect>
    </div>
    <div class="row space-between items-center">
      {t('common:reverb')}
      <Select
        style="padding:0.3rem;width:8rem"
        onchange={(e) => {
          onChange(edited({ reverbOverride: toReverbValue(e.currentTarget.value) }));
        }}
        value={getReverbValue(instrument.reverbOverride)}
        {disabled}
      >
        <option value="On">
          {t('common:on')}
        </option>
        <option value="Off">
          {t('common:off')}
        </option>
        <option value="Unset">
          {t('instrument_settings:use_song_reverb')}
        </option>
      </Select>
    </div>

    <div class="row space-between items-center">
      {t('instrument_settings:note_icon')}
      <Select
        style="padding:0.3rem;width:8rem"
        onchange={(e) => onChange(edited({ icon: e.currentTarget.value as InstrumentNoteIcon }))}
        value={instrument.icon}
        {disabled}
      >
        {#each noteIcons as iconKind (iconKind)}
          <option value={iconKind}>{t(`common:${iconKind}`)}</option>
        {/each}
      </Select>
    </div>

    <div class="row" style="margin-top:0.2rem;align-items:center">
      {t('instrument_settings:volume')}
      <span
        style="margin-left:0.4rem;width:3rem{instrument.volume > 100
          ? `;color:hsl(0, ${-40 + instrument.volume}%, 61%);margin-left:0.4rem`
          : ''}"
      >
        {instrument.volume}%
      </span>
      <HelpTooltip buttonStyle="width:1.2rem;height:1.2rem" width={10}>
        {t('instrument_settings:volume_high_warning')}
      </HelpTooltip>
    </div>
    <div class="row">
      <input
        type="range"
        style="flex:1;opacity:{instrument.muted ? '0.6' : '1'}"
        min={0}
        max={125}
        value={instrument.volume}
        {disabled}
        onpointerdown={startVolumeGroup}
        onpointerup={endVolumeGroup}
        onpointercancel={endVolumeGroup}
        onlostpointercapture={endVolumeGroup}
        onkeydown={startVolumeGroup}
        onkeyup={endVolumeGroup}
        onblur={endVolumeGroup}
        oninput={(e) => onChange(edited({ volume: Number(e.currentTarget.value) }))}
      />
      <AppButton
        class="flex-centered"
        toggled={instrument.muted}
        {disabled}
        style="padding:0;min-width:unset;width:1.6rem;height:1.6rem;border-radius:2rem"
        onclick={() => {
          if (instrument.volume === 0 && !instrument.muted) return;
          onChange(edited({ muted: !instrument.muted }));
        }}
      >
        {#if instrument.muted || instrument.volume === 0}
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 512 512"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zM461.64 256l45.64-45.64c6.3-6.3 6.3-16.52 0-22.82l-22.82-22.82c-6.3-6.3-16.52-6.3-22.82 0L416 210.36l-45.64-45.64c-6.3-6.3-16.52-6.3-22.82 0l-22.82 22.82c-6.3 6.3-6.3 16.52 0 22.82L370.36 256l-45.63 45.63c-6.3 6.3-6.3 16.52 0 22.82l22.82 22.82c6.3 6.3 16.52 6.3 22.82 0L416 301.64l45.64 45.64c6.3 6.3 16.52 6.3 22.82 0l22.82-22.82c6.3-6.3 6.3-16.52 0-22.82L461.64 256z"
            /></svg
          >
        {:else}
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 576 512"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zm233.32-51.08c-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 78.98-39.55 152.09-105.82 195.58-11.17 7.32-14.29 22.34-6.95 33.5 7.04 10.71 21.93 14.56 33.51 6.95C528.27 439.58 576 351.33 576 256S528.27 72.43 448.35 19.97zM480 256c0-63.53-32.06-121.94-85.77-156.24-11.19-7.14-26.03-3.82-33.12 7.46s-3.78 26.21 7.41 33.36C408.27 165.97 432 209.11 432 256s-23.73 90.03-63.48 115.42c-11.19 7.14-14.5 22.07-7.41 33.36 6.51 10.36 21.12 15.14 33.12 7.46C447.94 377.94 480 319.54 480 256zm-141.77-76.87c-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61C327.98 228.28 336 241.63 336 256c0 14.38-8.02 27.72-20.92 34.81-11.61 6.41-15.84 21-9.45 32.61 6.43 11.66 21.05 15.8 32.61 9.45 28.23-15.55 45.77-45 45.77-76.88s-17.54-61.32-45.78-76.86z"
            /></svg
          >
        {/if}
      </AppButton>
    </div>
    <!-- TWO PAIRS SIDE BY SIDE, not four buttons in one row: merging FOLDS this layer into its
         neighbour and deletes it, moving only reorders, and reading them as one strip is what would
         let a mis-aimed tap destroy a layer. Destructive pair on the left, harmless pair on the
         right where the move buttons already were.
         The bounds are also the single-layer guard: with one layer left, `currentLayer` is both 0
         and `instruments.length - 1`, so both merges are disabled with nothing to merge into. -->
    <div class="row" style="margin-top:0.4rem;gap:0.3rem">
      <div class="column" style="flex:1;gap:0.3rem">
        <AppButton
          onclick={() => onMerge(-1)}
          disabled={disabled || currentLayer === 0}
          class="flex-centered"
          style="padding:calc(0.5rem - var(--instrument-settings-button-trim)) 0.5rem"
        >
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 576 512"
            style="margin-right:0.2rem"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M32 96h512c17.7 0 32-14.3 32-32s-14.3-32-32-32H32C14.3 32 0 46.3 0 64s14.3 32 32 32M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L96 237.3V448c0 17.7 14.3 32 32 32s32-14.3 32-32V237.3l41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96c-12.5-12.5-32.8-12.5-45.3 0zm320 45.3c12.5 12.5 32.8 12.5 45.3 0l41.3-41.4V448c0 17.7 14.3 32 32 32s32-14.3 32-32V237.3l41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3"
            /></svg
          >
          {t('instrument_settings:merge_up')}
        </AppButton>
        <AppButton
          onclick={() => onMerge(1)}
          disabled={disabled || currentLayer === instruments.length - 1}
          class="flex-centered"
          style="padding:calc(0.5rem - var(--instrument-settings-button-trim)) 0.5rem"
        >
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 576 512"
            style="margin-right:0.2rem"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M544 416H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h512c17.7 0 32-14.3 32-32s-14.3-32-32-32m22.6-137.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L480 274.7V64c0-17.7-14.3-32-32-32s-32 14.3-32 32v210.7l-41.4-41.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0zm-320-45.3c-12.5-12.5-32.8-12.5-45.3 0L160 274.7V64c0-17.7-14.3-32-32-32S96 46.3 96 64v210.7l-41.4-41.3c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0l96-96c12.5-12.5 12.5-32.8 0-45.3z"
            /></svg
          >
          {t('instrument_settings:merge_down')}
        </AppButton>
      </div>
      <div class="column" style="flex:1;gap:0.3rem">
        <AppButton
          onclick={() => onChangePosition(-1)}
          disabled={disabled || currentLayer === 0}
          class="flex-centered"
          style="padding:calc(0.5rem - var(--instrument-settings-button-trim)) 0.5rem"
        >
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 448 512"
            style="margin-right:0.2rem"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M34.9 289.5l-22.2-22.2c-9.4-9.4-9.4-24.6 0-33.9L207 39c9.4-9.4 24.6-9.4 33.9 0l194.3 194.3c9.4 9.4 9.4 24.6 0 33.9L413 289.4c-9.5 9.5-25 9.3-34.3-.4L264 168.6V456c0 13.3-10.7 24-24 24h-32c-13.3 0-24-10.7-24-24V168.6L69.2 289.1c-9.3 9.8-24.8 10-34.3.4z"
            /></svg
          >
          {t('instrument_settings:move_up')}
        </AppButton>
        <AppButton
          onclick={() => onChangePosition(1)}
          disabled={disabled || currentLayer === instruments.length - 1}
          class="flex-centered"
          style="padding:calc(0.5rem - var(--instrument-settings-button-trim)) 0.5rem"
        >
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 448 512"
            style="margin-right:0.2rem"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z"
            /></svg
          >
          {t('instrument_settings:move_down')}
        </AppButton>
      </div>
    </div>
    <div class="row space-between" style="margin-top:0.4rem">
      <AppButton
        class="row-centered"
        style="padding:calc(0.4rem - var(--instrument-settings-button-trim)) 0.4rem;width:fit-content"
        onclick={onDelete}
        {disabled}
      >
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 448 512"
          style="color:var(--red);margin-right:0.3rem"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
          /></svg
        >
        {t('common:delete')}
      </AppButton>
      <AppButton
        onclick={onClose}
        style="padding:calc(0.4rem - var(--instrument-settings-button-trim)) 0.4rem;width:fit-content"
      >
        {t('common:ok')}
      </AppButton>
    </div>
  </div>
{/if}

<style>
  .floating-instrument-settings {
    /* HOW MUCH TO TAKE OFF THE ACTION BUTTONS' TOP AND BOTTOM PADDING, subtracted inline by the
       buttons themselves (merge/move, delete/OK). A custom property and not a rule of its own
       because those paddings are inline styles, which no media query can override. Zero here, so
       the desktop popup is untouched; the mobile block below is where it earns its keep. */
    --instrument-settings-button-trim: 0rem;
    position: absolute;
    width: 17rem;
    background-color: var(--menu-background);
    color: var(--menu-background-text);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    border-radius: 0.4rem;
    border: solid 2px var(--secondary);
    top: 3.4rem;
    margin-left: 6.6rem;
    z-index: 10;
    animation:
      fadeIn 0.2s,
      delayBackdrop 0.2s forwards;
  }

  /* THE COMPOSER'S MOBILE BREAKPOINT, the same query App.css states it with - this popup's own half
     of that block. */
  @media only screen and (max-width: 1000px) {
    .floating-instrument-settings {
      top: 0.4rem;
      padding: 0.5rem;
      margin-left: 5.8rem;
      gap: 0.3rem;
      /* The popup has the same rows to fit in a shorter viewport here, so its action buttons give
         up 0.1rem off each of their top and bottom edges. Horizontal padding is left alone. */
      --instrument-settings-button-trim: 0.1rem;
    }
  }
</style>
