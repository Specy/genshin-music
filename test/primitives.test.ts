import {describe, it} from 'vitest'
import {ComposedSong, Folder, InstrumentData, NoteColumn, RecordedNote} from './imports'
import {expectGolden, readFixture} from './golden'

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

    // Format-v4 rewrite (2026-08-03): NoteColumn no longer serializes itself (column wire
    // format lives in ComposedSong v4); `column.json` is the frozen pre-v4 fixture whose
    // `serialized` member is a real legacy column and now serves as the LEGACY INPUT.
    it('legacy column conversion / RecordedNote wire formats are stable', () => {
        const legacyColumn = readFixture('column')
        // wrap the committed legacy column in a minimal v3 payload; instrument count is
        // auto-sized from the highest layer bit exactly as real legacy files rely on
        const v3Payload = {
            version: 3, name: 'Legacy column carrier', bpm: 220, pitch: 'C', type: 'composed',
            data: {isComposed: true, isComposedVersion: true, appName: new ComposedSong('probe').data.appName},
            breakpoints: [], reverb: false, instruments: [],
            columns: [legacyColumn.serialized],
        }
        const column = new NoteColumn()
        column.tempoChanger = 2
        column.addNote(0, 60)
        column.addNote({trackIndex: 1, id: 72, span: 4}) //object overload: the only coverage of addNote's non-numeric branch outside core
        expectGolden('primitives-v5', {
            fromLegacyColumn: ComposedSong.deserialize(v3Payload as any).serialize(),
            columnNotes: column.notes.map(note => ({trackIndex: note.trackIndex, id: note.id, span: note.span})),
            recordedNote: new RecordedNote(65, 1234, 0, 1).serialize(),
            recordedNoteWithDuration: new RecordedNote(65, 1234, 500, 0).serialize(),
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
