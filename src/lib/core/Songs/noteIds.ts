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
//    legacy decode).
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

import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, type Pitch, PITCH_TO_INDEX} from '$core/legacyConfig'
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

/** The Note Id of a button, or null past the instrument's range. */
export function buttonToNoteId(instrumentName: RuntimeInstrumentName, button: number): number | null {
    return getNoteIdTable(instrumentName)[button] ?? null
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

/**
 * Where a note renders on a surface whose rows are its OWN track instrument's Buttons (the
 * player's approach/practice queue, the sheet visualizer): that instrument's button, else —
 * when the note is STRANDED there — the id's canonical Song-Grid slot as a fallback row,
 * else -1 (not renderable). The fallback is a game-authored grid position (ADR-0004), not
 * "the row this id has on the default instrument"; the two coincide for both shipped games.
 *
 * NOT for surfaces that draw ONE instrument's keyboard and index it by that instrument's
 * Buttons: there the answer belongs to a different coordinate space (the note's own track,
 * or the grid) and lights the wrong key — the composer keyboard used to do exactly that, see
 * computeButtonLayerStatuses. Surfaces whose rows ARE the Song Grid (the composer canvas)
 * use songGridSlotForId for every note instead.
 */
export function displayButtonForId(instrumentName: RuntimeInstrumentName, id: number): number {
    const own = noteIdToButton(instrumentName, id)
    if (own !== -1) return own
    return songGridSlotForId(id)
}

/**
 * Fills BOTH display coordinates of the notes the PLAYER is about to play, in one pass at
 * queue-build (the fields are documented on RecordedNote):
 *
 * - `displayButton` = displayButtonForId against the note's OWN TRACK instrument. Unchanged
 *   and deliberately so — the player's sheet frames read it and ADR-0004 keeps them own-button.
 * - `keyboardButton` = noteIdToButton against the instrument the on-screen keyboard is drawn
 *   from, -1 when that keyboard has no key for the id.
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
export function resolvePlayerNoteButtons(notes: readonly RecordedNote[], instruments: readonly InstrumentData[], keyboardInstrumentName: RuntimeInstrumentName): void {
    for (const note of notes) {
        note.displayButton = displayButtonForId(instruments[note.trackIndex]?.name ?? '', note.id)
        note.keyboardButton = noteIdToButton(keyboardInstrumentName, note.id)
    }
}

/**
 * Replicates the legacy NoteLayer.toLayerStatus texture/status selection over per-track
 * notes, per BUTTON OF THE KEYBOARD ON SCREEN: bit 0 = the current layer has a note on this
 * button; bits 1-3 = the icon classes of OTHER visible tracks with a note there. Used by the
 * composer KEYBOARD only.
 *
 * ONE coordinate space — the DISPLAYED instrument's Buttons (ADR-0004: the keyboard's rows
 * ARE the instrument's Buttons). Every note, whatever track it sits on, resolves through
 * noteIdToButton against `keyboardInstrumentName`; an id that keyboard cannot play resolves
 * to -1 and lights NOTHING, because the keyboard has no key that plays it. Such notes stay
 * visible on the canvas, which places by Note Id (ADR-0004) — see computeGridRowLayerStatuses.
 *
 * Deliberately not displayButtonForId (which is what this did before, and the bug): that
 * answers in the note's OWN track's Buttons, with the canonical Song-Grid slot as the
 * stranded fallback, so a sub-grid keyboard (genshin's 14-button NightwindHorn) got handed
 * numbers from two foreign spaces and indexed them as its own — a stranded id's grid slot and
 * another track's button both lit keys that play unrelated notes.
 */
export function computeButtonLayerStatuses(notes: readonly ColumnNote[], currentLayer: number, instruments: InstrumentData[], keyboardInstrumentName: RuntimeInstrumentName): Map<number, LayerStatus> {
    const buttons = new Map<number, LayerStatus>()
    for (const note of notes) {
        const button = noteIdToButton(keyboardInstrumentName, note.id)
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
 * bits, but rows are canonical Song-Grid slots (songGridSlotForId) instead of the Buttons of
 * one keyboard. Placement reads the Note Id and NOTHING else (ADR-0004), so one id occupies
 * one row on every track; the track's instrument is consulted only for the visible/icon bits.
 * Ids with no grid row are skipped. The keyboard's counterpart keys by the Buttons of the
 * instrument it draws, and drops the ids that instrument cannot play — the canvas is where
 * those notes remain visible.
 */
export function computeGridRowLayerStatuses(notes: readonly ColumnNote[], currentLayer: number, instruments: InstrumentData[]): Map<number, LayerStatus> {
    const rows = new Map<number, LayerStatus>()
    for (const note of notes) {
        const row = songGridSlotForId(note.id)
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
 * Song-Grid rows whose every contributing note is STRANDED on its own instrument, which
 * the composer canvas dims. Stranded notes render exactly as before ADR-0004 — canonical
 * row, dimmed — and the "a row with any healthy contributor is not dimmed" rule is
 * unchanged; what changed is that healthy notes are now keyed by the SAME canonical row
 * as stranded ones, so a misplaced healthy note can no longer land on an unrelated row
 * and either collide with a stranded marker or silently clear it. There is no own-button
 * counterpart: the canvas was the only surface that dimmed stranded rows, so the
 * pre-ADR-0004 own-button version was deleted rather than left as a second answer.
 */
export function computeGridStrandedRows(notes: readonly ColumnNote[], instruments: InstrumentData[]): Set<number> {
    const stranded = new Set<number>()
    const healthy = new Set<number>()
    for (const note of notes) {
        const row = songGridSlotForId(note.id)
        if (row === -1) continue
        if (noteIdToButton(instruments[note.trackIndex]?.name ?? '', note.id) !== -1) {
            healthy.add(row)
        } else {
            stranded.add(row)
        }
    }
    for (const row of healthy) stranded.delete(row)
    return stranded
}

/** Octave-fold a value into the [min, max] of a table, keeping its pitch class. Shared by both axes. */
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

/** Octave-fold an id into an instrument's range (cross-game NEW-format import policy: fold into range, keep even if it lands on a gap — the note strands visibly instead of being rewritten twice). */
export function foldIdIntoRange(instrumentName: RuntimeInstrumentName, id: number): number {
    return foldIntoTable(getNoteIdTable(instrumentName), id)
}

// ─── Note Numbers (ADR-0007) ───────────────────────────────────────────────────────────
// The absolute axis songs store, and the Basepoint-aware resolution between it and an
// instrument's Buttons. NOTHING outside tests consumes this half yet (spec phase B): the
// formats, the engine and every surface still speak Nominal Ids until the phase-C flip, so
// the nominal API above is deliberately left untouched rather than reimplemented on top.

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
        // First button wins, like the nominal map — but where a duplicate NOMINAL id is a
        // registry error, a duplicate sounding value is only rejected AMONG PITCHED BUTTONS
        // (two of those would be indistinguishable in every song). An Assigned Button keeps
        // its Nominal Id precisely so alike-sounding ones never collapse, so it can legally
        // repeat a pitched neighbour's number; the earlier button is then the one that
        // sounds, and the later one is reachable only through its own Button.
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

/**
 * nominalToNumber's inverse, and the ONLY way back to the nominal axis: the voicing button's
 * Nominal Id, else (stranded) the virtual nominal `number − offset`.
 *
 * EXACTLY invertible against nominalToNumber for both cases, which is what keeps the
 * nominal-space exports (`toOldFormat`, its dropped-note count) byte-identical across the flip
 * even on a tuned instrument, and what lets gridRowForNumber place a tuned button on the row
 * its own label prints.
 */
export function numberToNominal(instrumentName: RuntimeInstrumentName, pitch: Pitch, number: number): number {
    const button = numberToButton(instrumentName, pitch, number)
    if (button === -1) return number - basepointOffset(pitch)
    return getNoteIdTable(instrumentName)[button] ?? number - basepointOffset(pitch)
}

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
