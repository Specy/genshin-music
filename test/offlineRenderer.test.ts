// THE PLANNER HALF of the offline renderer (src/lib/audio/OfflineSongRenderer.ts).
//
// jsdom ships no OfflineAudioContext, so the executor cannot run here at all - which is exactly
// why the module is split. Everything a render can be MUSICALLY wrong about lives in the plan:
// which tracks sound, at what Basepoint, whether a note is a held press or a plain trigger, when
// it lands, where its volume node routes, and how long the buffer has to be. That is what this
// file holds; building nodes and calling startRendering is the part no assertion here can reach.
//
// Instruments are picked out of the running game's config rather than named, because the suite
// runs once per game (PUBLIC_GAME) and the two rosters have nothing in common - the same idiom
// audioParity.test.ts uses for its WIDE/NARROW/TUNED instruments.
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, TEMPO_CHANGERS} from './imports'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {
    planSongRender,
    renderLengthS,
    type RenderTailBounds,
    type SongRenderPlan,
} from '../src/lib/audio/OfflineSongRenderer'
import {nominalToNumber} from '$core/Songs/noteIds'
import type {Pitch} from '$core/legacyConfig'

/**
 * An instrument that Sustains - a duration>0 note on it is a held press. Every song below is
 * built on one, so a game whose roster had none would fail here rather than quietly stop
 * covering the press branch.
 */
const SUSTAINING = INSTRUMENTS.find((name: string) => new Instrument(name).supportsSustain)!
/** One that does not: it ignores Duration, so the same note is a plain trigger. */
const ONE_SHOT = INSTRUMENTS.find((name: string) => !new Instrument(name).supportsSustain)

const SONG_PITCH: Pitch = 'D'
const TRACK_PITCH: Pitch = 'G'

/** The Note Number entering button `button` of `instrument` at Basepoint `pitch` produces. */
function numberOf(instrument: string, pitch: Pitch, button: number): number {
    const notes = INSTRUMENTS_DATA[instrument as keyof typeof INSTRUMENTS_DATA].notes
    return nominalToNumber(instrument, pitch, notes[button].nominal)
}

const SUSTAIN_TRACK = 0
const ONE_SHOT_TRACK = 1
const MUTED_TRACK = 2
const OVERRIDE_TRACK = 3

/**
 * Four tracks, each carrying one hazard: spans and taps on a Sustaining instrument, a spanned
 * note on an instrument that cannot sustain, a muted track with real notes in it, and a track
 * with its own Basepoint. Tempo changers are set so the span->ms arithmetic is heterogeneous.
 *
 * Instrument settings are applied BEFORE any note is added: setInstrument rewrites a track's
 * Note Numbers when its Basepoint moves, and there is nothing to rewrite yet at this point.
 */
function buildSong(reverb = false): ComposedSong {
    const song = new ComposedSong('offline render', [
        SUSTAINING,
        ONE_SHOT ?? SUSTAINING,
        SUSTAINING,
        SUSTAINING,
    ])
    song.bpm = 220
    song.pitch = SONG_PITCH
    song.reverb = reverb
    song.setInstrument(MUTED_TRACK, song.instruments[MUTED_TRACK].clone().set({muted: true}))
    song.setInstrument(OVERRIDE_TRACK, song.instruments[OVERRIDE_TRACK].clone().set({pitch: TRACK_PITCH}))
    // a mixed tempo grid, so a span's milliseconds are not just a multiple of one column
    ;[1, 3, 5].forEach((column, i) => song.setTempoChangerAt(column, TEMPO_CHANGERS[i + 1]))

    const sustaining = (button: number) => numberOf(SUSTAINING, SONG_PITCH, button)
    // tap, span, tap - so one track holds both planned kinds
    song.addNoteAt(0, SUSTAIN_TRACK, sustaining(0))
    song.addNoteAt(1, SUSTAIN_TRACK, sustaining(2), 4)
    song.addNoteAt(6, SUSTAIN_TRACK, sustaining(3))
    // a spanned note on the instrument that ignores Duration
    song.addNoteAt(0, ONE_SHOT_TRACK, numberOf(ONE_SHOT ?? SUSTAINING, SONG_PITCH, 1), 3)
    // real notes on the muted track: the plan has to leave something out, not nothing
    song.addNoteAt(0, MUTED_TRACK, sustaining(4))
    song.addNoteAt(2, MUTED_TRACK, sustaining(5), 2)
    // entered at the track's own Basepoint, where its player would enter it
    song.addNoteAt(1, OVERRIDE_TRACK, numberOf(SUSTAINING, TRACK_PITCH, 6), 2)
    return song
}

const planOf = (song: ComposedSong): SongRenderPlan => planSongRender(song.toRecordedSong(0))
const eventsOfTrack = (plan: SongRenderPlan, trackIndex: number) =>
    plan.events.filter(event => event.trackIndex === trackIndex)

describe('what the plan renders', () => {
    it('renders at CD rate in stereo', () => {
        const plan = planOf(buildSong())
        expect(plan.sampleRate).toBe(44100)
        expect(plan.channelCount).toBe(2)
    })

    it('places every event at the second its millisecond onset names', () => {
        const song = buildSong()
        const recorded = song.toRecordedSong(0)
        const plan = planSongRender(recorded)
        const audible = recorded.notes.filter(note => note.trackIndex !== MUTED_TRACK)
        expect(plan.events.map(event => event.atS)).toEqual(audible.map(note => note.time / 1000))
        expect(plan.events.map(event => event.id)).toEqual(audible.map(note => note.id))
        //...and the conversion really does emit times the division has to divide
        expect(audible.some(note => note.time > 0)).toBe(true)
    })

    it('points every event back at the note of the song it came from', () => {
        //ADR-0009: the player's sheet cursor, chunk position and keyboard flash are keyed by a
        //note's index in the song, and the plan is what carries them back to it.
        const recorded = buildSong().toRecordedSong(0)
        const plan = planSongRender(recorded)
        plan.events.forEach(event => {
            const note = recorded.notes[event.noteIndex]
            expect(note).toBeDefined()
            expect(note.trackIndex).toBe(event.trackIndex)
            expect(note.id).toBe(event.id)
            expect(note.time / 1000).toBe(event.atS)
        })
        //the indexes SKIP the muted track's notes rather than renumbering around them, which is
        //the whole reason a caller cannot just count events
        expect(plan.events.map(event => event.noteIndex)).toEqual(
            recorded.notes
                .map((note, index) => ({note, index}))
                .filter(({note}) => note.trackIndex !== MUTED_TRACK)
                .map(({index}) => index)
        )
        //non-vacuity: something really was left out, so the two numberings differ
        expect(plan.events.length).toBeLessThan(recorded.notes.length)
    })

    it('leaves a muted track out entirely, notes and all', () => {
        const song = buildSong()
        const plan = planOf(song)
        expect(plan.tracks[MUTED_TRACK].audible).toBe(false)
        expect(eventsOfTrack(plan, MUTED_TRACK)).toEqual([])
        //non-vacuity: there are notes on that track for the plan to have dropped
        expect(song.toRecordedSong(0).notes.some(note => note.trackIndex === MUTED_TRACK)).toBe(true)
    })

    it('narrows to the solo set, and a muted track inside it still says nothing', () => {
        const song = buildSong()
        song.setInstrument(OVERRIDE_TRACK, song.instruments[OVERRIDE_TRACK].clone().set({solo: true}))
        song.setInstrument(MUTED_TRACK, song.instruments[MUTED_TRACK].clone().set({solo: true}))
        const plan = planOf(song)
        expect(plan.tracks.map(track => track.audible)).toEqual([false, false, false, true])
        expect(plan.events.map(event => event.trackIndex)).toEqual([OVERRIDE_TRACK])
    })

    it('plans a span-1 note as a plain trigger and a spanned one as a press of the same length', () => {
        const song = buildSong()
        const recorded = song.toRecordedSong(0)
        const plan = planSongRender(recorded)
        const notes = recorded.notes
            .map((note, index) => ({note, index}))
            .filter(({note}) => note.trackIndex === SUSTAIN_TRACK)
        const events = eventsOfTrack(plan, SUSTAIN_TRACK)
        expect(events.length).toBe(notes.length)
        notes.forEach(({note, index}, i) => {
            expect(events[i]).toEqual(
                note.duration > 0
                    ? {
                        trackIndex: SUSTAIN_TRACK,
                        noteIndex: index,
                        id: note.id,
                        atS: note.time / 1000,
                        kind: 'press',
                        durationMs: note.duration,
                    }
                    : {
                        trackIndex: SUSTAIN_TRACK,
                        noteIndex: index,
                        id: note.id,
                        atS: note.time / 1000,
                        kind: 'play',
                    }
            )
        })
        //the track carries both, so neither branch is being asserted vacuously
        expect(new Set(events.map(event => event.kind))).toEqual(new Set(['press', 'play']))
    })

    it('gives a press the composer\'s own column arithmetic, to the millisecond', () => {
        //ADR-0008: the span the composer plays and the duration the conversion writes are the
        //same integer, so an export holds a note for exactly as long as playback does
        const song = buildSong()
        const press = eventsOfTrack(planOf(song), SUSTAIN_TRACK).find(event => event.kind === 'press')
        expect(press?.durationMs).toBe(song.columnsDurationMs(1, 1 + 4))
    })

    it.runIf(ONE_SHOT !== undefined)(
        'plans a held note on a non-sustaining instrument as a plain trigger',
        () => {
            //Duration is stored on every note; whether it MEANS anything is the instrument's
            //capability. Skipped rather than faked if a game ever ships only sustaining instruments.
            const song = buildSong()
            const recorded = song.toRecordedSong(0)
            const events = eventsOfTrack(planSongRender(recorded), ONE_SHOT_TRACK)
            expect(events.map(event => event.kind)).toEqual(['play'])
            expect(events[0].durationMs).toBeUndefined()
            //non-vacuity: the note really does carry a duration - the instrument is what ignores it
            const notes = recorded.notes.filter(note => note.trackIndex === ONE_SHOT_TRACK)
            expect(notes.every(note => note.duration > 0)).toBe(true)
        }
    )

    it('takes the track\'s Basepoint where it has one, and the song\'s everywhere else', () => {
        const plan = planOf(buildSong())
        expect(plan.tracks.map(track => track.pitch)).toEqual([
            SONG_PITCH,
            SONG_PITCH,
            SONG_PITCH,
            TRACK_PITCH,
        ])
    })

    it('carries each track\'s instrument and volume through unchanged', () => {
        const song = buildSong()
        song.setInstrument(SUSTAIN_TRACK, song.instruments[SUSTAIN_TRACK].clone().set({volume: 37}))
        const plan = planOf(song)
        expect(plan.tracks.map(track => track.instrument)).toEqual(
            song.instruments.map(instrument => instrument.name)
        )
        expect(plan.tracks[SUSTAIN_TRACK].volume).toBe(37)
    })

    it('plans the same song identically twice', () => {
        const recorded = buildSong(true).toRecordedSong(0)
        expect(planSongRender(recorded)).toEqual(planSongRender(recorded))
    })
})

describe('reverb routing', () => {
    const routing: {override: boolean | null, songReverb: boolean, destination: string}[] = [
        {override: true, songReverb: true, destination: 'reverb'},
        {override: true, songReverb: false, destination: 'reverb'},
        {override: false, songReverb: true, destination: 'end'},
        {override: false, songReverb: false, destination: 'end'},
        {override: null, songReverb: true, destination: 'reverb'},
        {override: null, songReverb: false, destination: 'end'},
    ]

    it.each(routing)(
        'sends a track with reverbOverride $override in a song with reverb $songReverb to $destination',
        ({override, songReverb, destination}) => {
            const song = buildSong(songReverb)
            song.setInstrument(
                SUSTAIN_TRACK,
                song.instruments[SUSTAIN_TRACK].clone().set({reverbOverride: override})
            )
            expect(planOf(song).tracks[SUSTAIN_TRACK].destination).toBe(destination)
        }
    )

    it('reports a reverb chain is needed exactly when an AUDIBLE track routes to one', () => {
        const dry = buildSong(false)
        expect(planOf(dry).usesReverb).toBe(false)

        const wet = buildSong(true)
        expect(planOf(wet).usesReverb).toBe(true)

        //a wet track nobody can hear needs no convolver built for it
        const onlyMuted = buildSong(false)
        onlyMuted.setInstrument(
            MUTED_TRACK,
            onlyMuted.instruments[MUTED_TRACK].clone().set({muted: true, reverbOverride: true})
        )
        expect(planOf(onlyMuted).tracks[MUTED_TRACK].destination).toBe('reverb')
        expect(planOf(onlyMuted).usesReverb).toBe(false)
    })
})

describe('the render length bound', () => {
    const bounds = (over: Partial<RenderTailBounds> = {}): RenderTailBounds => ({
        maxBufferS: 3,
        maxReleaseS: 0.5,
        irS: 2,
        ...over,
    })

    it('ends after the last note plus every tail it was handed', () => {
        const plan = planOf(buildSong(true))
        const tails = bounds()
        expect(plan.lastNoteEndS).toBeGreaterThan(0)
        expect(renderLengthS(plan, tails)).toBeGreaterThanOrEqual(
            plan.lastNoteEndS + tails.maxBufferS + tails.maxReleaseS + tails.irS
        )
    })

    it('never returns less for a longer sample, tail or impulse response', () => {
        const plan = planOf(buildSong(true))
        const base = renderLengthS(plan, bounds())
        expect(renderLengthS(plan, bounds({maxBufferS: 9}))).toBeGreaterThanOrEqual(base)
        expect(renderLengthS(plan, bounds({maxReleaseS: 4}))).toBeGreaterThanOrEqual(base)
        expect(renderLengthS(plan, bounds({irS: 6}))).toBeGreaterThanOrEqual(base)
        expect(renderLengthS(plan, bounds({maxBufferS: 0, maxReleaseS: 0, irS: 0}))).toBeLessThanOrEqual(base)
    })

    it('does not pay for an impulse response no audible track routes through', () => {
        const dry = planOf(buildSong(false))
        expect(renderLengthS(dry, bounds({irS: 0}))).toBe(renderLengthS(dry, bounds({irS: 30})))
        const wet = planOf(buildSong(true))
        expect(renderLengthS(wet, bounds({irS: 30}))).toBeGreaterThan(renderLengthS(wet, bounds({irS: 0})))
    })

    it('still asks for a real buffer when the song is silent', () => {
        //every track muted: the render is honestly empty, but a zero-length buffer is not a buffer
        const song = buildSong()
        song.instruments.forEach((instrument, index) =>
            song.setInstrument(index, instrument.clone().set({muted: true}))
        )
        const plan = planOf(song)
        expect(plan.events).toEqual([])
        expect(plan.lastNoteEndS).toBe(0)
        expect(renderLengthS(plan, {maxBufferS: 0, maxReleaseS: 0, irS: 0})).toBeGreaterThan(0)
    })
})
