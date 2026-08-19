<script lang="ts">
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ClickType, clamp, isFocusable } from '$core/utils/Utilities';
  import { buttonToNumber, effectiveTrackPitch } from '$core/Songs/noteIds';
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
    type VsrgTrackModifierPatch,
    type VsrgSongKeys,
  } from '$core/Songs/VsrgSong.svelte';
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
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import type { SerializedSong } from '$core/Songs/Song.svelte';
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
  // Object.prototype/Array.prototype-rooted values are deep-proxied - so a mutation is observed
  // only if the field it writes is itself a signal on the class.
  //
  // Phases 1 and 2 of the 2026-08-06 reactive-model plan put signals behind the song state this
  // page edits, and the instance is STABLE: this page never reassigns `vsrg` except when it
  // genuinely swaps songs (createNewSong, onSongOpen). Which write publishes what is not uniform,
  // and that is what a mutation here has to be written against:
  //  - name/bpm/pitch/id/folderId (phase 1) and keys/duration/difficulty/snapPoint/audioSongId
  //    are `$state` scalars with public setters, so `vsrg.set({bpm})` and `vsrg.duration += 1000`
  //    publish by themselves.
  //  - breakpoints/trackModifiers are `$state.raw`: assigning the field publishes, editing an
  //    element in place publishes NOTHING. Go through vsrg.setBreakpoint/setTrackModifier.
  //  - the track and hit-object graph is behind a private #tracks with a `tracks` getter that
  //    reads one structure signal. Every edit to it - including writing a field on a VsrgHitObject
  //    this file is holding - has to go through a VsrgSong method, or the canvas and the track
  //    list keep painting the previous state with nothing failing anywhere.
  //
  // What replaced refreshVsrg() (`vsrg = vsrg.clone()`, formerly called after every mutation):
  // the model's own mutators. The clone also re-pointed this file's retained hit-object
  // references across each rebuild, and nulled the ones whose object had been deleted; stable
  // identity makes the first job unnecessary, and forgetRemovedHitObjects() below still does the
  // second.
  //
  // The pixi renderer (VsrgComposerCanvas.svelte/VsrgComposerRenderer.ts) is fed the same way the
  // templates are: its canvas component reads the song's fields inside its own $effect and hands
  // the renderer a snapshot. It used to also be poked through vsrgComposerStore events, which the
  // React original emitted from `setState(..., callback)` (i.e. after the new props had landed)
  // but this port emitted synchronously, one flush too early - so those recalculations ran on
  // stale props. The store now carries only the seek command; see VsrgComposerRenderer.update().
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
  /**
   * `$state.raw`, for the same reason as VsrgSong's `breakpoints`/`trackModifiers` and
   * Composer.svelte's `selectedColumns`: this array reaches the pixi renderer, which walks it in
   * full on every scrollable-track draw and indexes it per wheel/snap event, and a deep `$state`
   * proxy turns each of those element reads into a trap plus a dependency registration. Raw keeps
   * the whole-array signal - which is all any consumer here uses - and drops the per-index sources.
   *
   * THE RULE THAT COMES WITH IT: a writer ASSIGNS a new array - calculateSnapPoints() below, which
   * rebuilds the grid from bpm and snapPoint, does. An in-place push/splice publishes nothing.
   */
  let snapPoints: number[] = $state.raw([0]);
  let snapPointDuration = $state(0);
  let selectedHitObject: VsrgHitObject | null = $state(null);
  let scaling = $state(60);
  let selectedType: VsrgHitObjectType = $state('tap');
  let isPlaying = $state(false);
  let lastCreatedHitObject: VsrgHitObject | null = $state(null);
  let audioSong: RecordedSong | null = $state(null);
  /**
   * `$state.raw`, same rule as `snapPoints` above: VsrgComposerRenderer.drawTimeline walks this on
   * every timeline draw. Same rule too - a writer assigns a whole new array, which is what the
   * writes here do anyway (`vsrg.getRenderableNotes()` builds one; the reset paths assign `[]`), so
   * nothing wanted the per-index sources.
   */
  let renderableNotes: RecordedNote[] = $state.raw([]);
  let tempoChanger = $state(1);
  let changes = $state(0);

  let lastTimestamp = 0;
  let mounted = false;
  const heldKeys: (boolean | undefined)[] = [];
  const pressedDownHitObjects: (VsrgHitObject | undefined)[] = [];
  const cleanup: (() => void)[] = [];

  /**
   * Drop every retained hit-object reference whose object is no longer in the song.
   *
   * This is the half of refreshVsrg() that deleting the clone did NOT make unnecessary. The clone
   * did two things: it re-pointed each retained reference at the freshly copied object (needed
   * only because cloning detached them - stable identity removes that job entirely), and it
   * NULLED any reference it could not find, i.e. one whose hit object had been deleted. Deletion
   * has nothing to do with cloning, so that job survives.
   *
   * Without it, arming a hold note and then right-clicking that same object away leaves
   * lastCreatedHitObject pointing at a detached-but-valid object: the track/note panel stays
   * disabled (.vsrg-top-right-disabled) and the next hold click sets a tail on an object that is
   * not in any track. Worse for selectedHitObject after deleteTrack - the `delete` shortcut would
   * then remove whatever note in the RE-CLAMPED track happens to share its timestamp and index.
   *
   * Called from the paths that REMOVE hit objects, rather than after every edit as refreshVsrg()
   * was: it is the same whole-song scan, just run far less often.
   */
  function forgetRemovedHitObjects() {
    if (selectedHitObject !== null && !vsrg.containsHitObject(selectedHitObject)) {
      selectedHitObject = null;
    }
    if (lastCreatedHitObject !== null && !vsrg.containsHitObject(lastCreatedHitObject)) {
      lastCreatedHitObject = null;
    }
    pressedDownHitObjects.forEach((hitObject, key) => {
      if (hitObject !== undefined && !vsrg.containsHitObject(hitObject)) {
        pressedDownHitObjects[key] = undefined;
      }
    });
  }

  /**
   * Forget everything that points into the song being replaced. Nothing prunes these otherwise -
   * refreshVsrg() used to, on the next edit - and a key held across a song load left a hit object
   * from the PREVIOUS song in pressedDownHitObjects, which endHitObjectTap then handed to
   * vsrg.setHeldHitObjectTail() against the new song: that mutates the foreign object AND deletes
   * every real hit object between its timestamp bounds.
   */
  function forgetHitObjectsOfPreviousSong() {
    selectedHitObject = null;
    lastCreatedHitObject = null;
    pressedDownHitObjects.length = 0;
    heldKeys.length = 0;
  }

  function addTrack() {
    vsrg.addTrack();
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
      forgetRemovedHitObjects();
    }
    // The four move_* branches below write through vsrg.moveHitObject rather than onto the hit
    // object directly: the object is the song's, and a bare `selectedHitObject.index = ...` is
    // invisible to the canvas and the note keyboard. Which axis each arrow moves depends on the
    // orientation - preserved exactly, including that `keys` (not keys - 1) is the clamp's upper
    // bound, which lets a note sit one lane past the last one.
    if (name === 'move_right') {
      moveSelectedHitObject(settings.isVertical.value ? 1 : 0, settings.isVertical.value ? 0 : 1);
    }
    if (name === 'move_down') {
      moveSelectedHitObject(settings.isVertical.value ? 0 : 1, settings.isVertical.value ? -1 : 0);
    }
    if (name === 'move_left') {
      moveSelectedHitObject(settings.isVertical.value ? -1 : 0, settings.isVertical.value ? 0 : -1);
    }
    if (name === 'move_up') {
      moveSelectedHitObject(settings.isVertical.value ? 0 : -1, settings.isVertical.value ? 1 : 0);
    }
  };

  /** One snap point / one lane at a time, then the same snap-and-clear pass a mouse drag ends in. */
  function moveSelectedHitObject(lanes: number, steps: number) {
    if (selectedHitObject === null) return;
    //the lane is clamped only when the move is a lane move, exactly as the four branches did: a
    //pure time move must not re-clamp an index it is not touching
    const index =
      lanes === 0 ? selectedHitObject.index : clamp(selectedHitObject.index + lanes, 0, vsrg.keys);
    vsrg.moveHitObject(
      selectedHitObject,
      selectedHitObject.timestamp + steps * snapPointDuration,
      index
    );
    releaseHitObject();
  }

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
      forgetRemovedHitObjects();
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
      //the tail removes every hit object it now covers, in this track and in the others
      forgetRemovedHitObjects();
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
    // All three branches below are now a bare write to a `$state` scalar, which is the whole
    // update: the canvas's $effect reads vsrg.keys and vsrg.bpm itself, and
    // VsrgComposerRenderer.needsSizes() diffs those captured VALUES, so both recalculate. Each of
    // the three used to be followed by refreshVsrg() - `keys` and `difficulty` because they wrote
    // plain fields nothing could see, `bpm` (already a signal since phase 1) only because the
    // canvas read the `vsrg` prop rather than `.bpm` and the renderer's diff compared bpm to
    // itself through one shared instance.
    //
    // calculateSnapPoints() is NOT reactivity plumbing and stays: `snapPoints` is this page's own
    // derived grid, and bpm is one of its two inputs.
    //
    // `difficulty` has no reader in the composer at all (only VsrgSong.getAccuracyBounds, which
    // the PLAYER calls against its own copy) - it is a signal for consistency with the other song
    // scalars, not because anything here observes it.
    //
    // These used to lean on vsrgComposerStore events instead, which pushed the renderer to
    // recalculate from props it had not received yet. isVertical/maxFps need nothing here: they
    // are plain props the canvas already receives.
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
    //stored on the song so it survives a save/reload, and mirrored into this page's own
    //`snapPoint` $state, which is what VsrgBottom and the canvas actually read
    vsrg.set({ snapPoint: newSnapPoint });
    snapPoint = newSnapPoint;
    calculateSnapPoints();
  }

  function selectHitObject(hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) {
    const newSelectedType: VsrgHitObjectType = hitObject.isHeld ? 'hold' : 'tap';
    if (selectedType === 'delete' || clickType === ClickType.Right) {
      vsrg.removeHitObjectInTrack(trackIndex, hitObject);
      selectedHitObject = null;
      forgetRemovedHitObjects();
      return;
    }
    // Selecting is not creating. There used to be a `selectedType === 'hold'` branch here that
    // also armed lastCreatedHitObject with the clicked object - which disables the whole
    // track/note panel (.vsrg-top-right-disabled, the "place the tail first" state). It could
    // never be disarmed: the same branch set selectedType to the CLICKED object's type, so if
    // that was a tap, onSnapPointSelect took its tap path from then on and nothing ever
    // consumed the armed object. Clicking a hit object with the hold tool active therefore
    // disabled the panel until the deselect shortcut was pressed. Every other assignment in
    // that branch was an exact duplicate of the three below it.
    selectedHitObject = hitObject;
    selectedTrack = trackIndex;
    selectedType = newSelectedType;
  }

  /**
   * Clicking the empty background of a snap point that already holds a hit object selects that
   * object - and must sync the same three pieces of state clicking the object itself does, or
   * the note keyboard maps note ids through a different track's instrument than the one the
   * selection lives in, and the tap/hold toggle disagrees with what is selected. This path used
   * to set only `selectedHitObject` (an original bug, faithfully ported from React).
   */
  function selectExistingHitObject(hitObject: VsrgHitObject, trackIndex: number) {
    selectedHitObject = hitObject;
    selectedTrack = trackIndex;
    selectedType = hitObject.isHeld ? 'hold' : 'tap';
  }

  function onSnapPointSelect(timestamp: number, key: number, type?: ClickType) {
    changes++;
    if (timestamp < 0) {
      console.warn('Timestamp is less than 0');
      return;
    }
    //getHitObjectsAt returns one slot per track, so the index IS the owning track
    const existing = vsrg.getHitObjectsAt(timestamp, key);
    const firstNoteTrack = existing.findIndex((h) => h !== null);
    const firstNote = firstNoteTrack === -1 ? null : existing[firstNoteTrack];
    if (type === ClickType.Unknown) console.warn('unknown click type');
    // if wants to add a tap note
    if (selectedType === 'tap' && type === ClickType.Left) {
      if (firstNote) {
        //nothing in the song changed in this branch - it only re-points the selection
        selectExistingHitObject(firstNote, firstNoteTrack);
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
        //the tail swallows every hit object it now covers, in this track and in the others
        forgetRemovedHitObjects();
      } else {
        if (firstNote) {
          // Same as the 'tap' branch's firstNote check above - nothing in the song changed.
          selectExistingHitObject(firstNote, firstNoteTrack);
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
      forgetRemovedHitObjects();
    }
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
      // setAudioSong assigns audioSongId and a whole new trackModifiers array; both are signals,
      // so VsrgComposerMenu's modifier list updates off the assignment alone.
      vsrg.setAudioSong(parsed);
      parsed.startPlayback(lastTimestamp);
      vsrg.setDurationFromNotes(parsed.notes);
      renderableNotes = vsrg.getRenderableNotes(parsed);
      audioSong = parsed;
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
      //the references below point into the song being replaced
      forgetHitObjectsOfPreviousSong();
      renderableNotes = [];
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
    //a lane outside the song's key range is ignored, not clamped - the drag just keeps the lane
    //the object was already on
    const index = key !== undefined && key < settings.keys.value ? key : selectedHitObject.index;
    vsrg.moveHitObject(selectedHitObject, newTimestamp, index);
  }

  function findClosestSnapPoint(timestamp: number) {
    return snapPoints.reduce((prev, curr) => {
      if (Math.abs(curr - timestamp) < Math.abs(prev - timestamp)) return curr;
      return prev;
    });
  }

  function releaseHitObject() {
    if (selectedHitObject === null) return;
    vsrg.moveHitObject(
      selectedHitObject,
      findClosestSnapPoint(selectedHitObject.timestamp),
      selectedHitObject.index
    );
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
    //the snap can land on top of other hit objects, which the pass above then deletes
    forgetRemovedHitObjects();
  }

  function onTrackChange(track: VsrgTrack, index: number) {
    //setTrack, not `vsrg.tracks[index] = track`: the track array is private behind a getter that
    //reads the structure signal, and an element write would publish nothing. VsrgTrackSettings
    //has already mutated this exact object in place, so `track` is usually the object already at
    //`index` - setTrack bumps regardless, which is what rebuilds the canvas's per-colour textures.
    vsrg.setTrack(index, track);
    syncInstruments();
  }

  function onNoteSelect(button: number) {
    //the picker passes button positions; hit objects store the Note NUMBER that button enters at
    //the track's effective Basepoint (ADR-0007). Buttons past a short instrument's range were
    //silent pseudo-notes pre-v2 — no number, not stored.
    const track = vsrg.tracks[selectedTrack];
    const id = buttonToNumber(
      track?.instrument.name ?? '',
      effectiveTrackPitch(track?.instrument, vsrg.pitch),
      button
    );
    if (id === null) return;
    //through the song: hitObject.toggleNote() alone rewrites a plain array on a plain object, so
    //neither the canvas nor the mini keyboard's own highlight would see it. This used to reassign
    //selectedHitObject to a .clone() of itself to force reactivity instead, which pointed it at an
    //object that is not in the song: the canvas' identity check stopped matching (the selection
    //ring vanished) and every further toggle mutated the detached copy.
    if (selectedHitObject !== null) vsrg.toggleNoteInHitObject(selectedHitObject, id);
    audioPlayer.playNoteOfInstrument(selectedTrack, id);
  }

  function togglePlay() {
    vsrg.startPlayback(lastTimestamp);
    if (lastTimestamp >= vsrg.duration) {
      isPlaying = false;
      return;
    }
    if (audioSong) audioSong.startPlayback(lastTimestamp);
    isPlaying = !isPlaying;
    //stopping playback releases voices still held from hold notes
    if (!isPlaying) {
      audioPlayer?.releaseAllNotes();
      audioPlaybackPlayer?.releaseAllNotes();
    }
  }

  function playHitObject(hitObject: VsrgHitObject, trackIndex: number) {
    hitObject.notes.forEach((n) => {
      //hold notes sustain for their hold length when the track's instrument supports it
      audioPlayer.pressNoteOfInstrument(
        trackIndex,
        n,
        hitObject.isHeld ? hitObject.holdDuration : undefined
      );
    });
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
          //extendHeldHitObject deliberately publishes NOTHING - this runs every frame for as long
          //as the key is down, and what shows the growing tail is the canvas, which is already
          //redrawing on its own playback tick. See its comment in VsrgSong.svelte.ts.
          if (diff > snapPointDuration) vsrg.extendHeldHitObject(hitObject, diff);
        }
      });
      if (audioSong) {
        const notes = audioSong.tickPlayback(timestamp);
        notes.forEach((n) => {
          if (vsrg.trackModifiers[n.trackIndex]?.muted) return;
          audioPlaybackPlayer.pressNoteOfInstrument(n.trackIndex, n.id, n.duration);
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
    //every hit object in that track just went with it, including - very possibly - the selected
    //one, which the `delete` shortcut would otherwise use to address a note in the re-clamped track
    forgetRemovedHitObjects();
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
    //the loaded song's Basepoint is what its stored Note Numbers were entered at, so the audio
    //player has to adopt it or every one of them resolves against the wrong keys (ADR-0007). It
    //used to be seeded from the SETTINGS at mount and never updated, which under the old
    //play-time-rate meaning was merely the wrong playback speed.
    audioPlayer.setBasePitch(song.pitch);
    updateSettings();
    changes++;
    vsrg = song;
    snapPoint = song.snapPoint;
    selectedTrack = 0;
    forgetHitObjectsOfPreviousSong();
    syncInstruments();
    const loadedAudioSong = await songsStore.getSongById(song.audioSongId);
    setAudioSong(loadedAudioSong);
    calculateSnapPoints();
  }

  //`duration` is a public $state field, so these two writes publish on their own - the canvas
  //reads vsrg.duration in its own $effect. Neither re-validates breakpoints against the shrunken
  //timeline; see VsrgSong.#installBreakpoints for why that is deliberate.
  function addTime() {
    vsrg.duration += 1000;
    calculateSnapPoints();
    changes++;
  }

  function removeTime() {
    vsrg.duration -= 1000;
    calculateSnapPoints();
    changes++;
  }

  function onScalingChange(newScaling: number) {
    scaling = newScaling;
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
    return vsrg;
  }

  /**
   * The eye/mute buttons on a background song's tracks. It takes a PATCH rather than a mutated
   * VsrgTrackModifier: setTrackModifier installs a new modifier object into a new array, which is
   * what both `trackModifiers` being `$state.raw` (only assigning the array publishes) and
   * VsrgComposerMenu's `{#each}` (an item whose value did not change is not re-rendered) require.
   */
  function onTrackModifierChange(
    index: number,
    patch: VsrgTrackModifierPatch,
    recalculate: boolean
  ) {
    vsrg.setTrackModifier(index, patch);
    changes++;
    //`hidden` decides which of the background song's notes the timeline draws, so the eye button
    //has to rebuild that list; the mute button does not.
    if (recalculate && audioSong) renderableNotes = vsrg.getRenderableNotes(audioSong);
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
      currentSongId: vsrg.id,
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
