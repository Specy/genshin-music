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
  import { displayButtonForId } from '$core/Songs/noteIds';
  import type { Instrument, ObservableNote } from '$lib/audio/Instrument.svelte';
  import { RecordedSong, type Chunk } from '$core/Songs/RecordedSong';
  import { MIDIProvider, type MIDIEvent } from '$lib/providers/MIDIProvider';
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
      playSound: (index: number, songNote?: RecordedNote) => void;
      releaseSound: (index: number) => void;
      releaseAllSounds: () => void;
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
  let tickInterval: Timer = 0;
  let mounted = true;
  let songTimestamp = 0;
  let cleanup: (() => void)[] = [];
  let timeouts: Timer[] = [];
  let debouncedStateUpdate: Timer = 0;
  let mode: 'play' | 'practice' | 'approaching' | undefined = $state('play');
  let songToPractice: Chunk[] = [];
  let sustainingTracks: boolean[] = [];
  let approachingNotes: ApproachingNote[][] = $state(Array2d.from(game.notes.perColumn));
  // QUIRK: written once, never read again - dead field, preserved rather than removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let playTimestamp = Date.now();

  function setTicker(enabled: boolean) {
    if (enabled) {
      clearInterval(tickInterval);
      tickInterval = setInterval(tick, tickTime);
    } else {
      clearInterval(tickInterval);
    }
  }

  function handleMidi([eventType, note, velocity]: MIDIEvent) {
    if (!mounted) return;
    const instrument = data.hasSong ? data.songDisplayInstrument : data.instrument;
    //running-status zero-velocity note-on is the classic note-off alias
    const isRelease =
      MIDIProvider.isUp(eventType) || (MIDIProvider.isDown(eventType) && velocity === 0);
    if (isRelease) {
      const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note);
      keyboardNotes.forEach((keyboardNote) => {
        const observableNote = instrument.notes[keyboardNote.index];
        if (observableNote) handleRelease(observableNote);
      });
      return;
    }
    if (MIDIProvider.isDown(eventType)) {
      const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note);
      keyboardNotes.forEach((keyboardNote) => {
        handleClick(instrument.notes[keyboardNote.index]);
      });
    }
  }

  const handleKeyboard: ShortcutListener<'keyboard'> = async ({ event, shortcut }) => {
    if (event.repeat) return;
    if (!event.shiftKey) {
      const instrument = data.hasSong ? data.songDisplayInstrument : data.instrument;
      const note = instrument.getNoteFromCode(shortcut.name);
      if (note !== null) handleClick(note);
    }
  };

  //release unconditionally (even if shift is down by now) — releasing an unheld button is a no-op
  const handleKeyboardRelease: ShortcutListener<'keyboard'> = ({ shortcut }) => {
    const instrument = data.hasSong ? data.songDisplayInstrument : data.instrument;
    const note = instrument.getNoteFromCode(shortcut.name);
    if (note !== null) handleRelease(note);
  };

  async function approachingSong(song: RecordedSong, start = 0, end?: number) {
    mode = 'approaching';
    setTicker(true);
    end = end ?? song.notes.length;
    const { speedChanger } = data;
    const notes: ApproachingNote[] = [];
    approachRate = data.approachRate || 1500;
    const startDelay = approachRate;
    const startOffset = song.notes[start] !== undefined ? song.notes[start].time : 0;
    for (let i = start; i < end && i < song.notes.length; i++) {
      const note = song.notes[i];
      //stranded/out-of-grid notes can't be practiced — skip (they were unplayable rows before too)
      if (note.displayButton < 0 || note.displayButton >= game.notes.perColumn) continue;
      const obj = new ApproachingNote({
        time: Song.roundTime((note.time - startOffset) / speedChanger.value + startDelay),
        index: note.displayButton,
        //durations scale with playback speed like the times do (matches applySpeedChange)
        duration: sustainingTracks[note.trackIndex] ? note.duration / speedChanger.value : 0,
      });
      notes.push(obj);
    }
    await delay(2000); //add an initial delay to let the user prepare
    // QUIRK: playerControlsStore.setSong(song) is intentionally left commented out - nothing
    // reads the stored song, kept as-is rather than deleted or reinstated.
    //playerControlsStore.setSong(song)
    playerControlsStore.clearPages();
    playerControlsStore.resetScore();
    approachingNotes = Array2d.from(game.notes.perColumn);
    approachingNotesList = notes;
  }

  function tick() {
    if (!data.hasSong || mode !== 'approaching') return;
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
    if (playerControlsStore.current + removed === playerControlsStore.size) {
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

  //live presses currently held down, with what to restore when they lift.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only; the visible status lives in playerStore
  const heldVisualPresses = new Map<number, { prevStatus: NoteStatus; pressedAt: number }>();

  function scheduleStatusReset(noteIndex: number, prevStatus: NoteStatus, delayMs: number) {
    const keyboard = playerStore.keyboard;
    timeouts[noteIndex] = setTimeout(() => {
      timeouts[noteIndex] = 0;
      if (!['clicked', 'approach-wrong', 'approach-correct'].includes(keyboard[noteIndex].status))
        return;
      if (prevStatus === 'toClickNext')
        return playerStore.setNoteState(noteIndex, { status: prevStatus });
      playerStore.setNoteState(noteIndex, { status: '' });
    }, delayMs);
  }

  function handleRelease(note: ObservableNote) {
    if (!note) return;
    functions.releaseSound(note.index);
    const held = heldVisualPresses.get(note.index);
    if (held) {
      heldVisualPresses.delete(note.index);
      //stay lit at least as long as a quick tap used to (the press animation length)
      const remaining = Math.max(0, game.notes.animationDelayMs - (Date.now() - held.pressedAt));
      scheduleStatusReset(note.index, held.prevStatus, remaining);
    }
  }

  async function playSong(song: RecordedSong, start = 0, end?: number) {
    mode = 'play';
    end = end ?? song.notes.length;
    songTimestamp = song.timestamp;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    const notes = applySpeedChange(song.notes).slice(start, end);
    if (notes.length === 0) return;
    const mergedNotes = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    playerControlsStore.setPages(groupArrayEvery(mergedNotes, visualSheetSize));
    await delay(200); //add small start offset
    const startOffset = notes[0].time;
    let previous = startOffset;
    let delayOffset = 0;
    let startTime = Date.now();
    let chunkPlayedNotes = 0;
    for (let i = 0; i < notes.length; i++) {
      const delayTime = notes[i].time - previous;
      previous = notes[i].time;
      if (delayTime > 16) await delay(delayTime + delayOffset);
      if (!mounted || songTimestamp !== song.timestamp) return;
      const keyboardNote = keyboard[notes[i].displayButton];
      if (keyboardNote) handleClick(keyboardNote, notes[i]);
      else functions.playSound(-1, notes[i]);
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
    if (!mounted || songTimestamp !== song.timestamp) return;
    functions.onSongFinished();
  }

  function practiceSong(song: RecordedSong, start = 0, end?: number) {
    mode = 'practice';
    //TODO move this to the song class
    end = end ?? song.notes.length;
    const keyboard = playerStore.keyboard;
    const { visualSheetSize } = data;
    const notes = applySpeedChange(song.notes)
      .slice(start, end)
      .filter((note) => note.displayButton >= 0 && note.displayButton < keyboard.length);
    const chunks = RecordedSong.mergeNotesIntoChunks(notes.map((n) => n.clone()));
    if (chunks.length === 0) return;
    nextChunkDelay = 0;
    const firstChunk = chunks[0];
    firstChunk.notes.forEach((note) => {
      playerStore.setNoteState(note.displayButton, {
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
      const keyboardNote = keyboard[note.displayButton];
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
    songTimestamp = 0;
    timeouts.forEach(clearTimeout);
    timeouts = [];
    heldVisualPresses.clear();
    playerStore.resetKeyboardLayout();
    approachingNotesList = [];
    songToPractice = [];
    sustainingTracks = [];
    approachingNotes = Array2d.from(game.notes.perColumn);
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
    const approachingNote = approachingNotes[note.index][0];
    if (approachingNote) {
      approachingNote.clicked = true;
      if (approachingNote.time < approachRate / 3) return 'approach-correct';
    }
    return 'approach-wrong';
  }

  function handlePracticeClick(note: ObservableNote) {
    const keyboard = playerStore.keyboard;
    if (songToPractice.length > 0) {
      const clickedNoteIndex = songToPractice[0]?.notes.findIndex(
        (e) => e.displayButton === note.index
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
            playerStore.setNoteState(note.displayButton, {
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
              const keyboardNote = keyboard[note.displayButton];
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
    const keyboard = playerStore.keyboard;
    const hasAnimation = data.hasAnimation;
    if (!note) return;
    const prevStatus = keyboard[note.index].status;
    playerStore.setNoteState(note.index, {
      status: 'clicked',
      delay: playerStore.eventType !== 'play' ? game.notes.animationDelayMs : 0,
      holdMs: 0,
      animationId:
        hasAnimation && playerStore.eventType !== 'approaching'
          ? Math.floor(Math.random() * 10000) + Date.now()
          : 0,
    });
    handlePracticeClick(note);
    functions.playSound(note.index, songNote);
    const status = handleApproachClick(note);
    if (playerStore.eventType === 'approaching') {
      playerStore.setNoteState(note.index, { status });
      if (status === 'approach-wrong') playerControlsStore.increaseScore(false);
    }
    //TODO could add this to the player store
    if (timeouts[note.index] && playerStore.eventType === 'play')
      clearTimeout(timeouts[note.index]);
    if (songNote) {
      const holdDuration = sustainingTracks[songNote.trackIndex] ? songNote.duration : 0;
      scheduleStatusReset(
        note.index,
        prevStatus,
        Math.max(game.notes.animationDelayMs, holdDuration)
      );
    } else if (data.instrument.supportsSustain) {
      //live press on a sustaining instrument: the button stays visually pressed until
      //handleRelease lifts it — clear any pending reset from a previous tap so it
      //can't unlight the hold
      if (timeouts[note.index]) clearTimeout(timeouts[note.index]);
      heldVisualPresses.set(note.index, { prevStatus, pressedAt: Date.now() });
    } else {
      //non-sustaining instruments keep the plain tap animation
      scheduleStatusReset(note.index, prevStatus, game.notes.animationDelayMs);
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
      const keyboard = playerStore.keyboard;
      [...heldVisualPresses.keys()].forEach((index) => {
        if (keyboard[index]) handleRelease(keyboard[index]);
      });
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
        const song = playerStore.song;
        const type = playerStore.eventType;
        await stopSong();
        if (!mounted) return;
        if (type === 'stop') {
          functions.setHasSong(false);
        } else {
          if (!song) return;
          const lostReference = song.isComposed ? song.toRecordedSong().clone() : song.clone();
          playerStore.setKeyboardLayout(data.songDisplayInstrument.notes);
          // Resolve each note's display button once, from its own track's instrument. The
          // full-size display keyboard keeps every game row available even when track 0 uses
          // a shorter instrument; truly unrenderable notes remain in the timing stream and
          // are skipped instead of changing the user's requested note range.
          const songInstruments = lostReference.instruments;
          sustainingTracks = songInstruments.map(
            (instrument) => game.instruments.data[instrument.name]?.sustain !== undefined
          );
          lostReference.notes.forEach((n) => {
            n.displayButton = displayButtonForId(songInstruments[n.trackIndex]?.name ?? '', n.id);
          });

          lostReference.timestamp = Date.now();
          const start = clamp(state.start, 0, lostReference.notes.length);
          const end = clamp(
            state.end || lostReference.notes.length,
            start,
            lostReference.notes.length
          );
          const hasPlayableNotes = lostReference.notes
            .slice(start, end)
            .some(
              (note) =>
                note.displayButton >= 0 &&
                note.displayButton < data.songDisplayInstrument.notes.length
            );
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
            playSong(lostReference, start, end);
          }
          if (type === 'practice') {
            practiceSong(lostReference, start, end);
          }
          if (type === 'approaching') {
            approachingSong(lostReference, start, end);
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
  const shape = $derived((data.hasSong ? data.songDisplayInstrument : data.instrument).shape);
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
    <div class="loading">{t('common:loading')}...</div>
  </div>
{:else}
  <ShapeKeyboard
    {shape}
    count={playerStore.keyboard.length}
    class={keyboardClass}
    style={wrapperStyle}
  >
    {#snippet button(index)}
      {@const note = playerStore.keyboard[index]}
      <PlayerNote
        {note}
        data={{
          approachRate,
          instrument: data.hasSong ? data.songDisplayInstrument.name : data.instrument.name,
        }}
        hideNote={hideNotes}
        approachingNotes={approachingNotes[note.index]}
        {handleClick}
        {handleRelease}
        noteText={(data.hasSong ? data.songDisplayInstrument : data.instrument).getNoteText(
          note.index,
          data.noteNameType,
          data.pitch
        )}
      />
    {/snippet}
  </ShapeKeyboard>
{/if}
