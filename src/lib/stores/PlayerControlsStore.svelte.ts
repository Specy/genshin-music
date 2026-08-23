import { Chunk, RecordedSong } from '$core/Songs/RecordedSong';
import { chunkIndexAt } from '$core/Songs/sectionChunks';
import type { ApproachingScore } from '$core/types';
import { clamp } from '$core/utils/Utilities';

interface PlayerControlsState {
  position: number;
  current: number;
  size: number;
  end: number;
  /**
   * The RUN's exclusive end - the Section's `end` for an ordinary run, its own range for a seek,
   * which is why the dispatch publishes it even when it leaves `position`/`end` alone. A finished
   * run leaves `current` ON it, so the slider's progress line can reach the end; the frame lookup
   * below is what keeps the highlight one note inside it. 0 means "no run has bounded this yet".
   */
  runEnd: number;
}

interface PagesState {
  /**
   * The WHOLE song's frames, paged (ADR-0010) - not the Section's. `position`/`end` bound what
   * runs, never what the sheet holds, so nothing here may assume page 0 is where the run starts.
   */
  pages: Chunk[][];
}

class PlayerControlsStore {
  state: PlayerControlsState = $state({
    position: 0,
    current: 0,
    size: 0,
    end: 0,
    runEnd: 0,
  });
  pagesState: PagesState = $state({
    pages: [],
  });
  score: ApproachingScore = $state({
    correct: 1,
    wrong: 1,
    score: 0,
    combo: 0,
  });

  /**
   * WHERE THE HIGHLIGHT IS, DERIVED - one lookup of `current` (an absolute `song.notes` position)
   * against the chunk spans, so the slider, the frames and anything asking "which chunk is this"
   * cannot disagree. The modes only ever move `current`; there is no chunk stepping to keep in
   * sync with it any more, and no assumption that chunk 0 is the run's first note.
   *
   * `globalChunkIndex` counts across pages (-1 when there are no pages); `chunkIndex` is the same
   * frame's index WITHIN its page, which is what the page renderer compares its each-index to.
   *
   * The run's bound is applied to the resulting FRAME, never to the note index: a finished run
   * parks `current` on `runEnd` so the slider's progress line reaches the end, and an unbounded
   * answer would then be the first frame AFTER the run - dimmed and never played. Clamping the
   * note index (`min(current, runEnd - 1)`) is not enough, because `chunkIndexAt` reaches FORWARD
   * over span gaps and practice/approaching cut their frames from playable notes only: a Section
   * whose tail notes have no key leaves `runEnd - 1` inside a gap, and the forward reach jumps it
   * into the frame past the run anyway. So the cap is the last frame the run touches - the last
   * one starting before `runEnd`. `chunkIndexAt` stays a pure span lookup; the run's bound is
   * applied here, at the one call site that has it.
   */
  cursor: { pageIndex: number; chunkIndex: number; globalChunkIndex: number } = $derived.by(() => {
    const { pages } = this.pagesState;
    const flat: Chunk[] = [];
    for (const page of pages) for (const chunk of page) flat.push(chunk);
    const { current, runEnd } = this.state;
    let globalChunkIndex = chunkIndexAt(flat, current);
    if (runEnd > 0) {
      let lastInRun = -1;
      for (let i = 0; i < flat.length; i++) if (flat[i].firstNoteIndex < runEnd) lastInRun = i;
      if (lastInRun >= 0) globalChunkIndex = Math.min(globalChunkIndex, lastInRun);
    }
    if (globalChunkIndex < 0) return { pageIndex: 0, chunkIndex: 0, globalChunkIndex: -1 };
    //pages are walked rather than divided by a page size: nothing guarantees a caller's pages are
    //all the same length, and the last one never is
    let remaining = globalChunkIndex;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (remaining < pages[pageIndex].length) {
        return { pageIndex, chunkIndex: remaining, globalChunkIndex };
      }
      remaining -= pages[pageIndex].length;
    }
    return { pageIndex: 0, chunkIndex: 0, globalChunkIndex: -1 };
  });

  /** The current frame's index inside `currentPage` (page-relative). */
  get currentChunkIndex(): number {
    return this.cursor.chunkIndex;
  }

  /** The current frame's index across ALL pages - the whole-song frame list's own index. */
  get currentGlobalChunkIndex(): number {
    return this.cursor.globalChunkIndex;
  }

  get currentPageIndex(): number {
    return this.cursor.pageIndex;
  }

  get currentPage(): Chunk[] {
    return this.pagesState.pages[this.cursor.pageIndex] ?? [];
  }

  get currentChunk(): Chunk | undefined {
    return this.currentPage[this.cursor.chunkIndex];
  }

  get position(): number {
    return this.state.position;
  }

  get current(): number {
    return this.state.current;
  }

  get size(): number {
    return this.state.size;
  }

  get end(): number {
    return this.state.end;
  }

  setSong = (song: RecordedSong) => {
    this.setState({
      size: song.notes.length,
      position: 0,
      current: 0,
    });
    this.setPages([]);
  };
  resetScore = () => {
    this.setScoreState({
      correct: 1,
      wrong: 1,
      score: 0,
      combo: 0,
    });
  };
  increaseScore = (correct: boolean, debuff?: number) => {
    const { score } = this;
    if (correct) {
      this.setScoreState({
        correct: score.correct + 1,
        combo: score.combo + 1,
        score: score.score + score.combo * (debuff ?? 1),
      });
    } else {
      this.setScoreState({
        wrong: score.wrong + 1,
        combo: 0,
      });
    }
  };
  setPages = (pages: Chunk[][]) => {
    //deep clone: the caller keeps chunking the same list for its own queue and splices it as the
    //user plays, and the sheet must not move with it
    this.setPagesState({ pages: pages.map((p) => p.map((c) => c.clone())) });
  };
  clearPages = () => {
    this.setPagesState({ pages: [] });
  };
  setState = (state: Partial<PlayerControlsState>) => {
    Object.assign(this.state, state);
  };
  setScoreState = (state: Partial<ApproachingScore>) => {
    Object.assign(this.score, state);
  };
  setPagesState = (state: Partial<PagesState>) => {
    Object.assign(this.pagesState, state);
  };
  setPosition = (position: number) => {
    this.setState({ position });
  };
  /**
   * SECTION BOUNDS, CHOSEN-BOUND-WINS (ADR-0010). A bound set from a Sheet Frame lands where it was
   * asked to and pushes its partner to the extreme it would have crossed (end -> song length,
   * start -> 0); the slider's thumbs clamp against each other instead, and the difference is
   * deliberate - a thumb is dragged against a visible partner, while a click on a distant frame
   * that silently did nothing reads as breakage, and two clicks must be enough to move the Section
   * anywhere on the sheet. Neither touches `current`: setting a bound never restarts the run.
   */
  setSectionStart = (position: number) => {
    const start = clamp(position, 0, this.size);
    this.setState({ position: start, end: start >= this.end ? this.size : this.end });
  };
  setSectionEnd = (end: number) => {
    const bound = clamp(end, 0, this.size);
    this.setState({ end: bound, position: bound <= this.position ? 0 : this.position });
  };
  /**
   * Move the cursor FORWARD to `current`; a lower value is ignored. Within one run `current` is
   * monotonic - a note clicked out of order in practice, a circle that expires after a later one,
   * or a play note the plan reached late must never pull the highlight back over ground already
   * covered. Only a run dispatch resets it, through `setState`/`setCurrent`.
   */
  advanceCurrentTo = (current: number) => {
    if (current > this.current) this.setState({ current });
  };

  setCurrent = (current: number) => {
    this.setState({ current });
  };
  setEnd = (end: number) => {
    this.setState({ end });
  };
  setSize = (size: number) => {
    this.setState({ size });
  };
}

export const playerControlsStore = new PlayerControlsStore();
