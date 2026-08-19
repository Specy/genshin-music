// ══ PRE-FLIP AUDIO PARITY — THE SAFETY NET FOR ADR-0007's FORMAT FLIP ══════════════════
//
// THESE FIXTURES MUST NOT CHANGE WHEN PHASE C's FORMAT FLIP LANDS. They record what the
// CURRENT (pre-flip) build makes of a set of committed songs: for every note, the BUTTON it
// sounds on, WHEN, and at WHAT PLAYBACK RATE — the complete description of the audio a song
// produces, minus the samples themselves. After the flip the same songs are the same files
// (v4/v3/v2 payloads, migrated on load), so the same triples must come out. A diff here is
// the flip having changed what a saved song SOUNDS LIKE, which is the one thing ADR-0007
// promises it does not do (spec §10, §12 "silent audio drift on tuned instruments").
//
// WHAT PHASE C IS ALLOWED TO EDIT IN THIS FILE: exactly one function, `resolveButton` —
// today it asks the id-keyed engine, after the flip it must ask the Basepoint-aware
// number-keyed one. Nothing else: not the payloads, not the pitches, and above all not the
// fixtures. If a triple moves, fix the flip.
//
// WHY THE PAYLOADS ARE BUILT HERE INSTEAD OF BEING COMMITTED FILES: they are v4/v3/v2 wire
// bytes assembled out of the game's own Nominal Id tables, which the flip does not touch
// (`midi` stays the instrument's nominal id, ADR-0001). A committed payload would say the
// same thing while hiding WHY each note was chosen — every one of them is here to exercise
// a named hazard, listed on the song that carries it.
//
// WHAT THE TRIPLE LEAVES OUT, and why that is not a hole: hold DURATION (spec §10 names
// button/time/rate). Durations are pure span→ms arithmetic that ADR-0007 does not touch, and
// the composed/recorded song goldens already pin them note for note; recording them here
// would add a second owner of the same fact without adding a second failure it can catch.
//
// ONE DELIBERATE OMISSION THAT IS A JUDGEMENT CALL: no Stranded Note sits on a TUNED instrument's track. Migration
// lifts a stranded id best-effort as `id + offset` (spec §4), and on a tuned instrument that
// number can equal a real Sounding Pitch — so such a note may legitimately UN-STRAND at the
// flip and start sounding. That is an accepted ADR-0007 consequence, pinned as such in
// noteNumberTransforms.test.ts; asking this suite to prove the opposite would make it lie.
// Stranded notes here live on instruments whose two axes coincide, where they stay stranded.
import {describe, expect, it} from 'vitest'
import {
    APP_NAME, CANONICAL_NOTE_IDS, ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, RecordedSong,
    songService, VsrgSong,
} from './imports'
import {expectGolden} from './golden'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {getNoteIdTable, getSoundingTable} from '../src/lib/core/Songs/noteIds'
import {getPitchChanger} from '../src/lib/core/utils/Utilities'
import type {Pitch} from '../src/lib/core/legacyConfig'

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes
/** The widest keyboard this game ships — the "ordinary track" of every song below. */
const WIDE = INSTRUMENTS.reduce((widest: string, name: string) =>
    getNoteIdTable(name).length > getNoteIdTable(widest).length ? name : widest, INSTRUMENTS[0])
/** A sub-grid instrument whose Sounding Pitches ARE its Nominal Ids: where a Stranded Note stays stranded. */
const NARROW = INSTRUMENTS.find((name: string) =>
    CANONICAL_NOTE_IDS.some(id => !getNoteIdTable(name).includes(id))
    && getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button]))!
/** Instruments with a button tuned away from its Nominal Id (genshin: Vintage-Lyre; sky: none). */
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.midi))
/** A grid id the narrow instrument has no button for — stranded, silent, and staying that way. */
const STRANDED_ID = CANONICAL_NOTE_IDS.find(id => !getNoteIdTable(NARROW).includes(id))!

type ParityEvent = [button: number, timeMs: number, rate: number]
type ParityRecording = {
    song: string
    songBasepoint: string
    tracks: {instrument: string, basepoint: string}[]
    events: ParityEvent[]
}

/**
 * THE ONE FUNCTION PHASE C REWRITES (see the header). Pre-flip: songs store Nominal Ids and
 * the engine's public API is id-keyed (ADR-0005 §4), so the Basepoint takes no part in
 * choosing the button — it only sets the rate. Post-flip: songs store Note Numbers and this
 * becomes the Basepoint-aware resolution (`numberToButton(name, pitch, stored)` /
 * whatever the engine exposes for it). `pitch` is already in the signature so that rewrite
 * touches nothing but the body.
 *
 * The REAL Instrument is used, not a re-implementation: this is the lookup `play()` and
 * `pressNote()` do, so a parity run asks the engine the same question playback does.
 */
function resolveButton(instrument: Instrument, stored: number, pitch: Pitch): number {
    return instrument.getButtonFromId(stored)
}

/** The effective Basepoint of a track — its own override, else the song's (unchanged by ADR-0007). */
function effectivePitch(trackPitch: Pitch | '', songPitch: Pitch): Pitch {
    return trackPitch || songPitch
}

/**
 * Replay a parsed song the way the surfaces do and record every note the engine would sound.
 * A composed song goes through toRecordedSong first — that is exactly how the player and
 * every export consume one, and it is where spans become milliseconds.
 *
 * A note whose button resolves to -1 is STRANDED and silent; it is recorded as -1 rather
 * than dropped, so that a note starting OR stopping to sound both show up as a diff.
 */
function record(parsed: ComposedSong | RecordedSong): ParityRecording {
    const song = parsed instanceof ComposedSong ? parsed.toRecordedSong() : parsed
    const songPitch = parsed.pitch as Pitch
    const instruments = song.instruments.map(data => new Instrument(data.name))
    return {
        song: parsed.name,
        songBasepoint: songPitch,
        tracks: song.instruments.map(data => ({instrument: data.name, basepoint: data.pitch})),
        events: song.notes.map((note): ParityEvent => {
            const data = song.instruments[note.trackIndex]
            const pitch = effectivePitch(data.pitch as Pitch | '', songPitch)
            return [resolveButton(instruments[note.trackIndex], note.id, pitch), note.time, getPitchChanger(pitch)]
        }),
    }
}

/** VSRG's own replay: one event per note of every hit object, at the object's timestamp. */
function recordVsrg(song: VsrgSong): ParityRecording {
    const songPitch = song.pitch as Pitch
    const instruments = song.tracks.map(track => new Instrument(track.instrument.name))
    const events: ParityEvent[] = []
    song.tracks.forEach((track, trackIndex) => {
        const pitch = effectivePitch(track.instrument.pitch as Pitch | '', songPitch)
        for (const hitObject of track.hitObjects) {
            for (const note of hitObject.notes) {
                events.push([resolveButton(instruments[trackIndex], note, pitch), hitObject.timestamp, getPitchChanger(pitch)])
            }
        }
    })
    return {
        song: song.name,
        songBasepoint: songPitch,
        tracks: song.tracks.map(track => ({instrument: track.instrument.name, basepoint: track.instrument.pitch})),
        events,
    }
}

const instrumentJson = (name: string, pitch: Pitch | '') => ({
    name, volume: 100, pitch, visible: true, icon: 'circle', alias: '', muted: false, reverbOverride: null,
})

/** A composed v4 payload — the wire shape the flip migrates FROM, byte-identical to what today's save writes. */
function composedPayload(name: string, pitch: Pitch, tracks: {instrument: string, pitch: Pitch | '', notes: [number, number, number?][]}[]) {
    const columns = Math.max(...tracks.flatMap(track => track.notes.map(([column]) => column))) + 4
    return {
        id: null, folderId: null, name, type: 'composed', version: 4,
        bpm: 220, pitch,
        data: {isComposed: true, isComposedVersion: true, appName: APP_NAME},
        reverb: false, breakpoints: [0],
        //two tempo changers, so the span→ms conversion has something to get wrong
        columnTempos: Array.from({length: columns}, (_, i) => (i === 2 ? 1 : i === 5 ? 3 : 0)),
        tracks: tracks.map(track => ({instrument: instrumentJson(track.instrument, track.pitch), notes: track.notes})),
    }
}

/** A recorded v3 payload (per-track [id, timeMs, durationMs?]). */
function recordedPayload(name: string, pitch: Pitch, tracks: {instrument: string, pitch: Pitch | '', notes: [number, number, number?][]}[]) {
    return {
        id: null, folderId: null, name, type: 'recorded', version: 3,
        bpm: 180, pitch, reverb: true,
        data: {isComposed: false, isComposedVersion: false, appName: APP_NAME},
        tracks: tracks.map(track => ({instrument: instrumentJson(track.instrument, track.pitch), notes: track.notes})),
    }
}

const parseComposed = (payload: unknown) => songService.parseSong(JSON.parse(JSON.stringify(payload))) as ComposedSong
const parseRecorded = (payload: unknown) => songService.parseSong(JSON.parse(JSON.stringify(payload))) as RecordedSong

/** Every button of an instrument, one per column, with a couple of held spans. */
function sweep(instrumentName: string): [number, number, number?][] {
    return getNoteIdTable(instrumentName).map((id, button): [number, number, number?] =>
        button % 5 === 3 ? [button, id, 2] : [button, id])
}

describe('audio parity (pre-flip recordings — see this file\'s header)', () => {
    // Hazards: the ordinary case (a full keyboard at a non-C song Basepoint), held spans over
    // a tempo change, a Stranded Note that must stay silent, and — where the game ships one —
    // a TUNED track carrying a per-track Basepoint override.
    it('composed song: full keyboard, spans, a stranded note, and every shipped tuned track', () => {
        const parsed = parseComposed(composedPayload('parity composed', 'E', [
            {instrument: WIDE, pitch: '', notes: sweep(WIDE)},
            {instrument: NARROW, pitch: '', notes: [
                [0, getNoteIdTable(NARROW)[0]],
                [1, getNoteIdTable(NARROW)[1], 3],
                //silent today and silent after the flip: this instrument's Sounding Pitches
                //are its Nominal Ids, so `id + offset` cannot land on one of its buttons
                [2, STRANDED_ID],
            ]},
            ...TUNED.map(name => ({instrument: name, pitch: 'Ab' as Pitch, notes: sweep(name)})),
        ]))
        expectGolden('parity-composed', record(parsed))
    })

    // Hazard: the per-track Basepoint override. Three tracks of ONE instrument play the SAME
    // ids; only their Basepoints differ, so the fixture holds three rates against identical
    // buttons — the exact thing a rewrite that forgot the per-track override would flatten.
    it('composed song: one instrument, three Basepoints (song default + two per-track overrides)', () => {
        const ids = getNoteIdTable(WIDE).slice(0, 7)
        const notes = ids.map((id, i): [number, number, number?] => [i, id])
        const parsed = parseComposed(composedPayload('parity basepoints', 'D', [
            {instrument: WIDE, pitch: '', notes},
            {instrument: WIDE, pitch: 'G', notes},
            {instrument: WIDE, pitch: 'B', notes},
        ]))
        expectGolden('parity-basepoints', record(parsed))
    })

    // Hazard: THE tuned instrument (genshin's Vintage-Lyre), whose top row sounds a semitone
    // below the nominal grid its own lower octaves sit on. Every button, twice, at two
    // Basepoints — if the flip resolves any of them through the nominal axis by mistake, the
    // buttons here move and the song plays a different chord.
    it.runIf(TUNED.length > 0)('composed song: a tuned instrument\'s whole keyboard at two Basepoints', () => {
        const tuned = TUNED[0]
        const parsed = parseComposed(composedPayload('parity tuned', 'Bb', [
            {instrument: tuned, pitch: '', notes: sweep(tuned)},
            {instrument: tuned, pitch: 'Gb', notes: sweep(tuned)},
        ]))
        expectGolden('parity-tuned', record(parsed))
    })

    // Hazard: the OTHER format. Same ground, recorded-side: real timestamps, hold durations,
    // a per-track override, a stranded note, and the tuned track where it exists.
    it('recorded song: timestamps, durations, a per-track Basepoint and a stranded note', () => {
        const wideIds = getNoteIdTable(WIDE)
        const narrowIds = getNoteIdTable(NARROW)
        const parsed = parseRecorded(recordedPayload('parity recorded', 'F', [
            {instrument: WIDE, pitch: '', notes: [
                [wideIds[0], 100], [wideIds[3], 350, 1200], [wideIds[7], 350], [wideIds[10], 900, 400],
            ]},
            {instrument: NARROW, pitch: 'Db', notes: [
                [narrowIds[0], 100], [STRANDED_ID, 350], [narrowIds[2], 900, 250],
            ]},
            ...TUNED.map(name => ({instrument: name, pitch: '' as const, notes: getNoteIdTable(name)
                .slice(0, 7)
                .map((id, i): [number, number, number?] => [id, 100 + i * 250])})),
        ]))
        expectGolden('parity-recorded', record(parsed))
    })

    // Hazard: the THIRD format. VSRG hit objects carry bare number arrays rather than note
    // objects, so its flip is a separate code path with the same failure mode.
    it('vsrg song: hit objects on two tracks, one with a per-track Basepoint', () => {
        const wideIds = getNoteIdTable(WIDE)
        const parsed = songService.parseSong({
            id: null, folderId: null, name: 'parity vsrg', type: 'vsrg', version: 2,
            bpm: 140, pitch: 'A',
            data: {isComposed: false, isComposedVersion: false, appName: APP_NAME},
            instruments: [], keys: 4, duration: 5000, audioSongId: null,
            breakpoints: [], difficulty: 5, snapPoint: 1, trackModifiers: [],
            tracks: [
                {
                    instrument: instrumentJson(WIDE, ''), color: '#FFFFFF',
                    hitObjects: [[0, 500, 0, [wideIds[0], wideIds[4]]], [2, 1200, 300, [wideIds[7]]]],
                },
                {
                    instrument: instrumentJson(NARROW, 'Eb'), color: '#d16d6d',
                    hitObjects: [[1, 800, 0, [getNoteIdTable(NARROW)[0], STRANDED_ID]]],
                },
            ],
        }) as VsrgSong
        expectGolden('parity-vsrg', recordVsrg(parsed))
    })

    it('records a silent -1 for the stranded notes, so un-stranding would show as a diff', () => {
        //guards the guard: if these payloads ever stop containing a stranded note, the
        //fixtures would keep passing while covering one hazard less
        const parsed = parseRecorded(recordedPayload('parity strand check', 'C', [
            {instrument: NARROW, pitch: '', notes: [[STRANDED_ID, 0]]},
        ]))
        expect(record(parsed).events[0][0]).toBe(-1)
    })
})
