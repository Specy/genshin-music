# Wave 1: Style Guide + Comment Triage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the project's style guide, then strip the migration's port-archaeology comments from the codebase while preserving every piece of knowledge that stops a future reader from "fixing" a deliberate bug.

**Architecture:** Comments and documentation only. Not one byte of runtime behaviour changes in this wave — which is what makes it safe to do first, and what makes its exit check unusually strong: the production build output must be byte-identical before and after.

**Tech stack:** Svelte 5.56 / SvelteKit 2.70 / TypeScript 6.0. Spec: `docs/superpowers/specs/2026-07-26-idiomatic-svelte-refactor-design.md`.

**Baseline:** `31bf806c` (spec commit). Measured at `4906b7b4`: 6,510 comment lines of 39,605 (16%).

## Global Constraints

Every task's requirements implicitly include this section.

1. **Comments and docs only.** No code, markup, CSS or import changes. If a comment is wrong _about the code_, fix the comment — never the code. Flag code defects in the report instead.
2. **Never delete quirk documentation.** The preserved-bug list in §"Preserved bugs" below is binding. Each entry must end this wave with a `QUIRK:` marker at its code site.
3. **LF only.** Byte-check every touched file with a Node `Buffer` scan for byte 13. Do not trust `grep`.
4. **Measure the index, not the worktree,** for any EOL claim: this checkout has locally CRLF-ified tracked files whose committed blobs are LF. Use `git cat-file -p` on `git ls-files -s` shas.
5. **Explicit-path staging only.** Never `git add -A` — untracked `.claude/` and `.superpowers/` scratch exist on disk.
6. **Nothing merges to `main`; nothing is pushed.**
7. **Gates before every commit:** `npm run check`, `npm run check:sky`, `npm run lint`, and `npm test`. Comment-only changes cannot break these, so a failure means something non-comment was touched.
8. **Old app for reference:** `git show migration/next16-react19:<path>`. It is _not_ a spec in this wave — deleting a comment that describes it is the point.

## Preserved bugs — the binding keep-list

Every one of these must carry a one-line `QUIRK:` comment at its site by the end of this wave. Wording may be rewritten; the fact must survive.

- **F1** Genshin analytics loads tag `G-T3TJDT2NFS` but configures `G-BSC3PC58G4` — two different GA properties. Encoded as `analytics.tagId` vs `analytics.configId` in the Genshin game definition. Sky's two ids are equal.
- **F2** Service worker: the catch-all NetworkFirst matcher precedes the CacheFirst `.mp3`/`.wav` matcher, so the audio matcher is shadowed and never applies.
- **F3** Sky's `instruments.data` has 35 entries (including `Aurora_Short`) against a 34-name roster.
- **F4** `MIDIProvider.destroy()` keeps a stale `currentMIDISource`, so its listeners are never detached.
- **F5** `en` locale typo `"chance-2"`.
- **F6** The error page's reset-settings button removes `{APP_NAME}_Main_Settings`, a key nothing writes — the reset is half-broken.
- **F7** `AppInit.svelte` uses raw `window.location.pathname.startsWith('/blog')` instead of `appPathname()` — the one deliberate exception to that convention, and a latent no-root bug.
- **Q1** ZenKeypad's stray-brace class quirk (`keyboard ${...}}`), which makes the zen-specific module class never match.
- **Q2** ZenNote/BaseNote `SvgNote` tint asymmetry.
- **Q3** The `great` VSRG colour's trailing-space hex value.
- **Q4** `VsrgSong.toGenshin()` does not rewrite `appName`.
- **Q5** v1 song parsing reads a decimal layer as hex.
- **Q6** `VsrgTrackModifier.clone()` drops `alias`.

---

### Task 1: Write the style guide

**Files:**

- Create: `docs/STYLE_GUIDE.md`

**Interfaces:**

- Produces: the rules every later task and every later wave is reviewed against. Task 2+ cite it by section.

- [ ] **Step 1: Write the guide**

Sections and required content:

**Readability**

- No one-off helper functions. If a function is called exactly once from one place, inline it — unless extraction genuinely clarifies (a named guard, a recursive step, a pure helper worth unit-testing). Rationale: the reader should follow a file top to bottom without chasing indirection.
- Comments explain _why_, never _what was ported_.
- Long design rationale lives in `docs/`, not in a file header. Leave a one-line pointer.

**Comment rules** — these are not style preferences; each was learned from a defect that survived multiple review rounds on this branch:

- **Never write another file's line numbers into a comment.** Cite by stable content: a quoted fragment, a selector, a symbol name. Line numbers are invalidated by any edit above them — including the author's own edit in the same commit.
- **Never write repo-wide quantifiers** ("exactly once in the whole tree", "the only", "all N sites"). They are unmaintainable by construction. State the _mechanism_ instead — "this module is the single source for X; Y imports it" — because mechanisms stay true and counts do not.
- **Re-derive any factual claim in the session you write it.** Build it, grep it, paste it. Never restate an earlier draft's reasoning.
- **Run the grep the sentence licenses, not the grep you meant.** If the two disagree, the sentence is wrong.
- **After rewriting a claim, re-verify it under the new wording** before committing. A fix must verify its own output, not just its input.
- **`QUIRK:` marks deliberate bug-for-bug behaviour.** Never delete one. It is what stops someone helpfully "fixing" a preserved upstream bug.

**TypeScript**

- `any` is banned; `@ts-ignore` is banned; `@ts-expect-error` requires a written reason.
- Don't cast — parse. A string from a `<select>`, `localStorage` or a URL is not a union member until checked. Validate at the boundary, return the union; the interior then needs no assertions.
- Derive unions from data so table and type cannot drift:
  ```ts
  const PITCHES = ['C', 'Db', 'D'] as const satisfies readonly string[];
  type Pitch = (typeof PITCHES)[number];
  ```
- `satisfies` for data tables. `unknown` + narrowing at genuine boundaries.

**Svelte**

- `{@attach}` over `use:` actions. `$derived` over `$effect`; never assign state inside an effect.
- `<svelte:window>`/`<svelte:document>` or `svelte/events`'s `on()` over manual `addEventListener`.
- `createContext` over `setContext`/`getContext`.
- `class` as `ClassValue` with clsx arrays/objects; not string interpolation, not `class:`.
- `svelte/reactivity` built-ins (`SvelteMap`, `SvelteSet`, `MediaQuery`) over hand-rolled equivalents.
- `$state.raw` for large objects that are only reassigned. Keyed `{#each}` always.
- Styles scoped to the component; CSS custom properties let a parent influence a child.

**Component API**

- The class prop is `class`, typed `ClassValue` — not `className`.
- Props derived from other props use `$derived`.
- Snippets over wrapper elements.

- [ ] **Step 2: Verify and commit**

```bash
node -e "const b=require('fs').readFileSync('docs/STYLE_GUIDE.md');console.log('CR',b.filter(x=>x===13).length)"
git add docs/STYLE_GUIDE.md
git commit -m "docs: add project style guide"
```

Expected: `CR 0`.

---

### Task 2: Establish the comment-only proof harness

**Files:**

- Create: `scripts/commentOnlyCheck.js`

**Interfaces:**

- Produces: `node scripts/commentOnlyCheck.js snapshot|compare` — the mechanism every triage task uses to prove it changed no behaviour. Tasks 3–7 all depend on it.

**Why:** production builds strip comments, so if a change is comment-only the built assets are byte-identical. This turns "I only touched comments" from a claim into a measurement.

- [ ] **Step 1: Write the script**

It must:

1. Run `npm run build:genshin`.
2. Walk `build/genshinMusic` and record `sha256` per file, relative path sorted.
3. **Exclude the service worker** (`service-worker.js` and any precache manifest): it embeds a build timestamp that changes every run, so it would always differ. Record its exclusion in the output so the exclusion is visible, not silent.
4. `snapshot` writes the map to `.superpowers/sdd/build-hashes.json` (gitignored scratch).
5. `compare` rebuilds, re-hashes and diffs against the snapshot, printing added/removed/changed paths and exiting non-zero on any difference.

- [ ] **Step 2: Prove it detects a real change**

Negative control — this is required evidence, not optional:

```bash
node scripts/commentOnlyCheck.js snapshot
# introduce a deliberate one-character runtime change in any component, e.g. a class name
node scripts/commentOnlyCheck.js compare   # MUST exit non-zero and name the changed chunk
git checkout -- <that file>
node scripts/commentOnlyCheck.js compare   # MUST exit zero
```

Paste both outputs in the report. A harness that cannot fail proves nothing.

- [ ] **Step 3: Commit**

```bash
git add scripts/commentOnlyCheck.js
git commit -m "chore: add comment-only build-hash check for the refactor waves"
```

---

### Tasks 3–6: Triage by area

All four follow the identical procedure below. They differ only in scope. Run them in this order; each is its own commit.

| Task | Scope                                                                                      | Files | Comment lines |
| ---- | ------------------------------------------------------------------------------------------ | ----- | ------------- |
| 3    | `src/lib/components/pages/` — Player + Composer trees                                      | ~35   | ~1600         |
| 4    | `src/lib/components/pages/` — Vsrg*, ZenKeyboard, keybinds, blog, HelpTab, SheetVisualizer | ~33   | ~1400         |
| 5    | `src/lib/components/` (shared, non-`pages/`)                                               | 78    | ~1380         |
| 6    | `src/routes/` (30 files) + `src/lib/{stores,audio,providers,utils,i18n,games}` (58)        | 88    | ~1700         |

**Procedure for each task:**

- [ ] **Step 1: Snapshot the build**

```bash
node scripts/commentOnlyCheck.js snapshot
```

- [ ] **Step 2: Triage every comment in scope**

**READ THIS FIRST — the failure mode Task 3 actually hit.** A single paragraph is very often BOTH archaeology AND quirk documentation: it opens with "old's ComposerTools.tsx built the className like this…" and closes with "…so the duplicate class token is reproduced byte-for-byte rather than cleaned up". Deleting the paragraph as archaeology silently deletes the quirk. Task 3 lost eleven such facts this way, three of which described the exact things later waves rewrite (a duplicated class token, a two-space class string, an index-keyed each block that the style guide's own "never key by index" rule would have "fixed" into a parity break).

So: **before deleting any paragraph, extract the fact.** Ask "does this tell me something that is deliberately not what it looks like?" If yes, that sentence survives as a one-line `QUIRK:` at the code site even though everything around it goes. Grep your own deletions for `deliberate`, `intentional`, `preserved`, `byte-for-byte`, `reproduced`, `not collapsed`, `not widened`, `quirk`, `dead code`, `unreachable` before you commit — every hit needs either a surviving marker or a written reason in your report for why it was pure archaeology.

Three outcomes only:

- **DELETE** — port archaeology. Old file paths, prop-rename tables, "React did X so we do Y", "ported in Phase N Task M", justifications for choices that are now simply the code. Git holds this; `migration/next16-react19` still exists.
- **KEEP, compressed to 1–2 lines** — anything a reader needs in order not to break the code: quirk/preserved-bug rationale (prefix `QUIRK:`), non-obvious ordering requirements, load-bearing CSS notes, browser workarounds. Rewrite in the de-quantified, mechanism-stating form the style guide requires.
- **MOVE** — substantial design rationale worth keeping but not worth a file header. Move to `docs/` and leave a one-line pointer.

While triaging, apply the style guide's comment rules to every surviving comment: strip cross-file line numbers (cite stable content instead), de-quantify repo-wide claims, and re-verify any factual assertion you keep — if you cannot verify it in this session, delete it rather than propagate it.

- [ ] **Step 3: Prove the change was comment-only**

```bash
node scripts/commentOnlyCheck.js compare
```

Expected: exit 0, no changed paths. **If this fails, you changed code** — find it and revert that part.

- [ ] **Step 4: Gates + LF, then commit**

```bash
npm run check && npm run check:sky && npm run lint
node -e "const fs=require('fs'),cp=require('child_process');cp.execSync('git diff --name-only',{encoding:'utf8'}).trim().split('\n').filter(Boolean).forEach(f=>{const cr=fs.readFileSync(f).filter(x=>x===13).length;if(cr)throw new Error('CR in '+f)});console.log('LF ok')"
git add <explicit paths>
git commit -m "docs: comment triage — <area>"
```

Report per task: before/after comment-line counts for the scope, the number of comments deleted / compressed / moved, every `QUIRK:` added, and the raw `compare` output.

---

### Task 7: Wave exit verification

**Files:** none modified except the ledger (gitignored).

- [ ] **Step 1: Re-measure the census**

Re-run the comment census across `src/**/*.{svelte,ts}`. Record total lines, comment lines, percentage, and the per-area breakdown. Target: 6–8% overall, from 16%.

- [ ] **Step 2: Cross-check the keep-list**

For each of F1–F7 and Q1–Q6 in §"Preserved bugs", grep for its `QUIRK:` marker and paste the hit. **A missing marker is a wave-blocking defect** — the knowledge was lost and must be restored from the ledger before this wave closes.

- [ ] **Step 3: Mechanical style-guide compliance sweep**

```bash
# cross-file line-number citations in comments — must be zero
grep -rEn '(svelte|ts|css|js):[0-9]+' src --include=*.svelte --include=*.ts | grep -E '//|/\*|<!--'
# repo-wide quantifiers in comments
grep -rniE '(exactly once|the only|in the whole tree|all [0-9]+ (sites|files|call))' src --include=*.svelte --include=*.ts
```

Every surviving hit must be justified in the report or fixed.

- [ ] **Step 4: Full gate matrix**

```bash
npm test && npm run check && npm run check:sky && npm run lint && npm run build:genshin && npm run build:all-no-root
```

- [ ] **Step 5: Whole-wave comment-only proof**

Compare the build hashes against a snapshot taken at the wave's base commit (`31bf806c`), not just per task — this proves the _cumulative_ wave changed no behaviour.

- [ ] **Step 6: Append the ledger block and commit**

Record: census before/after, per-area deltas, keep-list confirmations, sweep results, and carry-forwards for Wave 2.

## Exit criteria

1. `docs/STYLE_GUIDE.md` exists and is committed.
2. Comment share reduced from 16% to roughly 6–8%, measured.
3. Every preserved bug F1–F7 and quirk Q1–Q6 carries a `QUIRK:` marker, each confirmed by a pasted grep hit.
4. Zero cross-file line-number citations and zero repo-wide quantifiers in comments, or each survivor justified.
5. Production build byte-identical to the wave's base commit, service worker excluded and that exclusion stated.
6. All six gates green.
