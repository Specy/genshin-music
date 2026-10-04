// A LOADED SONG PLAYED ON THE USER'S OWN KEYBOARD: what the player's "don't sync the song's
// instrument and pitch" setting does to a run (ADR-0007 addendum, 2026-10-04).
//
// Normally a song brings its own instruments, Basepoint and reverb into the player, and it has to:
// its Note Numbers are absolute (ADR-0007), so simply sounding them on another instrument or at
// another Basepoint plays whichever of them that instrument happens to have and silences the rest.
// That is why the old play-time setting was removed. This brings it back the only way the format
// allows: every track is MOVED onto the user's instrument and Basepoint the way the composer moves
// a track, BY BUTTON -
//
//   1. the instrument swap's nominal correspondence (noteNumberTransforms.rewriteForSwap): each note
//      goes to the user's instrument's key for the same Nominal Id, i.e. the same key of the game's
//      layout, and
//   2. the Basepoint change (rewriteForBasepoint): the same buttons, at the user's Basepoint.
//
// That is what playing a sheet on another instrument in-game is, and what the old setting did back
// when songs stored buttons. A note the user's instrument has no key for passes through the swap
// and strands, silent - exactly what a composer swap leaves it as, and never approximated onto some
// other key.
//
// FOR ONE RUN ONLY: the player retargets the per-run clone it builds anyway, never the stored song.
// Nothing is dropped and nothing reordered - the note list keeps its length and order - so the
// Section and every absolute index the player keeps go on addressing the same notes. Each track
// keeps its volume, Mute and Solo, which say which parts of the song are heard and how loud; what it
// takes from the user is how it sounds: the instrument, its Instrument Settings, the Basepoint and
// the reverb.

import type {Pitch} from '$core/legacyConfig'
import type {InstrumentName} from '$core/types'
import type {InstrumentSettingValues} from '$lib/games/instrumentSettings'
import type {RecordedSong} from './RecordedSong'
import type {InstrumentData, RecordedNote} from './SongClasses'
import {effectiveTrackPitch} from './noteIds'
import {basepointDelta, rewriteForBasepoint, rewriteForSwap} from './noteNumberTransforms'

/** The user's own keyboard, as a song is asked to sound on it. */
export type SongRetarget = {
    /** The user's instrument, with its Instrument Settings (the Variant, ADR-0017). */
    name: InstrumentName
    settings: InstrumentSettingValues
    /** The user's Basepoint: the song is moved onto it, buttons kept. */
    pitch: Pitch
    reverb: boolean
}

/**
 * The roster a retargeted song plays with: every track on the target instrument with the target's
 * Instrument Settings, following the song's Basepoint and reverb (which `retargetSong` makes the
 * target's), and keeping its own volume, Mute, Solo and the rest. Exported on its own because the
 * player loads its engines from this before the run that retargets the notes is built.
 */
export function retargetInstruments(instruments: readonly InstrumentData[], target: SongRetarget): InstrumentData[] {
    return instruments.map((track) => track.withInstrument(target.name).set({
        settings: {...target.settings},
        //'' follows the song's Basepoint, so no track keeps an override of its own
        pitch: '',
        //null follows the song's reverb, which is the target's
        reverbOverride: null,
    }))
}

/** A copy of `song` moved onto the target, every track by button (see the module header). */
export function retargetSong(song: RecordedSong, target: SongRetarget): RecordedSong {
    const retargeted = song.clone()
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- scratch grouping, never rendered
    const notesByTrack = new Map<number, RecordedNote[]>()
    for (const note of retargeted.notes) {
        const notes = notesByTrack.get(note.trackIndex)
        if (notes) notes.push(note)
        else notesByTrack.set(note.trackIndex, [note])
    }
    for (const [trackIndex, notes] of notesByTrack) {
        const track = song.instruments[trackIndex]
        //no roster entry: nothing to correspond from, and nothing sounds the note anyway (a player
        //run indexes its engines by track), so it stays exactly as it is
        if (!track) continue
        const pitch = effectiveTrackPitch(track, song.pitch)
        const swapped = rewriteForSwap(notes.map((note) => note.id), track.name, target.name, pitch)
        notes.forEach((note, index) => {
            note.id = swapped[index]
        })
        rewriteForBasepoint(notes, basepointDelta(pitch, target.pitch))
    }
    retargeted.instruments = retargetInstruments(song.instruments, target)
    retargeted.pitch = target.pitch
    retargeted.reverb = target.reverb
    return retargeted
}
