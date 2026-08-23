// key/playId are incremented on every play/practice/approaching/resetSong/restartSong call - the
// Player/PlayerKeyboard components key off these to force a fresh render even when the rest of
// state is unchanged.
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
   * Section) while the Section the user drew must stay exactly where it is. Set only by `seek`.
   */
  preservesSection: boolean;
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

  setKeyboardLayout = (keyboard: ObservableNote[]) => {
    this.keyboard.splice(0, this.keyboard.length, ...keyboard);
  };
  resetKeyboardLayout = () => {
    this.keyboard.forEach((note) =>
      note.setState({
        status: '',
        delay: NOTE_ANIMATION_DELAY_MS,
        holdMs: 0,
        holdTimerMs: 0,
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
  play = (song: SongTypesNonNull, start: number = 0, end?: number) => {
    this.setState({
      song,
      start,
      eventType: 'play',
      end,
      preservesSection: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
    this.setState({
      song,
      start,
      eventType: 'practice',
      end,
      preservesSection: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
    this.setState({
      song,
      start,
      eventType: 'approaching',
      end,
      preservesSection: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  resetSong = () => {
    this.setState({
      song: null,
      eventType: 'stop',
      start: 0,
      end: 0,
      preservesSection: false,
      key: this.state.key + 1,
      playId: 0,
    });
  };
  restartSong = (start: number, end: number) => {
    this.setState({
      start,
      end,
      preservesSection: false,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
  /**
   * Restart the current run over [start, end) without publishing that range as the Section - see
   * `preservesSection`. The mode is whatever is already running.
   */
  seek = (start: number, end: number) => {
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
