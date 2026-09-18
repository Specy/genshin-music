import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingMidiImport,
  consumePendingMidiImport,
  setPendingMidiImport,
} from '../src/lib/stores/PendingMidiImportStore';

// The slot is module state shared by every importer, so each case starts from empty rather than
// relying on the previous one having drained it.
beforeEach(() => clearPendingMidiImport());

function file(name: string) {
  return new File(['x'], name);
}

describe('pending midi import handoff', () => {
  it('hands the file over exactly once', () => {
    const dropped = file('song.mid');
    setPendingMidiImport(dropped);

    expect(consumePendingMidiImport()).toBe(dropped);
    // The importer opened by hand later must start empty - this is the whole point of the slot.
    expect(consumePendingMidiImport()).toBe(null);
  });

  it('is empty when nothing was handed over', () => {
    expect(consumePendingMidiImport()).toBe(null);
  });

  it('keeps only the last file handed over', () => {
    setPendingMidiImport(file('first.mid'));
    const second = file('second.mp3');
    setPendingMidiImport(second);

    expect(consumePendingMidiImport()).toBe(second);
  });

  it('clearing drops the pending file without importing it', () => {
    setPendingMidiImport(file('song.mid'));
    clearPendingMidiImport();

    expect(consumePendingMidiImport()).toBe(null);
  });
});
