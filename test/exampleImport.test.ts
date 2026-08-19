import {describe, expect, it} from 'vitest'
import {ComposedSong, Folder, RecordedSong, songService, Theme, VsrgSong} from './imports'
import {expectGolden, readFixture, readInput} from './golden'

// Both example files are arrays (the backup/multi-song download format:
// FileService.downloadFiles writes JSON.stringify(files)).
function parseAll(fileName: string) {
    const content = readInput(fileName)
    const files = Array.isArray(content) ? content : [content]
    return files.map(file => songService.parseSong(JSON.parse(JSON.stringify(file))).serialize())
}

describe('real example files parse through the import pipeline', () => {
    it('example .skysheet files import identically', () => {
        // Format rewrite (2026-08-03): `example-import.json` holds the PRE-v4 parser's output
        // (legacy serializations) and serves as the conversion parity reference below.
        // ADR-0007 (2026-08-19): `example-import-v4.json` is the same thing one generation on —
        // the PRE-FLIP parser's v4/v3 output, now a migration input.
        const composed = parseAll('example-composed.skysheet.json')
        const recorded = parseAll('example-recorded.skysheet.json')
        expectGolden('example-import-v5', {composed, recorded})
        const preV4 = readFixture('example-import')
        expect(preV4.composed.map((file: any) =>
            JSON.parse(JSON.stringify(ComposedSong.deserialize(file).serialize()))
        )).toEqual(composed)
        expect(preV4.recorded.map((file: any) =>
            JSON.parse(JSON.stringify(RecordedSong.deserialize(file).serialize()))
        )).toEqual(recorded)
        //the same equality one generation on: loading the pre-flip output and re-saving it
        //must land on exactly what the current parser produces from the original files
        const preFlip = readFixture('example-import-v4')
        expect(preFlip.composed.map((file: any) =>
            JSON.parse(JSON.stringify(ComposedSong.deserialize(file).serialize()))
        )).toEqual(composed)
        expect(preFlip.recorded.map((file: any) =>
            JSON.parse(JSON.stringify(RecordedSong.deserialize(file).serialize()))
        )).toEqual(recorded)
    })
})

describe('backup file format detection', () => {
    it('every element of a mixed backup array is detected as the right kind', () => {
        // Mirrors FileService.getSerializedObjectType: backups are arrays mixing
        // songs, folders, and themes; detection uses these static type checks.
        const composedFile = readInput('example-composed.skysheet.json')
        const song = Array.isArray(composedFile) ? composedFile[0] : composedFile
        const folder = {type: 'folder', id: 'f1', name: 'Backup folder', filterType: 'date-created'}
        const theme = {type: 'theme', id: null, editable: true, data: {}, other: {name: 'Backup theme'}}
        const oldFormatSong = {name: 'old', songNotes: [{time: 100, key: '1Key0'}], pitchLevel: 0}
        const backup = [song, folder, theme, oldFormatSong]
        expectGolden('backup-detection', backup.map(item => ({
            composed: ComposedSong.isSerializedType(item),
            recorded: RecordedSong.isSerializedType(item),
            vsrg: VsrgSong.isSerializedType(item),
            folder: Folder.isSerializedType(item),
            theme: Theme.isSerializedType(item),
            oldComposed: ComposedSong.isOldFormatSerializedType(item),
            oldRecorded: RecordedSong.isOldFormatSerializedType(item),
        })))
    })
})
