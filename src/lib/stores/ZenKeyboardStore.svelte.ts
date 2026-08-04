import { NOTE_ANIMATION_DELAY_MS } from '$core/legacyConfig';
import { type NoteDataState, ObservableNote } from '$lib/audio/Instrument.svelte';
import type { NoteStatus } from '$core/types';

class ZenKeyboardStore {
  keyboard: ObservableNote[] = $state([]);

  setKeyboardLayout = (keyboard: ObservableNote[]) => {
    this.keyboard.splice(0, this.keyboard.length, ...keyboard);
  };
  animateNote = (index: number, status?: NoteStatus) => {
    this.keyboard[index].triggerAnimation(status);
  };
  resetKeyboardLayout = () => {
    this.keyboard.forEach((note) =>
      note.setState({
        status: '',
        delay: NOTE_ANIMATION_DELAY_MS,
      })
    );
  };
  resetOutgoingAnimation = () => {
    this.keyboard.forEach((n) => n.setState({ animationId: 0 }));
  };
  setNoteState = (index: number, state: Partial<NoteDataState>) => {
    this.keyboard[index].setState(state);
  };
}

export const zenKeyboardStore = new ZenKeyboardStore();
