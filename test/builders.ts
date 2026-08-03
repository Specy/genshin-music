import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, RecordedNote, RecordedSong} from './imports'

/** Note Id of a button on the game's default instrument (what the legacy builders' indices meant). */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].midiNotes[button]
}

// Same musical content as the pre-v3 builder (notes at legacy indices 0/3/7/14, the
// index-7 note doubled on both tracks), expressed in the per-track Note Id model.
export function buildRecordedSong(): RecordedSong {
    const song = new RecordedSong('Golden recorded', [], [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 180
    song.pitch = 'D'
    song.reverb = true
    song.notes = [
        new RecordedNote(idOf(0), 100, 0, 0),
        new RecordedNote(idOf(3), 350, 0, 1),
        new RecordedNote(idOf(7), 350, 0, 0),
        new RecordedNote(idOf(7), 350, 0, 1),
        new RecordedNote(idOf(14), 900, 0, 0),
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
    // constructor creates 100 empty columns; fill a few deterministically
    song.columns[0].addNote(0, idOf(0))
    song.columns[0].addNote(0, idOf(4))
    song.columns[0].addNote(1, idOf(4))
    song.columns[1].tempoChanger = 1
    song.columns[1].addNote(1, idOf(2))
    song.columns[3].tempoChanger = 3
    song.columns[3].addNote(0, idOf(10))
    song.breakpoints = [0, 3]
    return song
}
