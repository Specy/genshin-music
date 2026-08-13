import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    APP_NAME, BASE_LAYER_LIMIT, BASE_THEME_CONFIG, COMPOSER_NOTE_POSITIONS,
    DO_RE_MI_NOTE_SCALE, IMPORT_NOTE_POSITIONS, INSTRUMENTS, INSTRUMENTS_DATA,
    MIDI_BOUNDS, MIDI_MAP_TO_NOTE, MIDI_PRESETS, NOTE_MAP_TO_MIDI, NOTE_NAME_TYPES,
    NOTE_SCALE, NOTES_CSS_CLASSES, NOTES_PER_COLUMN, PITCHES, TEMPO_CHANGERS,
} from './imports'
import {expectGolden, readFixture} from './golden'

describe('game config surface', () => {
    it('all game-defining constants are stable (folder-based config, ADR-0003)', () => {
        // v2 fixture: the post-ADR-0003 surface — per-note structs + Shape ids +
        // Shape registries. The music-theory constants (pitches/scales) still appear
        // even though they now live in sharedConfig: they remain part of the runtime
        // surface consumers read.
        expectGolden('config-surface-v2', {
            appName: APP_NAME,
            instruments: INSTRUMENTS,
            // passed WHOLE: it is plain data end to end. expectGolden now also asserts the value
            // is structured-cloneable (test/noProxies.ts) and structuredClone throws on a
            // function, so a function anywhere under here would fail this test rather than be
            // dropped silently the way JSON.stringify used to drop it. Contrast `shapes` below,
            // which really does carry one and has to be stripped by hand.
            instrumentsData: INSTRUMENTS_DATA,
            // {id, capacity, columns, labels} — the serializable half. The Shape's
            // `component` (a Svelte component FUNCTION) is dropped HERE rather than
            // silently by JSON.stringify, because expectGolden now also asserts the
            // value is structured-cloneable (test/noProxies.ts) and structuredClone
            // refuses functions. Same fixture bytes either way.
            shapes: Object.fromEntries(
                Object.entries(game.shapes).map(([id, {component, ...serializable}]) => [id, serializable])
            ),
            pitches: PITCHES,
            tempoChangers: TEMPO_CHANGERS,
            baseLayerLimit: BASE_LAYER_LIMIT,
            composerNotePositions: COMPOSER_NOTE_POSITIONS,
            importNotePositions: IMPORT_NOTE_POSITIONS,
            notesCssClasses: NOTES_CSS_CLASSES,
            baseThemeConfig: BASE_THEME_CONFIG,
            noteNameTypes: NOTE_NAME_TYPES,
            midiMapToNote: Object.fromEntries(MIDI_MAP_TO_NOTE),
            noteMapToMidi: Object.fromEntries(NOTE_MAP_TO_MIDI),
            midiBounds: MIDI_BOUNDS,
            midiPresets: MIDI_PRESETS,
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
        })
    })

    it('reproduces the frozen pre-ADR-0003 surface exactly (equivalence proof)', () => {
        // The v1 fixture (config-surface.json) is FROZEN: it captured the surface as
        // the parallel-array GameDefinitions produced it. This derives that old shape
        // back out of the new folder-based config and must reproduce it byte-for-byte
        // — proving the conversion moved structure, never values.
        //
        // Documented, deliberate removals (deleted from the frozen copy below):
        //  - the four *Kinds sections: zero runtime consumers ever (instruments
        //    inlined copies), authoring role replaced by presets.json + shapes.ts
        //  - instrumentsData.Aurora_Short (Sky): orphaned data key with NO audio
        //    folder, unreachable through the INSTRUMENTS constructor guard; its
        //    legacy conversion tables in code are untouched
        //  - test_sustain (Sky): the dummy sustaining instrument (2026-08-04,
        //    predates the freeze) deleted 2026-08-05 when `sustained_recorder`
        //    replaced it — removed from both the list and the data below
        const frozen = readFixture('config-surface')
        // Deliberate VALUE divergence (2026-08-09, midi round-trip work) — the one place this
        // proof no longer reproduces the frozen surface, because the frozen value was wrong.
        // Genshin declared midi bounds.upper 84 while the highest key in its own mapToNote is
        // 83. A C6 therefore counted as in range, was never octave-folded back, resolved to id
        // -1 anyway, and was tallied under NEITHER out-of-range direction — silently dropped
        // and invisible in the importer's counters. Corrected so the bound agrees with the map
        // it guards. Sky's 84 is correct: its map really does go up to 84.
        if (APP_NAME === 'Genshin') frozen.midiBounds.upper = 83
        delete frozen.layoutKinds
        delete frozen.layoutIconsKinds
        delete frozen.instrumentNoteLayoutKinds
        delete frozen.instrumentMidiLayoutKinds
        delete frozen.instrumentsData['Aurora_Short']
        delete frozen.instrumentsData['test_sustain']
        frozen.instruments = frozen.instruments.filter((name: string) => name !== 'test_sustain')

        // Deliberate VALUE divergence (2026-08-14, in-game RE-CAPTURE of HarmonicKey and
        // LeapingSpiritPiano). Both are PRE-freeze instruments, so POST_FREEZE_INSTRUMENTS below is
        // not available to them and must not be: their Note Ids, base notes, icons and layouts are
        // untouched by the re-capture and still reproduce the frozen surface exactly. Only two facts
        // per instrument legitimately moved, and only because the samples themselves were replaced:
        //  - fill/clickColor: re-sampled off the new recordings' in-game button art. HarmonicKey's
        //    clickColor is deliberately absent below — its lighter click tint (#e1cba3) survived.
        //  - sustain: the new captures are real sustained holds, where the 2026-08-03 set was
        //    tap-only, so both gained a LOOPLESS sustain block (release 0.3, minLength 0.1 — the
        //    attacks are near-instant, unlike NightwindHorn's swells). The legacy v1 sustain shape
        //    carried only {release, crossfade?, loop?, noteLoops?}, which is why the whole expected
        //    value here is {release: 0.3}: no loop is authored, and minLength never existed in v1.
        // Each edit names the frozen value it replaces and that value is ASSERTED before patching,
        // so this exception can absorb exactly the changes enumerated here and nothing else — a
        // further color tweak, a changed release, an added loop, or a hand-edit of the frozen file
        // all still fail. No other field, and no other instrument, is touched.
        const RECAPTURE_EDITS: Record<string, {field: string; from: unknown; to: unknown}[]> =
            APP_NAME === 'Genshin'
                ? {
                    HarmonicKey: [
                        {field: 'fill', from: '#ddb055', to: '#dcb154'},
                        {field: 'sustain', from: undefined, to: {release: 0.3}},
                    ],
                    LeapingSpiritPiano: [
                        {field: 'fill', from: '#5cadbd', to: '#58afb9'},
                        {field: 'clickColor', from: '#5cadbd', to: '#58afb9'},
                        {field: 'sustain', from: undefined, to: {release: 0.3}},
                    ],
                }
                : {}
        for (const [name, edits] of Object.entries(RECAPTURE_EDITS)) {
            for (const {field, from, to} of edits) {
                expect(
                    frozen.instrumentsData[name][field],
                    `${name}.${field} is not the frozen value this exception was written against`
                ).toEqual(from)
                frozen.instrumentsData[name][field] = to
            }
        }

        // Instruments added AFTER the v1 freeze have no old surface to reproduce —
        // they exist only in the v2 fixture.
        const POST_FREEZE_INSTRUMENTS = new Set(['sustained_recorder', 'NightwindHorn'])

        const derivedInstrumentsData = Object.fromEntries(
            Object.entries(INSTRUMENTS_DATA)
                .filter(([name]) => !POST_FREEZE_INSTRUMENTS.has(name))
                .map(([name, data]) => {
                const labels = game.shapes[data.shape].labels
                const sustain = data.sustain
                    ? {
                        release: data.sustain.release,
                        ...(data.sustain.crossfade !== undefined
                            ? {crossfade: data.sustain.crossfade}
                            : {}),
                        loop: data.sustain.loop,
                        ...(data.notes.some((n) => n.loop)
                            ? {noteLoops: data.notes.map((n) => n.loop ?? null)}
                            : {}),
                    }
                    : undefined
                return [name, {
                    notes: data.notes.length,
                    family: data.family,
                    midiName: data.midiName,
                    ...(data.fill !== undefined ? {fill: data.fill} : {}),
                    ...(data.clickColor !== undefined ? {clickColor: data.clickColor} : {}),
                    baseNotes: data.notes.map((n) => n.baseNote),
                    layout: {
                        keyboardLayout: labels.keyboard,
                        numberLayout: labels.number,
                        abcLayout: labels.abc,
                        playstationLayout: labels.playstation,
                        switchLayout: labels.switch,
                    },
                    icons: data.notes.map((n) => n.icon),
                    midiNotes: data.notes.map((n) => n.midi),
                    ...(sustain !== undefined ? {sustain} : {}),
                }]
            })
        )

        const derived = JSON.parse(JSON.stringify({
            appName: APP_NAME,
            instruments: INSTRUMENTS.filter((name) => !POST_FREEZE_INSTRUMENTS.has(name)),
            instrumentsData: derivedInstrumentsData,
            pitches: PITCHES,
            tempoChangers: TEMPO_CHANGERS,
            baseLayerLimit: BASE_LAYER_LIMIT,
            composerNotePositions: COMPOSER_NOTE_POSITIONS,
            importNotePositions: IMPORT_NOTE_POSITIONS,
            notesCssClasses: NOTES_CSS_CLASSES,
            baseThemeConfig: BASE_THEME_CONFIG,
            noteNameTypes: NOTE_NAME_TYPES,
            midiMapToNote: Object.fromEntries(MIDI_MAP_TO_NOTE),
            noteMapToMidi: Object.fromEntries(NOTE_MAP_TO_MIDI),
            midiBounds: MIDI_BOUNDS,
            midiPresets: MIDI_PRESETS,
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
        }))
        expect(derived).toEqual(frozen)
    })
})
