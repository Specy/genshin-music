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

// Each entry excludes a whole file from the hash set because its content is,
// by design, a fresh build-time value rather than a function of the source -
// comparing it would make the check fail even between two builds of the
// identical commit. `matches` and the printed description share one entry so
// the two can't drift apart.
const HASH_EXCLUSIONS = [
    {
        description: 'service-worker.js',
        // Embeds PUBLIC_SW_VERSION (src/service-worker.ts's CACHE const),
        // which scripts/buildApp.js sets to a fresh timestamp on every run.
        matches: (relativePath) => path.basename(relativePath) === 'service-worker.js',
    },
    {
        description: 'precache-manifest*.js',
        // src/service-worker.ts passes serwist a literal empty
        // precacheEntries array, so no separate manifest chunk is emitted
        // today - excluded pre-emptively because, if that ever changes, such
        // a chunk would embed the same kind of per-build revision list the
        // service worker above does.
        matches: (relativePath) => /^precache-manifest.*\.js$/i.test(path.basename(relativePath)),
    },
    {
        description: '_app/version.json',
        // SvelteKit's own build-metadata file. svelte.config.js sets no
        // `kit.version.name`, so Kit defaults it to `Date.now()` - verified
        // by diffing two builds of one unchanged commit: only this file,
        // service-worker.js, and every content-hashed path under
        // _app/immutable/ differed. That last part is a known gap this
        // script does not paper over: the version value is also embedded in
        // the prerendered HTML and the client entry chunk, and because
        // built asset filenames are content hashes, that one embed cascades
        // into a new filename for most of _app/immutable/ on every build,
        // comment-only or not. Excluding version.json removes the direct
        // instance of the problem; it does not remove the cascade. See this
        // task's report for the full reproduction and the fix that clears
        // it (pinning `kit.version.name`), which is out of this script's
        // scope to apply.
        matches: (relativePath) => relativePath === '_app/version.json',
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
    execSync('npm run build:genshin', {stdio: 'inherit'})
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
