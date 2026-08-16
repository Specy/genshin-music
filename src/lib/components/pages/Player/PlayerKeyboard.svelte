<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '$game';
  import {
    SPEED_CHANGERS,
    SUSTAIN_VISUAL_THRESHOLD_MS,
    type NoteNameType,
    type Pitch,
  } from '$core/legacyConfig';
  import PlayerNote from './PlayerNote.svelte';
  import ShapeKeyboard from '$lib/games/shapes/ShapeKeyboard.svelte';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { Array2d, clamp, delay, groupArrayEvery, type Timer } from '$core/utils/Utilities';
  import Analytics from '$core/Analytics';
  import { ApproachingNote, type RecordedNote } from '$core/Songs/SongClasses';
  import type { NoteStatus } from '$core/types';
  import { resolvePlayerNoteButtons } from '$core/Songs/noteIds';
  import type { Instrument, ObservableNote } from '$lib/audio/Instrument.svelte';
  import { RecordedSong, type Chunk } from '$core/Songs/RecordedSong';
  import { MIDIProvider, type MIDIEvent } from '$lib/providers/MIDIProvider';
  import { HeldNoteRegistry, holderToken, midiHolderToken } from '$lib/audio/HeldNoteRegistry';
  import {
    createKeyboardListener,
    createShortcutListener,
    type ShortcutListener,
  } from '$stores/KeybindsStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import { Song } from '$core/Songs/Song.svelte';

  let {
    data,
    functions,
  }: {
    data: {
      isLoading: boolean;
      instrument: Instrument;
      songDisplayInstrument: Instrument;
      pitch: Pitch;
      keyboardSize: number;
      noteNameType: NoteNameType;
      hasSong: boolean;
      hasAnimation: boolean;
      approachRate: number;
      keyboardYPosition: number;
      speedChanger: (typeof SPEED_CHANGERS)[number];
      visualSheetSize: number;
      hideNotesInPracticeMode: boolean;
    };
    functions: {
      //id-keyed (ADR-0005 §4): what this surface hands the engine is the Note Id it pressed
      playSound: (id: number, songNote?: RecordedNote) => void;
      releaseSound: (id: number) => void;
      releaseAllSounds: () => void;
      restartMetronome: (bpm: number, firstBeatDelayMs?: number) => void;
      setHasSong: (override: boolean) => void;
      onSongFinished: () => void;
    };
  } = $props();

  let approachRate = $state(1500);
  let approachingNotesList: ApproachingNote[] = [];
  // QUIRK: written but never read - dead field, preserved rather than removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let nextChunkDelay = 0;
  const tickTime = 50;
  const playbackLeadInMs = 200;
  let tickInterval: Timer = 0;
  let mounted = true;
  let songTimestamp = 0;
  let cleanup: (() => void)[] = [];
  //pending status resets, keyed BY NOTE (ADR-0005 §3) rather than by its position: the note
  //object outlives any republish of the keyboard, so a reset scheduled just before a layout
  //change can only ever unlight the button it was scheduled for.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only; nothing renders from it
  const timeouts = new Map<ObservableNote, Timer>();
  let debouncedStateUpdate: Timer = 0;
  let mode: 'play' | 'practice' | 'approaching' | undefined = $state('play');
  let activeRunKey: number | undefined;
  let songToPractice: Chunk[] = [];
  let sustainingTracks: boolean[] = [];
  let approachingNotes: ApproachingNote[][] = $state(Array2d.from(game.notes.perColumn));
  // QUIRK: written once, never read again - dead field, preserved rather than removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let playTimestamp = Date.now();

  function setTicker(enabled: boolean, runKey: number = playerStore.state.key) {
    if (enabled) {
      clearInterval(tickInterval);
      // Bind the interval to the run which created its approach queue. Store transitions are
      // intentionally torn down on a 4ms debounce; without carrying this key, an old tick which
      // becomes due inside that window can score/finish the old queue while eventType already
      // names the destination run.
      tickInterval = setInterval(() => tick(runKey), tickTime);
    } else {
      clearInterval(tickInterval);
    }
  }

  /**
   * What each physical key and MIDI slot is holding, resolved ONCE at press.
   *
   * Both edges used to resolve the note through `data.hasSong ? songDisplayInstrument :
   * instrument`, and that ternary can flip while a key is down (a song starts or stops under
   * a held finger). The release then looked up a DIFFERENT ObservableNote — missing the
   * object-keyed visual hold and releasing the wrong id, which on a looping sustaining
   * instrument leaves a tone sounding with no way to stop it. Holder -> note, resolved at
   * press, never re-derived.
   */
  const heldInputNotes = new HeldNoteRegistry<ObservableNote>();

  function pressHeldInput(holder: string, note: ObservableNote | undefined) {
    if (!note) return;
    //a duplicate note-on (or a repeat that slipped through) must not press twice
    if (!heldInputNotes.press(holder, note.id, note)) return;
    handleClick(note);
  }

  function releaseHeldInput(holder: string) {
    const released = heldInputNotes.release(holder);
    if (released) handleRelease(released.meta);
  }

  function handleMidi([eventType, note, velocity]: MIDIEvent) {
    if (!mounted) return;
    const instrument = data.hasSong ? data.songDisplayInstrument : data.instrument;
    if (MIDIProvider.isNoteRelease(eventType, velocity)) {
      MIDIProvider.getNotesOfMIDIevent(note).forEach((keyboardNote) => {
        releaseHeldInput(midiHolderToken(note, keyboardNote.index));
      });
      return;
    }
    if (MIDIProvider.isDown(eventType)) {
      MIDIProvider.getNotesOfMIDIevent(note).forEach((keyboardNote) => {
        pressHeldInput(
          midiHolderToken(note, keyboardNote.index),
          instrument.notes[keyboardNote.index]
        );
      });
    }
  }

  const handleKeyboard: ShortcutListener<'keyboard'> = async ({ event, shortcut, code }) => {
    if (event.repeat) return;
    if (!event.shiftKey) {
      const instrument = data.hasSong ? data.songDisplayInstrument : data.instrument;
      const note = instrument.getNoteFromCode(shortcut.name);
      if (note !== null) pressHeldInput(holderToken('keyboard', code), note);
    }
  };

  //release unconditionally (even if shift is down by now) — releasing an unheld key is a no-op
  const handleKeyboardRelease: ShortcutListener<'keyboard'> = ({ code }) => {
    releaseHeldInput(holderToken('keyboard', code));
  };

  function isCurrentRun(runKey: number, expectedMode: 'play' | 'practice' | 'approaching') {
    return (
      mounted &&
      activeRunKey === runKey &&
      playerStore.state.key === runKey &&
      playerStore.eventType === expectedMode &&
      mode === expectedMode
    );
  }

  async function approachingSong(
    song: RecordedSong,
    start = 0,
    end?: number,
    runKey: number = playerStore.state.key
  ) {
    mode = 'approaching';
    activeRunKey = runKey;
    end = end ?? song.notes.length;
    const { speedChanger } = data;
    const notes: ApproachingNote[] = [];
    approachRate = data.approachRate || 1500;
    const startDelay = approachRate;
    const startOffset = song.notes[start] !== undefined ? song.notes[start].time : 0;
    for (let i = start; i < end && i < song.notes.length; i++) {
      const note = song.notes[i];
      // Notes with no key on THIS keyboard can't be practiced — skip (they were unplayable rows
      // before too). The test is `keyboardButton`, the display instrument's own Button space,
      // which is also what the queue rows below are keyed by and what a click resolves to: a note
      // this keyboard cannot play can never be clicked, so admitting it would only queue it up to
      // expire and be scored as a MISS. The second bound is the queue's own row count (one row per
      // Song Grid slot); a Button is always within its instrument's range, and every instrument's
      // ids come from the grid's, so it only ever fires for a malformed config.
      if (note.keyboardButton < 0 || note.keyboardButton >= game.notes.perColumn) continue;
      const obj = new ApproachingNote({
        time: Song.roundTime((note.time - startOffset) / speedChanger.value + startDelay),
        index: note.keyboardButton,
        //durations scale with playback speed like the times do (matches applySpeedChange)
        duration: sustainingTracks[note.trackIndex] ? note.duration / speedChanger.value : 0,
      });
      notes.push(obj);
    }
    await delay(2000); //add an initial delay to let the user prepare
    // A mode change during the preparation delay owns the surface now. Without this guard, the
    // old approach run wakes up two seconds later and clears/replaces the newer mode's pages,
    // score and queues. `key` is monotonic across every transition (including stop), unlike
    // playId, which resetSong() sets back to zero.
    if (!isCurrentRun(runKey, 'approaching')) return;
    // QUIRK: playerControlsStore.setSong(song) is intentionally left commented out - nothing
    // reads the stored song, kept as-is rather than deleted or reinstated.
    //playerControlsStore.setSong(song)
    approachingNotes = Array2d.from(game.notes.perColumn);
    approachingNotesList = notes;
    setTicker(true, runKey);
  }

  function tick(runKey: number) {
    if (!data.hasSong || !isCurrentRun(runKey, 'approaching')) return;
    const stateNotes = approachingNotes;
    const notes = approachingNotesList;
    const { speedChanger } = data;
    notes.forEach((note) => {
      note.time -= tickTime;
    });
    let hasChanges = false;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].time < approachRate) {
        const newNote = new ApproachingNote({
          time: approachRate,
          index: notes[i].index,
          id: Math.floor(Math.random() * 10000),
          duration: notes[i].duration,
        });
        stateNotes[notes[i].index].push(newNote);
        notes.splice(i, 1);
        i--;
        hasChanges = true;
      } else {
        break;
      }
    }
    let removed = 0;
    stateNotes.forEach((approachingNotesRow) => {
      for (let i = 0; i < approachingNotesRow.length; i++) {
        const note = approachingNotesRow[i];
        note.time -= tickTime;
        if (note.clicked) {
          if (note.time < approachRate / 3) {
            playerControlsStore.increaseScore(true, speedChanger.value);
          } else {
            playerControlsStore.increaseScore(false);
          }
          note.time = -1; //so that it can be removed after
        }
        if (note.time < 0) {
          if (!note.clicked) {
            playerControlsStore.increaseScore(false);
          }
          approachingNotesRow.splice(i, 1);
          i--;
          hasChanges = true;
          removed++;
        }
      }
    });
    if (!hasChanges) return;
    // Finished when the approach queue is EMPTY, asked of the queue directly rather than inferred
    // from note indices. The previous test was `current + removed === size`: `removed` counts only
    // notes that actually reached a row, while `size` is the song's full note count - PlayerSlider
    // divides `position` and `end` by it, so `size` has to stay the song's length. The two meet
    // only when every note of the song reaches the grid, so anything that drops a note stalls the
    // test one short forever: a user-selected `end` below the song's length, and now also a note
    // the out-of-grid filter above skips because a wider track put it on a row this grid lacks.
    if (notes.length === 0 && stateNotes.every((row) => row.length === 0)) {
      setTicker(false);
      functions.onSongFinished();
    }
    playerControlsStore.setCurrent(playerControlsStore.current + removed);
    approachingNotes = stateNotes.map((arr) => arr.slice());
  }

  // Mutates in place BY DESIGN: callers only ever pass notes of `lostReference`, the
  // per-play clone built in the state effect below — the store's song (and anything
  // persisted) is never touched, and every replay re-clones from the pristine original,
  // so repeated speed changes cannot compound.
  function applySpeedChange(notes: RecordedNote[]) {
    const { speedChanger } = data;
    return notes.map((note) => {
      note.time = note.time / speedChanger.value;
      //held lengths scale with playback speed like everything else
      note.duration = note.duration / speedChanger.value;
      return note;
    });
  }

  //live presses currently held down, with what to restore when they lift — note-keyed, same
  //reason as `timeouts` above.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only; the visible status lives in playerStore
  const heldVisualPresses = new Map<
    ObservableNote,
    { prevStatus: NoteStatus; pressedAt: number }
  >();

  /**
   * The Button this note occupies on the keyboard AS PUBLISHED — the coordinate this
   * surface's song-side tables speak (`RecordedNote.keyboardButton` and the approaching-note
   * rows keyed by it, both resolved against this same instrument upstream). Never
   * `displayButton`, which answers in the note's OWN TRACK's Buttons and is the sheet's
   * coordinate. Asked of the published array instead of read off the note (`index` is the
   * note's own private storage, ADR-0005): the two agree for every note actually on screen,
   * and a note that is NOT on screen has no key here — -1, which leaves those tables untouched.
   */
  function buttonOf(note: ObservableNote) {
    return playerStore.keyboard.indexOf(note);
  }

  function scheduleStatusReset(note: ObservableNote, prevStatus: NoteStatus, delayMs: number) {
    timeouts.set(
      note,
      setTimeout(() => {
        timeouts.delete(note);
        if (!['clicked', 'approach-wrong', 'approach-correct'].includes(note.status)) return;
        if (prevStatus === 'toClickNext')
          return playerStore.setNoteState(note, { status: prevStatus });
        playerStore.setNoteState(note, { status: '' });
      }, delayMs)
    );
  }

  function handleRelease(note: ObservableNote) {
    if (!note) return;
    functions.releaseSound(note.id);
    //finger lifted: the ring has nothing left to count down, whether or not it ran out
    if (note.data.holdTimerMs !== 0) playerStore.setNoteState(note, { holdTimerMs: 0 });
    const held = heldVisualPresses.get(note);
    if (held) {
      heldVisualPresses.delete(note);
      //stay lit at least as long as a quick tap used to (the press animation length)
      const remaining = Math.max(0, game.notes.animationDelayMs - (Date.now() - held.pressedAt));
      scheduleStatusReset(note, held.prevStatus, remaining);
    }
  }

  async function playSong(
    song: RecordedSong,
    start = 0,
    end?: number,
    runKey: number = playerStore.state.key
  ) {
    mode = 'play';
    activeRunKey = runKey;
    end = end ?? song.notes.length;
    songTimestamp = song.timestamp;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    const notes = applySpeedChange(song.notes).slice(start, end);
    if (notes.length === 0) return;
    const mergedNotes = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    playerControlsStore.setPages(groupArrayEvery(mergedNotes, visualSheetSize));
    // Cancel the old click grid now and schedule beat zero at the end of the same preparation
    // window as the song. A delayed audio-clock anchor avoids both a stray old click during the
    // lead-in and the phase error that results from starting the metronome's default 50ms margin
    // alongside this transport's 200ms margin.
    functions.restartMetronome(song.bpm * data.speedChanger.value, playbackLeadInMs);
    await delay(playbackLeadInMs);
    if (!isCurrentRun(runKey, 'play')) return;
    const startOffset = notes[0].time;
    let previous = startOffset;
    let delayOffset = 0;
    let startTime = Date.now();
    let chunkPlayedNotes = 0;
    for (let i = 0; i < notes.length; i++) {
      const delayTime = notes[i].time - previous;
      previous = notes[i].time;
      if (delayTime > 16) await delay(delayTime + delayOffset);
      if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
      //the note's key on this keyboard, or nothing on screen to press (keyboardButton -1, which
      //indexes nothing) — either way the sound is the song note's own id, played on its own
      //track's instrument
      const keyboardNote = keyboard[notes[i].keyboardButton];
      if (keyboardNote) handleClick(keyboardNote, notes[i]);
      else functions.playSound(notes[i].id, notes[i]);
      if (chunkPlayedNotes >= (playerControlsStore.currentChunk?.notes.length ?? 0)) {
        chunkPlayedNotes = 1;
        playerControlsStore.incrementChunkPositionAndSetCurrent(start + i + 1);
      } else {
        chunkPlayedNotes++;
        playerControlsStore.setCurrent(start + i + 1);
      }
      delayOffset = startTime + previous - startOffset - Date.now();
    }
    const lastNoteTime = notes.at(-1)?.time ?? 0;
    const finalReleaseTime = notes.reduce(
      (latest, note) =>
        Math.max(latest, note.time + (sustainingTracks[note.trackIndex] ? note.duration : 0)),
      lastNoteTime
    );
    if (finalReleaseTime > lastNoteTime) await delay(finalReleaseTime - lastNoteTime);
    if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
    functions.onSongFinished();
  }

  function practiceSong(
    song: RecordedSong,
    start = 0,
    end?: number,
    runKey: number = playerStore.state.key
  ) {
    mode = 'practice';
    activeRunKey = runKey;
    //TODO move this to the song class
    end = end ?? song.notes.length;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    //only notes this keyboard has a key for can ever be clicked, so only those may enter the
    //practice queue — a chunk holding an unclickable note would never complete. The pages built
    //from these chunks follow, by necessity: they ARE the queue. Each surviving note still draws
    //at its own `displayButton` inside its frame.
    const notes = applySpeedChange(song.notes)
      .slice(start, end)
      .filter((note) => note.keyboardButton >= 0 && note.keyboardButton < keyboard.length);
    const chunks = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    if (chunks.length === 0) return;
    nextChunkDelay = 0;
    const firstChunk = chunks[0];
    firstChunk.notes.forEach((note) => {
      //one lookup from the note's key on THIS keyboard to the note object, then everything is
      //the object
      const keyboardNote = keyboard[note.keyboardButton];
      if (!keyboardNote) return;
      playerStore.setNoteState(keyboardNote, {
        status: 'toClick',
        delay: game.notes.animationDelayMs,
        holdMs:
          sustainingTracks[note.trackIndex] && note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS
            ? note.duration
            : 0,
      });
    });
    const secondChunk = chunks[1];
    secondChunk?.notes.forEach((note) => {
      const keyboardNote = keyboard[note.keyboardButton];
      if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext');
      keyboardNote.setStatus('toClickNext');
    });
    functions.setHasSong(true);
    playerControlsStore.setPages(groupArrayEvery(chunks, visualSheetSize));
    songToPractice = chunks;
  }

  async function restartSong(override?: number) {
    await stopSong();
    if (!mounted) return;
    playerStore.restartSong(
      typeof override === 'number' ? override : playerControlsStore.position,
      playerControlsStore.end
    );
  }

  async function stopSong(): Promise<void> {
    // This is the one teardown path for every play/practice/approach/restart/stop transition.
    // Shared player state must be cleared here rather than by whichever destination happens to
    // overwrite it later: approach has a two-second preparation window, empty songs return early,
    // and the keyboard shortcut does not pass through PlayerSongControls' stop button.
    setTicker(false);
    mode = undefined;
    activeRunKey = undefined;
    songTimestamp = 0;
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
    heldVisualPresses.clear();
    //the keyboard layout is about to be replaced, so every note object a holder captured is
    //stale; a holder left behind would also swallow the next press of that same key
    heldInputNotes.releaseAll();
    playerStore.resetKeyboardLayout();
    approachingNotesList = [];
    songToPractice = [];
    sustainingTracks = [];
    approachingNotes = Array2d.from(game.notes.perColumn);
    playerControlsStore.clearPages();
    playerControlsStore.resetScore();
    //stopping playback releases every still-held voice (live and scheduled)
    functions.releaseAllSounds();
    playerStore.setKeyboardLayout(data.instrument.notes);
    functions.setHasSong(false);
  }

  function stopAndClear() {
    stopSong();
    playerStore.resetSong();
  }

  function handleApproachClick(note: ObservableNote) {
    //the queue's rows and this lookup are the same space now (both the displayed keyboard's
    //Buttons); a note that is not on the keyboard resolves to -1 and hits no row
    const approachingNote = approachingNotes[buttonOf(note)]?.[0];
    if (approachingNote) {
      approachingNote.clicked = true;
      if (approachingNote.time < approachRate / 3) return 'approach-correct';
    }
    return 'approach-wrong';
  }

  function handlePracticeClick(note: ObservableNote) {
    const keyboard = playerStore.keyboard;
    if (songToPractice.length > 0) {
      //ONE coordinate space on both sides: the clicked note's position on the published
      //keyboard, matched against the chunk note's key on that same keyboard. Comparing it with
      //`displayButton` matched the note's OWN track's button instead, so on a multi-instrument
      //song the right key failed to clear a note and a wrong one cleared it.
      const button = buttonOf(note);
      //a note that is not on the published keyboard has no key, and must not match the chunk
      //notes practiceSong dropped for the same reason
      if (button < 0) return;
      const clickedNoteIndex = songToPractice[0]?.notes.findIndex(
        (e) => e.keyboardButton === button
      );
      if (clickedNoteIndex !== -1) {
        songToPractice[0].notes.splice(clickedNoteIndex, 1);
        if (songToPractice[0].notes.length === 0) {
          songToPractice.shift();
          playerControlsStore.incrementChunkPositionAndSetCurrent();
        }
        if (songToPractice.length === 0) {
          functions.onSongFinished();
        }
        if (songToPractice.length > 0) {
          const nextChunk = songToPractice[0];
          const nextNextChunk = songToPractice[1];
          nextChunk.notes.forEach((note) => {
            const keyboardNote = keyboard[note.keyboardButton];
            if (!keyboardNote) return;
            playerStore.setNoteState(keyboardNote, {
              status: 'toClick',
              delay: nextChunk.delay,
              holdMs:
                sustainingTracks[note.trackIndex] && note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS
                  ? note.duration
                  : 0,
            });
          });
          if (nextNextChunk) {
            nextNextChunk?.notes.forEach((note) => {
              const keyboardNote = keyboard[note.keyboardButton];
              if (keyboardNote.status === 'toClick')
                return keyboardNote.setStatus('toClickAndNext');
              keyboardNote.setStatus('toClickNext');
            });
          }
        }
        playerControlsStore.incrementCurrent();
      }
    }
  }

  function handleClick(note: ObservableNote, songNote?: RecordedNote) {
    const hasAnimation = data.hasAnimation;
    if (!note) return;
    const prevStatus = note.status;
    //the press below wipes the read-ahead hold hint, so carry its length into the release
    //ring first - that ring is what tells the player when to lift the finger back off
    const holdTimerMs = mode === 'practice' ? note.data.holdMs : 0;
    playerStore.setNoteState(note, {
      status: 'clicked',
      delay: playerStore.eventType !== 'play' ? game.notes.animationDelayMs : 0,
      holdMs: 0,
      holdTimerMs,
      holdTimerId: note.data.holdTimerId + 1,
      animationId:
        hasAnimation && playerStore.eventType !== 'approaching'
          ? Math.floor(Math.random() * 10000) + Date.now()
          : 0,
    });
    const ownsCurrentRun = activeRunKey === playerStore.state.key;
    if (ownsCurrentRun && mode === 'practice' && playerStore.eventType === 'practice')
      handlePracticeClick(note);
    //the engine speaks Note Ids: play THIS note, not whatever the sounding instrument keeps
    //at the same button
    functions.playSound(note.id, songNote);
    if (ownsCurrentRun && mode === 'approaching' && playerStore.eventType === 'approaching') {
      const status = handleApproachClick(note);
      playerStore.setNoteState(note, { status });
      if (status === 'approach-wrong') playerControlsStore.increaseScore(false);
    }
    //TODO could add this to the player store
    const pendingReset = timeouts.get(note);
    if (pendingReset && playerStore.eventType === 'play') clearTimeout(pendingReset);
    if (songNote) {
      const holdDuration = sustainingTracks[songNote.trackIndex] ? songNote.duration : 0;
      scheduleStatusReset(note, prevStatus, Math.max(game.notes.animationDelayMs, holdDuration));
    } else if (data.instrument.supportsSustain) {
      //live press on a sustaining instrument: the button stays visually pressed until
      //handleRelease lifts it — clear any pending reset from a previous tap so it
      //can't unlight the hold
      if (pendingReset) clearTimeout(pendingReset);
      timeouts.delete(note);
      heldVisualPresses.set(note, { prevStatus, pressedAt: Date.now() });
    } else {
      //non-sustaining instruments keep the plain tap animation
      scheduleStatusReset(note, prevStatus, game.notes.animationDelayMs);
    }
  }

  onMount(() => {
    const disposeShortcuts = createShortcutListener('player', 'player_keyboard', ({ shortcut }) => {
      const { name } = shortcut;
      if (name === 'restart') {
        if (!data.hasSong) return;
        if (['practice', 'play', 'approaching'].includes(playerStore.eventType)) {
          restartSong(0);
        }
      }
      if (name === 'stop') {
        if (data.hasSong) stopAndClear();
      }
    });
    const disposeKeyboard = createKeyboardListener('player_keyboard_keys', handleKeyboard, {
      onRelease: handleKeyboardRelease,
    });
    //visual counterpart of Player's audio blur guard: lift held-pressed buttons whose
    //key-up will never arrive
    const releaseVisualsOnLeave = () => {
      //physical holders first: their key-up will never arrive, and a holder left behind would
      //swallow the next press of that key
      heldInputNotes.releaseAll().forEach(({ meta }) => handleRelease(meta));
      //the held notes ARE the map's keys — no keyboard lookup to go stale between the press
      //and the blur
      [...heldVisualPresses.keys()].forEach((note) => handleRelease(note));
    };
    window.addEventListener('blur', releaseVisualsOnLeave);
    document.addEventListener('visibilitychange', releaseVisualsOnLeave);
    cleanup.push(() => {
      window.removeEventListener('blur', releaseVisualsOnLeave);
      document.removeEventListener('visibilitychange', releaseVisualsOnLeave);
    });
    cleanup.push(disposeShortcuts, disposeKeyboard);

    $effect(() => {
      // Reading key/playId here (values otherwise unused) makes this effect rerun on every
      // play/practice/approaching/restartSong/resetSong call, even when the song object is
      // reference-equal.
      void playerStore.state.key;
      void playerStore.state.playId;
      // This debounce isn't just coalescing multiple fires into one - it defers past the
      // current synchronous call stack, so stopSong() and the mode dispatch below always run
      // after whatever triggered the change (e.g. playerStore.play(...)) has fully returned.
      // Removing it changes that ordering.
      if (debouncedStateUpdate) clearTimeout(debouncedStateUpdate);
      debouncedStateUpdate = setTimeout(async () => {
        const state = playerStore.state;
        const runKey = state.key;
        const song = playerStore.song;
        const type = playerStore.eventType;
        await stopSong();
        // A second transition can arrive while the await yields. Its own debounced callback will
        // perform the setup; this stale one must not install the song/mode it captured beforehand.
        if (!mounted || playerStore.state.key !== runKey) return;
        if (type === 'stop') {
          functions.setHasSong(false);
        } else {
          if (!song) return;
          const lostReference = song.isComposed ? song.toRecordedSong().clone() : song.clone();
          // THE BUTTON COUNT AND THE SHAPE COME FROM THE SAME INSTRUMENT - this line is the count,
          // the `shape` derived below is the grid - so a song on a 2x4 drum kit gets 8 buttons in
          // 4 columns rather than 8 buttons in a piano's 5.
          playerStore.setKeyboardLayout(data.songDisplayInstrument.notes);
          // Resolve each note's TWO display coordinates once (see RecordedNote): `displayButton`
          // for the sheet frames, which stay on the note's own track instrument (ADR-0004), and
          // `keyboardButton` for THIS keyboard, the only one everything below may index. The
          // display keyboard follows track 0 (see displayInstrumentNameFor), so a note on another
          // track - or one stranded on its own - simply has no key here; those notes remain in the
          // timing stream and are skipped instead of changing the user's requested note range.
          const songInstruments = lostReference.instruments;
          sustainingTracks = songInstruments.map(
            (instrument) => game.instruments.data[instrument.name]?.sustain !== undefined
          );
          resolvePlayerNoteButtons(
            lostReference.notes,
            songInstruments,
            data.songDisplayInstrument.name
          );

          lostReference.timestamp = Date.now();
          const start = clamp(state.start, 0, lostReference.notes.length);
          const end = clamp(
            state.end || lostReference.notes.length,
            start,
            lostReference.notes.length
          );
          //"playable" = there is a key on THIS keyboard to press; a Button of the display
          //instrument is by construction one of its keys, so >= 0 is the whole test
          const hasPlayableNotes = lostReference.notes
            .slice(start, end)
            .some((note) => note.keyboardButton >= 0);
          if (end === start || !hasPlayableNotes) {
            playerControlsStore.setState({
              size: lostReference.notes.length,
              position: start,
              end,
              current: start,
            });
            return;
          }
          if (type === 'play') {
            playSong(lostReference, start, end, runKey);
          }
          if (type === 'practice') {
            practiceSong(lostReference, start, end, runKey);
          }
          if (type === 'approaching') {
            approachingSong(lostReference, start, end, runKey);
          }
          functions.setHasSong(true);
          Analytics.songEvent({ type });
          playerControlsStore.setState({
            size: lostReference.notes.length,
            position: start,
            end,
            current: start,
          });
        }
      }, 4);
    });

    MIDIProvider.addListener(handleMidi);
    cleanup.push(() => MIDIProvider.removeListener(handleMidi));
    //A device unplugged mid-hold owes us no note-off, and a holder left in the registry makes
    //that MIDI key silently DEAD (its next note-on is swallowed as a duplicate press). Only
    //MIDI holds are dropped — a physically held PC key must survive someone unplugging a
    //controller.
    const handleMidiInputsChange = () =>
      heldInputNotes.releaseSource('midi').forEach(({ meta }) => handleRelease(meta));
    MIDIProvider.addInputsListener(handleMidiInputsChange);
    cleanup.push(() => MIDIProvider.removeInputsListener(handleMidiInputsChange));

    return () => {
      cleanup.forEach((d) => d());
      songTimestamp = 0;
      playerStore.resetSong();
      mounted = false;
      clearInterval(tickInterval);
    };
  });

  const size = $derived(clamp(data.keyboardSize / 100, 0.5, 1.5));
  // Geometry follows the displayed instrument's Shape (ADR-0003) — the same
  // instrument whose notes fill playerStore.keyboard; no more length sniffing.
  const displayInstrument = $derived(data.hasSong ? data.songDisplayInstrument : data.instrument);
  const shape = $derived(displayInstrument.shape);
  /**
   * The two numbers this grid is drawn from arrive on different clocks: the Shape above changes
   * the moment Player.svelte reassigns `songDisplayInstrument`, while `playerStore.keyboard` is
   * republished by the 4ms debounce below, after an `await stopSong()`. Switching between two
   * songs therefore leaves a window in which they disagree, and the paint can land inside it.
   *
   * The `min` makes the disagreement unrepresentable in the direction that renders wrongly:
   * capping at the Shape's own instrument keeps the count from exceeding the grid it is being
   * laid out on (15 piano buttons wrapped into a drum kit's 4 columns was the visible symptom),
   * and capping at the published keyboard keeps every note handed to the Shape one that is
   * really there. Both are identities once the two clocks have met, which is every frame but
   * those few milliseconds.
   */
  const buttonCount = $derived(
    Math.min(displayInstrument.notes.length, playerStore.keyboard.length)
  );
  /**
   * What the Shape is handed (ADR-0005 §1): the displayed instrument's notes in authored
   * Button order, capped by the guard above — so the Shape decides where each note goes and
   * the snippet gets the note itself back, never an index into an array that may have been
   * republished since. The slice is also what makes `note` in the snippet un-undefined.
   */
  const buttonNotes = $derived(playerStore.keyboard.slice(0, buttonCount));
  const keyboardClass = $derived(
    'keyboard' + (playerStore.eventType === 'play' ? ' keyboard-playback' : '')
  );
  // $derived.by (not bare $derived(expr)) is required: TypeScript narrows mode to its
  // initializer literal ('play') at this point, since no synchronous code reassigns it first -
  // wrapping the expression in an arrow function (like keyboardClass above) forces a fresh,
  // unnarrowed read of mode's declared type.
  const hideNotes = $derived.by(() => data.hideNotesInPracticeMode && mode === 'practice');
  const wrapperStyle = $derived(
    `${size !== 1 ? `transform:scale(${size});` : ''}z-index:2;margin-bottom:${size * 6 + data.keyboardYPosition / 10}vh`
  );
</script>

{#if data.isLoading}
  <div class={keyboardClass} style={wrapperStyle}>
    <div class="loading" style="min-height: 20vh;">{t('common:loading')}...</div>
  </div>
{:else}
  <ShapeKeyboard {shape} notes={buttonNotes} class={keyboardClass} style={wrapperStyle}>
    <!-- payload: the note itself, and the BUTTON it is - the coordinate the per-button data
         below is keyed by (approaching rows) and the one getNoteText labels, which resolves it
         through the Shape's own assignment so the text can't disagree with what was drawn -->
    {#snippet button(note, buttonIndex)}
      <PlayerNote
        {note}
        {shape}
        data={{
          approachRate,
          instrument: displayInstrument.name,
        }}
        hideNote={hideNotes}
        approachingNotes={approachingNotes[buttonIndex] ?? []}
        {handleClick}
        {handleRelease}
        noteText={displayInstrument.getNoteText(buttonIndex, data.noteNameType, data.pitch)}
      />
    {/snippet}
  </ShapeKeyboard>
{/if}
