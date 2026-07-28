import { VsrgSong } from '$core/Songs/VsrgSong';

export type KeyboardKey = {
  key: string;
  index: number;
  isPressed: boolean;
};
export type VsrgPlayerSongEventType = 'play' | 'stop';
export type VsrgPlayerSong = {
  song: VsrgSong | null;
  type: VsrgPlayerSongEventType;
};
export type VsrgKeyboardPressType = 'down' | 'up';
export type VsrcPlayerKeyboardCallback = {
  callback: (key: KeyboardKey, type: VsrgKeyboardPressType) => void;
  id: string;
};
export type VsrgPlayerHitType = 'amazing' | 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export type VsrgLatestScore = {
  timestamp: number;
  type: VsrgPlayerHitType | '';
  combo: number;
};

export type VsrgPlayerScore = {
  scoreVisible: boolean;
  combo: number;
  score: number;
  amazing: number;
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
  lastScore: VsrgLatestScore;
};
const baseScoreMap = {
  amazing: 300,
  perfect: 200,
  great: 100,
  good: 50,
  bad: 25,
  miss: 0,
};

export type VsrgPlayerEvent = 'fpsChange';
type VsrgPlayerCallback = {
  callback: (data: VsrgPlayerEvent) => void;
  id: string;
};

class VsrgPlayerStore {
  keyboard: KeyboardKey[] = $state([]);
  currentSong: VsrgPlayerSong = $state({
    song: null,
    type: 'stop',
  });
  score: VsrgPlayerScore = $state({
    scoreVisible: false,
    combo: 0,
    score: 0,

    amazing: 0,
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    lastScore: {
      timestamp: 0,
      type: '',
      combo: 0,
    },
  });
  // Deliberately plain arrays, not $state: neither is ever read from a template/$derived/$effect
  // - they only exist to be pushed/filtered/iterated imperatively by
  // addEventListener/removeEventListener/emitEvent and the keyboard-listener trio.
  private listeners: VsrgPlayerCallback[] = [];
  private keyboardListeners: VsrcPlayerKeyboardCallback[] = [];

  setLayout = (layout: string[]) => {
    this.keyboard.splice(
      0,
      this.keyboard.length,
      ...layout.map((key, index) => {
        return {
          key,
          index,
          isPressed: false,
        };
      })
    );
  };
  addEventListener = (callback: (data: VsrgPlayerEvent) => void, id: string) => {
    this.listeners.push({
      callback,
      id,
    });
  };
  emitEvent = (event: VsrgPlayerEvent) => {
    this.listeners.forEach((listener) => listener.callback(event));
  };
  removeEventListener = (id: string) => {
    this.listeners = this.listeners.filter((l) => l.id !== id);
  };
  resetScore = () => {
    const resetScore: VsrgPlayerScore = {
      scoreVisible: false,
      score: 0,
      amazing: 0,
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
      combo: 0,
      lastScore: {
        timestamp: 0,
        type: '',
        combo: 0,
      },
    };
    Object.assign(this.score, resetScore);
  };
  incrementScore = (type: VsrgPlayerHitType) => {
    const combo = type === 'miss' ? 0 : this.score.combo + 1;
    Object.assign(this.score, {
      [type]: this.score[type] + 1,
      combo,
      score: this.score.score + this.getScore(type) * combo,
      lastScore: {
        timestamp: Date.now(),
        type,
        combo,
      },
    });
  };
  private getScore = (type: VsrgPlayerHitType) => {
    // QUIRK: the `?? 0` fallback is dead code - VsrgPlayerHitType and baseScoreMap's keys are
    // the same union, so baseScoreMap[type] can never be undefined. Preserved rather than
    // simplified.
    return baseScoreMap[type] ?? 0;
  };
  playSong = (song: VsrgSong) => {
    this.currentSong.type = 'play';
    this.currentSong.song = song.clone();
  };
  showScore = () => {
    this.score.scoreVisible = true;
  };
  stopSong = () => {
    this.currentSong.type = 'stop';
    this.currentSong.song = null;
  };
  pressKey = (index: number) => {
    this.keyboard[index].isPressed = true;
    this.emitKeyboardEvent(this.keyboard[index], 'down');
  };
  releaseKey = (index: number) => {
    this.keyboard[index].isPressed = false;
    this.emitKeyboardEvent(this.keyboard[index], 'up');
  };
  addKeyboardListener = (listener: VsrcPlayerKeyboardCallback) => {
    this.keyboardListeners.push(listener);
  };
  removeKeyboardListener = (callback: Partial<VsrcPlayerKeyboardCallback>) => {
    const index = this.keyboardListeners.findIndex(
      (x) => x.id === callback.id || x.callback === callback.callback
    );
    if (index === -1) return;
    this.keyboardListeners.splice(index, 1);
  };
  emitKeyboardEvent = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
    this.keyboardListeners.forEach((listener) => listener.callback(key, type));
  };
}

export const vsrgPlayerStore = new VsrgPlayerStore();

// The three subscribers below use $effect.root (spec §6.1's non-component subscribe-helper
// pattern - see ThemeProvider.svelte.ts's subscribeTheme for the full $effect.root mechanics,
// including why a plain "skip the first run" boolean flag is unsafe). Two things apply to all
// three alike, disclosed once here:
//
// (1) None of the three ever calls `callback` at subscribe time - callers must read the store's
// current value directly for their initial render and use these purely for update notifications.
// Each effect instead captures a snapshot of what it's tracking at subscribe time and only calls
// `callback` when a LATER run observes something that differs from that snapshot. This is needed
// because $effect's mandatory first run is deferred, not synchronous, and can end up observing a
// mutation that landed in the window before it executes - a naive "isFirstRun" boolean would
// misidentify that as "just establishing deps" and silently swallow a real update.
//
// (2) $effect coalesces every synchronous $state write into a single batched re-run, so
// incrementScore/resetScore's several Object.assign-driven field writes always deliver as one
// fully-settled callback, never a transiently partial one. Every consumer of these three
// subscribers only cares about the latest value, so this is strictly safe.

// QUIRK: passes the live vsrgPlayerStore.currentSong object itself (not a copy) - unlike the
// other two subscribers below, which both pass a shallow-copied snapshot. Kept as-is, not
// "fixed" for consistency with its siblings.
export function subscribeCurrentVsrgSong(callback: (data: VsrgPlayerSong) => void): () => void {
  // song is always reassigned wholesale (never mutated in place - playSong/stopSong both do
  // this.currentSong.song = ...), so reference equality is a correct and cheap change test.
  let lastSong = vsrgPlayerStore.currentSong.song;
  let lastType = vsrgPlayerStore.currentSong.type;
  return $effect.root(() => {
    $effect(() => {
      // touch both fields to track them, mirroring old's un-scoped `observe(currentSong, ...)`
      const song = vsrgPlayerStore.currentSong.song;
      const type = vsrgPlayerStore.currentSong.type;
      if (song === lastSong && type === lastType) return;
      lastSong = song;
      lastType = type;
      callback(vsrgPlayerStore.currentSong);
    });
  });
}

export function subscribeVsrgScore(callback: (data: VsrgPlayerScore) => void): () => void {
  // score's own object reference never changes (incrementScore/resetScore mutate it in place
  // via Object.assign), so a JSON snapshot - not reference equality - is what actually detects
  // a change here. This is cheap since score is a small plain-data object, and it naturally
  // covers lastScore too, which is always replaced wholesale.
  let lastSnapshot = JSON.stringify(vsrgPlayerStore.score);
  return $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify(vsrgPlayerStore.score);
      if (snapshot === lastSnapshot) return;
      lastSnapshot = snapshot;
      callback({ ...vsrgPlayerStore.score });
    });
  });
}

// QUIRK: fires on ANY score-level mutation (e.g. showScore()'s bare scoreVisible toggle, which
// never touches lastScore at all), not just changes to lastScore - even though the callback only
// ever reports lastScore. The snapshot below is deliberately of the WHOLE score object, matching
// subscribeVsrgScore, to preserve that coarse-grained firing scope; narrowing it to only watch
// lastScore would change behavior.
export function subscribeVsrgLatestScore(callback: (data: VsrgLatestScore) => void): () => void {
  let lastSnapshot = JSON.stringify(vsrgPlayerStore.score);
  return $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify(vsrgPlayerStore.score);
      if (snapshot === lastSnapshot) return;
      lastSnapshot = snapshot;
      callback({ ...vsrgPlayerStore.score.lastScore });
    });
  });
}
