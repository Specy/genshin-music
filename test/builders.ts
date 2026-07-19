import {INSTRUMENTS, NoteLayer, RecordedNote, RecordedSong} from './imports'

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
