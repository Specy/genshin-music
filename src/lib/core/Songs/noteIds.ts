// Runtime Note Id <-> Button resolution for the ACTIVE game (see CONTEXT.md: Note Id,
// Button, Stranded Note). Songs store Note Ids; every button lookup happens here.
//
// The authoritative per-instrument table is the game definition's `midiNotes` array
// (nominal ids — ADR-0001). This module reads it through the core-tier legacyConfig
// adapter (INSTRUMENTS_DATA), never from `$game` directly, so it stays importable from
// plain-TS domain code and vitest.
//
// Distinct from legacyNoteTables.ts: that file is a FROZEN snapshot used only to decode
// legacy serialized songs (possibly of the OTHER game); this module reflects the current
// build's live instrument data and is used for playback, rendering, and authoring.

import {INSTRUMENTS, INSTRUMENTS_DATA} from '$core/legacyConfig'
import type {ColumnNote, InstrumentData} from './SongClasses'
import type {LayerStatus} from './Layer'

type InstrumentDataMap = typeof INSTRUMENTS_DATA
export type RuntimeInstrumentName = keyof InstrumentDataMap | (string & {})

const DEFAULT_INSTRUMENT = INSTRUMENTS[0]
const LAYER_STATUSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const

function isInstrumentName(name: RuntimeInstrumentName): name is keyof InstrumentDataMap {
    return name in INSTRUMENTS_DATA
}

/** Ordered Note Id list (button b plays table[b]) of an instrument; unknown names use the default instrument's, matching the legacy `new Instrument(name)` guard. */
export function getNoteIdTable(instrumentName: RuntimeInstrumentName): readonly number[] {
    const data = isInstrumentName(instrumentName)
        ? INSTRUMENTS_DATA[instrumentName]
        : INSTRUMENTS_DATA[DEFAULT_INSTRUMENT]
    return data.midiNotes
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

/** Button position of a Note Id on the game's default (full-size) instrument, or -1. */
export function canonicalButtonForId(id: number): number {
    return noteIdToButton(DEFAULT_INSTRUMENT, id)
}

/**
 * Where a note renders on the shared button grid: its own instrument's button, else the
 * canonical position (stranded notes keep the row their id has on the default
 * instrument — visually identical to the pre-id format), else -1 (not renderable).
 */
export function displayButtonForId(instrumentName: RuntimeInstrumentName, id: number): number {
    const own = noteIdToButton(instrumentName, id)
    if (own !== -1) return own
    return canonicalButtonForId(id)
}

/**
 * Replicates the legacy NoteLayer.toLayerStatus texture/status selection over per-track
 * notes, per display row: bit 0 = the current layer has a note on this row; bits 1-3 =
 * the icon classes of OTHER visible tracks with a note there. Rows are display buttons.
 * Used by the composer canvas and keyboard.
 */
export function computeRowLayerStatuses(notes: readonly ColumnNote[], currentLayer: number, instruments: InstrumentData[]): Map<number, LayerStatus> {
    const rows = new Map<number, LayerStatus>()
    for (const note of notes) {
        const button = displayButtonForId(instruments[note.trackIndex]?.name ?? '', note.id)
        if (button === -1) continue
        let status = rows.get(button) ?? 0
        if (note.trackIndex === currentLayer) {
            status |= 1
        } else if (instruments[note.trackIndex]?.visible) {
            status |= 1 << instruments[note.trackIndex].toNoteIcon()
        }
        rows.set(button, LAYER_STATUSES[status] ?? 0)
    }
    return rows
}

/**
 * Display rows whose every contributing note is STRANDED on its own instrument (rendered
 * at the canonical fallback row) — the composer marks these visually. A row with at
 * least one non-stranded contributor renders normally.
 */
export function computeStrandedRows(notes: readonly ColumnNote[], instruments: InstrumentData[]): Set<number> {
    const stranded = new Set<number>()
    const healthy = new Set<number>()
    for (const note of notes) {
        const instrumentName = instruments[note.trackIndex]?.name ?? ''
        const ownButton = noteIdToButton(instrumentName, note.id)
        if (ownButton !== -1) {
            healthy.add(ownButton)
        } else {
            const fallback = canonicalButtonForId(note.id)
            if (fallback !== -1) stranded.add(fallback)
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
