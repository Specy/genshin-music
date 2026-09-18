import { NOTE_ANIMATION_DELAY_MS } from '$core/legacyConfig';
import { type NoteDataState, ObservableNote } from '$lib/audio/Instrument.svelte';
import type { NoteStatus } from '$core/types';

/**
 * The zen keyboard's live note list — the current instrument's notes, in authored order,
 * which is what the Shape is handed to draw (ADR-0005 §1).
 *
 * Per-note animation state is addressed through the NOTE OBJECT, never through an index
 * (ADR-0005): these are the very `ObservableNote`s the Shape hands back out of its `button`
 * snippet, so a surface always has the note itself in hand and no caller has to know where
 * this array (or the Shape) put it.
 */
class ZenKeyboardStore {
  keyboard: ObservableNote[] = $state([]);

  setKeyboardLayout = (keyboard: ObservableNote[]) => {
    this.keyboard.splice(0, this.keyboard.length, ...keyboard);
  };
  animateNote = (note: ObservableNote, status?: NoteStatus) => {
    note.triggerAnimation(status);
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
  setNoteState = (note: ObservableNote, state: Partial<NoteDataState>) => {
    note.setState(state);
  };
}

export const zenKeyboardStore = new ZenKeyboardStore();
