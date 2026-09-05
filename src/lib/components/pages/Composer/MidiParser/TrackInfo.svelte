<script lang="ts">
  import type { Pitch } from '$lib/games/types';
  import type { CustomTrack } from './midiTrackRoster';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import InstrumentSelect from '$cmp/inputs/InstrumentSelect.svelte';
  import PitchSelect from '$cmp/inputs/PitchSelect.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import NumericalInput from './NumericalInput.svelte';
  import MidiStatsTable from './MidiStatsTable.svelte';

  let {
    data,
    index,
    onChange,
  }: {
    data: CustomTrack;
    index: number;
    onChange: (index: number, data: Partial<CustomTrack>) => void;
  } = $props();

  let dataShown = $state(false);
  const background = $derived(
    `background-color:${ThemeProvider.layer('menu_background', 0.15).toString()}`
  );

  function onLocalOffsetChange(localOffset: number | null) {
    onChange(index, { localOffset });
  }

  function onMaxScaleChange(maxScaling: number) {
    onChange(index, { maxScaling: Math.max(0, maxScaling) });
  }
</script>

<Column class={['midi-track-column', dataShown && 'midi-track-open']}>
  <div class="midi-track-wrapper" style={background}>
    <div class="midi-track-center">
      <input
        type="checkbox"
        onchange={(event) => {
          onChange(index, { selected: !data.selected });
          // A selection beyond BASE_LAYER_LIMIT is refused synchronously by MidiParser. Restore
          // the controlled DOM property as well: without a state change Svelte has no reason to
          // rerender this input, so the browser's native toggle would otherwise look accepted.
          event.currentTarget.checked = data.selected;
        }}
        checked={data.selected}
      />
      {`${data.name} (${data.track.notes.length}, ${data.track.instrument.family})`}
    </div>
    <div class="midi-track-center">
      <InstrumentSelect
        onChange={(name) => onChange(index, { instrument: data.instrument.clone().set({ name }) })}
        selected={data.instrument.name}
        style="margin-left:0.2rem;padding-right:1.5rem"
      />
      <!-- This svg is a mouse-only click target (no keyboard equivalent) - an accepted
                 a11y gap, not wrapped in a button. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 512 512"
        height="22"
        width="22"
        xmlns="http://www.w3.org/2000/svg"
        style="color:{dataShown ? 'var(--secondary)' : 'var(--primary)'}"
        cursor="pointer"
        onclick={() => (dataShown = !dataShown)}
        ><path
          d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
        /></svg
      >
    </div>
  </div>
  <Column
    padding="0.4rem"
    gap="0.4rem"
    style="display:{dataShown ? 'flex' : 'none'};border-top:solid 0.1rem var(--secondary)"
  >
    <Row align="center" justify="between">
      <div class={hasTooltip(true)}>
        <Tooltip>
          {t('composer:midi_parser.local_note_offset_description')}
        </Tooltip>
        {t('composer:midi_parser.local_note_offset')}
      </div>
      <NumericalInput
        value={data.localOffset}
        nullable
        placeholder={t('composer:midi_parser.no_offset')}
        delay={600}
        onChange={onLocalOffsetChange}
      />
    </Row>
    <Row align="center" justify="between">
      <div class={hasTooltip(true)}>
        <Tooltip>
          {t('composer:midi_parser.max_octave_scaling_description')}
        </Tooltip>
        {t('composer:midi_parser.max_octave_scaling')}
      </div>
      <NumericalInput
        value={data.maxScaling}
        placeholder={t('composer:midi_parser.no_scaling')}
        onChange={onMaxScaleChange}
      />
    </Row>
    <Row align="center" justify="between">
      <div>{t('common:instrument')}</div>
      <div>{data.track.instrument.name}</div>
    </Row>
    <Row align="center" justify="between">
      <div>{t('common:pitch')}</div>
      <PitchSelect
        style="width:8rem"
        selected={data.instrument.pitch as Pitch}
        onChange={(pitch) =>
          onChange(index, { instrument: data.instrument.clone().set({ pitch }) })}
      >
        <option value="">
          {t('instrument_settings:use_song_pitch')}
        </option>
      </PitchSelect>
    </Row>
    <MidiStatsTable
      notes={data.track.notes.length}
      accidentals={data.numberOfAccidentals}
      outOfRange={data.outOfRange}
      outOfRangeBounds={data.outOfRangeBounds}
    />
  </Column>
</Column>

<style>
  /* The row's background lives on the HEADER alone (TrackInfo paints it inline); the column
     itself only ever contributes the open-state border below. */
  .midi-track-wrapper {
    display: flex;
    justify-content: space-between;
    width: 100%;
    align-items: center;
    padding: 0.3rem 0.5rem;
    border-radius: 0.2rem;
  }

  /* :global() on this rule and the next one: both classes are handed to Column as a class prop,
     so they land on that component's root div rather than on markup in this file. */
  :global(.midi-track-column) {
    border-radius: 0.2rem;
    display: flex;
    flex-direction: column;
    margin-top: 0.3rem;
    width: 100%;
    /* reserved while closed, so opening a row never shifts its neighbours */
    border: solid 0.1rem transparent;
  }

  /* Open: the same border as the .midi-section wrapper around the track list. */
  :global(.midi-track-open) {
    border-color: var(--secondary);
  }

  .midi-track-center {
    display: flex;
    gap: 0.2rem;
    align-items: center;
  }

  /* :global() on the wildcard half only - it has to reach elements rendered by the child
     components inside the row (InstrumentSelect), which carry no scoping class from this file. */
  .midi-track-center :global(*:not(:last-child)) {
    margin-right: 0.5rem;
  }
</style>
