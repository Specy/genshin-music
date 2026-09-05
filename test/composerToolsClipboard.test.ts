import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, InstrumentData} from './imports'
import {buttonToNumber, effectiveTrackPitch, numberToButton} from '$core/Songs/noteIds'
import type {Pitch} from '$core/legacyConfig'

// TWO HALVES, and the split is not arbitrary: the clipboard's BEHAVIOR (what a paste reproduces)
// lives in ComposedSong and is driven for real at the bottom of this file, while its LIFECYCLE
// (which component function owns each assignment, which path counts as a change) is
// component-local, and the project deliberately has no component-test harness replacing Composer's
// audio/canvas/service graph. The lifecycle half parses the instance script instead: those
// regressions are specifically about which function owns what, so an AST assertion tests that
// policy without a brittle substring of their implementation.
const component = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8')
const instanceScript = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1]
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script')
const source = ts.createSourceFile('Composer.svelte.ts', instanceScript, ts.ScriptTarget.Latest, true)

function assignedIdentifiers(functionName: string): Set<string> {
    const declaration = source.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
    )
    if (!declaration) throw new Error(`Composer.svelte has no ${functionName} function`)

    const assigned = new Set<string>()
    const visit = (node: ts.Node) => {
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left)
        ) {
            assigned.add(node.left.text)
        }
        ts.forEachChild(node, visit)
    }
    visit(declaration)
    return assigned
}

/**
 * Every assignment TARGET inside a function, spelled as source text — so `song.pitch = x` is
 * reported as `song.pitch` rather than being invisible the way assignedIdentifiers' bare-identifier
 * walk leaves it.
 */
function assignedTargets(functionName: string): Set<string> {
    const declaration = source.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
    )
    if (!declaration) throw new Error(`Composer.svelte has no ${functionName} function`)
    const assigned = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            assigned.add(node.left.getText())
        }
        ts.forEachChild(node, visit)
    }
    visit(declaration)
    return assigned
}

/** One function's source text, for the assertions that are about WHICH calls a path makes and in what order. */
function functionText(functionName: string): string {
    const declaration = source.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
    )
    if (!declaration) throw new Error(`Composer.svelte has no ${functionName} function`)
    return declaration.getText()
}

/**
 * The same text with its comments stripped. The assertions below are about which CALLS a path
 * makes and in what order, and this file's subject is a heavily commented component — a comment
 * naming the funnel it rides would otherwise satisfy (or reorder) the assertion on its own.
 */
function functionCode(functionName: string): string {
    return functionText(functionName)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

/**
 * THE COMPOSER'S HALF OF THE UNDO WIRING (ADR-0013), which no runtime test in this project can
 * reach (there is no component harness — see this file's header). Recording itself lives in
 * ComposedSong and is driven for real in test/undoRedo.test.ts; what is asserted here is what the
 * component still owes a walk: a history per installed song, and the state OUTSIDE the song that a
 * restored Step invalidates.
 */
describe('the composer attaches a history and restores what the song does not own', () => {
    it('installs a fresh history at every song-install point', () => {
        //one history per song: its deltas hold the notes and columns of the song being replaced by
        //reference, and a fresh one is also what makes an installed song read clean
        for (const name of ['loadSong', 'createNewSong']) {
            expect(functionCode(name)).toContain('installHistory(')
        }
        expect(functionCode('installHistory')).toContain('target.attachHistory()')
        //the mount is the third: the persisted settings re-seed bpm and the Basepoint, and a
        //composer that opened offering to undo its own seeding would be wrong
        expect(instanceScript).toContain('installHistory();')
    })

    it('a walk re-seeds the settings mirrors, the roster and the transport', () => {
        const assigned = assignedTargets('walkHistory')
        //bpm, the Basepoint and reverb are all serialized, so a Step can carry any of them - and
        //`settings` is the persisted UI copy of all three: one left behind is a panel disagreeing
        //with the song until the next edit
        expect(assigned).toContain('settings.bpm')
        expect(assigned).toContain('settings.pitch')
        expect(assigned).toContain('settings.reverb')
        const text = functionCode('walkHistory')
        expect(text).toContain('updateSettings()')
        //a Step can add, remove or swap tracks, so the loaded Instrument array is re-requested
        expect(text).toContain('syncInstruments()')
        //...and the committed window is rebuilt from the column the walk landed on (ADR-0006)
        expect(text).toContain('resyncPlayback(true)')
        //the cursor memo lands through the normal path, silently (CONTEXT.md: Undo Step)
        expect(text).toContain('selectColumn(memo.selected, true)')
    })

    it('every surface that walks the history goes through the one guarded pair (design §7)', () => {
        //THE BUTTONS, in the transport column and not the tools panel: enabled off the history
        //itself (nothing else knows whether there is a Step), disabled while the importer holds
        //the song like every other write on this surface
        expect(component).toContain('disabled={songLocked || !history.canUndo}')
        expect(component).toContain('disabled={songLocked || !history.canRedo}')
        expect(component).toContain('~icons/lucide/undo-2')
        expect(component).toContain('~icons/lucide/redo-2')
        //THE KEYBINDS: rebindable names out of KeybindsStore's composer map, reaching the same
        //wrappers - and preventDefault, or the browser's own text undo rides along with them
        expect(instanceScript).toContain("if (name === 'undo') {")
        expect(instanceScript).toContain("if (name === 'redo') {")
        //THE MIDI SWITCH, the third feeder (a controller key is a shortcut like any other)
        const midi = functionCode('handleMidi')
        expect(midi).toContain("case 'undo':")
        expect(midi).toContain("case 'redo':")
        //...and none of the three touches the song directly: the settle block and the guard live
        //in walkHistory alone
        expect(functionCode('undo')).toContain("walkHistory('undo')")
        expect(functionCode('redo')).toContain("walkHistory('redo')")
        expect(functionCode('walkHistory')).toContain('settleLiveInput()')
    })

    it('the Basepoint edit is ONE call the model records for itself', () => {
        const text = functionCode('handleSettingChange')
        expect(text).toContain('changeBasepoint')
        //no snapshot, and no history call at all: the method writes the field and rewrites the
        //notes, and records both as one Step (ADR-0013)
        expect(text).not.toContain('history')
    })

    it('MidiParser keeps its Basepoint local instead of rewriting the song it is previewing over', () => {
        const midiParser = readFileSync(
            'src/lib/components/pages/Composer/MidiParser/MidiParser.svelte',
            'utf8',
        )
        expect(midiParser).not.toContain('functions.changePitch')
        expect(midiParser).toContain('pitch = value')
        expect(midiParser).toContain('functions.loadSong(song, { preview: true })')
    })
})

/**
 * EVERY NOTE EDIT MARKS THE SONG DIRTY. handleAutoSave() is the note-edit funnel: it resyncs
 * playback (ADR-0006), counts the change, and autosaves past the threshold — and the count is what
 * the unsaved-changes prompts (loadSong, createNewSong, prepareToLeave) and the menu's dirty dot
 * read. ADR-0007 made three more paths note edits, and all three went around it: a Basepoint change
 * from the settings panel, the same change from the MIDI panel, and an instrument swap or per-layer
 * Basepoint override from the layer panel. Transposing a whole song and then leaving the page threw
 * the transposition away without asking.
 */
describe('the ADR-0007 note rewrites ride the note-edit funnel', () => {
    it('a song Basepoint change counts as a change, right after the rewrite', () => {
        const text = functionCode('handleSettingChange')
        expect(text).toContain('handleAutoSave()')
        expect(text.indexOf('changeBasepoint')).toBeLessThan(text.indexOf('handleAutoSave()'))
    })

    it('an instrument edit counts as a change', () => {
        const text = functionCode('editInstrument')
        expect(text).toContain('handleAutoSave()')
        //and does NOT resync separately: the funnel carries the ADR-0006 resync, so a second one
        //here would retract and recommit the window twice for one edit
        expect(text).not.toContain('resyncPlayback()')
    })

    it('the funnel counts autosave activity, and DIRTINESS is the Savepoint\'s answer', () => {
        //stated here so the three paths above cannot be "fixed" by counting somewhere else
        expect(functionCode('handleAutoSave')).toContain('countActivity()')
        expect(functionCode('countActivity')).toContain('changes++')
        //...and since ADR-0013 the counter answers only "is it time to autosave": every prompt
        //asks the history instead, so undoing back to the last save leaves nothing to prompt about
        for (const gate of ['loadSong', 'createNewSong', 'prepareToLeave', 'exportSongAudio']) {
            expect(functionCode(gate)).toContain('songIsDirty')
        }
        expect(instanceScript).toContain(
            'const songIsDirty = $derived(history.isDirty || midiPreviewLoaded);'
        )
        //the Savepoint is set where the file is really written, or a save would never clean it
        expect(functionCode('updateSong')).toContain('history?.markSavepoint()')
    })
})

/**
 * ONE source of truth for the composer's Basepoint (ADR-0007). `settings.pitch` is a persisted UI
 * copy of `song.pitch`, and the two can drift — a new song starts at the constructor's default
 * while the panel still shows the last-used value, and the persisted settings arrive after the
 * song is constructed. While a Basepoint was a playback rate that drift was an audible-but-local
 * bug; now it decides what a stored number MEANS, so a keyboard reading one copy while the canvas
 * reads the other enters notes on different rows from the ones it draws them on.
 */
describe('the composer resolves notes against the SONG\'s Basepoint', () => {
    it('never falls back to the settings copy when resolving a track', () => {
        //every per-track resolution is `instrument.pitch || <song-level Basepoint>`; the song is
        //the only admissible right-hand side
        expect(instanceScript).not.toContain('|| settings.pitch.value')
        expect(instanceScript).toContain('|| song.pitch')
    })

    it('seeds a NEW song from the settings rather than letting the two disagree', () => {
        expect(assignedTargets('createNewSong')).toContain('newSong.pitch')
    })
})

describe('Composer tools clipboard lifecycle', () => {
    it.each(['loadSong', 'createNewSong'])(
        '%s resets song-addressed state without clearing the editor clipboard',
        functionName => {
            const assigned = assignedIdentifiers(functionName)
            expect(assigned).toContain('selectedColumns')
            expect(functionCode(functionName)).toContain('installHistory(')
            expect(assigned).not.toContain('clipboard')
        },
    )

    it('discards the copied notes when the panel CLOSES, and only then', () => {
        //user revision 2026-08-22: a copy crosses songs only while the panel stays open, so the
        //close is where it is dropped. The guard is the half that matters - an unconditional
        //assignment here would also wipe a clipboard the user is opening the panel to paste from.
        const assigned = assignedIdentifiers('toggleTools')
        expect(assigned).toContain('selectedColumns')
        expect(assigned).toContain('clipboard')
        //...and the HISTORY is untouched by the toggle (ADR-0013): undo is composer-wide now, so a
        //panel that cleared it would throw away Steps recorded while it was closed
        expect(functionCode('toggleTools')).not.toContain('history')
        expect(functionCode('toggleTools')).toContain(
            'if (wasVisible) clipboard = { columns: [], pitches: [] }'
        )
    })

    it('keeps Clear Selection as the explicit way to leave copy/paste mode', () => {
        const assigned = assignedIdentifiers('resetSelection')
        expect(assigned).toContain('selectedColumns')
        expect(assigned).toContain('clipboard')
    })

    it('captures the Basepoints in the same assignment as the columns', () => {
        //the clipboard outlives the song it was copied from, so columns beside the PREVIOUS copy's
        //Basepoints would silently transpose every paste after it — one value, one write
        const text = functionCode('copyColumns')
        expect(text).toContain('song.copyColumns(')
        expect(text).toContain('song.trackPitches()')
        expect(assignedIdentifiers('copyColumns')).toContain('clipboard')
    })

    it('hands both halves to every paste form', () => {
        const text = functionCode('pasteColumns')
        expect(text).toContain('song.pasteColumns(clipboard.columns, insert, clipboard.pitches)')
        expect(text).toContain('song.pasteLayer(clipboard.columns, insert, targetLayer, clipboard.pitches)')
    })
})

/**
 * WHAT A PASTE REPRODUCES: the same BUTTONS (finding #6). Before ADR-0007 that was free — the
 * clipboard held Nominal Ids, which name a button whatever the Basepoint — and the flip to absolute
 * Note Numbers silently turned it into "the same PITCHES", so copying at one Basepoint and pasting
 * at another pasted a transposition, off-scale strands and all. The rewrite lives in ComposedSong
 * (pasteColumns/pasteLayer take the clipboard's source Basepoints); these rows drive it through the
 * same two calls the component makes.
 *
 * AT NON-C BASEPOINTS on both sides, which is the coverage gap the defect shipped through.
 */
describe('a paste reproduces the buttons that were copied (ADR-0007)', () => {
    const instrument = INSTRUMENTS[0]
    const buttons = [0, 2, 4]
    /** A one-track song at `pitch` with `buttons` pressed, one per column. */
    function songAt(pitch: Pitch): ComposedSong {
        const song = new ComposedSong('clipboard', [instrument])
        song.pitch = pitch
        buttons.forEach((button, column) =>
            song.addNoteAt(column, 0, buttonToNumber(instrument, pitch, button)!))
        return song
    }
    /** The buttons a track presses, column by column, read at the song's own Basepoint. */
    const buttonsOf = (song: ComposedSong, trackIndex: number, from: number) =>
        song.columns.slice(from, from + buttons.length).map(column =>
            column.notesOfTrack(trackIndex).map(note =>
                numberToButton(
                    song.instruments[trackIndex].name,
                    effectiveTrackPitch(song.instruments[trackIndex], song.pitch),
                    note.id,
                )))

    it('survives a Basepoint change between the copy and the paste', async () => {
        const song = songAt('C')
        const copied = song.copyColumns([0, 1, 2], 'all')
        const pitches = song.trackPitches()
        //the settings panel's edit, both halves of it in one call
        song.changeBasepoint('song', 'F')
        song.selected = 20

        await song.pasteColumns(copied, true, pitches)

        expect(buttonsOf(song, 0, 20)).toEqual(buttons.map(button => [button]))
        //...which is the same thing as saying nothing stranded on the way
        expect(buttonsOf(song, 0, 20).flat()).not.toContain(-1)
    })

    it('pasted verbatim it would NOT — which is what the captured Basepoints are for', () => {
        //the pre-fix behavior, stated so the rewrite cannot be dropped as a no-op
        const song = songAt('C')
        const copied = song.copyColumns([0], 'all')
        song.changeBasepoint('song', 'F')
        const verbatim = copied[0].notes[0].id
        expect(numberToButton(instrument, 'F', verbatim)).not.toBe(buttons[0])
    })

    it('lands on the DESTINATION layer\'s Basepoint when that layer overrides it', async () => {
        const song = songAt('C')
        const copied = song.copyColumns([0, 1, 2], 'all')
        const pitches = song.trackPitches()
        //a second layer stated a minor third above the song
        song.addInstrument(instrument)
        song.setInstrument(1, new InstrumentData({name: instrument, pitch: 'Eb'}))
        song.selected = 20

        await song.pasteLayer(copied, true, 1, pitches)

        expect(buttonsOf(song, 1, 20)).toEqual(buttons.map(button => [button]))
    })

    it('merges the notes two source Basepoints collapse onto one', async () => {
        //pasteLayer puts every note on ONE track, so two tracks stated at different Basepoints can
        //arrive at the same number — a duplicate double-triggers and hides from findNote
        const song = new ComposedSong('two Basepoints', [instrument, instrument])
        song.pitch = 'C'
        song.setInstrument(1, new InstrumentData({name: instrument, pitch: 'D'}))
        //the SAME button on both tracks, so the two numbers differ by exactly the interval
        song.addNoteAt(0, 0, buttonToNumber(instrument, 'C', 3)!, 1)
        song.addNoteAt(0, 1, buttonToNumber(instrument, 'D', 3)!, 4)
        const copied = song.copyColumns([0], 'all')
        const pitches = song.trackPitches()
        song.selected = 20

        await song.pasteLayer(copied, true, 0, pitches)

        const pasted = song.columns[20].notes
        expect(pasted).toHaveLength(1)
        expect(pasted[0].id).toBe(buttonToNumber(instrument, 'C', 3))
        //the merge keeps the longest span, like every other one in the model
        expect(pasted[0].span).toBe(4)
    })

    it('leaves an in-model copy (no Basepoints handed over) exactly as it was', async () => {
        //the other callers — a copy inside one song, the span fixtures — pass no source Basepoints,
        //which means "already in this song's terms" and must move nothing
        const song = songAt('Ab')
        const copied = song.copyColumns([0, 1, 2], 'all')
        song.selected = 20
        await song.pasteColumns(copied, true)
        expect(buttonsOf(song, 0, 20)).toEqual(buttons.map(button => [button]))
    })
})
