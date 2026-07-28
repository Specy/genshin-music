<script lang="ts">
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ClickType, clamp, isFocusable } from '$core/utils/Utilities';
  import { DEFAULT_VSRG_KEYS_MAP } from '$core/legacyConfig';
  import { t } from '$i18n/binding.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import VsrgComposerMenu from '$cmp/pages/VsrgComposer/VsrgComposerMenu.svelte';
  import VsrgTop from '$cmp/pages/VsrgComposer/VsrgTop.svelte';
  import VsrgBottom from '$cmp/pages/VsrgComposer/VsrgBottom.svelte';
  import type { VsrgHitObjectType } from '$cmp/pages/VsrgComposer/VsrgBottom.svelte';
  import VsrgComposerCanvas from '$cmp/pages/VsrgComposer/VsrgComposerCanvas.svelte';
  import {
    VsrgSong,
    type VsrgHitObject,
    type VsrgTrack,
    type VsrgTrackModifier,
    type VsrgSongKeys,
  } from '$core/Songs/VsrgSong';
  import type { SnapPoint } from '$core/types';
  import type { SettingUpdate } from '$core/types/SettingsPropriety';
  import type { VsrgComposerSettingsDataType } from '$core/BaseSettings';
  import { AudioPlayer } from '$lib/audio/AudioPlayer';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import type { KeyboardEventData } from '$lib/providers/KeyboardProvider';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { createShortcutListener, type ShortcutListener } from '$stores/KeybindsStore.svelte';
  import { registerLeaveHandler } from '$stores/navigationGuard.svelte';
  import { settingsService } from '$core/Services/SettingsService';
  import { vsrgComposerStore } from '$stores/VsrgComposerStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { songService } from '$core/Services/SongService';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import { ComposedSong } from '$core/Songs/ComposedSong';
  import type { SerializedSong } from '$core/Songs/Song';
  import type { RecordedNote } from '$core/Songs/SongClasses';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';

  // This whole file IS the page (state, lifecycle, every method, the render tree) - unlike
  // Composer.svelte/Player.svelte, which split into a $cmp component + thin route wrapper
  // because both are also mounted a second time in preview mode from theme/+page.svelte. This
  // page has no such second caller, so there's no split to make.
  //
  // QUIRK (load-bearing - read before touching any vsrg mutation in this file): vsrg is a
  // VsrgSong class instance. Svelte 5's $state() runtime proxy never wraps it - only
  // Object.prototype/Array.prototype-rooted values are deep-proxied - so in-place mutations
  // (vsrg.tracks.push(...), vsrg.set({...}), etc.) are invisible to any $derived/template/
  // $effect reading vsrg UNLESS the top-level vsrg variable itself is reassigned. refreshVsrg()
  // below (vsrg = vsrg.clone()) is called after every mutation that needs to be observed.
  //
  // The pixi renderer (VsrgComposerCanvas.svelte/VsrgComposerRenderer.ts) does NOT need
  // refreshVsrg() to see a change: it holds the SAME live vsrg reference and reads it directly
  // from its own vsrgComposerStore-event-driven draw() calls, not through Svelte reactivity -
  // its content is always current regardless of whether the Svelte-facing vsrg was reassigned.
  let settings = $state(settingsService.getDefaultVsrgComposerSettings());
  let vsrg: VsrgSong = $state(new VsrgSong('Untitled'));
  // svelte-ignore state_referenced_locally
  vsrg.addTrack('DunDun');
  // svelte-ignore state_referenced_locally
  vsrg.set({
    bpm: settings.bpm.value,
    keys: settings.keys.value,
  });

  // svelte-ignore state_referenced_locally
  const audioPlayer = new AudioPlayer(settings.pitch.value);
  // svelte-ignore state_referenced_locally
  const audioPlaybackPlayer = new AudioPlayer(settings.pitch.value);
  let selectedTrack = $state(0);
  let snapPoint: SnapPoint = $state(1);
  let snapPoints: number[] = $state([0]);
  let snapPointDuration = $state(0);
  let selectedHitObject: VsrgHitObject | null = $state(null);
  let scaling = $state(60);
  let selectedType: VsrgHitObjectType = $state('tap');
  let isPlaying = $state(false);
  let lastCreatedHitObject: VsrgHitObject | null = $state(null);
  let audioSong: RecordedSong | null = $state(null);
  let renderableNotes: RecordedNote[] = $state([]);
  let tempoChanger = $state(1);
  let changes = $state(0);

  let lastTimestamp = 0;
  let mounted = false;
  const heldKeys: (boolean | undefined)[] = [];
  const pressedDownHitObjects: (VsrgHitObject | undefined)[] = [];
  const cleanup: (() => void)[] = [];

  function refreshVsrg() {
    vsrg = vsrg.clone();
  }

  function addTrack() {
    vsrg.addTrack();
    refreshVsrg();
    vsrgComposerStore.emitEvent('tracksChange');
  }

  onMount(() => {
    const id = 'vsrg-composer';
    const loadedSettings = settingsService.getVsrgComposerSettings();
    settings = loadedSettings;
    audioPlayer.setBasePitch(loadedSettings.pitch.value);
    audioPlaybackPlayer.setBasePitch(loadedSettings.pitch.value);
    mounted = true;
    calculateSnapPoints();
    syncInstruments();

    cleanup.push(registerLeaveHandler(prepareToLeave));
    const disposeShortcuts = createShortcutListener(
      'vsrg_composer',
      'vsrg_composer',
      handleShortcut
    );
    cleanup.push(disposeShortcuts);
    KeyboardProvider.listen(handleKeyboardDown, { id, type: 'keydown' });
    KeyboardProvider.listen(handleKeyboardUp, { id, type: 'keyup' });

    setPageVisited('vsrgComposer');

    return () => {
      mounted = false;
      KeyboardProvider.unregisterById('vsrg-composer');
      audioPlaybackPlayer.destroy();
      audioPlayer.destroy();
      cleanup.forEach((dispose) => dispose());
    };
  });

  const handleShortcut: ShortcutListener<'vsrg_composer'> = ({ shortcut, event }) => {
    const { name } = shortcut;
    if (event.code === 'Space') {
      if (event.repeat && name === 'toggle_play') return;
      if (isFocusable(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
    if (name === 'set_tap_hand') selectedType = 'tap';
    if (name === 'set_hold_hand') selectedType = 'hold';
    if (name === 'set_delete_hand') selectedType = 'delete';
    if (name === 'deselect') {
      selectedHitObject = null;
      lastCreatedHitObject = null;
    }
    if (name === 'toggle_play') togglePlay();
    if (name === 'next_breakpoint') onBreakpointSelect(1);
    if (name === 'previous_breakpoint') onBreakpointSelect(-1);
    if (name === 'next_track') selectTrack(Math.min(vsrg.tracks.length - 1, selectedTrack + 1));
    if (name === 'previous_track') selectTrack(Math.max(0, selectedTrack - 1));
    if (name === 'delete') {
      if (!selectedHitObject) return;
      vsrg.removeHitObjectInTrackAtTimestamp(
        selectedTrack,
        selectedHitObject.timestamp,
        selectedHitObject.index
      );
      selectedHitObject = null;
      lastCreatedHitObject = null;
    }
    if (name === 'move_right') {
      if (!selectedHitObject) return;
      if (settings.isVertical.value) {
        selectedHitObject.index = clamp(selectedHitObject.index + 1, 0, vsrg.keys);
      } else {
        selectedHitObject.timestamp = selectedHitObject.timestamp + snapPointDuration;
      }
      releaseHitObject();
    }
    if (name === 'move_down') {
      if (!selectedHitObject) return;
      if (settings.isVertical.value) {
        selectedHitObject.timestamp = selectedHitObject.timestamp - snapPointDuration;
      } else {
        selectedHitObject.index = clamp(selectedHitObject.index + 1, 0, vsrg.keys);
      }
      releaseHitObject();
    }
    if (name === 'move_left') {
      if (!selectedHitObject) return;
      if (settings.isVertical.value) {
        selectedHitObject.index = clamp(selectedHitObject.index - 1, 0, vsrg.keys);
      } else {
        selectedHitObject.timestamp = selectedHitObject.timestamp - snapPointDuration;
      }
      releaseHitObject();
    }
    if (name === 'move_up') {
      if (!selectedHitObject) return;
      if (settings.isVertical.value) {
        selectedHitObject.timestamp = selectedHitObject.timestamp + snapPointDuration;
      } else {
        selectedHitObject.index = clamp(selectedHitObject.index - 1, 0, vsrg.keys);
      }
      releaseHitObject();
    }
  };

  function updateSettings(override?: VsrgComposerSettingsDataType) {
    settingsService.updateVsrgComposerSettings(override !== undefined ? override : settings);
  }

  function syncInstruments() {
    audioPlayer.syncInstruments(vsrg.tracks.map((track) => track.instrument));
  }

  function syncAudioSongInstruments() {
    if (audioSong === null) return;
    audioPlaybackPlayer.syncInstruments(audioSong.instruments);
    audioPlaybackPlayer.basePitch = audioSong.pitch;
  }

  function handleKeyboardDown({ event, letter, shift }: KeyboardEventData) {
    if (shift) return;
    const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter);
    if (key >= 0) {
      if (event.repeat) return;
      startHitObjectTap(key);
    }
  }

  function handleKeyboardUp({ letter }: KeyboardEventData) {
    const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter);
    if (key >= 0) {
      endHitObjectTap(key);
    }
  }

  function startHitObjectTap(key: number) {
    heldKeys[key] = true;
    changes++;
    const timestamp = findClosestSnapPoint(lastTimestamp);
    if (selectedType === 'delete') {
      vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key);
      selectedHitObject = null;
      // Also needs refreshVsrg(): selectedHitObject is already null here after every
      // successful delete, so reassigning it to null is a no-op $state write that alone
      // wouldn't retrigger VsrgComposerCanvas.svelte's $effect - the canvas would keep
      // showing the deleted hit object until an unrelated redraw happened.
      refreshVsrg();
      return;
    }
    const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key);
    pressedDownHitObjects[key] = hitObject;
    selectedHitObject = hitObject;
  }

  function endHitObjectTap(key: number) {
    const hitObject = pressedDownHitObjects[key];
    if (heldKeys[key] && hitObject) {
      const snap = findClosestSnapPoint(hitObject.timestamp + hitObject.holdDuration);
      vsrg.setHeldHitObjectTail(selectedTrack, hitObject, snap - hitObject.timestamp);
    }
    heldKeys[key] = false;
    pressedDownHitObjects[key] = undefined;
  }

  function handleSettingChange({ key, data }: SettingUpdate) {
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[key] = { ...settings[key], value: data.value };
    // QUIRK: only keys/bpm/difficulty are special-cased here - pitch is ALSO marked
    // songSetting: true in VsrgComposerSettings.data, but changing it never propagates into
    // vsrg.pitch for an already-open song (only createNewSong seeds vsrg.pitch). Preserved,
    // not generalized to cover pitch too.
    if (key === 'keys') {
      vsrg.changeKeys(data.value as VsrgSongKeys);
    }
    if (key === 'bpm') {
      vsrg.set({ bpm: data.value as number });
      calculateSnapPoints();
    }
    if (key === 'difficulty') {
      vsrg.set({ difficulty: data.value as number });
    }
    updateSettings();
    if (key === 'keys') vsrgComposerStore.emitEvent('updateKeys');
    if (key === 'isVertical') vsrgComposerStore.emitEvent('updateOrientation');
    if (key === 'maxFps') vsrgComposerStore.emitEvent('maxFpsChange');
  }

  async function prepareToLeave(): Promise<boolean> {
    if (changes === 0) return true;
    if (settings.autosave.value) return (await saveSong()) !== null;
    const shouldSave = await asyncConfirm(
      t('question:unsaved_song_save', { song_name: vsrg.name }),
      true
    );
    if (shouldSave === null) return false;
    if (!shouldSave) return true;
    return (await saveSong()) !== null;
  }

  // QUIRK: dead code - changePage is never wired to any child prop (this page has no
  // "change app theme" link). Unreachable, preserved rather than removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- unreachable, see comment above
  async function changePage(page: string) {
    if (page === 'Home') return homeStore.open();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AppLink.svelte's identical resolve(href as any) note; page is a general runtime string, not a literal route id
    await goto(resolve(`/${page}` as any));
  }

  function onSnapPointChange(newSnapPoint: SnapPoint) {
    vsrg.set({ snapPoint: newSnapPoint });
    snapPoint = newSnapPoint;
    refreshVsrg();
    calculateSnapPoints();
    vsrgComposerStore.emitEvent('snapPointChange');
  }

  function selectHitObject(hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) {
    const newSelectedType: VsrgHitObjectType = hitObject.isHeld ? 'hold' : 'tap';
    if (selectedType === 'delete' || clickType === ClickType.Right) {
      vsrg.removeHitObjectInTrack(trackIndex, hitObject);
      selectedHitObject = null;
      refreshVsrg();
      return;
    }
    if (selectedType === 'hold' && clickType === ClickType.Left) {
      selectedHitObject = hitObject;
      lastCreatedHitObject = hitObject;
      selectedType = newSelectedType;
    }
    selectedHitObject = hitObject;
    selectedTrack = trackIndex;
    selectedType = newSelectedType;
  }

  function onSnapPointSelect(timestamp: number, key: number, type?: ClickType) {
    changes++;
    if (timestamp < 0) {
      console.warn('Timestamp is less than 0');
      return;
    }
    const existing = vsrg.getHitObjectsAt(timestamp, key);
    const firstNote = existing.find((h) => h !== null);
    if (type === ClickType.Unknown) console.warn('unknown click type');
    // if wants to add a tap note
    if (selectedType === 'tap' && type === ClickType.Left) {
      if (firstNote) {
        // No refreshVsrg() needed here - no vsrg content changed in this branch.
        // selectedHitObject = firstNote alone already retriggers the canvas $effect;
        // calling refreshVsrg() here would just orphan this reference for no gain.
        selectedHitObject = firstNote;
        return;
      }
      const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key);
      playHitObject(hitObject, selectedTrack);
      selectedHitObject = hitObject;
    }
    // if wants to add a hold note
    if (selectedType === 'hold' && type === ClickType.Left) {
      if (lastCreatedHitObject !== null) {
        vsrg.setHeldHitObjectTail(
          selectedTrack,
          lastCreatedHitObject,
          timestamp - lastCreatedHitObject.timestamp
        );
        lastCreatedHitObject = null;
        selectedHitObject = null;
      } else {
        if (firstNote) {
          // Same as the 'tap' branch's firstNote check above - no refreshVsrg() needed.
          selectedHitObject = firstNote;
          return;
        }
        const newLastCreatedHitObject = vsrg.createHeldHitObject(selectedTrack, timestamp, key);
        lastCreatedHitObject = newLastCreatedHitObject;
        selectedHitObject = newLastCreatedHitObject;
      }
    }
    // if wants to remove a note
    if (selectedType === 'delete' || type === ClickType.Right) {
      vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key);
      selectedHitObject = null;
    }
    refreshVsrg();
  }

  function selectTrack(newSelectedTrack: number) {
    selectedTrack = newSelectedTrack;
  }

  function setAudioSong(song: SerializedSong | null) {
    changes++;
    if (song === null) {
      vsrg.setAudioSong(null);
      audioSong = null;
      renderableNotes = [];
      return;
    }
    const parsed = songService.parseSong(song);
    if (parsed instanceof RecordedSong) {
      // vsrg.setAudioSong (below) reassigns vsrg.trackModifiers to a new array -
      // VsrgComposerMenu reads that field directly off vsrg, so refreshVsrg() below is
      // required for it to see the update (see this file's header QUIRK note).
      vsrg.setAudioSong(parsed);
      parsed.startPlayback(lastTimestamp);
      vsrg.setDurationFromNotes(parsed.notes);
      renderableNotes = vsrg.getRenderableNotes(parsed);
      audioSong = parsed;
      refreshVsrg();
      syncAudioSongInstruments();
      calculateSnapPoints();
    }
    if (parsed instanceof ComposedSong) {
      const recorded = parsed.toRecordedSong(0);
      vsrg.setDurationFromNotes(recorded.notes);
      recorded.startPlayback(lastTimestamp);
      vsrg.setAudioSong(parsed); //set as composed song because it's the original song
      renderableNotes = vsrg.getRenderableNotes(recorded);
      audioSong = recorded;
      refreshVsrg();
      syncAudioSongInstruments();
      calculateSnapPoints();
    }
  }

  async function askForSongUpdate() {
    return await asyncConfirm(t('question:unsaved_song_save', { song_name: vsrg.name }), true);
  }

  async function createNewSong() {
    if (vsrg.name !== 'Untitled' && changes > 0) {
      const promptResult = await askForSongUpdate();
      if (promptResult === null) return;
      if (promptResult) {
        await saveSong();
      }
    }
    const name = await asyncPrompt(t('question:enter_song_name'));
    if (name) {
      const newVsrg = new VsrgSong(name);
      newVsrg.set({
        bpm: settings.bpm.value,
        keys: settings.keys.value,
        pitch: settings.pitch.value,
        snapPoint,
      });
      newVsrg.addTrack();
      const id = await songsStore.addSong(newVsrg);
      newVsrg.set({ id });
      vsrg = newVsrg;
      renderableNotes = [];
      vsrgComposerStore.emitEvent('songLoad');
      calculateSnapPoints();
      syncInstruments();
    }
  }

  function calculateSnapPoints() {
    const amount = (vsrg.duration / (60000 / vsrg.bpm)) * snapPoint;
    const newSnapPointDuration = vsrg.duration / amount;
    snapPoints = new Array(Math.floor(amount)).fill(0).map((_, i) => i * newSnapPointDuration);
    snapPointDuration = newSnapPointDuration;
  }

  function dragHitObject(newTimestamp: number, key?: number) {
    if (selectedHitObject === null) return;
    // QUIRK (load-bearing): refreshVsrg() deep-clones every hit object, which detaches this
    // retained selectedHitObject reference from the freshly-cloned tracks[...].hitObjects
    // array. This runs once per pointermove for the whole drag gesture, so every call after
    // the first would mutate an orphaned, invisible object without the re-point below - the
    // final drop position would be silently lost on release. Re-pointing by index after
    // cloning is safe because VsrgTrack.clone()/VsrgSong.clone() both build arrays with
    // .map(), which preserves order.
    const index = vsrg.tracks[selectedTrack].hitObjects.indexOf(selectedHitObject);
    selectedHitObject.timestamp = newTimestamp;
    if (key !== undefined && key < settings.keys.value) selectedHitObject.index = key;
    refreshVsrg();
    if (index !== -1) selectedHitObject = vsrg.tracks[selectedTrack].hitObjects[index];
  }

  function findClosestSnapPoint(timestamp: number) {
    return snapPoints.reduce((prev, curr) => {
      if (Math.abs(curr - timestamp) < Math.abs(prev - timestamp)) return curr;
      return prev;
    });
  }

  function releaseHitObject() {
    if (selectedHitObject === null) return;
    selectedHitObject.timestamp = findClosestSnapPoint(selectedHitObject.timestamp);
    const tracks = vsrg.getHitObjectsBetween(
      selectedHitObject.timestamp,
      selectedHitObject.timestamp + selectedHitObject.holdDuration,
      selectedHitObject.index
    );
    tracks.forEach((track, i) =>
      track.forEach(
        (h) =>
          h !== selectedHitObject && vsrg.removeHitObjectInTrackAtTimestamp(i, h.timestamp, h.index)
      )
    );
    changes++;
    // Same refreshVsrg()-detaches-selectedHitObject mechanism as dragHitObject above.
    // Captured AFTER the conflict-removal loop above, not before: that loop can splice
    // sibling entries out of this same track's hitObjects array, shifting selectedHitObject's
    // own position - indexOf must run against the array's final pre-clone shape for the index
    // to still be valid once re-applied to the clone below.
    const index = vsrg.tracks[selectedTrack].hitObjects.indexOf(selectedHitObject);
    refreshVsrg();
    if (index !== -1) selectedHitObject = vsrg.tracks[selectedTrack].hitObjects[index];
  }

  function onTrackChange(track: VsrgTrack, index: number) {
    vsrg.tracks[index] = track;
    refreshVsrg();
    syncInstruments();
  }

  function onNoteSelect(note: number) {
    selectedHitObject?.toggleNote(note);
    audioPlayer.playNoteOfInstrument(selectedTrack, note);
    // selectedHitObject needs a genuinely new reference for Svelte to notice the mutation
    // .toggleNote() just made in place - .clone() is cheap (a handful of primitive fields).
    if (selectedHitObject) selectedHitObject = selectedHitObject.clone();
  }

  function togglePlay() {
    vsrg.startPlayback(lastTimestamp);
    if (lastTimestamp >= vsrg.duration) {
      isPlaying = false;
      return;
    }
    if (audioSong) audioSong.startPlayback(lastTimestamp);
    isPlaying = !isPlaying;
  }

  function playHitObject(hitObject: VsrgHitObject, trackIndex: number) {
    audioPlayer.playNotesOfInstrument(trackIndex, hitObject.notes);
  }

  function onTimestampChange(timestamp: number) {
    lastTimestamp = timestamp;
    if (isPlaying) {
      if (lastTimestamp >= vsrg.duration) {
        isPlaying = false;
        return;
      }
      heldKeys.forEach((key, i) => {
        if (key) {
          const hitObject = pressedDownHitObjects[i];
          if (!hitObject) return;
          const diff = timestamp - hitObject.timestamp;
          if (diff > snapPointDuration) {
            hitObject.holdDuration = diff;
            hitObject.isHeld = true;
          }
        }
      });
      if (audioSong) {
        const notes = audioSong.tickPlayback(timestamp);
        notes.forEach((n) => {
          const layers = n.layer.toArray();
          layers.forEach((l, i) => {
            if (l === 0 || vsrg.trackModifiers[i].muted) return;
            audioPlaybackPlayer.playNoteOfInstrument(i, n.index);
          });
        });
      }
      const tracks = vsrg.tickPlayback(timestamp);
      tracks.forEach((track, index) =>
        track.forEach((hitObject) => playHitObject(hitObject, index))
      );
    }
  }

  async function deleteTrack(index: number) {
    if (vsrg.tracks.length === 1) {
      logger.error(t('vsrg_composer:cannot_delete_last_track'));
      return;
    }
    const confirm = await asyncConfirm(t('vsrg_composer:delete_track_question'));
    if (!confirm || !mounted) return;
    changes++;
    vsrg.deleteTrack(index);
    selectedTrack = Math.max(0, index - 1);
    refreshVsrg();
    vsrgComposerStore.emitEvent('tracksChange');
  }

  async function onSongOpen(song: VsrgSong) {
    if (changes !== 0) {
      let confirm = settings.autosave.value && vsrg.name !== 'Untitled';
      if (!confirm) {
        const promptResult = await asyncConfirm(
          t('question:unsaved_song_save', { song_name: vsrg.name }),
          true
        );
        if (promptResult === null) return;
        confirm = promptResult;
      }
      if (confirm) {
        if ((await saveSong()) === null) return;
      }
    }
    settings.bpm = { ...settings.bpm, value: song.bpm };
    settings.keys = { ...settings.keys, value: song.keys };
    settings.pitch = { ...settings.pitch, value: song.pitch };
    updateSettings();
    changes++;
    vsrg = song;
    snapPoint = song.snapPoint;
    selectedTrack = 0;
    selectedHitObject = null;
    lastCreatedHitObject = null;
    vsrgComposerStore.emitEvent('songLoad');
    syncInstruments();
    const loadedAudioSong = await songsStore.getSongById(song.audioSongId);
    setAudioSong(loadedAudioSong);
    calculateSnapPoints();
  }

  function addTime() {
    vsrg.duration += 1000;
    calculateSnapPoints();
    changes++;
    refreshVsrg();
  }

  function removeTime() {
    vsrg.duration -= 1000;
    calculateSnapPoints();
    changes++;
    refreshVsrg();
  }

  function onScalingChange(newScaling: number) {
    scaling = newScaling;
    vsrgComposerStore.emitEvent('scaleChange');
  }

  async function saveSong() {
    const name = vsrg.id !== null ? vsrg.name : await asyncPrompt(t('question:enter_song_name'));
    if (name === null) return null;
    vsrg.set({ name });
    if (vsrg.id === null) {
      const id = await songsStore.addSong(vsrg);
      vsrg.set({ id });
    } else {
      songsStore.updateSong(vsrg);
    }
    changes = 0;
    refreshVsrg();
    return vsrg;
  }

  function onTrackModifierChange(
    trackModifier: VsrgTrackModifier,
    index: number,
    recalculate: boolean
  ) {
    vsrg.trackModifiers[index] = trackModifier;
    vsrg.trackModifiers = [...vsrg.trackModifiers];
    changes++;
    if (recalculate && audioSong) {
      renderableNotes = vsrg.getRenderableNotes(audioSong);
      refreshVsrg();
      return;
    }
    refreshVsrg();
  }

  function onTempoChangerChange(newTempoChanger: number) {
    tempoChanger = newTempoChanger;
  }

  function selectType(newSelectedType: VsrgHitObjectType) {
    selectedType = newSelectedType;
    lastCreatedHitObject = null;
  }

  function onBreakpointChange(remove: boolean) {
    const timestamp = findClosestSnapPoint(lastTimestamp);
    vsrg.setBreakpoint(timestamp, !remove);
    refreshVsrg();
  }

  function onBreakpointSelect(direction: -1 | 1) {
    const breakpoint = vsrg.getClosestBreakpoint(lastTimestamp, direction);
    if (isPlaying) {
      audioSong?.startPlayback(breakpoint);
      vsrg.startPlayback(breakpoint);
    }
    vsrgComposerStore.emitEvent('timestampChange', breakpoint);
  }
</script>

<AppBackground page="Composer">
  <PageMetadata
    text={`${t('home:vsrg_composer_name')} - ${vsrg.name ?? 'Unnamed'}`}
    description="Create new VSRG songs using existing background songs and create your own beatmap for it."
  />
  <VsrgComposerMenu
    data={{
      settings,
      hasChanges: changes > 0,
      audioSong,
      trackModifiers: vsrg.trackModifiers,
    }}
    functions={{
      setAudioSong,
      handleSettingChange,
      onSave: saveSong,
      onSongOpen,
      onCreateSong: createNewSong,
      onTrackModifierChange,
    }}
  />
  <div class="vsrg-page appear-on-mount">
    <VsrgTop
      {vsrg}
      {onBreakpointSelect}
      {onBreakpointChange}
      {selectedHitObject}
      isHorizontal={!settings.isVertical.value}
      {selectedTrack}
      {lastCreatedHitObject}
      onTrackAdd={addTrack}
      {onTrackChange}
      onTrackDelete={deleteTrack}
      onTrackSelect={selectTrack}
      {onNoteSelect}
    >
      <DecoratedCard class="decorated-vsrg-canvas" size="1.2rem">
        <VsrgComposerCanvas
          {vsrg}
          {renderableNotes}
          {onTimestampChange}
          {selectedHitObject}
          isHorizontal={!settings.isVertical.value}
          {tempoChanger}
          scrollSnap={settings.scrollSnap.value}
          maxFps={settings.maxFps.value}
          {scaling}
          {audioSong}
          {snapPoint}
          {snapPoints}
          {isPlaying}
          onRemoveTime={removeTime}
          onAddTime={addTime}
          onKeyDown={startHitObjectTap}
          onKeyUp={endHitObjectTap}
          {dragHitObject}
          {releaseHitObject}
          {selectHitObject}
          {onSnapPointSelect}
        />
      </DecoratedCard>
    </VsrgTop>
    <VsrgBottom
      {vsrg}
      {scaling}
      {tempoChanger}
      {onTempoChangerChange}
      {onScalingChange}
      {isPlaying}
      {togglePlay}
      selectedSnapPoint={snapPoint}
      {onSnapPointChange}
      selectedHitObjectType={selectedType}
      onHitObjectTypeChange={selectType}
    />
  </div>
</AppBackground>
