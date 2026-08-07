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

| class                         | reactive                                                                                                                                                            | plain                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Song` (base)                 | `name`, `bpm`, `pitch`, `id`, `folderId`; `instruments` as `$state.raw`                                                                                             | `data`, `type`, `version`                   |
| `ComposedSong`                | `selected`, `#structure`; `breakpoints` as `$state.raw`                                                                                                             | `reverb`; `columns` array behind the getter |
| `NoteColumn`                  | —                                                                                                                                                                   | all; gains a plain `version` counter        |
| `ColumnNote`                  | —                                                                                                                                                                   | becomes plain data, not a class             |
| `InstrumentData`              | —                                                                                                                                                                   | covered by the single `instruments` signal  |
| `VsrgSong`                    | base scalars (phase 1); phase 2 adds `#structure`, `keys`, `duration`, `difficulty`, `snapPoint`, `audioSongId`, and `breakpoints`/`trackModifiers` as `$state.raw` | `tracks` array behind the getter            |
| `VsrgTrack` / `VsrgHitObject` | —                                                                                                                                                                   | all                                         |
| `RecordedSong`                | base scalars only                                                                                                                                                   | `notes` — playback hot loop, never observed |

`$state.raw` on the two arrays is a phase-1 remediation, not a second mechanism: it is the same
whole-array signal with the same public setter, minus the deep proxy, because the composer's
renderer indexes both per note on every draw and a proxied element read costs ~20x a plain one
(measured). The price is that their mutators must ASSIGN a new array — an in-place `push`/`splice`
publishes nothing at all. Same rule for `Composer.svelte`'s `selectedColumns`, the third array on
that draw path.

`VsrgSong` inherits `name`/`bpm`/`pitch`/`id`/`folderId`/`instruments` from `Song`, so those became
signals in phase 1. Phase 2 added `#structure` behind `tracks` plus the vsrg-only scalars (`keys`,
`duration`, `difficulty`, `snapPoint`, `audioSongId`) and made `breakpoints`/`trackModifiers`
`$state.raw` for the reason above — the composer indexes `trackModifiers[note.trackIndex]` per audio
note per playback tick, and the renderer walks `breakpoints` on every timeline draw.

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

- [x] **Step 1: `ColumnNote` becomes plain data.** It has no logic left beyond `clone()`.
      Replace the class with a type; `clone()` becomes `{...note}`. Five value-usage sites:
      `NoteColumn.addNote`, `RecordedSong.toColumnNote`, `MidiParser.svelte`, `test/imports.ts`,
      `test/primitives.test.ts`. _Done; the real count was nine — the two `.clone()` callers
      (`NoteColumn.clone`, `ComposedSong.pasteColumns`), the second `instanceof` discriminator in
      `NoteColumn.addNote`, and five import specifiers that `verbatimModuleSyntax` forces onto
      `import type`._
- [x] **Step 2: Fix the union discriminator.** `VisualSong.TempoChunkNote.from` uses
      `note instanceof ColumnNote`, which cannot survive step 1. Invert it to test the class that
      remains a class:
      `const held = note instanceof RecordedNote ? note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS : note.span > 1`.
- [x] **Step 3: Route leaf mutations through `ComposedSong`.** Six sites in `Composer.svelte`
      reach into columns directly: `selectedColumn.addNote` ×2, `selectedColumn.removeNote` ×2,
      `setTempoChanger` ×2. Add `addNoteAt`, `removeNoteAt`, `setTempoChangerAt` (accepting one
      index or many) to `ComposedSong` and call those instead. Reads (`findNote`, `notesOfTrack`,
      `getTempoChanger`, `notes.forEach`) stay as they are. `MidiParser` builds columns for a
      _new_ song before it is live — construction, not mutation, so it needs no routing.
      _Done, plus a seventh site the step missed: `song.columns = history` in `undo()`, now
      `restoreColumns()` (it re-clamps `selected` too). The new methods preserve the existing
      out-of-range semantics exactly — single-index forms throw, the multi-column form skips._
- [x] **Step 4: Verify.** `npm run test:sky`, `npm run test:genshin`, `npm run check:sky`,
      `npm run lint`, `npx prettier --check src/`, `npm run build:sky`.

## Phase 1 — reactive `ComposedSong`

**Files:** `src/lib/core/Songs/Song.ts` → `Song.svelte.ts`, `ComposedSong.ts` →
`ComposedSong.svelte.ts`, every importer (~50 files import from `$core/Songs/*`; the specifier
gains `.svelte`, per the existing `Instrument.svelte.ts` precedent), `Composer.svelte`

- [x] **Step 1: Signals.** Add the reactive fields from the inventory above. `#columns` becomes
      private with a `columns` getter that reads `#structure` first; every mutator bumps it.
      _Done. `instruments` is a `$state` field on `Song` (the base is where the field has always
      lived), which forced removing `RecordedSong`'s redundant `instruments` re-declaration — with
      `useDefineForClassFields` a bare subclass re-declaration defines an own property that shadows
      the prototype accessor and silently kills the signal. `reverb` was missing from the inventory:
      it stays plain, and now says so in a comment. Two mutators the page needed were added
      (`setInstrument`, `swapInstruments`) so `Composer.svelte` writes no song fields but the
      already-public signal scalars._
- [x] **Step 2: Per-column render counters.** `NoteColumn` gains a plain `version` number bumped
      by the song's mutators. Not a signal — the renderer compares it in Phase 4.
      _Done. The rule is in `ComposedSong.#touchColumns`: bump the whole range a changed note's
      span COVERS (union of old and new on a shrink), not just the column that owns it — a tail is
      drawn on every column it crosses. Bulk/structural mutators touch every column, which is what
      the Phase 3/4 consumer would end up repainting anyway._
- [x] **Step 3: Delete `refreshSong()`** and its ~30 call sites in `Composer.svelte`.
      _Done; the real count was 22 (the ~30 figure conflated them with `refreshVsrg()`'s 24 sites,
      which are Phase 2)._
- [x] **Step 4: Fix the two identity traps** found during Phase 0. Both are silent — nothing
      fails, the UI just stops updating — so handle them in the same commit that removes the
      clone, not afterwards:
  - `Composer.svelte:519` `popoverNote` is a `$derived` whose _value is the note object_, and
    the template reads `span={popoverNote.span}`. Today every `refreshSong()` hands back a
    freshly cloned note, so the derived's value changes by identity and re-notifies. With
    stable identity the derived re-runs (it reads the tracked `columns` getter) but its value
    is `===` to before, so it never propagates and the duration-popover slider freezes while
    the song updates correctly underneath. Derive the **span number**, not the note.
  - `MidiParser.svelte:276` assigns `song.columns = columns` and stops compiling the moment
    `#columns` goes private. It builds a song nothing observes yet, so it needs a
    construction entry point — `restoreColumns` fits — and must NOT be routed through a
    version-bumping mutator.

  _Done, plus three more. `restoreColumns` could not double as the construction entry point — undo
  needs it to bump and re-clamp `selected`, construction needs neither — so construction got its
  own non-bumping `initColumnsForConstruction` (named `initColumns` until Step 7; used by
  MidiParser, `clone()`, both deserializers and `RecordedSong.toComposedSong`, which was a third
  `song.columns =` site the plan did not list). (3) `ComposerCanvas`'s renderer `$effect` never
  read `song.instruments`; the roster reached the draw path only through `state.song.instruments`,
  i.e. implicitly, and only on runs that got that far. It is now its own prop and its own
  `ComposerRendererState` field, and the `song` field is gone from that interface entirely.
  (4) `restoreColumns` now defensively copies: the undo history is a `$state` array, so an entry
  read back out is a deep PROXY, and installing it as the live graph would have left `#columns`
  proxied for the rest of the session (the clone used to launder it). (5) `loadSong`/`createNewSong`
  now clear `undoHistory`/`copiedColumns` — pre-existing, but without the clone an undo after a
  load installs the previous song's columns into the new one and autosaves the result._

- [x] **Step 5: Audit `serialize()`** for reactive arrays escaping into persisted output.
      _Clean on every path (`[...this.breakpoints]`, `.map()` over columns/instruments, per-track
      literal arrays); verified with `structuredClone` over `serialize()`/`toOldFormat()` in a
      throwaway probe. The rule is now written above `ComposedSong.serialize`._
- [x] **Step 6: Verify** (same command set as Phase 0, Step 4).
- [x] **Step 7: Adversarial-review remediation.** Nine findings against Steps 1–6, all closed in
      one commit because two of them are ordering-coupled (see below).
  - **The composer's per-draw proxy cost.** Making `instruments` a plain `$state` field put a
    Svelte deep proxy on `ComposerRendererState.instruments`/`.breakpoints`, which the draw loops
    index per note and per column. `$state.raw` on `Song.instruments`,
    `ComposedSong.breakpoints` and `Composer.svelte`'s `selectedColumns` makes all three plain
    again with no renderer logic change; the contract is recorded on `ComposerRendererState`.
  - **`toggleBreakpoint` now publishes on its own** (assigns, no longer splices in place). This
    HAD to land with the `$state.raw` change, not after it: under raw, the in-place form
    publishes nothing at all, and the chained `validateBreakpoints()` would have hidden it.
  - **`removeInstrument` no longer double-publishes** — it inlined `eraseColumns`'s clearing pass
    instead of calling it and then bumping again, which advanced every column's `version` by 2.
  - `initColumns` → **`initColumnsForConstruction`**, and it copies defensively.
  - **No-op mutators publish nothing:** `removeNoteAt` (no such note), `setTempoChangerAt`
    (already that changer), `validateBreakpoints` (nothing to filter).
  - **`ComposedSong.clone()`/`RecordedSong.clone()` copy `reverb`** (and `timestamp`) —
    pre-existing data loss, load-bearing now that clone backs the undo history and the download
    path. No fixture moved. `VsrgSong.serialize()` spreads `data` like the other two.
  - **Two new gates**, both of which fail against the pre-remediation tree:
    `test/reactivePublish.test.ts` (a row per callable on `ComposedSong`: which signals fired,
    which columns' counters moved, plus reflective completeness so a phase-2/3/4 mutator cannot
    be added without a row) and `test/noProxies.ts`, called from `expectGolden` and from
    `test/serializePlain.test.ts`.
  - **Corrected comments** that asserted things that were not true: `addInstrument`'s
    "InstrumentControls compares by identity" (it keys on `name + i`), `validateBreakpoints` as
    toggleBreakpoint's publish path, and the vsrg page's header QUIRK.

- [x] **Step 8: Second adversarial-review remediation.** Seven findings that survived Step 7.
  - **The aliasing half of the `serialize()` rule now has a gate.** `test/noProxies.ts` only ever
    caught PROXIES, and after Step 7 nothing in the song model is deep-`$state` any more — so its
    watch set is empty and `breakpoints: this.breakpoints` (the live array into IndexedDB) passed
    all 271 sky tests. New `test/noAliasing.ts` asserts no object in a payload is REACHABLE from
    the model it came from — walking the model through property descriptors and prototype
    accessors, which is the only way a `$state` field is visible at all. `test/serializePlain.test.ts`
    runs both guards per entry point and, so a later phase cannot add a silent one, reflects the
    model classes' `serialize`-shaped surface and fails on any callable that has neither a row nor
    a documented "not a persistence path" reason. `noProxies.ts`'s docstring now says it is a
    dormant tripwire rather than claiming to watch `columns` and VsrgSong's `data`.
  - **The defensive copies in the two column-install methods are covered** (deleting either left
    the whole suite green): both are fed a real proxied array, as `Composer.svelte`'s `$state`
    undo history produces, and must install a plain one.
  - **`RecordedSong.toComposedSong` appends in O(1) again** through a new construction-only
    `ComposedSong.appendColumnsForConstruction`. Step 7 had routed it through the public
    `addColumns`, i.e. a touch-every-column pass plus a bump per appended column, inside a
    triple-nested loop: measured 52.7 ms vs 4.2 ms on a 4 864-column import.
  - **`test/reactivePublish.test.ts` observes all eight reactive fields**, not the four it listed
    while claiming to be an exact set (a mutator that also wrote `name` passed; verified).
  - **Composer.svelte's `toggleBreakpoint` no longer chains `validateBreakpoints()`** — guaranteed
    a no-op since `ComposedSong.toggleBreakpoint` guards its index. Its one remaining caller
    (`deleteColumns`) carries the reason.
  - **Corrected comments** again: the vsrg page's per-branch QUIRK (the `bpm` branch DOES publish
    — `refreshVsrg()` is there for the canvas, whose `$effect` reads the `vsrg` prop rather than
    `.bpm`, and whose renderer diffs `previous.vsrg.bpm !== next.vsrg.bpm`, impossible on a stable
    instance) and `configSurface`'s "functions drop in JSON" (structuredClone would refuse them).

- [x] **Step 9: Third adversarial-review remediation.** Six findings, one of them a real regression.
  - **A stale breakpoint could reach IndexedDB, and Step 8's removal of a caller-side
    `validateBreakpoints()` was justified by a false claim.** The root cause was never that call:
    `restoreColumns` (undo) shrinks the column array without validating, `deleteColumns` left the
    job to its one caller, and `deserialize` only filtered `Number.isFinite`. Now every path that
    shrinks the live column array validates inside `ComposedSong`, `deserialize` validates once the
    columns exist, and `toggleBreakpoint` refuses any index `validateBreakpoints` would filter —
    one predicate, `#addressesColumn`, instead of two notions of a valid breakpoint. Three
    behaviour tests in `composedSong.test.ts` (all three red before the fix) plus three publish
    rows.
  - **`test/serializePlain.test.ts` derives its class list** from `src/lib/core/Songs` via
    `import.meta.glob` instead of hardcoding ten classes, and every exported class needs a registry
    entry with a live INSTANCE (arrow-field `serialize`s exist on no prototype). `NoteLayer`'s five
    serialize-shaped callables are classified. Verified against the reviewer's probe: a
    `serializeBrandNewPersistencePath()` on `NoteLayer` now fails, and so does a new exported class.
  - **`clone()` is gated** by `assertNoSharedState` (`noAliasing.ts`), which walks BOTH instances
    the way the model side was already walked — the payload walk cannot see into a class instance,
    which is why aliasing a clone's `breakpoints` failed nothing.
  - **`findAlias` reports the SHALLOWEST match, and now says so** — the opposite of `noProxies`'
    deepest-match walk, because uncloneability propagates to a container and "is a live model
    object" does not, so the outermost match is the boundary where sharing begins.
  - **One reflection helper** (`test/reflect.ts`) for the two gates that had a copy each.
  - **Corrected comments** yet again: `initColumnsForConstruction` copies for OWNERSHIP (no caller
    hands it a proxy — only `restoreColumns` is handed one), and the composer's `toggleBreakpoint`
    wrapper no longer claims a chained cleanup would be a no-op.

## Phase 2 — reactive `VsrgSong`

**Files:** `src/lib/core/Songs/VsrgSong.ts` → `VsrgSong.svelte.ts`, 26 importer specifier lines,
`src/routes/vsrg-composer/+page.svelte`, `VsrgComposerRenderer.ts`, `VsrgComposerCanvas.svelte`,
`VsrgTop.svelte`, `VsrgTrackSettings.svelte`, `VsrgComposerMenu.svelte`, `TrackModifier.svelte`,
`VsrgPlayerStore.svelte.ts`, `test/reactivePublish.test.ts`; step 5 adds
`vsrgSongRenderState.ts`, `test/vsrgComposerRenderer.test.ts` and `test/vsrgSong.test.ts`

- [x] **Step 1: Signals**, same shape as Phase 1: one structure version behind `tracks`, scalars
      separate, `VsrgTrack` / `VsrgHitObject` plain.
      _Done. `keys`/`duration`/`difficulty`/`snapPoint`/`audioSongId` are `$state`;
      `breakpoints`/`trackModifiers` are `$state.raw` (both are indexed per element on a hot path);
      `#tracks` is private behind a `tracks` getter that reads `#structure`. Two additions the step
      did not list: a public `structureVersion` getter, because the renderer has to DIFF the graph
      rather than just subscribe to it, and a construction-only `initTracksForConstruction`
      (`deserialize`/`clone` both installed `tracks` wholesale). `set()`'s parameter is now an
      explicit `VsrgSongPatch` instead of `Partial<VsrgSong>` — `Object.assign` onto the getter-only
      `tracks` throws at runtime where TypeScript sees nothing._
- [x] **Step 2: Delete `refreshVsrg()`, `locateHitObject`, `resolveHitObject`** and the
      `HitObjectLocation` type. With no cloning, references cannot be orphaned — the whole bug
      class goes away rather than being guarded against.
      _Done, all 21 call sites (not the ~24 estimated). But "the whole bug class goes away" was only
      half true, and the wrong half: `refreshVsrg()` also NULLED any retained reference whose hit
      object had been DELETED, which has nothing to do with cloning. That job is now
      `forgetRemovedHitObjects()`, called from the seven paths that remove hit objects, plus
      `forgetHitObjectsOfPreviousSong()` on the two that swap songs (pre-existing bug: a key held
      across a song load left a foreign hit object in `pressedDownHitObjects`, which
      `setHeldHitObjectTail` then applied to the new song)._
- [x] **Step 3: Route any remaining leaf mutations** through `VsrgSong` methods.
      _Done: `setTrack`, `setTrackModifier(index, patch)`, `moveHitObject`, `toggleNoteInHitObject`,
      `extendHeldHitObject`, `containsHitObject`. `TrackModifier.svelte` now reports a PATCH instead
      of mutating the song's modifier in place. `extendHeldHitObject` is the one mutator that
      deliberately publishes nothing — it runs per frame while a key is held during playback, and
      the canvas already redraws on its own tick — pinned by a `publishes: []` row rather than left
      implicit._
- [x] **Step 3b: The renderer diff, which had to land BEFORE step 2.** `needsSizes` compared
      `previous.vsrg.bpm !== next.vsrg.bpm` and `needsCache` compared
      `previous.vsrg.tracks[i].color` — both only ever worked because the two states held two
      different clones. `VsrgComposerRendererState` has no `vsrg` field any more (the shape
      `ComposerRendererState` took in Phase 1 Step 7): the canvas's `$effect` reads
      `keys`/`bpm`/`duration`/`breakpoints`/`tracks`/`trackColors`/`structure` off the song and
      hands those over, so the diff compares two moments and the effect's dependency set is
      explicit rather than "whatever that draw happened to reach".
- [x] **Step 3c: Identity traps**, the same class as Phase 1 Step 4's `popoverNote`. Verified
      against a mounted component rather than reasoned about: a prop expression or snippet argument
      that reads `vsrg.tracks[i]` re-renders on a structure bump, while a `$derived`, a `{@const}`
      or an `{#each}` item binding holding the same object does NOT (all three are identity-
      compared). `VsrgTop`'s `currentTrack` derived is gone, the track list iterates indexes, and
      the mini keyboard's highlight is a `$derived` that reads `tracks` unconditionally and returns
      a fresh array. `VsrgSong.setTrackModifier` installs a NEW modifier for the same reason.
- [x] **Step 4: Verify.** All six gates green; no fixture moved. `test/reactivePublish.test.ts`
      gained a VsrgSong section (46 mutator rows + 11 reader rows + its own reflective completeness
      check — it was ComposedSong-only, so a missing bump on the vsrg side was ungated), plus a
      non-DOM regression test for the derived-identity rule. Two clone() data-loss fixes found by
      the persistence audit: `VsrgTrackModifier.clone()` dropped `alias` and `VsrgSong.clone()`
      dropped `snapPoint`, both on the cross-game conversion path (`toOtherGame` converts through
      `clone()`).
- [x] **Step 5: Adversarial-review remediation.** Five findings against steps 1–4.
  - **The step-3b renderer diff has a gate now** — it was the phase's own highest-risk change and
    shipped with none.
    The canvas's local `songState()` moved out to `vsrgSongRenderState.ts` (`captureVsrgSongState`,
    pixi-free so the component may import it at runtime), and `test/vsrgComposerRenderer.test.ts`
    drives the real renderer over a fake pixi: a table of eight changes against ONE stable VsrgSong
    (bpm, keys, orientation, an in-place track recolour, a track add, scaling, a structure-only edit,
    and nothing-changed) asserting which recalculation each reaches, plus a field-list-independent
    half — nothing in a capture may be reachable from the song except `tracks` and `breakpoints`,
    each exempted by name with the property that earns it asserted separately. Reintroducing the
    `state.vsrg` shape fails four rows and the aliasing check; with that shape in place and only this
    file removed, the other 37 sky test files still pass (measured).
  - **The vsrg page's own two draw-path arrays are `$state.raw`** — `snapPoints` and
    `renderableNotes`, both walked in full per draw. Phase 1 step 7 fixed the composer's three and
    phase 2 fixed the model's two; these were the ones nobody audited. Rest of that path re-checked:
    `tracks` is the private plain array, `trackColors` is built fresh, and the remaining props are
    scalars or class instances (which Svelte's proxy never wraps).
  - **The two clone() data-loss fixes are covered**, as the vsrg counterpart of
    `composedSong.test.ts`'s conversion rule rather than as two field assertions:
    `clone().serialize()` must equal `serialize()`, and `toOtherGame` must carry everything outside
    `data`/`tracks` plus every track colour and hit-object placement. Both fail if either field is
    re-dropped.
  - **`deleteTrack`'s out-of-range behaviour is a decision now.** The guard added in step 1 changed
    it: the old bare `splice(index, 1)` deleted the LAST track for a negative index and published on
    an index past the end. Kept as changed (splice semantics leaking through a method whose only
    caller passes the index it rendered), stated at the declaration, and pinned by two publish rows
    and three cases in `test/vsrgSong.test.ts`.
  - **Corrected comments** once more, all of the same over-claiming kind: `#tracks` called "the
    enforcement mechanism" while the `tracks` getter hands out a live array; `#bumpStructure`
    claiming one non-bumping exception; `#createHitObject`'s "publishes nothing" for a path that
    bumps; a `serialize()` comment citing a scenario `toOtherGame` cannot produce here; "never in an
    `$effect`/`$derived`" for the player, which omits the `untrack()` that is the actual reason;
    `VsrgTrackModifier.clone()` calling the same bug invisible and visible in one sentence; and
    "identity never changes" for `tracks`/`structure`, which is false across a song swap.

- [x] **Step 6: Fourth adversarial-review remediation.** One systematic defect and three findings.
  - **The comment sweep, done as one pass over every file in this architecture** rather than as
    per-file patches, which is why the same defect had come back in six consecutive rounds: each
    round fixed the file it touched and left the identical claim standing in the twin. The rule
    applied uniformly: no `always`/`never`/`impossible`/`guarantees` unless something mechanically
    enforces it (and then name the enforcer), never a COUNT of exceptions (enumerate them or state
    the rule without counting), describe what the code DOES over what it guarantees about the rest
    of the system, and no comment may contradict another in the same file or the code below it.
    `ComposedSong` and `VsrgSong` now carry the same class header, the same `columns`/`tracks`
    getter contract ("an outside push/splice publishes nothing, so consumers keep working from what
    they last read" - no longer contradicting `extendHeldHitObject`, which says the canvas redraws
    on its own tick) and the same `#bumpStructure` docstring, which names the non-publishers by
    category instead of counting them. The counted claims that were false when read: `#installBreakpoints`
    as "the ONE place breakpoints is assigned" (`deserialize` and `set()` assign it too), `set()`'s
    "`tracks` is the one field Object.assign cannot reach" (`structureVersion` is getter-only as
    well), `setTrack`'s "it ALWAYS bumps" (its own guard returns early), `SongClasses`'s "only
    `#touchColumns` bumps `version`" (`#touchAllColumns` does, by a different rule), and the vsrg
    render-state's "`breakpoints`' one installer". Also swept: the two renderers' "the ONLY way
    state reaches this class" (theme has its own subscription), `ComposerCanvas`'s "the object is
    built unconditionally" followed by the explanation that it is not, and the "exactly bpm, pitch
    and reverb" songSetting list.
  - **The vsrg renderer's DRAW branch is observed now.** `test/vsrgComposerRenderer.test.ts` counted
    `resize` (sizes) and `generateTexture` (cache) but nothing for `draw()`, the third branch of
    `update()` - the one that guards the diff this phase actually shipped. A pixi Container clear is
    done by the draw path and nothing else, so the fake counts those; every row of the table now
    pins `draws` too. Verified by gating `draw()` on `previous.tracks !== state.tracks` - the
    identity comparison through a stable song that is this file's whole bug class: the
    structure-only and nothing-changed rows fail.
  - **The snapshot half states its two limits** instead of claiming field-list-independence
    generally: it sees OBJECT identity (a value cannot be a view onto the song, and nothing there
    says a captured value is the right one), and it sees `captureVsrgSongState`'s own return value
    (a field the canvas puts on the renderer state directly is invisible to it - that rule lives in
    the canvas's `$effect` docstring).
  - **`vsrgPlayerStore.keyboard` is `$state.raw`**, the same rule as the composer's arrays:
    `VsrgPlayerRenderer.validateHitObjects` does `keyboard[ro.hitObject.index]` then `key.isPressed`
    per renderable hit object per frame. The rule is stricter here because a keypress IS an in-place
    edit: `setLayout`/`pressKey`/`releaseKey` assign a new array, and press/release also install a
    NEW `KeyboardKey` at the touched index, because `VsrgPlayerKeyboard`'s `{@const}` per key is an
    identity-compared derived. Cost: one small array plus one object per keypress (user-paced)
    against per-frame proxy traps. Three rows in `test/vsrgPlayerStore.test.ts`, all three red
    against the in-place forms.

- [x] **Step 7: Fifth adversarial-review remediation.** Three holes in gates the previous rounds had
      added — a guard that is trusted and has a hole is worse than no guard — and seven accuracy
      fixes.
  - **The draw observation distinguishes WHAT was drawn.** Step 6 collapsed the clears of all three
    scene containers into one boolean, so a wrong gate added _inside_ the draw branch — the bug class
    the observation exists for — stayed invisible. The fake now counts clears per container and the
    harness identifies the three by what `init()` does to each (the timeline is the one it subscribes
    to pointer events, the tracks are interactive with no listeners, the keys are what is left), so a
    z-order reorder cannot silently relabel a column. Measured both ways with one regression in
    place (`draw()` repainting the tracks only when `state.tracks` moves by identity): the collapsed
    form passed all 12 tests, the per-scene form fails 9.
  - **`snapPoint` has a row.** The RECALCULATIONS table pinned three of `needsSizes`' four inputs and
    both of `needsCache`'s; deleting `previous.snapPoint !== next.snapPoint` passed the whole suite.
    Table re-derived from the two predicate bodies rather than from the rows already there — that was
    the only gap. With the row, deleting that comparison fails exactly one test and nothing else.
  - **`test/vsrgPlayerStore.test.ts` names the test that carries the weight.** The docstring credited
    the subscriber test with failing on an in-place key edit; it does not. Measured: with the array
    still assigned and the `KeyboardKey` mutated, only _'a press installs a new array AND a new key'_
    fails; with the array assignment removed too, the subscriber test joins it. Both halves are now
    described by the regression each one catches.
  - **The draw-branch observation no longer borrows its justification from phase 3 step 2**, which
    scopes to `ComposerRenderer.ts` and will not touch this renderer. Corrected in the test header,
    in `vsrgSongRenderState`'s `structure` docstring and in step 5/6 above; the observation stands on
    guarding the diff that exists today.
  - **Corrected comments**, the same over-claiming kinds as every round before: the vsrg renderer's
    `update()` counting its non-prop inputs (the composer twin states the same thing without a count,
    and the count was wrong); a cross-reference to a rule that was not at the location it named (the
    rule — song values reach the renderer state through `captureVsrgSongState`, not spliced in beside
    the props — is now in `VsrgComposerCanvas.svelte`'s `$effect` docstring, where the test says it
    is); `#bumpStructure` naming three methods as skipping the bump on a no-op when one of them does
    not, where its `VsrgSong` twin names none; the leaf-graph section header asserting one
    out-of-range behaviour for "the single-column forms", contradicted by `setNoteSpan` in the same
    section; "MUTATORS address `#columns`/`#tracks` directly", which both twins overstated (the
    construction paths go through the getter) — now scoped to mutators of the LIVE graph in both; and
    the vsrg page's "they all are" about the song's fields being signals, contradicted three lines
    below in its own comment block.

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

| risk                                                | mitigation                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Non-enumerable `$state` accessors break enumeration | Audited (see constraints); re-audit after each phase                                                |
| `$state` proxies reaching IndexedDB                 | `serialize()` returns plain data; Phase 1 Step 5 audits it, `test/noProxies.ts` keeps it that way   |
| A serialized payload aliasing the live song         | `test/noAliasing.ts` per entry point, plus a reflective check that a new serialize path gets a row  |
| ~50 import specifiers change                        | Mechanical; `check:sky` catches every miss                                                          |
| A missed version bump is silently stale             | Private backing fields, plus `test/reactivePublish.test.ts` — one row per callable, exact-set       |
| A renderer diffing a field through the live song    | `test/vsrgComposerRenderer.test.ts` — recalculation table on one stable song + no-aliasing capture  |
| An in-place edit of a `$state.raw` array is silent  | The rule is written on each of the three fields; nothing in `src/` or `test/` mutates them in place |
| Reactivity in playback hot loops                    | `RecordedSong.notes` and the vsrg playback arrays stay plain                                        |
| `ColumnNote` `instanceof` discriminator             | Phase 0 Step 2 inverts it before the class disappears                                               |
