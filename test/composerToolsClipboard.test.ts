import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {describe, expect, it} from 'vitest'

// Composer's tool state is component-local, and the project deliberately has no component-test
// harness which replaces its audio/canvas/service graph. Parse the instance script instead: this
// regression is specifically about which lifecycle functions own each assignment, so an AST
// assertion tests that policy without a brittle substring of their implementation.
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

    it('the Basepoint edits take a snapshot before they rewrite', () => {
        //both entry points: the settings panel's pitch key and MidiParser's own funnel. They must
        //leave the song in the same state, or the same edit means different things depending on
        //which panel is open.
        for (const entry of ['handleSettingChange', 'changePitch']) {
            const declaration = source.statements.find(
                (statement): statement is ts.FunctionDeclaration =>
                    ts.isFunctionDeclaration(statement) && statement.name?.text === entry,
            )!
            const text = declaration.getText()
            expect(text).toContain('addToHistory()')
            expect(text).toContain('applyBasepointChange')
            //the snapshot is taken BEFORE the rewrite, or it records the state undo is meant to leave
            expect(text.indexOf('addToHistory()')).toBeLessThan(text.indexOf('applyBasepointChange'))
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
            expect(assigned).not.toContain('copiedColumns')
        },
    )

    it('closing and reopening tools preserves copied notes but starts a fresh undo session', () => {
        const assigned = assignedIdentifiers('toggleTools')
        expect(assigned).toContain('selectedColumns')
        expect(assigned).toContain('undoHistory')
        expect(assigned).not.toContain('copiedColumns')
    })

    it('keeps Clear Selection as the explicit way to leave copy/paste mode', () => {
        const assigned = assignedIdentifiers('resetSelection')
        expect(assigned).toContain('selectedColumns')
        expect(assigned).toContain('copiedColumns')
    })
})
