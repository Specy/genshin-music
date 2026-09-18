import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, RecordedNote, RecordedSong} from './imports'
import {nominalToNumber} from '$core/Songs/noteIds'
import type {Pitch} from '$core/legacyConfig'

/** Note Id of a button on the game's default instrument (what the legacy builders' indices meant). */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].nominal
}

/**
 * That same nominal as the Note Number a track of `instrument` carries at Basepoint `pitch`
 * (ADR-0007) — i.e. EXACTLY what a v4/v3 file storing `idOf(button)` migrates to on load.
 * Keeping the builders on that rule is what makes the new-version goldens below equal to the
 * migration of the committed pre-flip ones, rather than a second, differently-derived truth.
 */
function numberOf(button: number, instrument: string, pitch: Pitch): number {
    return nominalToNumber(instrument, pitch, idOf(button))
}

// Same musical content as the pre-v3 builder (notes at legacy indices 0/3/7/14, the
// index-7 note doubled on both tracks), expressed in the per-track Note Number model.
export function buildRecordedSong(): RecordedSong {
    const song = new RecordedSong('Golden recorded', [], [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 180
    song.pitch = 'D'
    song.reverb = true
    const number = (button: number, track: 0 | 1) => numberOf(button, INSTRUMENTS[track], song.pitch)
    song.notes = [
        new RecordedNote(number(0, 0), 100, 0, 0),
        new RecordedNote(number(3, 1), 350, 0, 1),
        new RecordedNote(number(7, 0), 350, 0, 0),
        new RecordedNote(number(7, 1), 350, 0, 1),
        new RecordedNote(number(14, 0), 900, 0, 0),
    ]
    return song
}

// Same content as the pre-v4 builder (columns 0/1/3, the column-0 index-4 note doubled
// on both tracks), expressed per track.
export function buildComposedSong(): ComposedSong {
    const song = new ComposedSong('Golden composed', [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 160
    song.pitch = 'E'
    song.reverb = true
    const number = (button: number, track: 0 | 1) => numberOf(button, INSTRUMENTS[track], song.pitch)
    // constructor creates 100 empty columns; fill a few deterministically
    song.columns[0].addNote(0, number(0, 0))
    song.columns[0].addNote(0, number(4, 0))
    song.columns[0].addNote(1, number(4, 1))
    song.columns[1].tempoChanger = 1
    song.columns[1].addNote(1, number(2, 1))
    song.columns[3].tempoChanger = 3
    song.columns[3].addNote(0, number(10, 0))
    song.breakpoints = [0, 3]
    return song
}
