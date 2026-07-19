import {describe, it} from 'vitest'
import {ComposedSong, Folder, RecordedSong, songService, Theme, VsrgSong} from './imports'
import {expectGolden, readInput} from './golden'

// Both example files are arrays (the backup/multi-song download format:
// FileService.downloadFiles writes JSON.stringify(files)).
function parseAll(fileName: string) {
    const content = readInput(fileName)
    const files = Array.isArray(content) ? content : [content]
    return files.map(file => songService.parseSong(JSON.parse(JSON.stringify(file))).serialize())
}

describe('real example files parse through the import pipeline', () => {
    it('example .skysheet files import identically', () => {
        expectGolden('example-import', {
            composed: parseAll('example-composed.skysheet.json'),
            recorded: parseAll('example-recorded.skysheet.json'),
        })
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
