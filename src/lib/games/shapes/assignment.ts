// The Shape's note→position assignment as data (ADR-0005 §2), and the two derived views
// the app needs from it:
//   - `shapeSlots`  — Button -> slot, used by the engine to read Label Sets and resolve
//                     keybinds at the position the Shape actually drew the note.
//   - `placeNotes`  — slot -> note, used by slot-ordered arrangements (GridShape).
// Both are pure functions of (Shape, notes): no component, no reactivity, so the engine,
// the arrangement and the registry validator all derive the SAME assignment independently
// instead of agreeing by convention.
//
// Every shipped Shape omits `assign` and therefore uses the identity assignment
// (slot k = note k) — authored meta.json order IS on-screen order — so nothing below
// changes a single pixel today; it exists so a content-driven Shape can place notes by
// their content without any surface, the engine, or the keybind store learning about it.
import type { InstrumentNote, ShapeDefinition, ShapeNote } from '../types';

/** The ShapeNote view of an authored instrument note (`midi` IS the Note Id, ADR-0001). */
export function shapeNoteOf(note: InstrumentNote): ShapeNote {
  return { id: note.nominal, baseNote: note.baseNote, icon: note.icon };
}

/**
 * Where this Shape puts each note: `slots[button]` is the position `notes[button]` occupies
 * in the Shape's geometry and in its Label Sets. Identity unless the Shape declares its own
 * rule.
 */
export function shapeSlots(shape: ShapeDefinition, notes: readonly ShapeNote[]): readonly number[] {
  if (!shape.assign) return notes.map((_, button) => button);
  return shape.assign(notes);
}

/** A note placed at a slot, carrying the Button it came from (its position in `notes`). */
export type PlacedNote<N extends ShapeNote> = { note: N; button: number };

/**
 * The slot-ordered view, for arrangements whose DOM order IS their placement (grids):
 * entry `s` holds the note assigned to slot `s`, or null for a slot no note takes (only
 * reachable under a non-identity assignment — a gap the arrangement must still occupy so
 * the following slots don't shift up). Length = highest occupied slot + 1, so under the
 * identity assignment this is exactly `notes` and a grid renders nothing extra.
 */
export function placeNotes<N extends ShapeNote>(
  shape: ShapeDefinition,
  notes: readonly N[]
): readonly (PlacedNote<N> | null)[] {
  const slots = shapeSlots(shape, notes);
  let highest = -1;
  for (const slot of slots) {
    if (Number.isInteger(slot) && slot > highest) highest = slot;
  }
  const placed: (PlacedNote<N> | null)[] = new Array(highest + 1).fill(null);
  notes.forEach((note, button) => {
    const slot = slots[button];
    // Defensive: defineGame rejects malformed assignments at module evaluation, so a bad
    // slot here can only come from a Shape built at runtime — drop it rather than crash the
    // whole keyboard.
    if (!Number.isInteger(slot) || slot < 0 || slot > highest) return;
    placed[slot] = { note, button };
  });
  return placed;
}

/**
 * Registry-time check that a Shape's assignment for one instrument's notes is a real
 * placement: one slot per note, each a distinct integer inside the Shape's capacity (which
 * is also the length of every Label Set, so an in-range slot always has a label).
 * No-op for the identity assignment beyond the capacity check the caller already makes.
 */
export function assertShapeAssignment(
  shape: ShapeDefinition,
  notes: readonly ShapeNote[],
  context: string
): void {
  const slots = shapeSlots(shape, notes);
  if (slots.length !== notes.length) {
    throw new Error(
      `${context}: shape "${shape.id}" assigned ${slots.length} slots for ${notes.length} notes`
    );
  }
  const seen = new Set<number>();
  for (const [button, slot] of slots.entries()) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= shape.capacity) {
      throw new Error(
        `${context}: shape "${shape.id}" assigned button ${button} to slot ${slot}, outside [0, ${shape.capacity})`
      );
    }
    if (seen.has(slot)) {
      throw new Error(
        `${context}: shape "${shape.id}" assigned two notes to slot ${slot} (button ${button})`
      );
    }
    seen.add(slot);
  }
}
