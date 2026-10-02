import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {ComposedSong, RecordedSong, songService} from './imports'
import {buildComposedSong, buildRecordedSong} from './builders'
import {readFixture} from './golden'
import {serializeForDownload} from '$core/Songs/legacySheetExport'
import {getSongType} from '$core/utils/Utilities'

// ADR-0007 addendum (2026-10-02): downloads carry the legacy sheet fields BESIDE the current
// format. The frozen fixtures' `oldFormatExport` members are what the pre-ADR-0007 exporter wrote
// for the same songs, so they are the expected output here - only the five legacy fields, since
// the rest of that export (`columns`, `version`) is exactly what is NOT coming back.
const LEGACY_KEYS = ['isComposed', 'pitchLevel', 'bitsPerPage', 'isEncrypted', 'songNotes'] as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- frozen fixture members are untyped JSON
const legacyFieldsOf = (value: any) => Object.fromEntries(LEGACY_KEYS.map((key) => [key, value[key]]))
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))

describe('legacy sheet fields', () => {
    it('composed: match what the pre-ADR-0007 exporter wrote for the same song', () => {
        expect(plain(buildComposedSong().legacySheetFields()))
            .toEqual(legacyFieldsOf(readFixture('composed-song-v4').oldFormatExport))
    })

    it('composed: a pre-v4 file gives the songNotes the pre-v4 exporter wrote for it', () => {
        const legacy = readFixture('composed-song')
        expect(plain(ComposedSong.deserialize(legacy.serialized).legacySheetFields()))
            .toEqual(legacyFieldsOf(legacy.oldFormatExport))
    })

    it('recorded: match what the pre-ADR-0007 exporter wrote for the same song', () => {
        expect(plain(buildRecordedSong().legacySheetFields()))
            .toEqual(legacyFieldsOf(readFixture('recorded-song-v3').oldFormatExport))
    })

    it('recorded: a pre-v3 file gives the songNotes the pre-v3 exporter wrote for it', () => {
        const legacy = readFixture('recorded-song')
        expect(plain(RecordedSong.deserialize(legacy.serialized).legacySheetFields()))
            .toEqual(legacyFieldsOf(legacy.oldFormatExport))
    })

    it('a note with no default-table button is counted and left out of songNotes only', () => {
        const song = buildComposedSong()
        const onGrid = song.legacySheetFields().songNotes.length
        expect(song.countLegacySheetDroppedNotes()).toBe(0)
        //a semitone above button 0: no white-key button sounds it, so the frozen table cannot name it
        const stranded = song.columns[0].notes[0].id + 1
        song.columns[5].addNote(0, stranded)
        expect(song.countLegacySheetDroppedNotes()).toBe(1)
        expect(song.legacySheetFields().songNotes.length).toBe(onGrid)
        const {file, droppedNotes} = serializeForDownload(song, true)
        expect(droppedNotes).toBe(1)
        expect(songService.parseSong(plain(file)).serialize()).toEqual(song.serialize())
    })
})

describe('serializeForDownload', () => {
    const songs = () => [buildComposedSong(), buildRecordedSong()]

    it('with the flag on: the whole current file plus the legacy fields', () => {
        for (const song of songs()) {
            const {file, droppedNotes} = serializeForDownload(song, true)
            const {isComposed, pitchLevel, bitsPerPage, isEncrypted, songNotes, ...current} = plain(file)
            expect(current).toEqual(plain(song.serialize()))
            expect({isComposed, pitchLevel, bitsPerPage, isEncrypted, songNotes}).toEqual(plain(song.legacySheetFields()))
            expect(droppedNotes).toBe(0)
        }
    })

    it('with the flag off: the current file only', () => {
        for (const song of songs()) {
            const {file, droppedNotes} = serializeForDownload(song, false)
            expect(plain(file)).toEqual(plain(song.serialize()))
            expect(droppedNotes).toBe(0)
        }
    })

    it('the running game config decides by default', () => {
        for (const song of songs()) {
            expect(plain(serializeForDownload(song).file))
                .toEqual(plain(serializeForDownload(song, game.features.legacySheetExport).file))
        }
    })

    // The guarantee the hybrid rests on: `songNotes` is only ever read from a file WITHOUT `data`,
    // so re-importing a download takes the lossless path, and the pre-v4 app (which needs
    // `columns`/flat `notes` to accept a composed/recorded file) rejects it cleanly instead of
    // opening a v5 song as an empty one.
    it('re-imports losslessly and is never read through songNotes', () => {
        for (const song of songs()) {
            const {file} = serializeForDownload(song, true)
            expect(file.data).toBeDefined()
            expect(getSongType(plain(file))).toBe(song instanceof ComposedSong ? 'newComposed' : 'newRecorded')
            expect(file).not.toHaveProperty('columns')
            expect(file).not.toHaveProperty('notes')
            expect(songService.parseSong(plain(file)).serialize()).toEqual(song.serialize())
        }
    })
})
