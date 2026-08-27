// key/playId are incremented on every play/practice/approaching/switchMode/resetSong/restartSong
// call - the Player/PlayerKeyboard components key off these to force a fresh render even when the
// rest of state is unchanged.
//
// state.song holds a raw ComposedSong/RecordedSong class instance inside a $state-wrapped
// object. $state's deep-reactivity only wraps plain objects/arrays (and Map/Set/Date) - a class
// instance with a custom prototype is stored by reference, unproxied. instanceof
// RecordedSong/ComposedSong checks on playerStore.song downstream therefore see the real
// instance, not a proxy.
import { NOTE_ANIMATION_DELAY_MS } from '$core/legacyConfig';
import { type NoteDataState, ObservableNote } from '$lib/audio/Instrument.svelte';
import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
import { RecordedSong } from '$core/Songs/RecordedSong';

type eventType = 'play' | 'practice' | 'approaching' | 'stop';
type SongTypes = RecordedSong | ComposedSong | null;
type SongTypesNonNull = RecordedSong | ComposedSong;
type PlayerStoreState = {
  key: number;
  song: SongTypes;
  playId: number;
  eventType: eventType;
  start: number;
  end: number;
  /**
   * A SEEK IS NOT A SECTION EDIT (ADR-0010). `start`/`end` are what the next run consumes, and the
   * dispatch normally publishes them back as the Section the slider and the Sheet Frames draw -
   * the two are the same pair of numbers for every ordinary run. "Go to here" breaks that for one
   * run: it runs from an arbitrary frame (to the song's end, if the target is already past the
   * Section) while the Section the user drew must stay exactly where it is. Set by the two commands
   * that aim a run at a position rather than at the Section - `seek` and `switchMode`.
   */
  preservesSection: boolean;
  /**
   * PAUSE IS NOT A TRANSPORT COMMAND. Nothing about WHAT runs changes, so `key`/`playId`
   * deliberately stay put and no run is dispatched: PlayerKeyboard is what acts on this, freezing
   * the run that is already going (play mode drops its transport and re-anchors from the cursor
   * through the seek path when it comes back, approaching just stops its tick).
   *
   * PAUSE OUTLIVES A RE-AIM, NOT A RE-CHOICE. `play`/`practice`/`approaching`/`switchMode`/
   * `resetSong` pick what runs and always clear it; `seek` and `restartSong` only move an existing
   * run's range ("Go to here", a Section edit, a speed change) and CARRY IT THROUGH - a user who
   * paused asked for silence, and re-aiming the sheet is not a request to hear it again. PlayerKeyboard's
   * dispatch is what honours that: it sets the run up in full and leaves its clock stopped.
   */
  paused: boolean;
};

class PlayerStore {
  state: PlayerStoreState = $state({
    key: 0,
    song: null,
    playId: 0,
    eventType: 'stop',
    start: 0,
    end: 0,
    preservesSection: false,
    paused: false,
  });
  /**
   * The notes currently on the player's keyboard, in the displayed instrument's authored
   * Button order — the array handed straight to the Shape (ADR-0005 §1), which owns where
   * each one is drawn. A position in it is a Button OF THE DISPLAYED INSTRUMENT, so the only
   * song-side coordinate it pairs with is `RecordedNote.keyboardButton` (never
   * `displayButton`, which speaks the note's own track's Buttons); per-note STATE is
   * addressed by the note object (`setNoteState` below), never by that position.
   */
  keyboard: ObservableNote[] = $state([]);

  get song(): RecordedSong | ComposedSong | null {
    return this.state.song;
  }

  get eventType(): eventType {
    return this.state.eventType;
  }

  get start(): number {
    return this.state.start;
  }

  get paused(): boolean {
    return this.state.paused;
  }

  setKeyboardLayout = (keyboard: ObservableNote[]) => {
    this.keyboard.splice(0, this.keyboard.length, ...keyboard);
  };
  resetKeyboardLayout = () => {
    this.keyboard.forEach((note) =>
      note.setState({
        status: '',
        delay: NOTE_ANIMATION_DELAY_MS,
        animationId: 0,
        holdMs: 0,
        holdTimerMs: 0,
        // Invalidate a release ring which the browser may still have in flight while this state
        // reset and the next run are painted in the same frame.
        holdTimerId: note.data.holdTimerId + 1,
      })
    );
  };
  resetOutgoingAnimation = () => {
    this.keyboard.forEach((n) => n.setState({ animationId: 0 }));
  };
  /**
   * Per-note UI state, addressed BY THE NOTE (ADR-0005 §3): the caller already holds the
   * object — the snippet hands it out, key/MIDI resolution returns it, and song playback
   * looks it up once through `keyboard[keyboardButton]` — so nothing has to re-derive a
   * position, and a layout republished between the lookup and the write can no longer
   * land the state on whatever note now sits at that index.
   */
  setNoteState = (note: ObservableNote, state: Partial<NoteDataState>) => {
    note.setState(state);
  };
  setState = (state: Partial<PlayerStoreState>) => {
    Object.assign(this.state, state);
  };
  /**
   * A transport command is also a keyboard-UI boundary. Clear the CURRENTLY published layout
   * synchronously, before changing the event state: Player.svelte may replace that layout in its
   * reaction to the new song, and the debounced PlayerKeyboard teardown would then only see the
   * replacement. Clearing here prevents practice hints, held rings and click animations from
   * being stranded on the outgoing layout and resurfacing in a later mode/song combination.
   */
  prepareTransition = () => {
    this.resetKeyboardLayout();
  };
  play = (song: SongTypesNonNull, start: number = 0, end?: number) => {
    this.prepareTransition();
    this.setState({
      song,
      start,
      eventType: 'play',
      end,
      preservesSection: false,
      paused: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
    this.prepareTransition();
    this.setState({
      song,
      start,
      eventType: 'practice',
      end,
      preservesSection: false,
      paused: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
    this.prepareTransition();
    this.setState({
      song,
      start,
      eventType: 'approaching',
      end,
      preservesSection: false,
      paused: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  resetSong = () => {
    this.prepareTransition();
    this.setState({
      song: null,
      eventType: 'stop',
      start: 0,
      end: 0,
      preservesSection: false,
      paused: false,
      key: this.state.key + 1,
      playId: 0,
    });
  };
  restartSong = (start: number, end: number) => {
    this.prepareTransition();
    //`paused` deliberately absent - a restart re-aims the run that is already chosen, so it keeps
    //whatever the play/pause button last said (see `paused`)
    this.setState({
      start,
      end,
      preservesSection: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  /**
   * Freeze / unfreeze the run that is already going - see `paused`. Deliberately NOT a run
   * dispatch: the sheet, the Section, the cursor and (in approaching) the score all belong to the
   * run being paused and have to survive it, which is exactly what the commands above destroy.
   */
  setPaused = (paused: boolean) => {
    this.setState({ paused });
  };
  togglePause = () => {
    this.setPaused(!this.state.paused);
  };
  /**
   * SEEK-SHAPED, BUT A RE-CHOICE. The mode switcher aims the run the same way `seek` does - it
   * runs [start, end) and leaves the Section the user drew exactly where it is (`preservesSection`,
   * ADR-0010), because switching mode mid-song is not a Section edit - but unlike a seek it changes
   * WHAT runs, so it belongs with `play`/`practice`/`approaching` on the other question: `paused` is
   * cleared, since a user asking for another mode is asking to hear/play it, not to keep the silence
   * they asked of the previous one (see `paused`).
   *
   * `song` is deliberately untouched: the switcher only exists while a run is active, so the caller
   * already guarantees a loaded song, and rewriting it would be a second answer to "which song".
   */
  switchMode = (eventType: 'play' | 'practice' | 'approaching', start: number, end: number) => {
    this.prepareTransition();
    this.setState({
      eventType,
      start,
      end,
      preservesSection: true,
      paused: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  /**
   * Restart the current run over [start, end) without publishing that range as the Section - see
   * `preservesSection`. The mode is whatever is already running.
   */
  seek = (start: number, end: number) => {
    this.prepareTransition();
    //...and neither does this one clear `paused`: "Go to here" on a paused run moves where it will
    //resume from, it does not resume it. Resuming is the other direction - the play button clears
    //the flag first, and PlayerKeyboard's resume is what calls this.
    this.setState({
      start,
      end,
      preservesSection: true,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
}

export const playerStore = new PlayerStore();
