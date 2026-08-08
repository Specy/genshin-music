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
};

class PlayerStore {
  state: PlayerStoreState = $state({
    key: 0,
    song: null,
    playId: 0,
    eventType: 'stop',
    start: 0,
    end: 0,
  });
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
  setNoteState = (index: number, state: Partial<NoteDataState>) => {
    this.keyboard[index].setState(state);
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
      key: this.state.key + 1,
      playId: 0,
    });
  };
  restartSong = (start: number, end: number) => {
    this.setState({
      start,
      end,
      key: this.state.key + 1,
      playId: this.state.playId + 1,
    });
  };
}

export const playerStore = new PlayerStore();
