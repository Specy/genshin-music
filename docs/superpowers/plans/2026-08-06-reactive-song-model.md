# Reactive Song Model + Composer Playback Rendering Plan

> **For agentic workers:** implement this plan phase-by-phase. Steps use checkbox (`- [ ]`)
> syntax for tracking. Both suites and the golden fixtures must be green at the end of every
> phase — never carry a red phase forward.

**Goal:** Replace clone-to-notify (`refreshSong()` / `refreshVsrg()`) with a reactive model, and
make the composer's playback path allocate essentially nothing per tick.

**Tech Stack:** Svelte 5 runes, TypeScript, PixiJS 8.19, Vitest, jsdom

---

## Why

The React → Svelte port introduced `refreshSong()` / `refreshVsrg()` (`song = song.clone()`) to
make mutations of a non-reactive class instance visible to Svelte. The React original never
cloned — it mutated in place and re-committed the same instance through `setState`. That single
substitution causes three families of problems:

1. **Orphaned references.** A clone rebuilds every column/hit-object with `.map()`, so any
   retained reference points at an object that is no longer in the song. Two vsrg call sites had
   grown hand-written "re-point by index" workarounds; the sites that had not were bugs (a hold
   note's tail applied to an orphan — and deleting the real note — and note toggles silently lost
   after the first).
2. **No renderer diffing is possible.** `columns`, `song` and `breakpoints` all get fresh
   identities on every refresh, so `ComposerRenderer.update()` cannot tell what changed. It is
   `this.state = state; this.draw()`, and `draw()` destroys and rebuilds every sprite in the
   visible window plus two Pixi renders — on every prop change.
3. **Allocation on the hot path.** `handlePlaybackTick` → `selectColumn` → `refreshSong()`, so
   playback deep-clones the whole song several times a second.

Measured on a synthetic song, 4 notes per column (throwaway vitest benchmark):

| song size | `ComposedSong.clone()` | full tail scan |
| --------- | ---------------------- | -------------- |
| 200 cols  | 0.08 ms                | 0.03 ms        |
| 800 cols  | 0.36 ms                | 0.07 ms        |
| 2000 cols | 0.82 ms                | 0.29 ms        |

The clone itself is modest; the object churn (~4 000 allocations per tick at 800 columns) and the
full sprite rebuild it forces are the real cost.

## Design decisions

**Few signals, grouped by change cadence — not one signal per field.** Svelte's deep proxy would
give per-property granularity for free, but it never proxies class instances, and the model is
classes whose methods (`serialize`, `clone`, static deserializers) serialization, conversion,
tests and the audio engine all depend on. Per-field `$state` on every leaf would mean three
signals per note (~24 000 on a large song) to buy something no consumer can use: the canvas
rebuilds a whole window at a time.

So: **scalars that different parts of the UI observe independently get their own signals; the
column/note graph gets one structure version**, read inside the getter so consumers are untouched:

```ts
get columns() { this.#structure; return this.#columns }
```

**Two mechanisms for two consumers.** The Svelte signal tells the _UI_ that something changed.
Plain monotonic counters per column (not signals — no proxies, no allocation) tell the _renderer_
what changed, so it can repaint one column instead of the window.

**The obligation moves from the page to the model.** A missed version bump is silently stale,
exactly like a forgotten `refreshSong()`. The difference is where it sits: today the _page_ must
remember after mutating someone else's data; here the model's own mutators bump it, and the
backing fields are private so nothing outside can mutate without going through a method.

**Only the playback path is worth optimizing.** Idle and editing are user-paced. During playback
the structure does not change at all — only `selected` increments — so the structure version
alone makes the tick path near-free. (Note entry is not gated on `isPlaying`, so structure _can_
change mid-playback from a keypress; that is user-paced and handled by the same check.)

### Signal inventory

| class                         | reactive                                                                   | plain                                       |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `Song` (base)                 | `name`, `bpm`, `pitch`, `id`, `folderId`                                   | `data`, `type`, `version`                   |
| `ComposedSong`                | `selected`, `breakpoints`, `instruments` (one signal), `#structure`        | `columns` array behind the structure getter |
| `NoteColumn`                  | —                                                                          | all; gains a plain `version` counter        |
| `ColumnNote`                  | —                                                                          | becomes plain data, not a class             |
| `InstrumentData`              | —                                                                          | covered by the single `instruments` signal  |
| `VsrgSong`                    | `name`, `bpm`, `pitch`, `id`, `folderId`, `#structure`, scalar song fields | `tracks` behind the structure getter        |
| `VsrgTrack` / `VsrgHitObject` | —                                                                          | all                                         |
| `RecordedSong`                | base scalars only                                                          | `notes` — playback hot loop, never observed |

## Global constraints

- Golden fixtures are ground truth and must stay byte-identical. They compare `serialize()`
  output, so any accidental shape change fails loudly. Never regenerate them to make a test pass.
- `serialize()` must return plain data — no `$state` proxies may reach IndexedDB. Return
  `[...this.array]` / `.map()`, never a reactive array reference.
- `$state` class fields compile to non-enumerable accessors. Nothing may enumerate a model
  instance. Audited today: persistence goes through `serialize()`; `Song.stripMetadata`'s
  `{...song}` operates on a _serialized_ object; no `cloneDeep` touches songs; `Object.assign`
  in the `set()` methods keeps working because it invokes setters. Keep it that way.
- No `any`, type assertions, non-null assertions, or TS suppression directives.
- Preserve LF line endings.

---

## Phase 0 — plain `ColumnNote`, mutations through the song

No reactivity yet. Pure refactor, fully covered by the golden fixtures.

**Files:** `src/lib/core/Songs/SongClasses.ts`, `ComposedSong.ts`, `RecordedSong.ts`,
`VisualSong.ts`, `src/lib/components/pages/Composer/Composer.svelte`,
`src/lib/components/pages/Composer/MidiParser/MidiParser.svelte`, `test/imports.ts`,
`test/primitives.test.ts`

- [ ] **Step 1: `ColumnNote` becomes plain data.** It has no logic left beyond `clone()`.
      Replace the class with a type; `clone()` becomes `{...note}`. Five value-usage sites:
      `NoteColumn.addNote`, `RecordedSong.toColumnNote`, `MidiParser.svelte`, `test/imports.ts`,
      `test/primitives.test.ts`.
- [ ] **Step 2: Fix the union discriminator.** `VisualSong.TempoChunkNote.from` uses
      `note instanceof ColumnNote`, which cannot survive step 1. Invert it to test the class that
      remains a class:
      `const held = note instanceof RecordedNote ? note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS : note.span > 1`.
- [ ] **Step 3: Route leaf mutations through `ComposedSong`.** Six sites in `Composer.svelte`
      reach into columns directly: `selectedColumn.addNote` ×2, `selectedColumn.removeNote` ×2,
      `setTempoChanger` ×2. Add `addNoteAt`, `removeNoteAt`, `setTempoChangerAt` (accepting one
      index or many) to `ComposedSong` and call those instead. Reads (`findNote`, `notesOfTrack`,
      `getTempoChanger`, `notes.forEach`) stay as they are. `MidiParser` builds columns for a
      _new_ song before it is live — construction, not mutation, so it needs no routing.
- [ ] **Step 4: Verify.** `npm run test:sky`, `npm run test:genshin`, `npm run check:sky`,
      `npm run lint`, `npx prettier --check src/`, `npm run build:sky`.

## Phase 1 — reactive `ComposedSong`

**Files:** `src/lib/core/Songs/Song.ts` → `Song.svelte.ts`, `ComposedSong.ts` →
`ComposedSong.svelte.ts`, every importer (~50 files import from `$core/Songs/*`; the specifier
gains `.svelte`, per the existing `Instrument.svelte.ts` precedent), `Composer.svelte`

- [ ] **Step 1: Signals.** Add the reactive fields from the inventory above. `#columns` becomes
      private with a `columns` getter that reads `#structure` first; every mutator bumps it.
- [ ] **Step 2: Per-column render counters.** `NoteColumn` gains a plain `version` number bumped
      by the song's mutators. Not a signal — the renderer compares it in Phase 4.
- [ ] **Step 3: Delete `refreshSong()`** and its ~30 call sites in `Composer.svelte`.
- [ ] **Step 4: Audit `serialize()`** for reactive arrays escaping into persisted output.
- [ ] **Step 5: Verify** (same command set as Phase 0, Step 4).

## Phase 2 — reactive `VsrgSong`

**Files:** `src/lib/core/Songs/VsrgSong.ts` → `VsrgSong.svelte.ts`, importers,
`src/routes/vsrg-composer/+page.svelte`

- [ ] **Step 1: Signals**, same shape as Phase 1: one structure version behind `tracks`, scalars
      separate, `VsrgTrack` / `VsrgHitObject` plain.
- [ ] **Step 2: Delete `refreshVsrg()`, `locateHitObject`, `resolveHitObject`** and the
      `HitObjectLocation` type. With no cloning, references cannot be orphaned — the whole bug
      class goes away rather than being guarded against.
- [ ] **Step 3: Route any remaining leaf mutations** through `VsrgSong` methods.
- [ ] **Step 4: Verify.**

## Phase 3 (R1) — composer renderer: pooling and window diffing

**Files:** `src/lib/components/pages/Composer/ComposerRenderer.ts`

- [ ] **Step 1: `ColumnView` + pool.** A view owns its background sprite, selection overlay,
      breakpoint marker, tail `Graphics` and note sprites. Keep `Map<columnIndex, ColumnView>`
      for what is on screen plus a free list. Columns leaving the window are _released_, not
      destroyed; entering columns are acquired and repainted by setting `.texture` / `.y` /
      `.alpha` / `.visible` on existing sprites, growing the sprite array only when a column
      needs more notes than the view already has. Tail `Graphics` get `.clear()` and redraw.
- [ ] **Step 2: Diff in `update()`.** Now meaningful, because identities are stable. Compare the
      structure version, `selected`, `currentLayer`, `breakpoints`, `selectedColumns`,
      `isRecordingAudio` and the settings-derived values. Structure unchanged + `selected` moved
      ⇒ shift the container, release/acquire the columns that left/entered, repaint the two
      backgrounds whose selection flag changed, move the timeline viewport, render. No content
      rebuild.
- [ ] **Step 3: Per-column tails.** Replace `computeTailsByColumn()`'s `0 .. visibleEnd` scan
      with `tailsForColumn(index)`, a backward scan bounded by the song's maximum span
      (`max(0, index - maxSpan + 1) .. index`), computed when a column is painted. Exact — no
      note can reach further than `maxSpan` columns — and it turns O(song) per draw into
      O(window + maxSpan) per entering column.
- [ ] **Step 4: Texture invalidation.** Theme, resize and cache regeneration change textures, so
      that path drops the pool and rebuilds.
- [ ] **Step 5: Verify**, plus a test asserting the steady-state playback tick allocates no new
      sprites (extend the `composerRenderLoop` fakes with construction counters).

## Phase 4 (R2) — fine-grained repaint

- [ ] **Step 1:** Repaint only the columns whose `version` counter differs from what the view
      last painted, instead of every visible column on a structure change.
- [ ] **Step 2: Verify.**

## Risks

| risk                                                | mitigation                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Non-enumerable `$state` accessors break enumeration | Audited (see constraints); re-audit after each phase                     |
| `$state` proxies reaching IndexedDB                 | `serialize()` returns plain data; Phase 1 Step 4 audits it               |
| ~50 import specifiers change                        | Mechanical; `check:sky` catches every miss                               |
| A missed version bump is silently stale             | Private backing fields — mutation is only possible through model methods |
| Reactivity in playback hot loops                    | `RecordedSong.notes` and the vsrg playback arrays stay plain             |
| `ColumnNote` `instanceof` discriminator             | Phase 0 Step 2 inverts it before the class disappears                    |
