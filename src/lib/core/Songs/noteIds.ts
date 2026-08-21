// Runtime Note Number / Nominal Id <-> Button resolution for the ACTIVE game (see
// CONTEXT.md: Note Number, Nominal Id, Basepoint, Button, Stranded Note). Every button
// lookup on either axis happens here.
//
// TWO AXES, ONE MODULE — deliberately, because a swap and a grid row need both at once:
//  - NOMINAL IDS (ADR-0001): the instrument/grid namespace. Per-instrument tables come
//    from the game definition's note structs (`note.midi`); the Song Grid's row order is a
//    SEPARATE authored list (CANONICAL_NOTE_IDS, ADR-0004) that no instrument defines,
//    which is why the *Grid* helpers below place by id alone. Songs stopped storing these
//    at ADR-0007; they survive as the currency of button correspondence (swaps, grid rows,
//    legacy decode, and the MIDI importer's snap onto the grid).
//  - NOTE NUMBERS (ADR-0007): what songs store — one absolute axis, Basepoint included.
//    `number = sounding(button) + offset(effectivePitch)`, where `sounding` is a Pitched
//    Button's derived Sounding Pitch and an Assigned Button's own Nominal Id (registry.ts
//    derives and validates it), and `offset` is the Basepoint's PITCHES index.
//
// BOTH tables are read through the core-tier legacyConfig adapter (INSTRUMENTS_DATA),
// never from `$game` directly, so this module stays importable from plain-TS domain code
// and vitest — the sounding table is built exactly like the nominal one, off the same note
// structs, for that reason and no other.
//
// Distinct from legacyNoteTables.ts: that file is a FROZEN snapshot used only to decode
// legacy serialized songs (possibly of the OTHER game); this module reflects the current
// build's live instrument data and is used for playback, rendering, and authoring.

import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, MIDI_BOUNDS, type Pitch, PITCH_TO_INDEX} from '$core/legacyConfig'
import type {ColumnNote, InstrumentData, RecordedNote} from './SongClasses'
import type {LayerStatus} from './Layer'

type InstrumentDataMap = typeof INSTRUMENTS_DATA
export type RuntimeInstrumentName = keyof InstrumentDataMap | (string & {})

const DEFAULT_INSTRUMENT = INSTRUMENTS[0]
const LAYER_STATUSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const

function isInstrumentName(name: RuntimeInstrumentName): name is keyof InstrumentDataMap {
    return name in INSTRUMENTS_DATA
}

// Per-instrument id tables derived once from the note structs (ADR-0003: notes are
// {midi, ...} entities; the old parallel `midiNotes` array is derived, not stored).
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- build-time constants cache
const idTableCache = new Map<string, readonly number[]>()

/** Ordered Note Id list (button b plays table[b]) of an instrument; unknown names use the default instrument's, matching the legacy `new Instrument(name)` guard. */
export function getNoteIdTable(instrumentName: RuntimeInstrumentName): readonly number[] {
    const name = isInstrumentName(instrumentName) ? instrumentName : DEFAULT_INSTRUMENT
    const cached = idTableCache.get(name)
    if (cached) return cached
    const table = INSTRUMENTS_DATA[name].notes.map((note) => note.midi)
    idTableCache.set(name, table)
    return table
}

// QUIRK: plain module-level Map cache, not reactive - instrument tables are build-time
// constants of the selected game.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const reverseCache = new Map<string, Map<number, number>>()

function getReverseMap(instrumentName: RuntimeInstrumentName): Map<number, number> {
    const cached = reverseCache.get(instrumentName)
    if (cached) return cached
    const map = new Map<number, number>()
    getNoteIdTable(instrumentName).forEach((id, button) => {
        // first occurrence wins if a table ever contains duplicate ids
        if (!map.has(id)) map.set(id, button)
    })
    reverseCache.set(instrumentName, map)
    return map
}

/** The button playing a Note Id on this instrument, or -1 when the note is stranded on it. */
export function noteIdToButton(instrumentName: RuntimeInstrumentName, id: number): number {
    return getReverseMap(instrumentName).get(id) ?? -1
}

// The Song Grid's id -> slot lookup, built once: CANONICAL_NOTE_IDS is a build-time
// constant of the selected game, and the registry has already proven its ids unique.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- build-time constant cache
const canonicalSlotById = new Map<number, number>(CANONICAL_NOTE_IDS.map((id, slot) => [id, slot]))

/**
 * The Note Id's canonical Song-Grid slot — its index in the game's authored
 * `notes.canonicalNoteIds` — or -1 for an id the grid has no row for. A slot is NOT a
 * Button (CONTEXT.md: a Button is one instrument's key slot); the game fixes it and NO
 * instrument is involved. Slot N pairs with COMPOSER_NOTE_POSITIONS[N], so this is what
 * turns an id into a canvas row (ADR-0004). Before ADR-0004 the list was read off the
 * default instrument (`instruments.list[0]`): same values for both games today, but
 * the grid is no longer an accident of menu roster order.
 */
export function songGridSlotForId(id: number): number {
    return canonicalSlotById.get(id) ?? -1
}

// ─── MIDI import snapping (ADR-0007 phase E) ───────────────────────────────────────────
// Arithmetic over the Song Grid, replacing the per-game `midi.mapToNote` tables both games
// used to author. Those tables stated two things per in-range MIDI number — the grid id it
// snaps to, and whether it is an accidental — and both are facts ABOUT THE GRID that the
// grid already carries:
//   * a game's grid IS its scale, so an accidental is a pitch class the grid has no row for;
//   * the tables snapped every accidental DOWN one row, i.e. to the nearest grid id at or
//     below the number.
// Derived rather than authored so the two can never disagree (a hand-maintained table is a
// second, silently-drifting copy of the grid), and so a game whose scale is not the white
// keys gets the right answer without a branch. Byte-parity with the retired tables is exact
// for both shipped games — their grids are the gapless white keys of exactly the MIDI_BOUNDS
// range — and the midi fixtures pin it.

// Pitch classes the Song Grid has a row for, built once from the same build-time constant.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- build-time constant cache
const gridPitchClasses = new Set<number>(CANONICAL_NOTE_IDS.map((id) => ((id % 12) + 12) % 12))

/** A MIDI number is ACCIDENTAL when the grid has no row for its pitch class. By pitch class, so it answers for numbers outside MIDI_BOUNDS too — the importer's offset search scores un-shifted notes. */
export function isAccidentalMidi(midiNote: number): boolean {
    return !gridPitchClasses.has(((midiNote % 12) + 12) % 12)
}

// Absolute pitch names, SHARP-SPELLED. The one spelling choice this file makes, and it is made
// because a Note Number is a number and not a key signature: nothing in a stored song says whether
// its C#/Db means the raised C or the lowered D, so a single spelling is the only honest one to
// print. Sharps to match the '#' the composer already prints for an off-scale hint
// (ComposerCache.noteTextureKey's "1#"/"1b" pair) rather than the flats the BASEPOINT list spells
// (PITCHES: C, Db, D, …) — the Basepoint list names the twelve transpositions a user picks from, a
// different question from what pitch a row is.
const SHARP_PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/**
 * A Note Number's absolute pitch name, C#4-style — what the Pro View's row-label strip prints on the
 * rows that map to no button (spec §4; a row that IS a button prints that button's own label
 * instead, in the user's chosen wording).
 *
 * MIDI's own octave numbering, `floor(n / 12) − 1`, so 60 is C4 and the name matches every external
 * tool a user might compare against. Absolute and instrument-free by design: it names the axis, not
 * a Button, so it needs no instrument and no Basepoint — the two things a Button's label needs.
 *
 * Negative numbers keep working (C-1 downward): the axis can hold one, and a row-label that threw or
 * blanked there would be a hole exactly where the weird file the Pro View exists to fix is looked at.
 */
export function noteNameForMidi(midiNote: number): string {
    const pitchClass = ((midiNote % 12) + 12) % 12
    return `${SHARP_PITCH_NAMES[pitchClass]}${Math.floor(midiNote / 12) - 1}`
}

/**
 * A foreign MIDI number snapped onto the Song Grid, exactly as the retired table did:
 * - outside MIDI_BOUNDS → `{id: -1, isAccidental: false}`. The bounds ARE the range the table
 *   had keys for, so out-of-range notes come back unmapped and unflagged (the importer counts
 *   them under out-of-range, never under accidentals) — MidiNote.fromMidi's octave-folding
 *   loop is what gives them a second chance first.
 * - in range → the nearest grid id AT OR BELOW the number, flagged accidental when the number
 *   is not a grid pitch class itself.
 */
export function snapMidiToGrid(midiNote: number): {id: number, isAccidental: boolean} {
    if (!Number.isFinite(midiNote) || midiNote < MIDI_BOUNDS.lower || midiNote > MIDI_BOUNDS.upper) {
        return {id: -1, isAccidental: false}
    }
    let id = -1
    for (const candidate of CANONICAL_NOTE_IDS) {
        if (candidate <= midiNote && candidate > id) id = candidate
    }
    return {id, isAccidental: isAccidentalMidi(midiNote)}
}

/**
 * Where a note renders on a surface whose rows are its OWN track instrument's Buttons (the
 * player's approach/practice queue, the sheet visualizer): that instrument's Button at this
 * Basepoint, else — when the number is STRANDED there — the grid row it draws on, else -1
 * (not renderable). The fallback row is a game-authored grid position (ADR-0004), not "the row
 * this id has on the default instrument"; the two coincide for both shipped games.
 *
 * It goes through `gridRowForNumber`, so an OFF-SCALE strand gets its nearest row rather than
 * dropping out of the sheet entirely — the surfaces that read this (the player's sheet frames,
 * the visual song) then draw it where the composer canvas already does.
 *
 * NOT for surfaces that draw ONE instrument's keyboard and index it by that instrument's
 * Buttons: there the answer belongs to a different coordinate space (the note's own track,
 * or the grid) and lights the wrong key — the composer keyboard used to do exactly that, see
 * computeButtonLayerStatuses.
 *
 * (Its nominal-axis predecessor `displayButtonForId` is gone — ADR-0007 phase E: songs stopped
 * storing nominals at the flip, and no surface asked it anything afterwards.)
 */
export function displayButtonForNumber(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): number {
    const own = numberToButton(instrumentName, pitch, number)
    if (own !== -1) return own
    return gridRowForNumber(instrumentName, pitch, number).row
}

/**
 * Fills BOTH display coordinates of the notes the PLAYER is about to play, in one pass at
 * queue-build (the fields are documented on RecordedNote):
 *
 * - `displayButton` = displayButtonForNumber against the note's OWN TRACK instrument at that
 *   TRACK's effective Basepoint (`songPitch` plus the track's own override). Unchanged in
 *   meaning and deliberately so — the player's sheet frames read it and ADR-0004 keeps them
 *   own-button.
 * - `keyboardButton` = the key of the on-screen keyboard that sounds this number at
 *   `keyboardPitch`, -1 when that keyboard has none.
 *
 * TWO Basepoints, and they are genuinely different questions: "where does this note belong on
 * its own track's staff" is asked of the track that owns it, while "which key do I press"
 * is asked of the one keyboard on screen at the Basepoint IT sounds at. They coincide for the
 * ordinary single-instrument song, which is exactly when nobody would notice them collapsed.
 *
 * ONE keyboard, ONE coordinate space — the same rule computeButtonLayerStatuses states for the
 * composer's keyboard, and the same bug on the other surface. The player's display keyboard
 * follows the song's TRACK 0 (displayInstrument.ts) while `displayButton` answers per note's own
 * track, so on a multi-instrument song it is a number out of a FOREIGN instrument's Buttons, and
 * for an id stranded on its own track it is a Song-Grid slot: fed to `playerStore.keyboard` (which
 * holds the display instrument's notes) either one lights, queues and clears keys that play
 * unrelated notes — genshin's Lyre id 60 is Lyre button 7, and the horn keyboard's key 7 plays 48.
 * Notes with keyboardButton -1 are skipped by every keyboard/practice/approach path; they keep
 * their place in the timing stream (they still SOUND, by id, on their own track's instrument) and
 * they still draw in the sheet, which speaks the other coordinate.
 */
export function resolvePlayerNoteButtons(
    notes: readonly RecordedNote[],
    instruments: readonly InstrumentData[],
    keyboardInstrumentName: RuntimeInstrumentName,
    songPitch: Pitch,
    keyboardPitch: Pitch
): void {
    for (const note of notes) {
        const instrument = instruments[note.trackIndex]
        note.displayButton = displayButtonForNumber(
            instrument?.name ?? '',
            effectiveTrackPitch(instrument, songPitch),
            note.id
        )
        note.keyboardButton = numberToButton(keyboardInstrumentName, keyboardPitch, note.id)
    }
}

/**
 * A track's EFFECTIVE Basepoint: its own override, else the song's (spec §4 — unchanged by
 * ADR-0007, but load-bearing now that it decides what a stored number means, not just a
 * playback rate). Every surface that resolves a note asks through here, so the rule has one
 * spelling rather than a dozen `instrument?.pitch || songPitch` expressions to keep in step.
 */
export function effectiveTrackPitch(instrument: {pitch: Pitch | ''} | undefined, songPitch: Pitch): Pitch {
    return instrument?.pitch || songPitch
}

/**
 * Replicates the legacy NoteLayer.toLayerStatus texture/status selection over per-track
 * notes, per BUTTON OF THE KEYBOARD ON SCREEN: bit 0 = the current layer has a note on this
 * button; bits 1-3 = the icon classes of OTHER visible tracks with a note there. Used by the
 * composer KEYBOARD only.
 *
 * ONE coordinate space — the DISPLAYED instrument's Buttons (ADR-0004: the keyboard's rows
 * ARE the instrument's Buttons), at the DISPLAYED instrument's own Basepoint. Every note,
 * whatever track it sits on, is asked the one question this keyboard can answer: which of MY
 * keys sounds that number? A number it cannot voice resolves to -1 and lights NOTHING. Such
 * notes stay visible on the canvas, which places by grid row — see
 * computeGridRowLayerStatuses.
 *
 * Deliberately not displayButtonForId (which is what this did before, and the bug): that
 * answers in the note's OWN track's Buttons, with the canonical Song-Grid slot as the
 * stranded fallback, so a sub-grid keyboard (genshin's 14-button NightwindHorn) got handed
 * numbers from two foreign spaces and indexed them as its own — a stranded id's grid slot and
 * another track's button both lit keys that play unrelated notes.
 */
export function computeButtonLayerStatuses(notes: readonly ColumnNote[], currentLayer: number, instruments: InstrumentData[], keyboardInstrumentName: RuntimeInstrumentName, keyboardPitch: Pitch): Map<number, LayerStatus> {
    const buttons = new Map<number, LayerStatus>()
    for (const note of notes) {
        const button = numberToButton(keyboardInstrumentName, keyboardPitch, note.id)
        if (button === -1) continue
        let status = buttons.get(button) ?? 0
        if (note.trackIndex === currentLayer) {
            status |= 1
        } else if (instruments[note.trackIndex]?.visible) {
            status |= 1 << instruments[note.trackIndex].toNoteIcon()
        }
        buttons.set(button, LAYER_STATUSES[status] ?? 0)
    }
    return buttons
}

/**
 * The composer CANVAS counterpart of computeButtonLayerStatuses: identical texture/status
 * bits, but rows are canonical Song-Grid slots instead of the Buttons of one keyboard.
 * Placement is `gridRowForNumber`'s answer for the note's OWN track (ADR-0004 under
 * ADR-0007): the track's instrument and Basepoint decide which grid row a number draws on,
 * which is what puts a tuned button on the row its own label prints and an off-scale strand
 * on its nearest row. Numbers with no grid row at all are skipped. The keyboard's counterpart
 * keys by the Buttons of the instrument it draws, and drops the numbers that instrument
 * cannot voice — the canvas is where those notes remain visible.
 */
export function computeGridRowLayerStatuses(notes: readonly ColumnNote[], currentLayer: number, instruments: InstrumentData[], songPitch: Pitch): Map<number, LayerStatus> {
    const rows = new Map<number, LayerStatus>()
    for (const note of notes) {
        const instrument = instruments[note.trackIndex]
        const row = gridRowForNumberCached(instrument?.name ?? '', effectiveTrackPitch(instrument, songPitch), note.id).row
        if (row === -1) continue
        let status = rows.get(row) ?? 0
        if (note.trackIndex === currentLayer) {
            status |= 1
        } else if (instruments[note.trackIndex]?.visible) {
            status |= 1 << instruments[note.trackIndex].toNoteIcon()
        }
        rows.set(row, LAYER_STATUSES[status] ?? 0)
    }
    return rows
}

/**
 * Song-Grid rows whose every contributing note is STRANDED on its own instrument — the rows the
 * composer canvas dims — each mapped to the ACCIDENTAL HINT its notes agree on: -1 flat, +1 sharp,
 * 0 none. The KEYS are exactly the old `computeGridStrandedRows` set (`.has(row)` still answers
 * "dim this row"); the VALUE is the second half of the same question, which is what tells an
 * OFF-SCALE strand — a number whose virtual nominal falls between two grid rows — apart from a
 * merely un-voiced one sitting on its own row (ADR-0007 phase D).
 *
 * Stranded notes render exactly as before ADR-0004 — canonical row, dimmed — and the "a row with
 * any healthy contributor is not dimmed" rule is unchanged; what changed at ADR-0004 is that
 * healthy notes are now keyed by the SAME canonical row as stranded ones, so a misplaced healthy
 * note can no longer land on an unrelated row and either collide with a stranded marker or silently
 * clear it. A healthy contributor clears the HINT with the dimming, for the same reason and in the
 * same step: the row is drawn as one sprite, and a row that reads as voiced must not also claim to
 * be a semitone off.
 *
 * DISAGREEING contributors (a sharp and a flat, or an off-scale strand sharing a row with an
 * on-scale one) collapse to 0 rather than to either answer: one sprite cannot honestly carry two
 * hints, and no hint reads as "stranded, look at the notes" instead of a wrong one.
 *
 * ONE function for both facts, not two: the dimming and the hint must describe the row the note is
 * DRAWN on, and two independent passes over the same notes are two chances to disagree about it.
 * There is no own-button counterpart — the canvas was the only surface that dimmed stranded rows,
 * so the pre-ADR-0004 own-button version was deleted rather than left as a second answer.
 */
export function computeGridStrandedMarks(notes: readonly ColumnNote[], instruments: InstrumentData[], songPitch: Pitch): Map<number, -1 | 0 | 1> {
    const stranded = new Map<number, -1 | 0 | 1>()
    const healthy = new Set<number>()
    for (const note of notes) {
        const instrument = instruments[note.trackIndex]
        //ONE call for both facts, so the row a note is dimmed on can never be a different row
        //from the one it is drawn on (they were two lookups before ADR-0007)
        const placement = gridRowForNumberCached(instrument?.name ?? '', effectiveTrackPitch(instrument, songPitch), note.id)
        if (placement.row === -1) continue
        if (!placement.stranded) {
            healthy.add(placement.row)
            continue
        }
        const marked = stranded.get(placement.row)
        stranded.set(placement.row, marked === undefined || marked === placement.accidental ? placement.accidental : 0)
    }
    for (const row of healthy) stranded.delete(row)
    return stranded
}

/** Octave-fold a value into the [min, max] of a table, keeping its pitch class. */
function foldIntoTable(table: readonly number[], value: number): number {
    if (table.length === 0 || !Number.isFinite(value)) return value
    let min = table[0], max = table[0]
    for (const t of table) {
        if (t < min) min = t
        if (t > max) max = t
    }
    if (value > max) {
        const offsetBelowMax = ((max - value) % 12 + 12) % 12
        return max - offsetBelowMax
    }
    if (value < min) {
        const offsetAboveMin = ((value - min) % 12 + 12) % 12
        return min + offsetAboveMin
    }
    return value
}

// ─── Note Numbers (ADR-0007) ───────────────────────────────────────────────────────────
// The absolute axis songs store, and the Basepoint-aware resolution between it and an
// instrument's Buttons. Since the phase-C flip this is what every format, the engine and
// every surface speak; the nominal half above survives as the currency of button
// correspondence (swaps, grid rows, legacy decode, MIDI-import snapping) and nothing else.

// Per-instrument Note Number tables, cached exactly like the nominal ones and built from
// the SAME note structs (ADR-0003 entities) through the same adapter — `sounding` is
// derived + validated once at registry build (registry.ts), never authored and never
// recomputed here.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- build-time constants cache
const soundingTableCache = new Map<string, readonly number[]>()

/**
 * Ordered Note Number list AT BASEPOINT C (button b enters table[b] + offset(pitch)) of an
 * instrument; unknown names use the default instrument's, matching getNoteIdTable and the
 * legacy `new Instrument(name)` guard.
 *
 * Entry b is the Sounding Pitch of a Pitched Button and the Nominal Id of an Assigned one
 * (percussion, SFX, chord strums) — the two are the same number for every instrument whose
 * `baseNote`s match its nominal grid, and differ only where the game tuned a button away
 * from it (genshin's Vintage-Lyre).
 */
export function getSoundingTable(instrumentName: RuntimeInstrumentName): readonly number[] {
    const name = isInstrumentName(instrumentName) ? instrumentName : DEFAULT_INSTRUMENT
    const cached = soundingTableCache.get(name)
    if (cached) return cached
    const table = INSTRUMENTS_DATA[name].notes.map((note) => note.sounding)
    soundingTableCache.set(name, table)
    return table
}

// QUIRK: plain module-level Map cache, not reactive — same reasoning as reverseCache.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const soundingReverseCache = new Map<string, Map<number, number>>()

function getSoundingReverseMap(instrumentName: RuntimeInstrumentName): Map<number, number> {
    const cached = soundingReverseCache.get(instrumentName)
    if (cached) return cached
    const map = new Map<number, number>()
    getSoundingTable(instrumentName).forEach((sounding, button) => {
        // First button wins, like the nominal map — but unlike that map it never has to
        // choose: registry validation rejects an instrument whose buttons repeat a sounding
        // value, across BOTH kinds (registry.normalizeNotes), precisely because nothing can
        // address the shadowed button any more. No button-keyed play path survives ADR-0007
        // — every note, from a song or from the keyboard, is a Note Number resolved through
        // here — so a shadowed button would simply sound the earlier one's sample. The `has`
        // check is the belt to validation's braces, not a policy of its own.
        if (!map.has(sounding)) map.set(sounding, button)
    })
    soundingReverseCache.set(instrumentName, map)
    return map
}

/** The Basepoint's semitone rise (its PITCHES index, 0..11 — always upward, spec §4). */
export function basepointOffset(pitch: Pitch): number {
    return PITCH_TO_INDEX.get(pitch) ?? 0
}

/** The Note Number a button enters at this Basepoint, or null past the instrument's range. */
export function buttonToNumber(instrumentName: RuntimeInstrumentName, pitch: Pitch, button: number): number | null {
    const sounding = getSoundingTable(instrumentName)[button]
    return sounding === undefined ? null : sounding + basepointOffset(pitch)
}

/**
 * The button voicing a Note Number on this instrument at this Basepoint, or -1 when the
 * number is STRANDED there (spec §4: `soundingTable.indexOf(number − offset)`).
 *
 * -1 is the playback answer too: a stranded note is skipped, never rewritten and never
 * approximated onto a neighbouring button — exactly what an unplayable Note Id does today.
 */
export function numberToButton(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): number {
    return getSoundingReverseMap(instrumentName).get(number - basepointOffset(pitch)) ?? -1
}

/**
 * Where a Note Number draws on the compressed composer view, whose rows are the Song Grid's
 * canonical slots (ADR-0004) and NOT an instrument's Buttons:
 * - `row` — the canonical slot, or -1 when the game's grid is empty (never in practice).
 * - `stranded` — the track's instrument cannot voice this number at this Basepoint; the
 *   note still draws (dimmed, as before ADR-0007) and still cannot sound.
 * - `accidental` — -1 flat / 0 exact / +1 sharp: the note is OFF-SCALE, i.e. its virtual
 *   nominal falls between two grid rows, and it is drawn on the nearest one with a hint.
 */
export type GridRowPlacement = {row: number, stranded: boolean, accidental: -1 | 0 | 1}

/**
 * A Nominal Id lifted onto the absolute axis for one instrument at one Basepoint (spec §4's
 * migration formula, which is the same arithmetic wherever a NOMINAL is the thing being named:
 * legacy decode, an instrument-space grid tool, the MIDI importer's snapped white keys).
 *
 * A nominal the instrument HAS becomes that button's Sounding Pitch carried by the Basepoint —
 * so the note sounds what the button sounds. A nominal it does not have has no button to ask
 * and is carried across as itself, which strands it exactly where it would have been.
 */
export function nominalToNumber(instrumentName: RuntimeInstrumentName, pitch: Pitch, nominal: number): number {
    const button = noteIdToButton(instrumentName, nominal)
    const sounding = button === -1 ? nominal : (getSoundingTable(instrumentName)[button] ?? nominal)
    return sounding + basepointOffset(pitch)
}

// RETIRED with the old-format EXPORT it existed for (ADR-0007 phase E). Its only two callers
// were ComposedSong/RecordedSong's `nominalOf`, and those are commented out beside their
// `toOldFormat`; kept commented here so that reference block stays complete. Nothing else ever
// needed the way BACK to the nominal axis — gridRowForNumber asks `numberToButton` for the
// button and reads its nominal directly, which is the same answer without the round trip.
//
// /**
//  * nominalToNumber's inverse, and the ONLY way back to the nominal axis: the voicing button's
//  * Nominal Id, else (stranded) the virtual nominal `number − offset`.
//  *
//  * EXACTLY invertible against nominalToNumber for both cases, which is what keeps the
//  * nominal-space exports (`toOldFormat`, its dropped-note count) byte-identical across the flip
//  * even on a tuned instrument, and what lets gridRowForNumber place a tuned button on the row
//  * its own label prints.
//  */
// export function numberToNominal(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): number {
//     const button = numberToButton(instrumentName, pitch, number)
//     if (button === -1) return number - basepointOffset(pitch)
//     return getNoteIdTable(instrumentName)[button] ?? number - basepointOffset(pitch)
// }

/**
 * foldIdIntoRange on the absolute axis — the cross-game conversion policy (ADR-0007 keeps it
 * SOUND-preserving): fold in SOUNDING space, so what the listener hears moves by whole octaves
 * only, then carry the Basepoint back. A number landing on a gap of the target instrument stays
 * where it fell and strands visibly, exactly as an id did.
 */
export function foldNumberIntoRange(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): number {
    if (!Number.isFinite(number)) return number
    const offset = basepointOffset(pitch)
    return foldIntoTable(getSoundingTable(instrumentName), number - offset) + offset
}

/**
 * Spec §4's grid-row rule, in the one place every surface with Song-Grid rows reads it:
 *
 *  1. VOICED (`numberToButton` finds a button) → the canonical slot of THAT BUTTON'S
 *     NOMINAL ID. The button is the fact; its nominal is what the grid is indexed by, so a
 *     tuned button draws on the row its instrument prints on it (Vintage-Lyre's Db button
 *     sits on the D row, where its player expects to find it) even though it sounds a
 *     semitone lower.
 *  2. STRANDED, virtual nominal (`number − offset`) IS a canonical id → that row, marked
 *     stranded. This is ADR-0004's stranded-note fallback, preserved exactly.
 *  3. STRANDED and OFF-SCALE → the nearest canonical id by absolute distance (tie: the
 *     LOWER id, so the choice never depends on the authored row order), marked stranded,
 *     with the accidental hint signed by (virtual − chosen). Deliberately nearest-row and
 *     not "drop it": an off-scale note is selectable and deletable, which is the whole
 *     point of storing it honestly instead of snapping it at entry.
 *
 * A voiced note is never off-scale (accidental 0): whatever it sounds, it HAS a button, and
 * every instrument's nominal ids are grid members (registry-validated).
 */
export function gridRowForNumber(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): GridRowPlacement {
    const button = numberToButton(instrumentName, pitch, number)
    if (button !== -1) {
        return {row: songGridSlotForId(getNoteIdTable(instrumentName)[button]), stranded: false, accidental: 0}
    }
    const virtual = number - basepointOffset(pitch)
    const exactRow = songGridSlotForId(virtual)
    if (exactRow !== -1) return {row: exactRow, stranded: true, accidental: 0}
    let nearest = -1
    let nearestDistance = Infinity
    for (const id of CANONICAL_NOTE_IDS) {
        const distance = Math.abs(virtual - id)
        if (distance < nearestDistance || (distance === nearestDistance && id < nearest)) {
            nearest = id
            nearestDistance = distance
        }
    }
    if (nearest === -1) return {row: -1, stranded: true, accidental: 0}
    return {
        row: songGridSlotForId(nearest),
        stranded: true,
        accidental: Math.sign(virtual - nearest) as -1 | 0 | 1,
    }
}

// Per-track row LUTs (spec §8 "cached by (instrumentName, effectivePitch)"). NOT invalidated,
// and deliberately so: both halves of the key are IN the key, and everything the answer is
// derived from below them — the instrument's nominal and sounding tables, CANONICAL_NOTE_IDS —
// is a build-time constant of the selected game. A cache keyed by every input it reads cannot
// go stale; the roster/pitch signals the composer already has are what select WHICH LUT a draw
// reads, not what expires one.
//
// It exists for the OFF-SCALE branch above, which scans the whole grid per note. Voiced notes
// are two map lookups either way; a canvas full of strands would pay that scan on every draw.
// The entries are bounded by the numbers a song actually contains.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- memo of a pure function over build-time constants
const gridRowCache = new Map<string, Map<number, GridRowPlacement>>()

/** gridRowForNumber memoized per (instrument, Basepoint) — what per-draw surfaces call. */
export function gridRowForNumberCached(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): GridRowPlacement {
    const key = `${instrumentName} ${pitch}`
    let lut = gridRowCache.get(key)
    if (lut === undefined) {
        lut = new Map<number, GridRowPlacement>()
        gridRowCache.set(key, lut)
    }
    const cached = lut.get(number)
    if (cached !== undefined) return cached
    const placement = gridRowForNumber(instrumentName, pitch, number)
    lut.set(number, placement)
    return placement
}
