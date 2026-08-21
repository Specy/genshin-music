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

/** The property names an object literal inside `functionName` supplies, across every literal in it. */
function objectLiteralKeys(functionName: string): Set<string> {
    const declaration = source.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
    )
    if (!declaration) throw new Error(`Composer.svelte has no ${functionName} function`)
    const keys = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isObjectLiteralExpression(node)) {
            for (const property of node.properties) {
                if (property.name && ts.isIdentifier(property.name)) keys.add(property.name.text)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(declaration)
    return keys
}

/**
 * ADR-0007's undo requirement, which no runtime test in this project can reach (Composer's history
 * is component-local and there is no component harness — see this file's header): a Basepoint
 * change or an instrument swap rewrites the NOTES and moves the setting that says what they mean,
 * so the snapshot has to carry all three or undo restores notes into a song that disagrees with
 * them — every note a semitone, or an instrument, out.
 */
describe('composer undo is a compound snapshot (ADR-0007)', () => {
    it('addToHistory captures columns, pitch and instruments in one entry', () => {
        const keys = objectLiteralKeys('addToHistory')
        expect(keys).toContain('columns')
        expect(keys).toContain('pitch')
        expect(keys).toContain('instruments')
    })

    it('undo restores all three, and the settings copy of the Basepoint with them', () => {
        const assigned = assignedTargets('undo')
        //the columns go back through the model's own restore path, not a bare assignment
        expect(source.getText()).toContain('song.restoreColumns(history.columns)')
        expect(assigned).toContain('song.pitch')
        expect(assigned).toContain('song.instruments')
        //`settings.pitch` is a SECOND copy of the song's Basepoint (the settings panel reads it),
        //so undoing one without the other leaves the two disagreeing until the next edit
        expect(assigned).toContain('settings.pitch')
    })

    it('the Basepoint edit takes a snapshot before it rewrites', () => {
        const text = functionCode('handleSettingChange')
        expect(text).toContain('addToHistory()')
        expect(text).toContain('applyBasepointChange')
        //the snapshot is taken BEFORE the rewrite, or it records the state undo is meant to leave
        expect(text.indexOf('addToHistory()')).toBeLessThan(text.indexOf('applyBasepointChange'))
    })

    it('MidiParser\'s pitch funnel DELEGATES rather than repeating the edit', () => {
        //the two entry points have to leave the song in the same state, and the copy that used to
        //live in changePitch had already drifted from the branch it duplicated — it rewrote the
        //notes but never counted the change
        const text = functionCode('changePitch')
        expect(text).toContain('handleSettingChange(')
        expect(text).not.toContain('applyBasepointChange')
        //the guard is load-bearing, not an optimisation: MidiParser calls this for the side effects
        //alone, and the branch it feeds snapshots and rewrites only when the Basepoint really moved
        expect(text).toContain('if (value === song.pitch) return')
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
        expect(text.indexOf('applyBasepointChange')).toBeLessThan(text.indexOf('handleAutoSave()'))
    })

    it('an instrument edit counts as a change', () => {
        const text = functionCode('editInstrument')
        expect(text).toContain('handleAutoSave()')
        //and does NOT resync separately: the funnel carries the ADR-0006 resync, so a second one
        //here would retract and recommit the window twice for one edit
        expect(text).not.toContain('resyncPlayback()')
    })

    it('the funnel is what the save prompts and the dirty dot read', () => {
        //stated here so the three paths above cannot be "fixed" by counting somewhere else
        expect(functionCode('handleAutoSave')).toContain('changes++')
        for (const gate of ['loadSong', 'createNewSong', 'prepareToLeave']) {
            expect(functionCode(gate)).toContain('changes')
        }
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
            expect(assigned).toContain('undoHistory')
            expect(assigned).not.toContain('clipboard')
        },
    )

    it('closing and reopening tools preserves copied notes but starts a fresh undo session', () => {
        const assigned = assignedIdentifiers('toggleTools')
        expect(assigned).toContain('selectedColumns')
        expect(assigned).toContain('undoHistory')
        expect(assigned).not.toContain('clipboard')
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
        //the settings panel's edit, both halves of it
        song.pitch = 'F'
        song.applyBasepointChange('song', 'C', 'F')
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
        song.pitch = 'F'
        song.applyBasepointChange('song', 'C', 'F')
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
