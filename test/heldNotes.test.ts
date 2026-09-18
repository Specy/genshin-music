import { describe, expect, it } from 'vitest';
import { HeldNoteRegistry, holderToken } from '../src/lib/audio/HeldNoteRegistry';
import { spanForHeldMs } from '../src/lib/core/Songs/sustainQuantize';
import { MIDIProvider } from '../src/lib/providers/MIDIProvider';

/**
 * The contract every surface's hold-to-sustain rests on. What is asserted here is exactly what
 * makes a release safe: it resolves nothing, it refcounts, and it is idempotent per physical
 * origin — a note left held is a voice that never stops on a looping instrument.
 */
describe('HeldNoteRegistry', () => {
  it('hands the release back what the press stored, without re-resolving anything', () => {
    const registry = new HeldNoteRegistry<{ trackIndex: number }>();
    const holder = holderToken('keyboard', 'KeyD');

    expect(registry.press(holder, 42, { trackIndex: 1 })).toEqual({ isFirstHolderOfId: true });
    const released = registry.release(holder);

    expect(released).toMatchObject({ id: 42, meta: { trackIndex: 1 }, isLastHolderOfId: true });
    //releasing again is a no-op: pointerup then pointerleave, or a release guard racing a key-up
    expect(registry.release(holder)).toBeNull();
  });

  it('refcounts a note held by two origins: first press sounds it, last release stops it', () => {
    const registry = new HeldNoteRegistry();
    const key = holderToken('keyboard', 'KeyD');
    const midi = holderToken('midi', '60:0');

    expect(registry.press(key, 7, undefined)?.isFirstHolderOfId).toBe(true);
    expect(registry.press(midi, 7, undefined)?.isFirstHolderOfId).toBe(false);

    expect(registry.release(key)?.isLastHolderOfId).toBe(false);
    expect(registry.release(midi)?.isLastHolderOfId).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('ignores a second press from the same origin — auto-repeat, duplicate note-on', () => {
    const registry = new HeldNoteRegistry();
    const holder = holderToken('keyboard', 'KeyD');

    expect(registry.press(holder, 3, undefined)).not.toBeNull();
    expect(registry.press(holder, 3, undefined)).toBeNull();
    expect(registry.isHolding(holder)).toBe(true);
    //and one release ends it, rather than the first of two
    expect(registry.release(holder)).not.toBeNull();
    expect(registry.size).toBe(0);
  });

  it('releases one source without touching the others (MIDI unplugged mid-hold)', () => {
    const registry = new HeldNoteRegistry();
    registry.press(holderToken('keyboard', 'KeyD'), 1, undefined);
    registry.press(holderToken('midi', '60:0'), 2, undefined);
    registry.press(holderToken('pointer', 5), 3, undefined);

    const released = registry.releaseSource('midi');

    expect(released.map((entry) => entry.id)).toEqual([2]);
    expect(registry.entriesOfSource('keyboard').map((e) => e.id)).toEqual([1]);
    expect(registry.entriesOfSource('pointer').map((e) => e.id)).toEqual([3]);
    expect(registry.entriesOfSource('midi')).toEqual([]);
  });

  it('releaseAll drains everything (blur, playback stop, teardown)', () => {
    const registry = new HeldNoteRegistry();
    registry.press(holderToken('keyboard', 'KeyD'), 1, undefined);
    registry.press(holderToken('pointer', 2), 2, undefined);

    expect(registry.releaseAll()).toHaveLength(2);
    expect(registry.size).toBe(0);
    expect(registry.releaseAll()).toHaveLength(0);
  });
});

/**
 * The rule the composer writes a live-played sustain down with. It measures the GESTURE instead
 * of counting tick crossings because a tick count would depend on the PHASE the press landed on:
 * selection is audio-true (ADR-0006), so a press in time with what the user hears lands near the
 * START of the sounding column, but input latency and where within the column the gesture really
 * falls still shift it - a tap landing late in a column would cross the next tick and be
 * recorded as a two-column sustain.
 */
describe('spanForHeldMs', () => {
  const uniform = (ms: number) => () => ms;

  it('keeps a tap at one column even when it crosses a tick', () => {
    //150ms of a 272ms column: crosses the next tick when pressed late in the column, still one column
    expect(spanForHeldMs(150, 8, uniform(272))).toBe(1);
  });

  it('grows at the midpoint of the next column, not at its start', () => {
    expect(spanForHeldMs(271, 8, uniform(272))).toBe(1);
    expect(spanForHeldMs(407, 8, uniform(272))).toBe(1); //just under 1.5 columns
    expect(spanForHeldMs(408, 8, uniform(272))).toBe(2); //at 1.5 columns
    expect(spanForHeldMs(680, 8, uniform(272))).toBe(3); //at 2.5 columns
  });

  it('measures against the REAL column lengths, so tempo changers count for what they last', () => {
    //a 1/2 column after a full one: [272, 136, 136, ...]
    const columns = [272, 136, 136, 136];
    const columnMsAt = (offset: number) => columns[offset] ?? 136;

    expect(spanForHeldMs(272 + 67, 4, columnMsAt)).toBe(1); //just under half of the 1/2 column
    expect(spanForHeldMs(272 + 68, 4, columnMsAt)).toBe(2);
    expect(spanForHeldMs(272 + 136 + 68, 4, columnMsAt)).toBe(3);
  });

  it('never records past the playhead, and never less than the note itself', () => {
    expect(spanForHeldMs(10_000, 3, uniform(272))).toBe(3);
    expect(spanForHeldMs(10_000, 1, uniform(272))).toBe(1);
    expect(spanForHeldMs(0, 8, uniform(272))).toBe(1);
  });

  /**
   * The playhead cap shrinks whenever something seeks BACKWARDS under a held key (wheel-up, a
   * timeline click, a canvas drag, a MIDI previous_column). The quantizer is re-derived from
   * scratch each tick, so on its own it would answer "1" — the caller is what must floor the
   * result at the span already performed. This pins the input side of that pairing.
   */
  it('answers only from what the playhead allows, leaving the floor to the caller', () => {
    //held for 4 columns, but the playhead is back at the note's own column
    expect(spanForHeldMs(272 * 4, 1, uniform(272))).toBe(1);
    expect(spanForHeldMs(272 * 4, 0, uniform(272))).toBe(1);
    expect(spanForHeldMs(272 * 4, -3, uniform(272))).toBe(1);
  });
});

describe('MIDIProvider.isNoteRelease', () => {
  it('accepts a real note-off and the running-status alias, and nothing else', () => {
    expect(MIDIProvider.isNoteRelease(0x80, 64)).toBe(true); //note-off, channel 1
    expect(MIDIProvider.isNoteRelease(0x8f, 0)).toBe(true); //note-off, channel 16
    expect(MIDIProvider.isNoteRelease(0x90, 0)).toBe(true); //note-ON at velocity 0
    expect(MIDIProvider.isNoteRelease(0x90, 64)).toBe(false); //an actual press
    expect(MIDIProvider.isNoteRelease(0xb0, 0)).toBe(false); //control change
  });
});
