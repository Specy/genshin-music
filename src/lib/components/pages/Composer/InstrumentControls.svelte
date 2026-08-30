<script lang="ts">
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { InstrumentData } from '$core/Songs/SongClasses';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import InstrumentSettingsPopup from './InstrumentSettingsPopup.svelte';

  let {
    instruments,
    selected,
    usedLayers,
    onLayerSelect,
    onInstrumentChange,
    onInstrumentDelete,
    onInstrumentAdd,
    onChangePosition,
    onMerge,
    onEditGroupStart,
    onEditGroupEnd,
    onSettingsOpenChange,
    songLocked = false,
  }: {
    instruments: InstrumentData[];
    selected: number;
    usedLayers: ReadonlySet<number>;
    onLayerSelect: (index: number) => void;
    onInstrumentChange: (instrument: InstrumentData, index: number) => void;
    onInstrumentDelete: (index: number) => void;
    onInstrumentAdd: () => void;
    onChangePosition: (direction: 1 | -1) => void;
    onMerge: (direction: 1 | -1) => void;
    /**
     * Forwarded straight to the settings popup, whose continuous inputs (the volume drag, the
     * alias field) emit one `onInstrumentChange` per tick — see its own group bookkeeping.
     */
    onEditGroupStart?: () => void;
    onEditGroupEnd?: () => void;
    songLocked?: boolean;
    /**
     * Whether the layer settings popup is up, which is the same thing as whether it is taking
     * outside clicks as dismissals — its clickOutside is `active: true` for as long as it is
     * mounted, so being open IS the predicate. Reported for the composer's edit guard, the way
     * ComposerMenu reports its own (see Composer.svelte's `overlayDismissesClicks`).
     */
    onSettingsOpenChange?: (open: boolean) => void;
  } = $props();

  let isEditing = $state(false);

  //REPORTED FROM THE STATE ITSELF and not from the writes that move it: the popup is opened by the
  //row's settings button and closed from four places (the close button, click-outside, and the
  //delete/merge paths that dismiss it once the layer they were showing is gone), so notifying at
  //each write is a list the next new call site silently drops off.
  $effect(() => {
    onSettingsOpenChange?.(isEditing);
  });

  // Drives the dim cue below: while it holds, every row that is NOT soloed is silent, so the
  // panel says so. It is the same predicate isTrackAudible derives from — read here rather than
  // imported because the cue is about the solo SET, not about any one track's audibility (a
  // muted track is already marked by its own icon).
  const hasSolo = $derived(instruments.some((ins) => ins.solo));

  function setNotEditing() {
    isEditing = false;
  }

  // Scrolls the row into view when it becomes selected, including on first mount if it's
  // already selected.
  function scrollIntoViewOnSelect(node: HTMLElement, isSelected: boolean) {
    function run(selected: boolean) {
      if (selected) node.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
    run(isSelected);
    return {
      update: run,
    };
  }
</script>

{#if isEditing}
  <InstrumentSettingsPopup
    instrument={instruments[selected]}
    currentLayer={selected}
    {instruments}
    onChange={(ins) => onInstrumentChange(ins, selected)}
    onDelete={() => {
      onInstrumentDelete(selected);
      setNotEditing();
    }}
    {onChangePosition}
    onMerge={(direction) => {
      onMerge(direction);
      //the panel is showing a layer that may no longer exist (a merge removes one), and its own
      //`instrument` prop is read by index - the same close the delete path does, for the same reason
      setNotEditing();
    }}
    {onEditGroupStart}
    {onEditGroupEnd}
    onClose={setNotEditing}
    disabled={songLocked}
  />
{/if}
<div class="column instruments-button-wrapper">
  {#each instruments as ins, i (ins.name + i)}
    {@const isSelected = i === selected}
    {@const isUsedBySelectedColumn = !isSelected && usedLayers.has(i)}
    {@const passiveIconBase = ThemeProvider.getText('primary')}
    {@const passiveIcon = passiveIconBase.isDark()
      ? passiveIconBase.lighten(0.2)
      : passiveIconBase.darken(0.15)}
    <div
      class={[
        'instrument-button',
        'flex-centered',
        isUsedBySelectedColumn && 'instrument-button-used',
        // Height only, and never on the selected row: that row shows the bar unconditionally, so
        // its own taller height already accounts for one.
        !isSelected && ins.solo && 'instrument-button-with-solo',
        isSelected && 'instrument-button-selected',
        hasSolo && !ins.solo && 'instrument-button-outside-solo',
      ]}
      use:scrollIntoViewOnSelect={isSelected}
    >
      {#if !isSelected}
        <div class="row" style="position:absolute;gap:0.2rem;top:0.2rem;left:0.3rem">
          {#if !ins.visible}
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 640 512"
              height="14"
              width="14"
              xmlns="http://www.w3.org/2000/svg"
              style="color:{passiveIcon.hex()}"
              ><path
                d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"
              /></svg
            >
          {/if}
          {#if ins.muted}
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 512 512"
              height="14"
              width="14"
              xmlns="http://www.w3.org/2000/svg"
              style="color:{passiveIcon.hex()}"
              ><path
                d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zM461.64 256l45.64-45.64c6.3-6.3 6.3-16.52 0-22.82l-22.82-22.82c-6.3-6.3-16.52-6.3-22.82 0L416 210.36l-45.64-45.64c-6.3-6.3-16.52-6.3-22.82 0l-22.82 22.82c-6.3 6.3-6.3 16.52 0 22.82L370.36 256l-45.63 45.63c-6.3 6.3-6.3 16.52 0 22.82l22.82 22.82c6.3 6.3 16.52 6.3 22.82 0L416 301.64l45.64 45.64c6.3 6.3 16.52 6.3 22.82 0l22.82-22.82c6.3-6.3 6.3-16.52 0-22.82L461.64 256z"
              /></svg
            >
          {/if}
        </div>
      {/if}
      {#if !isSelected}
        <div style="position:absolute;top:0.4rem;right:0.4rem;height:fit-content">
          {#if ins.icon === 'circle'}
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 512 512"
              height="8"
              width="8"
              xmlns="http://www.w3.org/2000/svg"
              style="color:{passiveIcon.hex()};display:block"
              ><path
                d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z"
              /></svg
            >
          {/if}
          {#if ins.icon === 'border'}
            <!-- QUIRK: the inline stroke-width:2px deliberately overrides this icon's own stroke-width="0" to outline the glyph over its fill. Old did the same; removing either one changes how it renders. -->
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 24 24"
              height="12"
              width="12"
              xmlns="http://www.w3.org/2000/svg"
              style="color:{passiveIcon.hex()};display:block;margin-right:-2px;margin-top:-2px;stroke-width:2px"
              ><path
                d="M17 2H7C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5zm3 15c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3h10c1.654 0 3 1.346 3 3v10z"
              /></svg
            >
          {/if}
          {#if ins.icon === 'line'}
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 448 512"
              height="8"
              width="8"
              xmlns="http://www.w3.org/2000/svg"
              style="color:{passiveIcon.hex()};display:block"
              ><path
                d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
              /></svg
            >
          {/if}
        </div>
      {/if}

      <AppButton
        onclick={() => onLayerSelect(i)}
        style="background-color:transparent;width:100%"
        class="flex-grow flex-centered instrument-name-button"
      >
        <span class="text-ellipsis" style="width:6rem">
          {ins.alias || tInstrument(ins.name)}
        </span>
      </AppButton>

      <!-- The bar is the always-visible way OUT of a solo: an unselected row that is soloed shows
           it alone, under the name and without the gear/eye pair, so un-soloing a track never
           costs a selection change. Everything else on the row stays selection-only. -->
      {#if isSelected || ins.solo}
        <div class="instrument-settings">
          {#if isSelected}
            <AppButton
              onclick={() => (isEditing = !isEditing)}
              ariaLabel="Settings"
              toggled={isEditing}
              class="flex-centered"
            >
              <svg
                stroke="currentColor"
                fill="currentColor"
                stroke-width="0"
                viewBox="0 0 512 512"
                height="15"
                width="15"
                xmlns="http://www.w3.org/2000/svg"
                ><path
                  d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
                /></svg
              >
            </AppButton>
            <AppButton
              onclick={() => onInstrumentChange(ins.clone().set({ visible: !ins.visible }), i)}
              disabled={songLocked}
              ariaLabel={ins.visible ? 'Hide' : 'Show'}
              toggled={!ins.visible}
              class="flex-centered"
            >
              {#if ins.visible}
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  stroke-width="0"
                  viewBox="0 0 576 512"
                  height="16"
                  width="16"
                  xmlns="http://www.w3.org/2000/svg"
                  ><path
                    d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"
                  /></svg
                >
              {:else}
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  stroke-width="0"
                  viewBox="0 0 640 512"
                  height="16"
                  width="16"
                  xmlns="http://www.w3.org/2000/svg"
                  ><path
                    d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"
                  /></svg
                >
              {/if}
            </AppButton>
          {/if}
          <!-- Rides the same funnel the eye does (editInstrument -> setInstrument + autosave +
               the ADR-0006 resync), and describes only THIS entry: solo never writes a field on
               another track, the set is derived from the flags at play time. -->
          <AppButton
            onclick={() => onInstrumentChange(ins.clone().set({ solo: !ins.solo }), i)}
            disabled={songLocked}
            toggled={ins.solo}
            class="flex-centered instrument-solo-button"
          >
            {t('instrument_settings:solo')}
          </AppButton>
        </div>
      {/if}
    </div>
  {/each}
  <div style="min-height:1rem"></div>
  <AppButton
    disabled={songLocked}
    onclick={(e) => {
      onInstrumentAdd();
      setTimeout(() => {
        (e.currentTarget as HTMLElement)?.scrollIntoView();
      }, 50);
    }}
    ariaLabel={t('common:add_new_instrument')}
    class="new-instrument-button flex-centered"
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

<style>
  /* THE THREE `AppButton`s OF A ROW WEAR THEIR CLASS ON A CHILD COMPONENT'S ROOT — the name button,
     the "add layer" button and the solo bar are all `class` props handed to AppButton, so Svelte
     cannot see them on any element of this file and would prune a plain selector. Scoped through
     the wrapper this panel does own, which is also what keeps them beating `.app-button`'s own
     padding and background in App.css whatever order the two stylesheets end up in. */
  .instruments-button-wrapper :global(.instrument-name-button) {
    padding: 0;
    font-size: 0.8rem;
  }

  .instruments-button-wrapper {
    overflow-y: auto;
    overflow-x: hidden;
    background-color: var(--primary-darken-10);
    border-radius: 0.3rem;
    margin-top: 0.2rem;
    z-index: 2;
  }

  .instruments-button-wrapper :global(.new-instrument-button) {
    padding: 0.4rem;
    background-color: transparent;
    margin-top: auto;
    align-items: center;
  }

  /* Pointer-only (see App.css's `.app-button:hover`): adding a layer keeps this button mounted at
     the foot of the list, so on touch the darkened plate would stay behind after every tap. */
  @media (hover: hover) {
    .instruments-button-wrapper :global(.new-instrument-button:hover) {
      background-color: var(--primary-darken-10);
    }
  }

  .instruments-button-wrapper::-webkit-scrollbar-thumb {
    background: var(--secondary);
  }

  /* NOTHING IN A LAYER ROW ANIMATES (user decision 2026-08-22). `.instrument-button-used` — the
     highlight saying "this layer plays in the column under the cursor" — is toggled on every row on
     every column change, which during playback is many times a second: a transition would leave each
     row mid-fade between two states that have already moved on, and would put a compositing job on
     the main thread per row per column for a cue that is only readable when it changes INSTANTLY.
     Stated explicitly rather than left to the default, because these rows are `.app-button`s in the
     markup and that base rule DOES carry a transition — see the rule at the end of this block. */
  .instrument-button {
    height: 3rem;
    min-height: 3rem;
    position: relative;
    flex-direction: column;
    border-radius: 0.3rem;
    border-bottom: solid 2px var(--secondary);
    border-radius: 0;
    transition: none;
  }

  .instrument-button-used {
    background-color: rgba(var(--composer-secondary-layer-rgb), 0.2);
  }

  /* An unselected row that carries the solo bar, and only that row: the selected one below is
     taller anyway because it always shows the bar. Declared first so the selected height wins
     when a row is both. */
  .instrument-button-with-solo {
    height: 4.6rem;
    min-height: 4.6rem;
  }

  .instrument-button-selected {
    height: 6rem;
    min-height: 6rem;
    background-color: var(--composer-main-layer);
    color: var(--composer-main-layer-text);
  }

  /* The dim cue for a track outside the solo set — the selected row included, since it is just as
     silent as the rest and the panel stays honest about that. Opacity on the whole row, so the
     mute/hidden icons dim WITH it rather than disappearing. */
  .instrument-button-outside-solo {
    opacity: 0.55;
  }

  .instrument-button-selected :global(.app-button) {
    color: var(--composer-main-layer-text);
  }

  /* THE SAME "NOTHING FADES" RULE, one level down: the name button and the settings buttons inside a
     row are `.app-button`s in their own right and inherit none of the row's `transition: none`, they
     carry the base rule's own. Playback toggles `.instrument-button-used` on this row on every column,
     so anything in it that fades is either mid-fade against a state that has already changed again or
     a per-column paint for no visible gain — and the two terms this rule used to keep alive bought
     nothing anyway: the name button's own background is transparent, so its `background-color` never
     visibly fired, and `filter` is unset below. `!important` like the two `unset`s beside it, so this
     holds against a state rule of .app-button's own however specific it is. */
  .instrument-button :global(.app-button) {
    transition: none !important;
    transform: unset !important;
    filter: unset !important;
  }

  .instrument-settings {
    font-size: 0.8rem;
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  /* One resting surface for the gear, the eye and the solo bar alike, in the secondary pair —
     which carries its own text colour, so nothing here depends on what the row underneath
     inherits. DECLARED AFTER `.instrument-button-selected .app-button`: equal specificity, so
     source order is what keeps the secondary text colour on the selected row too.
     `.app-button.active` then paints all three the accent pair when their state is on.
     The fixed height is what makes the gear and the eye the same box despite their 15px/16px
     icons — `height: fit-content` sized each to its own glyph. */
  .instrument-settings :global(.app-button) {
    padding: 0.1rem;
    height: 1.2rem;
    background-color: var(--secondary);
    color: var(--secondary-text);
    min-width: unset;
    flex: 1;
  }

  /* The bar is a row of its own under the gear|eye pair, and the only child on an unselected
     soloed row — 1 / -1 spans the grid in both cases. */
  .instruments-button-wrapper :global(.instrument-solo-button) {
    grid-column: 1 / -1;
    font-size: 0.75rem;
  }

  /* THE COMPOSER'S MOBILE BREAKPOINT, the same query App.css states it with - this panel's own half
     of that block. */
  @media only screen and (max-width: 1000px) {
    .instrument-button {
      height: 2.6rem;
      min-height: 2.6rem;
    }

    .instrument-button-with-solo {
      height: 3.8rem;
      min-height: 3.8rem;
    }

    .instrument-button-selected {
      height: 4.5rem;
      min-height: 4.5rem;
    }

    /* `align-items: flex-end` used to sit here too, and it never once applied: the button's own
       markup above carries Utility.scss's `.flex-centered`, which sets `align-items: center` at
       the same one-class specificity and from a stylesheet imported after App.css. Prefixing this
       rule with the wrapper (which is what keeps its padding beating `.app-button`'s) would have
       out-specified `.flex-centered` and finally let it through - bottom-aligning the layer label
       for the first time since it was written. Deleted rather than moved: the component's own
       markup asks for centred, so centred is the intent (user decision 2026-08-25). */
    .instruments-button-wrapper :global(.instrument-name-button) {
      padding-bottom: 0rem;
    }

    .instruments-button-wrapper :global(.new-instrument-button) {
      padding: 0;
      padding-bottom: 0.3rem;
    }
  }
</style>
