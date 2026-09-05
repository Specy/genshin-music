import type { VsrgSong, VsrgTrack } from '$core/Songs/VsrgSong.svelte';
import type { VsrgSongKeys } from '$core/types';

/**
 * The song half of VsrgComposerRendererState: what VsrgComposerCanvas.svelte reads off the VsrgSong
 * and hands to the pixi renderer.
 *
 * It sits in its own module rather than next to the renderer because of what may import what. The
 * canvas component may only `import type` from VsrgComposerRenderer.ts - that file pulls in pixi.js,
 * and a static import would drag it into the prerendered bundle - so the capture function has to
 * live somewhere pixi-free. test/vsrgComposerRenderer.test.ts imports it from here too, and drives
 * it against a real VsrgSong.
 */
export interface VsrgSongRenderState {
  /** Diffed by needsSizes, and read by drawKeys/drawTrack. */
  keys: VsrgSongKeys;
  /** Diffed by needsSizes (it sets snapPointWidth). */
  bpm: number;
  /** Read by the wheel/drag/timeline handlers and by both draws. */
  duration: number;
  /**
   * Whichever array the song held at capture time. `breakpoints` is `$state.raw` on VsrgSong and
   * every edit to it ASSIGNS a new array, so holding the reference is holding a snapshot - which is
   * why this is not copied. drawTimeline walks it on every timeline draw.
   */
  breakpoints: number[];
  /**
   * The song's LIVE track array, deliberately - `#tracks` is a private array behind a getter, and
   * the graph is edited in place, so within a song this reference does not move. That makes it the
   * current graph rather than a copy, and it also makes an identity diff of it blind to every edit
   * made within one song; `structure` below is the value that moves.
   */
  tracks: VsrgTrack[];
  /**
   * Diffed by needsCache. It has to be the colour VALUES, not the tracks: VsrgTrackSettings edits a
   * VsrgTrack IN PLACE, so even a fresh array of the same track objects would compare equal.
   */
  trackColors: string[];
  /**
   * The song's structure version, captured. Two honest statements about what it is and is not:
   *  - it is a subscription: reading it registers the graph as a dependency of the caller's $effect.
   *    Not the only one - `tracks` and `trackColors` read the same signal and register it too - so
   *    this is another channel onto the graph rather than the sole one.
   *  - NOTHING DIFFS IT TODAY. draw() runs unconditionally at the end of update(), so there is no
   *    "nothing structural moved" branch for it to gate. It is captured anyway because a scalar
   *    version is the comparison that survives a stable identity - see `tracks` above for what
   *    happens to the alternative - so a branch that does want one has a value it can compare.
   */
  structure: number;
}

/**
 * Read those out of the song, at the moment the caller was told something changed.
 *
 * TAKING VALUES OUT is the whole point (2026-08-06 reactive-model plan, phase 2).
 * VsrgComposerRenderer.update() diffs the previous state against the next one; while the state
 * carried the VsrgSong itself, `previous.vsrg.bpm !== next.vsrg.bpm` and
 * `previous.vsrg.tracks[i].color !== next.vsrg.tracks[i].color` were fields compared against
 * themselves, and only ever reported a change because refreshVsrg() cloned the song after every
 * edit. With one stable instance they would have gone permanently false - silently, with no error
 * and no failing test.
 *
 * Reading the fields HERE is also what subscribes the caller's `$effect` to them, so its dependency
 * set is explicit rather than "whatever that draw happened to reach".
 *
 * Everything returned is a value, a fresh array, or - for `tracks` and `breakpoints` - a reference
 * whose own docstring says why holding it is still a snapshot. test/vsrgComposerRenderer.test.ts
 * holds this to that, exemption by exemption.
 */
export function captureVsrgSongState(vsrg: VsrgSong): VsrgSongRenderState {
  return {
    keys: vsrg.keys,
    bpm: vsrg.bpm,
    duration: vsrg.duration,
    breakpoints: vsrg.breakpoints,
    tracks: vsrg.tracks,
    trackColors: vsrg.tracks.map((track) => track.color),
    structure: vsrg.structureVersion,
  };
}
