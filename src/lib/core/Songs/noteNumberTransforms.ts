// The four PURE rewrites of ADR-0007's absolute axis: what a Basepoint change, an
// instrument swap and a format migration do to the Note Numbers of one track. Kept beside
// noteIds.ts (which owns the tables and the per-note resolution) rather than inside it,
// because these are whole-track EDITS — the song classes call them and then publish; this
// module owns no state, reads no song and touches nothing reactive.
//
// Wired into the ComposedSong/RecordedSong/VsrgSong mutators that move a track's numbers, which
// record what the rewrite wrote as part of their own Undo Step (ADR-0013). Table-tested first, on
// purpose — every one of them is a silent-corruption hazard if it is off by a semitone or drops a
// Stranded Note.
//
// WHY THE SONG CLASSES DID NOT USED TO DO THIS AT ALL: pitch used to be a play-time playback
// rate and nothing else, so changing it rewrote nothing. Under ADR-0007 the Basepoint is
// part of every stored number, which makes changing it a real, undoable edit.

import type {Pitch} from '$core/legacyConfig'
import {
    basepointOffset,
    nominalToNumber,
    numberToButton,
    numberToNominal,
    strandedRow,
    type RuntimeInstrumentName,
} from './noteIds'

/**
 * The minimal shape the rewrites need from a song note: ONE mutable Note Number under the
 * name all three song types already spell it with (`id` on ColumnNote and RecordedNote).
 * VSRG's hit objects keep their numbers in a plain `notes: number[]` instead, which is what
 * the `…Numbers…` variants below are for — they return a NEW array, matching
 * VsrgHitObject's own assign-never-mutate convention.
 *
 * Deliberately structural and deliberately not `Song`-aware: a rewrite that could see the
 * song could be tempted to publish, and publishing is the caller's job (the mutator that
 * owns the signal — see ComposedSong's `#structure` bump).
 */
export type NumberedNote = {id: number}

/**
 * Semitones a Basepoint change moves every affected note by: the difference of the two
 * PITCHES indices, so it is NEGATIVE when the new Basepoint is lower in the list. It is a
 * raw interval, NOT folded into an octave — B → C is −11 (eleven semitones DOWN, the notes
 * follow the view down), never +1: folding it would silently octave-jump a whole track.
 */
export function basepointDelta(oldPitch: Pitch, newPitch: Pitch): number {
    return basepointOffset(newPitch) - basepointOffset(oldPitch)
}

/**
 * Apply a Basepoint change to a track's notes, IN PLACE (spec §4: `number += delta` for
 * EVERY note of the affected tracks).
 *
 * Stranded Notes included, without exception: they move with their track because the
 * Basepoint is part of what their number means, and a note that stayed put would silently
 * change pitch relative to everything around it. Some of them may un-strand at the new
 * Basepoint and some healthy notes may strand — both are correct and both are visible.
 */
export function rewriteForBasepoint(notes: Iterable<NumberedNote>, delta: number): void {
    if (delta === 0) return
    for (const note of notes) note.id += delta
}

/** rewriteForBasepoint for numbers held in a bare array (VSRG hit objects); returns a new array. */
export function rewriteNumbersForBasepoint(numbers: readonly number[], delta: number): number[] {
    return delta === 0 ? [...numbers] : numbers.map((number) => number + delta)
}

/**
 * Rewrite a track's Note Numbers when its instrument is swapped (spec §4), returning a new
 * array. BUTTON-PRESERVING through nominal correspondence, which is the behavior users
 * rely on and the reason cross-instrument swaps are not sound-preserving (ADR-0007):
 *
 *   number → its NOMINAL on the old instrument → that nominal's Note Number on the new one
 *   (numberToNominal, then nominalToNumber, both at this Basepoint).
 *
 * Lyre → Vintage-Lyre therefore RE-FLAVORS: the D button becomes the Db button, keeping the
 * shape of what was played and changing what it sounds. The two kinds of stranded note
 * (noteIds.strandedRow) take the two halves of that rule:
 *  - a note whose nominal the new instrument has no key for becomes a ROW strand there, carried
 *    by the new register onto the row it was on - never left on a number some other key of a
 *    registered instrument sounds. A row strand on the old instrument goes the same way, and finds
 *    a key where the new instrument has one on its row: that is how a swap back restores it.
 *  - a PITCH strand passes through UNCHANGED, as every strand did before registers: it keeps its
 *    pitch, and un-strands where the new instrument sounds that pitch - a Guitar part pasted onto a
 *    Piano layer plays once the layer is a Guitar.
 * Between two instruments without a register both are the number itself, unchanged.
 *
 * WHY THE REGISTER (2026-11-01): before it, a key-less note was left at its number, which on a
 * registered instrument can be the Sounding Pitch of ANOTHER key — HandPan's F5 button sounds F4 —
 * so a note meant to strand was voiced by the key an octave away, and the swap back took that key's
 * F5. Piano → HandPan → Piano moved every C4, F4 and G4 up an octave, merged into any F5 already in
 * the column; a user lost a song's low notes to it. Now swapping back restores every voiced note and
 * every row strand between any two instruments with no per-button flavor (every untuned and every
 * registered one). What stays lossy is what always was: a pitch strand that un-strands on the new
 * instrument becomes that key, and the key is what a swap back carries; and a per-button TUNED
 * instrument (Vintage-Lyre), whose flavored keys can sound a neighbour's nominal - setInstrument's
 * merge pass is for those.
 *
 * `pitch` is the track's EFFECTIVE Basepoint (its own override, else the song's) and is the
 * same on both sides: a swap is not a transposition.
 */
export function rewriteForSwap(
    numbers: readonly number[],
    oldInstrumentName: RuntimeInstrumentName,
    newInstrumentName: RuntimeInstrumentName,
    pitch: Pitch
): number[] {
    return numbers.map((number) => {
        const voiced = numberToButton(oldInstrumentName, pitch, number) !== -1
        if (!voiced && strandedRow(oldInstrumentName, pitch, number) === null) return number
        return nominalToNumber(newInstrumentName, pitch, numberToNominal(oldInstrumentName, pitch, number))
    })
}

/**
 * Lift one track's OLD-FORMAT note ids (composed ≤v4, recorded ≤v3, vsrg ≤v2 — all of them
 * Nominal Ids stored pre-Basepoint) onto the absolute axis (spec §4), returning a new array:
 *
 *   `number = (nominalIndex(id) === -1 ? id + registerShift : sounding(button)) + offset(effectivePitch)`
 *
 * A note the track's instrument plays becomes what it ALREADY SOUNDED in that file: the
 * button is unchanged and so is the playback rate, which is why migrated songs are audibly
 * identical (the parity suite pins exactly this). A note stranded in the old file has no
 * button to ask, so it migrates BEST-EFFORT as a ROW strand, `id + registerShift + offset`
 * (noteIds.strandedRow) — that keeps its grid row and its position relative to its neighbours,
 * which is all a stranded note ever had, and keeps it stranded, as it was. (Before 2026-11-01 it
 * migrated as `id + offset`, which on a registered instrument can be the Sounding Pitch of the
 * button an octave away: a note that never sounded un-stranded onto another key.) An id that is
 * no grid row at all, which only a malformed file holds, has no row and migrates as itself. On a
 * per-button TUNED instrument the best-effort number can still coincide with a flavored button's
 * Sounding Pitch and thus UN-STRAND, and that is accepted: it is a note that never sounded
 * starting to sound the pitch its stored number now names.
 *
 * `effectivePitch` is the track's own Basepoint override, else the song's — per track,
 * because that is what the file's playback used.
 */
export function migrateTrackNotes(
    ids: readonly number[],
    instrumentName: RuntimeInstrumentName,
    effectivePitch: Pitch
): number[] {
    return ids.map((id) => nominalToNumber(instrumentName, effectivePitch, id))
}
