import {describe, it} from 'vitest'
import {INSTRUMENTS, VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from './imports'
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
    song.tracks = [track]
    const modifier = new VsrgTrackModifier()
    modifier.alias = 'muted layer'
    modifier.muted = true
    song.trackModifiers = [modifier]
    return song
}

// vsrg-v2 rewrite (2026-08-03): `vsrg-song.json` is the frozen pre-v2 fixture — its
// `serialized` member is a real v1 file (hitObject.notes as keyboard indices) and now
// serves as the LEGACY INPUT; v2 outputs (notes as Note Ids) live in `vsrg-song-v2.json`.
describe('VsrgSong formats', () => {
    it('v2 serialize / roundtrip / legacy v1 conversion are stable', () => {
        const legacy = readFixture('vsrg-song')
        const song = buildVsrgSong()
        const serialized = song.serialize()
        expectGolden('vsrg-song-v2', {
            serialized,
            roundtrip: VsrgSong.deserialize(serialized).serialize(),
            fromLegacyV1: VsrgSong.deserialize(legacy.serialized).serialize(),
            defaults: new VsrgSong('Empty vsrg').serialize(),
        })
    })
})
