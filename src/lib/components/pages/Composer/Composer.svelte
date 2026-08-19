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
  import { ComposerInstrumentSynchronizer } from './ComposerInstrumentSynchronizer';
  import CanvasTool from './CanvasTool.svelte';
  import InstrumentControls from './InstrumentControls.svelte';
  import { Instrument, type ObservableNote } from '$lib/audio/Instrument.svelte';
  import { ComposerTransport, TRANSPORT_START_MARGIN_S } from '$lib/audio/ComposerTransport';
  import AudioRecorder from '$lib/audio/AudioRecorder';
  import Analytics from '$core/Analytics';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import { VsrgSong } from '$core/Songs/VsrgSong.svelte';
  import { Song, type SerializedSong } from '$core/Songs/Song.svelte';
  import { NoteLayer } from '$core/Songs/Layer';
  import type { ColumnNote, InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
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
    createReleaseGuard,
    createShortcutListener,
    type ShortcutListener,
  } from '$stores/KeybindsStore.svelte';
  import { HeldNoteRegistry, holderToken, midiHolderToken } from '$lib/audio/HeldNoteRegistry';
  import { spanForHeldMs } from '$core/Songs/sustainQuantize';
  import { registerLeaveHandler } from '$stores/navigationGuard.svelte';
  import { calculateSongLength, clamp, delay, formatMs } from '$core/utils/Utilities';

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
  // One-time seed, not reactive: later bpm/pitch edits flow through handleSettingChange's
  // songSetting branch instead, which writes song.bpm/song.pitch directly.
  //
  // THE SONG IS THE SINGLE SOURCE OF TRUTH for the Basepoint inside this component, and every
  // read of it below goes through `song.pitch` for that reason. Since ADR-0007 the Basepoint
  // decides what a stored number MEANS, so a settings copy that had drifted from the song would
  // not be a wrong playback rate any more — the keyboard would enter numbers at one Basepoint
  // while the canvas drew them at another. `settings.pitch` survives as the persisted UI copy,
  // written together with the song on every edit and re-seeded FROM it on load and undo.
  // svelte-ignore state_referenced_locally
  song.bpm = settings.bpm.value;
  // svelte-ignore state_referenced_locally
  song.pitch = settings.pitch.value;
  let layer = $state(0);
  // `$state.raw`, like song.breakpoints/song.instruments: this array is handed to the canvas and
  // the renderer calls `selectedColumns.includes(i)` once per visible column on every draw, so it
  // has to stay a PLAIN array rather than a deep proxy whose every element read is a trap. The
  // rule that comes with it: assign a new array, never push/splice (every write below already
  // does, see selectColumn).
  let selectedColumns: number[] = $state.raw([]);
  /**
   * One undo step. COMPOUND since ADR-0007, and it has to be: a Basepoint change or an instrument
   * swap rewrites the notes AND moves the setting that says what they mean, so a columns-only
   * snapshot would restore the notes into a song still claiming the new Basepoint — every one of
   * them a semitone (or an instrument) out. The three are captured and restored together or the
   * edit is not undoable at all.
   */
  type ComposerHistoryEntry = {
    columns: NoteColumn[];
    pitch: Pitch;
    instruments: InstrumentData[];
  };
  let undoHistory: ComposerHistoryEntry[] = $state([]);
  let copiedColumns: NoteColumn[] = $state([]);
  let isToolsVisible = $state(false);
  // One-time seed from the prop; later showMidi changes (callers never send any) are not tracked.
  // svelte-ignore state_referenced_locally
  let isMidiVisible = $state(showMidi || false);
  let isRecordingAudio = $state(false);
  let isPlaying = $state(false);
  // A context resume can be pending before playback has an audio-clock anchor. Keep that state
  // separate from isPlaying: the canvas must not move until audio has an exact start time, while
  // a second press still needs to cancel the pending request.
  let playbackStarting = $state(false);
  const playbackActive = $derived(isPlaying || playbackStarting);
  let playbackColumnStartMs = $state(0);
  let playbackAnchorGeneration = $state(0);
  let changes = $state(0);

  let broadcastChannel: BroadcastChannel | null = null;
  let mounted = false;
  let cleanup: (() => void)[] = [];
  const instrumentSynchronizer = new ComposerInstrumentSynchronizer({
    getLayers: () => layers,
    setLayers: (nextLayers) => (layers = nextLayers),
    isMounted: () => mounted,
    onLoadError: () => logger.error(t('logs:error_loading_instrument')),
    //ADR-0006 resync-on-mutation: an instrument swap replaces the layer that would sound the
    //committed window, and only NOW does the loaded replacement exist to recommit through.
    onSynced: () => resyncPlayback(),
  });

  const currentInstrument = $derived(layers[layer]);
  const songLength = $derived(calculateSongLength(song.columns, settings.bpm.value, song.selected));
  const usedLayersInSelectedColumn = $derived.by(() => {
    // Rebuilt as one immutable value whenever the song graph or selected column changes; the
    // instrument panel only needs membership checks, not a reactive collection of its own.
    return new Set(song.selectedColumn?.notes.map((note) => note.trackIndex) ?? []);
  });

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
      handleKeyboardShortcut,
      { onRelease: handleKeyboardRelease }
    );
    //a key-up that never arrives (alt-tab, tab hidden, iOS bfcache) would leave a looping
    //sustaining voice sounding and its span growing for a key nobody is holding
    cleanup.push(
      shortcutKeyboardListener,
      shortcutListener,
      createReleaseGuard(endAllSustainRecordings)
    );
    settings = loadedSettings;
    //the persisted settings arrive AFTER the defaults the song was seeded from, so re-seed both
    //song-level values a fresh song carries (see their declaration) — nothing is loaded yet, so
    //there are no notes for the Basepoint to move
    song.bpm = loadedSettings.bpm.value;
    song.pitch = loadedSettings.pitch.value;
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
      endAllSustainRecordings();
      AudioProvider.clear();
      layers.forEach((instrument) => instrument.dispose());
      broadcastChannel?.close?.();
      isPlaying = false;
      playbackStarting = false;
      playbackStartGeneration++;
      //not the full stop path (the instruments were just disposed — there is nothing left to
      //cancel or release), but the transport's pending worker-timer wake survives unmount on
      //its own, and an awaiting startRecordingAudio needs the play-run promise settled so its
      //!mounted bail can run
      transport.stop();
      playbackEnded?.resolve();
      playbackEnded = null;
      cleanup.forEach((dispose) => dispose());
      KeyboardProvider.unregisterById('composer');
      //the tempo-changer digits register under their own id — unregistering only 'composer'
      //left one live handler set per mount, and they now share the page with held notes
      KeyboardProvider.unregisterById('composer_keyboard');
      MIDIProvider.removeListener(handleMidi);
      MIDIProvider.removeInputsListener(handleMidiInputsChange);
      if (AudioProvider.isRecording) AudioProvider.stopRecording();
      if (window.location.hostname !== 'localhost') {
        window.removeEventListener('beforeunload', handleUnload);
      }
    };
  });

  async function init(loadedSettings: ComposerSettingsDataType) {
    await syncInstruments();
    //the teardown above is synchronous, so an unmount during that await would run BEFORE these
    //registrations and leave both listeners behind — one live set per fast mount/unmount
    if (!mounted) return;
    AudioProvider.setReverb(loadedSettings.reverb.value);
    MIDIProvider.addListener(handleMidi);
    MIDIProvider.addInputsListener(handleMidiInputsChange);
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

  const handleKeyboardShortcut: ShortcutListener<'keyboard'> = ({ shortcut, code, event }) => {
    if (event.repeat) return;
    const shouldEditKeyboard = isPlaying || event.shiftKey;
    if (shouldEditKeyboard) {
      const note = currentInstrument.getNoteFromCode(shortcut.name);
      if (note === null) return;
      //the PHYSICAL key holds the note, not the shortcut name, so a keyboard LAYOUT change
      //mid-hold cannot orphan the release (KeyboardEvent.code is layout-independent). Rebinding
      //the key itself mid-hold still can: the key-up half only fires for keys that are bound.
      if (startSustainRecording(holderToken('keyboard', code), note.numberAt(layerPitch))) return;
      toggleNoteImmediate(note);
    }
  };

  /**
   * Key-up half of hold-to-sustain. Deliberately NOT gated on `isPlaying || shiftKey` the way
   * the down half is: that gate can flip while a key is down (playback ends under a held key),
   * and releasing a holder that holds nothing is a no-op anyway.
   */
  const handleKeyboardRelease: ShortcutListener<'keyboard'> = ({ code }) => {
    endSustainRecording(holderToken('keyboard', code));
  };

  /** A MIDI device appearing or vanishing mid-hold owes us no note-off — release only ITS notes. */
  function handleMidiInputsChange() {
    for (const { holder } of sustainRecordings.entriesOfSource('midi')) endSustainRecording(holder);
  }

  const handleShortcut: ShortcutListener<'composer'> = ({ shortcut, event }) => {
    const wasPlaying = playbackActive;
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
    //ADR-0006 resync-on-mutation, at the note-edit funnel: every editing path that changes what
    //playback would sound lands here right after its mutation — click add/remove, popover span
    //edits, column add/remove, tempo changers, sustain-recording note-add and release. For the
    //two sustain-recording paths the future columns are unchanged, so the resync is a harmless
    //no-op recommit — cheap, and simpler than exempting them.
    resyncPlayback();
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
    //note-off, or the running-status alias for it (note-on at velocity 0). The note itself is
    //not re-resolved: the holder token carries which press this ends, so an instrument swapped
    //mid-hold still releases the note that was actually pressed. (The SLOT still comes from the
    //live preset, so a preset edited mid-hold could still orphan a hold — only reachable from
    //the keybinds page, which unmounts this surface.)
    if (MIDIProvider.isNoteRelease(eventType, velocity)) {
      MIDIProvider.getNotesOfMIDIevent(note).forEach((keyboardNote) => {
        endSustainRecording(midiHolderToken(note, keyboardNote.index));
      });
      return;
    }
    if (MIDIProvider.isDown(eventType) && velocity !== 0) {
      const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note);
      keyboardNotes.forEach((keyboardNote) => {
        //a MIDI preset slot addresses a BUTTON of the current instrument (persisted settings,
        //still Button-keyed by design); a preset can outlive a shorter instrument's note list,
        //so resolve the note object here and hand THAT on - never the raw slot number
        const pressed = currentInstrument.notes[keyboardNote.index];
        if (!pressed) return;
        if (startSustainRecording(midiHolderToken(note, keyboardNote.index), pressed.numberAt(layerPitch)))
          return;
        toggleNoteImmediate(pressed);
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
    //captured BEFORE the write below, because a Basepoint change is a real note edit and needs
    //both ends of the interval (ADR-0007). Undo has to see the song as it was, so the snapshot
    //goes in first too.
    const previousPitch = song.pitch;
    if (key === 'pitch' && data.value !== previousPitch) addToHistory();
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
    //ADR-0007: the song's Basepoint is part of every number its notes store, so moving it REWRITES
    //them — every track that follows the song (a track with its own override keeps its effective
    //Basepoint, so its notes must not move). The write above already installed the new value; this
    //is handed both ends explicitly.
    if (key === 'pitch') song.applyBasepointChange('song', previousPitch, data.value as Pitch);
    //ADR-0006 resync-on-mutation: bpm re-times every uncommitted boundary and pitch re-voices
    //every uncommitted note, so both retract and recommit the window. Reverb is a live node the
    //committed audio already flows through, and per-layer volume (see changeVolume) is a live
    //gain for the same reason — neither changes what should be committed, so neither resyncs.
    if (key === 'bpm' || key === 'pitch') resyncPlayback();
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
    //
    // ADR-0007: it is also where the two NOTE rewrites live — an instrument swap (button-preserving
    // through nominal correspondence) and a per-layer Basepoint override change (the interval). The
    // snapshot goes in first so undo restores the notes and the roster together.
    const previous = song.instruments[index];
    if (previous && (previous.name !== instrument.name || previous.pitch !== instrument.pitch)) {
      addToHistory();
    }
    song.setInstrument(index, instrument);
    //ADR-0006 resync-on-mutation: this is where mute and the per-layer pitch override land (the
    //instrument popup's onChange funnels here), and both change what committed audio should
    //contain, synchronously — playSound reads the roster entry just written. A NAME change
    //resyncs a second time from syncInstruments, once the replacement instrument exists.
    resyncPlayback();
    syncInstruments(song);
  }

  function syncInstruments(songToSync: ComposedSong = song) {
    return instrumentSynchronizer.sync(songToSync.instruments);
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
      // A stop during the 300 ms export pre-roll wins before playback has started. The initiating
      // call now observes the cancelled flag and returns, so this branch must also settle the
      // recorder it already connected instead of leaving it capturing indefinitely.
      if (AudioProvider.isRecording) void AudioProvider.stopRecording();
      return togglePlay(false);
    }
    // resume() must be requested directly from the export gesture. Waiting through the 300 ms
    // recorder lead-in first loses user activation in browsers that suspend contexts created at
    // app mount, leaving the transport clock frozen forever.
    isRecordingAudio = true;
    try {
      await AudioProvider.ensureRunning();
    } catch (error) {
      isRecordingAudio = false;
      console.error('Unable to start the audio context for composer export', error);
      return;
    }
    if (!mounted || !isRecordingAudio) return;
    AudioProvider.startRecording();
    await delay(300);
    if (!mounted || !isRecordingAudio) return;
    await togglePlay(true); //wait till song finishes
    //committed audio ENDS at the song's audio-true end (onFinished fires only once the last
    //column has fully elapsed), so all that is left to drain is the reverb/release tail
    await delay(1000);
    if (!mounted || !isRecordingAudio) return;
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
   * Sound one NOTE ID on a track: immediately when `at` is omitted (previews, live entry), or
   * committed at the ABSOLUTE AudioContext time `at` — the engine speaks audio-clock time end
   * to end, never relative delays (ADR-0006). Every caller already holds a number — song
   * notes store them, and the keyboard's note answers `numberAt(pitch)` — so nothing here
   * resolves a Button any more (ADR-0005 §4 / ADR-0007: the engine's public API is
   * number-keyed). A number the track's instrument cannot voice at its Basepoint is STRANDED
   * there and stays silent, which is why the lookup below is still a guard.
   */
  function playSound(
    layer: number,
    number: number,
    at?: number,
    durationMs?: number,
    skipMs?: number
  ) {
    const instrument = layers[layer];
    if (!instrument) return;
    if (song.instruments[layer].muted) return;
    const pitch = song.instruments[layer].pitch || song.pitch;
    if (instrument.getNoteByNumber(number, pitch) === null) return;
    if (durationMs !== undefined && instrument.supportsSustain) {
      //spanned note on a sustaining instrument: hold for its musical length, then release
      instrument.pressNote(number, pitch, { at, durationMs, skipMs });
    } else {
      //on sustaining instruments play() IS the tap (minLength + release inside the
      //Instrument) — previews, span-1 columns and non-sustaining one-shots all land here
      instrument.play(number, pitch, at);
    }
  }

  /**
   * Attack a note and LEAVE IT SOUNDING until releaseNote — the live half of sustain recording.
   * Same guards as playSound, but no durationMs and no `at`: only the no-durationMs press is
   * registered in the instrument's heldVoices, so it is the only one a release can ever reach —
   * and a live press is a held voice sounding NOW, never committed into the future, so there is
   * no scheduled start for its release to race.
   */
  function playHeldSound(layer: number, number: number) {
    const instrument = layers[layer];
    if (!instrument) return;
    if (song.instruments[layer].muted) return;
    const pitch = song.instruments[layer].pitch || song.pitch;
    if (instrument.getNoteByNumber(number, pitch) === null) return;
    instrument.pressNote(number, pitch);
  }

  /** Real length in ms of columns [from, to) at the current bpm, honoring each column's tempo changer (same math and rounding as the transport's grid — it sums exactly what this returns). */
  function columnsDurationMs(from: number, to: number): number {
    const msPerBeat = 60000 / settings.bpm.value;
    let ms = 0;
    for (let i = from; i < to; i++) {
      const changer = song.columns[i]?.getTempoChanger().changer ?? 1;
      ms += Song.roundTime(msPerBeat * changer);
    }
    return ms;
  }

  // ── playback transport (ADR-0006: one clock, two meanings of "ahead") ──────────────────────
  // All playback timing lives on the AudioContext clock. The transport advances the sounding
  // cursor on it and commits column audio ahead on it, and every cancel sweep below reads the
  // SAME clock, so "what is committed" and "what is retractable" can never disagree about now.
  const clock = { now: () => AudioProvider.getAudioContext().currentTime };
  const transport = new ComposerTransport(clock, {
    columnDurationMs: (i) => columnsDurationMs(i, i + 1),
    columnCount: () => song.columns.length,
    // Sound column `index`'s notes, committed at the absolute audio time the transport's grid
    // assigned it. Commits only happen while the transport runs, so "am I playing" is implicit
    // here; a commit is the SONG sounding, never a browse's preview, so spanned notes always
    // carry their real length.
    commitColumn: (index, atAudioTime) => {
      song.columns[index]?.notes.forEach((note) => {
        playSound(
          note.trackIndex,
          note.id,
          atAudioTime,
          note.span > 1 ? columnsDurationMs(index, index + note.span) : undefined
        );
      });
    },
    // The sounding cursor entered `index`: move the selection with it (ignoreAudio — this
    // column's audio was committed up to a horizon ago), then let held sustains re-quantize
    // against the column the playhead has now actually reached.
    onSounding: (index, atAudioTime) => {
      publishPlaybackColumnStart(atAudioTime);
      selectColumn(index, true, false, true);
      advanceSustainRecordings();
    },
    // The audio-true end of the song: the last column has fully elapsed at the ear. The stop
    // path runs with an empty committed window left to cancel, and resolves the play-run
    // promise togglePlay handed out.
    onFinished: () => {
      togglePlay(false);
    },
  });

  /**
   * Retract every committed-but-unstarted event, on every layer, from this instant on. The
   * transport never touches audio (its contract), so each path that abandons the committed
   * window — stop, a jump's re-anchor, resyncPlayback — must run this sweep itself, and FIRST:
   * resync()/anchor() rebuild the window immediately, and anything not cancelled before that
   * would sound twice.
   */
  function resyncAudioCancel() {
    const now = clock.now();
    layers.forEach((instrument) => instrument?.cancelScheduledAfter(now));
  }

  /** Convert one absolute AudioContext timestamp to the renderer's performance.now() domain. */
  function publishPlaybackColumnStart(atAudioTime: number, newAnchor = false) {
    playbackColumnStartMs = performance.now() + (atAudioTime - clock.now()) * 1000;
    if (newAnchor) playbackAnchorGeneration++;
  }

  /**
   * Anchor both audio and visuals on the selected model column. Audio owns the exact timestamp;
   * reading it back avoids even a small second clock.now() skew between transport and renderer.
   */
  function anchorPlayback(index: number, margin = TRANSPORT_START_MARGIN_S): boolean {
    transport.anchor(index, margin);
    const startAt = transport.currentColumnStartTime;
    if (!transport.isRunning || startAt === null) return false;
    publishPlaybackColumnStart(startAt, true);
    pressSpansCoveringStart(startAt);
    return true;
  }

  /**
   * ADR-0006 "resync on mutation": any change to what-should-sound cancels the committed
   * window and recommits it from the sounding column with fresh durations. This is what makes
   * the ~1 s horizon free — in-window audio is never stale, so the window is indistinguishable
   * from a 0 ms one at the ear. No-op while stopped: there is no committed window to rebuild.
   */
  function resyncPlayback(forceReanchor = false) {
    if (!transport.isRunning) return;
    resyncAudioCancel();

    // Some model mutations (delete/restore in particular) move or replace selected behind this
    // component's back. A resync preserves the transport cursor, so reconcile explicitly instead
    // of letting the next sounding callback snap the UI back to the abandoned position.
    if (forceReanchor || song.selected !== transport.soundingColumn) {
      if (!anchorPlayback(song.selected)) void togglePlay(false);
      return;
    }

    // Before the start margin elapses, cancellation retracts both the anchor column and any
    // sustain which began earlier but covers it. Transport.resync() restores its own anchor;
    // Composer owns those external covering spans and must restore them at the identical time.
    const restoreCoveringSpan = transport.isCurrentColumnPending;
    transport.resync();
    if (restoreCoveringSpan && transport.isRunning && transport.isCurrentColumnPending) {
      const startAt = transport.currentColumnStartTime;
      if (startAt !== null) pressSpansCoveringStart(startAt);
    }
  }

  function changePitch(value: Pitch) {
    // MidiParser has its own pitch funnel rather than handleSettingChange, so the Basepoint rewrite
    // has to be repeated here rather than inherited — the two entry points must leave the song in
    // the same state, or the same edit means different things depending on which panel is open.
    const previousPitch = song.pitch;
    if (value === previousPitch) return;
    addToHistory();
    settings.pitch = { ...settings.pitch, value };
    song.pitch = value;
    song.applyBasepointChange('song', previousPitch, value);
    // Retract the existing horizon here too, otherwise it keeps the old pitch until every
    // committed event drains.
    resyncPlayback();
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
    /** Span when the popover opened — the origin the still-held finger's drag is measured from. */
    spanAtOpen: number;
    /** Horizontal travel worth one column, frozen at open time (see handleNoteDrag). */
    dragStepPx: number;
  } | null = $state(null);
  // One press record PER BUTTON, not one for the whole keyboard: on touch two notes can be
  // held at once, and only the ADD half of the gesture runs at pointerdown - removal and
  // long-press are deferred to the release. A single slot let the second pointerdown
  // overwrite the first finger's record, so neither release recognised its own press and
  // tapping two selected notes together deselected NEITHER (one at a time worked, because
  // each down/up pair completed before the next down).
  // Keyed by Note Id, the same currency the three handlers already speak, so the id equality
  // the release used to test by hand is now the map lookup itself. Two fingers on the SAME
  // button still collapse to one record, which is the same single toggle they produced before.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- pointer-gesture bookkeeping, never read from the template
  const notePresses = new Map<
    number,
    { existedAtPress: boolean; coveringStart: number | null; longPressFired: boolean }
  >();

  /**
   * Drop every in-flight press. A record is only meaningful against the column and layer it
   * was taken in - its deferred removal targets `song.selected` and `layer` as they are at
   * RELEASE - so when either moves under a held finger the press is abandoned rather than
   * applied to whatever is now selected. Same dismissal points as durationPopover, and the
   * reason a stale record can never be consumed in a context it was not taken in.
   */
  function abandonNotePresses() {
    notePresses.clear();
  }

  // ── live sustain recording (playing + a sustaining track = the keyboard is an instrument) ──
  // Holding a key while the playhead walks records a DURATION: the note keeps sounding and its
  // span is re-quantized from how long the key has actually been down. Every input feeds the
  // same registry - pointer, PC keyboard, MIDI - because the note being held has nothing to do
  // with which device is holding it, and a release must find its note however it was started.
  type SustainRecording = {
    /** Track the key was pressed on: the selected layer can move under a held key. */
    trackIndex: number;
    startColumn: number;
    /**
     * The note object this hold owns. IDENTITY, not coordinates: undo, paste, a column
     * insert/remove or a song load can leave a DIFFERENT note answering the same
     * (column, track, id) address, and setNoteSpan would lengthen that one just as happily.
     */
    note: ColumnNote;
    /** Attack time - the hold clock the span is quantized against (see spanForHeldMs). */
    pressedAt: number;
    /** Whether this hold ever recorded more than its start column (drives autosave + the release). */
    grew: boolean;
  };
  const sustainRecordings = new HeldNoteRegistry<SustainRecording>();

  /**
   * Start recording a held note, or report that this press is an ordinary tap.
   *
   * Capability comes from the instrument config (`supportsSustain`), never from which game is
   * loaded. A button already covered by an earlier span obeys the occupancy rule, and a note
   * that already carries a duration is left alone - re-quantizing it from this press would
   * SHRINK an authored span back to what the finger has held so far.
   */
  function startSustainRecording(holder: string, id: number): boolean {
    if (!isPlaying) return false;
    if (!layers[layer]?.supportsSustain) return false;
    if (sustainRecordings.isHolding(holder)) return true; //auto-repeat / duplicate note-on
    if (song.getSpanCovering(song.selected, layer, id)) return false;
    const startColumn = song.selected;
    let note = song.selectedColumn.findNote(layer, id);
    if (note === null) {
      song.addNoteAt(startColumn, layer, id);
      handleAutoSave();
      note = song.columns[startColumn]?.findNote(layer, id) ?? null;
    }
    if (note === null) return false;
    //A note that already carries a duration records too: the hold can only ever LENGTHEN it
    //(see applySustainSpan), so re-playing an authored note over its own column is harmless,
    //while refusing here would drop the press back onto the editing path - which deletes the
    //note on release. Performing over your own long note must never erase it.
    const pressed = sustainRecordings.press(holder, id, {
      trackIndex: layer,
      startColumn,
      note,
      pressedAt: Date.now(),
      grew: false,
    });
    //null means this holder is already holding, which the guard above already returned for
    if (!pressed) return true;
    //only the first holder attacks: a second key on the same note joins the sounding voice
    if (pressed.isFirstHolderOfId) playHeldSound(layer, id);
    return true;
  }

  /**
   * Re-quantize one recording against the clock. Returns 'stale' when the note it owns is no
   * longer the note at its address, which is the signal to end the recording rather than write.
   */
  function applySustainSpan(
    id: number,
    recording: SustainRecording
  ): 'stale' | 'unchanged' | 'grown' {
    const current = song.columns[recording.startColumn]?.findNote(recording.trackIndex, id);
    if (current !== recording.note) return 'stale';
    //never past the playhead: a sustain cannot be recorded into the future
    const held = spanForHeldMs(
      Date.now() - recording.pressedAt,
      song.selected - recording.startColumn + 1,
      (offset) =>
        columnsDurationMs(recording.startColumn + offset, recording.startColumn + offset + 1)
    );
    //A hold only ever LENGTHENS. The quantized value is re-derived from scratch on every tick,
    //so without this floor anything that moves the playhead BACKWARDS under a held key -
    //a wheel-up, a timeline click, a canvas drag, a MIDI previous_column - would shrink the
    //playhead cap and rewrite the note shorter than what was already performed. It is also what
    //makes re-playing an already-spanned note safe.
    //...and never ask for more than the model would grant: setNoteSpan clamps to maxSpanAt but
    //publishes either way, so an unclamped request past a later same-id note would repaint the
    //canvas and invalidate the renderer's caches on every tick of the hold while changing nothing
    const applied = Math.min(
      Math.max(held, current.span),
      song.maxSpanAt(recording.startColumn, recording.trackIndex, id)
    );
    if (applied === current.span) return 'unchanged';
    song.setNoteSpan(recording.startColumn, recording.trackIndex, id, applied);
    if (current.span > 1) recording.grew = true;
    return 'grown';
  }

  /** The playhead moved: every still-held note re-quantizes against how long it has been down. */
  function advanceSustainRecordings() {
    for (const { holder, id, meta } of sustainRecordings.entries()) {
      if (applySustainSpan(id, meta) === 'stale') endSustainRecording(holder);
    }
  }

  /** End one hold: final quantization, then the voice stops if this was its last holder. */
  function endSustainRecording(holder: string) {
    const released = sustainRecordings.release(holder);
    if (!released) return;
    const { id, meta, isLastHolderOfId } = released;
    applySustainSpan(id, meta);
    if (isLastHolderOfId) layers[meta.trackIndex]?.releaseNote(id);
    //one save per recorded sustain - the per-tick growth deliberately does not count changes
    if (meta.grew) handleAutoSave();
  }

  function endAllSustainRecordings() {
    for (const { holder } of sustainRecordings.entries()) endSustainRecording(holder);
  }

  // Ends every hold when the ground under it moves. Loading or creating a song replaces `song`,
  // and an instrument edit, swap or removal replaces the Instrument a held voice belongs to —
  // all of those write `song`/`layer`/`layers` directly instead of going through changeLayer,
  // so hooking those call sites one by one would keep missing new ones. The note-identity check
  // in applySustainSpan already refuses the WRITE; this is what releases the voice.
  $effect(() => {
    void song;
    void layers[layer];
    return endAllSustainRecordings;
  });

  /**
   * The DISPLAYED track's effective Basepoint — the composer keyboard draws the selected
   * layer's instrument, so this is the Basepoint every press on it enters at and every note's
   * number is read at. Kept as one derived rather than re-spelled per handler: a keyboard
   * resolving at one Basepoint while the canvas resolves at another is the whole class of bug
   * ADR-0007 makes possible.
   */
  const layerPitch = $derived(song.instruments[layer]?.pitch || song.pitch);

  /** What pressing this key STORES and SOUNDS at the current Basepoint (ADR-0007 §4). */
  function numberOfNote(note: ObservableNote): number {
    return note.numberAt(layerPitch);
  }

  function handleClick(note: ObservableNote, pointerId: number) {
    //the clicked button's Note Number on the current layer's instrument - the one currency the
    //song edits below and the audio engine both speak (ADR-0005/ADR-0007)
    const id = numberOfNote(note);
    //while playing on a sustaining track the press is a PERFORMANCE, not an edit: it sounds
    //its own held attack, records its duration, and never deletes on release
    if (startSustainRecording(holderToken('pointer', pointerId), id)) return;
    playSound(layer, id);
    const covering = song.getSpanCovering(song.selected, layer, id);
    if (covering) {
      notePresses.set(id, {
        existedAtPress: false,
        coveringStart: covering.startColumn,
        longPressFired: false,
      });
      return;
    }
    const existing = song.selectedColumn.findNote(layer, id);
    if (existing === null) {
      song.addNoteAt(song.selected, layer, id);
      handleAutoSave();
    }
    notePresses.set(id, {
      existedAtPress: existing !== null,
      coveringStart: null,
      longPressFired: false,
    });
  }

  /** Physical-keyboard / MIDI note entry: no pointer gesture exists there, so toggling stays immediate (the pre-popover behavior), occupancy rule included. */
  function toggleNoteImmediate(note: ObservableNote) {
    const id = numberOfNote(note);
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

  function handleNoteRelease(note: ObservableNote, pointerId: number) {
    //a recording press left no press record behind, so this is its only release path
    endSustainRecording(holderToken('pointer', pointerId));
    const id = numberOfNote(note);
    const press = notePresses.get(id);
    //fires twice per pointer (pointerup then pointerleave): the delete below consumes the
    //record, so the second call misses and does nothing
    if (!press) return;
    notePresses.delete(id);
    if (press.longPressFired) return;
    if (press.coveringStart !== null) return; //occupancy: covered buttons don't toggle
    if (press.existedAtPress) {
      song.removeNoteAt(song.selected, layer, id);
      handleAutoSave();
    }
  }

  function handleNoteLongPress(note: ObservableNote, anchor: HTMLElement) {
    //while the song plays, holding a key MEANS recording a sustain - never "hand-edit this
    //note's duration". Gated on isPlaying rather than on "is this note recording" so it holds
    //at every tempo and for the holds that record nothing (covered buttons, already-spanned
    //notes); a popover opened mid-playback was useless anyway, since the next tick dismisses it.
    if (isPlaying) return;
    //durations are only authorable on instruments that can actually sustain — long-press
    //does nothing on the others (the press still completes as a normal tap)
    if (!layers[layer]?.supportsSustain) return;
    const id = numberOfNote(note);
    const press = notePresses.get(id);
    if (!press) return;
    press.longPressFired = true;
    const startColumn = press.coveringStart ?? song.selected;
    const existing = song.columns[startColumn]?.findNote(layer, id);
    if (!existing) return;
    addToHistory();
    durationPopover = {
      startColumn,
      trackIndex: layer,
      id,
      anchor,
      spanAtOpen: existing.span,
      //one column per HALF A KEY of travel: derived from the button that was pressed, so the
      //gesture scales with the keyboard (whose size is viewport-relative) instead of carrying a
      //device-specific pixel constant. Measured once — the anchor cannot resize mid-gesture, and
      //this would otherwise be a layout read on every pointermove. The floor keeps the step
      //usable if the rect comes back degenerate (0 on a hidden/unlaid-out button).
      dragStepPx: Math.max(20, anchor.getBoundingClientRect().width / 2),
    };
  }

  /**
   * Duration drag: the long press opens the popover, and the finger that opened it keeps
   * editing — horizontal travel from the press origin sets the span, right to lengthen, left
   * to shorten. ABSOLUTE (origin + delta), never accumulated, so a wander back to where it
   * started restores the span it started at, and the clamps are the slider's own.
   *
   * The drag ends with the pointer, but the popover outlives it (spec §2 dismissal rules), so
   * the slider is still there for what the finger could not reach.
   */
  function handleNoteDrag(note: ObservableNote, deltaX: number) {
    const popover = durationPopover;
    if (!popover || popover.id !== numberOfNote(note)) return;
    const span = clamp(
      popover.spanAtOpen + Math.round(deltaX / popover.dragStepPx),
      1,
      popoverMaxSpan
    );
    //setNoteSpan publishes unconditionally, and a drag is a stream of pointermoves that mostly
    //land on the span already applied - without this every one of them would repaint the canvas
    //and re-arm the autosave
    if (span === popoverSpan) return;
    setPopoverSpan(span);
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
   * Deliberately BUTTONS, not Note Numbers (ADR-0004/0005/0007): the composer keyboard's rows
   * really are the current instrument's Buttons, and its other per-button side table
   * (`computeButtonLayerStatuses`) keys by the SAME instrument's Buttons — every track's notes
   * resolved against the keyboard on screen at ITS Basepoint, dropping the numbers it cannot
   * voice. One coordinate space for both side tables, addressed through the Button the Shape
   * hands the snippet; the -1 drop keeps numbers this instrument lacks out of it, here and
   * there alike.
   */
  const heldButtons = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt wholesale by this derived, never mutated after return
    const held = new Set<number>();
    const keyboard = layers[layer];
    if (!keyboard) return held;
    //the keyboard IS the selected layer's instrument, so its Basepoint is that track's
    const pitch = song.instruments[layer]?.pitch || song.pitch;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<number>();
    for (let start = song.selected - 1; start >= 0; start--) {
      for (const spanNote of song.columns[start]?.notesOfTrack(layer) ?? []) {
        if (seen.has(spanNote.id)) continue;
        seen.add(spanNote.id);
        if (start + spanNote.span > song.selected) {
          const button = keyboard.getButtonOfNumber(spanNote.id, pitch);
          if (button !== -1) held.add(button);
        }
      }
    }
    for (const spanNote of song.selectedColumn?.notesOfTrack(layer) ?? []) {
      if (spanNote.span > 1) {
        const button = keyboard.getButtonOfNumber(spanNote.id, pitch);
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
    //a fresh song starts at the Basepoint (and tempo) the composer is set to, not at the
    //constructor's defaults: the settings panel is still showing those values, and since
    //ADR-0007 a song whose Basepoint disagreed with the panel would draw its notes on
    //different rows from the ones the keyboard entered them at
    newSong.bpm = settings.bpm.value;
    newSong.pitch = settings.pitch.value;
    changes = 0;
    if (!mounted) return;
    const added = (await addSong(newSong)) as ComposedSong;
    if (!mounted) return;
    //same reason as loadSong's guard: creating replaces the song under a running transport
    if (playbackActive || transport.isRunning) void togglePlay(false);
    song = added;
    layer = 0;
    // The roster above drives the controls, but notes sound through the separate loaded
    // Instrument array. Rebuild it when the song is replaced just as loadSong does; otherwise a
    // newly-created song displays its three default instruments while still playing the previous
    // song's layer instruments until another roster action happens to synchronize them.
    syncInstruments(added);
    // Selection and undo entries address the replaced song, while copiedColumns is an
    // editor-level clipboard: preserving it is what allows copy -> new song -> paste.
    selectedColumns = [];
    undoHistory = [];
    Analytics.songEvent({ type: 'create' });
  }

  async function loadSong(songToLoad: SerializedSong | ComposedSong) {
    //loading replaces the song under a running transport, and the committed window, the
    //sounding position and the play-run promise all belong to the song being replaced — playing
    //the incoming song from a stale index would be an accident, not a behavior. Stop first.
    if (playbackActive || transport.isRunning) void togglePlay(false);
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
      if (!mounted) return;
      // The confirmation/save awaits above leave the page interactive (and synced-tab messages
      // remain live). Playback may therefore have restarted since the entry guard. Stop once more
      // immediately before replacing every piece of song-dependent transport state.
      if (playbackActive || transport.isRunning) void togglePlay(false);
      settings.bpm = { ...settings.bpm, value: parsed.bpm };
      settings.pitch = { ...settings.pitch, value: parsed.pitch };
      settings.reverb = { ...settings.reverb, value: parsed.reverb };
      AudioProvider.setReverb(parsed.reverb);
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
      // copiedColumns is deliberately NOT reset: its NoteColumns were cloned by copyColumns(),
      // so they are safe to carry across songs and serve as the tools panel's clipboard.
      syncInstruments();
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_loading_song'));
    }
  }

  // In both functions the funnel (and its resync) runs BEFORE the selection move, not after.
  // While playing (reachable via the MIDI shortcuts) the move is a jump, and a jump's re-anchor
  // commits the target column's audio a start-margin into the future — still retractable, so a
  // resync arriving AFTER it would cancel that commit and, by resync's own contract, never
  // recommit the sounding column: the jumped-to column would land silent. Resync the mutation
  // first, then jump; the anchor is the last word on the committed window.
  function addColumns(amount = 1, position: number | 'end' = 'end') {
    song.addColumns(amount, position);
    handleAutoSave();
    if (amount === 1) selectColumn(song.selected + 1);
  }

  function removeColumns(amount: number, position: number) {
    if (song.columns.length < settings.beatMarks.value * 4) return;
    song.removeColumns(amount, position);
    handleAutoSave();
    if (song.columns.length <= song.selected) selectColumn(song.selected - 1);
  }

  /**
   * The promise the play-run in progress returned, with its resolver. CONTRACT: `await
   * togglePlay(true)` resolves when playback ENDS — startRecordingAudio depends on that ("wait
   * till song finishes"). Playback itself lives in the transport's worker-timer wakes, so
   * nothing here can await it; the contract is kept explicitly: PLAY creates the deferred, and
   * the stop path — reached by manual stop and by the transport's onFinished alike — resolves
   * it. Every other caller ignores the promise.
   */
  let playbackEnded: { promise: Promise<void>; resolve: () => void } | null = null;
  let playbackStartGeneration = 0;

  async function togglePlay(override?: boolean): Promise<void> {
    const newState = typeof override === 'boolean' ? override : !playbackActive;
    if (!newState) {
      playbackStartGeneration++;
      playbackStarting = false;
      isPlaying = false;
      //stopping playback releases voices still held from spanned notes. Live recordings end
      //FIRST, while their voices are still in heldVoices: each gets its normal release tail and
      //its final quantization, instead of the blanket fade below silencing a note whose span
      //would then keep growing for a key nobody can hear.
      endAllSustainRecordings();
      //then retract the committed window BEFORE fading what already sounds: with a ~1 s
      //horizon an uncancelled pause would leak a full second of runaway notes (ADR-0006 —
      //stop needed the cancellation registry anyway, which is why it exists).
      resyncAudioCancel();
      transport.stop();
      //finally fade what is already sounding — a release, not a cancellation: started audio
      //always rings out.
      layers.forEach((layer) => layer?.releaseAllNotes());
      playbackEnded?.resolve();
      playbackEnded = null;
      return;
    }
    //play while already playing (a duplicate 'play' broadcast from a synced tab): one
    //transport, one run — hand back the run in progress instead of committing its audio twice.
    if (playbackActive) return playbackEnded?.promise ?? Promise.resolve();

    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    playbackEnded = { promise, resolve };
    playbackStarting = true;
    const startGeneration = ++playbackStartGeneration;

    try {
      await AudioProvider.ensureRunning();
    } catch (error) {
      // A rejected resume is a failed play request, not a half-started run. Settle the deferred
      // so export and duplicate-play callers cannot hang, and leave the transport stopped.
      if (startGeneration === playbackStartGeneration) {
        playbackStarting = false;
        isPlaying = false;
        playbackEnded?.resolve();
        playbackEnded = null;
      }
      console.error('Unable to start the audio context for composer playback', error);
      return;
    }

    // stop/unmount/load can win while resume() is pending. Their generation bump and deferred
    // resolution make this completion stale; it must never anchor audio after that decision.
    if (!mounted || startGeneration !== playbackStartGeneration || !playbackStarting)
      return promise;

    //the audio-export offset lives in the anchor margin: the whole run — the resumed spans
    //below and every committed column — starts that much later, decided in exactly one place.
    const margin = TRANSPORT_START_MARGIN_S + (isRecordingAudio ? 0.5 : 0);
    //no selectColumn here: the anchor column is already selected, and its notes sound through
    //commitColumn like every other column's — the transport commits it at the anchor time.
    if (!anchorPlayback(song.selected, margin)) {
      //anchor refused (empty song / selection out of range — the transport's contract is to
      //stay STOPPED and fire nothing): nothing sounded and nothing will, so settle this run.
      return togglePlay(false);
    }
    playbackStarting = false;
    isPlaying = true;
    return promise;
  }

  /**
   * Notes whose span begins BEFORE the playback start column but still covers it
   * (play pressed mid-note): press each at `resumeAt` — the ABSOLUTE audio time the anchor
   * column is committed for, so resumed spans align with its notes by construction (the audio-
   * export offset rides in togglePlay's margin and needs no mirroring here). Each enters its
   * sample at the position the playhead would have reached, releasing where its span really
   * ends. Under the no-overlap invariant the nearest earlier same-(track, id) note is the only
   * possible coverer, so a backward scan marking seen pairs decides every candidate at its
   * first sighting. Only sustaining tracks resume — a one-shot sample's attack happened in the
   * past and cannot be meaningfully re-entered.
   */
  function pressSpansCoveringStart(resumeAt: number) {
    const startColumn = song.selected;
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
          resumeAt,
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

  function selectColumn(
    index: number,
    ignoreAudio = false,
    forceAnchor = false,
    fromTransport = false
  ) {
    if (index < 0 || index > song.columns.length - 1) return;
    const jumped = index !== song.selected;
    //moving to another column dismisses the duration popover (spec §2 dismissal rules) and
    //abandons any held press, whose deferred edit was aimed at the column being left - this
    //is also every playback tick, so a note held while the song plays stays as pressed
    if (jumped) {
      if (durationPopover !== null) durationPopover = null;
      abandonNotePresses();
    }
    song.selected = index;
    if (isToolsVisible && copiedColumns.length === 0) {
      // the clicked column only ever feeds the min/max below, which then replace the array
      // wholesale - so extend the RANGE rather than pushing into the array (see its declaration)
      const min = Math.min(index, ...selectedColumns);
      const max = Math.max(index, ...selectedColumns);
      selectedColumns = new Array(max - min + 1).fill(0).map((_, i) => min + i);
    }
    // Only the transport callback may advance selection without changing its private cursor.
    // Renderer gestures also pass ignoreAudio (they should not preview a tap), but while playing
    // they are USER seeks and must cancel/re-anchor. Conflating those two sources was what made
    // wheel/drag/timeline movements snap back on the next transport wake.
    if (fromTransport) return;
    if (transport.isRunning) {
      // Manual movement while playing. Selection is already written above; anchor generation
      // makes even a +1 seek a discontinuity instead of looking like an ordinary transport tick.
      // Silent renderer releases publish their rounded landing even when it is the same floor
      // last published during the drag. Re-anchor that case too: while the pointer was down the
      // renderer deliberately ignored playback scheduling, so this release is the event which
      // hands visual/audio ownership back to the transport.
      if (jumped || forceAnchor) {
        resyncAudioCancel();
        if (!anchorPlayback(index)) void togglePlay(false);
      }
      return;
    }
    // A stopped renderer drag/coast is silent; a normal browse previews immediately.
    if (ignoreAudio) return;
    //stopped: manual browsing previews the column as immediate taps — no committed time and no
    //durations (sounding spans at length is playback's business, the transport's). Stranded ids
    //stay silent inside playSound, so no -1 guard is needed here any more.
    song.selectedColumn.notes.forEach((note) => {
      playSound(note.trackIndex, note.id);
    });
  }

  function selectColumnFromDirection(direction: number) {
    selectColumn(song.selected + direction);
  }

  function changeLayer(newLayer: number) {
    layer = newLayer;
    durationPopover = null;
    //the keys now belong to another instrument: each held note keeps the span it recorded and
    //releases on the track that actually sounded it
    endAllSustainRecordings();
    abandonNotePresses();
  }

  function toggleTools() {
    const wasVisible = isToolsVisible;
    isToolsVisible = !wasVisible;
    selectedColumns = wasVisible ? [] : [song.selected];
    // Opening/closing the panel starts a fresh selection/undo session, but is not a clipboard
    // clear. The explicit Clear Selection action below exits copy/paste mode when requested.
    undoHistory = [];
  }

  function resetSelection() {
    copiedColumns = [];
    selectedColumns = [song.selected];
  }

  function addToHistory() {
    if (!isToolsVisible) return;
    //ONE clone for all three members, so they cannot come from two different moments
    const snapshot = song.clone();
    undoHistory = [
      ...undoHistory,
      { columns: snapshot.columns, pitch: snapshot.pitch, instruments: snapshot.instruments },
    ];
  }

  function undo() {
    const history = undoHistory.pop();
    if (!history) return;
    song.restoreColumns(history.columns);
    //restored TOGETHER with the columns (see ComposerHistoryEntry): the notes only mean what the
    //Basepoint and the roster they were written against say they mean
    song.pitch = history.pitch;
    song.instruments = history.instruments.map((instrument) => instrument.clone());
    //...and the settings panel is a second copy of the song's Basepoint, so it follows or the two
    //disagree until the next edit
    settings.pitch = { ...settings.pitch, value: history.pitch };
    updateSettings();
    syncInstruments();
    //undo is the one mutation path with NO changes++ (it restores toward the saved state), so
    //it cannot ride the funnel's resync in handleAutoSave — resync explicitly (ADR-0006)
    resyncPlayback(true);
  }

  // The bulk tools below count changes bare rather than through handleAutoSave, so each carries
  // its own resync — the ADR-0006 rule is the same either way: the resync runs right after the
  // mutation. (copyColumns mutates nothing that sounds; its resync is the uniform rule
  // recommitting an unchanged window, and keeping the sites identical beats special-casing one.)
  function copyColumns(targetLayer: number | 'all') {
    copiedColumns = song.copyColumns(selectedColumns, targetLayer);
    changes++;
    resyncPlayback();
    selectedColumns = [];
  }

  function pasteColumns(insert: boolean, targetLayer: number | 'all') {
    addToHistory();
    if (targetLayer === 'all') song.pasteColumns(copiedColumns, insert);
    else if (Number.isFinite(targetLayer)) song.pasteLayer(copiedColumns, insert, targetLayer);
    syncInstruments();
    changes++;
    resyncPlayback();
  }

  function eraseColumns(targetLayer: number | 'all') {
    addToHistory();
    song.eraseColumns(selectedColumns, targetLayer);
    changes++;
    resyncPlayback();
    selectedColumns = [song.selected];
  }

  function moveNotesBy(amount: number, position: number | 'all') {
    addToHistory();
    song.moveNotesBy(selectedColumns, amount, position);
    changes++;
    resyncPlayback();
  }

  function switchLayerPosition(direction: 1 | -1) {
    const toSwap = layer + direction;
    if (toSwap < 0 || toSwap > song.instruments.length - 1) return;
    // two halves of one move: swapLayer retags the notes (structure version), swapInstruments
    // reorders the roster (instruments signal)
    song.swapLayer(song.columns.length, 0, layer, toSwap);
    song.swapInstruments(layer, toSwap);
    changes++;
    resyncPlayback();
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
    resyncPlayback(true);
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
        // Downloads write the current format. The legacy old-format export was retired at
        // ADR-0007 (it cannot state an absolute Note Number) and its producer is kept,
        // commented, in ComposedSong/RecordedSong — old-format files still IMPORT fine.
        const converted = [parsed.serialize()];
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
<!-- `composer-grid-in-preview` keeps /theme's composer preview on the pre-existing centred layout:
     App.css's desktop block gives the real page a permanent sidebar column and a canvas that fills
     the window, neither of which fits a small box inside a scrolling page (same exclusion as
     `.canvas-wrapper-in-preview` and ComposerMenu's `composer-menu-sidebar`). -->
<div class={['composer-grid', 'appear-on-mount', inPreview && 'composer-grid-in-preview']}>
  <div class="column composer-left-control">
    <AppButton
      class="flex-centered"
      style="height:3rem;min-height:3rem;border-radius:0.3rem;background-color:var(--primary-darken-10)"
      onclick={() => {
        const wasPlaying = playbackActive;
        togglePlay();
        if (settings.syncTabs.value) {
          // QUIRK: opposite ternary from handleShortcut's toggle_play broadcast - see that function.
          broadcastChannel?.postMessage?.(wasPlaying ? 'stop' : 'play');
        }
      }}
      ariaLabel={playbackActive ? t('common:pause') : t('common:play')}
    >
      {#if playbackActive}
        {@render pauseIcon()}
      {:else}
        {@render playIcon()}
      {/if}
    </AppButton>
    <InstrumentControls
      instruments={song.instruments}
      selected={layer}
      usedLayers={usedLayersInSelectedColumn}
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
          {playbackColumnStartMs}
          {playbackAnchorGeneration}
          {isRecordingAudio}
          instruments={song.instruments}
          songPitch={song.pitch}
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
      handleNoteDrag,
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
      pitch: song.instruments[layer]?.pitch || song.pitch,
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
