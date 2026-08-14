<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { game } from '$game';
  import { APP_NAME } from '$core/legacyConfig';
  import type { Pitch } from '$lib/games/types';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import MidiParser from './MidiParser/MidiParser.svelte';
  import ComposerTools from './ComposerTools.svelte';
  import ComposerKeyboard from './ComposerKeyboard.svelte';
  import ComposerDurationPopover from './ComposerDurationPopover.svelte';
  import ComposerCanvas from './ComposerCanvas.svelte';
  import ComposerMenu from './ComposerMenu.svelte';
  import CanvasTool from './CanvasTool.svelte';
  import InstrumentControls from './InstrumentControls.svelte';
  import { Instrument, type ObservableNote } from '$lib/audio/Instrument.svelte';
  import AudioRecorder from '$lib/audio/AudioRecorder';
  import Analytics from '$core/Analytics';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import { VsrgSong } from '$core/Songs/VsrgSong.svelte';
  import { Song, type SerializedSong } from '$core/Songs/Song.svelte';
  import { NoteLayer } from '$core/Songs/Layer';
  import type { InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import { MIDIProvider, type MIDIEvent } from '$lib/providers/MIDIProvider';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import type { KeyboardNumber } from '$lib/providers/KeyboardProvider/KeyboardTypes';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { settingsService } from '$core/Services/SettingsService';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { songService } from '$core/Services/SongService';
  import { fileService } from '$core/Services/FileService';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import {
    createKeyboardListener,
    createShortcutListener,
    type ShortcutListener,
  } from '$stores/KeybindsStore.svelte';
  import { registerLeaveHandler } from '$stores/navigationGuard.svelte';
  import { calculateSongLength, delay, formatMs } from '$core/utils/Utilities';

  let {
    songId = null,
    showMidi = false,
    inPreview = false,
  }: {
    songId?: string | null;
    showMidi?: boolean;
    inPreview?: boolean;
  } = $props();

  let settings: ComposerSettingsDataType = $state(settingsService.getDefaultComposerSettings());
  let layers: Instrument[] = $state([new Instrument(game.instruments.list[1])]); //TODO not sure if this is the best idea
  //it doesnt change the instrument because it is the same as the one in the base song
  let song: ComposedSong = $state(
    new ComposedSong('Untitled', [
      game.instruments.list[0],
      game.instruments.list[0],
      game.instruments.list[0],
    ])
  );
  // One-time seed, not reactive: later bpm edits flow through handleSettingChange's
  // songSetting branch instead, which writes song.bpm directly.
  // svelte-ignore state_referenced_locally
  song.bpm = settings.bpm.value;
  let layer = $state(0);
  // `$state.raw`, like song.breakpoints/song.instruments: this array is handed to the canvas and
  // the renderer calls `selectedColumns.includes(i)` once per visible column on every draw, so it
  // has to stay a PLAIN array rather than a deep proxy whose every element read is a trap. The
  // rule that comes with it: assign a new array, never push/splice (every write below already
  // does, see selectColumn).
  let selectedColumns: number[] = $state.raw([]);
  let undoHistory: NoteColumn[][] = $state([]);
  let copiedColumns: NoteColumn[] = $state([]);
  let isToolsVisible = $state(false);
  // One-time seed from the prop; later showMidi changes (callers never send any) are not tracked.
  // svelte-ignore state_referenced_locally
  let isMidiVisible = $state(showMidi || false);
  let isRecordingAudio = $state(false);
  let isPlaying = $state(false);
  let changes = $state(0);

  let broadcastChannel: BroadcastChannel | null = null;
  let mounted = false;
  let cleanup: (() => void)[] = [];

  const currentInstrument = $derived(layers[layer]);
  const songLength = $derived(calculateSongLength(song.columns, settings.bpm.value, song.selected));

  // No refreshSong() any more (2026-08-06 reactive-model plan, phase 1). ComposedSong publishes
  // its own changes now: `selected`, `breakpoints`, `instruments`, `name`/`bpm`/`pitch` are
  // signals, and the whole column/note graph rides one structure version that the `columns`
  // getter reads. So a mutation is published by the model method that made it - this component
  // just calls the method. `song` itself is still $state, but it only changes on load/create.

  onMount(() => {
    mounted = true;
    const loadedSettings = settingsService.getComposerSettings();
    const shortcutListener = createShortcutListener(
      'composer',
      'composer_shortcuts',
      handleShortcut
    );
    const shortcutKeyboardListener = createKeyboardListener(
      'composer_shortcuts_keyboard',
      handleKeyboardShortcut
    );
    cleanup.push(shortcutKeyboardListener, shortcutListener);
    settings = loadedSettings;
    init(loadedSettings);
    broadcastChannel = window.BroadcastChannel
      ? new BroadcastChannel(APP_NAME + '_composer')
      : null;
    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', (event) => {
        if (!settings.syncTabs.value) return;
        if (!['play', 'stop'].includes(event?.data)) return;
        togglePlay(event.data === 'play');
      });
    }
    cleanup.push(registerLeaveHandler(prepareToLeave));
    if (window.location.hostname !== 'localhost') {
      window.addEventListener('beforeunload', handleUnload);
    }
    return () => {
      mounted = false;
      AudioProvider.clear();
      layers.forEach((instrument) => instrument.dispose());
      broadcastChannel?.close?.();
      isPlaying = false;
      cleanup.forEach((dispose) => dispose());
      KeyboardProvider.unregisterById('composer');
      MIDIProvider.removeListener(handleMidi);
      if (AudioProvider.isRecording) AudioProvider.stopRecording();
      if (window.location.hostname !== 'localhost') {
        window.removeEventListener('beforeunload', handleUnload);
      }
    };
  });

  async function init(loadedSettings: ComposerSettingsDataType) {
    await syncInstruments();
    AudioProvider.setReverb(loadedSettings.reverb.value);
    MIDIProvider.addListener(handleMidi);
    game.composer.tempoChangers.forEach((tempoChanger, i) => {
      KeyboardProvider.registerNumber(
        (i + 1) as KeyboardNumber,
        () => handleTempoChanger(tempoChanger),
        { id: 'composer_keyboard' }
      );
    });
    try {
      if (!songId) return;
      const loadedSong = await songService.getSongById(songId);
      if (!loadedSong) return;
      loadSong(loadedSong);
    } catch (e) {
      console.error('Error loading song');
      console.error(e);
    }
  }

  const handleKeyboardShortcut: ShortcutListener<'keyboard'> = ({ shortcut, event }) => {
    if (event.repeat) return;
    const shouldEditKeyboard = isPlaying || event.shiftKey;
    if (shouldEditKeyboard) {
      const note = currentInstrument.getNoteFromCode(shortcut.name);
      if (note !== null) toggleNoteImmediate(note);
    }
  };

  const handleShortcut: ShortcutListener<'composer'> = ({ shortcut, event }) => {
    const wasPlaying = isPlaying;
    const { name } = shortcut;
    if (name === 'next_column' && !wasPlaying) selectColumn(song.selected + 1);
    if (name === 'previous_column' && !wasPlaying) selectColumn(song.selected - 1);
    if (name === 'remove_column' && !wasPlaying) removeColumns(1, song.selected);
    if (name === 'add_column' && !wasPlaying) addColumns(1, song.selected);
    if (name === 'previous_layer') {
      const previousLayer = layer - 1;
      if (previousLayer >= 0) changeLayer(previousLayer);
    }
    if (name === 'next_layer') {
      const nextLayer = layer + 1;
      if (nextLayer < layers.length) changeLayer(nextLayer);
    }
    if (name === 'toggle_play') {
      if (event.repeat) return;
      if ((event.target as HTMLElement | null)?.tagName === 'BUTTON') {
        (event.target as HTMLElement | null)?.blur();
      }
      event.preventDefault();
      togglePlay();
      if (settings.syncTabs.value) {
        // QUIRK: broadcasts wasPlaying ? 'play' : 'stop'. The play/pause button's own
        // onclick below broadcasts the opposite mapping for the same toggle gesture -
        // both intentional and deliberately left inconsistent; do not unify them.
        broadcastChannel?.postMessage?.(wasPlaying ? 'play' : 'stop');
      }
    }
  };

  function handleUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    event.returnValue = '';
  }

  function handleAutoSave() {
    changes++;
    if (changes > 5 && settings.autosave.value) {
      //TODO maybe add here that songs which arent saved dont get autosaved
      if (song.name !== 'Untitled') {
        updateSong(song);
      }
    }
  }

  function handleMidi([eventType, note, velocity]: MIDIEvent) {
    if (!mounted) return;
    if (MIDIProvider.isDown(eventType) && velocity !== 0) {
      const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note);
      keyboardNotes.forEach((keyboardNote) => {
        //a MIDI preset slot addresses a BUTTON of the current instrument (persisted settings,
        //still Button-keyed by design); a preset can outlive a shorter instrument's note list,
        //so resolve the note object here and hand THAT on - never the raw slot number
        const pressed = currentInstrument.notes[keyboardNote.index];
        if (pressed) toggleNoteImmediate(pressed);
      });
      const shortcut = MIDIProvider.settings.shortcuts.find((e) => e.midi === note);
      if (!shortcut) return;
      switch (shortcut.type) {
        case 'toggle_play':
          togglePlay();
          break;
        case 'next_column':
          selectColumn(song.selected + 1);
          break;
        case 'previous_column':
          selectColumn(song.selected - 1);
          break;
        case 'add_column':
          addColumns(1, song.selected);
          break;
        case 'remove_column':
          removeColumns(1, song.selected);
          break;
        case 'change_layer': {
          let nextLayer = layer + 1;
          if (nextLayer >= layers.length) nextLayer = 0;
          changeLayer(nextLayer);
          break;
        }
        default:
          break;
      }
    }
  }

  function updateSettings(override?: ComposerSettingsDataType) {
    settingsService.updateComposerSettings(override !== undefined ? override : settings);
  }

  function handleSettingChange({ data, key }: SettingUpdate) {
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[key] = { ...settings[key], value: data.value };
    if (data.songSetting) {
      // A songSetting key is written straight onto the song here, so whether the write publishes
      // is decided by the field it lands on. The keys that carry the flag today are bpm, pitch and
      // reverb: bpm/pitch are signals and publish through this dynamic write (they keep public
      // setters, which is why it still works); reverb is plain on purpose - it goes straight to
      // AudioProvider below and into serialize(). A fourth songSetting whose field needs to be
      // observed would have to be a signal on the song, like those two.
      // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
      song[key] = data.value;
    }
    if (key === 'reverb') {
      AudioProvider.setReverb(data.value as boolean);
    }
    updateSettings();
  }

  function addInstrument() {
    const isUmaMode = globalConfigStore.get().IS_UMA_MODE;
    if (song.instruments.length >= NoteLayer.MAX_LAYERS && !isUmaMode)
      return logger.error(
        t('composer:cant_add_more_than_n_layers', { max_layers: NoteLayer.MAX_LAYERS })
      );
    song.addInstrument(game.instruments.list[0]);
    syncInstruments(song);
  }

  async function removeInstrument(index: number) {
    if (layers.length <= 1) return logger.warn(t('composer:cant_remove_all_layers'));
    const confirm = await asyncConfirm(
      t('composer:confirm_layer_remove', {
        // Was `i18n.t('instruments.' + name)` — a pre-existing '.'-for-':' namespace
        // separator typo that NEVER resolved (i18next returned the raw
        // "instruments.Name" key here). Routed through tInstrument like every other
        // instrument-label lookup (Codex review, ADR-0003 follow-up): locale key,
        // else config displayName, else the raw name.
        layer_name: song.instruments[index].alias ?? tInstrument(song.instruments[index].name),
      })
    );
    if (confirm) {
      song.removeInstrument(index);
      syncInstruments(song);
      layer = Math.max(0, index - 1);
    }
  }

  function editInstrument(instrument: InstrumentData, index: number) {
    // setInstrument clones and REPLACES the array entry. That fresh identity is load-bearing:
    // InstrumentControls renders a keyed {#each} over the roster, so an in-place field edit would
    // leave the layer panel showing the old name/colour/visibility. Do not "optimise" it away.
    song.setInstrument(index, instrument);
    syncInstruments(song);
  }

  async function syncInstruments(songToSync?: ComposedSong) {
    if (!songToSync) songToSync = song;
    //remove excess instruments
    const extraInstruments = layers.splice(songToSync.instruments.length);
    extraInstruments.forEach((ins) => {
      AudioProvider.disconnect(ins.endNode);
      ins.dispose();
    });
    const promises = songToSync.instruments.map(async (ins, i) => {
      if (layers[i] === undefined) {
        //If it doesn't have a layer, create one
        const instrument = new Instrument(ins.name);
        layers[i] = instrument;
        const loaded = await instrument.load(AudioProvider.getAudioContext());
        if (!loaded) logger.error(t('logs:error_loading_instrument'));
        if (!mounted) return instrument.dispose();
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      }
      if (layers[i].name === ins.name) {
        //if it has a layer and it's the same, just set the volume and reverb
        layers[i].changeVolume(ins.volume);
        AudioProvider.setReverbOfNode(layers[i].endNode, ins.reverbOverride);
        return layers[i];
      } else {
        //if it has a layer and it's different, delete the layer and create a new one
        const old = layers[i];
        AudioProvider.disconnect(old.endNode);
        old.dispose();
        const instrument = new Instrument(ins.name);
        layers[i] = instrument;
        const loaded = await instrument.load(AudioProvider.getAudioContext());
        if (!loaded) logger.error(t('logs:error_loading_instrument'));
        if (!mounted) return instrument.dispose();
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      }
    });
    if (!mounted) return;
    const newInstruments = (await Promise.all(promises)) as Instrument[];
    layers = newInstruments;
  }

  function changeVolume(obj: SettingVolumeUpdate) {
    const layerIndex = Number(obj.key.split('layer')[1]) - 1;
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[obj.key] = { ...settings[obj.key], volume: obj.value };
    layers[layerIndex].changeVolume(obj.value);
    updateSettings();
  }

  async function startRecordingAudio(override?: boolean) {
    if (!mounted) return;
    if (!override) {
      isRecordingAudio = false;
      return togglePlay(false);
    }
    AudioProvider.startRecording();
    isRecordingAudio = true;
    await delay(300);
    await togglePlay(true); //wait till song finishes
    //wait untill audio has finished playing
    await delay(settings.lookaheadTime.value + 1000);
    if (!mounted) return;
    isRecordingAudio = false;
    const recording = await AudioProvider.stopRecording();
    if (!recording) return;
    const fileName = await asyncPrompt(t('question:ask_song_name_cancellable'));
    try {
      if (fileName) await AudioRecorder.downloadBlob(recording.data, fileName + '.wav');
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_audio'));
    }
  }

  /**
   * Sound one NOTE ID on a track. Every caller already holds an id — song notes store ids,
   * and the keyboard hands back the note object — so nothing here resolves a Button any more
   * (ADR-0005 §4: the engine's public API is id-keyed). An id the track's instrument doesn't
   * offer is STRANDED there and stays silent, which is why the lookup below is still a guard.
   */
  function playSound(
    layer: number,
    id: number,
    delay?: number,
    durationMs?: number,
    skipMs?: number
  ) {
    const instrument = layers[layer];
    if (!instrument || instrument.getNoteById(id) === null) return;
    if (song.instruments[layer].muted) return;
    const pitch = song.instruments[layer].pitch || settings.pitch.value;
    if (durationMs !== undefined && instrument.supportsSustain) {
      //spanned note on a sustaining instrument: hold for its musical length, then release
      instrument.pressNote(id, pitch, { delay, durationMs, skipMs });
    } else {
      //on sustaining instruments play() IS the tap (minLength + release inside the
      //Instrument) — previews, span-1 columns and non-sustaining one-shots all land here
      instrument.play(id, pitch, delay);
    }
  }

  /** Real length in ms of columns [from, to) at the current bpm, honoring each column's tempo changer (same math and rounding as the playback tick). */
  function columnsDurationMs(from: number, to: number): number {
    const msPerBeat = 60000 / settings.bpm.value;
    let ms = 0;
    for (let i = from; i < to; i++) {
      const changer = song.columns[i]?.getTempoChanger().changer ?? 1;
      ms += Song.roundTime(msPerBeat * changer);
    }
    return ms;
  }

  function changePitch(value: Pitch) {
    settings.pitch = { ...settings.pitch, value };
    updateSettings();
  }

  // ── note press state machine (spec 2026-08-03 §2 "Composer duration UX") ─────────
  // pointerdown creates a missing note immediately (the common tap feel); removal of an
  // existing note is deferred to the short-press RELEASE so a long-press can open the
  // duration popover without deleting the note first. Buttons covered by an earlier
  // note's span obey the occupancy rule: no new note, long-press edits the covering one.
  let durationPopover: {
    startColumn: number;
    trackIndex: number;
    id: number;
    anchor: HTMLElement;
  } | null = $state(null);
  let notePress: {
    id: number;
    existedAtPress: boolean;
    coveringStart: number | null;
    longPressFired: boolean;
  } | null = null;

  function handleClick(note: ObservableNote) {
    //the clicked button's Note Id on the current layer's instrument - the one currency the
    //song edits below and the audio engine both speak (ADR-0005)
    const id = note.id;
    playSound(layer, id);
    const covering = song.getSpanCovering(song.selected, layer, id);
    if (covering) {
      notePress = {
        id,
        existedAtPress: false,
        coveringStart: covering.startColumn,
        longPressFired: false,
      };
      return;
    }
    const existing = song.selectedColumn.findNote(layer, id);
    if (existing === null) {
      song.addNoteAt(song.selected, layer, id);
      handleAutoSave();
      notePress = { id, existedAtPress: false, coveringStart: null, longPressFired: false };
    } else {
      notePress = { id, existedAtPress: true, coveringStart: null, longPressFired: false };
    }
  }

  /** Physical-keyboard / MIDI note entry: no pointer gesture exists there, so toggling stays immediate (the pre-popover behavior), occupancy rule included. */
  function toggleNoteImmediate(note: ObservableNote) {
    const id = note.id;
    playSound(layer, id);
    if (song.getSpanCovering(song.selected, layer, id)) return;
    const existing = song.selectedColumn.findNote(layer, id);
    if (existing === null) {
      song.addNoteAt(song.selected, layer, id);
    } else {
      song.removeNoteAt(song.selected, layer, id);
    }
    handleAutoSave();
  }

  function handleNoteRelease(note: ObservableNote) {
    const press = notePress;
    notePress = null;
    if (!press || press.longPressFired || press.id !== note.id) return;
    if (press.coveringStart !== null) return; //occupancy: covered buttons don't toggle
    if (press.existedAtPress) {
      song.removeNoteAt(song.selected, layer, press.id);
      handleAutoSave();
    }
  }

  function handleNoteLongPress(note: ObservableNote, anchor: HTMLElement) {
    //durations are only authorable on instruments that can actually sustain — long-press
    //does nothing on the others (the press still completes as a normal tap)
    if (!layers[layer]?.supportsSustain) return;
    const press = notePress;
    if (!press || press.id !== note.id) return;
    press.longPressFired = true;
    const startColumn = press.coveringStart ?? song.selected;
    if (!song.columns[startColumn]?.findNote(layer, press.id)) return;
    addToHistory();
    durationPopover = {
      startColumn,
      trackIndex: layer,
      id: press.id,
      anchor,
    };
  }

  // The SPAN NUMBER, never the note object. Identity trap: with cloning gone the ColumnNote is a
  // stable object, so a $derived whose value IS the note re-runs on every edit (it reads the
  // tracked columns getter) but returns a === value and never propagates - the popover's slider
  // would freeze at the span it opened with while the song and the canvas tails updated
  // underneath. null doubles as "no such note", which is what the {#if} guard below tests.
  const popoverSpan = $derived.by(() => {
    const popover = durationPopover;
    if (!popover) return null;
    return (
      song.columns[popover.startColumn]?.findNote(popover.trackIndex, popover.id)?.span ?? null
    );
  });
  const popoverMaxSpan = $derived.by(() => {
    const popover = durationPopover;
    if (!popover) return 1;
    return song.maxSpanAt(popover.startColumn, popover.trackIndex, popover.id);
  });

  function setPopoverSpan(span: number) {
    if (!durationPopover) return;
    song.setNoteSpan(
      durationPopover.startColumn,
      durationPopover.trackIndex,
      durationPopover.id,
      span
    );
    handleAutoSave();
  }

  function closeDurationPopover() {
    durationPopover = null;
  }

  /**
   * Buttons of the current layer's instrument occupied by a span in the selected column
   * (tails, plus span starts so a long note reads as long).
   *
   * Deliberately BUTTONS, not Note Ids (ADR-0004/0005): the composer keyboard's rows really
   * are the current instrument's Buttons, and its other per-button side table
   * (`computeButtonLayerStatuses`) keys by the SAME instrument's Buttons — every track's notes
   * resolved against the keyboard on screen, dropping the ids it cannot play. One coordinate
   * space for both side tables, addressed through the Button the Shape hands the snippet; the
   * -1 drop keeps ids this instrument lacks out of it, here and there alike.
   */
  const heldButtons = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt wholesale by this derived, never mutated after return
    const held = new Set<number>();
    const keyboard = layers[layer];
    if (!keyboard) return held;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<number>();
    for (let start = song.selected - 1; start >= 0; start--) {
      for (const spanNote of song.columns[start]?.notesOfTrack(layer) ?? []) {
        if (seen.has(spanNote.id)) continue;
        seen.add(spanNote.id);
        if (start + spanNote.span > song.selected) {
          const button = keyboard.getButtonFromId(spanNote.id);
          if (button !== -1) held.add(button);
        }
      }
    }
    for (const spanNote of song.selectedColumn?.notesOfTrack(layer) ?? []) {
      if (spanNote.span > 1) {
        const button = keyboard.getButtonFromId(spanNote.id);
        if (button !== -1) held.add(button);
      }
    }
    return held;
  });

  async function renameSong(newName: string, id: string) {
    await songsStore.renameSong(id, newName);
    if (song.id === id) {
      song.name = newName;
    }
  }

  async function addSong(songToAdd: ComposedSong | RecordedSong) {
    const id = await songsStore.addSong(songToAdd);
    songToAdd.id = id;
    return songToAdd;
  }

  async function updateSong(songToSave: ComposedSong): Promise<boolean> {
    //if it is the default song, ask for name and add it
    if (songToSave.name === 'Untitled') {
      const name = await asyncPrompt(t('question:ask_song_name_cancellable'));
      if (name === null || !mounted) return false;
      songToSave.name = name;
      changes = 0;
      await addSong(songToSave);
      return true;
    }
    //if it exists, update it
    const existingSong = await songService.getSongById(songToSave.id!);
    if (existingSong) {
      songToSave.folderId = existingSong.folderId;
      await songsStore.updateSong(songToSave);
      console.log('song saved:', songToSave.name);
      changes = 0;
    } else {
      //if it doesn't exist, add it
      if (songToSave.name.includes('- Composed')) {
        const name = await asyncPrompt(t('composer:ask_song_name_for_composed_song_version'));
        if (name === null) return false;
        songToSave.name = name;
        addSong(songToSave);
        return true;
      }
      console.warn("song doesn't exist");
      songToSave.name = 'Untitled';
      updateSong(songToSave);
    }
    return true;
  }

  async function updateThisSong() {
    updateSong(song);
  }

  async function askForSongUpdate() {
    return await asyncConfirm(t('question:unsaved_song_save', { song_name: song.name }), true);
  }

  async function createNewSong() {
    if (song.name !== 'Untitled' && changes > 0) {
      const promptResult = await askForSongUpdate();
      if (promptResult === null) return;
      if (promptResult) {
        await updateSong(song);
      }
    }
    const name = await asyncPrompt(t('question:ask_song_name_cancellable'));
    if (name === null) return;
    const newSong = new ComposedSong(name, [
      game.instruments.list[0],
      game.instruments.list[0],
      game.instruments.list[0],
    ]);
    changes = 0;
    if (!mounted) return;
    const added = (await addSong(newSong)) as ComposedSong;
    if (!mounted) return;
    song = added;
    layer = 0;
    // same reason as loadSong: the history belongs to the song that was just replaced
    undoHistory = [];
    copiedColumns = [];
    Analytics.songEvent({ type: 'create' });
  }

  async function loadSong(songToLoad: SerializedSong | ComposedSong) {
    try {
      let parsed: ComposedSong | null = null;
      if (songToLoad instanceof ComposedSong) {
        //TODO not sure if i should clone the song here
        parsed = songToLoad;
      } else {
        if (RecordedSong.isSerializedType(songToLoad)) {
          const parsedRecorded = RecordedSong.deserialize(songToLoad);
          parsedRecorded.bpm = 400;
          parsed = parsedRecorded.toComposedSong(4);
          parsed.name += ' - Composed';
        }
        if (ComposedSong.isSerializedType(songToLoad)) {
          parsed = ComposedSong.deserialize(songToLoad);
        }
      }
      if (!parsed) return;
      if (changes !== 0) {
        let confirm = settings.autosave.value && song.name !== 'Untitled';
        if (!confirm && song.columns.length > 0) {
          //TODO is there a reason why this was not cancellable before?
          const promptResult = await asyncConfirm(
            t('question:unsaved_song_save', { song_name: song.name }),
            true
          );
          if (promptResult === null) return;
          confirm = promptResult;
        }
        if (confirm) {
          await updateSong(song);
        }
      }
      settings.bpm = { ...settings.bpm, value: parsed.bpm };
      settings.pitch = { ...settings.pitch, value: parsed.pitch };
      settings.reverb = { ...settings.reverb, value: parsed.reverb };
      AudioProvider.setReverb(parsed.reverb);
      if (!mounted) return;
      if (songToLoad.id && song.id === null) {
        isMidiVisible = false;
      }
      changes = 0;
      console.log('song loaded');
      layer = 0;
      song = parsed;
      selectedColumns = [];
      // Both hold columns cloned from the PREVIOUS song, carrying that song's track indices.
      // refreshSong() used to launder a stale restore into a fresh graph one tick later; with no
      // clone, undoing after a load installs the old song's columns into the new one - and then
      // autosaves the result.
      undoHistory = [];
      copiedColumns = [];
      syncInstruments();
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_loading_song'));
    }
  }

  function addColumns(amount = 1, position: number | 'end' = 'end') {
    song.addColumns(amount, position);
    if (amount === 1) selectColumn(song.selected + 1);
    handleAutoSave();
  }

  function removeColumns(amount: number, position: number) {
    if (song.columns.length < settings.beatMarks.value * 4) return;
    song.removeColumns(amount, position);
    if (song.columns.length <= song.selected) selectColumn(song.selected - 1);
    handleAutoSave();
  }

  async function togglePlay(override?: boolean): Promise<void> {
    const newState = typeof override === 'boolean' ? override : !isPlaying;
    isPlaying = newState;
    //stopping playback releases voices still held from spanned notes
    if (!isPlaying) layers.forEach((layer) => layer?.releaseAllNotes());
    if (isPlaying) {
      const lookahead = settings.lookaheadTime.value / 1000;
      selectColumn(song.selected, false, lookahead);
      pressSpansCoveringStart(lookahead);
    }
    let delayOffset = 0;
    let previousTime: number;
    while (isPlaying) {
      const tempoChanger = song.selectedColumn.getTempoChanger().changer;
      const msPerBeat = (60000 / settings.bpm.value) * tempoChanger + delayOffset;
      previousTime = Date.now();
      await delay(Song.roundTime(msPerBeat));
      if (!isPlaying || !mounted) break;
      delayOffset = previousTime + msPerBeat - Date.now();
      const lookaheadTime = settings.lookaheadTime.value / 1000;
      //this schedules the next column counting for the error delay so that timing is more accurate
      handlePlaybackTick(Math.max(0, lookaheadTime + delayOffset / 1000));
    }
  }

  function handlePlaybackTick(errorDelay: number) {
    const newIndex = song.selected + 1;
    if (isPlaying && newIndex > song.columns.length - 1) {
      return togglePlay(false);
    }
    selectColumn(newIndex, false, errorDelay);
  }

  /**
   * Notes whose span begins BEFORE the playback start column but still covers it
   * (play pressed mid-note): press each at the audio position it would have reached
   * by now, releasing where its span really ends. Under the no-overlap invariant the
   * nearest earlier same-(track, id) note is the only possible coverer, so a backward
   * scan marking seen pairs decides every candidate at its first sighting. Only
   * sustaining tracks resume — a one-shot sample's attack happened in the past and
   * cannot be meaningfully re-entered.
   */
  function pressSpansCoveringStart(delaySeconds: number) {
    const startColumn = song.selected;
    //mirrors selectColumn's recording offset so resumed spans stay aligned with the column notes
    const delay = delaySeconds ? delaySeconds + (isRecordingAudio ? 0.5 : 0) : 0;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<string>();
    for (let start = startColumn - 1; start >= 0; start--) {
      for (const spanNote of song.columns[start]?.notes ?? []) {
        const key = `${spanNote.trackIndex}:${spanNote.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (start + spanNote.span <= startColumn) continue;
        if (!layers[spanNote.trackIndex]?.supportsSustain) continue;
        //no id -> button -> id round-trip: playSound takes the id and drops it if the
        //track's instrument doesn't offer it (stranded = silent)
        playSound(
          spanNote.trackIndex,
          spanNote.id,
          delay,
          columnsDurationMs(startColumn, start + spanNote.span),
          columnsDurationMs(start, startColumn)
        );
      }
    }
  }

  // Nothing is chained onto this. song.toggleBreakpoint() assigns a new breakpoints array (which
  // is what publishing means for that $state.raw field) and refuses any index validateBreakpoints()
  // would filter, so the toggle itself does not produce one to clean up.
  // Breakpoints going stale because COLUMNS disappeared is a different problem and not this
  // wrapper's to solve: the paths that shrink the live song's column array validate inside
  // ComposedSong - see validateBreakpoints' own docstring for which and why.
  function toggleBreakpoint(override?: number) {
    song.toggleBreakpoint(override);
  }

  function handleTempoChanger(changer: (typeof game.composer.tempoChangers)[number]) {
    if (selectedColumns.length) {
      addToHistory();
      song.setTempoChangerAt(selectedColumns, changer);
    } else {
      song.setTempoChangerAt(song.selected, changer);
    }
    handleAutoSave();
  }

  async function prepareToLeave(): Promise<boolean> {
    if (changes === 0) return true;
    if (settings.autosave.value) return updateSong(song);
    const shouldSave = await asyncConfirm(
      t('question:unsaved_song_save', { song_name: song.name }),
      true
    );
    if (shouldSave === null) return false;
    if (!shouldSave) return true;
    return updateSong(song);
  }

  async function changePage(pageName: string) {
    if (pageName === 'Home') return homeStore.open();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AppLink.svelte's identical resolve(href as any) note; pageName is a general runtime string, not a literal route id
    await goto(resolve(`/${pageName}` as any));
  }

  function selectColumn(index: number, ignoreAudio?: boolean, delay?: number) {
    if (index < 0 || index > song.columns.length - 1) return;
    //moving to another column dismisses the duration popover (spec §2 dismissal rules)
    if (durationPopover !== null && index !== song.selected) durationPopover = null;
    song.selected = index;
    if (isToolsVisible && copiedColumns.length === 0) {
      // the clicked column only ever feeds the min/max below, which then replace the array
      // wholesale - so extend the RANGE rather than pushing into the array (see its declaration)
      const min = Math.min(index, ...selectedColumns);
      const max = Math.max(index, ...selectedColumns);
      selectedColumns = new Array(max - min + 1).fill(0).map((_, i) => min + i);
    }
    // BEHAVIOR NOTE: refreshSong() used to clone unconditionally, so re-selecting the SAME index
    // still forced a repaint. Writing an unchanged value to the `selected` signal notifies
    // nothing. The case that used to depend on that is togglePlay's selectColumn(song.selected, ...)
    // on play-start: the canvas effect does re-run, because it reads `isPlaying` - but the renderer
    // excludes `isPlaying` from its repaint diff (it changes no pixel there), so update() returns
    // without rendering and the canvas keeps what it had. Nothing about a column's APPEARANCE
    // depends on whether the song is playing, so there is nothing to repaint.
    // What that same update DOES do, with smooth scrolling on, is start the glide: the renderer
    // reads `isPlaying` in its syncScrollSchedule, and this is the transition that schedules the
    // first column's travel and starts the ticker that animates it. A no-op for pixels, and not a
    // no-op for the renderer.
    //add a bit of delay if recording audio to imrove the recording quality
    delay = delay ? delay + (isRecordingAudio ? 0.5 : 0) : 0;
    if (ignoreAudio) return;
    song.selectedColumn.notes.forEach((note) => {
      //held length only for spanned notes during playback — span 1 is the pre-sustain
      //tap, and manually browsing columns always previews taps. Stranded ids stay silent
      //inside playSound, so no -1 guard is needed here any more.
      playSound(
        note.trackIndex,
        note.id,
        delay,
        isPlaying && note.span > 1
          ? columnsDurationMs(song.selected, song.selected + note.span)
          : undefined
      );
    });
  }

  function selectColumnFromDirection(direction: number) {
    selectColumn(song.selected + direction);
  }

  function changeLayer(newLayer: number) {
    layer = newLayer;
    durationPopover = null;
  }

  function toggleTools() {
    const wasVisible = isToolsVisible;
    isToolsVisible = !wasVisible;
    selectedColumns = wasVisible ? [] : [song.selected];
    copiedColumns = [];
    undoHistory = [];
  }

  function resetSelection() {
    copiedColumns = [];
    selectedColumns = [song.selected];
  }

  function addToHistory() {
    if (!isToolsVisible) return;
    undoHistory = [...undoHistory, song.clone().columns];
  }

  function undo() {
    const history = undoHistory.pop();
    if (!history) return;
    song.restoreColumns(history);
  }

  function copyColumns(targetLayer: number | 'all') {
    copiedColumns = song.copyColumns(selectedColumns, targetLayer);
    changes++;
    selectedColumns = [];
  }

  function pasteColumns(insert: boolean, targetLayer: number | 'all') {
    addToHistory();
    if (targetLayer === 'all') song.pasteColumns(copiedColumns, insert);
    else if (Number.isFinite(targetLayer)) song.pasteLayer(copiedColumns, insert, targetLayer);
    syncInstruments();
    changes++;
  }

  function eraseColumns(targetLayer: number | 'all') {
    addToHistory();
    song.eraseColumns(selectedColumns, targetLayer);
    changes++;
    selectedColumns = [song.selected];
  }

  function moveNotesBy(amount: number, position: number | 'all') {
    addToHistory();
    song.moveNotesBy(selectedColumns, amount, position);
    changes++;
  }

  function switchLayerPosition(direction: 1 | -1) {
    const toSwap = layer + direction;
    if (toSwap < 0 || toSwap > song.instruments.length - 1) return;
    // two halves of one move: swapLayer retags the notes (structure version), swapInstruments
    // reorders the roster (instruments signal)
    song.swapLayer(song.columns.length, 0, layer, toSwap);
    song.swapInstruments(layer, toSwap);
    changes++;
    syncInstruments();
    layer = toSwap;
  }

  function deleteColumns() {
    addToHistory();
    // no validateBreakpoints() chained on: deleteColumns() runs it itself, like the other paths
    // that shrink the column array. It did not use to, and while that was so, this call site was
    // what kept a deleted column's breakpoint out of the saved song
    song.deleteColumns(selectedColumns);
    changes++;
    selectedColumns = [song.selected];
  }

  function changeMidiVisibility(visible: boolean) {
    isMidiVisible = visible;
    if (visible) Analytics.songEvent({ type: 'create_MIDI' });
  }

  async function downloadSong(songToDownload: SerializedSong, as: 'song' | 'midi') {
    try {
      if (songToDownload.id === song.id) {
        if (settings.autosave.value) {
          await updateSong(song);
          songToDownload = song.serialize();
        } else {
          if (
            await asyncConfirm(
              t('composer:ask_download_of_current_song', { song_name: songToDownload.name })
            )
          ) {
            await updateSong(song);
            songToDownload = song.serialize();
          }
        }
      }
      if (as === 'song') {
        const parsed = songService.parseSong(songToDownload);
        songToDownload.data.appName = APP_NAME;
        const songName = songToDownload.name;
        const usesOldFormat =
          game.features.downloadsSongsInOldFormat &&
          (parsed instanceof ComposedSong || parsed instanceof RecordedSong);
        if (usesOldFormat) {
          const dropped = parsed.countOldFormatDroppedNotes();
          if (dropped > 0)
            logger.warn(t('logs:old_format_export_dropped_notes', { count: dropped }), 8000);
        }
        const converted = [usesOldFormat ? parsed.toOldFormat() : parsed.serialize()];
        fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`);
        logger.success(t('logs:song_downloaded'));
        Analytics.userSongs('download', { page: 'composer' });
      } else if (as === 'midi') {
        const agrees = await asyncConfirm(t('menu:midi_download_warning'));
        const parsed = songService.parseSong(songToDownload);
        if (parsed instanceof VsrgSong) throw new Error("Can't convert Vsrg to MIDI");
        const midi = parsed.toMidi();
        if (!agrees) return;
        fileService.downloadMidi(midi);
        logger.success(t('logs:song_downloaded'));
      }
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_song'));
    }
  }
</script>

{#snippet playIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    style="color:var(--icon-color)"
    ><path
      d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"
    /></svg
  >
{/snippet}

{#snippet pauseIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    style="color:var(--icon-color)"
    ><path
      d="M144 479H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v352c0 26.5-21.5 48-48 48zm304-48V79c0-26.5-21.5-48-48-48h-96c-26.5 0-48 21.5-48 48v352c0 26.5 21.5 48 48 48h96c26.5 0 48-21.5 48-48z"
    /></svg
  >
{/snippet}

{#snippet addColumnIcon()}
  <svg
    width="194.40327mm"
    height="290.853mm"
    viewBox="0 0 194.40327 290.85299"
    xmlns="http://www.w3.org/2000/svg"
    class="tool-icon"
    style="fill:currentcolor"
  >
    <g>
      <rect
        width="50.962246"
        height="290.853"
        x="143.44104"
        y="2.4868996e-14"
        rx="15.05095"
        ry="17.061689"
      />
      <path
        d="m 42.968955,90.42652 c -2.198688,0 -3.96875,1.770063 -3.96875,3.96875 v 35.03145 H 3.9687499 C 1.7700625,129.42672 0,131.19678 0,133.39547 v 24.0621 c 0,2.19869 1.7700625,3.96875 3.9687499,3.96875 H 39.000205 v 35.03145 c 0,2.19869 1.770062,3.96875 3.96875,3.96875 h 24.062613 c 2.198687,0 3.968749,-1.77006 3.968749,-3.96875 v -35.03145 h 35.030933 c 2.19869,0 3.96875,-1.77006 3.96875,-3.96875 v -24.0621 c 0,-2.19869 -1.77006,-3.96875 -3.96875,-3.96875 H 71.000317 V 94.39527 c 0,-2.198687 -1.770062,-3.96875 -3.968749,-3.96875 z"
      />
      <rect width="7.8557625" height="1.5711526" x="57.085205" y="139.30885" rx="3.96875" />
    </g>
  </svg>
{/snippet}

{#snippet removeColumnIcon()}
  <svg
    width="194.40327mm"
    height="290.853mm"
    viewBox="0 0 194.40327 290.85299"
    xmlns="http://www.w3.org/2000/svg"
    class="tool-icon"
    style="fill:currentcolor"
  >
    <g>
      <rect
        width="50.962246"
        height="290.853"
        x="143.44104"
        y="2.4868996e-14"
        rx="15.05095"
        ry="17.061689"
      />
      <rect width="110.35661" height="35.805271" x="0" y="127.52386" rx="3.96875" />
    </g>
  </svg>
{/snippet}

{#snippet addPageIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet toolsIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M501.1 395.7L384 278.6c-23.1-23.1-57.6-27.6-85.4-13.9L192 158.1V96L64 0 0 64l96 128h62.1l106.6 106.6c-13.6 27.8-9.2 62.3 13.9 85.4l117.1 117.1c14.6 14.6 38.2 14.6 52.7 0l52.7-52.7c14.5-14.6 14.5-38.2 0-52.7zM331.7 225c28.3 0 54.9 11 74.9 31l19.4 19.4c15.8-6.9 30.8-16.5 43.8-29.5 37.1-37.1 49.7-89.3 37.9-136.7-2.2-9-13.5-12.1-20.1-5.5l-74.4 74.4-67.9-11.3L334 98.9l74.4-74.4c6.6-6.6 3.4-17.9-5.7-20.2-47.4-11.7-99.6.9-136.6 37.9-28.5 28.5-41.9 66.1-41.2 103.6l82.1 82.1c8.1-1.9 16.5-2.9 24.7-2.9zm-103.9 82l-56.7-56.7L18.7 402.8c-25 25-25 65.5 0 90.5s65.5 25 90.5 0l123.6-123.6c-7.6-19.9-9.9-41.6-5-62.7zM64 472c-13.2 0-24-10.8-24-24 0-13.3 10.7-24 24-24s24 10.7 24 24c0 13.2-10.7 24-24 24z"
    /></svg
  >
{/snippet}

<PageMetadata
  text={`${t('home:composer_name')} - ${song.name}`}
  description="Create or edit songs with the composer, using up to 52 layers, tempo changers, multiple instruments and pitches. You can also convert a MIDI, video or audio into a sheet."
/>
{#if isMidiVisible}
  <MidiParser
    data={{
      instruments: song.instruments,
      selectedColumn: song.selected,
    }}
    functions={{
      changeMidiVisibility,
      changePitch,
      loadSong,
    }}
  />
{/if}
<div class="composer-grid appear-on-mount">
  <div class="column composer-left-control">
    <AppButton
      class="flex-centered"
      style="height:3rem;min-height:3rem;border-radius:0.3rem;background-color:var(--primary-darken-10)"
      onclick={() => {
        const wasPlaying = isPlaying;
        togglePlay();
        if (settings.syncTabs.value) {
          // QUIRK: opposite ternary from handleShortcut's toggle_play broadcast - see that function.
          broadcastChannel?.postMessage?.(wasPlaying ? 'stop' : 'play');
        }
      }}
      ariaLabel={isPlaying ? t('common:pause') : t('common:play')}
    >
      {#if isPlaying}
        {@render pauseIcon()}
      {:else}
        {@render playIcon()}
      {/if}
    </AppButton>
    <InstrumentControls
      instruments={song.instruments}
      selected={layer}
      onLayerSelect={changeLayer}
      onInstrumentAdd={addInstrument}
      onInstrumentChange={editInstrument}
      onInstrumentDelete={removeInstrument}
      onChangePosition={switchLayerPosition}
    />
  </div>
  <div class="top-panel-composer" style="grid-area:b">
    <div class="row" style="height:fit-content;width:100%">
      {#key settings.columnsPerCanvas.value}
        <ComposerCanvas
          columns={song.columns}
          structureVersion={song.structureVersion}
          {isPlaying}
          {isRecordingAudio}
          instruments={song.instruments}
          selected={song.selected}
          currentLayer={layer}
          {inPreview}
          {settings}
          breakpoints={song.breakpoints}
          {selectedColumns}
          {selectColumn}
          {toggleBreakpoint}
        />
      {/key}
      <div class="buttons-composer-wrapper-right">
        <CanvasTool
          onclick={() => addColumns(1, song.selected)}
          tooltip={t('composer:add_column')}
          ariaLabel={t('composer:add_column')}
        >
          {@render addColumnIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={() => removeColumns(1, song.selected)}
          tooltip={t('composer:remove_column')}
          ariaLabel={t('composer:remove_column')}
        >
          {@render removeColumnIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={() => addColumns(Number(settings.beatMarks.value) * 4, 'end')}
          tooltip={t('composer:add_new_page')}
          ariaLabel={t('composer:add_new_page')}
        >
          {@render addPageIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={toggleTools}
          tooltip={t('composer:open_tools')}
          ariaLabel={t('composer:open_tools')}
        >
          {@render toolsIcon()}
        </CanvasTool>
      </div>
    </div>
  </div>
  <ComposerKeyboard
    functions={{
      handleClick,
      handleNoteRelease,
      handleNoteLongPress,
      startRecordingAudio,
      selectColumnFromDirection,
      handleTempoChanger,
    }}
    data={{
      isPlaying,
      settings,
      isRecordingAudio,
      currentLayer: layer,
      instruments: song.instruments,
      keyboard: layers[layer],
      currentColumn: song.selectedColumn,
      heldButtons,
      pitch: song.instruments[layer]?.pitch || settings.pitch.value,
      noteNameType: settings.noteNameType.value,
    }}
  />
  {#if durationPopover && popoverSpan !== null}
    <ComposerDurationPopover
      span={popoverSpan}
      maxSpan={popoverMaxSpan}
      anchor={durationPopover.anchor}
      onChange={setPopoverSpan}
      onClose={closeDurationPopover}
    />
  {/if}
</div>
<ComposerMenu
  data={{
    isRecordingAudio,
    settings,
    hasChanges: changes > 0,
    currentSongId: song.id,
  }}
  functions={{
    loadSong,
    renameSong,
    downloadSong,
    createNewSong,
    changePage,
    updateThisSong,
    handleSettingChange,
    changeVolume,
    changeMidiVisibility,
    startRecordingAudio,
  }}
  {inPreview}
/>
<ComposerTools
  data={{
    isToolsVisible,
    layer,
    hasCopiedColumns: copiedColumns.length > 0,
    selectedColumns,
    undoHistory,
  }}
  functions={{
    toggleTools,
    copyColumns,
    eraseColumns,
    moveNotesBy,
    pasteColumns,
    deleteColumns,
    resetSelection,
    undo,
  }}
/>
<div class="song-info">
  <div class="text-ellipsis">
    {song.name}
  </div>
  <div>
    {formatMs(songLength.current)}
    /
    {formatMs(songLength.total)}
  </div>
</div>
