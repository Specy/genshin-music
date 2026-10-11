// Section detection for MIDI medleys: a long file that strings several songs together usually
// marks each new song with a key change and/or a tempo change. Importing the whole medley as one
// composed song forces a single BPM and Basepoint on all of them, so the importer offers each
// detected section as its own import range.
//
// Pure arithmetic over the header @tonejs/midi already parsed, so it is unit-testable without a
// component (same reason midiImport.ts was extracted).

export type MidiSection = {
    /** Seconds, inclusive. */
    start: number
    /** Seconds, exclusive. */
    end: number
    /** The tempo that covers most of the section, in quarter-note BPM as the MIDI states it. */
    bpm: number
    /** Tonic of the key signature in force at the section start (as the file spells it), if any. */
    key: string | null
    minor: boolean
}

export type MidiSectionHeader = {
    tempos: readonly {ticks: number; bpm: number}[]
    keySignatures: readonly {ticks: number; key: string; scale?: string}[]
    ticksToSeconds: (ticks: number) => number
}

/** A tempo move smaller than this (relative) is a ritardando or a nudge, not a new song. */
const TEMPO_JUMP = 0.12
/** Changes closer than this are one transition (a rit into a new tempo, a pickup bar...). */
const MERGE_SECONDS = 6
/** A section shorter than this is folded into its neighbour. */
const MIN_SECTION_SECONDS = 12

export function detectMidiSections(header: MidiSectionHeader, durationSeconds: number): MidiSection[] {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
    const tempos = [...header.tempos]
        .map(t => ({time: header.ticksToSeconds(t.ticks), bpm: t.bpm}))
        .sort((a, b) => a.time - b.time)
    const keys = [...header.keySignatures]
        .map(k => ({time: header.ticksToSeconds(k.ticks), key: k.key, minor: k.scale === 'minor'}))
        .sort((a, b) => a.time - b.time)

    const keyAt = (time: number) => {
        let key: {key: string; minor: boolean} | null = keys[0] ?? null
        for (const k of keys) if (k.time <= time + 1e-6) key = k
        return key
    }

    // ---- candidate boundaries: key changes, and tempo jumps that HOLD -------------------
    const candidates: number[] = []
    for (let i = 1; i < keys.length; i++) {
        const changed = keys[i].key !== keys[i - 1].key || keys[i].minor !== keys[i - 1].minor
        if (changed && keys[i].time > 0) candidates.push(keys[i].time)
    }
    // compared against the last tempo that HELD, so a ritardando that returns to the old tempo
    // (or a short transition) never counts as a new song
    let stable = tempos[0]?.bpm ?? 120
    for (let i = 1; i < tempos.length; i++) {
        const after = tempos[i].bpm
        const holds = (tempos[i + 1]?.time ?? durationSeconds) - tempos[i].time >= MERGE_SECONDS
        if (!holds) continue
        if (Math.abs(after - stable) / stable >= TEMPO_JUMP && tempos[i].time > 0) candidates.push(tempos[i].time)
        stable = after
    }
    candidates.sort((a, b) => a - b)

    // ---- merge near-simultaneous changes (keep the LAST of a cluster: where the new song lands)
    const boundaries: number[] = []
    for (const time of candidates) {
        const last = boundaries[boundaries.length - 1]
        if (last !== undefined && time - last < MERGE_SECONDS) boundaries[boundaries.length - 1] = time
        else boundaries.push(time)
    }

    // ---- build sections, folding the too-short ones into the previous ------------------
    const edges = [0, ...boundaries.filter(b => b > 0 && b < durationSeconds), durationSeconds]
    const sections: {start: number; end: number}[] = []
    for (let i = 0; i < edges.length - 1; i++) {
        const start = edges[i]
        const end = edges[i + 1]
        const previous = sections[sections.length - 1]
        if (previous && end - start < MIN_SECTION_SECONDS) previous.end = end
        else sections.push({start, end})
    }
    if (sections.length > 1 && sections[0].end - sections[0].start < MIN_SECTION_SECONDS) {
        sections[1].start = sections[0].start
        sections.shift()
    }

    return sections.map(({start, end}) => {
        const key = keyAt(start)
        return {start, end, bpm: predominantTempo(tempos, start, end), key: key?.key ?? null, minor: key?.minor ?? false}
    })
}

/** The tempo covering the most time inside [start, end). */
function predominantTempo(tempos: readonly {time: number; bpm: number}[], start: number, end: number): number {
    if (tempos.length === 0) return 120
    const weight = new Map<number, number>()
    const points = [start, ...tempos.map(t => t.time).filter(t => t > start && t < end), end]
    for (let i = 0; i < points.length - 1; i++) {
        let bpm = tempos[0].bpm
        for (const t of tempos) if (t.time <= points[i] + 1e-6) bpm = t.bpm
        const rounded = Math.round(bpm)
        weight.set(rounded, (weight.get(rounded) ?? 0) + (points[i + 1] - points[i]))
    }
    let best = tempos[0].bpm
    let bestWeight = -1
    for (const [bpm, w] of weight) {
        if (w > bestWeight) {
            best = bpm
            bestWeight = w
        }
    }
    return best
}
