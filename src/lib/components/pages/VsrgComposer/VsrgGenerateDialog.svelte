<script lang="ts">
  import { songsStore } from '$stores/SongsStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import type { Song } from '$core/Songs/Song.svelte';
  import type { RecordedSong } from '$core/Songs/RecordedSong';
  import type { VsrgSong, VsrgSongKeys } from '$core/Songs/VsrgSong.svelte';
  import type { SnapPoint } from '$core/types';
  import {
    CHART_LEVELS,
    analyseSource,
    generateChart,
    proposeTracks,
    type ChartLevel,
    type ProminenceReason,
  } from '$core/Songs/vsrgGenerate';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import Switch from '$cmp/inputs/Switch.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import MultipleOptionSlider, { type Option } from '$cmp/MultipleOptionSlider.svelte';
  import IconWandMagicSparkles from '~icons/fa6-solid/wand-magic-sparkles';

  // Mounted and unmounted with the modal, like MidiParser: the `{#if}` in the page IS this
  // dialog's lifecycle, which is also how "closing releases ownership" is implemented - the id of
  // the song this dialog made lives in its own state and dies with it, so the next opening starts
  // a fresh song rather than overwriting one the user has since edited by hand.
  let {
    data,
    functions,
  }: {
    data: {
      /**
       * The library song the chart is laid over. The ORIGINAL, not the page's flattening:
       * setAudioSong reads its `id` (which toRecordedSong does not copy) and its roster, one
       * modifier per background track, and generation refuses a background song without both.
       */
      audioSong: Song;
      /** The same song's notes, flat and track-tagged - a ComposedSong arrives via toRecordedSong(0). */
      source: RecordedSong;
      /** The composer's current lane count, which is what the Lanes choice starts on. */
      keys: VsrgSongKeys;
      /** The composer's current snap point, so the generated grid matches the one it is edited on. */
      snapPoint: SnapPoint;
    };
    functions: {
      onClose: () => void;
      onOpenGenerated: (song: VsrgSong) => Promise<void>;
    };
  } = $props();

  type LaneChoice = '4' | '6';

  let level: ChartLevel = $state('normal');
  // svelte-ignore state_referenced_locally
  let keys: VsrgSongKeys = $state(data.keys);
  /**
   * The parts the user ticked, or null while the level's own proposal stands. A level change
   * clears it on purpose: choosing which part you take responsibility for is what a Chart Level
   * DOES here, so leaving a stale tick in place would show a selection no level ever proposed.
   */
  let manualSelection: number[] | null = $state(null);
  /**
   * The song this dialog created, and the only one a re-roll may overwrite. Null until the first
   * run, so the first run adds rather than replaces.
   */
  let ownedSongId: string | null = $state(null);
  let outcome: {
    level: ChartLevel;
    seed: number;
    rating: number;
    converged: boolean;
    performed: number[];
    doubled: number[];
  } | null = $state(null);
  let running = $state(false);

  const analysis = $derived(
    analyseSource(data.source, data.audioSong.instruments, data.source.bpm)
  );
  const proposal = $derived(proposeTracks(analysis, level));
  const ticked = $derived(manualSelection ?? proposal);

  const levelLabels = $derived({
    easy: t('vsrg_composer:generate.level_easy'),
    normal: t('vsrg_composer:generate.level_normal'),
    hard: t('vsrg_composer:generate.level_hard'),
  } satisfies Record<ChartLevel, string>);

  const levelOptions = $derived(
    CHART_LEVELS.map((value) => ({
      value,
      text: levelLabels[value],
      color: 'var(--accent)',
    })) satisfies Option<ChartLevel>[]
  );

  const laneOptions = $derived([
    { value: '4', text: '4', color: 'var(--accent)' },
    { value: '6', text: '6', color: 'var(--accent)' },
  ] satisfies Option<LaneChoice>[]);
  const selectedLanes = $derived<LaneChoice>(keys === 4 ? '4' : '6');

  const parts = $derived(
    data.audioSong.instruments.map((instrument, trackIndex) => {
      const candidate = analysis.candidates.find((entry) => entry.trackIndex === trackIndex);
      return {
        trackIndex,
        alias: partAlias(trackIndex),
        noteCount: analysis.tracks[trackIndex]?.noteCount ?? 0,
        ticked: ticked.includes(trackIndex),
        proposed: proposal.includes(trackIndex),
        // affordability is measured on this part ALONE, which is the question the row asks. Tick
        // several and the merged stream can still overrun the budget, so a part marked performable
        // may come back Doubled - the outcome below reports what actually happened.
        performable: candidate?.affordableAt[level] ?? false,
        reason: candidate === undefined ? '' : reasonText(candidate.reason),
      };
    })
  );

  const canRun = $derived(!running && ticked.length > 0);

  function partAlias(trackIndex: number): string {
    const instrument = data.audioSong.instruments[trackIndex];
    if (instrument === undefined) return '';
    return instrument.alias || tInstrument(instrument.name);
  }

  /** The prominence reason, assembled from flags - no English sentence is ever built in core. */
  function reasonText(reason: ProminenceReason): string {
    const fragments: string[] = [];
    if (reason.topVoice) fragments.push(t('vsrg_composer:generate.reason_top_voice'));
    if (reason.varied) fragments.push(t('vsrg_composer:generate.reason_varied'));
    if (reason.present) fragments.push(t('vsrg_composer:generate.reason_present'));
    if (reason.dense) fragments.push(t('vsrg_composer:generate.reason_dense'));
    return fragments.join(', ');
  }

  function parseLanes(value: LaneChoice): VsrgSongKeys {
    return value === '4' ? 4 : 6;
  }

  function selectLevel(value: ChartLevel) {
    level = value;
    manualSelection = null;
  }

  function togglePart(trackIndex: number) {
    manualSelection = ticked.includes(trackIndex)
      ? ticked.filter((index) => index !== trackIndex)
      : [...ticked, trackIndex].sort((a, b) => a - b);
  }

  async function run() {
    if (!canRun) return;
    running = true;
    try {
      // The one legitimate place for a time- or random-derived value in this feature: the
      // generator is seeded from the caller so that same source + level + lanes + seed is a
      // byte-identical chart, and a fresh number here is what makes a roll a different roll.
      const seed = Math.floor(Math.random() * 0x100000000);
      const result = generateChart({
        source: data.source,
        audioSong: data.audioSong,
        sourceInstruments: data.audioSong.instruments,
        sourceBpm: data.source.bpm,
        sourcePitch: data.source.pitch,
        keys,
        level,
        seed,
        // always explicit, never the proposal-by-null path: the ticks ARE the proposal until the
        // user changes them, and passing what is on screen is what makes an override take effect
        selection: [...ticked],
        snapPoint: data.snapPoint,
      });
      result.song.set({
        name: t('vsrg_composer:generate.generated_song_name', {
          song_name: data.audioSong.name,
          level: levelLabels[level],
        }),
      });
      if (ownedSongId === null) {
        // addSong writes the new id onto the serialized payload only, so the live song is told
        ownedSongId = await songsStore.addSong(result.song);
        result.song.set({ id: ownedSongId });
      } else {
        // a re-roll REPLACES the song this dialog made and no other: generator-owned and unedited
        // by definition, so nothing is lost and the library gains nothing to clean up
        result.song.set({ id: ownedSongId });
        await songsStore.updateSong(result.song);
      }
      outcome = {
        level,
        seed,
        rating: result.rating,
        converged: result.converged,
        performed: result.performed,
        doubled: result.doubled,
      };
      await functions.onOpenGenerated(result.song);
    } catch (error) {
      // generation asserts its own invariants by throwing (a lane collision, a background song
      // with no id): the chart is unusable, so it is never registered and the user is told
      logger.error(t('vsrg_composer:generate.failed'));
      console.error(error);
    } finally {
      running = false;
    }
  }
</script>

<DecoratedCard class="floating-vsrg-generate" size="1.2rem" isRelative={false} offset="0.1rem">
  <Column class="floating-vsrg-generate-content" gap="0.4rem">
    <Row align="center" style="width:100%">
      <h1 class="generate-title">{t('vsrg_composer:generate.title')}</h1>
      <AppButton style="margin-left:auto" onclick={functions.onClose}>
        {t('common:close')}
      </AppButton>
    </Row>

    <Row justify="between" align="center" gap="0.5rem">
      <span>{t('vsrg_composer:generate.source_song')}</span>
      <span class="text-ellipsis">{data.audioSong.name}</span>
    </Row>

    <fieldset class="generate-section">
      <legend>
        <Row align="center" gap="0.4rem">
          {t('vsrg_composer:generate.level')}
          <HelpTooltip
            buttonStyle="width:1.1rem;height:1.1rem"
            parentStyle="position:static"
            maxWidth={16}
          >
            {t('vsrg_composer:generate.level_info')}
          </HelpTooltip>
        </Row>
      </legend>
      <div class="generate-slider">
        <MultipleOptionSlider options={levelOptions} selected={level} onChange={selectLevel} />
      </div>
    </fieldset>

    <fieldset class="generate-section">
      <legend>
        <Row align="center" gap="0.4rem">
          {t('vsrg_composer:generate.parts')}
          <HelpTooltip
            buttonStyle="width:1.1rem;height:1.1rem"
            parentStyle="position:static"
            maxWidth={16}
          >
            {t('vsrg_composer:generate.parts_info')}
          </HelpTooltip>
        </Row>
      </legend>
      <Column gap="0.3rem" style="width:100%">
        {#each parts as part (part.trackIndex)}
          <Row
            align="center"
            gap="0.5rem"
            class={['generate-part', part.noteCount === 0 && 'generate-part-silent']}
          >
            {#if part.noteCount === 0}
              <!-- A track with no notes cannot be charted at all, so it gets the row's width back
                   rather than a switch that would refuse every press. -->
              <div class="generate-part-no-switch"></div>
            {:else}
              <Switch checked={part.ticked} onchange={() => togglePart(part.trackIndex)} />
            {/if}
            <Column flex1 style="min-width:0">
              <span class="text-ellipsis">{part.alias}</span>
              <span class="generate-part-detail">
                {t('vsrg_composer:generate.part_notes', { notes: part.noteCount })}
                {#if part.proposed && part.reason !== ''}
                  · {t('vsrg_composer:generate.part_proposed', { reasons: part.reason })}
                {/if}
              </span>
            </Column>
            {#if part.noteCount > 0 && !part.performable}
              <span class="generate-part-doubled">
                {t('vsrg_composer:generate.part_will_be_doubled')}
              </span>
            {/if}
          </Row>
        {/each}
      </Column>
    </fieldset>

    <fieldset class="generate-section">
      <legend>{t('vsrg_composer:generate.lanes')}</legend>
      <div class="generate-slider">
        <MultipleOptionSlider
          options={laneOptions}
          selected={selectedLanes}
          onChange={(value) => (keys = parseLanes(value))}
        />
      </div>
    </fieldset>

    <Row justify="end" style="width:100%">
      <AppButton onclick={run} disabled={!canRun}>
        {#snippet icon()}
          <IconWandMagicSparkles />
        {/snippet}
        {ownedSongId === null
          ? t('vsrg_composer:generate.run')
          : t('vsrg_composer:generate.roll_again')}
      </AppButton>
    </Row>

    {#if outcome}
      <fieldset class="generate-section">
        <legend>{t('vsrg_composer:generate.outcome')}</legend>
        <Column gap="0.3rem" style="width:100%">
          <span>{t('vsrg_composer:generate.rating', { rating: outcome.rating.toFixed(1) })}</span>
          <span class={[!outcome.converged && 'generate-warning']}>
            {outcome.converged
              ? t('vsrg_composer:generate.converged', { level: levelLabels[outcome.level] })
              : t('vsrg_composer:generate.not_converged', { level: levelLabels[outcome.level] })}
          </span>
          <Row justify="between" align="center" gap="0.5rem">
            <span>{t('vsrg_composer:generate.performed')}</span>
            <span class="text-ellipsis">
              {outcome.performed.length === 0
                ? t('vsrg_composer:generate.nothing')
                : outcome.performed.map(partAlias).join(', ')}
            </span>
          </Row>
          <Row justify="between" align="center" gap="0.5rem">
            <span>{t('vsrg_composer:generate.doubled')}</span>
            <span class="text-ellipsis">
              {outcome.doubled.length === 0
                ? t('vsrg_composer:generate.nothing')
                : outcome.doubled.map(partAlias).join(', ')}
            </span>
          </Row>
          <span class="generate-part-detail">
            {t('vsrg_composer:generate.seed', { seed: outcome.seed })}
          </span>
        </Column>
      </fieldset>
    {/if}
  </Column>
</DecoratedCard>

<style>
  /* :global() because `floating-vsrg-generate` is handed to DecoratedCard as a class prop, so it
     lands on that component's root div rather than on an element written here. */
  :global(.floating-vsrg-generate) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(34rem, 92vw);
    max-height: 86vh;
    border-radius: 0.5rem;
    background-color: rgba(var(--menu-background-rgb), 0.95);
    border: solid 2px var(--secondary);
    color: var(--menu-background-text);
    display: flex;
    flex-direction: column;
    /* above `.menu-wrapper` (App.css): the sidebar is closed when this opens, but it is still in
       the tree and still stacked, and a dialog behind it is a dialog that cannot be clicked. */
    z-index: 12;
    --backdrop-amount: 4px;
    /* THE OPENING MOTION IS A LOCAL KEYFRAME that repeats the centring translate in every frame,
       because this card is centred BY a transform: the global `fadeIn` writes `transform` too, so
       for as long as it ran the card had no translate at all - it was drawn from the page centre
       down and to the right, and snapped into place the instant the animation ended. `fadeIn`'s
       --existing-transform hook composes the two on paper, but Chrome resolves a var() in a
       composited animation to its fallback at the edges, which is that same jump; concrete values
       have neither problem. 0.4s and a small rise so it reads as the composer's tool panel, which
       is the motion this echoes. `delayBackdrop` is deliberately NOT declared here: Svelte rewrites
       an animation name only when this file also declares it, so that one keeps pointing at the
       global keyframes in Utility.scss. */
    animation:
      generate-appear 0.4s,
      delayBackdrop calc(0.4s * 1.2) forwards;
  }

  @keyframes generate-appear {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 2rem)) scale(0.95);
    }

    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* Same reason as above: this one is handed to Column as a class prop. */
  :global(.floating-vsrg-generate-content) {
    padding: 0.8rem;
    width: 100%;
    overflow-y: auto;
  }

  .generate-title {
    font-size: 1.3rem;
    margin: 0;
  }

  /* A real fieldset/legend: the browser breaks the border under the title on its own, which no
     background-matched overlay can do over a translucent card. */
  .generate-section {
    width: 100%;
    margin: 0;
    padding: 0.2rem 0.6rem 0.5rem;
    border: solid 0.1rem var(--secondary);
    border-radius: 0.3rem;
    min-inline-size: min-content;
    /* the section, not the '?' button, is what the popover in its legend hangs off - see below */
    position: relative;
  }

  /* THE '?' POPOVERS OPEN INSIDE THE CARD. HelpTooltip anchors its box to its own wrapper and lets
     it grow from there, but these buttons sit in a legend a couple of rem from the card's left edge,
     and the content column scrolls (an `overflow-y` that is not `visible` makes `overflow-x` compute
     to `auto`), so anything crossing the LEFT edge is cut off with no scroll position that brings it
     back. The call sites pass `parentStyle="position:static"`, which hands the box to this fieldset,
     and `left:0` pins it to the section's own edge: it opens into the card at every width the card
     has, and it no longer moves with however wide the legend's translated word turns out to be.
     `maxWidth={16}` there is the other half - 16rem is what still fits a section on a 320px screen. */
  .generate-section :global(.help-tooltip-content) {
    left: 0;
    /* HelpTooltip leaves its box `pointer-events: none`, which is only safe while the box loses the
       paint to whatever it covers. Here it wins (it is raised over the slider's grid items), and a
       box you can see through to click is worse than one that opens behind: dismissing the Level
       popover by clicking its own text would land on the button underneath and change the Chart
       Level, which also discards any parts the user had ticked by hand. Dismissal still works -
       pressing a non-focusable div blurs the '?' button, the `:focus + ` rule hides the box before
       the release, and mousedown and mouseup then have different targets so no click is dispatched
       on the control below. Scoped to this dialog: the other call sites have not been checked and
       nothing is asking about them. */
    pointer-events: auto;
  }

  .generate-section legend {
    padding: 0 0.3rem;
    font-weight: bold;
  }

  .generate-slider {
    height: 2.2rem;
    display: flex;
    justify-content: center;
  }

  :global(.generate-part) {
    width: 100%;
  }

  :global(.generate-part-silent) {
    opacity: 0.5;
  }

  /* Holds the switch's own width so a silent track's name still lines up with the rest. */
  .generate-part-no-switch {
    width: 2.4rem;
    flex-shrink: 0;
  }

  .generate-part-detail {
    font-size: 0.8rem;
    opacity: 0.8;
  }

  .generate-part-doubled {
    font-size: 0.8rem;
    white-space: nowrap;
    padding: 0.1rem 0.4rem;
    border-radius: 0.3rem;
    background-color: var(--primary);
    color: var(--primary-text);
  }

  .generate-warning {
    color: var(--red);
  }

  @media only screen and (max-width: 1000px) {
    :global(.floating-vsrg-generate) {
      width: 92vw;
    }
  }
</style>
