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
    getNoteIdTable,
    getSoundingTable,
    nominalToNumber,
    noteIdToButton,
    numberToButton,
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
 *   number → old button → old NOMINAL id → the new instrument's button for that same
 *   nominal → that button's Note Number at this Basepoint.
 *
 * Lyre → Vintage-Lyre therefore RE-FLAVORS: the D button becomes the Db button, keeping the
 * shape of what was played and changing what it sounds. Two cases pass through UNCHANGED:
 * a number stranded on the OLD instrument (nothing to correspond from — it keeps its place
 * and may un-strand on the new one), and a nominal the NEW instrument has no button for
 * (the note stays exactly where it was and is now stranded, visibly, instead of being
 * approximated onto some other key).
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
    const offset = basepointOffset(pitch)
    const oldNominals = getNoteIdTable(oldInstrumentName)
    const newSounding = getSoundingTable(newInstrumentName)
    return numbers.map((number) => {
        const button = numberToButton(oldInstrumentName, pitch, number)
        if (button === -1) return number
        const nominal = oldNominals[button]
        const newButton = nominal === undefined ? -1 : noteIdToButton(newInstrumentName, nominal)
        if (newButton === -1) return number
        const sounding = newSounding[newButton]
        return sounding === undefined ? number : sounding + offset
    })
}

/**
 * Lift one track's OLD-FORMAT note ids (composed ≤v4, recorded ≤v3, vsrg ≤v2 — all of them
 * Nominal Ids stored pre-Basepoint) onto the absolute axis (spec §4), returning a new array:
 *
 *   `number = (nominalIndex(id) === -1 ? id : sounding(button)) + offset(effectivePitch)`
 *
 * A note the track's instrument plays becomes what it ALREADY SOUNDED in that file: the
 * button is unchanged and so is the playback rate, which is why migrated songs are audibly
 * identical (the parity suite pins exactly this). A note stranded in the old file has no
 * button to ask, so it migrates BEST-EFFORT as `id + offset` — that keeps its position
 * relative to its neighbours, which is all a stranded note ever had. On a tuned instrument
 * such a best-effort number can coincide with a real Sounding Pitch and thus UN-STRAND, and
 * that is accepted: it is a note that never sounded starting to sound the pitch its stored
 * number now names.
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
