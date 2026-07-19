import {describe, it} from 'vitest'
import {ColumnNote, Folder, InstrumentData, NoteColumn, NoteLayer, RecordedNote} from './imports'
import {expectGolden} from './golden'

describe('primitive serialization', () => {
    it('InstrumentData defaults and roundtrip are stable', () => {
        const defaults = new InstrumentData() // volume differs per game: 90 Genshin / 100 Sky
        const custom = new InstrumentData({
            volume: 55, pitch: 'F', visible: false, icon: 'line',
            alias: 'my alias', muted: true, reverbOverride: true,
        })
        expectGolden('instrument-data', {
            defaults: defaults.serialize(),
            custom: custom.serialize(),
            roundtrip: InstrumentData.deserialize(custom.serialize()).serialize(),
            // deserialize of an empty object exercises every fallback default
            fromEmpty: InstrumentData.deserialize({} as any).serialize(),
            noteIcons: [defaults.toNoteIcon(), custom.toNoteIcon()],
        })
    })

    it('NoteColumn / ColumnNote / RecordedNote wire formats are stable', () => {
        const column = new NoteColumn()
        column.tempoChanger = 2
        column.addNote(0)                                   // default empty layer -> dropped on deserialize
        column.addNote(3, NoteLayer.deserializeBin('101'))
        column.addNote(new ColumnNote(7, NoteLayer.deserializeBin('1')))
        const serialized = column.serialize()
        expectGolden('column', {
            serialized,
            // deserialize filters empty-layer notes — that behavior is part of the format
            roundtrip: NoteColumn.deserialize(serialized).serialize(),
            recordedNote: new RecordedNote(5, 1234, NoteLayer.deserializeBin('11')).serialize(),
            recordedNoteDefault: new RecordedNote().serialize(),
        })
    })

    it('Folder serialization is stable', () => {
        const folder = new Folder('My folder', 'abc-123')
        folder.filterType = 'alphabetical'
        expectGolden('folder', {
            named: folder.serialize(),
            defaults: new Folder().serialize(),
            roundtrip: Folder.deserialize(folder.serialize()).serialize(),
            fromPartial: Folder.deserialize({name: 'only name'}).serialize(),
        })
    })
})
