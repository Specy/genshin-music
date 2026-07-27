import {execSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Wave 2 (docs/superpowers/plans/2026-07-27-wave-2-component-api-and-styling.md, Task 1)
// rewrites class="..." string interpolation into clsx-style arrays/objects. Unlike Wave 1's
// comment-only changes, this touches real template expressions, so the build legitimately
// differs - scripts/commentOnlyCheck.js's whole-file hash comparison can't be reused. The
// narrower invariant this wave must hold instead: the class attributes emitted into the
// built HTML must stay byte-for-byte the same. `snapshot` records every element's class
// attribute, verbatim, in document order; `compare` rebuilds and diffs against it.
//
// Verbatim is the entire point. A clsx rewrite that collapses a double space, drops an
// empty token, or dedupes a repeated one must show up as a changed string here - trimming,
// whitespace-collapsing, or sorting tokens anywhere in this script would hide exactly the
// bug it exists to catch.

const BUILD_DIR = './build/genshinMusic'
const SNAPSHOT_PATH = './.superpowers/sdd/class-attr-snapshot.json'

// Same rationale as scripts/commentOnlyCheck.js's FIXED_BUILD_ENV: scripts/buildApp.js
// (PUBLIC_SW_VERSION) and svelte.config.js (BUILD_VERSION_NAME) both fall back to a fresh
// timestamp only when these are absent, so pinning them here - identically for the snapshot
// build and every compare build - is what makes two builds of identical source produce
// identical output. Every other caller leaves them unset and keeps getting a real
// per-deploy value. A distinct literal from commentOnlyCheck.js's own pin only so the two
// checks' builds are never confused for one another in build logs; either value would work.
const FIXED_BUILD_ENV = {
    PUBLIC_SW_VERSION: 'class-attr-check',
    BUILD_VERSION_NAME: 'class-attr-check',
}

function walkHtmlFiles(dir) {
    const files = []
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) files.push(...walkHtmlFiles(fullPath))
        else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath)
    }
    return files
}

function buildGenshin() {
    execSync('npm run build:genshin', {stdio: 'inherit', env: {...process.env, ...FIXED_BUILD_ENV}})
}

// Extracts every class="..." value from one HTML document, in document order, verbatim -
// no trim, no whitespace collapse, no dedup. Script/style element bodies and HTML comments
// are scrubbed first so arbitrary text inside them (a hydration JSON payload, a hand-written
// comment) can never be mistaken for an element's class attribute; every ` class="..."` left
// after that is inside a real opening tag, because HTML has nowhere else to put one.
function extractClassAttributes(html) {
    const scrubbed = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')

    // This build has only ever emitted double-quoted class attributes (checked across every
    // file under build/genshinMusic while writing this script). Fail loudly rather than
    // silently under-extracting if that ever stops being true: a checker that quietly skips
    // a quoting style it doesn't recognise is exactly the "cannot see it" failure this script
    // exists to avoid, and it would look identical to a clean pass.
    if (/\sclass\s*=\s*'/.test(scrubbed)) {
        throw new Error('Found a single-quoted class attribute - extend extractClassAttributes() to handle it rather than silently skipping it.')
    }
    if (/\sclass\s*=\s*[^"'\s>]/.test(scrubbed)) {
        throw new Error('Found an unquoted class attribute - extend extractClassAttributes() to handle it rather than silently skipping it.')
    }

    const values = []
    const classAttrRe = /\sclass\s*=\s*"([^"]*)"/g
    let match
    while ((match = classAttrRe.exec(scrubbed)) !== null) {
        values.push(match[1])
    }
    return values
}

function scanBuildOutput() {
    const relativePaths = walkHtmlFiles(BUILD_DIR)
        .map((absolutePath) => path.relative(BUILD_DIR, absolutePath).split(path.sep).join('/'))
        .sort()
    const files = {}
    for (const relativePath of relativePaths) {
        const html = fs.readFileSync(path.join(BUILD_DIR, relativePath), 'utf8')
        try {
            files[relativePath] = extractClassAttributes(html)
        } catch (e) {
            throw new Error(`${relativePath}: ${e.message}`, {cause: e})
        }
    }
    return files
}

function countAttrs(files) {
    return Object.values(files).reduce((sum, values) => sum + values.length, 0)
}

// Flattens {file: [values]} to {"file#index": value} so added/removed/changed can be
// computed the same way scripts/commentOnlyCheck.js's diffHashes compares its {file: hash}
// map - one flat map, one set-diff. The (file, index) pair is a single class attribute's
// identity "in document order", matching what compare is required to report: every
// difference "with its file and index".
function flatten(files) {
    const flat = {}
    for (const [file, values] of Object.entries(files)) {
        values.forEach((value, index) => {
            flat[`${file}#${index}`] = value
        })
    }
    return flat
}

function splitKey(key) {
    const hashIndex = key.lastIndexOf('#')
    return [key.slice(0, hashIndex), Number(key.slice(hashIndex + 1))]
}

// Sorts (file, index) keys by file, then numerically by index, so e.g. "index.html#2" prints
// before "index.html#10" - a plain string sort would put "#10" first.
function sortKeys(keys) {
    return keys.sort((a, b) => {
        const [fileA, idxA] = splitKey(a)
        const [fileB, idxB] = splitKey(b)
        if (fileA !== fileB) return fileA < fileB ? -1 : 1
        return idxA - idxB
    })
}

// Pure and worth unit-testing in isolation from the build/filesystem calls around it, so it
// stays a separate function despite the single call site below.
function diffClassAttrs(before, after) {
    const beforeFlat = flatten(before)
    const afterFlat = flatten(after)
    const beforeKeys = new Set(Object.keys(beforeFlat))
    const afterKeys = new Set(Object.keys(afterFlat))
    const added = sortKeys([...afterKeys].filter((k) => !beforeKeys.has(k)))
    const removed = sortKeys([...beforeKeys].filter((k) => !afterKeys.has(k)))
    const changed = sortKeys([...beforeKeys].filter((k) => afterKeys.has(k) && beforeFlat[k] !== afterFlat[k]))
    return {added, removed, changed, beforeFlat, afterFlat}
}

// JSON.stringify wraps the value in quotes so leading/trailing spaces are visible against
// the quote marks, and the length makes a whitespace-count change (e.g. a collapsed double
// space) unambiguous even where two strings look identical at a glance.
function describe(value) {
    return `${JSON.stringify(value)} (len ${value.length})`
}

function runSnapshot() {
    buildGenshin()
    const files = scanBuildOutput()
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), {recursive: true})
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify({files}, null, 2) + '\n')
    console.log(`Snapshot written: ${Object.keys(files).length} files, ${countAttrs(files)} class attributes -> ${SNAPSHOT_PATH}`)
    process.exit(0)
}

function runCompare() {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
        console.error(`No snapshot at ${SNAPSHOT_PATH} - run "node scripts/classAttrCheck.js snapshot" first.`)
        process.exit(1)
    }
    const {files: before} = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
    buildGenshin()
    const after = scanBuildOutput()
    const {added, removed, changed, beforeFlat, afterFlat} = diffClassAttrs(before, after)
    if (!added.length && !removed.length && !changed.length) {
        console.log(`No differences from snapshot (${Object.keys(after).length} files, ${countAttrs(after)} class attributes compared).`)
        process.exit(0)
    }
    if (added.length) {
        console.log(`Added (${added.length}):`)
        added.forEach((key) => console.log(`  + ${key} ${describe(afterFlat[key])}`))
    }
    if (removed.length) {
        console.log(`Removed (${removed.length}):`)
        removed.forEach((key) => console.log(`  - ${key} ${describe(beforeFlat[key])}`))
    }
    if (changed.length) {
        console.log(`Changed (${changed.length}):`)
        changed.forEach((key) => {
            console.log(`  ~ ${key}`)
            console.log(`    - ${describe(beforeFlat[key])}`)
            console.log(`    + ${describe(afterFlat[key])}`)
        })
    }
    process.exit(1)
}

const command = process.argv[2]
if (command === 'snapshot') runSnapshot()
else if (command === 'compare') runCompare()
else {
    console.error('Usage: node scripts/classAttrCheck.js <snapshot|compare>')
    process.exit(1)
}
