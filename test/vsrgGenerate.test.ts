// Beatmap generation, end to end (ADR-0016 and the 2026-08-30 generation design, sections 6 and 9).
// A generated chart is the one artefact in this app that nothing else validates: it is written by a
// machine, saved, and played, and every way it can be wrong is silent.
//
// What silently breaks without this file:
// - THE COVERAGE CONTRACT. A background track is muted only when the chart carries every one of its
//   notes. Mute a track the chart half-covers and the song plays with holes in it - no error, no
//   warning, and at the difficulty aimed at beginners a hole is indistinguishable from a miss. This
//   is the most important assertion here; the sustain half of it (a hold turned into a tap on an
//   instrument whose config declares `sustain`) cannot be exercised by any committed song at all,
//   so it is built here from whatever the running game's config says sustains.
// - THE LANE INVARIANT. Two Hit Objects in one Lane at one instant: the player resolves a press to
//   the first renderable object in that Lane, so the second is auto-missed however well it was
//   played. A correctness bug that looks like bad luck.
// - THE HONESTY OF THE LEVEL. Chart Level is a target band the loop converges on, not a label. A
//   chart that reports `converged` while sitting outside its band, or one that rates into the 8-10
//   range reserved for hand authoring, makes the whole measurement decorative.
// - SEEDED DETERMINISM. Same source, level, lane count and seed must give a byte-identical chart,
//   which is what lets the goldens below pin the generator and what makes a bad chart reproducible.
//
// Rating monotonicity - the property that makes the convergence loop terminate rather than wander -
// lives in vsrgRating.test.ts, beside the model it constrains.
import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, InstrumentData, RecordedNote, RecordedSong, songService} from './imports'
import {expectGolden} from './golden'
import {SUSTAIN_VISUAL_THRESHOLD_MS} from '$core/legacyConfig'
import {instrumentSupportsSustain} from '$core/Songs/midiImport'
import {buttonToNumber, effectiveTrackPitch, numberToButton} from '$core/Songs/noteIds'
import type {Song} from '$core/Songs/Song.svelte'
import type {VsrgSongKeys} from '$core/types'
import {
    CHART_LEVELS,
    MAX_ATTEMPTS,
    findLaneCollision,
    generateChart,
    type ChartLevel,
    type GenerationRequest,
    type GenerationResult,
} from '$core/Songs/vsrgGenerate'
import {CHART_LEVEL_BANDS, MAX_GENERATED_RATING, isRatingInBand} from '$core/Songs/vsrgRating'

const KEY_COUNTS = [4, 6] as const satisfies readonly VsrgSongKeys[]

/** One seed for every fixture, so the goldens pin a chart and not a coin flip. */
const FIXED_SEED = 7

/**
 * The cluster window generation merges on. Mirrors SIMULTANEITY_MS in vsrgGenerate: a Hit Object
 * sits at its cluster's FIRST note, so a note up to this much later is still covered by it.
 */
const CLUSTER_MS = 30

type Source = {
    label: string
    /** What the generator charts: a ComposedSong arrives flattened, a RecordedSong as it is. */
    source: RecordedSong
    /** The library song the chart is laid over - it must carry an id, see loadSource. */
    audioSong: Song
    instruments: InstrumentData[]
}

/**
 * A committed song file as a generator input.
 *
 * Every song on disk is legacy v1 wire format whatever its name says, so it has to come through
 * songService.parseSong to become a model at all - and in the OTHER game that is a conversion: the
 * roster resets to that game's default instrument and indices with no slot there are dropped. The
 * two games therefore generate from genuinely different material, which is why the fixtures are
 * per-game and why nothing here asserts a track count.
 */
function loadSource(label: string, file: string): Source {
    const parsed = songService.parseSong(JSON.parse(readFileSync(file, 'utf8')))
    //a background song with no id matches a fresh VsrgSong's null audioSongId, and setAudioSong
    //early-returns on that - leaving no trackModifiers at all, and every mute assertion below
    //vacuously true
    parsed.id = `${label}-source`
    if (parsed instanceof ComposedSong) {
        //offset 0: the default prepends 100ms of silence, which would put every Hit Object 100ms
        //off the Backing it is supposed to be sounding with
        return {label, source: parsed.toRecordedSong(0), audioSong: parsed, instruments: parsed.instruments}
    }
    if (parsed instanceof RecordedSong) {
        return {label, source: parsed, audioSong: parsed, instruments: parsed.instruments}
    }
    throw new Error(`${file} is not a source song`)
}

/**
 * The two songs the design names, both small enough to pin whole. test-songs/ is outside what
 * readInput can reach, so they are read by a repo-root-relative path the way the MIDI tests read
 * theirs.
 */
const COMPOSED_FIXTURE = loadSource('composed', 'test-songs/new-format-composed-genshin.genshinsheet.json')
const RECORDED_FIXTURE = loadSource('recorded', 'test-songs/new-format-recorded.skysheet.json')
const GOLDEN_SOURCES = [COMPOSED_FIXTURE, RECORDED_FIXTURE]

/** The only committed songs dense enough to have a hard chart in them. */
const DENSE_COMPOSED = loadSource('example-composed', 'test/inputs/example-composed.skysheet.json')
const DENSE_RECORDED = loadSource('example-recorded', 'test/inputs/example-recorded.skysheet.json')
const DENSE_SOURCES = [DENSE_COMPOSED, DENSE_RECORDED]

const ALL_SOURCES = [...GOLDEN_SOURCES, ...DENSE_SOURCES]

function requestFor(
    source: Source,
    level: ChartLevel,
    keys: VsrgSongKeys,
    seed = FIXED_SEED,
    selection: number[] | null = null
): GenerationRequest {
    return {
        source: source.source,
        audioSong: source.audioSong,
        sourceInstruments: source.instruments,
        sourceBpm: source.source.bpm,
        sourcePitch: source.source.pitch,
        keys,
        level,
        seed,
        selection,
    }
}

/** Every (source, level, lane count, selection) the invariants are asserted over. */
type Case = {source: Source; level: ChartLevel; keys: VsrgSongKeys; selection: number[] | null}

/** The proposal path: the generator picks the part, which is what the dialog pre-ticks. */
function casesOver(sources: readonly Source[]): Case[] {
    return sources.flatMap(source =>
        KEY_COUNTS.flatMap(keys => CHART_LEVELS.map(level => ({source, level, keys, selection: null}))))
}

/** The source track indices a chart can be asked for: a track with no notes is not a part. */
function partsOf(source: Source): number[] {
    return source.instruments
        .map((_, index) => index)
        .filter(index => source.source.notes.some(note => note.trackIndex === index))
}

/**
 * The same matrix with EVERY part ticked. The dialog's Parts list is multi-select, so this is a
 * first-class input and not a corner - and it is the only shape in which two charted streams
 * compete for Lanes at one instant, which is what the merged placement pass exists to survive and
 * what the merged budget exists to measure. A one-part chart exercises neither.
 */
function everyPartCases(sources: readonly Source[]): Case[] {
    return casesOver(sources).map(testCase => ({...testCase, selection: partsOf(testCase.source)}))
}

const ALL_CASES = [...casesOver(ALL_SOURCES), ...everyPartCases(ALL_SOURCES)]

const caseName = (testCase: Case) =>
    `${testCase.source.label} at ${testCase.level} on ${testCase.keys} lanes`
    + (testCase.selection === null ? '' : ` with parts ${testCase.selection.join('+')} ticked`)

function requestForCase(testCase: Case): GenerationRequest {
    return requestFor(testCase.source, testCase.level, testCase.keys, FIXED_SEED, testCase.selection)
}

/**
 * The Hit Objects charting one source track. `emit` builds one VsrgTrack per charted source track,
 * in the order selectTracks returned them, which is what this reconstructs - asserting the count
 * first, so a mismatch reads as a mismatch rather than as a coverage failure two screens later.
 */
function chartedTrackFor(result: GenerationResult, sourceTrack: number) {
    const charted = [...result.performed, ...result.doubled].sort((a, b) => a - b)
    expect(result.song.tracks.length, 'one vsrg track per charted source track').toBe(charted.length)
    return result.song.tracks[charted.indexOf(sourceTrack)]
}

/**
 * THE HARD ONE: no two Hit Objects share a Lane at one instant, across ALL tracks. Checked here as
 * well as through the generator's own findLaneCollision so that a broken assertion inside the
 * generator cannot hide a broken chart.
 */
function assertLaneInvariant(result: GenerationResult) {
    const seen = new Set<string>()
    for (const track of result.song.tracks) {
        for (const hitObject of track.hitObjects) {
            const key = `${hitObject.index}@${hitObject.timestamp}`
            expect(seen.has(key), `two hit objects in lane ${hitObject.index} at ${hitObject.timestamp}ms`)
                .toBe(false)
            seen.add(key)
        }
    }
    expect(findLaneCollision(result.song)).toBe(null)
}

function assertLanesExist(result: GenerationResult, keys: VsrgSongKeys) {
    expect(result.song.keys).toBe(keys)
    for (const track of result.song.tracks) {
        for (const hitObject of track.hitObjects) {
            expect(hitObject.index, 'a Hit Object in a Lane the chart does not have')
                .toBeGreaterThanOrEqual(0)
            expect(hitObject.index).toBeLessThan(keys)
        }
    }
}

/**
 * Nothing in a generated chart may be a Stranded Note. It cannot be, by construction - the notes
 * came from the very instrument the track carries a clone of - so this is the assertion that the
 * construction is what it claims: numberToButton read the same way countStrandedNotes reads it.
 */
function assertEveryNoteVoiceable(result: GenerationResult) {
    for (const track of result.song.tracks) {
        const pitch = effectiveTrackPitch(track.instrument, result.song.pitch)
        for (const hitObject of track.hitObjects) {
            for (const note of hitObject.notes) {
                expect(
                    numberToButton(track.instrument.name, pitch, note),
                    `${track.instrument.name} cannot voice ${note} at basepoint ${pitch}`
                ).not.toBe(-1)
            }
        }
    }
    expect(result.song.countStrandedNotes()).toBe(0)
}

/**
 * THE COVERAGE CONTRACT (ADR-0016). Every note of every muted source track is carried by a Hit
 * Object at its own time, and where the instrument's config declares `sustain` the hold is carried
 * too - a hold turned into a tap on a Cello is a note the player cannot sound in full, which is
 * exactly what "covered" has to exclude for the mute to be honest.
 *
 * Also the other half of the rule: a track the chart only doubles is never muted, and no track the
 * chart never touched is muted either.
 */
function assertCoverageEarnedTheMute(result: GenerationResult, request: GenerationRequest) {
    expect(result.song.trackModifiers.length, 'a modifier per source instrument, or nothing below means anything')
        .toBe(request.sourceInstruments.length)
    for (let index = 0; index < result.song.trackModifiers.length; index++) {
        expect(result.song.trackModifiers[index].muted, `source track ${index}`)
            .toBe(result.performed.includes(index))
    }
    for (const sourceTrack of result.performed) {
        const track = chartedTrackFor(result, sourceTrack)
        const instrument = request.sourceInstruments[sourceTrack]
        const sustains = instrumentSupportsSustain(instrument.name)
        const notes = request.source.notes.filter(note => note.trackIndex === sourceTrack)
        expect(notes.length, 'a muted track with no notes is silence, not a Performed Track')
            .toBeGreaterThan(0)
        const covered = notes.filter(note => {
            const carriers = track.hitObjects.filter(hitObject =>
                hitObject.notes.includes(note.id)
                && hitObject.timestamp <= note.time
                && note.time - hitObject.timestamp <= CLUSTER_MS)
            if (carriers.length === 0) return false
            if (!sustains || note.duration < SUSTAIN_VISUAL_THRESHOLD_MS) return true
            return carriers.some(hitObject => hitObject.holdDuration >= note.duration)
        })
        expect(covered.length, `muted track ${sourceTrack} is not fully covered`).toBe(notes.length)
    }
}

/** A hold is two fields, and only one of them is serialized - see the emitter's note on isHeld. */
function assertHoldsAreWhole(result: GenerationResult) {
    for (const track of result.song.tracks) {
        for (const hitObject of track.hitObjects) {
            expect(hitObject.isHeld, `${hitObject.timestamp}ms holds for ${hitObject.holdDuration}ms`)
                .toBe(hitObject.holdDuration > 0)
        }
    }
}

function assertEveryInvariant(result: GenerationResult, request: GenerationRequest) {
    assertLaneInvariant(result)
    assertLanesExist(result, request.keys)
    assertEveryNoteVoiceable(result)
    assertCoverageEarnedTheMute(result, request)
    assertHoldsAreWhole(result)
}

describe('every generated chart is one the player can actually hit', () => {
    for (const testCase of ALL_CASES) {
        it(`holds every invariant for ${caseName(testCase)}`, () => {
            const request = requestForCase(testCase)
            assertEveryInvariant(generateChart(request), request)
        })
    }

    it('charts a part of the song rather than nothing at all', () => {
        //the invariants above are all satisfied by an empty chart, which is the one failure they
        //cannot see
        for (const testCase of ALL_CASES) {
            const result = generateChart(requestForCase(testCase))
            const hitObjects = result.song.tracks.reduce((sum, track) => sum + track.hitObjects.length, 0)
            expect(hitObjects, caseName(testCase)).toBeGreaterThan(0)
            expect(result.performed.length + result.doubled.length, caseName(testCase)).toBeGreaterThan(0)
        }
    })

    it('charts every part that was ticked, so the multi-part matrix is not a one-part matrix', () => {
        //without this the matrix above could be two copies of the proposal path: a selection the
        //generator quietly narrowed would leave `taken` empty at every instant, and the merged
        //placement pass - the only thing enforcing the Lane invariant across tracks - untested
        const multiPart = everyPartCases(ALL_SOURCES).filter(testCase => (testCase.selection ?? []).length > 1)
        expect(multiPart.length, 'no committed source has two parts to chart').toBeGreaterThan(0)
        for (const testCase of multiPart) {
            const ticked = testCase.selection ?? []
            const result = generateChart(requestForCase(testCase))
            expect([...result.performed, ...result.doubled].sort((a, b) => a - b), caseName(testCase))
                .toEqual(ticked)
            expect(result.song.tracks.length, caseName(testCase)).toBe(ticked.length)
        }
    })

    it('earns the mute somewhere in the matrix, so the coverage contract is not vacuous', () => {
        //every assertion about muting is silent on a chart that mutes nothing, and "mutes nothing,
        //ever" is a plausible regression: a Doubling satisfies the coverage rule for free
        const earned = ALL_CASES.filter(testCase =>
            generateChart(requestForCase(testCase)).performed.length > 0)
        expect(earned.length).toBeGreaterThan(0)
    })

    it('refuses to chart against a background song that was never registered', () => {
        //setAudioSong early-returns when the id it is handed matches the one already set, and a
        //fresh VsrgSong starts at null - so an unregistered song leaves no trackModifiers, every
        //mute is silently skipped, and the result claims a Performed Track the song does not carry.
        //The vsrg composer's own page-level `audioSong` is exactly such a song (toRecordedSong
        //carries no id), so this is the mistake a caller reaching for the obvious variable makes.
        const source = syntheticSource('unregistered', INSTRUMENTS[0], HELD_WALK)
        source.audioSong.id = null
        expect(() => generateChart(requestFor(source, 'normal', 4))).toThrow(/registered/)
    })

    it('carries the source song\'s own bpm, pitch and identity onto the chart', () => {
        //setAudioSong has never carried bpm or pitch across, so a generated song that did not would
        //ship with a grid unaligned to the music drawn under it
        for (const source of ALL_SOURCES) {
            const request = requestFor(source, 'normal', 4)
            const result = generateChart(request)
            expect(result.song.bpm).toBe(source.source.bpm)
            expect(result.song.pitch).toBe(source.source.pitch)
            expect(result.song.audioSongId).toBe(source.audioSong.id)
            //id-less on purpose: the caller registers it, and songsStore.addSong writes the id onto
            //the serialized payload only
            expect(result.song.id).toBe(null)
        }
    })
})

describe('a generated chart is pinned by fixture', () => {
    it('pins the chart it lays at every level and lane count', () => {
        const charts: Record<string, unknown> = {}
        for (const testCase of casesOver(GOLDEN_SOURCES)) {
            const result = generateChart(requestFor(testCase.source, testCase.level, testCase.keys))
            //the result object carries the VsrgSong itself, whose methods structuredClone refuses -
            //so the fixture takes the serialized payload plus the plain scalars beside it
            charts[`${testCase.source.label}-${testCase.level}-${testCase.keys}keys`] = {
                rating: result.rating,
                performed: result.performed,
                doubled: result.doubled,
                attempts: result.attempts,
                converged: result.converged,
                song: result.song.serialize(),
            }
        }
        //a LIVING fixture: a deliberate change to the algorithm legitimately moves it, and the
        //diff is then something to read chart by chart and confirm - not a rule broken
        expectGolden('vsrg-generated-charts', charts)
    })
})

describe('the Chart Level is a target the loop converges on', () => {
    it('converges at every level on a song with the material for it', () => {
        //the composed fixture: three parts, fifty-odd notes over four seconds, and every level's
        //band reachable from it in both games
        for (const keys of KEY_COUNTS) {
            for (const level of CHART_LEVELS) {
                const result = generateChart(requestFor(COMPOSED_FIXTURE, level, keys))
                const band = CHART_LEVEL_BANDS[level]
                expect(result.converged, `${level} on ${keys} lanes rated ${result.rating}`).toBe(true)
                expect(result.rating).toBeGreaterThanOrEqual(band.min)
                expect(result.rating).toBeLessThanOrEqual(band.max)
            }
        }
    })

    it('never claims to have converged on a chart outside the band', () => {
        //`converged` is the one thing the dialog reports that the user cannot check, so it may never
        //be a hopeful label: it is the band test and nothing else. Not every source can reach every
        //band - ten notes over two seconds is not a Hard chart at any setting of the knobs - and
        //those come back out of band saying so.
        for (const testCase of ALL_CASES) {
            const result = generateChart(requestForCase(testCase))
            expect(isRatingInBand(result.rating, testCase.level), caseName(testCase))
                .toBe(result.converged)
        }
    })

    it('leaves the 8-10 band to hand authoring', () => {
        for (const testCase of ALL_CASES) {
            const result = generateChart(requestForCase(testCase))
            expect(result.rating, caseName(testCase)).toBeLessThanOrEqual(MAX_GENERATED_RATING)
            expect(result.rating, caseName(testCase)).toBeLessThan(8)
        }
    })

    it('stops rather than searching forever', () => {
        for (const testCase of ALL_CASES) {
            const result = generateChart(requestForCase(testCase))
            expect(result.attempts, caseName(testCase)).toBeGreaterThanOrEqual(1)
            expect(result.attempts, caseName(testCase)).toBeLessThanOrEqual(MAX_ATTEMPTS)
        }
    })

    it('returns the attempt CLOSEST to the band rather than the last one it tried', () => {
        //TWO_NOTE_WALTZ at Normal on four Lanes: a covered chart that sits just over the band's
        //ceiling, and a retune that gives up the mute to thin it and overshoots the band's FLOOR by
        //more than the covered one missed its ceiling. What comes back is therefore the covered
        //chart - out of band and saying so - and not the thinned chart the search tried last.
        const request = requestFor(TWO_NOTE_WALTZ, 'normal', 4)
        const result = generateChart(request)
        expect(result.converged).toBe(false)
        expect(result.attempts).toBeGreaterThan(1)
        expect(result.rating).toBeGreaterThan(CHART_LEVEL_BANDS.normal.max)
        expect(result.performed).not.toEqual([])
        assertEveryInvariant(result, request)
    })

    it('never hands back a chart in the reserved band, even when it is the closest one', () => {
        //both parts of this song at Hard is a chart the retune walks down through 10 and 8.9 before
        //it reaches 4.7 - and 8.9 is NEARER Hard's band than 4.7 is. The 8-10 range is hand-authoring
        //territory (ADR-0016), so the reserved ceiling outranks closeness and the thinner chart is
        //the one that comes back: a 9 always means a human made it.
        const request = requestFor(DENSE_COMPOSED, 'hard', 4, FIXED_SEED, partsOf(DENSE_COMPOSED))
        const result = generateChart(request)
        expect(result.rating).toBeLessThanOrEqual(MAX_GENERATED_RATING)
        expect(result.rating).toBeLessThan(CHART_LEVEL_BANDS.hard.min)
        expect(result.converged).toBe(false)
        assertEveryInvariant(result, request)
    })

    it('brings a stream that already fits the level down out of the reserved band', () => {
        //the retune's one lever on a part it is not thinning is the reduction threshold, and gating
        //that on "the last pass already thinned something" made it unreachable exactly here: this
        //stream fits Hard's budget outright (6.7 presses/s under a ceiling of 8, 150ms gaps over a
        //minimum of 80, one note per press), so nothing thinned it, the chord cap had nothing to cap,
        //and the chart came back at 8.1 - generated, in the band reserved for hand authoring.
        const source = syntheticSource(
            'inside-the-budget',
            INSTRUMENTS[0],
            Array.from({length: 166}, (_, i) => ({button: i % 5, time: i * 150, duration: 0}))
        )
        for (const keys of KEY_COUNTS) {
            const request = requestFor(source, 'hard', keys)
            const result = generateChart(request)
            expect(result.rating, `${keys} lanes`).toBeLessThanOrEqual(MAX_GENERATED_RATING)
            assertEveryInvariant(result, request)
        }
    })
})

describe('generation is seeded, never random', () => {
    it('generates a byte-identical chart for the same request twice', () => {
        for (const testCase of ALL_CASES) {
            const first = generateChart(requestForCase(testCase))
            const second = generateChart(requestForCase(testCase))
            expect(JSON.stringify(second.song.serialize()), caseName(testCase))
                .toBe(JSON.stringify(first.song.serialize()))
            expect(second.rating).toBe(first.rating)
            expect(second.attempts).toBe(first.attempts)
        }
    })
})

/**
 * A source song built here rather than loaded: no committed song uses a sustaining instrument, and
 * nothing on disk is dense enough to be unaffordable at Hard.
 */
function syntheticSource(label: string, instrument: (typeof INSTRUMENTS)[number], notes: {button: number; time: number; duration: number}[]): Source {
    const song = new RecordedSong(label, [], [instrument])
    song.id = `${label}-source`
    song.bpm = 120
    song.notes = notes.map(note =>
        new RecordedNote(buttonToNumber(instrument, song.pitch, note.button) ?? 0, note.time, note.duration, 0))
    return {label, source: song, audioSong: song, instruments: song.instruments}
}

/** The same, with several parts: `track` addresses the roster the notes are tagged with. */
function syntheticParts(
    label: string,
    instruments: readonly (typeof INSTRUMENTS)[number][],
    notes: {track: number; button: number; time: number; duration: number}[]
): Source {
    const song = new RecordedSong(label, [], [...instruments])
    song.id = `${label}-source`
    song.bpm = 120
    song.notes = notes.map(note => new RecordedNote(
        buttonToNumber(instruments[note.track], song.pitch, note.button) ?? 0,
        note.time,
        note.duration,
        note.track
    ))
    return {label, source: song, audioSong: song, instruments: song.instruments}
}

const SUSTAINING = INSTRUMENTS.filter(instrumentSupportsSustain)
const ONE_SHOT = INSTRUMENTS.filter(name => !instrumentSupportsSustain(name))

/** A melody that walks, so the contour has somewhere to go, with every note long enough to hold. */
const HELD_WALK = Array.from({length: 40}, (_, i) => ({button: i % 5, time: i * 300, duration: 700}))

/**
 * Two-note chords 420ms apart for half a minute. Every committed song now converges at Normal, and
 * the closest-attempt rule needs a source whose retune OVERSHOOTS: this one is charted in full just
 * over Normal's ceiling, and the one step that thins it lands further below the floor than the
 * covered chart was above the roof.
 */
const TWO_NOTE_WALTZ = syntheticSource('two-note-waltz', INSTRUMENTS[0], Array.from({length: 71}, (_, i) => [
    {button: i % 7, time: i * 420, duration: 0},
    {button: (i + 2) % 7, time: i * 420, duration: 0},
]).flat())

/**
 * Three-note chords a beat apart, each held for two beats, so every chord overlaps the next. On a
 * sustaining instrument that is the shape that fills Lanes: the holds occupy three of four Lanes
 * across the instant the following chord lands on.
 */
const OVERLAPPING_CHORDS = Array.from({length: 20}, (_, i) => [
    {button: 0 + (i % 2), time: i * 500, duration: 1000},
    {button: 2 + (i % 2), time: i * 500, duration: 1000},
    {button: 4 + (i % 2), time: i * 500, duration: 1000},
]).flat()

describe('coverage counts the sustain where the instrument sustains', () => {
    it.runIf(SUSTAINING.length > 0)('carries a long note as a hold, and mutes the track for it', () => {
        const source = syntheticSource('sustained', SUSTAINING[0], HELD_WALK)
        const request = requestFor(source, 'normal', 4)
        const result = generateChart(request)
        //the mute is the point: it is only earned because every one of those held notes is carried
        //AS a hold, which assertCoverageEarnedTheMute checks note by note
        expect(result.performed).toEqual([0])
        assertEveryInvariant(result, request)
        const holds = result.song.tracks.flatMap(track => track.hitObjects).filter(h => h.holdDuration > 0)
        expect(holds.length).toBeGreaterThan(0)
        for (const hold of holds) expect(hold.holdDuration).toBeGreaterThanOrEqual(SUSTAIN_VISUAL_THRESHOLD_MS)
    })

    it.runIf(ONE_SHOT.length > 0)('leaves the same notes as taps on an instrument whose sample is a one-shot', () => {
        //the gate is read from config (`sustain.loopMode`), never from a list of instrument names -
        //so a game gains sustained generation the moment its config gains a sustaining instrument,
        //and loses nothing on one whose sound was a one-shot either way
        const source = syntheticSource('one-shot', ONE_SHOT[0], HELD_WALK)
        const request = requestFor(source, 'normal', 4)
        const result = generateChart(request)
        assertEveryInvariant(result, request)
        for (const track of result.song.tracks) {
            for (const hitObject of track.hitObjects) expect(hitObject.holdDuration).toBe(0)
        }
    })

    it.runIf(SUSTAINING.length > 0)('generates a different chart for a different seed, and every invariant still holds', () => {
        //the seed breaks TIES and nothing else, so most songs chart identically whatever it is -
        //this one is here because it has ties to break: holds take Lanes out of the running, which
        //is what leaves two windows equally good
        const source = syntheticSource('sustained', SUSTAINING[0], HELD_WALK)
        const base = generateChart(requestFor(source, 'normal', 4, 1))
        const others = [2, 3, 4, 5].map(seed => generateChart(requestFor(source, 'normal', 4, seed)))
        const serialize = (result: GenerationResult) => JSON.stringify(result.song.serialize())
        const different = others.filter(other => serialize(other) !== serialize(base))
        expect(different.length, 'no seed changed the chart - the tie-break is unreachable')
            .toBeGreaterThan(0)
        for (const other of different) assertEveryInvariant(other, requestFor(source, 'normal', 4))
    })
})

describe('a part the chart cannot cover is doubled, never muted', () => {
    //twenty-five presses a second: no level can afford it, so every level charts it as a Doubling
    //and the reduction pass is free to thin it. What must NOT happen is the mute - a thinned track
    //that got muted anyway is a song with holes in it, which is the failure ADR-0016 exists for.
    const source = syntheticSource(
        'unaffordable',
        INSTRUMENTS[0],
        Array.from({length: 200}, (_, i) => ({button: i % 6, time: i * 40, duration: 0}))
    )

    for (const level of CHART_LEVELS) {
        for (const keys of KEY_COUNTS) {
            it(`mutes nothing at ${level} on ${keys} lanes`, () => {
                const request = requestFor(source, level, keys)
                const result = generateChart(request)
                expect(result.performed).toEqual([])
                expect(result.doubled).toEqual([0])
                expect(result.song.trackModifiers.length).toBe(1)
                expect(result.song.trackModifiers.every(modifier => !modifier.muted)).toBe(true)
                assertEveryInvariant(result, request)
            })
        }
    }

    it('thins the doubled part rather than charting all of it', () => {
        const result = generateChart(requestFor(source, 'easy', 4))
        const hitObjects = result.song.tracks.reduce((sum, track) => sum + track.hitObjects.length, 0)
        expect(hitObjects).toBeGreaterThan(0)
        expect(hitObjects).toBeLessThan(source.source.notes.length)
    })
})

describe('a chord with no room narrows onto fewer Lanes instead of vanishing', () => {
    it.runIf(SUSTAINING.length > 0)('keeps the mute a full-width chord could not have earned', () => {
        //three-note chords whose holds outlast the gap to the next one: on four Lanes there is no
        //three-wide window free at the instant the following chord lands. A press dropped for want
        //of room is a note nothing sounds - the coverage is gone and with it the mute, over an
        //instant that was merely crowded, while the same chord on one Lane sounds in full (a Hit
        //Object's notes are a set). This charted every note or it did not earn the mute below.
        const source = syntheticSource('overlapping-chords', SUSTAINING[0], OVERLAPPING_CHORDS)
        const request = requestFor(source, 'normal', 4)
        const result = generateChart(request)
        expect(result.performed).toEqual([0])
        assertEveryInvariant(result, request)
        const hitObjects = result.song.tracks.flatMap(track => track.hitObjects)
        expect(hitObjects.some(hitObject => hitObject.notes.length > 1), 'no chord narrowed at all')
            .toBe(true)
    })
})

describe('several ticked parts are one chart, and are measured as one', () => {
    //four parts striking twice a second each, 60ms apart so they interleave rather than chord: every
    //one of them is inside Easy's budget alone, and together they are four times it. The player has
    //one pair of hands and the Rating measures the merge, so a budget asked of each part separately
    //offered eight presses a second as an Easy chart - and muted all four parts for covering them.
    const source = syntheticParts(
        'four-parts',
        INSTRUMENTS.slice(0, 4),
        Array.from({length: 4}, (_, track) =>
            Array.from({length: 40}, (_, i) => ({track, button: (i + track) % 5, time: i * 500 + track * 60, duration: 0}))
        ).flat()
    )
    const selection = [0, 1, 2, 3]

    for (const level of CHART_LEVELS) {
        for (const keys of KEY_COUNTS) {
            it(`rates what it charted at ${level} on ${keys} lanes`, () => {
                const request = requestFor(source, level, keys, FIXED_SEED, selection)
                const result = generateChart(request)
                expect(result.rating).toBeLessThanOrEqual(MAX_GENERATED_RATING)
                expect(isRatingInBand(result.rating, level)).toBe(result.converged)
                assertEveryInvariant(result, request)
            })
        }
    }

    it('lands an Easy selection in Easy\'s band rather than at four times its rate', () => {
        const request = requestFor(source, 'easy', 4, FIXED_SEED, selection)
        const result = generateChart(request)
        expect(result.converged).toBe(true)
        expect(result.rating).toBeLessThanOrEqual(CHART_LEVEL_BANDS.easy.max)
        //thinned to fit, so nothing is covered any more - and nothing may be muted for it
        expect(result.performed).toEqual([])
        expect(result.doubled).toEqual(selection)
        assertEveryInvariant(result, request)
    })
})
