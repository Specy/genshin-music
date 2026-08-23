import {APP_NAME, INSTRUMENTS, type Pitch, VSRG_TRACK_COLORS} from "$core/legacyConfig";
// SnapPoint normally lives in $cmp/pages/VsrgComposer/VsrgBottom.tsx (not ported until the UI
// phase) - hoisted into $core/types.ts instead, same pattern as VsrgKeyboardLayout (Task 6).
import type {SnapPoint} from "$core/types";
import {isLegacyAppName, LEGACY_NOTE_TABLES, type LegacyAppName, legacyIndexToId} from "./legacyNoteTables";
import {type ConversionGame, findSimilarInstrument} from "./instrumentSimilarity";
import {effectiveTrackPitch, nominalToNumber, numberToButton} from "./noteIds";
import {basepointDelta, migrateTrackNotes, rewriteForSwap, rewriteNumbersForBasepoint} from "./noteNumberTransforms";
import type {InstrumentName} from "$core/types";
import {RecordedSong} from "./RecordedSong";
import {assertKnownSongVersion, type SerializedSong, Song} from "./Song.svelte";
import {InstrumentData, RecordedNote, type SerializedInstrumentData} from "./SongClasses";

// VsrgSongKeys hoisted into $core/types.ts by Task 6 (BaseSettings.ts needs it before this file
// exists) - re-export from the single source here so old import sites of './VsrgSong' keep working.
// `export type {} from` alone doesn't bind the name locally (TS re-export semantics), and this
// file still uses VsrgSongKeys itself below - so also import it, same as any other consumer.
import type {VsrgSongKeys} from '../types'
export type {VsrgSongKeys} from '../types'
export type SerializedVsrgSong = SerializedSong & {
    type: "vsrg"
    trackModifiers: SerializedTrackModifier[]
    tracks: SerializedVsrgTrack[]
    keys: VsrgSongKeys
    duration: number
    audioSongId: string | null
    breakpoints: number[]
    difficulty: number
    snapPoint: SnapPoint
}
export type VsrgAccuracyBounds = [
    awesome: number,
    perfect: number,
    great: number,
    good: number,
    bad: number,
]

/** Difficulty is a 1..10 song setting (BaseSettings VsrgComposerSettings.difficulty). */
export const MIN_VSRG_DIFFICULTY = 1
export const MAX_VSRG_DIFFICULTY = 10

/**
 * Judgment windows in ms at difficulty 1 — how far off a press may be and still earn each
 * rating. Widen these to make every difficulty more forgiving at once.
 *
 * These replace a port of osu!mania's OD windows ([16, 64, 97, 127, 188] shrunk by a flat
 * 2ms per difficulty step). That subtraction was absolute, so it moved every window by the
 * same 18ms across the whole 1..10 range and never touched `awesome` at all, which left
 * difficulty barely doing anything. Scaling is a proportion of the window instead, so a step
 * of difficulty costs more where the window is wide and less where it is already tight.
 */
const BASE_ACCURACY_BOUNDS: VsrgAccuracyBounds = [46, 120, 175, 230, 285]

/**
 * Share of BASE_ACCURACY_BOUNDS still allowed at difficulty 10. Chosen so even the strictest
 * setting stays at or above the OLD windows — the point of the difficulty weight is to make
 * high difficulties demanding relative to low ones, not to make any of them harsher than
 * before.
 */
const STRICTEST_WINDOW_SCALE = 0.55

/**
 * Everything `set()` may assign. Deliberately NOT `Partial<VsrgSong>`: `tracks` and
 * `structureVersion` are getters with no setter since phase 2, and Object.assign onto one throws a
 * TypeError in strict mode that TypeScript cannot see (Object.assign's signature is permissive, and
 * `readonly` is not enforced through it). Listing the assignable fields turns `set({tracks})` into
 * a compile error instead - which is what clone() and deserialize used to do.
 */
export type VsrgSongPatch = Partial<Pick<VsrgSong,
    | 'id' | 'folderId' | 'name' | 'data' | 'version' | 'bpm' | 'pitch' | 'instruments'
    | 'keys' | 'duration' | 'audioSongId' | 'trackModifiers' | 'breakpoints' | 'difficulty'
    | 'snapPoint'
>>

/**
 * The half of a track's InstrumentData that decides what its stored Note Numbers MEAN (ADR-0007):
 * which buttons exist to voice them, and the Basepoint they were entered at. Everything else on
 * an InstrumentData is presentation.
 *
 * It travels from VsrgTrackSettings (which mutates the track in place, so it is the last place the
 * OLD values still exist) down to setTrack, rather than being re-derived anywhere in between.
 */
export type VsrgTrackInstrumentIdentity = {
    name: InstrumentName
    pitch: Pitch | ''
}

/** What setTrackModifier may change. The three fields VsrgTrackModifier actually carries. */
export type VsrgTrackModifierPatch = {
    hidden?: boolean
    muted?: boolean
    alias?: string
}

/**
 * `.svelte.ts` because of the signals below (2026-08-06 reactive-model plan, phase 2). Importers
 * spell the specifier '$core/Songs/VsrgSong.svelte'; see Song.svelte.ts's header.
 *
 * The reactive shape, in one place - the same three mechanisms ComposedSong got in phase 1:
 * - `keys`, `duration`, `difficulty`, `snapPoint`, `audioSongId` are ordinary `$state` fields, and
 *   (on Song) so are `name`/`bpm`/`pitch`/`id`/`folderId`. Different parts of the UI watch them
 *   independently, and each keeps a public setter - which is what lets `vsrg.duration += 1000` and
 *   `set({keys})` keep working.
 * - `trackModifiers` and `breakpoints` are `$state.raw`: same whole-array signal, same public
 *   setter, but the array stays PLAIN because both are indexed per element on a hot path (the
 *   renderer draws every breakpoint on each timeline pass; the composer looks up
 *   `trackModifiers[note.trackIndex]` per audio note per playback tick). Their mutators must
 *   ASSIGN - see each field's comment.
 * - the track/hit-object graph gets ONE signal, `#structure`, read inside the `tracks` getter.
 *   VsrgTrack and VsrgHitObject stay plain objects: the canvas repaints the whole visible window
 *   at a time, so per-hit-object granularity would buy nothing any consumer could use.
 * - `#tracks` is PRIVATE, which is what keeps every mutator of the graph in this file, next to the
 *   bump. It is not airtight and the `tracks` getter says so: the array is handed back live and
 *   mutable, so an outside push/splice edits the song and publishes nothing. What the private field
 *   does rule out is REPLACING the array from outside, and it makes reaching for a method here the
 *   path of least resistance - a missed bump goes stale silently, the same way a forgotten
 *   refreshVsrg() did.
 *
 * The signals exist for the COMPOSER's templates and canvas; the vsrg PLAYER is written so as not
 * to subscribe to them. Its per-tick reads of `tracks`, `duration` and `trackModifiers` sit in
 * ThrottledEventLoop callbacks and plain renderer methods, which are not reactive contexts and so
 * register nothing. Where such a read IS reached from inside an `$effect` -
 * VsrgPlayerRenderer.onSongPick, called by subscribeCurrentVsrgSong - it is wrapped in `untrack()`
 * for that reason; that wrapper's comment has the details.
 */
export class VsrgSong extends Song<VsrgSong, SerializedVsrgSong, 3> {
    keys: VsrgSongKeys = $state(4)
    duration: number = $state(60000)
    audioSongId: string | null = $state(null)
    /**
     * `$state.raw`, not `$state`: the composer's playback tick indexes this per audio note
     * (`trackModifiers[note.trackIndex]?.muted`), and each element read through a deep proxy is a
     * trap plus a dependency registration. Raw keeps the whole-array signal and drops the per-index
     * sources, which nothing uses - VsrgComposerMenu re-renders the whole list.
     *
     * THE RULE THAT COMES WITH IT: every mutator ASSIGNS a new array (see setTrackModifier). An
     * in-place `trackModifiers[i] = x` compiles and publishes nothing at all.
     */
    trackModifiers: VsrgTrackModifier[] = $state.raw([])
    /**
     * `$state.raw` for the same reason as trackModifiers: VsrgComposerRenderer.drawTimeline walks
     * this array on every timeline draw. Same rule - a mutator ASSIGNS, an in-place push/splice
     * publishes nothing. The edits a live song takes go through #installBreakpoints; deserialize
     * and set() assign it too, on a song nobody is watching yet.
     */
    breakpoints: number[] = $state.raw([])
    difficulty: number = $state(5)
    snapPoint: SnapPoint = $state(1)

    /**
     * Structure version. A mutation of the track/hit-object graph bumps it, and the `tracks` getter
     * reads it, so a consumer subscribes just by doing what it already did. Kept private alongside
     * #tracks so the two cannot drift. (Which methods reach the graph WITHOUT bumping, and why: see
     * #bumpStructure.)
     */
    #structure = $state(0)
    #tracks: VsrgTrack[] = []

    constructor(name: string) {
        super(name, 3, "vsrg")
        this.bpm = 100
    }

    /**
     * The live track array. Reading `#structure` first is the whole trick: it makes every existing
     * `vsrg.tracks` read - templates, deriveds, effects, the canvas prop - subscribe to structural
     * changes without one call site changing.
     *
     * The array is handed back live and mutable (typing it `readonly` would ripple through
     * VsrgComposerRendererState and every draw loop). What that costs: a push/splice/sort/element
     * write from outside compiles, edits the song and publishes nothing, so consumers keep working
     * from what they last read until something else publishes. Add a mutator here instead.
     */
    get tracks(): VsrgTrack[] {
        this.#structure //intentional bare read: it is the subscription, the value is unused
        return this.#tracks
    }

    /**
     * The structure version as a VALUE, for consumers that have to DIFF it rather than just
     * subscribe - VsrgComposerRendererState snapshots it so `previous.structure !== next.structure`
     * is a comparison between two moments instead of a field compared against itself. Reading it is
     * a subscription too, exactly like reading `tracks`.
     */
    get structureVersion(): number {
        return this.#structure
    }

    /**
     * Publish a change to the track/hit-object graph. Most methods below end in one of these. The
     * ones that reach the graph without publishing say why at their own declaration:
     * initTracksForConstruction, deserialize and toOtherGame work on a song nobody is watching yet;
     * startPlayback and tickPlayback advance a private playback cursor rather than the graph;
     * extendHeldHitObject runs once per frame while a key is held. Several of the rest skip the bump
     * when the call turned out to change nothing. test/reactivePublish.test.ts carries a row per
     * callable, so which of the two a method belongs to is written down there as well as here.
     *
     * The convention the rest of the class follows (same as ComposedSong's): a mutator of the LIVE
     * graph addresses `#tracks` directly, since it has no reason to subscribe to its own signal,
     * while public READ methods (containsHitObject, getHitObjectsAt, serialize, ...) go through the
     * `tracks` getter on purpose, so that a caller reading one from inside a $derived/$effect
     * subscribes to structural changes. The construction paths - a song being deserialized, a fresh
     * clone being converted - edit through whichever is convenient, since nothing is watching those
     * songs either way.
     */
    #bumpStructure() {
        this.#structure++
    }

    /**
     * CONSTRUCTION ONLY: install a track array on a song nothing observes yet - deserialize and
     * clone. Deliberately does NOT bump #structure: there is no subscriber to notify, and a bumping
     * "just set the tracks" method is the shortcut a live-song mutation would reach for instead of
     * a real mutator. (ComposedSong.initColumnsForConstruction, same contract.)
     *
     * Copies the array it is given for OWNERSHIP: it becomes this song's private graph, and a
     * caller that kept the argument could otherwise push into #tracks from outside, which is the
     * write the private field exists to prevent. Its callers build a plain array and hand it over,
     * so - unlike ComposedSong.restoreColumns - there is no proxy to launder here.
     */
    initTracksForConstruction(tracks: VsrgTrack[]) {
        this.#tracks = [...tracks]
    }

    /** The newest vsrg format this build writes and reads. Above it is a file from a newer app. */
    static readonly LATEST_VERSION = 3

    /**
     * The versions whose hit objects already carry per-track note numbers (v2 Nominal Ids, v3
     * absolute Note Numbers): the ones a cross-game import converts with toOtherGame instead of
     * the legacy index remap inside deserialize(importInto). Owned here so that SongService's
     * dispatch and this deserializer cannot drift apart on a version bump.
     */
    static isNewFormat(obj: { version?: number }): boolean {
        return obj.version === 2 || obj.version === 3
    }

    /**
     * v1 hit objects stored keyboard note INDICES; v2 stores Nominal Ids; v3 stores absolute
     * Note Numbers. v1 and v2 both migrate here (ADR-0007 §9), the v1 chain by decoding through
     * the frozen tables to a nominal first and taking the same one extra step afterwards.
     *
     * `importInto` is the legacy-cross-game target (see ComposedSong.deserialize): reproduces the
     * historic toGenshin() — every track forced to DunDun, indices remapped through
     * the target's frozen importPositions before id-ification. QUIRK preserved:
     * unlike composed/recorded, cross-game vsrg conversion does NOT rewrite
     * data.appName — a converted vsrg song keeps the exporting game's appName.
     */
    static deserialize(obj: SerializedVsrgSong, importInto?: LegacyAppName): VsrgSong {
        //before anything is decoded: the version collapse below reads ANY unrecognised version as
        //v1, and a newer file's Note Numbers decode through the frozen v1 tables to nothing
        assertKnownSongVersion('vsrg', obj.version, VsrgSong.LATEST_VERSION)
        const song = Song.deserializeTo(new VsrgSong(obj.name), obj)
        song.initTracksForConstruction((obj.tracks ?? []).map(track => VsrgTrack.deserialize(track)))
        song.audioSongId = obj.audioSongId ?? null
        song.trackModifiers = (obj.trackModifiers ?? []).map(modifier => VsrgTrackModifier.deserialize(modifier))
        song.duration = obj.duration ?? 60000
        song.keys = obj.keys ?? 4
        //COPIED, not aliased: the argument is a parsed file, and installing its array as the live
        //`breakpoints` would leave the song and whatever still holds the payload writing to one
        //object. Not validated against `duration` here on purpose - see #installBreakpoints.
        song.breakpoints = [...(obj.breakpoints ?? [])]
        song.difficulty = obj.difficulty ?? 5
        song.snapPoint = obj.snapPoint ?? 1
        //everything the guard let through that is neither v3 nor v2 is a v1 file: the version
        //field was introduced WITH v2, so a legacy vsrg song carries none at all
        const version = obj.version === 3 ? 3 : obj.version === 2 ? 2 : 1
        if (version === 1) {
            //`song.data.appName` is still the SOURCE here even after conversion — this path keeps
            //the appName-preservation quirk documented above — so it is what keys the remap
            const sourceAppName = song.data.appName
            const crossGame = importInto !== undefined && sourceAppName !== importInto
            const appName = crossGame
                ? importInto
                : (isLegacyAppName(sourceAppName) ? sourceAppName : APP_NAME)
            //no known source index space, nothing to translate FROM: indices pass through
            const importPositions = crossGame && isLegacyAppName(sourceAppName)
                ? LEGACY_NOTE_TABLES[importInto].importPositions[sourceAppName]
                : null
            let dropped = 0
            song.tracks.forEach(track => {
                if (crossGame) track.instrument.name = "DunDun"
                const pitch = track.instrument.pitch || song.pitch
                track.hitObjects.forEach(hitObject => {
                    const numbers: number[] = []
                    hitObject.notes.forEach(note => {
                        const index = importPositions ? (importPositions[note] ?? -1) : note
                        //counted, not just skipped: a discarded note is invisible to
                        //countStrandedNotes (nothing is left to strand), so this is the import
                        //warning's only evidence
                        if (index === -1) {
                            dropped++
                            return
                        }
                        //out-of-table indices were silent in the legacy runtime — dropped.
                        //CROSS-GAME this is a conversion loss the warning must see: the table is
                        //the TARGET's, and the forced DunDun roster is 8 buttons long, so a
                        //remapped index can land past its end. Same-game it is the historic ghost
                        //note, which was already inaudible and must not start warning.
                        const id = legacyIndexToId(appName, track.instrument.name, index)
                        if (id === null) {
                            if (crossGame) dropped++
                            return
                        }
                        const number = nominalToNumber(track.instrument.name, pitch, id)
                        if (!numbers.includes(number)) numbers.push(number)
                    })
                    hitObject.notes = numbers
                })
            })
            song.legacyDroppedNotes = dropped
        } else if (version === 2) {
            song.tracks.forEach(track => {
                const numbers = migrateTrackNotes(
                    track.hitObjects.flatMap(hitObject => hitObject.notes),
                    track.instrument.name,
                    track.instrument.pitch || song.pitch
                )
                let cursor = 0
                track.hitObjects.forEach(hitObject => {
                    //a migration can collapse two nominals onto one number (a stranded id landing
                    //on a real Sounding Pitch), and a hit object's notes are a SET
                    const migrated: number[] = []
                    for (let i = 0; i < hitObject.notes.length; i++) {
                        const number = numbers[cursor + i]
                        if (!migrated.includes(number)) migrated.push(number)
                    }
                    cursor += hitObject.notes.length
                    hitObject.notes = migrated
                })
            })
        }
        return song
    }

    static isSerializedType(obj: any) {
        return obj?.type === 'vsrg'
    }

    getHighestNoteTime() {
        return this.tracks.reduce((max, track) => {
            return track.hitObjects.reduce((max, note) => Math.max(max, note.timestamp), max)
        }, 0)
    }
    setAudioSong(song: Song | null) {
        if (song === null) {
            this.audioSongId = null
            return
        }
        if (this.audioSongId === song.id) return
        this.audioSongId = song.id
        this.trackModifiers = song.instruments.map(ins => {
            const modifier = new VsrgTrackModifier()
            modifier.alias = ins.alias || ins.name
            return modifier
        })
    }

    /** Grow the song to cover a background song's notes. Returns the notes' own end, not the song's. */
    setDurationFromNotes(notes: RecordedNote[]) {
        const duration = notes.reduce((max, note) => Math.max(max, note.time), 0)
        //`if` rather than the old self-assigning ternary: identical result, and it says at the call
        //site that a background song shorter than the timeline changes nothing
        if (duration > this.duration) this.duration = duration
        return duration
    }

    /**
     * NEW-format (v3/v2) cross-game conversion: each track swaps to the target game's most
     * similar instrument (settings kept; target default when unmapped) and nothing else —
     * Note Numbers pass through untouched, and the ones the matched instrument cannot voice
     * strand rather than octave-folding into range (ADR-0011, the same rule composed and
     * recorded conversion now follow). Unlike the legacy path, which keeps the historic
     * appName-preservation quirk, data.appName IS rewritten here, so the song converts once
     * instead of on every load. Legacy v1 files never reach this: their conversion happens
     * inside deserialize(importInto).
     */
    toOtherGame(target: ConversionGame) {
        //everything below mutates the CLONE, which nobody is watching yet - the same contract
        //initTracksForConstruction has, which is why no bump is needed for the in-place instrument
        //and note rewrites
        const song = this.clone()
        if (target !== APP_NAME) throw new Error(`toOtherGame can only convert into the running game (${APP_NAME}), got ${target}`)
        if (song.data.appName === target) return song
        const sourceGame = song.data.appName
        song.data.appName = target
        song.tracks.forEach(t => {
            const similar = findSimilarInstrument(sourceGame, t.instrument.name, target)
            t.instrument.name = INSTRUMENTS.find(name => name === similar) ?? INSTRUMENTS[0]
            //hitObjects are deliberately untouched: no number is rewritten, so the fold's
            //within-hit-object collisions cannot appear and there is nothing left to dedupe
        })
        return song
    }

    /** Notes whose track instrument cannot voice them at its effective Basepoint — see ComposedSong.countStrandedNotes for why `numberToButton === -1` is the only definition. */
    countStrandedNotes(): number {
        let stranded = 0
        for (const track of this.tracks) {
            const pitch = effectiveTrackPitch(track.instrument, this.pitch)
            const name = track.instrument?.name ?? INSTRUMENTS[0]
            for (const hitObject of track.hitObjects) {
                for (const note of hitObject.notes) {
                    if (numberToButton(name, pitch, note) === -1) stranded++
                }
            }
        }
        return stranded
    }

    //startPlayback/tickPlayback advance each track's private lastPlayedHitObjectIndex cursor and
    //nothing else. They deliberately do NOT bump: the cursor is playback bookkeeping no consumer
    //observes, and these run once per frame - publishing here would invalidate every reader of
    //`tracks` at frame rate for something none of them can see. Same classification as
    //RecordedSong.notes in the plan's signal inventory.
    startPlayback(timestamp: number) {
        this.#tracks.forEach(track => track.startPlayback(timestamp))
    }

    tickPlayback(timestamp: number) {
        return this.#tracks.map(track => track.tickPlayback(timestamp))
    }

    addTrack(instrument?: InstrumentName) {
        const track = new VsrgTrack(instrument ?? "DunDun")
        track.color = this.nextTrackColor()
        this.#tracks.push(track)
        this.#bumpStructure()
        return track
    }

    /**
     * Install an edited track (the track-settings panel's save path). It bumps even when `track` is
     * already `tracks[index]` - in fact especially then: VsrgTrackSettings mutates the VsrgTrack it
     * was handed IN PLACE and hands the same reference back, so reference equality here means "the
     * edit already happened", not "nothing changed". An early return on identity would freeze the
     * canvas's texture cache and the track list on every colour/instrument edit. (An index that
     * addresses no track returns without bumping, like deleteTrack below.)
     *
     * `previousInstrument` IS THE CONSEQUENCE OF THAT IN-PLACE MUTATION (ADR-0007): the track's
     * instrument name and Basepoint override are both part of what its stored Note Numbers MEAN,
     * so changing either is a note edit — and by the time this method runs, the only record of
     * what they used to be has already been overwritten. The panel is the one place that knows
     * both sides at the instant of the change, so it hands the old identity down with the track.
     * Omitting it means "nothing about the instrument's identity moved" (a colour, alias, volume
     * or mute edit), which is why it is optional rather than required.
     */
    setTrack(index: number, track: VsrgTrack, previousInstrument?: VsrgTrackInstrumentIdentity) {
        if (this.#tracks[index] === undefined) return
        this.#tracks[index] = track
        if (previousInstrument) this.#rewriteForInstrumentChange(index, previousInstrument)
        this.#bumpStructure()
    }

    /**
     * ComposedSong.setInstrument's rewrite half, on the vsrg graph (spec §4). Both halves of the
     * instrument's identity can move in one save, so both are applied, in this order and at the
     * OLD effective Basepoint:
     *  - a changed NAME rewrites button-preservingly through nominal correspondence, so
     *    Lyre -> Vintage-Lyre re-flavors (the D button becomes the Db button) and a nominal the
     *    new instrument has no button for passes through unchanged, now visibly stranded;
     *  - a changed BASEPOINT OVERRIDE then moves the whole track by the interval.
     * The order is load-bearing: a swap is not a transposition, and doing the interval first would
     * ask the OLD instrument to voice numbers that are already at the NEW Basepoint.
     *
     * Assigns a fresh array per hit object (VsrgHitObject's own convention). A hit object's notes
     * are a SET, and a rewrite can collapse two of them onto one number - a strand passing through
     * unchanged can land on a swapped neighbour - so the result is deduped, exactly as the v2
     * migration in deserialize() does.
     */
    #rewriteForInstrumentChange(trackIndex: number, previous: VsrgTrackInstrumentIdentity) {
        const track = this.#tracks[trackIndex]
        const oldPitch = previous.pitch || this.pitch
        const newPitch = track.instrument.pitch || this.pitch
        const swapped = previous.name !== track.instrument.name
        if (!swapped && oldPitch === newPitch) return
        const delta = basepointDelta(oldPitch, newPitch)
        for (const hitObject of track.hitObjects) {
            if (hitObject.notes.length === 0) continue
            const rewritten = rewriteNumbersForBasepoint(
                swapped
                    ? rewriteForSwap(hitObject.notes, previous.name, track.instrument.name, oldPitch)
                    : hitObject.notes,
                delta
            )
            const deduped: number[] = []
            for (const number of rewritten) {
                if (!deduped.includes(number)) deduped.push(number)
            }
            hitObject.notes = deduped
        }
    }

    // First palette color no existing track is using, so tracks stay visually distinct without
    // the user having to pick one. Falls back to cycling by track count once all 16 are taken -
    // duplicates are unavoidable past that point, and repeating the palette in order at least
    // keeps neighbouring tracks apart.
    private nextTrackColor() {
        const used = new Set(this.#tracks.map(track => track.color.toLowerCase()))
        const unused = VSRG_TRACK_COLORS.find(color => !used.has(color.toLowerCase()))
        return unused ?? VSRG_TRACK_COLORS[this.#tracks.length % VSRG_TRACK_COLORS.length]
    }

    /**
     * Where an EDIT to `breakpoints` goes: setBreakpoint and validateBreakpoints both install
     * through here, so what a breakpoint may be is defined once rather than in each of them (the
     * way ComposedSong's #addressesColumn is). It drops anything at or past the end of the song and
     * keeps the array sorted. Assignments elsewhere in the class - deserialize's and set()'s - are
     * construction: they install a file's or a clone's array as written.
     *
     * Publishes only when the result actually differs: a reassignment of an equal array is a wasted
     * invalidation, and `$state.raw` compares by reference, so rebuilding it always would publish.
     *
     * Note what it is NOT: it does not run on deserialize (a file's breakpoints are kept as
     * written) and it does not run when `duration` shrinks. A vsrg breakpoint is a TIMESTAMP, not
     * an index into an array that just got shorter, so a stale one is well-formed rather than
     * dangling - and removeTime() is a 1-second button the user undoes with the one next to it.
     * Dropping their breakpoints on that click would be data loss to fix a cosmetic staleness.
     * The consequence, stated rather than implied: serialize() can write a breakpoint >= duration.
     */
    #installBreakpoints(breakpoints: number[]) {
        const valid = breakpoints.filter(breakpoint => breakpoint < this.duration)
        valid.sort((a, b) => a - b)
        const unchanged = valid.length === this.breakpoints.length
            && valid.every((breakpoint, i) => breakpoint === this.breakpoints[i])
        if (unchanged) return
        this.breakpoints = valid
    }

    /** Re-apply the breakpoint invariant to whatever is currently stored. */
    validateBreakpoints() {
        this.#installBreakpoints(this.breakpoints)
    }

    /**
     * Add or remove the breakpoint at `timestamp`. It BUILDS a new array rather than push/splicing
     * the live one: under `$state.raw` an in-place edit publishes nothing at all, and the old form
     * only worked because the validateBreakpoints() call after it happened to reassign - a publish
     * that was invisible at this call site and one refactor away from disappearing.
     */
    setBreakpoint(timestamp: number, set: boolean) {
        const has = this.breakpoints.includes(timestamp)
        this.#installBreakpoints(set
            ? (has ? this.breakpoints : [...this.breakpoints, timestamp])
            : this.breakpoints.filter(breakpoint => breakpoint !== timestamp))
    }

    getClosestBreakpoint(timestamp: number, direction: -1 | 1) {
        const {breakpoints} = this
        const breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > timestamp)
            : breakpoints.filter((v) => v < timestamp)
        if (breakpoint.length === 0) {
            return direction === 1 ? this.duration : 0
        }
        return breakpoint[direction === 1 ? 0 : breakpoint.length - 1]
    }

    getRenderableNotes(song: RecordedSong) {
        const notes: RecordedNote[] = []
        const trackModifiers = this.trackModifiers.map(modifier => !modifier.hidden)
        song.notes.forEach(note => {
            if (trackModifiers[note.trackIndex]) notes.push(note)
        })
        return notes
    }

    /**
     * Is this exact hit object still in the song? The composer holds references to hit objects
     * (the selection, the armed hold note, the ones under held keys) and has to drop them when the
     * object is deleted out from under it - see forgetRemovedHitObjects in vsrg-composer/+page.
     */
    containsHitObject(hitObject: VsrgHitObject): boolean {
        return this.tracks.some(track => track.hitObjects.includes(hitObject))
    }

    getHitObjectsAt(timestamp: number, key: number) {
        return this.tracks.map(track => track.getHitObjectAt(timestamp, key))
    }

    getHitObjectsBetween(start: number, end: number, key?: number) {
        return this.tracks.map(track => track.getObjectsBetween(start, end, key))
    }

    removeHitObjectsBetween(start: number, end: number, key?: number) {
        let removed = false
        this.#tracks.forEach(track => {
            if (track.removeObjectsBetween(start, end, key)) removed = true
        })
        if (removed) this.#bumpStructure()
    }

    getHitObjectInTrack(trackIndex: number, timestamp: number, index: number) {
        return this.tracks[trackIndex].getHitObjectAt(timestamp, index)
    }

    addHitObjectInTrack(trackIndex: number, hitObject: VsrgHitObject) {
        this.#tracks[trackIndex].addHitObject(hitObject)
        this.#bumpStructure()
    }

    createHitObjectInTrack(trackIndex: number, timestamp: number, index: number) {
        return this.#createHitObject(trackIndex, timestamp, index, false)
    }

    createHeldHitObject(trackIndex: number, timestamp: number, index: number) {
        return this.#createHitObject(trackIndex, timestamp, index, true)
    }

    /**
     * Shared body of the two create* methods, so an armed hold note is ONE edit and one bump rather
     * than "create, publish, set the flag, publish again".
     *
     * A bad trackIndex throws, exactly as the old `this.tracks[trackIndex].createHitObjectAt(...)`
     * did - it is a caller bug, not an input.
     *
     * Clicking a snap point that already holds a hit object returns THAT object instead of adding a
     * second one, and what it publishes depends on which: placing a HOLD on an object that is not
     * already held writes `isHeld` and bumps `structure`; every other combination returns the object
     * untouched and stays silent. `duration` is a separate signal and publishes on any of these
     * paths when the click lands past the end of the song.
     */
    #createHitObject(trackIndex: number, timestamp: number, index: number, held: boolean) {
        //the lookup first, so a bad trackIndex throws BEFORE anything is written - the old
        //`this.tracks[trackIndex].createHitObjectAt(...)` then `Math.max` ordering left `duration`
        //untouched on that throw, and there is no reason to start widening songs on a caller bug
        const track = this.#tracks[trackIndex]
        const existing = track.getHitObjectAt(timestamp, index)
        //placing past the end grows the timeline (an equal write publishes nothing on its own)
        if (timestamp > this.duration) this.duration = timestamp
        if (existing !== null) {
            if (!held || existing.isHeld) return existing
            existing.isHeld = true
            this.#bumpStructure()
            return existing
        }
        const hitObject = track.createHitObjectAt(timestamp, index)
        hitObject.isHeld = held
        this.#bumpStructure()
        return hitObject
    }

    setHeldHitObjectTail(trackIndex: number, hitObject: VsrgHitObject, duration: number) {
        this.#tracks.forEach((t, i) => i !== trackIndex && t.removeObjectsBetween(hitObject.timestamp, hitObject.timestamp + duration, hitObject.index))
        this.#tracks[trackIndex].setHeldHitObjectTail(hitObject, duration)
        this.#bumpStructure()
    }

    /**
     * Move a hit object the song owns. The page used to write `.timestamp`/`.index` straight onto
     * the object it was holding, which the song never heard about.
     *
     * `hitObject` is not looked up: this runs on every pointermove of a drag, and scanning every
     * track for it would be O(song) per frame. The contract is the same one setHeldHitObjectTail
     * already had - pass an object this song owns.
     *
     * It deliberately does NOT re-sort the track, which is exactly what the direct field writes it
     * replaced did (or rather did not). The consequence is pre-existing and worth knowing:
     * VsrgTrack.tickPlayback walks hitObjects in ARRAY order and stops at the first one past the
     * cursor, so a hit object dragged out of order can be skipped by the composer's playback
     * preview until something adds a hit object to that track (VsrgTrack.addHitObject sorts) - a
     * save/reload does not, since neither serialize nor deserialize reorders. Sorting here would be
     * a behaviour change, not a reactivity one, so it is written down rather than slipped in.
     */
    moveHitObject(hitObject: VsrgHitObject, timestamp: number, index: number) {
        if (hitObject.timestamp === timestamp && hitObject.index === index) return
        hitObject.timestamp = timestamp
        hitObject.index = index
        this.#bumpStructure()
    }

    /**
     * Grow the tail of a hit object the user is HOLDING DOWN during playback (the composer's
     * live-record path), and publish NOTHING - deliberately, and pinned by a row in
     * test/reactivePublish.test.ts so it is not "fixed" by accident:
     *  - it runs once per frame for as long as the key is held, so a bump here would invalidate
     *    every reader of `tracks` at frame rate;
     *  - what shows the growing tail is the canvas, and during playback the canvas already redraws
     *    on its own ThrottledEventLoop tick (VsrgComposerRenderer.handleTick -> setTimestamp ->
     *    draw), so a publish would buy a SECOND draw per frame, not a first one.
     *
     * See #bumpStructure for the other methods here that reach the graph without publishing.
     */
    extendHeldHitObject(hitObject: VsrgHitObject, holdDuration: number) {
        hitObject.holdDuration = holdDuration
        hitObject.isHeld = true
    }

    /** Toggle one Note Number on a hit object the song owns (the mini keyboard's edit). */
    toggleNoteInHitObject(hitObject: VsrgHitObject, note: number) {
        hitObject.toggleNote(note)
        this.#bumpStructure()
    }

    removeHitObjectInTrack(trackIndex: number, hitObject: VsrgHitObject) {
        if (this.#tracks[trackIndex].removeHitObject(hitObject)) this.#bumpStructure()
    }

    removeHitObjectInTrackAtTimestamp(trackIndex: number, timestamp: number, index: number) {
        if (this.#tracks[trackIndex].removeHitObjectAt(timestamp, index)) this.#bumpStructure()
    }

    /**
     * A DELIBERATE behaviour change (2026-08-06, phase 2), called out because the rest of this class
     * preserves its quirks rather than tidying them: an index that addresses no track now does
     * nothing at all. The old body was a bare `splice(index, 1)` plus a whole-array reassign, so
     * `deleteTrack(-1)` deleted the LAST track (splice counts negatives from the end) and an index
     * past the end deleted nothing while still publishing. Both are Array.prototype.splice's
     * semantics leaking through a method whose one caller in the app is the track list's delete
     * button, which passes the index it just rendered. Pinned by the out-of-range rows in
     * test/reactivePublish.test.ts and by test/vsrgSong.test.ts's deleteTrack block.
     */
    deleteTrack(index: number) {
        if (this.#tracks[index] === undefined) return
        this.#tracks.splice(index, 1)
        this.#bumpStructure()
    }

    /**
     * Apply a patch to one track modifier (the background-song panel's eye/mute buttons). It
     * installs a NEW VsrgTrackModifier and a NEW array, for two separate reasons:
     *  - `trackModifiers` is `$state.raw`, so only assigning the ARRAY publishes at all;
     *  - `{#each}` does not re-render an item whose value is unchanged, so an array of the SAME
     *    modifier objects leaves the eye and mute icons showing their old state even though the
     *    array signal fired (verified against a mounted component). A new element object is what
     *    the each block reacts to.
     */
    setTrackModifier(index: number, patch: VsrgTrackModifierPatch) {
        const current = this.trackModifiers[index]
        if (current === undefined) return
        const unchanged = Object.entries(patch)
            .every(([key, value]) => current[key as keyof VsrgTrackModifierPatch] === value)
        if (unchanged) return
        const modifiers = [...this.trackModifiers]
        modifiers[index] = new VsrgTrackModifier().set({
            hidden: current.hidden,
            muted: current.muted,
            alias: current.alias,
            ...patch,
        })
        this.trackModifiers = modifiers
    }

    /**
     * Timing windows for this song, widest (difficulty 1) to tightest (difficulty 10).
     *
     * The renderer takes the LAST entry as its overall hit tolerance too: a press further off
     * than `bad` doesn't register against the note at all, and the note is left to be scored a
     * miss when it passes. So this array alone decides how forgiving a song plays.
     */
    getAccuracyBounds(): VsrgAccuracyBounds {
        //songs authored before the setting existed, or hand-edited files, can carry a difficulty
        //outside the range the composer offers - clamp rather than extrapolate into windows that
        //are negative (unhittable) or absurdly wide
        const difficulty = Math.min(
            Math.max(this.difficulty, MIN_VSRG_DIFFICULTY),
            MAX_VSRG_DIFFICULTY
        )
        const steps = (difficulty - MIN_VSRG_DIFFICULTY) / (MAX_VSRG_DIFFICULTY - MIN_VSRG_DIFFICULTY)
        const scale = 1 - steps * (1 - STRICTEST_WINDOW_SCALE)
        //rounded so the windows stay whole milliseconds, and floored at 1ms so no rating tier can
        //collapse to a window nothing can ever land in
        return BASE_ACCURACY_BOUNDS.map(bound => Math.max(1, Math.round(bound * scale))) as
            unknown as VsrgAccuracyBounds
    }

    changeKeys(keys: VsrgSongKeys) {
        this.keys = keys
    }

    /**
     * ComposedSong.applyBasepointChange's twin, on the vsrg graph (ADR-0007): every hit object of
     * every affected track has its Note Numbers moved by the interval, Stranded Notes included.
     * The caller writes the new Basepoint itself; both ends are passed explicitly so the song-level
     * and per-track cases state the same arithmetic.
     *
     * Hit objects keep their numbers in a bare array and follow VsrgHitObject's assign-never-mutate
     * convention, so this ASSIGNS a fresh array per object (rewriteNumbersForBasepoint) rather than
     * editing in place. Publishes nothing when nothing moved.
     */
    applyBasepointChange(scope: 'song' | number, oldPitch: Pitch, newPitch: Pitch) {
        const delta = basepointDelta(oldPitch, newPitch)
        if (delta === 0) return
        let changed = false
        this.#tracks.forEach((track, trackIndex) => {
            const follows = scope === 'song' ? !track.instrument.pitch : trackIndex === scope
            if (!follows) return
            for (const hitObject of track.hitObjects) {
                if (hitObject.notes.length === 0) continue
                hitObject.notes = rewriteNumbersForBasepoint(hitObject.notes, delta)
                changed = true
            }
        })
        if (changed) this.#bumpStructure()
    }

    serialize(): SerializedVsrgSong {
        return {
            name: this.name,
            type: "vsrg",
            bpm: this.bpm,
            pitch: this.pitch,
            version: 3,
            keys: this.keys,
            //spread, like ComposedSong/RecordedSong: `data` is a mutable object the song owns, and
            //a serialized payload outlives the call - it is what the autosave writes and what the
            //download blob is built from. Handing over the live object would make that payload a
            //view onto the song instead of a snapshot of it. Nothing rewrites a live VsrgSong's
            //`data` today (toOtherGame rewrites appName on the CLONE it returns, and deserialize
            //writes it before anyone holds a payload), so this keeps the rule rather than fixing a
            //reachable bug; test/serializePlain.test.ts runs test/noAliasing.ts's guard over this
            //class's serialize paths.
            data: {...this.data},
            id: this.id,
            audioSongId: this.audioSongId,
            folderId: this.folderId,
            duration: this.duration,
            tracks: this.tracks.map(track => track.serialize()),
            instruments: this.instruments.map(instrument => instrument.serialize()),
            trackModifiers: this.trackModifiers.map(modifier => modifier.serialize()),
            breakpoints: [...this.breakpoints],
            difficulty: this.difficulty,
            snapPoint: this.snapPoint,
        }
    }

    //Object.assign keeps working against `$state` fields because they compile to a get/set accessor
    //PAIR on the prototype - it invokes the setter, so every scalar here publishes. What it cannot
    //reach are the getter-only members (`tracks`, `structureVersion`), where it throws a TypeError
    //in strict mode; VsrgSongPatch is what makes writing one a compile error instead.
    set(data: VsrgSongPatch) {
        Object.assign(this, data)
        return this
    }

    clone(): VsrgSong {
        const clone = new VsrgSong(this.name)
        clone.set({
            id: this.id,
            folderId: this.folderId,
            bpm: this.bpm,
            data: {...this.data},
            version: this.version,
            pitch: this.pitch,
            keys: this.keys,
            duration: this.duration,
            audioSongId: this.audioSongId,
            trackModifiers: this.trackModifiers.map(modifier => modifier.clone()),
            instruments: this.instruments.map(instrument => instrument.clone()),
            breakpoints: [...this.breakpoints],
            difficulty: this.difficulty,
            snapPoint: this.snapPoint,
        })
        //initTracksForConstruction, not set(): #tracks is private and its installer is the
        //construction-only one, because a clone is a song nobody is watching yet
        clone.initTracksForConstruction(this.tracks.map(track => track.clone()))
        return clone
    }
}


interface SerializedTrackModifier {
    hidden: boolean
    muted: boolean
    alias: string
}

export class VsrgTrackModifier {
    hidden: boolean = false
    muted: boolean = false
    alias: string = ""

    static deserialize(obj: SerializedTrackModifier) {
        return new VsrgTrackModifier().set({
            hidden: obj.hidden,
            muted: obj.muted,
            alias: obj.alias
        })
    }

    serialize(): SerializedTrackModifier {
        return {
            hidden: this.hidden,
            muted: this.muted,
            alias: this.alias
        }
    }

    // `alias` used to be dropped here, which was real data loss rather than a style point. clone()
    // is what toOtherGame() converts through, so a cross-game vsrg import came out with every
    // background-track name blanked - and while refreshVsrg() existed (`vsrg = vsrg.clone()` after
    // every edit) the composer blanked them too: the panel showed the aliases setAudioSong had just
    // built until the next edit, and empty names from then on.
    clone() {
        return new VsrgTrackModifier().set({
            hidden: this.hidden,
            muted: this.muted,
            alias: this.alias
        })
    }

    set(data: Partial<VsrgTrackModifier>) {
        Object.assign(this, data)
        return this
    }
}

interface SerializedVsrgTrack {
    instrument: SerializedInstrumentData
    hitObjects: SerializedVsrgHitObject[]
    color: string
}

export class VsrgTrack {
    instrument: InstrumentData
    hitObjects: VsrgHitObject[]
    color: string = '#FFFFFF'
    private lastPlayedHitObjectIndex: number = -1

    constructor(instrument?: InstrumentName, alias?: string, hitObjects?: VsrgHitObject[]) {
        this.instrument = new InstrumentData({name: instrument ?? "DunDun", alias})
        this.hitObjects = hitObjects ?? []
    }

    static deserialize(data: SerializedVsrgTrack) {
        const track = new VsrgTrack()
        track.instrument = InstrumentData.deserialize(data.instrument ?? {})
        track.hitObjects = (data.hitObjects ?? []).map(x => VsrgHitObject.deserialize(x))
        track.color = data.color ?? '#FFFFFF'
        return track
    }

    startPlayback(timestamp: number) {
        this.lastPlayedHitObjectIndex = -1
        for (let i = 0; i < this.hitObjects.length; i++) {
            if (this.hitObjects[i].timestamp >= timestamp) break
            this.lastPlayedHitObjectIndex = i
        }
    }

    tickPlayback(timestamp: number) {
        const surpassed = []
        for (let i = this.lastPlayedHitObjectIndex + 1; i < this.hitObjects.length; i++) {
            if (this.hitObjects[i].timestamp <= timestamp) {
                surpassed.push(this.hitObjects[i])
                this.lastPlayedHitObjectIndex = i
                continue
            }
            break
        }
        return surpassed
    }

    serialize(): SerializedVsrgTrack {
        return {
            instrument: this.instrument.serialize(),
            hitObjects: this.hitObjects.map(x => x.serialize()),
            color: this.color,
        }
    }

    sortTrack() {
        this.hitObjects.sort((a, b) => a.timestamp - b.timestamp)
    }

    getHitObjectAt(time: number, index: number) {
        return this.hitObjects.find(x => x.timestamp === time && x.index === index) || null
    }

    addHitObject(hitObject: VsrgHitObject) {
        this.hitObjects.push(hitObject)
        this.sortTrack()
    }

    createHitObjectAt(time: number, index: number) {
        const exists = this.hitObjects.findIndex(x => x.timestamp === time && x.index === index)
        if (exists !== -1) return this.hitObjects[exists]
        const hitObject = new VsrgHitObject(index, time)
        this.addHitObject(hitObject)
        return hitObject
    }

    getObjectsBetween(start: number, end: number, key?: number) {
        if (start > end) {
            const t = start
            start = end
            end = t
        }
        return this.hitObjects.filter(x =>
            x.timestamp >= start
            && x.timestamp <= end
            && (key === undefined || x.index === key))
    }

    //returns whether anything was removed, so VsrgSong can skip the structure bump when nothing
    //changed (a mutator that publishes with no edit behind it re-runs every consumer for nothing)
    removeObjectsBetween(start: number, end: number, key?: number): boolean {
        const objects = this.getObjectsBetween(start, end, key)
        let removed = false
        objects.forEach(x => {
            if (this.removeHitObjectAt(x.timestamp, x.index)) removed = true
        })
        return removed
    }

    setHeldHitObjectTail(hitObject: VsrgHitObject, duration: number) {
        const removeBound = hitObject.timestamp + duration
        const toRemove = this.getObjectsBetween(hitObject.timestamp, removeBound, hitObject.index)
        toRemove.forEach(x => x !== hitObject && this.removeHitObjectAt(x.timestamp, x.index))
        if (duration < 0) {
            hitObject.holdDuration = Math.abs(duration)
            hitObject.timestamp = removeBound
        } else {
            hitObject.holdDuration = duration
        }
    }

    removeHitObject(hitObject: VsrgHitObject): boolean {
        const index = this.hitObjects.indexOf(hitObject)
        if (index === -1) return false
        this.hitObjects.splice(index, 1)
        return true
    }

    removeHitObjectAt(time: number, index: number): boolean {
        const indexOf = this.hitObjects.findIndex(x => x.timestamp === time && x.index === index)
        if (indexOf === -1) return false
        this.hitObjects.splice(indexOf, 1)
        return true
    }

    set(data: Partial<VsrgTrack>) {
        Object.assign(this, data)
        return this
    }

    clone() {
        const track = new VsrgTrack()
        track.instrument = this.instrument.clone()
        track.hitObjects = this.hitObjects.map(x => x.clone())
        track.color = this.color
        return track
    }
}


type SerializedVsrgHitObject = [
    index: number,
    timestamp: number,
    holdDuration: number,
    notes: number[]
]

export class VsrgHitObject {
    index: number
    isHeld: boolean = false
    timestamp: number
    notes: number[] = []
    holdDuration: number = 0
    renderId: number = 0
    static globalRenderId: number = 0

    constructor(index: number, timestamp: number) {
        this.index = index
        this.timestamp = timestamp
        this.renderId = VsrgHitObject.globalRenderId++
    }

    static deserialize(data: SerializedVsrgHitObject): VsrgHitObject {
        const hitObject = new VsrgHitObject(data[0], data[1])
        hitObject.holdDuration = data[2]
        hitObject.notes = [...data[3]]
        hitObject.isHeld = hitObject.holdDuration > 0
        return hitObject
    }

    serialize(): SerializedVsrgHitObject {
        return [
            this.index,
            this.timestamp,
            this.holdDuration,
            [...this.notes]
        ]
    }

    toggleNote(note: number) {
        const exists = this.notes.find(x => x === note)
        if (exists !== undefined) return this.removeNote(note)
        this.setNote(note)
    }

    setNote(note: number) {
        if (this.notes.includes(note)) return
        this.notes = [...this.notes, note]
    }

    removeNote(note: number) {
        const index = this.notes.indexOf(note)
        if (index === -1) return
        this.notes.splice(index, 1)
        this.notes = [...this.notes]
    }

    clone(): VsrgHitObject {
        const hitObject = new VsrgHitObject(this.index, this.timestamp)
        hitObject.notes = [...this.notes]
        hitObject.holdDuration = this.holdDuration
        hitObject.isHeld = this.isHeld

        return hitObject
    }
}
