// Runtime Note Id <-> Button resolution for the ACTIVE game (see CONTEXT.md: Note Id,
// Button, Stranded Note). Songs store Note Ids; every button lookup happens here.
//
// The authoritative per-instrument table is the game definition's `midiNotes` array
// (nominal ids — ADR-0001). This module reads it through the core-tier legacyConfig
// adapter (INSTRUMENTS_DATA), never from `$game` directly, so it stays importable from
// plain-TS domain code and vitest. The Song Grid's row order is a SEPARATE authored
// list (CANONICAL_NOTE_IDS, ADR-0004) read through the same adapter — no instrument
// defines it, which is why the *Grid* helpers below place by Note Id alone.
//
// Distinct from legacyNoteTables.ts: that file is a FROZEN snapshot used only to decode
// legacy serialized songs (possibly of the OTHER game); this module reflects the current
// build's live instrument data and is used for playback, rendering, and authoring.

import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA} from '$core/legacyConfig'
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

/** Octave-fold an id into an instrument's range (cross-game NEW-format import policy: fold into range, keep even if it lands on a gap — the note strands visibly instead of being rewritten twice). */
export function foldIdIntoRange(instrumentName: RuntimeInstrumentName, id: number): number {
    const table = getNoteIdTable(instrumentName)
    if (table.length === 0 || !Number.isFinite(id)) return id
    let min = table[0], max = table[0]
    for (const t of table) {
        if (t < min) min = t
        if (t > max) max = t
    }
    if (id > max) {
        const offsetBelowMax = ((max - id) % 12 + 12) % 12
        return max - offsetBelowMax
    }
    if (id < min) {
        const offsetAboveMin = ((id - min) % 12 + 12) % 12
        return min + offsetAboveMin
    }
    return id
}
