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
