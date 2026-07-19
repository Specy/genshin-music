# ZangoDB-under-Vite Spike (Phase 0)

**Date**: 2026-07-19
**Branch**: `migration/next16-react19`
**Backs**: spec §11 risk row `@insertish/zangodb misbehaves under Vite bundling`,
`docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md`.
**Produces**: go/no-go for Phase 1's Vite-based scaffold, plus the exact config
required.

## Verdict: OK — needs one config change (a dependency add, not a `vite.config.ts` edit)

`@insertish/zangodb@1.0.12-nomemo` (the repo's exact pin) works under both Vite
code paths exercised by the SvelteKit migration — `vite dev` (esbuild
prebundle) and `vite build` + `vite preview` (rollup) — including IndexedDB
persistence across a page reload. It does **not** work out of the box: dev
mode fails silently (blank page, no thrown console error visible via normal
console APIs) unless the `events` npm package is added as an explicit
dependency. Once added, no `vite.config.ts` changes (no `optimizeDeps.include`,
no `resolve.alias`, no commonjs-plugin options) were needed for either path.
The spec §11 fallback (patch/fork/vendor behind the `Collection` interface) is
**not needed**.

## Setup

Scaffolded per brief Step 1 in a scratchpad directory (throwaway, deleted
after the spike, never committed):

```
npm create vite@latest zango-spike -- --template vanilla-ts
cd zango-spike && npm install
npm install @insertish/zangodb@1.0.12-nomemo
```

| Tool | Version | Notes |
|---|---|---|
| `create-vite` | 9.1.1 | latest at spike time |
| `vite` | **8.1.5** (`^8.1.1` scaffolded) | same major/minor already resolved in the main repo's own `node_modules` (pulled in transitively via Vitest, `package-lock.json:6368` allows `^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`) — this spike used the same version Phase 0's test infra already exercises, not a hypothetical future one |
| `typescript` | ~6.0.2 | scaffold default |
| `@insertish/zangodb` | 1.0.12-nomemo | exact repo pin, installed un-ranged per brief |
| `events` | ^3.3.0 (installed 3.3.0) | **added to unblock dev mode**, see below |
| node / npm | v24.6.0 / 11.6.2 | host versions |

`npm install @insertish/zangodb@1.0.12-nomemo` printed one unrelated
deprecation notice (informational only, not a blocker):
```
npm warn deprecated q@1.5.1: You or someone you depend on is using Q, the JavaScript Promise library...
```
(zangodb depends on `q` internally for its promise implementation.)

Probe (`src/main.ts`), written verbatim from the brief:

```ts
import ZangoDb from '@insertish/zangodb'

const out = document.querySelector<HTMLDivElement>('#app')!

async function probe() {
    try {
        const db = new ZangoDb.Db('SpikeTest', 1, {songs: []})
        const songs = db.collection('songs')
        await songs.insert({id: 'spike-1', name: 'hello zango'})
        const found = await songs.find({id: 'spike-1'}).toArray()
        out.textContent = 'ZANGO_OK ' + JSON.stringify(found.map(f => f.name))
    } catch (e) {
        out.textContent = 'ZANGO_FAIL ' + String(e)
    }
}

probe()
```

## Finding 1 (blocking until fixed): `events` externalized by Vite's dep optimizer

First `npm run dev` + browser load with the verbatim probe and a stock
`npm create vite` scaffold (no `events` dependency) produced a **blank page**
— `#app` stayed empty, and `read_console_messages` (which listens for
`console.*` API calls) reported **no errors at all**. The failure only
surfaced by evaluating the prebundled chunk directly in the page:

```
TypeError: Super expression must either be null or a function
    at _inherits (.../node_modules/.vite/deps/@insertish_zangodb.js:6299:70)
```

Root cause, confirmed by reading zangodb's compiled source
(`node_modules/@insertish/zangodb/build/src/db.js:31` and `cursor.js`):
zangodb's `Db`/`Cursor` classes are Babel-compiled ES5 that do
`var EventEmitter = require('events'); ... _inherits(Db, EventEmitter)`,
i.e. they subclass Node's `events.EventEmitter` directly (`events` is the
**only** Node built-in zangodb touches — every other dependency, `q`,
`clone`, `deepmerge`, `object-hash`, is an ordinary browser-safe npm package).
Vite's esbuild dependency optimizer has no real package to resolve `events`
to (it isn't in the project's `node_modules` by default), so it substitutes
its standard browser-external stub — a warning-only Proxy object, confirmed
present in the generated chunk:
```
Module "events" has been externalized for browser compatibility. Cannot access "events.${key}" in client code.
```
That stub is a plain object, not a function, so Babel's `_inherits` helper
throws when it tries to use it as a superclass. This exception fires at
**module-evaluation time** (top-level `import`), before `probe()` ever runs,
which is why the page was blank with no visible console error rather than
showing `ZANGO_FAIL`.

**Fix**: `npm install events` (the standard userland browser-compatible
`EventEmitter` shim, ~3.3.0, no relation to Node's built-in — just a same-named
real package). No `vite.config.ts` edit was needed: once the package exists in
`node_modules`, Vite/esbuild's normal bare-specifier resolution finds the real
package before falling back to the browser-external built-in stub. This is
the standard, documented Vite behavior
(https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility).
Not tested/needed, but noted for completeness: if a future Vite version ever
changes that resolution precedence, the documented fallback is an explicit
`resolve.alias: { events: 'events' }` in `vite.config.ts`.

After `npm install events` and restarting `vite` with `--force` (to bust the
stale dep-optimizer cache), the browser showed:
```
ZANGO_OK ["hello zango"]
```
`node_modules/.vite/deps/@insertish_zangodb.js` no longer contained the
externalization warning string. No `optimizeDeps.include` entry was needed for
`@insertish/zangodb` itself — Vite's crawler auto-discovered it from the
static `import` in `main.ts`.

**Relevance to the current (webpack) build**: the main repo's `node_modules`
has no `events` package (checked `package-lock.json`); under Vite, this
triggered the browser-external stub failure. Whether webpack already works or
needs the fix remains an **open question** — the webpack mechanism was not
investigated (no webpack build run for comparison; webpack 5 may differ or the
code path may not execute at module-init). Phase 1's scaffold must add
`"events": "^3.3.0"` as an explicit dependency.

## Finding 2 (build-only, non-blocking, workaround already exists in the repo): loose `Object` typing

`npm run build` runs `tsc && vite build` (scaffold default). With the
verbatim probe, `tsc` failed before Vite ever ran:
```
src/main.ts(11,73): error TS2339: Property 'name' does not exist on type 'Object'.
```
zangodb's shipped ambient typings (`node_modules/@insertish/zangodb/src/zangodb.d.ts`)
type `Cursor.toArray(): Promise<Object[]>` — the TypeScript global `Object`
type, which has no index/property access — rather than `any` or a generic.
The default import itself (`import ZangoDb from '@insertish/zangodb'`) type-checked
fine with this scaffold's tsconfig (`moduleResolution: "bundler"`, no
`esModuleInterop` set); only the `.name` property access on the `Object[]`
result failed. This is invisible in dev mode: `vite dev` uses esbuild to
strip types without type-checking, so the identical file ran fine under
`npm run dev` before it was fixed for `npm run build`.

This isn't a new problem Phase 1 will introduce — the app's existing
`src/lib/Services/Database/Collection.ts` (`ZangoCollection<T>`) already works
around the exact same typing gap today, casting through `Object`/`as T[]` on
every method (e.g. `find(query)` returns
`this.instance.find(query as Object).toArray() as Promise<T[]>`). The spike
confirms that pattern remains necessary and sufficient under `tsc`+Vite; no
new workaround needs to be invented for Phase 1.

Fix applied in the spike (one line, to let the build proceed and test the
real rollup path): `found.map(f => f.name)` → `found.map((f: any) => f.name)`.

## Production build (rollup path) — after both fixes

```
> zango-spike@0.0.0 build
> tsc && vite build

vite v8.1.5 building client environment for production...
transforming...✓ 30 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.38 kB │ gzip:  0.26 kB
dist/assets/index-Co71VE5l.js  127.57 kB │ gzip: 31.37 kB

✓ built in 98ms
```
Clean build: no errors, and — better than the brief's "CJS interop warnings
are acceptable" allowance — **no warnings of any kind**, including none about
CJS/ESM interop for zangodb, `q`, `clone`, `deepmerge`, `object-hash`, or
`events`.

`npm run preview` (rollup output, served statically) then the browser:
```
ZANGO_OK ["hello zango"]
```
Reloading the same URL once more (persistence check, brief Step 4):
```
ZANGO_OK ["hello zango","hello zango"]
```
Two entries confirm the IndexedDB row from the first load survived the
reload — the probe's `insert` has no unique constraint on the app-level `id`
field (matching the real app's schema, see
`docs/superpowers/audits/2026-07-19-storage-inventory.md`: zangodb's actual
primary key is its own internal auto-increment `_id`), so each reload adds a
second `"hello zango"` document rather than upserting; the `find` still
returns the original row plus the new one, which is the intended persistence
signal. No console errors or warnings at any point in preview mode
(`read_console_messages` returned no entries at all).

## Required config for Phase 1's scaffold

1. Add `"events": "^3.3.0"` (or later) as an explicit `dependencies` entry
   alongside `@insertish/zangodb`. This is the only required change. No
   `vite.config.ts` file is needed for zangodb to work in dev, build, or
   preview.
2. Carry forward the existing cast pattern in `Collection.ts`
   (`as Object` / `as T[]` / `as Promise<T | null>`) — it already exists in
   the codebase and remains necessary under `tsc`. No new typings work needed.

## Cleanup confirmation

- Both dev-server and preview-server background processes were stopped.
  `TaskStop` reported success on the shell-tracked task IDs, but the
  underlying `node`/`vite` processes stayed listening on Windows (npm spawns
  a detached child); verified via `Get-NetTCPConnection` and killed the actual
  `node.exe` PIDs on ports 5173, 5174, and 4173 with `Stop-Process`. Confirmed
  down afterward (`curl` to all three: connection refused).
- Spike folder deleted from the scratchpad directory (`zango-spike/`, including
  `node_modules`); verified absent after deletion.
- Nothing under the spike was ever committed; only this document is.
