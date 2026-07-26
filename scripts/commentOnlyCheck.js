import {execSync} from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Proves a source change was comment-only: production builds strip comments,
// so if nothing but comments changed, every emitted file hashes identically
// across a rebuild. `snapshot` records that baseline; `compare` rebuilds and
// diffs against it. See docs/superpowers/plans/2026-07-26-wave-1-style-guide-
// and-comment-triage.md (Task 2) for why this exists and how it's used.

const BUILD_DIR = './build/genshinMusic'
const SNAPSHOT_PATH = './.superpowers/sdd/build-hashes.json'

// Both scripts/buildApp.js (PUBLIC_SW_VERSION) and svelte.config.js
// (BUILD_VERSION_NAME) fall back to a fresh timestamp only when these are
// absent, so pinning them here - identically for the snapshot build and every
// compare build - is what makes two builds of identical source hash
// identically. Every other caller (npm run build:genshin directly, CI
// deploys) leaves them unset and keeps getting a real per-deploy value.
const FIXED_BUILD_ENV = {
    PUBLIC_SW_VERSION: 'comment-only-check',
    BUILD_VERSION_NAME: 'comment-only-check',
}

// Each entry excludes a whole file from the hash set because its content is,
// by design, a fresh build-time value rather than a function of the source -
// comparing it would make the check fail even between two builds of the
// identical commit. `matches` and the printed description share one entry so
// the two can't drift apart.
//
// service-worker.js and _app/version.json both used to live here too (they
// embed PUBLIC_SW_VERSION and kit.version.name respectively), but
// scripts/buildApp.js and svelte.config.js now only fall back to a fresh
// timestamp when those env vars are absent, and FIXED_BUILD_ENV below pins
// both to the same literal for every build this script runs - verified by
// hashing each file across two such builds and getting an identical digest.
// Neither needs excluding anymore; carrying the exclusion would just hide a
// real regression if the pinning ever broke.
const HASH_EXCLUSIONS = [
    {
        description: 'precache-manifest*.js',
        // src/service-worker.ts passes serwist a literal empty
        // precacheEntries array, so no separate manifest chunk is emitted
        // today (confirmed: matches zero files in every run so far) -
        // excluded pre-emptively because, if that config ever switches to
        // injectManifest with real entries, such a chunk would embed a
        // per-build revision list the same way service-worker.js and
        // _app/version.json used to before they were pinned deterministic.
        matches: (relativePath) => /^precache-manifest.*\.js$/i.test(path.basename(relativePath)),
    },
]

function isExcludedFromHash(relativePath) {
    return HASH_EXCLUSIONS.some((exclusion) => exclusion.matches(relativePath))
}

function printExclusions() {
    console.log('Excluded from hash (fresh per build, not a function of source):')
    for (const exclusion of HASH_EXCLUSIONS) {
        console.log(`  - ${exclusion.description}`)
    }
}

function walkFiles(dir) {
    const files = []
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) files.push(...walkFiles(fullPath))
        else if (entry.isFile()) files.push(fullPath)
    }
    return files
}

function buildGenshin() {
    execSync('npm run build:genshin', {stdio: 'inherit', env: {...process.env, ...FIXED_BUILD_ENV}})
}

function hashBuildOutput() {
    const relativePaths = walkFiles(BUILD_DIR)
        .map((absolutePath) => path.relative(BUILD_DIR, absolutePath).split(path.sep).join('/'))
        .filter((relativePath) => !isExcludedFromHash(relativePath))
        .sort()
    const hashes = {}
    for (const relativePath of relativePaths) {
        const contents = fs.readFileSync(path.join(BUILD_DIR, relativePath))
        hashes[relativePath] = crypto.createHash('sha256').update(contents).digest('hex')
    }
    return hashes
}

// Pure and worth unit-testing in isolation from the build/filesystem calls
// above, so it stays a separate function despite the single call site below.
function diffHashes(before, after) {
    const beforePaths = new Set(Object.keys(before))
    const afterPaths = new Set(Object.keys(after))
    const added = [...afterPaths].filter((p) => !beforePaths.has(p)).sort()
    const removed = [...beforePaths].filter((p) => !afterPaths.has(p)).sort()
    const changed = [...beforePaths].filter((p) => afterPaths.has(p) && before[p] !== after[p]).sort()
    return {added, removed, changed}
}

function runSnapshot() {
    printExclusions()
    buildGenshin()
    const hashes = hashBuildOutput()
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), {recursive: true})
    const snapshot = {excluded: HASH_EXCLUSIONS.map((exclusion) => exclusion.description), files: hashes}
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`Snapshot written: ${Object.keys(hashes).length} files -> ${SNAPSHOT_PATH}`)
    process.exit(0)
}

function runCompare() {
    printExclusions()
    if (!fs.existsSync(SNAPSHOT_PATH)) {
        console.error(`No snapshot at ${SNAPSHOT_PATH} - run "node scripts/commentOnlyCheck.js snapshot" first.`)
        process.exit(1)
    }
    const {files: before} = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
    buildGenshin()
    const after = hashBuildOutput()
    const {added, removed, changed} = diffHashes(before, after)
    if (!added.length && !removed.length && !changed.length) {
        console.log(`No differences from snapshot (${Object.keys(after).length} files compared).`)
        process.exit(0)
    }
    if (added.length) {
        console.log(`Added (${added.length}):`)
        added.forEach((p) => console.log(`  + ${p}`))
    }
    if (removed.length) {
        console.log(`Removed (${removed.length}):`)
        removed.forEach((p) => console.log(`  - ${p}`))
    }
    if (changed.length) {
        console.log(`Changed (${changed.length}):`)
        changed.forEach((p) => console.log(`  ~ ${p}`))
    }
    process.exit(1)
}

const command = process.argv[2]
if (command === 'snapshot') runSnapshot()
else if (command === 'compare') runCompare()
else {
    console.error('Usage: node scripts/commentOnlyCheck.js <snapshot|compare>')
    process.exit(1)
}
