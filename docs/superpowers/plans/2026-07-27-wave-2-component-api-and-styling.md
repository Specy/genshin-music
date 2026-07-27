# Wave 2: Component API + Styling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every component the idiomatic Svelte class API — a `class` prop typed `ClassValue`, clsx arrays instead of string interpolation — and delete the `:global()` selectors that only existed to work around not having it.

**Architecture:** One atomic mechanical rename first, then the risky semantic work split per component family. The rename is provably safe (a pure prop rename emits identical DOM); the clsx and `:global` work is not, so it goes in small batches with measurement between each.

**Baseline:** `cd5fadfa` (Wave 1 complete). Spec: `docs/superpowers/specs/2026-07-26-idiomatic-svelte-refactor-design.md` §4.2. Style guide: `docs/STYLE_GUIDE.md`.

**Measured at baseline:** 253 `className` sites, 50 interpolated `class="..."` attributes (29 with ternaries), 74 `:global(`.

## Global Constraints

1. **Emitted DOM must not change.** Not the class strings, not the element structure. The expression may be rewritten; its output may not.
2. **The four class-string quirks below are load-bearing.** Each carries a `QUIRK:` marker at its site. A clsx rewrite silently normalises all four — that is exactly what this wave must not do. If preserving one means leaving that site as a template string, leave it and say so.
   - `ComposerTools.svelte` — the `floating-tools` token is deliberately **repeated**; clsx dedupes it.
   - `InstrumentSettingsPopup.svelte` — **two spaces** between tokens in the no-instrument branch; the sibling branch has one, also deliberate.
   - `ComposerNote.svelte` — the join emits **empty tokens**, so a `layer=0` note's class carries **trailing spaces**. The map covers 0–15 only; `LayerStatus` permits 16; do not widen.
   - `ZenKeypad.svelte` — a **stray trailing brace** in the class string. This is what makes the zen module class never match, and it looks exactly like a typo worth fixing. It is not.
3. **Load-bearing `:global()`, do not scope away:** `MidiSetup.svelte`, `ShortcutElement.svelte`, `VsrgPlayerCanvas.svelte` (pixi creates the element, so Svelte never sees it to scope it), `SheetFrame.css` (deliberately unscoped, shared by two components).
4. **Do not DRY:** `VsrgKey.svelte` + `VsrgPlayerKeyboard.svelte` duplicate CSS intentionally.
5. **Do not delete deliberately empty CSS rules:** `SheetFrame.css` (two sites), `MidiSetup.svelte`, `SettingsRow.svelte`, `BaseBlogPost.svelte`, `VsrgPlayerScore.svelte`.
6. **Not this wave:** `PlayerPagesRenderer.svelte`'s index-keyed each block (Wave 3), anything under `src/lib/core/` (Wave 5).
7. LF only (Node Buffer scan for byte 13, never grep). Explicit-path staging, never `git add -A`. Branch `migration/sveltekit`; never touch `main`, never push.
8. **Gates before every commit:** `npm run check`, `npm run check:sky`, `npm run lint`, `npm test`.

---

### Task 1: Class-attribute harness

**Files:** Create `scripts/classAttrCheck.js`

Wave 1 could prove itself with build hashes because comments vanish from the build. This wave changes real source, so the build legitimately differs — a different check is needed: **the class attributes in the built HTML must not change.**

- [ ] **Step 1: Write it.** `snapshot` / `compare`, same shape as `scripts/commentOnlyCheck.js` (read it first and follow its conventions, including the pinned `BUILD_VERSION_NAME` / `PUBLIC_SW_VERSION` env vars that make builds reproducible). It builds, walks every `.html` under `build/genshinMusic`, extracts every element's `class` attribute **in document order, verbatim, without normalising whitespace** (the whole point is catching normalisation), and records them per file. `compare` reports every added/removed/changed class string with its file and index, and exits non-zero on any difference.
- [ ] **Step 2: Prove it can fail.** Negative control: change one class string in any prerendered component, `compare` must exit non-zero and name it; revert; `compare` must exit 0. Then the specific control this wave needs — collapse a double space in some class attribute and confirm it is caught. Paste both raw outputs. **A check that cannot see whitespace normalisation is useless here.**
- [ ] **Step 3: Commit** as `chore: add built-class-attribute check for the styling wave`.

---

### Task 2: `className` → `class`, atomically

**Files:** every `.svelte` declaring or passing a `className` prop (~253 sites).

Done in ONE commit across the whole codebase, because a half-renamed tree silently drops the prop at every boundary where the two conventions meet. A pure rename emits identical DOM, so it is fully verifiable.

- [ ] **Step 1: Snapshot** — `node scripts/classAttrCheck.js snapshot`.
- [ ] **Step 2: Rename.** Declarations become `class: cls` (the local alias is required — `class` is reserved), typed with `ClassValue` from `svelte/elements`. Call sites pass `class={...}`. Where a component forwards to a child, forward the renamed prop. Do not change any class *value* in this task — only the prop's name and type.
- [ ] **Step 3: Verify** — `node scripts/classAttrCheck.js compare` must exit 0 with **zero** differences. A pure rename cannot change emitted classes; any difference is a bug you introduced.
- [ ] **Step 4:** Gates, LF scan, commit as `refactor: className -> class prop typed ClassValue`.

---

### Tasks 3–7: clsx + `:global` reduction, per family

| Task | Family |
|---|---|
| 3 | `src/lib/components/inputs/` + `src/lib/components/settings/` |
| 4 | `src/lib/components/menu/` + `utility/` + `layout/` |
| 5 | `src/lib/components/` top level + `shell/` + `blog/` |
| 6 | `src/lib/components/pages/Player/` + `Composer/` + `HelpTab/` |
| 7 | `src/lib/components/pages/` remainder (Vsrg*, ZenKeyboard, keybinds, SheetVisualizer) + `src/routes/` |

**Identical procedure for each:**

- [ ] **Step 1: Snapshot** — `node scripts/classAttrCheck.js snapshot`.
- [ ] **Step 2: Convert class expressions.** String interpolation → clsx arrays/objects, per the style guide. **Before converting any site, check whether it emits exactly the same string.** Ternaries yielding `''` produce empty tokens and extra spaces that clsx drops. If the emitted string would change, either keep the template string (and add a `QUIRK:` note if the oddity is deliberate) or, if it is genuinely incidental, convert it and record the difference in your report for review. Never convert a site carrying a `QUIRK:` marker without explicit justification.
- [ ] **Step 3: Reduce `:global()`.** Remove it where the component owns the styling — typically where it existed only because a parent passed `className` into a child's root element, which the Task 2 rename plus clsx merging now handles directly. Keep every selector listed in Global Constraints 3, and keep any selector targeting DOM this component does not create. Each `:global()` that survives gets a one-line reason.
- [ ] **Step 4: Verify.**
  - `node scripts/classAttrCheck.js compare` — every difference must be listed and justified in your report. Unexplained differences are defects.
  - **Live measurement.** Start the dev server, visit the pages this family affects, and compare computed styles of the affected elements against the same elements on the deployed old app at `https://genshin-music.specy.app`. Static reasoning about CSS is not evidence — this is the technique that caught nine real bugs on this branch. Report the measurements.
- [ ] **Step 5:** Gates, LF scan, commit as `refactor: clsx classes + scoped styles - <family>`.

---

### Task 8: Residual sweep + wave exit

- [ ] **Step 1:** `src/app.d.ts` and `src/service-worker.ts` fell outside every Wave 1 task's scope and remain ~43% comments. Triage them under the Wave 1 rules (`docs/superpowers/plans/2026-07-26-wave-1-style-guide-and-comment-triage.md`), preserving F2's service-worker `QUIRK:` marker.
- [ ] **Step 2: Census.** Count remaining `className` (must be 0), interpolated `class="..."` attributes, and `:global(` — before and after the wave.
- [ ] **Step 3: Quirk survival.** All four class-string quirks from Global Constraints 2 still emit their original strings — prove it from the **built HTML**, not the source.
- [ ] **Step 4: Full gate matrix** — `npm test`, `check`, `check:sky`, `lint`, `build:genshin`, `build:all-no-root`.
- [ ] **Step 5: Ledger** — append the Wave 2 closing block with census, per-family notes, every justified class-attribute difference, and carry-forwards for Wave 3.

## Exit criteria

1. Zero `className` props; `class` typed `ClassValue` throughout.
2. Class expressions use clsx arrays/objects except where a documented quirk requires otherwise.
3. `:global()` count materially reduced, every survivor carrying a one-line reason.
4. All four class-string quirks verified intact **in built HTML**.
5. Live measurement performed per family against the deployed old app, with results recorded.
6. All six gates green.
