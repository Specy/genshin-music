import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    APP_NAME, BASE_LAYER_LIMIT, BASE_THEME_CONFIG, COMPOSER_NOTE_POSITIONS,
    DO_RE_MI_NOTE_SCALE, IMPORT_NOTE_POSITIONS, INSTRUMENTS, INSTRUMENTS_DATA,
    MIDI_BOUNDS, MIDI_PRESETS, NOTE_NAME_TYPES,
    NOTE_SCALE, NOTES_CSS_CLASSES, NOTES_PER_COLUMN, PITCHES, TEMPO_CHANGERS,
} from './imports'
import {snapMidiToGrid} from '$core/Songs/noteIds'
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
            //no midiMapToNote/noteMapToMidi rows: both constants were retired at ADR-0007
            //phase E (the snap is derived from canonicalNoteIds — see the v1 proof below, which
            //rebuilds the frozen tables out of the arithmetic and so still checks their values)
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
        //    replaced it — removed from both the list and the data below.
        //    `sustained_recorder` was itself a stress test and is gone too
        //    (2026-08-21), but it post-dates the freeze so it never appears here
        const frozen = readFixture('config-surface')
        // Deliberate VALUE divergence (2026-08-24, ADR-0012) — `midiName` is the General MIDI
        // program exported for an instrument, while `family` is the import suggestion key. Six
        // instruments used names that do not exist in General MIDI (and therefore exported as
        // program 0), and five Sky instruments used words that are not General MIDI families.
        // The v1 fixture is frozen, so patch its in-memory copy only after asserting every old
        // value. Literal replacements keep this exception narrow: a later metadata edit must get
        // its own review instead of being hidden by this one.
        const MIDI_METADATA_EDITS: Record<
            string,
            {field: 'family' | 'midiName'; from: string; to: string}[]
        > = APP_NAME === 'Genshin'
            ? {
                HarmonicKey: [
                    {field: 'midiName', from: 'acoustic grand', to: 'acoustic grand piano'},
                ],
                LeapingSpiritPiano: [
                    {field: 'midiName', from: 'acoustic grand', to: 'acoustic grand piano'},
                ],
            }
            : {
                Aurora: [
                    {field: 'family', from: 'vocal', to: 'ensemble'},
                ],
                SFX_BassSynth: [
                    {field: 'family', from: 'Bass', to: 'bass'},
                    {field: 'midiName', from: 'Electric Bass', to: 'synth bass 1'},
                ],
                SFX_ChimeSynth: [
                    {field: 'family', from: 'percussion', to: 'percussive'},
                    {field: 'midiName', from: 'Bellchime', to: 'tubular bells'},
                ],
                SFX_SineSynth: [
                    {field: 'family', from: 'synth', to: 'synth lead'},
                    {field: 'midiName', from: 'sine', to: 'lead 1 (square)'},
                ],
                'SFX_TR-909': [
                    {field: 'family', from: 'percussion', to: 'percussive'},
                    {field: 'midiName', from: 'Roland TR-808', to: 'synth drum'},
                ],
            }
        for (const [name, edits] of Object.entries(MIDI_METADATA_EDITS)) {
            for (const {field, from, to} of edits) {
                expect(
                    frozen.instrumentsData[name][field],
                    `${name}.${field} is not the frozen value this exception was written against`
                ).toBe(from)
                frozen.instrumentsData[name][field] = to
            }
        }
        // Deliberate VALUE divergence (2026-08-09, midi round-trip work) — the one place this
        // proof no longer reproduces the frozen surface, because the frozen value was wrong.
        // Genshin declared midi bounds.upper 84 while the highest key in its own mapToNote was
        // 83. A C6 therefore counted as in range, was never octave-folded back, resolved to id
        // -1 anyway, and was tallied under NEITHER out-of-range direction — silently dropped
        // and invisible in the importer's counters. Corrected so the bound agrees with the map
        // it guards. Sky's 84 is correct: its map really does go up to 84.
        if (APP_NAME === 'Genshin') frozen.midiBounds.upper = 83
        // Deliberate VALUE divergence (2026-08-22, uma-mode retirement) — the composer's layer
        // cap. "Uma mode" was a hidden switch that raised NoteLayer.MAX_LAYERS far past
        // BASE_LAYER_LIMIT for whoever found its passphrase; it is gone, and the ordinary cap rose
        // to 64 to absorb the arrangements it existed for. BASE_LAYER_LIMIT is a BigInt-capability
        // constant, never converted GameDefinition data, so moving it says nothing about whether
        // the folder-based config reproduces the old parallel arrays — which is all this proof
        // asserts. Written as a literal, not as BASE_LAYER_LIMIT, so a LATER change to the cap
        // still fails here and gets its own review; asserted before patching like the edits above.
        expect(
            frozen.baseLayerLimit,
            'frozen baseLayerLimit is not the value this exception was written against'
        ).toBe(52)
        frozen.baseLayerLimit = 64
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
                // Same exception, same reasoning, for Sky (2026-08-21). The wiki marks six
                // Instruments with the fermata 𝄐 — their notes can be HELD — and two of them,
                // the Voice of AURORA and the Electric Guitar, shipped here as tap-only because
                // the 2026-08-03 set had the game's SHORT samples (Aurora 2.9 s, LightGuitar
                // 1.9 s). Both now carry the full holds (9–12.5 s and 7.5–10.9 s) and so gained
                // a LOOPLESS sustain block. Nothing else about them moved: same Note Ids, base
                // notes, icons and layout, and no fill/clickColor was ever authored for either.
                // Aurora's samples were also repitched −2 semitones (the rip is in D major, the
                // app is C) — that changes only the audio, which this surface does not describe.
                : {
                    Aurora: [{field: 'sustain', from: undefined, to: {release: 0.4}}],
                    LightGuitar: [{field: 'sustain', from: undefined, to: {release: 0.35}}],
                }
        for (const [name, edits] of Object.entries(RECAPTURE_EDITS)) {
            for (const {field, from, to} of edits) {
                expect(
                    frozen.instrumentsData[name][field],
                    `${name}.${field} is not the frozen value this exception was written against`
                ).toEqual(from)
                frozen.instrumentsData[name][field] = to
            }
        }

        // Deliberate VALUE divergence (2026-08-19, ADR-0007 Phase A). Ukulele and
        // LingeringEuphonia share the ukulele-21 preset, whose top row is not a scale at all:
        // those seven buttons strum chords in game (in-game capture 2026-08-19), so they are
        // Assigned Buttons now and carry their real chord names. The frozen labels were
        // copy-pasted from the Vintage-Lyre row and named pitches those buttons never sounded;
        // an Assigned Button's label feeds nothing but the on-screen text, so this moves display
        // text only. Nominal Ids, icons and Label Sets are untouched, and the two lower rows —
        // genuinely pitched — still reproduce the frozen surface exactly. Asserted before
        // patching, like the re-capture edits above: any OTHER label drift still fails.
        const FROZEN_CHORD_ROW = ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'G']
        const CHORD_ROW = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'G7']
        const CHORD_ROW_INSTRUMENTS = APP_NAME === 'Genshin' ? ['Ukulele', 'LingeringEuphonia'] : []
        for (const name of CHORD_ROW_INSTRUMENTS) {
            const baseNotes: string[] = frozen.instrumentsData[name].baseNotes
            expect(
                baseNotes.slice(0, FROZEN_CHORD_ROW.length),
                `${name}'s top row is not the frozen label row this exception was written against`
            ).toEqual(FROZEN_CHORD_ROW)
            baseNotes.splice(0, CHORD_ROW.length, ...CHORD_ROW)
        }

        // Instruments added AFTER the v1 freeze have no old surface to reproduce —
        // they exist only in the v2 fixture.
        const POST_FREEZE_INSTRUMENTS = new Set([
            'NightwindHorn',
            //Sky, 2026-08-21: in-game Instruments the app was missing (see games/sky/instruments)
            'Cello',
            'Violin',
            'Saxophone',
            'Harmonica',
            'TransverseFlute',
            'SmallBell',
            'FortuneDrum',
            //Sky, 2026-08-23: one-button krill roar, in-game capture
            'SFX_KrillHorn',
            //Sky, 2026-08-23: Season of Radiance 2x2 cymbals, in-game capture
            'Cymbals',
        ])

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

        // The two MIDI tables are the one part of the frozen surface with no constant left to
        // read: ADR-0007 phase E deleted `midi.mapToNote` from both games and replaced it with
        // arithmetic over the Song Grid. So they are rebuilt HERE, from that arithmetic, and
        // compared like every other value — which makes this proof the byte-parity check for the
        // replacement: one number snapped differently, or one accidental flagged differently,
        // from what both games shipped for years and this test goes red.
        // The key range is MIDI_BOUNDS (as corrected above), not a list read out of the frozen
        // file, so a table entry outside the range the arithmetic accepts would fail too.
        const midiMapToNote: Record<string, [number, boolean]> = {}
        for (let midi = MIDI_BOUNDS.lower; midi <= MIDI_BOUNDS.upper; midi++) {
            const snapped = snapMidiToGrid(midi)
            midiMapToNote[`${midi}`] = [snapped.id, snapped.isAccidental]
        }
        //the same "get only non accidentals" inversion the retired NOTE_MAP_TO_MIDI was built by
        const noteMapToMidi = Object.fromEntries(
            Object.entries(midiMapToNote)
                .filter(([, value]) => value[1] === false)
                .map(([key, value]) => [value[0], Number(key)])
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
            midiMapToNote,
            noteMapToMidi,
            midiBounds: MIDI_BOUNDS,
            midiPresets: MIDI_PRESETS,
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
        }))
        expect(derived).toEqual(frozen)
    })
})
