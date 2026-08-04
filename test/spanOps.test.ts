// Phase-C span (Duration) model tests: covering lookup, clamped span setting, and the
// no-overlap invariant re-enforced after bulk edits (see CONTEXT.md: Duration).
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA} from './imports'

function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].midiNotes[button]
}

function makeSong(): ComposedSong {
    return new ComposedSong('spans', [INSTRUMENTS[0], INSTRUMENTS[1]])
}

describe('getSpanCovering', () => {
    it('finds the covering note through its span and rejects columns at/after the span end', () => {
        const song = makeSong()
        song.columns[2].addNote(0, idOf(0), 4) // covers columns 2..5
        expect(song.getSpanCovering(3, 0, idOf(0))?.startColumn).toBe(2)
        expect(song.getSpanCovering(5, 0, idOf(0))?.startColumn).toBe(2)
        expect(song.getSpanCovering(6, 0, idOf(0))).toBeNull() // first column past the span
        expect(song.getSpanCovering(2, 0, idOf(0))).toBeNull() // the start column is not "covered"
    })

    it('is per-track and per-id', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), 5)
        expect(song.getSpanCovering(2, 1, idOf(0))).toBeNull() // other track
        expect(song.getSpanCovering(2, 0, idOf(1))).toBeNull() // other id
    })

    it('the nearest same-id note going backwards decides (no-overlap invariant)', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), 10) // would cover 0..9 …
        song.columns[4].addNote(0, idOf(0), 1)  // …but a nearer note sits at 4
        song.normalizeSpans() // truncates the first to span 4
        expect(song.getSpanCovering(6, 0, idOf(0))).toBeNull() // nearer note (span 1) doesn't cover 6
        expect(song.getSpanCovering(3, 0, idOf(0))?.startColumn).toBe(0)
    })
})

describe('setNoteSpan / maxSpanAt', () => {
    it('clamps to the next same-(track,id) note and to the song end', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0))
        song.columns[6].addNote(0, idOf(0))
        expect(song.maxSpanAt(0, 0, idOf(0))).toBe(6)
        expect(song.setNoteSpan(0, 0, idOf(0), 99)).toBe(6)
        //the last note can reach exactly the song end (100 columns)
        expect(song.setNoteSpan(6, 0, idOf(0), 999)).toBe(94)
        //span floor is 1
        expect(song.setNoteSpan(0, 0, idOf(0), -5)).toBe(1)
    })

    it('returns null for a nonexistent note', () => {
        const song = makeSong()
        expect(song.setNoteSpan(0, 0, idOf(0), 2)).toBeNull()
    })
})

describe('normalizeSpans after bulk edits', () => {
    it('column removal shrinks spans by their removed tail columns, then re-truncates against neighbors (decided 2026-08-04)', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), 5) // covers 0..4
        song.columns[6].addNote(0, idOf(0))
        song.removeColumns(3, 2) // removes covered tails 2,3,4 → span 5-3 = 2; the note at 6 moves to 3, no overlap left
        expect(song.columns[0].findNote(0, idOf(0))?.span).toBe(2)
        expect(song.columns[3].findNote(0, idOf(0))).toBeTruthy()
    })

    it('insert-paste merging keeps the invariant', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), 6)
        const other = makeSong()
        other.columns[0].addNote(0, idOf(0)) // will land at column 3 (selected) via insert-paste
        song.selected = 3
        const copied = other.copyColumns([0], 'all')
        return song.pasteColumns(copied, true).then(() => {
            expect(song.columns[0].findNote(0, idOf(0))?.span).toBe(3) // truncated before the pasted note
            expect(song.columns[3].findNote(0, idOf(0))).toBeTruthy()
        })
    })

    it('spans survive serialization round-trip', () => {
        const song = makeSong()
        song.columns[2].addNote(1, idOf(3), 4)
        const serialized = song.serialize()
        const track1Notes = serialized.tracks[1].notes
        expect(track1Notes).toContainEqual([2, idOf(3), 4])
        const roundtrip = ComposedSong.deserialize(serialized)
        expect(roundtrip.columns[2].findNote(1, idOf(3))?.span).toBe(4)
    })

    it('removing tail columns shrinks the span; removing the start removes the note (decided 2026-08-04)', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), 5) // covers 0..4
        song.removeColumns(2, 2) // removes covered tail columns 2 and 3
        expect(song.columns[0].findNote(0, idOf(0))?.span).toBe(3)
        song.removeColumns(1, 0) // removes the start column — the note goes with it
        expect(song.columns.flatMap(c => c.notes).length).toBe(0)
    })

    it('inserting inside a span stretches it; inserting exactly at its end does not (decided 2026-08-04)', () => {
        const song = makeSong()
        song.columns[1].addNote(0, idOf(0), 3) // covers 1..3
        song.addColumns(2, 1) // insertion point 2 — strictly inside
        expect(song.columns[1].findNote(0, idOf(0))?.span).toBe(5)
        song.addColumns(1, 5) // insertion point 6 — exactly past the last covered column (5): unchanged
        expect(song.columns[1].findNote(0, idOf(0))?.span).toBe(5)
        song.addColumns(1, 0) // insertion before the start: note shifts, span unchanged
        expect(song.columns[2].findNote(0, idOf(0))?.span).toBe(5)
    })

    it('normalizeSpans sanitizes NaN/fractional/zero spans to finite integers ≥ 1', () => {
        const song = makeSong()
        song.columns[0].addNote(0, idOf(0), NaN)
        song.columns[1].addNote(0, idOf(1), 2.6)
        song.columns[2].addNote(0, idOf(2), 0)
        song.normalizeSpans()
        expect(song.columns[0].findNote(0, idOf(0))?.span).toBe(1)
        expect(song.columns[1].findNote(0, idOf(1))?.span).toBe(3)
        expect(song.columns[2].findNote(0, idOf(2))?.span).toBe(1)
    })

    it('malformed v4 files import cleanly: spans clamp, duplicates merge, missing notes array tolerated', () => {
        const instrument = {
            name: INSTRUMENTS[0], volume: 100, pitch: '', visible: true,
            icon: 'circle', alias: '', muted: false, reverbOverride: null,
        }
        const payload = {
            id: null, folderId: null, name: 'malformed', type: 'composed', version: 4,
            bpm: 220, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName: makeSong().data.appName},
            reverb: false, breakpoints: [],
            columnTempos: [0, 0, 0],
            tracks: [
                {instrument, notes: [[0, idOf(0), 99], [1, idOf(0)], [1, idOf(0), 5]]},
                {instrument}, //no notes array at all
            ],
        }
        const parsed = ComposedSong.deserialize(payload as any)
        //span 99 clamps at the next same-id note (column 1)
        expect(parsed.columns[0].findNote(0, idOf(0))?.span).toBe(1)
        //duplicate (column, track, id) entries merged keeping the longest span — then
        //clamped to the 3-column timeline (5 → 2 columns remain from column 1)
        expect(parsed.columns[1].notesOfTrack(0).length).toBe(1)
        expect(parsed.columns[1].findNote(0, idOf(0))?.span).toBe(2)
        expect(parsed.instruments.length).toBe(2)
    })

    it('toRecordedSong turns spans into summed column ms (span 1 stays duration-less)', () => {
        const song = makeSong()
        song.bpm = 60 // 1000ms per plain column
        song.columns[0].addNote(0, idOf(0), 3)
        song.columns[0].addNote(1, idOf(2))
        song.columns[1].tempoChanger = 1 // half-length column inside the span
        const recorded = song.toRecordedSong(0)
        const held = recorded.notes.find(n => n.trackIndex === 0)!
        const plain = recorded.notes.find(n => n.trackIndex === 1)!
        expect(held.duration).toBe(1000 + 500 + 1000)
        expect(plain.duration).toBe(0)
    })
})
