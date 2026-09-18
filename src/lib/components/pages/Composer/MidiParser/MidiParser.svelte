<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { base } from '$app/paths';
  import { BASE_LAYER_LIMIT } from '$core/sharedConfig';
  import type { Pitch } from '$lib/games/types';
  import { basicPitchLoader } from '$lib/audio/BasicPitchLoader';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { importMidiTracks, suggestOffset } from '$core/Songs/midiImport';
  import { effectiveTrackPitch } from '$core/Songs/noteIds';
  import { decodeMidiMetadata, type MidiMetadata } from '$core/Songs/midiMetadata';
  import { delay, isAudioFormat, isVideoFormat } from '$core/utils/Utilities';
  import { t } from '$i18n/binding.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import Switch from '$cmp/inputs/Switch.svelte';
  import PitchSelect from '$cmp/inputs/PitchSelect.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import TrackInfo from './TrackInfo.svelte';
  import { buildMidiTrackRoster, type CustomTrack } from './midiTrackRoster';
  import { canonicalMidiPitch } from './midiPitch';
  import NumericalInput from './NumericalInput.svelte';
  import MidiStatsTable from './MidiStatsTable.svelte';
  // Midi/Track stay type-only imports (erased, so nothing to resolve at runtime); the two
  // `new Midi(...)` calls below take the constructor from $core/Songs/midiConstructor, which is
  // where the reason lives - no static import of '@tonejs/midi' as a value works in every runtime
  // this app is evaluated in, and the default import that used to be here is what broke MIDI
  // import for users in the built app.
  import type { Midi } from '@tonejs/midi';
  import { Midi as MidiConstructor } from '$core/Songs/midiConstructor';

  let {
    data,
    functions,
    initialFile = null,
  }: {
    data: {
      selectedColumn: number;
    };
    functions: {
      changeMidiVisibility: (override: boolean) => void;
      loadSong: (song: ComposedSong, options?: { preview?: boolean }) => void;
    };
    /**
     * A file that already made the app open this screen (dropped on a menu that can't parse it):
     * parsed on mount so the user isn't asked to pick the same file twice. Read once at mount -
     * this component is mounted/unmounted with the modal, so "opened again" means a fresh mount.
     */
    initialFile?: File | null;
  } = $props();

  let fileName = $state('');
  let tracks: CustomTrack[] = $state([]);
  let bpm = $state(220);
  let offset = $state(0);
  let pitch: Pitch = $state('C');
  let accidentals = $state(0);
  let outOfRange = $state(0);
  //instrument config recovered from one of our own exports; null for any foreign file
  let importedMetadata: MidiMetadata | null = $state(null);
  let totalNotes = $state(0);
  let includeAccidentals = $state(true);
  let includeOutOfRange = $state(false);
  let warnedOfExperimental = false;
  // Parsing audio/video can outlive this import session by several seconds. A closed importer must
  // never install that stale result over the song after the lock has gone (or over a newer import).
  let componentAlive = true;
  // Every selected file owns one generation. Audio recognition is asynchronous and cannot be
  // cancelled inside Basic Pitch, so a newer selection revokes the older run's right to publish
  // progress, state, logger cleanup, or a preview.
  let fileRequestGeneration = 0;

  function claimFileRequest(): number {
    const generation = ++fileRequestGeneration;
    // A previous audio run may have left its spinner visible. The new owner either replaces it
    // with its own progress shortly or imports MIDI synchronously, in which case it should vanish.
    logger.hidePill();
    return generation;
  }

  function ownsFileRequest(generation: number): boolean {
    return componentAlive && generation === fileRequestGeneration;
  }

  onDestroy(() => {
    componentAlive = false;
    logger.hidePill();
  });

  const midiInputsStyle = $derived(
    `background-color:${ThemeProvider.layer('primary', 0.2).toString()};color:${ThemeProvider.getText('primary').toString()}`
  );

  async function handleFile(files: FileElement<File>[]) {
    if (files.length === 0) return;
    // FilePicker's `file` mode calls us at selection time. Reading the bytes here, after claiming
    // ownership, matters for two quickly selected files: a large older read may finish last.
    const generation = claimFileRequest();
    try {
      const pickedFile = files[0];
      const name = pickedFile.file.name;
      const data = await pickedFile.data.arrayBuffer();
      if (!ownsFileRequest(generation)) return;
      const file = { data, file: pickedFile.file };
      if (isVideoFormat(name)) {
        const audio = await extractAudio(file);
        if (!ownsFileRequest(generation)) return;
        return await parseAudioToMidi(audio, name, generation);
      } else if (isAudioFormat(name)) {
        const audio = await extractAudio(file);
        if (!ownsFileRequest(generation)) return;
        return await parseAudioToMidi(audio, name, generation);
      } else {
        const midi = new MidiConstructor(file.data);
        if (ownsFileRequest(generation)) return mandleMidiFile(midi, name, generation);
      }
    } catch (e) {
      if (!ownsFileRequest(generation)) return;
      console.error(e);
      logger.hidePill();
      logger.error(t('logs:error_opening_file'));
    }
  }

  // The handed-over file goes through handleFile untouched, i.e. the exact path a manual pick
  // takes. The handler owns the byte read as well as parsing, and the File name is what tells MIDI
  // from audio from video below (not the content).
  onMount(() => {
    const file = initialFile;
    if (!file) return;
    void handleFile([{ data: file, file }]);
  });

  async function extractAudio(audio: FileElement<ArrayBuffer>): Promise<AudioBuffer> {
    const ctx = new AudioContext({
      sampleRate: 22050,
    });
    const buffer = (await new Promise((res, rej) => {
      ctx!.decodeAudioData(audio.data as ArrayBuffer, res, rej);
    })) as AudioBuffer;
    ctx.close();
    return buffer;
  }

  async function parseAudioToMidi(audio: AudioBuffer, name: string, generation: number) {
    if (!ownsFileRequest(generation)) return;
    if (!warnedOfExperimental) logger.warn(t('composer:midi_parser.audio_conversion_warning'));
    warnedOfExperimental = true;
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const model = `${base}/assets/audio-midi-model.json`;
    logger.showPill(`${t('composer:midi_parser.detecting_notes')}...`, { spinner: true });
    const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await basicPitchLoader();
    if (!ownsFileRequest(generation)) return;
    const basicPitch = new BasicPitch(model);
    const mono = audio.getChannelData(0);
    await basicPitch.evaluateModel(
      mono,
      (f, o) => {
        if (!ownsFileRequest(generation)) return;
        frames.push(...f);
        onsets.push(...o);
      },
      (progress) => {
        if (!ownsFileRequest(generation)) return;
        logger.showPill(
          `${t('composer:midi_parser.detecting_notes')}: ${Math.floor(progress * 100)}%...`,
          { spinner: true }
        );
      }
    );
    if (!ownsFileRequest(generation)) return;
    logger.showPill(t('composer:midi_parser.converting_audio_to_midi'), { spinner: true });
    await delay(300);
    if (!ownsFileRequest(generation)) return;
    const notes = noteFramesToTime(
      outputToNotesPoly(
        frames, //frames
        onsets, //onsets
        0.5, //onsetThreshold
        0.3, //frameThreshold
        11, //minimumDuration
        true, //inferOnsets
        3000, //maxHz
        0, //minHz
        true //smooth
      )
    );
    const midi = new MidiConstructor();
    const track = midi.addTrack();
    notes.forEach((note) => {
      track.addNote({
        midi: note.pitchMidi,
        time: note.startTimeSeconds,
        duration: note.durationSeconds,
        velocity: note.amplitude,
      });
    });
    if (!ownsFileRequest(generation)) return;
    logger.hidePill();
    mandleMidiFile(midi, name, generation);
  }

  // QUIRK: mandleMidiFile (not handleMidiFile) is an intentional preserved typo.
  function mandleMidiFile(midi: Midi, name: string, generation: number) {
    if (!ownsFileRequest(generation)) return;
    try {
      const midiBpm = midi.header.tempos[0]?.bpm;
      const key = midi.header.keySignatures[0]?.key;
      //Only the instrument configuration comes from metadata, and only when the file is one of
      //ours. Everything musical below — tempo, placement, note lengths — is still read off the
      //MIDI itself, so importing our own export exercises the same code a foreign file does.
      importedMetadata = decodeMidiMetadata(midi.header.meta ?? []);
      tracks = buildMidiTrackRoster(midi.tracks, importedMetadata?.instruments ?? null);
      fileName = name;
      //round, not floor: this is the inverse of toMidi's setTempo(bpm / 4), and the tempo
      //survives serialization as an integer microseconds-per-quarter, so the value coming
      //back can sit a hair under the original and lose a whole bpm to truncation
      bpm = Math.round(midiBpm * 4) || 220;
      offset = 0;
      //`pitch` is the Basepoint the imported song will carry, so it rides in the metadata
      //alongside the rest of the instrument config. The key signature is still preferred when a
      //foreign file supplies one. Since ADR-0007 it also decides what the emitted notes ARE (the
      //snapped nominals are lifted by it), which is why convertMidi below is re-run on any change.
      pitch = canonicalMidiPitch(key) ?? importedMetadata?.pitch ?? 'C';
      //a file whose every track was filtered out above has nothing to convert, and both the track
      //list and the summary table are gated on `tracks.length` - without this the screen would
      //show the filename and then say nothing at all, which reads as a broken importer
      if (tracks.length === 0) return logger.warn(t('composer:midi_parser.there_are_no_notes'));
      if (tracks.length > BASE_LAYER_LIMIT) warnTrackLimit();
      convertMidi();
    } catch (e) {
      console.error(e);
      logger.error(t('composer:midi_parser.error_is_file_midi'));
    }
  }

  function convertMidi() {
    const selectedTracks = tracks.filter((track) => track.selected);
    for (const track of tracks) {
      track.numberOfAccidentals = 0;
      track.outOfRange = 0;
      track.outOfRangeBounds.lower = 0;
      track.outOfRangeBounds.upper = 0;
    }
    if (selectedTracks.length === 0) {
      accidentals = 0;
      totalNotes = 0;
      outOfRange = 0;
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }

    // The selected set IS the generated roster. Its file-order position is therefore both the
    // import layer and the destination song layer; no state from the open composer participates.
    const layers = selectedTracks.map((track) => track.instrument);
    const result = importMidiTracks(
      selectedTracks.map((track, layer) => ({
        notes: track.track.notes,
        layer,
        localOffset: track.localOffset,
        maxScaling: track.maxScaling,
      })),
      {
        bpm,
        offset,
        includeAccidentals,
        includeOutOfRange,
        //the Basepoint the song below is given: the importer takes it off every incoming number
        //and puts it back on every emitted one (ADR-0007), so the two must be the same value
        pitch,
        //the layers themselves, not a capability flag derived from them: the importer needs each
        //layer's instrument to know what a snapped nominal sounds there, and reads the sustain
        //capability off the same config — nothing here knows which game is loaded
        layers,
      }
    );
    selectedTracks.forEach((track, index) => {
      const stats = result.perTrack[index];
      track.numberOfAccidentals = stats.accidentals;
      track.outOfRange = stats.outOfRange;
      track.outOfRangeBounds.lower = stats.outOfRangeLower;
      track.outOfRangeBounds.upper = stats.outOfRangeUpper;
    });
    // Publish the accounting before considering whether a preview can be installed. A conversion
    // whose policies exclude every note still has useful costs to show in the panel, and leaving
    // the previous file's totals behind makes those controls impossible to reason about.
    accidentals = result.accidentals;
    totalNotes = result.totalNotes;
    outOfRange = result.outOfRange;
    const columns = result.columns;
    const song = new ComposedSong('Untitled');
    //initColumnsForConstruction, not a mutator: this song is being BUILT here and is handed to loadSong below,
    //so nothing is subscribed to it yet and there is no version to bump
    song.initColumnsForConstruction(columns);
    //enforce the no-overlap Duration invariant over the imported spans
    song.normalizeSpans();
    song.bpm = bpm;
    song.instruments = layers.map((instrument) => instrument.clone());
    song.pitch = pitch;
    if (importedMetadata) song.reverb = importedMetadata.reverb;
    const lastColumn = data.selectedColumn;
    song.selected = lastColumn < song.columns.length ? lastColumn : 0;
    if (song.columns.length === 0) {
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }
    if (!componentAlive) return;
    functions.loadSong(song, { preview: true });
  }

  function warnTrackLimit() {
    logger.warn(
      t('composer:cant_add_more_than_n_layers', {
        max_layers: BASE_LAYER_LIMIT,
      })
    );
  }

  function editTrack(index: number, update: Partial<CustomTrack>) {
    const track = tracks[index];
    if (!track) return;
    if (
      update.selected === true &&
      !track.selected &&
      tracks.filter((candidate) => candidate.selected).length >= BASE_LAYER_LIMIT
    ) {
      return warnTrackLimit();
    }
    Object.assign(track, update);
    if (tracks.length > 0) convertMidi();
  }

  function suggestGlobalOffset() {
    const selected = tracks.filter((track) => track.selected);
    if (selected.length === 0) {
      //reachable with every track deselected, and a button that does nothing at all reads as
      //broken rather than as "nothing to work on"
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }
    const suggestion = suggestOffset(
      selected.map((track) => ({
        notes: track.track.notes,
        instrumentName: track.instrument.name,
        pitch: effectiveTrackPitch(track.instrument, pitch),
        localOffset: track.localOffset,
        maxScaling: track.maxScaling,
      }))
    );
    changeOffset(suggestion.offset);
    logger.success(
      t('composer:midi_parser.suggested_offset', {
        offset: `${suggestion.offset}`,
        accidentals: `${suggestion.accidentals}`,
        stranded: `${suggestion.stranded}`,
      })
    );
  }

  function changeOffset(value: number) {
    if (!Number.isInteger(value)) value = 0;
    if (offset === value) return;
    offset = value;
    if (tracks.length > 0) convertMidi();
  }

  function changePitch(value: Pitch) {
    pitch = value;
    //the Basepoint is an input to the CONVERSION now, not just a playback label the composer
    //keeps beside it: re-run so the preview the user is looking at is the song they would load
    if (tracks.length > 0) convertMidi();
  }

  function toggleAccidentals() {
    includeAccidentals = !includeAccidentals;
    if (tracks.length > 0) convertMidi();
  }

  function toggleOutOfRange() {
    includeOutOfRange = !includeOutOfRange;
    if (tracks.length > 0) convertMidi();
  }

  function changeBpm(value: number) {
    if (!Number.isInteger(value)) value = 0;
    if (bpm === value) return;
    bpm = value;
    if (tracks.length > 0) convertMidi();
  }
</script>

<DecoratedCard class="floating-midi" size="1.2rem" isRelative={false} offset="0.1rem">
  <Column class="floating-midi-content" gap="0.3rem">
    <Row align="center" style="width:100%">
      <FilePicker onPick={handleFile} as="file">
        <button class="midi-btn" style="{midiInputsStyle};white-space:nowrap">
          {t('composer:midi_parser.open_midi_audio_file')}
        </button>
      </FilePicker>
      <div style="margin:0 0.5rem;{fileName ? '' : 'opacity:0.6'}" class="text-ellipsis">
        {fileName || t('composer:midi_parser.no_file_selected')}
      </div>
      <button
        class="midi-btn"
        style="margin-left:auto;{midiInputsStyle}"
        onclick={() => functions.changeMidiVisibility(false)}
      >
        {t('common:close')}
      </button>
    </Row>

    <div class="midi-lock-notice">
      {t('composer:midi_parser.composer_locked_during_import')}
    </div>

    <fieldset class={['midi-section', tracks.length === 0 && 'midi-section-disabled']}>
      <legend>{t('composer:midi_parser.import_settings')}</legend>
      <Column gap="0.3rem" style="width:100%">
        <Row justify="between" align="center">
          <div style="margin-right:0.5rem">{t('composer:midi_parser.tempo_bpm')}:</div>
          <NumericalInput value={bpm} onChange={changeBpm} delay={600} step={5} />
        </Row>
        <Row justify="between" align="center">
          <div class="row flex-centered">
            <span style="margin-right:0.5rem"
              >{t('composer:midi_parser.global_note_offset')}:
            </span>
            <HelpTooltip buttonStyle="width:1.2rem;height:1.2rem">
              {t('composer:midi_parser.global_note_offset_description')}
            </HelpTooltip>
          </div>
          <Row align="center" style="gap:0.4rem">
            <button
              class="midi-suggest-button"
              disabled={tracks.length === 0}
              onclick={suggestGlobalOffset}
            >
              {t('composer:midi_parser.suggest_offset')}
            </button>
            <NumericalInput value={offset} onChange={changeOffset} delay={600} step={1} />
          </Row>
        </Row>
        <Row justify="between" align="center">
          <div style="margin-right:0.5rem">{t('composer:midi_parser.base_pitch')}:</div>
          <PitchSelect
            style="width:5rem;{midiInputsStyle}"
            selected={pitch}
            onChange={changePitch}
          />
        </Row>
        <Row gap="1rem" align="center" justify="between" style="width:100%">
          <Row justify="between" align="center" gap="1rem">
            <div>{t('composer:midi_parser.include_accidentals')}:</div>
            <Switch
              checked={includeAccidentals}
              onchange={toggleAccidentals}
              styleOuter={midiInputsStyle}
            />
          </Row>
          <Row justify="between" align="center" gap="1rem">
            <div class="row flex-centered" style="gap: 0.5rem">
              <span>{t('composer:midi_parser.include_out_of_range_notes')}:</span>
              <HelpTooltip position="left" buttonStyle="width:1.2rem;height:1.2rem">
                {t('composer:midi_parser.include_out_of_range_notes_description')}
              </HelpTooltip>
            </div>
            <Switch
              checked={includeOutOfRange}
              onchange={toggleOutOfRange}
              styleOuter={midiInputsStyle}
            />
          </Row>
        </Row>
      </Column>
    </fieldset>
    {#if tracks.length > 0}
      <fieldset class="midi-section">
        <legend>{t('composer:midi_parser.track_settings')}</legend>
        <Column style="width:100%">
          {#each tracks as track, i (i)}
            <TrackInfo data={track} index={i} onChange={editTrack} />
          {/each}
        </Column>
      </fieldset>
      <MidiStatsTable notes={totalNotes} {accidentals} {outOfRange} />
    {/if}
  </Column>
</DecoratedCard>

<style>
  /* A real fieldset/legend: the browser breaks the border under the title on its own, which no
     background-matched overlay can do over this card - it is translucent (.floating-midi). */
  .midi-section {
    width: 100%;
    margin: 0;
    padding: 0.2rem 0.6rem 0.5rem;
    border: solid 0.1rem var(--secondary);
    border-radius: 0.3rem;
    min-inline-size: min-content;
  }

  .midi-section legend {
    padding: 0 0.3rem;
    font-weight: bold;
  }

  .midi-lock-notice {
    opacity: 0.85;
    text-align: center;
  }

  /* No file yet: the settings are inert, and they LOOK it. The cursor lives on the fieldset -
     which keeps its pointer events - because a pointer-events:none element shows no cursor at
     all; only the content below it is made unreachable. */
  .midi-section-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .midi-section-disabled > :global(*) {
    pointer-events: none;
  }

  .midi-suggest-button {
    background-color: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 0.3rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .midi-suggest-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* :global() below: `floating-midi` is handed to DecoratedCard as a class prop, so it lands on
     that component's root div - not on an element in this file's own template. */
  :global(.floating-midi) {
    position: absolute;
    margin-left: auto;
    margin-right: auto;
    bottom: 2rem;
    /* FIXED size, not bounds: sized to its content, the card grew the moment a file was opened
       (track list + summary appearing), shifting everything in it under the pointer. The mobile
       override below was already fixed for the same reason. */
    height: 48vh;
    border-radius: 0.5rem;
    background-color: rgba(var(--menu-background-rgb), 0.9);
    border: solid 2px var(--secondary);
    color: var(--menu-background-text);
    width: 60vw;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    --backdrop-amount: 4px;
    /* fadeIn/delayBackdrop are global keyframes from Utility.scss. Svelte only rewrites animation
       names it also finds in @keyframes of THIS file, so declaring either name here would silently
       rebind these two to the local copy. */
    animation:
      fadeIn 0.4s,
      delayBackdrop calc(0.4s * 1.2) forwards;
  }

  /* Same reason as above: this one is handed to Column as a class prop. */
  :global(.floating-midi-content) {
    padding: 0.8rem;
    padding-right: 0.5rem;
    width: 100%;
    height: 100%;
    overflow-y: scroll;
  }

  /* :global() because the wildcard reaches every child component rendered inside the card. */
  :global(.floating-midi *) {
    font-size: 0.9rem;
  }

  .midi-btn {
    background-color: var(--primary);
    color: white;
    border-radius: 0.2rem;
    padding: 0.5rem 1rem;
    border: none;
    height: -moz-fit-content;
    height: fit-content;
    cursor: pointer;
    min-width: 5rem;
  }

  @media only screen and (max-width: 1000px) {
    :global(.floating-midi) {
      bottom: 0.8rem;
      height: 50vh;
      max-height: 50vh;
      max-width: 70vw;
      width: 70vw;
    }

    :global(.floating-midi-content) {
      padding: 0.4rem;
      padding-right: 0.2rem;
    }
  }
</style>
