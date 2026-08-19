import {describe, expect, it} from 'vitest'
import {
    APP_NAME,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    VsrgHitObject,
    VsrgSong,
    VsrgTrack,
    VsrgTrackModifier,
} from './imports'
import {expectGolden, readFixture} from './golden'

function buildVsrgSong(): VsrgSong {
    const song = new VsrgSong('Golden vsrg')
    song.bpm = 140
    song.keys = 6
    song.duration = 30000
    song.difficulty = 7
    const track = new VsrgTrack(INSTRUMENTS[0], 'lead')
    const hit1 = new VsrgHitObject(0, 500)
    const hit2 = new VsrgHitObject(3, 1250)
    track.hitObjects = [hit1, hit2]
    track.color = '#FF0000'
    //the construction-only installer: `song.tracks = [track]` no longer compiles OR runs - #tracks
    //is private behind a getter since the 2026-08-06 plan's phase 2
    song.initTracksForConstruction([track])
    const modifier = new VsrgTrackModifier()
    modifier.alias = 'muted layer'
    modifier.muted = true
    song.trackModifiers = [modifier]
    return song
}

// vsrg-v2 rewrite (2026-08-03): `vsrg-song.json` is the frozen pre-v2 fixture — its
// `serialized` member is a real v1 file (hitObject.notes as keyboard indices) and now
// serves as the LEGACY INPUT. ADR-0007 (2026-08-19) froze `vsrg-song-v2.json` the same
// way: its `serialized` member is a real v2 file (Nominal Ids) and is now the MIGRATION
// INPUT; v3 outputs (absolute Note Numbers) live in `vsrg-song-v3.json`.
describe('VsrgSong formats', () => {
    it('v3 serialize / roundtrip / v2 migration / legacy v1 conversion are stable', () => {
        const legacy = readFixture('vsrg-song')
        const song = buildVsrgSong()
        const serialized = song.serialize()
        expectGolden('vsrg-song-v3', {
            serialized,
            roundtrip: VsrgSong.deserialize(serialized).serialize(),
            fromV2: VsrgSong.deserialize(readFixture('vsrg-song-v2').serialized).serialize(),
            fromLegacyV1: VsrgSong.deserialize(legacy.serialized).serialize(),
            defaults: new VsrgSong('Empty vsrg').serialize(),
        })
    })
})

/** Note Id of a button on the game's default instrument. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/**
 * A song with a non-default value in every field a conversion could drop, and one of each kind of
 * hit object. Deliberately NOT buildVsrgSong() above, which is frozen golden-fixture input - giving
 * it more content would move a fixture.
 */
function buildFullSong(): VsrgSong {
    const song = new VsrgSong('Conversion source')
    song.set({
        id: 'song-id',
        folderId: 'folder-id',
        bpm: 145,
        pitch: 'D',
        keys: 6,
        duration: 42000,
        difficulty: 9,
        snapPoint: 4,
        audioSongId: 'audio-song-id',
        breakpoints: [1000, 2000],
    })
    const track = new VsrgTrack(INSTRUMENTS[0], 'lead')
    track.color = '#00FF00'
    const tap = new VsrgHitObject(1, 500)
    tap.notes = [idOf(0), idOf(2)]
    const held = new VsrgHitObject(2, 1500)
    held.notes = [idOf(1)]
    held.holdDuration = 400
    held.isHeld = true
    track.hitObjects = [tap, held]
    song.initTracksForConstruction([track])
    song.trackModifiers = [
        new VsrgTrackModifier().set({hidden: true, muted: true, alias: 'background lead'}),
    ]
    return song
}

/**
 * The vsrg counterpart of composedSong.test.ts's 'every conversion carries the song playback
 * settings across', and it exists for the same reason: two fields were found dropped one at a time
 * (VsrgSong.clone() lost `snapPoint`, VsrgTrackModifier.clone() lost `alias`) because nothing
 * asserted the general rule. Both were on the cross-game import path, which converts THROUGH
 * clone(), so a converted song came out with the wrong snap grid and every background-track name
 * blanked.
 *
 * Written as "what must be identical", not as a list of fields to check, so the next field added to
 * VsrgSong is covered without anyone remembering to come back here.
 */
describe('every VsrgSong conversion carries the whole song across', () => {
    it('clone() copies everything: its serialize() equals the original\'s', () => {
        const song = buildFullSong()
        //the strongest form available - serialize() is the persisted surface, so any field clone()
        //forgets shows up here as a difference rather than as a field nobody thought to compare
        expect(song.clone().serialize()).toEqual(song.serialize())
    })

    it('toOtherGame changes the instruments and the note ids, and carries the rest', () => {
        const song = buildFullSong()
        //toOtherGame only converts INTO the running game, and only from another one
        song.data.appName = APP_NAME === 'Genshin' ? 'Sky' : 'Genshin'
        const converted = song.toOtherGame(APP_NAME)

        //`data` (appName is rewritten by definition) and `tracks` (instruments and note ids are
        //what the conversion IS) are the two it is allowed to change; everything else must survive
        const {data: _sourceData, tracks: _sourceTracks, ...carried} = song.serialize()
        const {data: _convertedData, tracks: _convertedTracks, ...convertedCarried} = converted.serialize()
        expect(convertedCarried).toEqual(carried)

        //and inside the tracks, only those two things moved: colours and every hit object's
        //placement are still the ones the user drew
        const placement = (s: VsrgSong) => s.tracks.map(track => ({
            color: track.color,
            hitObjects: track.hitObjects.map(hitObject => ({
                index: hitObject.index,
                timestamp: hitObject.timestamp,
                holdDuration: hitObject.holdDuration,
                isHeld: hitObject.isHeld,
            })),
        }))
        expect(placement(converted)).toEqual(placement(song))
    })
})

/** ADR-0007's vsrg half: the same rule as ComposedSong's, over hit-object number arrays. */
describe('a Basepoint change moves the vsrg hit objects', () => {
    const numbersOf = (song: VsrgSong, trackIndex: number) =>
        song.tracks[trackIndex].hitObjects.flatMap(hitObject => hitObject.notes)

    it('moves every track that follows the song and leaves an overriding one alone', () => {
        const song = buildFullSong()
        const second = new VsrgTrack(INSTRUMENTS[0])
        second.instrument.pitch = 'F'
        const held = new VsrgHitObject(0, 500)
        held.notes = [idOf(0), idOf(1)]
        second.hitObjects = [held]
        song.initTracksForConstruction([...song.tracks, second])
        const before = [numbersOf(song, 0), numbersOf(song, 1)]

        song.set({pitch: 'E'})
        song.applyBasepointChange('song', 'D', 'E')

        expect(numbersOf(song, 0)).toEqual(before[0].map(n => n + 2))
        expect(numbersOf(song, 1)).toEqual(before[1])
    })

    it('ASSIGNS a fresh notes array rather than editing one in place', () => {
        //VsrgHitObject's own convention, and what the mini keyboard's `{#each}` reacts to
        const song = buildFullSong()
        const original = song.tracks[0].hitObjects[0].notes
        song.applyBasepointChange('song', 'D', 'E')
        expect(song.tracks[0].hitObjects[0].notes).not.toBe(original)
    })
})

describe('VsrgSong.deleteTrack addresses a track or does nothing', () => {
    // The guard is a deliberate behaviour change, not a preserved quirk - see deleteTrack's own
    // comment. The old body was a bare splice(), so a negative index deleted from the END.
    it('a negative index deletes nothing, where splice() would have removed the last track', () => {
        const song = new VsrgSong('delete')
        song.addTrack(INSTRUMENTS[0])
        song.addTrack(INSTRUMENTS[0])
        const before = [...song.tracks]
        song.deleteTrack(-1)
        expect(song.tracks).toEqual(before)
    })

    it('an index past the end deletes nothing', () => {
        const song = new VsrgSong('delete')
        song.addTrack(INSTRUMENTS[0])
        song.deleteTrack(9)
        expect(song.tracks.length).toBe(1)
    })

    it('an index that addresses a track removes that one', () => {
        const song = new VsrgSong('delete')
        const first = song.addTrack(INSTRUMENTS[0])
        const second = song.addTrack(INSTRUMENTS[0])
        song.deleteTrack(0)
        expect(song.tracks).toEqual([second])
        expect(song.tracks).not.toContain(first)
    })
})
