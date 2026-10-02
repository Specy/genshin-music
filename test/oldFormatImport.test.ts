import {describe, expect, it} from 'vitest'
import {ComposedSong, RecordedSong, songService} from './imports'
import {expectGolden, readFixture} from './golden'

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
}

// Old-format (pre-versioned Sky) payloads, hand-written like a real legacy
// download: no `data`/`type` fields, so getSongType() (src/lib/utils/Utilities.ts)
// detects them via the `songNotes` array ("oldSky") and songService.parseSong
// routes them through RecordedSong.fromOldFormat (src/lib/Songs/RecordedSong.ts:304-332).
// This is the hottest legacy path: it's what the live Sky app's default download
// produces.
//
// Each songNotes entry below exercises a different branch of fromOldFormat's parsing:
// - {time: 0,   key: '1Key0'}       plain layer-1 note (data[0]="1", no `l` -> NoteLayer(1))
// - {time: 100, key: '1Key1'}       another plain layer-1 note, different key index
// - {time: 200, key: '2Key5'}       layer-2 note (data[0]="2" -> NoteLayer(2), binary '10')
// - {time: 300, key: '1Key2'}       the surviving half of the dedup pair below
// - {time: 300, key: '2Key2'}       duplicate of the note above: fromOldFormat's dedup
//                                   filter matches on `key.split('Key')[1]` (the index)
//                                   + `time` only, NOT the layer prefix, so this second
//                                   occurrence at the same time+index is dropped
// - {time: 400, key: '1Key4', l: 3} an explicit `l` field overrides the "Key"-prefix layer
//                                   number: fromOldFormat reads `note.l ?? Number(data[0])`,
//                                   so this becomes NoteLayer(3) (binary '11'), not NoteLayer(1)
const OLD_FORMAT_SONG_NOTES = [
    {time: 0, key: '1Key0'},
    {time: 100, key: '1Key1'},
    {time: 200, key: '2Key5'},
    {time: 300, key: '1Key2'},
    {time: 300, key: '2Key2'},
    {time: 400, key: '1Key4', l: 3},
]

function buildOldFormatPayload(isComposed: boolean) {
    return {
        name: isComposed ? 'Old composed' : 'Old recorded',
        bpm: 220,
        pitchLevel: 0,
        bitsPerPage: 16,
        isComposed,
        isEncrypted: false,
        songNotes: OLD_FORMAT_SONG_NOTES,
    }
}

describe('old-format (pre-versioned Sky) import', () => {
    it('recorded and composed old-format payloads parse through songService.parseSong', () => {
        // isComposed: true makes fromOldFormat itself route the parsed RecordedSong
        // through toComposedSong() before returning (see the source);
        // isComposed: false returns the RecordedSong as-is. Runs on both games:
        // the frozen importPositions are per-game, so the resulting Note Ids differ
        // between the Genshin and Sky fixtures even though the input songNotes
        // (key indexes) are identical — that's the point of running both.
        // Format rewrite (2026-08-03): `old-format-import.json` holds the PRE-v4 parser's
        // output (legacy serializations) and serves as the conversion parity reference.
        const recordedPayload = buildOldFormatPayload(false)
        const composedPayload = buildOldFormatPayload(true)
        const recorded = songService.parseSong(clone(recordedPayload))
        const composed = songService.parseSong(clone(composedPayload))
        expectGolden('old-format-import-v5', {
            recorded: recorded.serialize(),
            composed: composed.serialize(),
        })
        const preV4 = readFixture('old-format-import')
        expect(clone(RecordedSong.deserialize(preV4.recorded).serialize()))
            .toEqual(clone(recorded.serialize()))
        expect(clone(ComposedSong.deserialize(preV4.composed).serialize()))
            .toEqual(clone(composed.serialize()))
        //ADR-0007 (2026-08-19): the same parity one generation on — `old-format-import-v4.json`
        //is the PRE-FLIP parser's v4/v3 output, and migrating it must land where we land now
        const preFlip = readFixture('old-format-import-v4')
        expect(clone(RecordedSong.deserialize(preFlip.recorded).serialize()))
            .toEqual(clone(recorded.serialize()))
        expect(clone(ComposedSong.deserialize(preFlip.composed).serialize()))
            .toEqual(clone(composed.serialize()))
    })
})
