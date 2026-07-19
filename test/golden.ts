import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect} from 'vitest'
import {APP_NAME} from './imports'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.join(HERE, 'fixtures', APP_NAME)
const UPDATE = process.env.UPDATE_FIXTURES === 'true'

/**
 * Golden-file assertion. `value` is normalized through JSON so functions are
 * dropped and Maps must be converted by the caller before passing.
 * Fixtures are per-game ground truth: never hand-edit to make a test pass.
 *
 * Regeneration rule: `npm run test:update-fixtures` (UPDATE_FIXTURES=true) is
 * ONLY for writing fixtures under brand-new fixture names that don't exist
 * yet — it is never a way to make a failing test pass. If `expectGolden`
 * reports a mismatch against an EXISTING fixture, the fixture is correct and
 * the code under test regressed; go fix the code. A legitimate
 * test:update-fixtures run should only ever ADD files under test/fixtures/ —
 * `git diff --stat` on that directory changing an existing file is a sign
 * something regenerated fixtures it shouldn't have.
 */
export function expectGolden(name: string, value: unknown): void {
    const file = path.join(FIXTURE_DIR, `${name}.json`)
    const normalized = JSON.parse(JSON.stringify(value))
    if (UPDATE) {
        fs.mkdirSync(path.dirname(file), {recursive: true})
        fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n')
        return
    }
    if (!fs.existsSync(file)) {
        throw new Error(
            `Missing fixture ${path.relative(process.cwd(), file)} — run: npm run test:update-fixtures`
        )
    }
    expect(normalized).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')))
}

/** Read a committed input file shared by both games (test/inputs/). */
export function readInput(name: string): any {
    return JSON.parse(fs.readFileSync(path.join(HERE, 'inputs', name), 'utf8'))
}
