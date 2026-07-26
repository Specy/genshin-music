# Idiomatic Svelte Refactor — Design

**Status:** approved 2026-07-26
**Branch:** `migration/sveltekit` (post-migration; `main` still holds the React app)
**Baseline:** `4906b7b4` — migration closed, whole-branch review Ready, nine user-reported UI bugs fixed

## 1. Goal

The SvelteKit port achieved behavioural parity by transcribing the React app as literally as
possible. That was the right call for correctness and it worked — but it left a codebase that reads
like React written in Svelte syntax, carries the migration's own scaffolding in its comments, and
uses type assertions where types should have been doing the work.

This project makes the code idiomatic modern Svelte 5 / SvelteKit 2, readable top-to-bottom, and
type-safe by construction — without regressing the parity that was just verified.

## 2. Non-goals

- **No behaviour changes.** Every preserved quirk and bug-for-bug port stays. If a refactor would
  change what the app does, it is out of scope and gets flagged instead.
- **No conversion of the 18 singleton stores to context.** The Svelte docs recommend context to
  avoid cross-request state leakage during SSR. This app is `adapter-static`, fully prerendered,
  with no server runtime and no per-user server state — the hazard does not exist here. The
  refactor would be large and risky for no benefit. Explicitly rejected, recorded here so it is not
  re-proposed.
- **No full elimination of `App.css`.** Fully scoped styles are the long-term target (§4.2), but
  `App.css` is a byte-verbatim concatenation of nine old global stylesheets whose selectors cross
  component boundaries. What remains after Wave 2 is a separate project with its own parity budget.
- **No test-framework change.** The golden-fixture suite stays as-is; fixtures remain immutable
  (last regenerated at `5f24ae0e`).

## 3. The style guide

Committed to `docs/STYLE_GUIDE.md` in Wave 1. It is the durable artifact — the refactor applies it,
and future work follows it. Every rule below is enforceable by review, and several by lint.

### 3.1 Readability

- **No one-off helper functions.** If a function is called exactly once, from one place, inline it —
  unless extracting genuinely clarifies (a named guard clause, a recursive step, a pure helper worth
  unit-testing). The reader should be able to follow a file top to bottom without chasing
  indirection. The port created dozens of `handleX` wrappers purely to mirror React handler names;
  those go.
- **Comments explain *why*, never *what was ported*.** Port archaeology belongs in git.
- **Preserved quirks must be marked.** Any deliberate bug-for-bug behaviour carries a one-line
  `QUIRK:` comment so it is greppable and nobody "fixes" it. This is the one comment category that
  must never be deleted.
- **Long design rationale lives in docs**, not in a 40-line file header. Leave a one-line pointer.

### 3.2 TypeScript

- **`any` is banned.** Lint-enforced as an error at the end of Wave 5.
- **`@ts-ignore` is banned; `@ts-expect-error` requires a written reason.** Lint-enforced.
- **Don't cast — parse.** A string arriving from a `<select>`, `localStorage`, or a URL is not a
  union member until it has been checked. Validate at the boundary and return the union type; the
  interior then needs no assertions.
- **Derive unions from data**, so the table and the type cannot drift:
  ```ts
  const PITCHES = ['C', 'Db', 'D', /* … */] as const satisfies readonly string[]
  type Pitch = (typeof PITCHES)[number]
  ```
- **`satisfies` for data tables** — config objects, settings definitions, game data — so excess
  property checks apply while literal types are preserved.
- **Prefer `unknown` + narrowing over `any`** at genuine boundaries (JSON, dynamic imports).

### 3.3 Svelte

- `{@attach}` instead of `use:` actions (Svelte 5.29+). Attachments are reactive and compose.
- `$derived` instead of `$effect` for anything computed. Never assign state inside an effect.
- `<svelte:window>` / `<svelte:document>`, or `on()` from `svelte/events`, instead of manual
  `addEventListener` in `onMount`/`$effect`.
- `createContext` (5.40+) instead of `setContext`/`getContext` — it is typed, so no key strings and
  no casts.
- `class` as `ClassValue` with clsx arrays/objects, not string interpolation and not `class:`.
- Reactive built-ins from `svelte/reactivity` (`SvelteMap`, `SvelteSet`, `MediaQuery`) instead of
  hand-rolled equivalents.
- `$state.raw` for large objects that are only ever reassigned.
- Keyed `{#each}` always; never index as key.
- Styles scoped to the component; CSS custom properties to let a parent influence a child.

### 3.4 Component API

- The class prop is **`class`**, typed `ClassValue` — not `className`.
- Props that derive from other props use `$derived`, never a one-time computation.
- Snippets instead of wrapper elements where markup is passed.

## 4. Waves

Each wave is a plan file executed by subagents with per-task review, then a whole-wave review.
Ordering is chosen so each wave lands on ground the previous one cleared.

### 4.1 Wave 1 — Style guide + comment triage

Zero runtime risk: comments and docs only. Done first because it makes every later wave's diff
readable.

Baseline measured at `4906b7b4`: **6,510 comment lines of 39,605 total — 16%**. Worst offenders:
`RootMetadata.svelte` 71%, `composer/+page.svelte` 71%, `AppLink.svelte` 61%, `SvgNote.svelte` 58%,
`+layout.svelte` 51%.

Triage policy — approved default:
- **Delete** pure port archaeology (old paths, prop-rename tables, "React did X, we do Y").
- **Keep, compressed to 1–2 lines** quirk and preserved-bug rationale, prefixed `QUIRK:`.
- **Move** substantial design rationale to `docs/` or the ledger, leaving a one-line pointer.

Target: comment share down to roughly 6–8% of lines, with **zero** loss of quirk documentation.

Exit criteria: `docs/STYLE_GUIDE.md` committed; every `QUIRK:` marker cross-checked against the
ledger's preserved-bug watchlist; no non-comment bytes changed (verified by a whitespace/comment-only
diff check); all six gates green.

### 4.2 Wave 2 — Component API + styling

The one wave that can silently break visual parity, so it is **split per component family** —
inputs, menus, layout/shell, song rows, pages — with a build and live measurement between each.

- `className` → `class`, typed `ClassValue` (253 sites).
- String-interpolated classes → clsx arrays/objects (50 sites, 29 with ternaries).
- Remove `:global()` where a component owns its own styling (74 sites today). A `:global()` that
  exists only because a parent passed `className` into a child's root element usually disappears
  once the child accepts `class` and merges it with clsx.
- `:global()` that reaches into shared/global CSS stays, and is annotated with why.

Exit criteria: per family — built HTML class lists diffed against the previous build; live DOM
measurement of the affected pages against the live old app; all six gates green.

### 4.3 Wave 3 — Svelte idiom

- 18 `use:` actions → `{@attach}`, including `PlayerMenu`'s hand-rolled
  `clickOutside(...)`-inside-`$effect` with manual `.destroy()`.
- `menuContext.ts` → `createContext`, deleting its `as unknown as MenuContextState<T>` cast.
- `createMediaQuery` (hand-rolled `$state` + `$effect` subscription) → `MediaQuery` from
  `svelte/reactivity`.
- Window/document listeners → `<svelte:window>` / `<svelte:document>` / `svelte/events.on`.
  Today: 136 `onMount`, 54 `addEventListener`, only 4 `<svelte:window>`.
- `SvelteMap`/`SvelteSet` audit; `$state.raw` where objects are only reassigned.

Note the provider singletons (`KeyboardProvider`, `AudioProvider`, `MIDIProvider`) own real
non-Svelte lifecycles. Where they expose subscribe/unsubscribe pairs, `createSubscriber` from
`svelte/reactivity` is the idiomatic bridge — evaluated per provider, not applied blindly.

Exit criteria: zero `use:` outside vendored code; zero manual action invocation; keybinds, menus,
drag/drop and click-outside behaviour re-verified live on both games.

### 4.4 Wave 4 — Reactivity audit

104 `$effect`s reviewed one by one and converted to `$derived`, an event handler, or an attachment.
Effects that remain must be justified in a comment.

This wave carries the highest bug-prevention value: both the menu-switching bug and the volume
off-by-one shipped in the port were reactivity-timing defects that no gate caught. Specific
hazards to sweep for, both already found in production code here:
- reading a live `$derived` after mutating one of its dependencies inside the same handler (React's
  frozen render closure does not translate);
- state assigned inside `$effect` where `$derived` was meant.

`VsrgPlayerStore.svelte.ts` (11 effects) is the densest file and gets its own task.

Exit criteria: every surviving effect justified; live interaction checklists on player, composer,
vsrg-composer, vsrg-player, zen-keyboard for both games.

### 4.5 Wave 5 — Types, then guardrails

Scope includes `src/lib/core` — approved, but **types and annotations only, no runtime edits**. The
golden fixtures cover this layer and must stay green at every commit; any change that alters a
serialized byte is a defect, not a refactor.

- Eliminate casts by fixing sources: `as Pitch`, `as AppLanguage`, `as NoteNameType`,
  `as VsrgSongKeys` all trace to strings from selects/storage — replace with parse-at-boundary
  helpers returning the union.
- Remove `any` (70 sites) and the 19 `no-explicit-any` suppressions.
- Remove `@ts-ignore`/`@ts-expect-error` (~87) except where genuinely irreducible.
  `MediaRecorderPolyfill.ts` is vendored browser-shim code whose suppressions are legitimate; it is
  exempt, annotated, and lint-scoped.
- Apply `satisfies` to the GameDefinition data modules and settings tables.
- Revisit the `typescript ~6.0.3` pin (held by the typescript-eslint peer cap) — if the cap has
  lifted, unpin; if not, record why.
- Re-scope the `src/lib/core` eslint ignore now that the byte-verbatim era is over.
- **Then** flip `@typescript-eslint/no-explicit-any` and `ban-ts-comment` to `error`.

Exit criteria: lint green with the new rules as errors; `npm run check` 0 errors both games; golden
fixtures byte-identical.

## 5. Verification

Per-wave, and per-family inside Wave 2:

1. **Six gates** — `npm test` (both games), `npm run check`, `npm run check:sky`, `npm run lint`,
   `npm run build:genshin`, `npm run build:all-no-root`.
2. **Live DOM measurement** — the technique that caught the nine reported bugs: drive the dev server
   in a browser, measure computed styles and geometry of the affected elements, and compare against
   the same elements on the deployed old app (`https://genshin-music.specy.app`). Static reasoning
   about CSS is not accepted as evidence.
3. **Golden fixtures** — immutable; any diff is a defect.
4. **Storage keys** — re-audited against `docs/superpowers/audits/2026-07-19-storage-inventory.md`.
   No refactor may change a persisted key, IndexedDB name, or serialized format.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Wave 2 silently breaks visual parity | Split per component family; measure built HTML + live DOM between each |
| Comment triage deletes a real warning | `QUIRK:` category never deleted; cross-checked against the ledger's preserved-bug watchlist |
| `core/` type work alters serialization | Types/annotations only; golden fixtures green at every commit |
| Reactivity conversions change timing | Live interaction checklists, not just type-checking |
| Cleanup rots back | Lint guardrails flipped to errors at the end of Wave 5 |

## 7. Success criteria

1. Zero `any`, zero `@ts-ignore`, zero unexplained `@ts-expect-error` outside the vendored polyfill —
   enforced by lint as errors.
2. Zero `use:` actions; zero `setContext`/`getContext`; zero hand-rolled reactive primitives that
   `svelte/reactivity` provides.
3. Every surviving `$effect` carries a justification.
4. Comment share roughly 6–8% of lines, with quirk documentation intact and greppable.
5. `class`/`ClassValue` everywhere; no `className`.
6. All six gates green, golden fixtures byte-identical, storage keys unchanged.
7. `docs/STYLE_GUIDE.md` exists and the codebase complies with it.
