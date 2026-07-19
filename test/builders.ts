import {ComposedSong, INSTRUMENTS, NoteLayer, RecordedNote, RecordedSong} from './imports'

export function buildRecordedSong(): RecordedSong {
    const song = new RecordedSong('Golden recorded', [], [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 180
    song.pitch = 'D'
    song.reverb = true
    song.notes = [
        new RecordedNote(0, 100, NoteLayer.deserializeBin('1')),
        new RecordedNote(3, 350, NoteLayer.deserializeBin('10')),
        new RecordedNote(7, 350, NoteLayer.deserializeBin('11')),
        new RecordedNote(14, 900, NoteLayer.deserializeBin('1')),
    ]
    return song
}

export function buildComposedSong(): ComposedSong {
    const song = new ComposedSong('Golden composed', [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 160
    song.pitch = 'E'
    song.reverb = true
    // constructor creates 100 empty columns; fill a few deterministically
    song.columns[0].addNote(0, NoteLayer.deserializeBin('1'))
    song.columns[0].addNote(4, NoteLayer.deserializeBin('11'))
    song.columns[1].tempoChanger = 1
    song.columns[1].addNote(2, NoteLayer.deserializeBin('10'))
    song.columns[3].tempoChanger = 3
    song.columns[3].addNote(10, NoteLayer.deserializeBin('1'))
    song.breakpoints = [0, 3]
    return song
}
