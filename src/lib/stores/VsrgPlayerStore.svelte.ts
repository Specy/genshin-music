import { untrack } from 'svelte';
import { VsrgSong } from '$core/Songs/VsrgSong.svelte';

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
  //stored rather than derived like grade and accuracy (vsrgGrade.ts), because the peak depends on
  //the ORDER the judgments arrived in and the tallies are unordered counts - once a miss has zeroed
  //`combo`, nothing left on the score object can say how high it had climbed.
  maxCombo: number;
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

class VsrgPlayerStore {
  /**
   * `$state.raw`, not `$state`, for the reason the 2026-08-06 reactive-model plan gives for the
   * composer's arrays: VsrgPlayerRenderer.validateHitObjects indexes this per renderable hit object
   * on every frame (`keyboard[ro.hitObject.index]`, then `key.isPressed`), and each of those reads
   * through a deep proxy is a Proxy trap. Raw makes them plain reads and keeps the whole-array
   * signal, which is what the keyboard UI watches anyway.
   *
   * THE RULE THAT COMES WITH IT is stricter here than for the model's arrays, because a keypress is
   * an in-place edit by nature: setLayout/pressKey/releaseKey ASSIGN a new array, and press/release
   * also install a NEW KeyboardKey at the index they touch. Both halves are load-bearing -
   * `{@const data = vsrgPlayerStore.keyboard[index]}` in VsrgPlayerKeyboard.svelte compiles to an
   * identity-compared derived, so mutating the existing key and reassigning the array would publish
   * and still leave that key drawn unpressed. The cost is a 4-6 element array plus one object per
   * keypress, which is user-paced; the reads it makes plain are per frame.
   */
  keyboard: KeyboardKey[] = $state.raw([]);
  currentSong: VsrgPlayerSong = $state({
    song: null,
    type: 'stop',
  });
  score: VsrgPlayerScore = $state({
    scoreVisible: false,
    combo: 0,
    maxCombo: 0,
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
  // Deliberately a plain array, not $state: it is never read from a template/$derived/$effect -
  // it only exists to be pushed/filtered/iterated imperatively by the keyboard-listener trio.
  //
  // The general event bus that used to sit beside it carried exactly one event, 'fpsChange',
  // which pushed a settings value at VsrgPlayerRenderer one flush before the same value
  // arrived as a prop - so the renderer re-read the previous one. The renderer diffs its own
  // props now (see its update()), and the bus is gone with it.
  private keyboardListeners: VsrcPlayerKeyboardCallback[] = [];

  //assigns rather than splicing the live array: under `$state.raw` an in-place edit publishes
  //nothing, so the keyboard would keep rendering the previous key count after a 4 <-> 6 key change
  setLayout = (layout: string[]) => {
    this.keyboard = layout.map((key, index) => ({ key, index, isPressed: false }));
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
      maxCombo: 0,
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
      maxCombo: Math.max(this.score.maxCombo, combo),
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
  // The clone here is a SNAPSHOT for the player, not the clone-to-notify the 2026-08-06
  // reactive-model plan deleted: it gives the player its own copy so that editing the song in the
  // composer cannot rewrite what is being played. It also happens to be what makes retrying the
  // SAME song work, since subscribeCurrentVsrgSong detects changes by reference. Keep it.
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
    this.emitKeyboardEvent(this.setPressed(index, true), 'down');
  };
  releaseKey = (index: number) => {
    this.emitKeyboardEvent(this.setPressed(index, false), 'up');
  };
  // Install a new key object in a new array - see the `keyboard` field for why both, and for what
  // an in-place `keyboard[index].isPressed = ...` would fail to do now. The listeners are handed
  // the new object, as they used to be handed the mutated one.
  //
  // An index that addresses no key throws here, as the in-place write it replaces did: both call
  // sites (VsrgPlayerKeyboard's pointer handlers and its findIndex-guarded key listeners) pass an
  // index of the layout they just read, so a bad one is a caller bug rather than an input.
  private setPressed = (index: number, isPressed: boolean): KeyboardKey => {
    const current = this.keyboard[index];
    const updated: KeyboardKey = { key: current.key, index: current.index, isPressed };
    const keyboard = [...this.keyboard];
    keyboard[index] = updated;
    this.keyboard = keyboard;
    return updated;
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
      // untrack: this callback runs SYNCHRONOUSLY inside the effect and its call tree reads the
      // song - VsrgPlayerRenderer.onSongPick reaches song.keys, song.getAccuracyBounds()'s
      // `difficulty` and song.tracks. Those became signals in the 2026-08-06 reactive-model plan's
      // phase 2, so without this every one of them would silently join this effect's dependency
      // set, and an effect whose contract is "fires when the current song changes" would re-run on
      // any edit to the song it is holding. The two reads above stay tracked - they are the
      // dependencies this subscriber is actually for.
      untrack(() => callback(vsrgPlayerStore.currentSong));
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
