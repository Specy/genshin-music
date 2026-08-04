<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { game } from '$game';
  import { APP_NAME } from '$core/legacyConfig';
  import type { Pitch } from '$lib/games/types';
  import { t } from '$i18n/binding.svelte';
  import { i18n } from '$i18n/i18n';
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
  import { ComposedSong, type UnknownSerializedComposedSong } from '$core/Songs/ComposedSong';
  import { RecordedSong, type SerializedRecordedSong } from '$core/Songs/RecordedSong';
  import { VsrgSong } from '$core/Songs/VsrgSong';
  import { Song, type SerializedSong } from '$core/Songs/Song';
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
  let selectedColumns: number[] = $state([]);
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

  // song is a class instance, and $state() only deep-wraps plain objects/arrays - mutating it
  // in place would not trigger reactivity. Call this after every mutation; clone() rebuilds a
  // fresh instance so template/child-prop reads pick up the change.
  function refreshSong() {
    song = song.clone();
  }

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
        toggleNoteImmediate(currentInstrument.notes[keyboardNote.index]);
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
      // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
      song[key] = data.value;
      refreshSong();
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
    refreshSong();
    syncInstruments(song);
  }

  async function removeInstrument(index: number) {
    if (layers.length <= 1) return logger.warn(t('composer:cant_remove_all_layers'));
    const confirm = await asyncConfirm(
      t('composer:confirm_layer_remove', {
        // QUIRK: '.' instead of the ':' namespace separator every other instrument-label
        // lookup uses (e.g. InstrumentControls.svelte's t(`instruments:${ins.name}`)) - a
        // pre-existing typo kept so the resolved i18next key doesn't change.
        layer_name:
          song.instruments[index].alias ?? i18n.t('instruments.' + song.instruments[index].name),
      })
    );
    if (confirm) {
      song.removeInstrument(index);
      syncInstruments(song);
      refreshSong();
      layer = Math.max(0, index - 1);
    }
  }

  function editInstrument(instrument: InstrumentData, index: number) {
    song.instruments[index] = instrument.clone();
    song.instruments = [...song.instruments];
    syncInstruments(song);
    refreshSong();
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

  function playSound(layer: number, index: number, delay?: number, durationMs?: number) {
    const instrument = layers[layer];
    const note = instrument?.notes[index];
    if (note === undefined) return;
    if (song.instruments[layer].muted) return;
    const pitch = song.instruments[layer].pitch || settings.pitch.value;
    if (durationMs !== undefined && instrument.supportsSustain) {
      //spanned note on a sustaining instrument: hold for its musical length, then release
      instrument.pressNote(note.index, pitch, { delay, durationMs });
    } else {
      instrument.play(note.index, pitch, delay);
    }
  }

  /** Real length in ms of a note's column span starting at the currently selected column (same math as the playback tick). */
  function spanDurationMs(span: number): number | undefined {
    if (span <= 1) return undefined;
    const msPerBeat = 60000 / settings.bpm.value;
    let ms = 0;
    for (let i = song.selected; i < song.selected + span; i++) {
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
    //the clicked button's Note Id on the current layer's instrument
    const id = note.midiNote;
    playSound(layer, note.index);
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
      song.selectedColumn.addNote(layer, id);
      refreshSong();
      handleAutoSave();
      notePress = { id, existedAtPress: false, coveringStart: null, longPressFired: false };
    } else {
      notePress = { id, existedAtPress: true, coveringStart: null, longPressFired: false };
    }
  }

  /** Physical-keyboard / MIDI note entry: no pointer gesture exists there, so toggling stays immediate (the pre-popover behavior), occupancy rule included. */
  function toggleNoteImmediate(note: ObservableNote) {
    const id = note.midiNote;
    playSound(layer, note.index);
    if (song.getSpanCovering(song.selected, layer, id)) return;
    const existing = song.selectedColumn.findNote(layer, id);
    if (existing === null) {
      song.selectedColumn.addNote(layer, id);
    } else {
      song.selectedColumn.removeNote(layer, id);
    }
    refreshSong();
    handleAutoSave();
  }

  function handleNoteRelease(note: ObservableNote) {
    const press = notePress;
    notePress = null;
    if (!press || press.longPressFired || press.id !== note.midiNote) return;
    if (press.coveringStart !== null) return; //occupancy: covered buttons don't toggle
    if (press.existedAtPress) {
      song.selectedColumn.removeNote(layer, press.id);
      refreshSong();
      handleAutoSave();
    }
  }

  function handleNoteLongPress(note: ObservableNote, anchor: HTMLElement) {
    //durations are only authorable on instruments that can actually sustain — long-press
    //does nothing on the others (the press still completes as a normal tap)
    if (!layers[layer]?.supportsSustain) return;
    const press = notePress;
    if (!press || press.id !== note.midiNote) return;
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

  const popoverNote = $derived.by(() => {
    const popover = durationPopover;
    if (!popover) return null;
    return song.columns[popover.startColumn]?.findNote(popover.trackIndex, popover.id) ?? null;
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
    refreshSong();
    handleAutoSave();
  }

  function closeDurationPopover() {
    durationPopover = null;
  }

  /** Buttons of the current layer's instrument occupied by a span in the selected column (tails, plus span starts so a long note reads as long). */
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
      refreshSong();
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
      refreshSong();
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
        refreshSong();
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
    Analytics.songEvent({ type: 'create' });
  }

  async function loadSong(songToLoad: SerializedSong | ComposedSong) {
    try {
      let parsed: ComposedSong | null = null;
      if (songToLoad instanceof ComposedSong) {
        //TODO not sure if i should clone the song here
        parsed = songToLoad;
      } else {
        if (songToLoad.type === 'recorded') {
          const parsedRecorded = RecordedSong.deserialize(songToLoad as SerializedRecordedSong);
          parsedRecorded.bpm = 400;
          parsed = parsedRecorded.toComposedSong(4);
          parsed.name += ' - Composed';
        }
        if (songToLoad.type === 'composed') {
          parsed = ComposedSong.deserialize(songToLoad as UnknownSerializedComposedSong);
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
    refreshSong();
  }

  function removeColumns(amount: number, position: number) {
    if (song.columns.length < settings.beatMarks.value * 4) return;
    song.removeColumns(amount, position);
    if (song.columns.length <= song.selected) selectColumn(song.selected - 1);
    handleAutoSave();
    refreshSong();
  }

  async function togglePlay(override?: boolean): Promise<void> {
    const newState = typeof override === 'boolean' ? override : !isPlaying;
    isPlaying = newState;
    //stopping playback releases voices still held from spanned notes
    if (!isPlaying) layers.forEach((layer) => layer?.releaseAllNotes());
    if (isPlaying) selectColumn(song.selected, false, settings.lookaheadTime.value / 1000);
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

  function toggleBreakpoint(override?: number) {
    song.toggleBreakpoint(override);
    validateBreakpoints();
  }

  function handleTempoChanger(changer: (typeof game.composer.tempoChangers)[number]) {
    if (selectedColumns.length) {
      addToHistory();
      selectedColumns.forEach((column) => {
        song.columns[column]?.setTempoChanger(changer);
      });
    } else {
      song.selectedColumn.setTempoChanger(changer);
    }
    handleAutoSave();
    refreshSong();
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
      selectedColumns.push(index);
      const min = Math.min(...selectedColumns);
      const max = Math.max(...selectedColumns);
      selectedColumns = new Array(max - min + 1).fill(0).map((_, i) => min + i);
    }
    refreshSong();
    //add a bit of delay if recording audio to imrove the recording quality
    delay = delay ? delay + (isRecordingAudio ? 0.5 : 0) : 0;
    if (ignoreAudio) return;
    song.selectedColumn.notes.forEach((note) => {
      const button = layers[note.trackIndex]?.getButtonFromId(note.id) ?? -1;
      if (button === -1) return; //stranded on its instrument = silent
      //held length only during playback — manually browsing columns previews a short tap
      playSound(note.trackIndex, button, delay, isPlaying ? spanDurationMs(note.span) : undefined);
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
    song.columns = history;
    song.selected = song.columns.length > song.selected ? song.selected : song.columns.length - 1;
    refreshSong();
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
    refreshSong();
  }

  function eraseColumns(targetLayer: number | 'all') {
    addToHistory();
    song.eraseColumns(selectedColumns, targetLayer);
    changes++;
    selectedColumns = [song.selected];
    refreshSong();
  }

  function moveNotesBy(amount: number, position: number | 'all') {
    addToHistory();
    song.moveNotesBy(selectedColumns, amount, position);
    changes++;
    refreshSong();
  }

  function switchLayerPosition(direction: 1 | -1) {
    const toSwap = layer + direction;
    if (toSwap < 0 || toSwap > song.instruments.length - 1) return;
    song.swapLayer(song.columns.length, 0, layer, toSwap);
    const tmp = song.instruments[layer];
    song.instruments[layer] = song.instruments[toSwap];
    song.instruments[toSwap] = tmp;
    song.instruments = [...song.instruments];
    changes++;
    syncInstruments();
    refreshSong();
    layer = toSwap;
  }

  function deleteColumns() {
    addToHistory();
    song.deleteColumns(selectedColumns);
    changes++;
    selectedColumns = [song.selected];
    refreshSong();
    validateBreakpoints();
  }

  function validateBreakpoints() {
    song.validateBreakpoints();
    refreshSong();
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
          {isPlaying}
          {isRecordingAudio}
          {song}
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
  {#if durationPopover && popoverNote}
    <ComposerDurationPopover
      span={popoverNote.span}
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
