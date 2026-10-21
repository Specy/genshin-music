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

  type SectionId = 'sound' | 'mix' | 'display' | 'arrange';

  /**
   * WHICH SECTIONS ARE OPEN, kept for the whole visit and not per popup: the panel is opened and
   * closed constantly while composing, and collapsing a section you never touch is only worth the
   * tap if it stays collapsed. Seeded once, on the first open - everything on desktop, only Sound
   * under the composer's mobile breakpoint, where four open sections are taller than a landscape
   * phone and the body would scroll before showing what most opens are for.
   */
  const openSections = $state<Record<SectionId, boolean>>({
    sound: true,
    mix: true,
    display: true,
    arrange: true,
  });
  let sectionsSeeded = false;

  function seedSections() {
    if (sectionsSeeded) return;
    sectionsSeeded = true;
    if (globalThis.matchMedia?.('only screen and (max-width: 1000px)').matches) {
      openSections.mix = false;
      openSections.display = false;
      openSections.arrange = false;
    }
  }
</script>

<script lang="ts">
  import type { Pitch } from '$lib/games/types';
  import { slide } from 'svelte/transition';
  import { InstrumentData } from '$core/Songs/SongClasses';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import InstrumentSpecificSettings from '$cmp/inputs/InstrumentSpecificSettings.svelte';
  import { clickOutside } from '$lib/utils/clickOutside';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import PitchSelect from '$cmp/inputs/PitchSelect.svelte';
  import InstrumentSelect from '$cmp/inputs/InstrumentSelect.svelte';
  import Select from '$cmp/inputs/Select.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import IconPen from '~icons/fa6-solid/pen';
  import IconXmark from '~icons/fa6-solid/xmark';
  import IconChevronDown from '~icons/fa6-solid/chevron-down';
  import IconVolumeHigh from '~icons/fa6-solid/volume-high';
  import IconVolumeXmark from '~icons/fa6-solid/volume-xmark';
  import IconArrowUp from '~icons/fa6-solid/arrow-up';
  import IconArrowDown from '~icons/fa6-solid/arrow-down';
  import IconArrowsUpToLine from '~icons/fa6-solid/arrows-up-to-line';
  import IconArrowsDownToLine from '~icons/fa6-solid/arrows-down-to-line';
  import IconTrash from '~icons/fa6-solid/trash';

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
    songPitch,
    songReverb,
    disabled = false,
  }: {
    currentLayer: number;
    instruments: InstrumentData[];
    instrument: InstrumentData;
    /** The song's own Basepoint, named on the option that follows it. */
    songPitch: Pitch;
    /** The song's own reverb, named on the option that follows it. */
    songReverb: boolean;
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

  seedSections();

  /**
   * Read when a section toggles, not at mount: svelte/motion's `prefersReducedMotion` builds its
   * MediaQuery on import, which throws wherever `matchMedia` is missing (the test DOM).
   */
  const sectionSlide = () => ({
    duration: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
  });

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

{#snippet sectionHeader(id: SectionId, label: string)}
  <button
    type="button"
    class="settings-section-header"
    aria-expanded={openSections[id]}
    onclick={() => (openSections[id] = !openSections[id])}
  >
    {label}
    <IconChevronDown aria-hidden="true" />
  </button>
{/snippet}

{#if !instrument}
  <div class="floating-instrument-settings">
    <DecoratedCard
      class="settings-card settings-card-empty box-shadow"
      size="1.2rem"
      offset="0.1rem"
    >
      {t('instrument_settings:no_instrument_selected')}
    </DecoratedCard>
  </div>
{:else}
  <div
    class="floating-instrument-settings"
    use:clickOutside={{ active: true, ignoreFocusable: true, onOutside: onClose }}
  >
    <!-- the corner stars the composer's tools card wears, which is why this is a card INSIDE the
         root and not the root itself: the root has to be an element to carry clickOutside -->
    <DecoratedCard class="settings-card box-shadow" size="1.2rem" offset="0.1rem">
      <div class="settings-header">
        <!-- a <label>, so a press on the pen lands in the field it decorates -->
        <label class="settings-name">
          <input
            type="text"
            maxlength="50"
            aria-label={t('instrument_settings:layer_name')}
            value={instrument.alias}
            {disabled}
            onfocus={startAliasGroup}
            onblur={endAliasGroup}
            oninput={(e) => onChange(edited({ alias: e.currentTarget.value }))}
            placeholder={tInstrument(instrument.name)}
          />
          <IconPen aria-hidden="true" />
        </label>
        <AppButton
          class="settings-close flex-centered"
          ariaLabel={t('common:close')}
          onclick={onClose}
        >
          <IconXmark />
        </AppButton>
      </div>

      <div class="settings-body">
        <section>
          {@render sectionHeader('sound', t('instrument_settings:section_sound'))}
          {#if openSections.sound}
            <div class="settings-section-content" transition:slide={sectionSlide()}>
              <label class="settings-row">
                <span>{t('common:instrument')}</span>
                <InstrumentSelect
                  style="width:var(--settings-control-width)"
                  selected={instrument.name}
                  {disabled}
                  onChange={(name) => onChange(instrument.withInstrument(name))}
                />
              </label>
              <label class="settings-row">
                <span>{t('common:pitch')}</span>
                <PitchSelect
                  style="padding:0.3rem;width:var(--settings-control-width)"
                  selected={instrument.pitch as Pitch}
                  {disabled}
                  onChange={(pitch) => onChange(edited({ pitch }))}
                >
                  <option value="">
                    {t('instrument_settings:use_song_pitch')} ({songPitch})
                  </option>
                </PitchSelect>
              </label>
              <label class="settings-row">
                <span>{t('common:reverb')}</span>
                <Select
                  style="padding:0.3rem;width:var(--settings-control-width)"
                  onchange={(e) => {
                    onChange(edited({ reverbOverride: toReverbValue(e.currentTarget.value) }));
                  }}
                  value={getReverbValue(instrument.reverbOverride)}
                  {disabled}
                >
                  <option value="Unset">
                    {t('instrument_settings:use_song_reverb')} ({songReverb
                      ? t('common:on')
                      : t('common:off')})
                  </option>
                  <option value="On">
                    {t('common:on')}
                  </option>
                  <option value="Off">
                    {t('common:off')}
                  </option>
                </Select>
              </label>
              <!-- What only this layer's instrument has (ADR-0018), always after the settings every layer has -->
              <InstrumentSpecificSettings
                instrument={instrument.name}
                settings={instrument.settings}
                selectStyle="width:var(--settings-control-width)"
                {disabled}
                onChange={(settings) => onChange(edited({ settings }))}
              />
            </div>
          {/if}
        </section>

        <section>
          {@render sectionHeader('mix', t('instrument_settings:section_mix'))}
          {#if openSections.mix}
            <div class="settings-section-content" transition:slide={sectionSlide()}>
              <div class="settings-row">
                <div class="row items-center" style="gap:0.4rem">
                  {t('instrument_settings:volume')}
                  <HelpTooltip buttonStyle="width:1.1rem;height:1.1rem" width={10}>
                    {t('instrument_settings:volume_high_warning')}
                  </HelpTooltip>
                </div>
                <span
                  style={instrument.volume > 100
                    ? `color:hsl(0, ${-40 + instrument.volume}%, 61%)`
                    : ''}
                >
                  {instrument.volume}%
                </span>
              </div>
              <div class="settings-volume">
                <AppButton
                  class="settings-mute flex-centered"
                  toggled={instrument.muted}
                  {disabled}
                  onclick={() => {
                    if (instrument.volume === 0 && !instrument.muted) return;
                    onChange(edited({ muted: !instrument.muted }));
                  }}
                >
                  {#if instrument.muted || instrument.volume === 0}
                    <IconVolumeXmark />
                  {:else}
                    <IconVolumeHigh />
                  {/if}
                </AppButton>
                <input
                  type="range"
                  aria-label={t('instrument_settings:volume')}
                  style="flex:1;min-width:0;opacity:{instrument.muted ? '0.6' : '1'}"
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
              </div>
            </div>
          {/if}
        </section>

        <section>
          {@render sectionHeader('display', t('instrument_settings:section_display'))}
          {#if openSections.display}
            <div class="settings-section-content" transition:slide={sectionSlide()}>
              <label class="settings-row">
                <span>{t('instrument_settings:note_icon')}</span>
                <Select
                  style="padding:0.3rem;width:var(--settings-control-width)"
                  onchange={(e) =>
                    onChange(edited({ icon: e.currentTarget.value as InstrumentNoteIcon }))}
                  value={instrument.icon}
                  {disabled}
                >
                  {#each noteIcons as iconKind (iconKind)}
                    <option value={iconKind}>{t(`common:${iconKind}`)}</option>
                  {/each}
                </Select>
              </label>
            </div>
          {/if}
        </section>

        <section>
          {@render sectionHeader('arrange', t('instrument_settings:section_arrange'))}
          {#if openSections.arrange}
            <!-- TWO LABELLED ROWS, never one strip of four: merging FOLDS this layer into its
               neighbour and deletes it, moving only reorders, and reading them as one strip is
               what would let a mis-aimed tap destroy a layer. The harmless pair goes first.
               The bounds are also the single-layer guard: with one layer left, `currentLayer` is
               both 0 and `instruments.length - 1`, so both merges are disabled with nothing to
               merge into. -->
            <div class="settings-section-content" transition:slide={sectionSlide()}>
              <div class="settings-row" role="group" aria-label={t('instrument_settings:position')}>
                <span>{t('instrument_settings:position')}</span>
                <div class="settings-pair">
                  <AppButton
                    onclick={() => onChangePosition(-1)}
                    disabled={disabled || currentLayer === 0}
                    class="settings-arrange-button flex-centered"
                  >
                    <IconArrowUp />
                    {t('instrument_settings:position_up')}
                  </AppButton>
                  <AppButton
                    onclick={() => onChangePosition(1)}
                    disabled={disabled || currentLayer === instruments.length - 1}
                    class="settings-arrange-button flex-centered"
                  >
                    <IconArrowDown />
                    {t('instrument_settings:position_down')}
                  </AppButton>
                </div>
              </div>
              <div
                class="settings-row"
                role="group"
                aria-label={t('instrument_settings:merge_into')}
              >
                <span>{t('instrument_settings:merge_into')}</span>
                <div class="settings-pair">
                  <AppButton
                    onclick={() => onMerge(-1)}
                    disabled={disabled || currentLayer === 0}
                    class="settings-arrange-button flex-centered"
                  >
                    <IconArrowsUpToLine />
                    {t('instrument_settings:merge_above')}
                  </AppButton>
                  <AppButton
                    onclick={() => onMerge(1)}
                    disabled={disabled || currentLayer === instruments.length - 1}
                    class="settings-arrange-button flex-centered"
                  >
                    <IconArrowsDownToLine />
                    {t('instrument_settings:merge_below')}
                  </AppButton>
                </div>
              </div>
            </div>
          {/if}
        </section>
      </div>

      <div class="settings-footer">
        <AppButton class="settings-delete row-centered" onclick={onDelete} {disabled}>
          <IconTrash />
          {t('instrument_settings:delete_layer')}
        </AppButton>
        <AppButton class="settings-done" onclick={onClose}>
          {t('common:done')}
        </AppButton>
      </div>
    </DecoratedCard>
  </div>
{/if}

<style>
  /* The root only places the panel; the card inside it is the panel. */
  .floating-instrument-settings {
    --settings-padding-x: 0.7rem;
    /* ONE WIDTH FOR EVERY CONTROL, the Variant row's included, so they line up in a column whatever
       their row is indented by. A label too long for what is left narrows its control rather than
       breaking mid-word. */
    --settings-control-width: 10.5rem;
    position: absolute;
    width: 19.5rem;
    top: 3.4rem;
    margin-left: 6.6rem;
    z-index: 10;
    animation: fadeIn 0.2s;
  }

  /* THE PANEL IS THREE BANDS: a header and a footer that always show, and a body between them that
     scrolls. Its height is capped by the viewport below `top`, so whatever the open sections add,
     Done and Delete stay on screen. NO `overflow: hidden` for the rounded corners to clip with: the
     section bands only ever run inside the body, never into a corner, and clipping would cut off
     the card's corner stars, which hang half outside it.
     The card is DecoratedCard's own root div, so it is reached through the panel (see below). */
  .floating-instrument-settings :global(.settings-card) {
    display: flex;
    flex-direction: column;
    background-color: var(--menu-background);
    color: var(--menu-background-text);
    border-radius: 0.4rem;
    border: solid 2px var(--secondary);
    /* A FLOOR, so collapsing sections does not shrink the panel under the pointer and move the
       footer to wherever the last open section now ends. min() keeps it from beating the cap on
       a short window. */
    min-height: min(25rem, calc(100dvh - 4rem));
    max-height: calc(100dvh - 4rem);
    /* on the card and not the root, so the blur is rounded with the border rather than square */
    animation: delayBackdrop 0.2s forwards;
  }

  .floating-instrument-settings :global(.settings-card-empty) {
    min-height: unset;
    padding: 0.6rem var(--settings-padding-x);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.4rem 0.4rem var(--settings-padding-x);
  }

  .settings-name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: text;
    border-bottom: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
  }

  .settings-name:focus-within {
    border-bottom: 1px solid var(--accent);
  }

  .settings-name input {
    flex: 1;
    min-width: 0;
    padding: 0.15rem 0;
    background-color: transparent;
    border: none;
    outline: none;
    color: inherit;
    font: inherit;
    font-size: 1.05rem;
    text-overflow: ellipsis;
  }

  .settings-name input:disabled {
    cursor: not-allowed;
  }

  .settings-name :global(svg) {
    flex-shrink: 0;
    font-size: 0.7rem;
    opacity: 0.5;
  }

  /* THE BUTTONS BELOW WEAR THEIR CLASS ON A CHILD COMPONENT'S ROOT (AppButton), which Svelte cannot
     see from here and would prune - so they are reached through the panel, which also keeps them
     beating `.app-button`'s own padding and background in App.css whatever the stylesheet order. */
  .floating-instrument-settings :global(.settings-close) {
    min-width: unset;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    flex-shrink: 0;
    background-color: transparent;
    color: inherit;
    border-radius: 0.3rem;
  }

  .settings-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .settings-body::-webkit-scrollbar-thumb {
    background: var(--secondary);
  }

  .settings-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.45rem var(--settings-padding-x);
    background-color: var(--menu-background-layer-10);
    color: inherit;
    border: none;
    border-top: 1px solid var(--menu-background-layer-15);
    font-family: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .settings-section-header:active {
    background-color: var(--menu-background-layer-20);
  }

  /* Pointer-only, for the reason given at App.css's `.app-button:hover`. */
  @media (hover: hover) {
    .settings-section-header:hover {
      background-color: var(--menu-background-layer-15);
    }
  }

  .settings-section-header :global(svg) {
    font-size: 0.65rem;
    opacity: 0.7;
    transition: rotate 0.15s;
  }

  /* closed points at the band's label, open points down into what it opened */
  .settings-section-header[aria-expanded='false'] :global(svg) {
    rotate: -90deg;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-section-header :global(svg) {
      transition: none;
    }
  }

  .settings-section-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem var(--settings-padding-x) 0.7rem;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .settings-volume {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .floating-instrument-settings :global(.settings-mute) {
    min-width: unset;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    flex-shrink: 0;
    border-radius: 2rem;
  }

  .settings-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    width: var(--settings-control-width);
  }

  .floating-instrument-settings :global(.settings-arrange-button) {
    min-width: 0;
    gap: 0.3rem;
    padding: 0.35rem 0.3rem;
    font-size: 0.8rem;
  }

  .floating-instrument-settings :global(.settings-arrange-button svg) {
    flex-shrink: 0;
    font-size: 0.7rem;
  }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem var(--settings-padding-x);
    border-top: 1px solid var(--menu-background-layer-15);
  }

  /* RED MIXED TOWARDS THE PANEL'S OWN TEXT COLOUR, not var(--red) as it is: that one is the bright
     red the toasts paint as a background, and as text on the light default menu it falls under
     4.5:1. The text colour is dark on a light menu and light on a dark one, so the mix moves the red
     the way contrast needs on either. */
  .floating-instrument-settings :global(.settings-delete) {
    min-width: unset;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    margin-left: -0.5rem;
    background-color: transparent;
    color: color-mix(in srgb, var(--red) 70%, var(--menu-background-text));
  }

  .floating-instrument-settings :global(.settings-done) {
    padding: 0.45rem 1.4rem;
  }

  /* THE COMPOSER'S MOBILE BREAKPOINT, the same query App.css states it with - this popup's own half
     of that block. */
  @media only screen and (max-width: 1000px) {
    .floating-instrument-settings {
      --settings-padding-x: 0.6rem;
      --settings-control-width: 10rem;
      width: 18.5rem;
      top: 0.4rem;
      margin-left: 5.8rem;
    }

    .floating-instrument-settings :global(.settings-card) {
      min-height: unset;
      max-height: calc(100dvh - 0.8rem);
    }

    .settings-header {
      padding-top: 0.3rem;
      padding-bottom: 0.3rem;
    }

    .settings-name input {
      font-size: 0.95rem;
    }

    .settings-section-header {
      padding-top: 0.4rem;
      padding-bottom: 0.4rem;
    }

    .settings-section-content {
      gap: 0.4rem;
      padding: 0.5rem var(--settings-padding-x) 0.55rem;
      font-size: 0.9rem;
    }

    .settings-footer {
      padding: 0.4rem var(--settings-padding-x);
    }

    .floating-instrument-settings :global(.settings-done) {
      padding: 0.35rem 1.2rem;
    }
  }
</style>
