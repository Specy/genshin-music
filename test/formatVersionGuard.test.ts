import {describe, expect, it} from 'vitest'
import {APP_NAME, ComposedSong, INSTRUMENTS, RecordedSong, songService, VsrgHitObject, VsrgSong, VsrgTrack} from './imports'
import {buildComposedSong, buildRecordedSong} from './builders'
import {AppError} from '$core/Errors'
import {fileService} from '$core/Services/FileService'

// A file written by a NEWER build than this one, in each of the three formats.
//
// Every deserializer dispatches on `version` and reads what it does not recognise as its OLDEST
// format, so before these guards a newer file decoded through the frozen legacy tables and came
// back SILENTLY EMPTY: the vsrg case below is the measured one — hit-object notes [60, 72] read
// as v1 keyboard indices produced an empty hit object and no error anywhere.
//
// Only versions ABOVE what a class knows are rejected; an unknown lower one keeps the legacy
// path it has always taken (last test in the first block).

/** A vsrg song exactly as this build writes it, carrying two Note Numbers on one hit object. */
function vsrgPayload() {
    const song = new VsrgSong('Version guard vsrg')
    const track = new VsrgTrack(INSTRUMENTS[0])
    const hitObject = new VsrgHitObject(0, 500)
    hitObject.notes = [60, 72]
    track.hitObjects = [hitObject]
    song.initTracksForConstruction([track])
    return song.serialize()
}

describe('a song from a newer app is rejected, not decoded as legacy', () => {
    it('vsrg above v3', () => {
        const current = vsrgPayload()
        //the premise: at the version this build writes, both numbers survive the round trip
        expect(VsrgSong.deserialize(current).tracks[0].hitObjects[0].notes).toEqual([60, 72])
        //...and one version up they used to be eaten by the v1 index decoder, silently
        expect(() => VsrgSong.deserialize({...current, version: VsrgSong.LATEST_VERSION + 1}))
            .toThrow(/v4.*v3/)
    })

    it('recorded above v4', () => {
        const current = buildRecordedSong().serialize()
        expect(RecordedSong.deserialize(current).notes.length).toBe(5)
        //the legacy branch reads `notes`, which a per-track file does not have: zero notes, no error
        expect(() => RecordedSong.deserialize({...current, version: RecordedSong.LATEST_VERSION + 1}))
            .toThrow(/v5.*v4/)
    })

    it('composed above v5', () => {
        const current = buildComposedSong().serialize()
        expect(ComposedSong.deserialize(current).columns[0].notes.length).toBe(3)
        //this one used to throw anyway, but incidentally (deserializeLegacy reading absent
        //`columns`), so the message named an internal shape rather than the version
        expect(() => ComposedSong.deserialize({...current, version: ComposedSong.LATEST_VERSION + 1} as never))
            .toThrow(/v6.*v5/)
    })

    it('an unknown LOWER version still takes the legacy path it always had', () => {
        //v1 recorded: no version field at all, notes as [index, time] pairs
        const v1 = {
            name: 'Legacy v1', bpm: 220, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: APP_NAME},
            notes: [[0, 100], [5, 400]],
        }
        expect(RecordedSong.deserialize(v1 as never).notes.length).toBe(2)
        expect(() => VsrgSong.deserialize({...vsrgPayload(), version: 0})).not.toThrow()
    })
})

describe('the version knowledge lives on the song classes', () => {
    it('LATEST_VERSION is the version serialize() writes', () => {
        expect(vsrgPayload().version).toBe(VsrgSong.LATEST_VERSION)
        expect(buildRecordedSong().serialize().version).toBe(RecordedSong.LATEST_VERSION)
        expect(buildComposedSong().serialize().version).toBe(ComposedSong.LATEST_VERSION)
    })

    // SongService's cross-game dispatch asks these instead of restating the version lists, so a
    // bump that forgot the service would have routed a new-format file into the legacy remap.
    it('isNewFormat covers the version this build writes, and none of the legacy ones', () => {
        expect(VsrgSong.isNewFormat({version: VsrgSong.LATEST_VERSION})).toBe(true)
        expect(RecordedSong.isNewFormat({version: RecordedSong.LATEST_VERSION})).toBe(true)
        expect(ComposedSong.isNewFormat({version: ComposedSong.LATEST_VERSION})).toBe(true)
        expect(VsrgSong.isNewFormat({version: 1})).toBe(false)
        expect(RecordedSong.isNewFormat({version: 2})).toBe(false)
        expect(ComposedSong.isNewFormat({version: 3})).toBe(false)
        expect(ComposedSong.isNewFormat({})).toBe(false)
    })
})

describe('the rejection reaches the import path as a per-song failure', () => {
    it('parseSong throws for each format, with a message the import UI can show', () => {
        const payloads = [
            {...vsrgPayload(), version: VsrgSong.LATEST_VERSION + 1},
            {...buildRecordedSong().serialize(), version: RecordedSong.LATEST_VERSION + 1},
            {...buildComposedSong().serialize(), version: ComposedSong.LATEST_VERSION + 1},
        ]
        for (const payload of payloads) {
            let thrown: unknown
            try {
                songService.parseSong(JSON.parse(JSON.stringify(payload)))
            } catch (e) {
                thrown = e
            }
            //exactly what FileService.importUnknownFile's per-song catch does with it
            expect(AppError.getMessageFromAny(thrown)).toMatch(/only reads up to/)
        }
    })

    // The cross-game route is the one that re-enumerated the version lists: a Sky file whose
    // version this build does not know must be REJECTED, not fed to the legacy frozen-table remap.
    it.runIf(APP_NAME === 'Genshin')('a Sky song from a newer app is rejected by parseSong too', () => {
        const composed = buildComposedSong().serialize()
        const payload = {
            ...composed,
            version: ComposedSong.LATEST_VERSION + 1,
            data: {...composed.data, appName: 'Sky'},
        }
        expect(() => songService.parseSong(JSON.parse(JSON.stringify(payload)))).toThrow(/v6/)
    })

    it('importing a folder of songs fails only the newer one', async () => {
        const good = {...buildComposedSong().serialize(), name: 'Readable'}
        const bad = {
            ...buildRecordedSong().serialize(),
            name: 'From a newer app',
            version: RecordedSong.LATEST_VERSION + 1,
        }
        const result = await fileService.importUnknownFile(JSON.parse(JSON.stringify([good, bad])))
        expect(result.getSongErrors().map(error => error.file.name)).toEqual(['From a newer app'])
        expect(result.getSongErrors()[0].error).toMatch(/only reads up to/)
        expect(result.successful.map(file => (file as {name: string}).name)).toEqual(['Readable'])
    })
})
