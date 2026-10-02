<script lang="ts">
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ClickType, clamp, isFocusable } from '$core/utils/Utilities';
  import { buttonToNumber, effectiveTrackPitch } from '$core/Songs/noteIds';
  import type { Pitch } from '$core/legacyConfig';
  import { DEFAULT_VSRG_KEYS_MAP } from '$core/legacyConfig';
  import { t } from '$i18n/binding.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import PageHeading from '$cmp/shell/PageHeading.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import VsrgComposerMenu from '$cmp/pages/VsrgComposer/VsrgComposerMenu.svelte';
  import VsrgTop from '$cmp/pages/VsrgComposer/VsrgTop.svelte';
  import VsrgBottom from '$cmp/pages/VsrgComposer/VsrgBottom.svelte';
  import type { VsrgHitObjectType } from '$cmp/pages/VsrgComposer/VsrgBottom.svelte';
  import VsrgComposerCanvas from '$cmp/pages/VsrgComposer/VsrgComposerCanvas.svelte';
  import VsrgGenerateDialog from '$cmp/pages/VsrgComposer/VsrgGenerateDialog.svelte';
  import {
    VsrgSong,
    type VsrgHitObject,
    type VsrgTrack,
    type VsrgTrackInstrumentIdentity,
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
  import type { SerializedSong, Song } from '$core/Songs/Song.svelte';
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
  // One-time seed from the DEFAULT settings - the persisted ones are not readable yet, so onMount
  // re-seeds the same fields (pitch included, which this placeholder would otherwise keep at the
  // constructor's 'C'). Later edits flow through handleSettingChange instead.
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
   * The same background song BEFORE the flattening above, kept because a ComposedSong's
   * `toRecordedSong()` builds a fresh song and copies no `id`. Generation needs the original for
   * exactly that: `setAudioSong` stores the id and builds one track modifier per instrument off it,
   * and refuses a background song that carries neither.
   */
  let audioSongOriginal: Song | null = $state(null);
  let isGenerateVisible = $state(false);
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
    //the persisted settings arrive AFTER the defaults the placeholder song above was seeded
    //from, so re-seed every song-level value it carries (Composer.svelte does the same for its
    //own fresh song). The Basepoint is the one that bites: the audio players adopt the persisted
    //pitch on the next two lines, so a placeholder left at the constructor's 'C' would store
    //every note entered in it at C and resolve it at the settings' Basepoint. Nothing is loaded
    //yet, so there are no hit objects for any of these to move.
    vsrg.set({
      bpm: loadedSettings.bpm.value,
      keys: loadedSettings.keys.value,
      pitch: loadedSettings.pitch.value,
    });
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
    // The pitch branch below is NEW with ADR-0007, and it replaces a documented quirk: `pitch` was
    // already marked songSetting: true, but changing it never reached `vsrg.pitch` for an
    // already-open song (only createNewSong seeded it), so the setting silently did nothing.
    // A Basepoint is now part of what every stored Note Number means, so "did nothing" is no
    // longer an available behaviour: the setting either moves the song or must not exist.
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
    if (key === 'pitch') {
      const previousPitch = vsrg.pitch;
      const next = data.value as Pitch;
      if (next !== previousPitch) {
        vsrg.set({ pitch: next });
        //every track that follows the song moves by the interval; a track with its own override
        //keeps its effective Basepoint and must not move (ADR-0007)
        vsrg.applyBasepointChange('song', previousPitch, next);
        //the audio player resolves stored numbers against this Basepoint, so it follows too
        audioPlayer.setBasePitch(next);
        changes++;
      }
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
      audioSongOriginal = null;
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
      audioSongOriginal = parsed;
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
      audioSongOriginal = parsed;
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

  function onTrackChange(
    track: VsrgTrack,
    index: number,
    previousInstrument?: VsrgTrackInstrumentIdentity
  ) {
    //setTrack, not `vsrg.tracks[index] = track`: the track array is private behind a getter that
    //reads the structure signal, and an element write would publish nothing. VsrgTrackSettings
    //has already mutated this exact object in place, so `track` is usually the object already at
    //`index` - setTrack bumps regardless, which is what rebuilds the canvas's per-colour textures.
    //
    //`previousInstrument` is present only when the panel changed the instrument's NAME or its
    //Basepoint override, which since ADR-0007 rewrites the track's Note Numbers - the panel is the
    //last place the old values still exist, so it hands them down rather than anything here
    //trying to recover them (see setTrack).
    vsrg.setTrack(index, track, previousInstrument);
    if (previousInstrument) changes++;
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
    const notes = hitObject.notes;
    for (let i = 0; i < notes.length; i++) {
      //hold notes sustain for their hold length when the track's instrument supports it
      audioPlayer.pressNoteOfInstrument(
        trackIndex,
        notes[i],
        hitObject.isHeld ? hitObject.holdDuration : undefined
      );
    }
  }

  /**
   * THE PLAYBACK AUDIO LOOP. It runs on the canvas's own tick (VsrgComposerRenderer.handleTick ->
   * setTimestamp), BEFORE that tick draws - which is the ordering that matters, and the one the
   * vsrg player does not have.
   *
   * Written as plain `for` loops rather than the `forEach` chains it replaced. Each of those built
   * a closure per call, and this is per frame: at the default 48fps with three tracks that was
   * ~300 short-lived closures a second on the path whose jitter is audible. What is left per tick
   * is the arrays VsrgSong/RecordedSong.tickPlayback return, which belong to those classes and are
   * shared with the vsrg player.
   *
   * NOT a transport, deliberately. ComposerTransport/PlayerTransport commit a 1s horizon ahead on
   * the AudioContext clock (ADR-0006/ADR-0009), which is what would make these onsets
   * sample-accurate instead of quantised to the tick - but VSRG's other half is interactive (a key
   * press has to sound NOW, not on a horizon), so the two paths have to be designed to coexist
   * rather than line-edited into one. Until then, what keeps the jitter down is the frame this
   * tick shares having stopped allocating.
   */
  function onTimestampChange(timestamp: number) {
    lastTimestamp = timestamp;
    if (!isPlaying) return;
    if (lastTimestamp >= vsrg.duration) {
      isPlaying = false;
      return;
    }
    for (let i = 0; i < heldKeys.length; i++) {
      if (!heldKeys[i]) continue;
      const hitObject = pressedDownHitObjects[i];
      if (!hitObject) continue;
      const diff = timestamp - hitObject.timestamp;
      //extendHeldHitObject deliberately publishes NOTHING - this runs every frame for as long
      //as the key is down, and what shows the growing tail is the canvas, which is already
      //redrawing on its own playback tick. See its comment in VsrgSong.svelte.ts.
      if (diff > snapPointDuration) vsrg.extendHeldHitObject(hitObject, diff);
    }
    if (audioSong) {
      const notes = audioSong.tickPlayback(timestamp);
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (vsrg.trackModifiers[note.trackIndex]?.muted) continue;
        audioPlaybackPlayer.pressNoteOfInstrument(note.trackIndex, note.id, note.duration);
      }
    }
    const tracks = vsrg.tickPlayback(timestamp);
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      for (let i = 0; i < track.length; i++) playHitObject(track[i], index);
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

  /** false when the unsaved-work question below was cancelled, i.e. nothing was opened. */
  async function onSongOpen(song: VsrgSong): Promise<boolean> {
    if (changes !== 0) {
      let confirm = settings.autosave.value && vsrg.name !== 'Untitled';
      if (!confirm) {
        const promptResult = await asyncConfirm(
          t('question:unsaved_song_save', { song_name: vsrg.name }),
          true
        );
        if (promptResult === null) return false;
        confirm = promptResult;
      }
      if (confirm) {
        if ((await saveSong()) === null) return false;
      }
    }
    changes++;
    await adoptSong(song);
    return true;
  }

  /**
   * Put a song on screen, question already settled. Split out of onSongOpen for the generator,
   * which has a case where there is nothing to ask about - see openGeneratedSong.
   */
  async function adoptSong(song: VsrgSong) {
    settings.bpm = { ...settings.bpm, value: song.bpm };
    settings.keys = { ...settings.keys, value: song.keys };
    settings.pitch = { ...settings.pitch, value: song.pitch };
    //the loaded song's Basepoint is what its stored Note Numbers were entered at, so the audio
    //player has to adopt it or every one of them resolves against the wrong keys (ADR-0007). It
    //used to be seeded from the SETTINGS at mount and never updated, which under the old
    //play-time-rate meaning was merely the wrong playback speed.
    audioPlayer.setBasePitch(song.pitch);
    updateSettings();
    vsrg = song;
    snapPoint = song.snapPoint;
    selectedTrack = 0;
    forgetHitObjectsOfPreviousSong();
    syncInstruments();
    const loadedAudioSong = await songsStore.getSongById(song.audioSongId);
    setAudioSong(loadedAudioSong);
    calculateSnapPoints();
  }

  /**
   * Open a chart the generation dialog just made, having already written it to the library.
   *
   * A re-roll hands back the song that is ALREADY open - it overwrites the one it made and no
   * other - and that song is generator-owned and unedited, so onSongOpen's unsaved-work question
   * would be asking about work nobody did. Only a first generation, which displaces whatever the
   * user had open, goes through it.
   */
  async function openGeneratedSong(song: VsrgSong) {
    if (vsrg.id !== song.id) {
      if (!(await onSongOpen(song))) return;
    } else {
      await adoptSong(song);
    }
    //what is on screen came straight back out of the library, so there is nothing unsaved about it
    changes = 0;
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
  <PageHeading text={`${t('home:vsrg_composer_name')} - ${vsrg.name ?? 'Unnamed'}`} />
  <VsrgComposerMenu
    data={{
      settings,
      hasChanges: changes > 0,
      audioSong,
      trackModifiers: vsrg.trackModifiers,
      currentSongId: vsrg.id,
      audioSongId: vsrg.audioSongId,
    }}
    functions={{
      setAudioSong,
      handleSettingChange,
      onSave: saveSong,
      onSongOpen,
      onCreateSong: createNewSong,
      onTrackModifierChange,
      onOpenGenerate: () => (isGenerateVisible = true),
    }}
  />
  <!-- Rendered here rather than inside the menu, and mounted/unmounted by this {#if}: the mount is
       the dialog's whole lifecycle, which is what makes closing it release ownership of the song it
       created. It needs BOTH background songs - the original for its id and roster, the flattening
       for the notes - so it cannot open without one. -->
  {#if isGenerateVisible && audioSong !== null && audioSongOriginal !== null}
    <VsrgGenerateDialog
      data={{
        audioSong: audioSongOriginal,
        source: audioSong,
        keys: settings.keys.value,
        snapPoint,
      }}
      functions={{
        onClose: () => (isGenerateVisible = false),
        onOpenGenerated: openGeneratedSong,
      }}
    />
  {/if}
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

<style>
  /* pulled from vsrg-composer/VsrgComposer.css (old: src/app/_client-pages/vsrg-composer/
     VsrgComposer.css, 270 lines — globally imported in app/layout.tsx at import order 12, after
     Theme.css; this insertion instead sits BEFORE the separately-imported Theme.css, the one
     cascade-order inversion this task's selector-intersection guard proves inert (see the task
     report) — P4c Task 2. SKIPS 5 rules already ported verbatim into MultipleOptionSlider.svelte's
     own <style> block (P4a Task 8; that file's own header names them): `.multiple-option-slider`,
     `.multiple-option-slider button` (both the bare rule and its max-width:1000px override),
     `.multiple-options-selected`, `.multiple-option-slider-overlay`. */
  /* THAT BLOCK NO LONGER EXISTS AS A BLOCK: its rules now live in the <style> of whichever
     VsrgComposer component owns the markup they style - VsrgTop, VsrgBottom, VsrgComposerKeyboard,
     VsrgComposerCanvas and VsrgComposerMenu each hold their own; only the two page-level rules
     below stayed here. `.vsrg-top` and `.vsrg-track-settings` were dropped as dead. */
  .vsrg-page {
    max-height: 100vh;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-areas:
      'a b'
      'c c';
    flex: 1;
    grid-template-rows: calc(100% - 2.9rem) min-content;
    grid-template-columns: 1fr min-content;
    gap: 0.4rem;
    padding: 0.5rem;
  }

  /* :global() because `decorated-vsrg-canvas` is a `class` prop handed to <DecoratedCard>, so it
     lands on that component's own root div rather than on markup written here. */
  :global(.decorated-vsrg-canvas) {
    grid-area: a;
    display: flex;
    border-radius: 0.4rem;
    border: solid 0.15rem var(--secondary);
  }

  @media only screen and (max-width: 1000px) {
    .vsrg-page {
      grid-template-rows: calc(100% - 2.5rem) min-content;
    }
  }
</style>
