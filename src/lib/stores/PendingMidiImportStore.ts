/**
 * One-slot, consume-once handoff of the file that sent the user to the composer's MIDI importer.
 *
 * A midi/audio/video file dropped on the player's or the composer's import button is not
 * something those menus can parse — both react by opening (or navigating to) the MIDI importer.
 * Without this slot the file itself was dropped on the floor and the user had to pick the very
 * same file a second time inside the importer.
 *
 * Deliberately NOT a rune store and deliberately module-scope: the player's route change goes
 * through goto(), so a component-owned value has nowhere to live across it, and nothing renders
 * off this — the importer reads it once, imperatively, when it opens.
 *
 * Consume-once is the invariant that matters: a file left in the slot would be re-imported the
 * next time the importer is opened by hand, so `consume` always empties it. A hard reload (not
 * an SPA navigation) loses the pending file, which only means the importer opens empty.
 */
let pending: File | null = null;

/** Overwrites any previously pending file — only the last drop can be the one being acted on. */
export function setPendingMidiImport(file: File) {
  pending = file;
}

/** Returns the pending file and empties the slot. Null when nothing is waiting. */
export function consumePendingMidiImport(): File | null {
  const file = pending;
  pending = null;
  return file;
}

/** Drops the pending file without importing it (an abandoned handoff must not linger). */
export function clearPendingMidiImport() {
  pending = null;
}
