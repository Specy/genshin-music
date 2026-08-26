<script lang="ts">
  import { onMount, untrack } from 'svelte';
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
  import { effectiveTrackPitch, resolvePlayerNoteButtons } from '$core/Songs/noteIds';
  import { dedupeChunkNotes, dedupeSimultaneousNotes } from '$core/Songs/duplicateNotes';
  import { sectionQueue } from '$core/Songs/sectionChunks';
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
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import {
    planSongRender,
    type PlannedEvent,
    type PlannedTrack,
  } from '$lib/audio/OfflineSongRenderer';
  import { PlayerTransport } from '$lib/audio/PlayerTransport';

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
      playSound: (id: number) => void;
      releaseSound: (id: number) => void;
      releaseAllSounds: () => void;
      /**
       * Hand one planned song event to its track's engine, committed at the absolute audio time
       * the transport chose (ADR-0009). `skipMs` enters the sample partway in, for a note whose
       * span was already running when playback started.
       */
      commitSongNote: (
        event: PlannedEvent,
        track: PlannedTrack,
        atAudioTime: number,
        skipMs?: number
      ) => void;
      /** A song note reached the ear: a running note recording writes what the performer hears. */
      recordSoundedNote: (id: number) => void;
      /** Retract every committed-but-unstarted event, on every track, from this instant on. */
      cancelScheduledSounds: () => void;
      restartMetronome: (bpm: number, firstBeatDelayMs?: number) => void;
      setHasSong: (override: boolean) => void;
      onSongFinished: () => void;
    };
  } = $props();

  let approachRate = $state(1500);
  // 35% shorter than the original two-second preparation, while retaining three equal beats.
  const approachPreparationMs = 2000 * 0.65;
  const approachCountdownValues = [3, 2, 1] as const;
  let approachCountdown: (typeof approachCountdownValues)[number] | null = $state(null);
  let approachingNotesList: ApproachingNote[] = [];
  // QUIRK: written but never read - dead field, preserved rather than removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let nextChunkDelay = 0;
  const tickTime = 50;
  /**
   * How long after the play request the first note sounds. It is the transport's start margin AND
   * the metronome's first-beat delay, handed to both from here, which is what keeps beat zero and
   * the first note on the same instant.
   */
  const playbackLeadInMs = 200;
  let tickInterval: Timer = 0;
  /**
   * PLAY MODE's transport (ADR-0009), one per run and null while stopped. Practice and approaching
   * keep their tick/queue machinery: their sounds are user presses on the immediate path, so there
   * is nothing for a committed horizon to be ahead of.
   */
  let playTransport: PlayerTransport | null = null;
  // The one clock playback timing lives on. AudioProvider owns the context; reading currentTime
  // through it (rather than caching a context) keeps this honest across a context recreation.
  const audioClock = { now: () => AudioProvider.getAudioContext().currentTime };
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
    runKey: number = playerStore.state.key,
    /** Build the whole run but leave its tick stopped - see the dispatch's `startsPaused`. */
    startsPaused = false
  ) {
    mode = 'approaching';
    activeRunKey = runKey;
    end = end ?? song.notes.length;
    const { speedChanger } = data;
    const notes: ApproachingNote[] = [];
    approachRate = data.approachRate || 1500;
    const startDelay = approachRate;
    const startOffset = song.notes[start] !== undefined ? song.notes[start].time : 0;
    // Notes with no key on THIS keyboard can't be practiced — skip (they were unplayable rows
    // before too). The test is `keyboardButton`, the display instrument's own Button space,
    // which is also what the queue rows below are keyed by and what a click resolves to: a note
    // this keyboard cannot play can never be clicked, so admitting it would only queue it up to
    // expire and be scored as a MISS. The second bound is the queue's own row count (one row per
    // Song Grid slot); a Button is always within its instrument's range, and every instrument's
    // ids come from the grid's, so it only ever fires for a malformed config.
    const playable = song.notes
      .slice(start, end)
      .filter((note) => note.keyboardButton >= 0 && note.keyboardButton < game.notes.perColumn);
    // ...and a note the keyboard CAN play, but twice over: two tracks doubling the same note in
    // one instant used to spawn two identical circles on one row, of which a press can only ever
    // clear one - the twin expired and was scored as a MISS through no fault of the player
    // (duplicateNotes.ts). Deduping on the song's own times, before the speed scaling below,
    // keeps the window the same one the practice chunks merge on.
    for (const note of dedupeSimultaneousNotes(playable, sustainingTracks)) {
      const obj = new ApproachingNote({
        time: Song.roundTime((note.time - startOffset) / speedChanger.value + startDelay),
        index: note.keyboardButton,
        //durations scale with playback speed like the times do (matches applySpeedChange)
        duration: sustainingTracks[note.trackIndex] ? note.duration / speedChanger.value : 0,
        //what the sheet cursor moves past when this circle resolves (ADR-0010)
        absoluteIndex: note.absoluteIndex,
      });
      notes.push(obj);
    }
    //THE SHEET IS THE WHOLE SONG (ADR-0010) while the circles above stay Section-bounded. Built
    //from the same playability test, and chunked on SPEED-SCALED times, because the merge window is
    //a fixed 50ms over `note.time`: approaching scales inline into the circle rather than through
    //applySpeedChange, so without scaling these clones its frames would be the speed-1.0 chunking
    //while practice's move with the speed setting, and the two sheets would disagree.
    const pageNotes = song.notes
      .filter((note) => note.keyboardButton >= 0 && note.keyboardButton < game.notes.perColumn)
      .map((note) => {
        const clone = note.clone();
        clone.time = clone.time / speedChanger.value;
        clone.duration = clone.duration / speedChanger.value;
        return clone;
      });
    const pageChunks = RecordedSong.mergeNotesIntoChunks(pageNotes);
    //one entry per key per frame, the same rule the circles were deduped by above
    pageChunks.forEach((chunk) => {
      chunk.notes = dedupeChunkNotes(chunk.notes, sustainingTracks);
    });
    // Keep the existing two-second preparation window, but make all of it visible. Ownership is
    // checked BEFORE every write: an old async initializer may wake after a replacement run has
    // already put its own number on screen, and must neither replace nor clear that number.
    //...and a run dispatched INTO a pause counts nobody in: the preparation window exists to hand
    //the user the first circles at a predictable moment, and the moment they get them is now their
    //own press of play. Skipping it also keeps this whole path synchronous, so the dispatch's
    //`pausedRunKey` hand-off lands on a queue that is already built.
    if (!startsPaused) {
      for (const count of approachCountdownValues) {
        if (!isCurrentRun(runKey, 'approaching')) return;
        approachCountdown = count;
        await delay(approachPreparationMs / approachCountdownValues.length);
      }
    }
    // A mode change during the preparation delay owns the surface now. Without this guard, the
    // old approach run wakes up two seconds later and clears/replaces the newer mode's pages,
    // score and queues. `key` is monotonic across every transition (including stop), unlike
    // playId, which resetSong() sets back to zero.
    if (!isCurrentRun(runKey, 'approaching')) return;
    approachCountdown = null;
    // QUIRK: playerControlsStore.setSong(song) is intentionally left commented out - nothing
    // reads the stored song, kept as-is rather than deleted or reinstated.
    //playerControlsStore.setSong(song)
    approachingNotes = Array2d.from(game.notes.perColumn);
    approachingNotesList = notes;
    //published only now, beside the ticker: a stale approach that lost the surface during the
    //preparation delay must not install its pages over the newer run's
    playerControlsStore.setPages(groupArrayEvery(pageChunks, data.visualSheetSize));
    //the circles, the queue and the sheet are all in place; only the clock is withheld, which is
    //exactly the state `pauseRun` leaves an approach run in, so `resumeRun` starts it unchanged
    if (!startsPaused) setTicker(true, runKey);
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
          //the grid's circle is a NEW object, and it is the one that gets clicked or expires —
          //without carrying this the cursor would never learn which note resolved
          absoluteIndex: notes[i].absoluteIndex,
        });
        stateNotes[notes[i].index].push(newNote);
        notes.splice(i, 1);
        i--;
        hasChanges = true;
      } else {
        break;
      }
    }
    //the furthest note this tick resolved, in absolute positions — the sheet cursor follows the
    //circles that LEFT the grid, so a row that clears out of order cannot pull it back
    let resolvedThrough = -1;
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
          resolvedThrough = Math.max(resolvedThrough, note.absoluteIndex);
        }
      }
    });
    if (!hasChanges) return;
    // Finished when the approach queue is EMPTY, asked of the queue directly rather than inferred
    // from note indices. The previous test was `current + removed === size`: `removed` counts only
    // notes that actually reached a row, while `size` is the song's full note count and the
    // Section/run bounds remain absolute note indexes. The two meet
    // only when every note of the song reaches the grid, so anything that drops a note stalls the
    // test one short forever: a user-selected `end` below the song's length, and now also a note
    // the out-of-grid filter above skips because a wider track put it on a row this grid lacks.
    if (notes.length === 0 && stateNotes.every((row) => row.length === 0)) {
      setTicker(false);
      functions.onSongFinished();
      //the run is over, so the cursor belongs on its exclusive end - every circle it owned has
      //left the grid, and that is where the slider's progress line has to reach. The frame
      //highlight stays on the last frame played through the store's `runEnd` lookup clamp.
      playerControlsStore.advanceCurrentTo(playerControlsStore.state.runEnd);
    } else if (resolvedThrough >= 0) {
      playerControlsStore.advanceCurrentTo(resolvedThrough + 1);
    }
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
  //...and the Note Number each of those presses ENTERED at (ADR-0007), remembered rather than
  //re-derived on the up edge: `data.pitch` can change under a held key (the settings menu, a
  //MIDI pitch change) and applySetting releases nothing, so a release computed at the new
  //Basepoint would name a number no voice is held on. Note-keyed like the map above; a second
  //holder of the same note overwrites it, exactly as its press retriggered the voice.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only; nothing renders from it
  const heldNumbers = new Map<ObservableNote, number>();

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
    //released on the number the PRESS entered at (heldNumbers), which is what both the engine's
    //held voice and the recording's open note are filed under; `numberAt(data.pitch)` is only
    //the fallback for a note this surface never registered a press for
    const pressedNumber = heldNumbers.get(note);
    heldNumbers.delete(note);
    functions.releaseSound(pressedNumber ?? note.numberAt(data.pitch));
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

  /**
   * PLAY MODE, on the audio clock (ADR-0009). The song is planned once through the offline
   * export's own planner and handed to a transport, which commits each event to the audio clock
   * up to a horizon ahead while the sounding cursor drives everything the ear-moment owns: the
   * key flash, the sheet cursor and chunk position, and a running note recording.
   */
  async function playSong(
    song: RecordedSong,
    start = 0,
    end?: number,
    runKey: number = playerStore.state.key,
    /** Build the whole run but leave its transport uncreated - see the dispatch's `startsPaused`. */
    startsPaused = false
  ) {
    mode = 'play';
    activeRunKey = runKey;
    const rangeEnd = end ?? song.notes.length;
    songTimestamp = song.timestamp;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    //mutates the per-run clone in place, so `song.notes` IS the speed-scaled timeline every index
    //below - the plan's noteIndex included - addresses
    const notes = applySpeedChange(song.notes);
    if (rangeEnd - start <= 0) return;
    //THE SHEET IS THE WHOLE SONG (ADR-0010), the Section only bounds what runs below. The clone is
    //not optional: mergeNotesIntoChunks empties the array it is handed, and `notes` is the same
    //array the planner is built from a few lines down.
    const mergedNotes = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    playerControlsStore.setPages(groupArrayEvery(mergedNotes, visualSheetSize));
    //A RUN DISPATCHED INTO A PAUSE STOPS HERE, with the sheet published and nothing scheduled.
    //That is the same shape `pauseRun` leaves a paused play run in - no transport, no committed
    //horizon, no metronome - so `resumeRun` re-anchors it from the cursor by the one path that
    //already knows how to enter a run part-way (ADR-0009), rather than a second entry point of
    //its own. Everything below this line either sounds something or schedules something to.
    if (startsPaused) return;

    // ONE PLANNER for the audio export, the composer's conversion and live play: which tracks are
    // audible, at what Basepoint, press or plain trigger, and how long is decided there and
    // nowhere else, so a performance and a rendered file of the same song cannot disagree.
    const planned = new RecordedSong(song.name, notes, []);
    planned.instruments = song.instruments;
    planned.pitch = song.pitch;
    planned.reverb = song.reverb;
    const plan = planSongRender(planned);
    // The range's END is a cut; its START is not - the events before it stay on the timeline, so
    // a note whose span covers the start can still be found and resumed below.
    const events = plan.events.filter((event) => event.noteIndex < rangeEnd);
    const fromIndex = events.findIndex((event) => event.noteIndex >= start);
    // Nothing audible in the range (every track muted, or soloed away): there is no sounding
    // moment to drive a run from, so it ends here exactly as an empty note range does above.
    if (fromIndex === -1) return;
    const finishS = events
      .slice(fromIndex)
      .reduce(
        (latest, event) =>
          Math.max(
            latest,
            event.atS + (event.kind === 'press' ? (event.durationMs ?? 0) / 1000 : 0)
          ),
        events[fromIndex].atS
      );

    try {
      // The transport's only clock is the audio clock, and a context created outside a user
      // gesture starts suspended - anchoring onto a frozen currentTime would wait forever (see
      // AudioProvider.ensureRunning).
      await AudioProvider.ensureRunning();
    } catch (error) {
      console.error('Unable to start the audio context for player playback', error);
      return;
    }
    if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
    // Cancel the old click grid and anchor beat zero at the same preparation window as the first
    // note, so one instant is the downbeat for both. Done after the resume above rather than
    // before it, so a slow resume cannot leave the two anchored on different moments.
    functions.restartMetronome(song.bpm * data.speedChanger.value, playbackLeadInMs);

    let countedThrough = start - 1;
    /**
     * The sheet cursor, in absolute note positions: `current` is the note that has NOT sounded yet,
     * and the frame under the highlight follows from it (ADR-0010). Indexes the plan left out - an
     * inaudible track contributes no events - are simply passed over rather than counted one by
     * one, because nothing steps here any more.
     */
    const advanceCountingTo = (noteIndex: number) => {
      if (noteIndex <= countedThrough) return;
      countedThrough = noteIndex;
      //UNCLAMPED, so a finished run lands `current` on `rangeEnd` and the slider's progress line
      //reaches the end. The frame highlight is kept off the run's exclusive end by the store's
      //own `runEnd` lookup clamp, not here.
      playerControlsStore.advanceCurrentTo(noteIndex + 1);
    };

    const transport = new PlayerTransport(audioClock, {
      // COMMIT = SOUND ONLY. Nothing visible happens here: this event is up to a horizon away
      // from being heard, and everything a listener can see about it belongs to onSounding.
      commitEvent: (index, atAudioTime) => {
        if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
        const event = events[index];
        functions.commitSongNote(event, plan.tracks[event.trackIndex], atAudioTime);
      },
      onSounding: (index) => {
        if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
        const event = events[index];
        const note = song.notes[event.noteIndex];
        //keyboardButton -1, or a button this keyboard does not have: the note still sounded (it
        //was committed a horizon ago) and still counts - there is simply no key to light
        const keyboardNote = keyboard[note.keyboardButton];
        if (keyboardNote) flashSongNote(keyboardNote, note);
        advanceCountingTo(event.noteIndex);
        //a recording writes what the performer HEARS, which is this instant and not the one the
        //note was handed to the audio clock at
        functions.recordSoundedNote(note.id);
      },
      // The audio-true end: the last note has finished sounding, a horizon after it went out.
      onFinished: () => {
        if (!isCurrentRun(runKey, 'play') || songTimestamp !== song.timestamp) return;
        //notes the plan left out at the tail still have to be counted (an inaudible track's notes
        //produce no onSounding), which lands `current` on `rangeEnd`: the run consumed everything
        //up to it
        advanceCountingTo(rangeEnd - 1);
        functions.onSongFinished();
      },
    });
    playTransport = transport;
    transport.anchor({ events, finishS }, fromIndex, playbackLeadInMs / 1000);
    const anchorAudioTime = transport.anchorAudioTime;
    if (anchorAudioTime === null) return;

    /**
     * Notes cut off BEFORE the start whose span still covers it (playback resumed mid-note): each
     * is pressed at the anchor's own absolute audio time, entering its sample where the playhead
     * would have reached and holding for what is left of the span. This is the composer's
     * `pressSpansCoveringStart` rule with one difference it has to state: the composer leans on
     * its no-overlap invariant to know the nearest earlier same-(track, id) note is the only
     * possible coverer, and a RECORDED song may hold two notes of one id on one track at once. So
     * the backward scan's FIRST sighting is taken as the answer - the nearest earlier note is the
     * one the playhead is inside, and an older one still ringing underneath it is a doubling
     * nobody can pick out once resumed. Only presses resume: a one-shot's attack happened in the
     * past and cannot be meaningfully re-entered.
     */
    const anchorPlanS = events[fromIndex].atS;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<string>();
    for (let i = fromIndex - 1; i >= 0; i--) {
      const event = events[i];
      const key = `${event.trackIndex}:${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (event.kind !== 'press' || event.atS >= anchorPlanS) continue;
      const remainingS = event.atS + (event.durationMs ?? 0) / 1000 - anchorPlanS;
      if (remainingS <= 0) continue;
      functions.commitSongNote(
        { ...event, durationMs: remainingS * 1000 },
        plan.tracks[event.trackIndex],
        anchorAudioTime,
        (anchorPlanS - event.atS) * 1000
      );
    }
  }

  /**
   * PRACTICE. Returns where the cursor should start this run - the queue's first absolute note
   * index, which is not always the Section's `start` (see the dispatch) - or undefined when there
   * is nothing to practice.
   */
  function practiceSong(
    song: RecordedSong,
    start = 0,
    end?: number,
    runKey: number = playerStore.state.key
  ): number | undefined {
    mode = 'practice';
    activeRunKey = runKey;
    //TODO move this to the song class
    end = end ?? song.notes.length;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    //only notes this keyboard has a key for can ever be clicked, so only those may enter the
    //practice queue — a chunk holding an unclickable note would never complete. The sheet is built
    //from the same filtered list, so a frame and a queue chunk hold the same notes. Each surviving
    //note still draws at its own `displayButton` inside its frame.
    const notes = applySpeedChange(song.notes).filter(
      (note) => note.keyboardButton >= 0 && note.keyboardButton < keyboard.length
    );
    //ONE chunking for the WHOLE song (ADR-0010), pages and queue both cut from it: chunking the
    //Section's slice separately re-anchors the merge window at the seam, and two chunk lists that
    //disagree there make "which frame is current" unanswerable.
    const chunks = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    //what actually RUNS is still the Section alone, seam chunks trimmed by absolute index
    const queue = sectionQueue(chunks, start, end, sustainingTracks);
    // One entry per key inside each chunk (duplicateNotes.ts): two tracks doubling the same note
    // in one instant put two entries with the same `keyboardButton` in one chunk, but a click
    // splices out only ONE of them while the key's red mark clears either way - so the chunk kept
    // a leftover nothing on screen could point at, and practice stopped dead with every visible
    // note already clicked. Per chunk only: the same key in a later chunk is a real next press.
    // Applied to the pages AFTER the queue was cut, because the queue must trim before it dedupes.
    chunks.forEach((chunk) => {
      chunk.notes = dedupeChunkNotes(chunk.notes, sustainingTracks);
    });
    if (chunks.length === 0) return;
    playerControlsStore.setPages(groupArrayEvery(chunks, visualSheetSize));
    if (queue.length === 0) return;
    nextChunkDelay = 0;
    const firstChunk = queue[0];
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
    const secondChunk = queue[1];
    secondChunk?.notes.forEach((note) => {
      const keyboardNote = keyboard[note.keyboardButton];
      if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext');
      keyboardNote.setStatus('toClickNext');
    });
    functions.setHasSong(true);
    songToPractice = queue;
    return firstChunk.firstNoteIndex;
  }

  /**
   * PAUSE, the two halves of it. Not a run boundary: `stopSong` below is the teardown for every
   * transition BETWEEN runs and clears the sheet, the score and the queues along with the audio -
   * all of which belong to the run being paused and have to still be there when it resumes. So the
   * two modes with a clock of their own each give up only that clock.
   *
   * `pausedRunKey` is the run the pause was taken on, and every guard below is keyed by it: a
   * transport command clears `paused` as a side effect (see PlayerStore), so without it stopping
   * or picking another song while paused would read as a resume and re-anchor the run that was
   * just replaced.
   */
  let pausedRunKey: number | null = null;

  function pauseRun() {
    const runKey = playerStore.state.key;
    if (isCurrentRun(runKey, 'play')) {
      pausedRunKey = runKey;
      //the same three steps as a stop (ADR-0006/0009) and for the same reason - the transport
      //never touches audio, so an uncancelled pause leaks the whole committed horizon - just
      //without the run teardown around them
      playTransport?.stop();
      playTransport = null;
      functions.cancelScheduledSounds();
      functions.releaseAllSounds();
      //song flashes and their release rings belong to notes that are no longer coming
      playerStore.resetKeyboardLayout();
      return;
    }
    //approaching owns nothing but its tick: the circles keep their positions, the queue keeps its
    //order and the score keeps its count, so stopping the clock IS the pause
    if (isCurrentRun(runKey, 'approaching')) {
      pausedRunKey = runKey;
      setTicker(false);
    }
  }

  function resumeRun() {
    const runKey = pausedRunKey;
    pausedRunKey = null;
    if (runKey === null) return;
    if (isCurrentRun(runKey, 'approaching')) return setTicker(true, runKey);
    if (!isCurrentRun(runKey, 'play')) return;
    //PLAY RESUMES BY RE-ANCHORING, because the transport it lost was committed to absolute audio
    //times: the seek path is what already knows how to enter a run part-way (mid-span notes
    //resumed at the anchor, ADR-0009) and it leaves the Section the user drew alone (ADR-0010).
    //`current` is the note that has NOT sounded yet, which is exactly where the ear stopped.
    const runEnd = playerControlsStore.state.runEnd || playerControlsStore.size;
    const current = playerControlsStore.current;
    //a run paused after it had already finished has nothing left to resume - play it again from
    //the Section's own start instead, which is what the restart button does
    if (current >= runEnd) return void restartSong();
    playerStore.seek(current, runEnd);
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
    //the run a pause was taken on is gone, so nothing may resume it (the store's own flag is
    //already cleared by whichever command brought us here)
    pausedRunKey = null;
    approachCountdown = null;
    songTimestamp = 0;
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
    heldVisualPresses.clear();
    //releaseAllSounds() below stops every voice these numbers name, and the notes they are keyed
    //by belong to the layout about to be replaced
    heldNumbers.clear();
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
    //STOP IS THREE STEPS IN THIS ORDER (ADR-0006/0009). The transport stops advancing but never
    //touches audio, so the committed window has to be retracted here - with a ~1 s horizon an
    //uncancelled stop leaks a full second of runaway notes - and only then is what is already
    //sounding faded, which is a release rather than a cancellation: started audio always rings out.
    playTransport?.stop();
    playTransport = null;
    functions.cancelScheduledSounds();
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
        //the span of the chunk being cleared, read BEFORE the splice can empty it: both the
        //in-chunk advance and the finished-run cursor below are clamped to it
        const clearingChunkLast = songToPractice[0].lastNoteIndex;
        const [clicked] = songToPractice[0].notes.splice(clickedNoteIndex, 1);
        if (songToPractice[0].notes.length === 0) {
          songToPractice.shift();
          //CHUNK DONE: the cursor jumps to the next queue chunk's first absolute note, rather than
          //counting one per click. Notes the filter dropped, a dedupe removed or the seam trim cut
          //all sit inside the span just completed, and counting would leave the highlight stranded
          //behind by exactly those. With the queue emptied it lands on the run's exclusive end
          //instead, which is where the slider's progress line has to reach; the store's `runEnd`
          //lookup clamp is what keeps the highlight on the last frame actually played.
          const nextChunk = songToPractice[0];
          playerControlsStore.advanceCurrentTo(
            nextChunk ? nextChunk.firstNoteIndex : playerControlsStore.state.runEnd
          );
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
        //a click inside an unfinished chunk moves the cursor past the note it cleared, but NEVER
        //past the chunk itself: the notes of a chunk can be cleared in any order, and clearing the
        //last-indexed one first would otherwise derive the next frame while this one still has
        //notes to press. The completion branch above is what moves the highlight off a frame.
        playerControlsStore.advanceCurrentTo(
          Math.min(clicked.absoluteIndex + 1, clearingChunkLast)
        );
      }
    }
  }

  /**
   * The VISUAL half of a song note reaching the ear: light the key it lands on and schedule it
   * back off. Split out of `handleClick` because a song note's sound is now committed to the
   * audio clock ahead of time (ADR-0009) while its flash belongs to the instant it is heard - the
   * two are no longer one moment. A free-play press is still both at once, and stays in
   * `handleClick`.
   */
  function flashSongNote(note: ObservableNote, songNote: RecordedNote) {
    const prevStatus = note.status;
    playerStore.setNoteState(note, {
      status: 'clicked',
      delay: 0,
      holdMs: 0,
      holdTimerMs: 0,
      holdTimerId: note.data.holdTimerId + 1,
      animationId: data.hasAnimation ? Math.floor(Math.random() * 10000) + Date.now() : 0,
    });
    //a re-press before the previous flash expired must not be unlit by the old timer
    const pendingReset = timeouts.get(note);
    if (pendingReset) clearTimeout(pendingReset);
    //the key stays lit for as long as the note is held where its track can sustain, never less
    //than the plain tap animation
    const holdDuration = sustainingTracks[songNote.trackIndex] ? songNote.duration : 0;
    scheduleStatusReset(note, prevStatus, Math.max(game.notes.animationDelayMs, holdDuration));
  }

  function handleClick(note: ObservableNote) {
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
    //the engine speaks Note Numbers: play what THIS key enters at the player's Basepoint, not
    //whatever the sounding instrument keeps at the same button
    const number = note.numberAt(data.pitch);
    //every press through here is a LIVE one, and a live press is the kind that is released by
    //hand — so it books the number handleRelease will hand back
    heldNumbers.set(note, number);
    functions.playSound(number);
    if (ownsCurrentRun && mode === 'approaching' && playerStore.eventType === 'approaching') {
      const status = handleApproachClick(note);
      playerStore.setNoteState(note, { status });
      if (status === 'approach-wrong') playerControlsStore.increaseScore(false);
    }
    //TODO could add this to the player store
    const pendingReset = timeouts.get(note);
    if (pendingReset && playerStore.eventType === 'play') clearTimeout(pendingReset);
    if (data.instrument.supportsSustain) {
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
    //A context rebuild resets the audio clock to zero, and this run's anchor and commit
    //watermarks are absolute times taken from the old one - it would sit waiting on a timestamp
    //the new clock reaches minutes from now, or never. Every note it committed died with the old
    //context too, so there is no run left to salvage: end it here, while the old context is still
    //open and cancelScheduledSounds can still retract what it queued.
    cleanup.push(
      AudioProvider.onContextTeardown(() => {
        if (data.hasSong) stopAndClear();
      })
    );
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
        // A COMMAND ISSUED WHILE PAUSED STAYS PAUSED. `seek` and `restartSong` carry the flag
        // through (see PlayerStore's `paused`), so "Go to here" and the Section edits that restart
        // through it re-aim a paused run without sounding it. The run is still set up in FULL -
        // sheet, cursor, queue, score - and only its clock is withheld, so the play button has an
        // ordinary paused run to resume.
        const startsPaused = state.paused;
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
            data.songDisplayInstrument.name,
            lostReference.pitch,
            //the Basepoint the keyboard on screen SOUNDS at: `data.pitch` is the player's own
            //(which loading the song has already set to the song's), plus track 0's override, since
            //this keyboard follows track 0 (displayInstrument.ts) and Player.svelte sounds that
            //track through the same override
            effectiveTrackPitch(songInstruments[0], data.pitch)
          );
          //...and stamp each note's position in THIS run's note list (ADR-0010), the space
          //`playerControlsStore.current` counts in. Here is the only place it provably equals the
          //index the plan's `noteIndex` and the Section's start/end address, because it is before
          //every slice, filter, dedupe and clone the three modes apply below.
          lostReference.notes.forEach((note, index) => {
            note.absoluteIndex = index;
          });

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
          //the Section this run publishes, and the one case where the run range is NOT it: a seek
          //("Go to here") runs an arbitrary range while the bounds the user drew stay put (ADR-0010)
          const section = state.preservesSection ? {} : { position: start, end };
          //...and `runEnd` is published UNCONDITIONALLY, unlike the pair above: it is the RUN's
          //bound, so a seek run has to overwrite the previous one's rather than inherit it
          if (end === start || !hasPlayableNotes) {
            playerControlsStore.setState({
              size: lostReference.notes.length,
              ...section,
              runEnd: end,
              current: start,
            });
            return;
          }
          //where the cursor STARTS this run. `start` for every mode but practice, whose queue can
          //begin later than the Section does: a seam chunk trimmed to nothing (its notes were
          //duplicates, or unplayable) is dropped, and a cursor left on the Section's own start
          //would highlight a frame the run never asks the user to play.
          let runCurrent = start;
          if (type === 'play') {
            playSong(lostReference, start, end, runKey, startsPaused);
          }
          if (type === 'practice') {
            //practice has no clock of its own - its notes wait for the user either way - so it is
            //the one mode with nothing a pause could withhold (see `pauseRun`)
            runCurrent = practiceSong(lostReference, start, end, runKey) ?? start;
          }
          if (type === 'approaching') {
            approachingSong(lostReference, start, end, runKey, startsPaused);
          }
          //`stopSong` above cleared the key the previous pause was taken on; this run now owns the
          //pause, and is what the next un-pause edge resumes
          if (startsPaused && type !== 'practice') pausedRunKey = runKey;
          functions.setHasSong(true);
          Analytics.songEvent({ type });
          playerControlsStore.setState({
            size: lostReference.notes.length,
            ...section,
            runEnd: end,
            current: runCurrent,
          });
        }
      }, 4);
    });

    /**
     * PAUSE gets an effect of its own rather than a branch inside the dispatch above: that one
     * tracks `key`/`playId` and tears the whole run down on every fire, which is the one thing a
     * pause must not do (see PlayerStore's `paused`).
     */
    $effect(() => {
      const paused = playerStore.state.paused;
      //everything the two halves read - the run key, the event type, the cursor - is state they
      //must not be woken BY; only the flag itself is a dependency of this effect
      untrack(() => (paused ? pauseRun() : resumeRun()));
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
      //a run left committed on unmount keeps sounding for up to a horizon after the page is gone
      //(Instrument.dispose ends VOICES, not one-shots already handed to the audio clock), so the
      //window is retracted here as well as on the stop path
      playTransport?.stop();
      playTransport = null;
      functions.cancelScheduledSounds();
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

{#if approachCountdown !== null}
  <div class="approach-countdown" role="status" aria-live="polite" aria-atomic="true">
    {#key approachCountdown}
      <span>{approachCountdown}</span>
    {/key}
  </div>
{/if}

<style>
  :global(.keyboard-wrapper) {
    position: relative;
  }

  .approach-countdown {
    position: fixed;
    inset: max(1rem, env(safe-area-inset-top)) 0 auto;
    z-index: 42;
    display: flex;
    justify-content: center;
    pointer-events: none;
    color: var(--background-text);
  }

  .approach-countdown span {
    font-size: clamp(5rem, 18vmin, 10rem);
    font-weight: bold;
    line-height: 1;
    text-shadow:
      0 0 0.3rem var(--background),
      0 0 1rem var(--background);
    animation: approach-countdown-pulse 0.23s ease-out;
  }

  @keyframes approach-countdown-pulse {
    from {
      opacity: 0;
      transform: scale(1.35);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .approach-countdown span {
      animation: none;
    }
  }
</style>
