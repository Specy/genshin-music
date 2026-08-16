<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { game } from '$game';
  import { SPEED_CHANGERS } from '$core/legacyConfig';
  import { t } from '$i18n/binding.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import PlayerMenu from './PlayerMenu.svelte';
  import PlayerKeyboard from './PlayerKeyboard.svelte';
  import PlayerSongControls from './PlayerSongControls.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { Instrument } from '$lib/audio/Instrument.svelte';
  import AudioRecorder from '$lib/audio/AudioRecorder';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { metronome } from '$lib/audio/Metronome';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { settingsService } from '$core/Services/SettingsService';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { createShortcutListener } from '$stores/KeybindsStore.svelte';
  import { delay } from '$core/utils/Utilities';
  import Analytics from '$core/Analytics';
  import { InstrumentData, Recording, type RecordedNote } from '$core/Songs/SongClasses';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import type { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import type { InstrumentName } from '$core/types';
  import { displayInstrumentNameFor } from '$core/Songs/displayInstrument';
  import type { Pitch } from '$core/legacyConfig';
  import type { PlayerSettingsDataType } from '$core/BaseSettings';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';

  let settings: PlayerSettingsDataType = $state(settingsService.getDefaultPlayerSettings());
  let instruments: Instrument[] = $state([new Instrument(game.instruments.list[0])]);
  /**
   * The instrument the on-screen keyboard is SHAPED like - its grid, its labels and its button
   * count - as opposed to `instruments`, which is what the keyboard SOUNDS like.
   *
   * The two are separate objects because they arrive at different times: `instruments` is rebuilt
   * behind an await on `instrument.load()` (a sample fetch), while this is needed synchronously the
   * moment a song is selected, and building one costs nothing but a note list. It used to be a
   * plain `const` pinned to the game's first instrument for the life of the page, which is why the
   * sound followed a song onto a 2x4 drum kit while the keyboard stayed a 3x5 piano.
   *
   * Reassigned, never mutated: PlayerKeyboard derives its Shape from this, and a $derived only
   * re-runs when the reference it read changes. It is never `.load()`ed, so replacing it leaks no
   * audio nodes - see displayInstrumentNameFor for which instrument it follows and why.
   */
  let songDisplayInstrument = $state(new Instrument(game.instruments.list[0]));
  let instrumentsData: InstrumentData[] = [new InstrumentData({ name: game.instruments.list[0] })];
  let isLoadingInstrument = $state(true);
  let isRecording = $state(false);
  let isRecordingAudio = $state(false);
  let isMetronomePlaying = $state(false);
  let hasSong = $state(false);
  let speedChanger = $state(
    SPEED_CHANGERS.find((e) => e.name === 'x1') as (typeof SPEED_CHANGERS)[number]
  );
  let recording = new Recording();
  let mounted = false;
  let cleanup: (() => void)[] = [];
  /**
   * The user's OWN pitch/reverb, captured the first time a song's values are swapped into
   * `settings`, and put back when the song stops. While it is set, `settings` holds the song's
   * values (so the menu shows what is actually playing) but `updateSettings` keeps persisting
   * these - a song must never overwrite what the user chose.
   */
  let settingsBeforeSong: { pitch: Pitch; reverb: boolean } | null = null;

  let { inPreview = false }: { inPreview?: boolean } = $props();

  onMount(() => {
    const loadedSettings = settingsService.getPlayerSettings();
    //for now reset this to prevent users from being confused
    // QUIRK: practice mode is force-reset on load so a returning user is not dropped into it unexpectedly. Old did this deliberately.
    loadedSettings.hidePracticeMode.value = false;
    settings = loadedSettings;
    mounted = true;
    const instrument = instruments[0];
    if (instrument) playerStore.setKeyboardLayout(instrument.notes);
    const disposeShortcuts = createShortcutListener('player', 'player', ({ shortcut }) => {
      const { name } = shortcut;
      if (name === 'toggle_record') toggleRecord();
    });
    cleanup.push(disposeShortcuts);
    //missed key-up guard: leaving the tab releases only LIVE held keys (their key-up is
    //delivered elsewhere) and closes their recording entries. Scheduled playback voices
    //are deliberately untouched — music keeps playing in a background tab.
    const releaseOnLeave = () => {
      instruments.forEach((ins) => ins.releaseHeldNotes());
      if (isRecording) recording.closeAllOpenNotes();
    };
    window.addEventListener('blur', releaseOnLeave);
    document.addEventListener('visibilitychange', releaseOnLeave);
    cleanup.push(() => {
      window.removeEventListener('blur', releaseOnLeave);
      document.removeEventListener('visibilitychange', releaseOnLeave);
    });

    // init() is intentionally not awaited: $effect below must be registered synchronously,
    // before any await, or Svelte throws effect_orphan. Fire-and-forget is safe here since
    // playerStore.state.song is always null this early - nothing can call play/practice/
    // approaching before the user interacts with the now-visible page.
    init(settings);

    $effect(() => {
      // Read (and discard) key/playId so this effect reruns on every play/practice/
      // approaching/resetSong/restartSong call, even when the song object is reference-equal.
      void playerStore.state.key;
      void playerStore.state.playId;
      // untrack: the body reads settings.pitch/reverb and, via applySetting, writes the same
      // settings path - without untrack that read-then-write self-triggers this effect and
      // throws effect_update_depth_exceeded once a song actually plays.
      untrack(() => {
        const { eventType, song } = playerStore.state;
        const isSongEvent =
          song !== null && ['play', 'practice', 'approaching'].includes(eventType);
        // AHEAD OF THE syncSongData GUARD, and deliberately. Everything below this point swaps in
        // the SONG's pitch, reverb and instruments, which is exactly what the setting turns off -
        // but the keyboard's SHAPE is not the song's data, it is a question about which instrument
        // the buttons on screen belong to, and that has an answer either way. With the setting off
        // the song's instruments are never loaded, so the answer is the user's own instrument;
        // behind the guard it was never asked at all and the keyboard kept the GAME DEFAULT's grid
        // while the user's instrument sounded - the reported symptom, in the case where the sound
        // does not change. displayInstrumentNameFor is handed the setting and makes that choice.
        //
        // Synchronous, and ahead of loadInstruments below: that call is queued behind
        // `instrumentsTasks` and awaits a sample fetch, but PlayerKeyboard publishes the keyboard
        // layout from this instrument on a 4ms debounce - so the shape has to be right now, not
        // whenever the audio finishes loading. A song's own track names need none of that.
        if (isSongEvent) {
          syncDisplayInstrument(song.instruments.map((instrument) => instrument.name));
        } else if (eventType === 'stop') {
          syncDisplayInstrument([]);
        }
        if (eventType === 'stop' && isMetronomePlaying) {
          // Free play/recording uses the user's own tempo after a song is dismissed. The scheduler
          // adopts this on its next wake without resetting the still-running free-play phase.
          metronome.bpm = settings.bpm.value;
        }
        if (!settings.syncSongData.value) return;
        if (isSongEvent) {
          //remember the user's own values before the first song overrides them (a second song
          //replacing the first must not snapshot the previous song's values)
          settingsBeforeSong ??= { pitch: settings.pitch.value, reverb: settings.reverb.value };
          applySetting({ data: { ...settings.pitch, value: song.pitch }, key: 'pitch' });
          applySetting({ data: { ...settings.reverb, value: song.reverb }, key: 'reverb' });
          loadInstruments(song.instruments);
        } else if (eventType === 'stop') {
          //song stopped: the branch above swapped the song's pitch/reverb/instruments in, so
          //put all three back to the user's own (queued, so a stop right after play cannot
          //race the song load still in flight)
          if (settingsBeforeSong) {
            const { pitch, reverb } = settingsBeforeSong;
            applySetting({ data: { ...settings.pitch, value: pitch }, key: 'pitch' });
            applySetting({ data: { ...settings.reverb, value: reverb }, key: 'reverb' });
            //cleared last: while it is set, updateSettings substitutes it into what it saves
            settingsBeforeSong = null;
          }
          //back to the user's own instrument, the same way the pitch and reverb above go back
          loadInstruments([
            new InstrumentData({
              name: settings.instrument.value,
              volume: settings.instrument.volume ?? 100,
            }),
          ]);
        }
      });
    });

    return () => {
      playerStore.resetSong();
      playerStore.resetKeyboardLayout();
      playerControlsStore.clearPages();
      playerControlsStore.resetScore();
      AudioProvider.clear();
      logger.hidePill();
      instruments.forEach((ins) => ins.dispose());
      cleanup.forEach((c) => c());
      mounted = false;
      metronome.stop();
    };
  });

  async function init(loadedSettings: PlayerSettingsDataType) {
    await AudioProvider.waitReverb();
    await loadInstrument(loadedSettings.instrument.value);
    AudioProvider.setReverb(loadedSettings.reverb.value);
  }

  function setHasSong(data: boolean) {
    hasSong = data;
  }

  function changeVolume(obj: SettingVolumeUpdate) {
    if (obj.key === 'instrument') {
      settings.instrument = { ...settings.instrument, volume: obj.value };
      instruments.forEach((ins) => ins.changeVolume(obj.value));
    }
    updateSettings();
  }

  /**
   * Point the display keyboard at the instrument the song's track 0 uses, or back at the user's own
   * when there is no song. Rebuilds only on a CHANGED name: the reassignment is what publishes to
   * PlayerKeyboard's $derived, so an unconditional one would rebuild the note list on every
   * play/practice/restart event for no change on screen.
   */
  function syncDisplayInstrument(songInstrumentNames: InstrumentName[]) {
    const name = displayInstrumentNameFor(
      songInstrumentNames,
      settings.instrument.value,
      settings.syncSongData.value
    );
    if (songDisplayInstrument.name === name) return;
    songDisplayInstrument = new Instrument(name);
    // THE SHAPE AND THE BUTTON COUNT, PUBLISHED BY THE SAME WRITE. PlayerKeyboard derives its grid
    // from this instrument's `shape` but takes how many buttons to put in it from
    // `playerStore.keyboard`, and that array was only written inside PlayerKeyboard's own 4ms
    // debounce - which waits on `await stopSong()`. Switching directly from one song to another
    // therefore drew the NEW instrument's grid holding the OLD instrument's buttons for that
    // window: 15 piano buttons flowed into a drum's 4 columns. Writing it here makes the pair
    // atomic; the debounce still runs and sets the same array, which is why this is safe to add
    // rather than a second source of truth.
    playerStore.setKeyboardLayout(songDisplayInstrument.notes);
  }

  let instrumentsTasks: Promise<unknown> = Promise.resolve();

  /**
   * Every mutation of `instruments` (initial/settings loads, song loads, the
   * stop-time restore) runs through this queue: the loaders await mid-flight while
   * diffing the shared array in place, so two running concurrently would interleave
   * and leak or double-connect AudioNodes. Requests run in order, so the last
   * requested state always wins.
   */
  function enqueueInstrumentsTask<T>(task: () => Promise<T>): Promise<T> {
    const run = instrumentsTasks.then(task, task);
    instrumentsTasks = run;
    return run;
  }

  function loadInstrument(name: InstrumentName) {
    return enqueueInstrumentsTask(async () => {
      const oldInstrument = instruments[0];
      AudioProvider.disconnect(oldInstrument.endNode);
      instruments[0].dispose();
      const instrument = new Instrument(name);
      const volume = settings.instrument.volume ?? 100;
      instrument.changeVolume(volume);
      isLoadingInstrument = true;
      const loaded = await instrument.load(AudioProvider.getAudioContext());
      if (!loaded) logger.error(t('logs:error_loading_instrument'));
      AudioProvider.connect(instrument.endNode, null);
      if (!mounted) return;
      if (playerStore.eventType === 'stop') playerStore.setKeyboardLayout(instrument.notes);
      instruments[0] = instrument;
      instrumentsData[0] = new InstrumentData({ name, volume });
      instruments = [...instruments];
      isLoadingInstrument = false;
      AudioProvider.setReverb(settings.reverb.value);
    });
  }

  function handleSpeedChanger(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    const changer = SPEED_CHANGERS.find((el) => el.name === e.currentTarget.value);
    if (!changer) return;
    speedChanger = changer;
    restartSong();
  }

  async function restartSong(override?: number) {
    if (!mounted) return;
    playerStore.restartSong(
      typeof override === 'number' ? override : playerControlsStore.position,
      playerControlsStore.end
    );
  }

  async function onSongFinished() {
    if (!settings.loopPractice.value) return;
    const finishedKey = playerStore.state.key;
    const finishedType = playerStore.eventType;
    if (!['play', 'practice', 'approaching'].includes(finishedType)) return;
    await delay(1000);
    // Selecting/stopping/restarting during the pause transfers ownership to another run. The old
    // completion must not wake up and restart that newer run from its current slider position.
    if (
      !mounted ||
      !settings.loopPractice.value ||
      playerStore.state.key !== finishedKey ||
      playerStore.eventType !== finishedType
    )
      return;
    restartSong();
  }

  function loadInstruments(toLoad: InstrumentData[]) {
    return enqueueInstrumentsTask(() => doLoadInstruments(toLoad));
  }

  async function doLoadInstruments(toLoad: InstrumentData[]) {
    //remove excess instruments
    const extraInstruments = instruments.splice(toLoad.length);
    extraInstruments.forEach((ins) => {
      AudioProvider.disconnect(ins.endNode);
      ins.dispose();
    });
    //the pill only when something actually loads — same-name syncs are silent
    const needsLoad = toLoad.some((ins, i) => instruments[i]?.name !== ins.name);
    if (needsLoad) logger.showPill(t('logs:loading_instruments'));
    const promises = toLoad.map(async (ins, i) => {
      if (instruments[i] === undefined) {
        //If it doesn't have a layer, create one
        const instrument = new Instrument(ins.name);
        instruments[i] = instrument;
        const loaded = await instrument.load(AudioProvider.getAudioContext());
        if (!loaded) logger.error(t('logs:error_loading_instrument'));
        if (!mounted) return instrument.dispose();
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      } else if (instruments[i].name === ins.name) {
        //if it has a layer and it's the same, just set the volume and reverb
        instruments[i].changeVolume(ins.volume);
        AudioProvider.setReverbOfNode(instruments[i].endNode, ins.reverbOverride);
        return instruments[i];
      } else {
        //if it has a layer and it's different, delete the layer and create a new one
        const old = instruments[i];
        AudioProvider.disconnect(old.endNode);
        old.dispose();
        const instrument = new Instrument(ins.name);
        instruments[i] = instrument;
        const loaded = await instrument.load(AudioProvider.getAudioContext());
        if (!loaded) logger.error(t('logs:error_loading_instrument'));
        if (!mounted) return instrument.dispose();
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      }
    });
    const newInstruments = (await Promise.all(promises)) as Instrument[];
    if (!mounted) return;
    // Free play resumed while this load was in flight (or this IS the stop-time
    // restore): the live keyboard shows instruments[0] again, so sync its layout.
    // The old code also wrote instruments[0].name into settings.instrument here,
    // silently making the song's instrument the user's saved one — removed; settings
    // stay whatever the user chose, and the stop-time restore reloads from them.
    if (instruments[0] && playerStore.eventType === 'stop') {
      playerStore.setKeyboardLayout(instruments[0].notes);
    }
    instruments = newInstruments;
    instrumentsData = toLoad;
    if (needsLoad) logger.hidePill();
  }

  /**
   * The surface→engine entry point, keyed by NOTE ID (ADR-0005 §4): PlayerKeyboard hands
   * over the id of the note the user pressed (or the song note's own id), never a button —
   * so an instrument that doesn't offer that id is simply silent instead of sounding
   * whatever its button of the same number happens to be.
   */
  function playSound(id: number, songNote?: RecordedNote) {
    if (!songNote) {
      //live playing on the main instrument; the recording stores the pressed Note Id, which
      //is also what the saved song carries. pressNote = one-shot on non-sustaining
      //instruments, held Voice on sustaining ones (released by releaseSound on key/pointer up)
      if (isRecording) handleRecording(id);
      instruments[0].pressNote(id, settings.pitch.value);
    } else {
      //song playback: the note belongs to exactly one track — play it on that track's
      //instrument (an id that track lacks is stranded, and silent). Notes with a duration
      //self-release after it (speed-scaled upstream) when the instrument sustains.
      if (isRecording) handleRecording(songNote.id);
      const ins = instruments[songNote.trackIndex];
      const insData = instrumentsData[songNote.trackIndex];
      if (!ins || insData?.muted) return;
      const pitch = insData?.pitch || settings.pitch.value;
      if (songNote.duration > 0 && ins.supportsSustain) {
        ins.pressNote(songNote.id, pitch, { durationMs: songNote.duration });
      } else {
        ins.play(songNote.id, pitch);
      }
    }
  }

  function releaseSound(id: number) {
    //both sides are id-keyed and ignore an id they are not holding: the recording closes the
    //open note of that id, the engine releases the live voice held on it
    if (isRecording) recording.releaseNote(id);
    instruments[0]?.releaseNote(id);
  }

  function releaseAllSounds() {
    instruments.forEach((ins) => ins.releaseAllNotes());
  }

  function updateSettings(override?: PlayerSettingsDataType) {
    const next = override !== undefined ? override : settings;
    //while a song's pitch/reverb are swapped in, `settings` holds the SONG's values - persist
    //the user's own instead, so an unrelated save (volume, loop, hide-notes) can't make the
    //song's values stick, and closing the tab mid-song can't either
    settingsService.updatePlayerSettings(
      settingsBeforeSong
        ? {
            ...next,
            pitch: { ...next.pitch, value: settingsBeforeSong.pitch },
            reverb: { ...next.reverb, value: settingsBeforeSong.reverb },
          }
        : next
    );
  }

  /** Applies a setting to the live state and its audio side effect, WITHOUT persisting it. */
  function applySetting(setting: SettingUpdate) {
    const { data } = setting;
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[setting.key] = { ...settings[setting.key], value: data.value };
    if (setting.key === 'instrument') {
      loadInstrument(data.value as InstrumentName);
    }
    if (setting.key === 'reverb') AudioProvider.setReverb(data.value as boolean);
    if (setting.key === 'bpm') metronome.bpm = data.value as number;
    if (setting.key === 'metronomeBeats') metronome.beats = data.value as number;
    if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number);
  }

  //TODO make method to sync settings to the song
  function handleSettingChange(setting: SettingUpdate) {
    applySetting(setting);
    //a deliberate change by the user outranks the song's value: it is what gets persisted and
    //what the stop-time restore puts back
    if (settingsBeforeSong) {
      if (setting.key === 'pitch') settingsBeforeSong.pitch = setting.data.value as Pitch;
      if (setting.key === 'reverb') settingsBeforeSong.reverb = setting.data.value as boolean;
    }
    updateSettings();
  }

  async function addSong(song: RecordedSong | ComposedSong) {
    try {
      const id = await songsStore.addSong(song);
      song.id = id;
      const type = song.type ?? (song.data.isComposedVersion ? 'composed' : 'recorded');
      logger.success(
        t('logs:song_added_to_folder', {
          song_name: song.name,
          folder_name: t(`menu:${type}`),
        }),
        4000
      );
    } catch (e) {
      console.error(e);
      return logger.error(t('logs:error_importing_song', { song_name: song.name }));
    }
  }

  async function removeSong(name: string, id: string) {
    const result = await asyncConfirm(t('confirm:delete_song', { song_name: name }));
    if (!mounted) return;
    if (result) {
      await songsStore.removeSong(id);
      Analytics.userSongs('delete', { page: 'player' });
    }
  }

  async function renameSong(newName: string, id: string) {
    await songsStore.renameSong(id, newName);
  }

  function handleRecording(id: number) {
    if (isRecording) {
      recording.addNote(id);
    }
  }

  /** Re-anchor the click grid on a transport boundary, leaving the toggle state unchanged. */
  function restartMetronome(bpm: number, firstBeatDelayMs?: number) {
    if (!isMetronomePlaying) return;
    metronome.bpm = bpm;
    metronome.beats = settings.metronomeBeats.value;
    metronome.changeVolume(settings.metronomeVolume.value);
    metronome.restart(firstBeatDelayMs);
  }

  function toggleMetronome() {
    const wasPlaying = isMetronomePlaying;
    isMetronomePlaying = !wasPlaying;
    if (wasPlaying) {
      metronome.stop();
    } else {
      const playingSong = playerStore.eventType === 'play' ? playerStore.song : null;
      restartMetronome(playingSong ? playingSong.bpm * speedChanger.value : settings.bpm.value);
    }
  }

  async function toggleRecord(override?: boolean | null) {
    if (typeof override !== 'boolean') override = null;
    const wasRecording = isRecording;
    const newState = override !== null ? override : !isRecording;
    if (!newState && recording.notes.length > 0) {
      //if there was a song recording — keys still held at stop count as released now
      recording.closeAllOpenNotes();
      const songName = await asyncPrompt(t('question:ask_song_name_cancellable'));
      if (!mounted) return;
      if (songName !== null) {
        const song = new RecordedSong(songName, recording.notes, [instruments[0].name]);
        song.bpm = settings.bpm.value;
        song.pitch = settings.pitch.value;
        song.reverb = settings.reverb.value;
        addSong(song);
        Analytics.userSongs('record', { page: 'player' });
      }
    } else {
      recording = new Recording();
      //durations are only captured on instruments that can actually sustain
      recording.captureDurations = instruments[0]?.supportsSustain ?? false;
    }
    isRecording = newState;
    // Only the actual off -> on edge is a new recording origin. In particular, stopping an empty
    // recording also takes the branch which replaces `recording` above and must not reset the beat.
    if (newState && !wasRecording) restartMetronome(settings.bpm.value);
  }

  function enableLoop(enabled: boolean) {
    settings.loopPractice.value = enabled;
    updateSettings();
  }

  function setHidePracticeNotes(hide: boolean) {
    settings.hidePracticeMode.value = hide;
    updateSettings();
  }

  async function toggleRecordAudio(override?: boolean | null) {
    if (!mounted) return;
    if (typeof override !== 'boolean') override = null;
    const newState = override !== null ? override : !isRecordingAudio;
    isRecordingAudio = newState;
    if (newState) {
      AudioProvider.startRecording();
    } else {
      const audioRecording = await AudioProvider.stopRecording();
      const fileName = await asyncPrompt(t('question:ask_song_name_cancellable'));
      if (!mounted || !audioRecording) return;
      try {
        if (fileName) await AudioRecorder.downloadBlob(audioRecording.data, fileName + '.wav');
      } catch (e) {
        console.error(e);
        logger.error(t('logs:error_downloading_audio'));
      }
    }
  }
</script>

<PageMetadata
  text={t('home:player_name')}
  description="Learn how to play songs, play them by hand and record them. Use the approaching circles mode or the guided tutorial to learn sections of a song at your own pace. Share your sheets or import existing ones."
/>
<PlayerMenu
  functions={{ addSong, removeSong, handleSettingChange, changeVolume, renameSong }}
  data={{ settings }}
  {inPreview}
/>
<div class="right-panel appear-on-mount">
  <div class="upper-right">
    {#if !hasSong}
      <AppButton toggled={isRecording} onclick={() => toggleRecord()} style="margin-top:0.8rem">
        {isRecording ? t('common:stop') : t('common:record')}
      </AppButton>
    {/if}
  </div>
  <div class="keyboard-wrapper">
    <PlayerKeyboard
      data={{
        isLoading: isLoadingInstrument,
        instrument: instruments[0],
        songDisplayInstrument,
        pitch: settings.pitch.value,
        keyboardSize: settings.keyboardSize.value,
        noteNameType: settings.noteNameType.value,
        hasSong,
        hasAnimation: settings.noteAnimation.value,
        approachRate: settings.approachSpeed.value,
        keyboardYPosition: settings.keyboardYPosition.value,
        speedChanger,
        hideNotesInPracticeMode: settings.hidePracticeMode.value,
        visualSheetSize: settings.numberOfVisualColumns.value * settings.numberOfVisualRows.value,
      }}
      functions={{
        playSound,
        releaseSound,
        releaseAllSounds,
        restartMetronome,
        setHasSong,
        onSongFinished,
      }}
    />
  </div>
</div>
<PlayerSongControls
  hidePracticeNotes={settings.hidePracticeMode.value}
  {isRecordingAudio}
  isVisualSheetVisible={settings.showVisualSheet.value}
  visualSheetColumns={settings.numberOfVisualColumns.value}
  loopEnabled={settings.loopPractice.value}
  {isMetronomePlaying}
  {hasSong}
  {speedChanger}
  setLoopEnabled={enableLoop}
  {setHidePracticeNotes}
  onToggleRecordAudio={toggleRecordAudio}
  onRestart={restartSong}
  onToggleMetronome={toggleMetronome}
  onRawSpeedChange={handleSpeedChanger}
/>
