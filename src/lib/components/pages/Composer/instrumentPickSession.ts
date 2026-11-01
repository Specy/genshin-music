// THE LAYER PANEL'S INSTRUMENT PICKS AS ONE AUDITION, in one pixi-free, DOM-free module.
//
// A pick from the panel's instrument <select> is a whole ComposedSong.setInstrument, and since
// ADR-0007 a swap rewrites the track's Note Numbers. Picks come in runs: a user auditions Piano ->
// Handpan -> Harp -> back to Piano. (One pick per focus of the <select>, so not a keyboard sweep:
// InstrumentSelect blurs itself after every change.) Composed one after another, every hop is a
// separate rewrite, and a hop that cannot be undone exactly by the next one leaves the track
// somewhere the user never asked for - which is how a reporter lost a song's low notes an octave up on
// 2026-11-01 (noteNumberTransforms.rewriteForSwap now inverts itself between rigid instruments;
// this is the second half of that fix, for the instruments it cannot, and for the history).
//
// SO EACH PICK SWAPS FROM THE INSTRUMENT THE RUN STARTED ON: while the previous pick of this
// session is still the Step the history stands on (nothing landed since), it is UNDONE first and
// the new pick is made from the restored track. One Undo Step per run, however many instruments
// were passed through, and picking the original back leaves no Step at all - the song is exactly
// what it was, Savepoint included. The undone pick is WITHDRAWN, not left on the redo stack: a
// redo that re-made an audition the user backed out of would be a trap. (Whatever redo branch the
// user had before the run died at its first pick, as it does at any edit.)
//
// THE RUN ENDS on anything that is not another pick of the same layer: the panel closing or opening
// (Composer.svelte resets the session from onSettingsOpenChange), another layer's pick, or any edit
// that lands a Step of its own (a note, a volume drag), which the identity check sees without being
// told. After that the next pick is an ordinary swap from wherever the track now is.
//
// SAME DISCIPLINE AS columnRuler.ts beside it - no pixi, no DOM, and no component state: the
// composer owns one session and hands it the song, so a plain vitest can drive the whole rule.

import type { ComposedSong, ComposedSongHistory } from '$core/Songs/ComposedSong.svelte';
import type { InstrumentData } from '$core/Songs/SongClasses';

type Step = NonNullable<ComposedSongHistory['lastStep']>;

export class InstrumentPickSession {
  /** The layer the run is on; -1 when there is no run. */
  #layer = -1;
  /** The Step the run's latest pick landed, by identity; null when there is nothing to replace. */
  #step: Step | null = null;

  /** End the run: the next pick swaps from wherever the track is. */
  reset() {
    this.#layer = -1;
    this.#step = null;
  }

  /**
   * Apply one layer-panel edit. A PICK (the name changed) that continues the run replaces the
   * run's previous pick; every other edit - volume, alias, Basepoint override, a pick that starts
   * a run - is setInstrument exactly as the panel asked for it.
   */
  apply(song: ComposedSong, index: number, instrument: InstrumentData) {
    const previous = song.instruments[index];
    const isPick = previous !== undefined && previous.name !== instrument.name;
    if (!isPick) {
      this.reset();
      song.setInstrument(index, instrument);
      return;
    }
    const history = song.history;
    const withdrawn = this.#step;
    const continuesRun =
      history !== null &&
      this.#layer === index &&
      withdrawn !== null &&
      history.lastStep === withdrawn;
    if (continuesRun) {
      //back to the track the run started on, notes and roster entry both, by the Step's own
      //inverse - not by swapping back, which is the lossy composition this exists to avoid.
      //No cursor jump and no walk side effects: the composer's edit funnel follows this call
      song.undo();
      history.forgetRedoStep(withdrawn);
      const origin = song.instruments[index];
      if (origin === undefined || origin.name === instrument.name) {
        //picked the original back: the undo WAS the edit
        this.#step = null;
        return;
      }
      //from the ORIGIN's entry, so nothing of the undone pick survives into this one; the
      //pick only ever changes the name (and, with it, the instrument's own settings)
      song.setInstrument(index, origin.withInstrument(instrument.name));
    } else {
      song.setInstrument(index, instrument);
    }
    this.#layer = index;
    //null when no history is attached or a group swallowed the Step: then there is nothing this
    //session can safely undo, and the next pick simply starts a new run
    this.#step = history?.lastStep ?? null;
  }
}
