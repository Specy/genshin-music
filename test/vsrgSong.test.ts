import {describe, it} from 'vitest'
import {INSTRUMENTS, VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from './imports'
import {expectGolden} from './golden'

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

describe('VsrgSong formats', () => {
    it('serialize and roundtrip are stable', () => {
        const song = buildVsrgSong()
        const serialized = song.serialize()
        expectGolden('vsrg-song', {
            serialized,
            roundtrip: VsrgSong.deserialize(serialized).serialize(),
            defaults: new VsrgSong('Empty vsrg').serialize(),
        })
    })
})
