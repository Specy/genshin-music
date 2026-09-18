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

**Files:** `src/lib/components/pages/Composer/ComposerRenderer.ts`, `ComposerCanvas.svelte`,
`Composer.svelte`, `src/lib/core/Songs/ComposedSong.svelte.ts`, `test/reactivePublish.test.ts`,
`test/composerRenderLoop.test.ts`; step 5 adds `test/composerRenderer.test.ts`

- [x] **Step 0 (not in the plan, needed by step 2): `ComposedSong.structureVersion`.** `VsrgSong`
      grew a public `structureVersion` getter in phase 2 for exactly this reason and its twin did
      not, so the composer diff had no scalar to compare — only `columns`, whose identity phases 0–1
      made STABLE within a song. Added in the twin's shape. A getter with no setter is invisible to
      both reflective completeness gates (`instanceCallables` keeps function-VALUED descriptors,
      `reactiveFieldNames` keeps get+set pairs), so `test/reactivePublish.test.ts` carries a
      hand-written section covering BOTH classes' getters — reading publishes nothing and touches no
      column counter, it moves on a graph mutation and not on a scalar one, reading it subscribes,
      and two fresh instances both read 0 (the reason the columns identity is diffed beside it).
- [x] **Step 1: `ColumnView` + pool.** A view owns its background sprite, selection overlay,
      breakpoint marker, tail `Graphics` and note sprites. Keep `Map<columnIndex, ColumnView>`
      for what is on screen plus a free list. Columns leaving the window are _released_, not
      destroyed; entering columns are acquired and repainted by setting `.texture` / `.y` /
      `.alpha` / `.visible` on existing sprites, growing the sprite array only when a column
      needs more notes than the view already has. Tail `Graphics` get `.clear()` and redraw.
      _Done. Three additions: the overlay and breakpoint marker are FLATTENED to siblings of the
      background rather than its children (same draw order, since pixi renders children in array
      order — the nesting only existed to force that order, and it logged a v8 deprecation); views
      are inserted with `addChildAt` at their sorted position, so the pooled scene graph is the same
      tree a full rebuild would build rather than merely a visually equivalent one; and `paint()`
      writes every property it owns unconditionally, which is what makes a reused view safe._
- [x] **Step 2: Diff in `update()`.** Now meaningful, because identities are stable. Compare the
      structure version, `selected`, `currentLayer`, `breakpoints`, `selectedColumns`,
      `isRecordingAudio` and the settings-derived values. Structure unchanged + `selected` moved
      ⇒ shift the container, release/acquire the columns that left/entered, repaint the two
      backgrounds whose selection flag changed, move the timeline viewport, render. No content
      rebuild.
      _Done, with four corrections to the list above. (1) `instruments` is a diffed field too — it
      decides note textures, stranded dimming and which tails draw, and no structure bump
      accompanies an instrument edit. (2) The structure version alone cannot see a song swap (a
      freshly loaded song sits at 0), so the `columns` array identity is compared beside it. (3)
      `settings` is GONE from `ComposerRendererState`, replaced by `beatMarks` and
      `columnsPerCanvas` scalars: the settings object's identity never moves on an edit, so a diff
      could not have seen `beatMarks` — and worse, it reached the draw path only through a read
      inside `update()`, so the first skipping run would have dropped it from the canvas $effect's
      dependency set entirely. Same reasoning retired the live `ThemeProvider.get('accent')` read in
      the draw loop, now captured in `handleThemeChange` beside the other theme values. (4) The
      left-hand side of the diff is the last state that ACTUALLY PAINTED, not the last state
      received: a run that painted nothing (no cache yet, recording audio) records no baseline, so
      the next paintable one rebuilds. Also: the "backgrounds whose selection flag changed" are in
      practice two overlay sprites toggled — selection never touched the background texture — and an
      update where nothing observable moved now returns without rendering at all._
- [x] **Step 3: Per-column tails.** Replace `computeTailsByColumn()`'s `0 .. visibleEnd` scan
      with `tailsForColumn(index)`, a backward scan bounded by the song's maximum span
      (`max(0, index - maxSpan + 1) .. index`), computed when a column is painted. Exact — no
      note can reach further than `maxSpan` columns — and it turns O(song) per draw into
      O(window + maxSpan) per entering column.
      _Done as `paintTails(graphics, index, sizes)`, which draws straight into the pooled Graphics —
      the `TailSegment` intermediate is gone. `maxSpan` does not exist on `ComposedSong`
      (`maxSpanAt` is a different quantity) and is cached on the renderer against the (columns
      identity, structure version) pair: O(notes) once per structural edit, never during playback.
      The second O(song) walk the step did not mention is gone too — `drawNotesStage` iterated the
      whole column array and filtered with `isColumnVisible` inside the callback; it now indexes the
      window range, derived in closed form and pinned against `isColumnVisible` by test._
- [x] **Step 4: Texture invalidation.** Theme, resize and cache regeneration change textures, so
      that path drops the pool and rebuilds.
      _Done in `recalculateCacheAndSizes`, which destroys both halves of the pool (the free list is
      parked outside the scene graph, so `app.destroy({children: true})` would not have reached it —
      `destroy()` drops the pool for the same reason) and nulls the paint baseline with it. Views are
      destroyed rather than released because the geometry changed as well as the textures, and the
      previous cache's textures are destroyed 500ms later._
- [x] **Step 5: Verify**, plus a test asserting the steady-state playback tick allocates no new
      sprites (extend the `composerRenderLoop` fakes with construction counters).
      _All six gates green; no fixture moved. New `test/composerRenderer.test.ts` instead
      of extending `composerRenderLoop`, which deliberately never generates a cache — its numbers are
      render-call counts, and measuring on top of it reads 0 for everything. Three halves: a
      repaint table over one stable song (a row per kind of change, including "nothing changed" and
      "only isPlaying changed" at zero renders); an equivalence half asserting the scene an
      incremental path left is the scene a full rebuild paints, down to the tail rectangles, with the
      drawn window re-derived from the exported `isColumnVisible` on every row; and the absolute
      tests the other two structurally cannot make (a span starting far off-screen, a span grown
      after the first paint, the allocation claim, cache regeneration, teardown). Twenty sabotages
      were run one at a time against it; each fails at least one test. **Step 6 below replaced the
      equivalence half's reference and added a content half — see there for what this one missed.**
      Measured before/after on one 800×4 song, back to
      back: 276 pixi nodes constructed and 276 destroyed per playback tick → 0 and 0; `column.notes`
      reads per tick 119 at column 60 rising to 839 at column 780 → a constant 5; ms per update()
      0.075→0.095 across a playthrough and 0.072/0.099/0.157 at 200/800/2000 columns → 0.005–0.008,
      flat in both._

- [x] **Step 6: Sixth adversarial-review remediation.** Step 5's tests counted EVENTS (how many
      renders, paints, views created/destroyed) and never asserted CONTENT, which is the wrong shape
      of guard for a pool whose failure mode is a reused view showing the previous occupant's
      pixels. The two structural findings, then the smaller ones.
  - **The equivalence part's reference was not independent.** It produced its "full rebuild" by
    toggling `isRecordingAudio` on the SAME renderer — and `drawNotesStage` deliberately neither
    releases nor destroys the pool while the stage is hidden, so that rebuild repainted through the
    very views the incremental path had just left behind. Any property `paint()` failed to write was
    stale identically on both sides and compared equal. Measured: with `ColumnView.paint` no longer
    hiding the note sprites a shorter column does not need — the pool's textbook bug — the whole
    file still passed. The reference is now a SECOND ComposerRenderer mounted at the same final
    state, with its own pool and its own ComposerCache; textures compare across the two caches
    because the scene names them by cache SLOT (`standardLarger[1]`, `notes[3]`) rather than by
    object. That same naming is what lets the content part state which slot it expects.
  - **Nothing asserted WHAT was painted.** New content part: `expectedWindow()` states the drawing
    rules from the song and the props — background slot per column (bar-group alternation, the
    every-4th larger variant, tempo-changer columns), overlay texture and alpha, breakpoint marker,
    one note sprite per non-zero layer-status row at that row's y with stranded rows dimmed, and
    every tail rectangle — and a table of scenarios drives the renderer INCREMENTALLY (playback
    ticks, scrolls, edits, a hidden instrument, a stranded row, a song swap) before comparing. The
    tail reference scans the whole song from column 0 where the renderer scans backwards from
    `maxSpan`, so a wrong bound is a difference rather than a shared blind spot. Content sabotages
    were run one at a time — note texture, note y, stranded alpha, tail colour, tail alpha, tail
    stub geometry, hidden-instrument tails, background variant, overlay branch, breakpoint marker,
    bar grouping, each half of the maxSpan cache key, and the stale-sprite bug above — and each
    fails at least one test that passes without it.
  - **The tail scan bound has a case at its exact edge** — a note whose span is the song's longest
    and whose LAST covered column is the one being painted starts at precisely `index - maxSpan + 1`,
    so `first + 1` drops the final bar of every maximum-length span. And **the maxSpan cache's
    `columns`-identity half has one**: a swap to a different song built to the same
    `structureVersion`, where a version-only key would keep the previous song's bound.
  - **The allocation test has a witness.** It asserted only that the construction counters were
    zero, which is also what a renderer that painted nothing produces; every measured tick now
    asserts `renders=1, columnPaints=1` and the window it arrives at is checked against the rules.
  - **A theme edit reaches the pool as one repaint.** `handleThemeChange` replaces `this.theme`
    synchronously while the repaint is behind `recalculateCacheAndSizes`' 50ms debounce, so an
    update() in that window painted an ENTERING column's tails in the new accent beside a window
    still in the old one. `paintTails` now reads `paintTailAccent`, a copy that moves with the
    repaint; pinned by a test that fails against the old field.
  - **Corrected comments**, the same over-claiming kinds as every round before: the file header's
    "diffs the state it was handed last time", which is the rule the code deliberately does not use
    and contradicted `paintedState`'s own docstring; a cross-reference to `cacheEpoch`, an
    identifier that exists nowhere; the "`columns` only ever changes identity across a song swap"
    claim wherever it appeared — `needsFullRepaint`, `ComposerRendererState`,
    `ComposerCanvas.svelte`'s `structureVersion` prop and `test/reactivePublish.test.ts`
    (`restoreColumns` and `deleteColumns` install a new array within one song; no behavioural
    consequence, since a moved identity forces the safe direction, but the stated reason for the
    pair was false), the last of which also credited `VsrgSongRenderState` with a diff its own
    docstring says does not exist;
    `Composer.svelte`'s BEHAVIOR NOTE claiming the canvas still repaints when `isPlaying` flips
    (phase 3 excludes it from the diff); `ComposerCanvas.svelte`'s "every value the canvas draws
    from is read here", contradicted by its own closing parenthetical about the theme channel; and
    a wrong count of `inPreview`'s call sites.

- [x] **Step 7: Seventh adversarial-review remediation.** Step 6 gave the guards a CONTENT reference,
      but that reference read a SUBSET of what decides a pixel, and everything outside the subset fell
      back to "two renderers agree" - which cannot see a defect both renderers share. An 18-mutation
      sweep found ten blank-or-displace-the-canvas mutations that passed all 464 tests (a released
      view left hidden or at alpha 0 and never restored on reuse, the notes container scrolled 5
      columns off, note icons a column right, the breakpoint marker off the bottom of its column, the
      selection overlay at the wrong x, transparent tail bars, every timeline breakpoint stacked at
      x=0, the viewport 3x too wide, the viewport x offset, the canvas forced to opacity 0), plus two
      catches that fired only accidentally, through non-vacuity assertions inside unrelated tests.
  - **One description of the scene, and it holds what decides a pixel.** The equivalence half and the
    content half read the same `paintedScene()` now, so what it carries is what either can see: for
    every child of a pooled view and of the timeline, the cache slot its texture came from, its x,
    its y, its alpha and whether it is shown; plus the placement and presentation of the containers
    they hang off and the notes canvas' CSS opacity. The limits are written down rather than implied
    (a hidden object's contents, pixi state the fakes do not model, and pixels themselves).
  - **The timeline has an absolute reference at all**, where it had only two-renderers-agree: its
    background, tools-selection band, breakpoint markers and viewport outline are stated from the
    song and the props, and compared on every content row. The canvas width they need comes from the
    renderer's own `onGeometryChange` - the channel the Svelte template takes it from - and the
    strip height off the ComposerCache's props, rather than by re-deriving `computeCanvasSize`.
  - **The notes container's scroll offset is derived, not just cross-checked.** Both copies of
    `(selected - columnsPerCanvas / 2 + 1) * -columnWidth` used to be compared only against each
    other; the reference now states the placement from `selected`, `columnsPerCanvas` and the cache's
    column width, in the terms `handleClickStageUp` inverts it in.
  - **`ColumnView.paint` writes the container's `y`, `alpha` and `visible`** beside its `x`. Nothing
    writes them elsewhere today, so this is a write of the value they already hold - which is the
    point: the property the pool's safety rests on now holds for the object the pool is keyed on, and
    a release that starts hiding or fading a view needs no matching restore added elsewhere.
  - **The two accidental catches are intentional:** the stage's own `visible` and the background
    sprite are part of the description, with `visible: true` and a named cache slot stated as rules.
  - **`applyNotesCanvasOpacity` is in scope after all** - the canvas' CSS opacity is a DOM style
    rather than part of the pixi scene, so it is read off the canvas element beside the scene and
    stated from ThemeProvider, and both files say so at the place a reader would look.
  - **Sweep re-run against the fixed guards:** all eleven named mutations now fail (S2 and S15 in the
    8 scenarios that recycle a view, the rest in 14-18 tests each), as do both accidental catches,
    and the no-mutation control stays green.
  - **Corrected comments**, the same over-claiming kinds as every round before: `ColumnView`'s
    "writes EVERY property it owns" while `visible`/`alpha`/`y` were never written, and its counted
    "the one thing paint() does not touch"; the `Scene` type's "compare equal iff the two scenes
    render alike", which was false for anything outside the description; `drawSelectedMoved`'s "those
    four things" after naming three, and "are all that is touched here" four lines above a release
    pass; `update()`'s count of the fields that change no pixel (and its omission of
    `columnsPerCanvas`); `ComposerCanvas.svelte`'s "EVERY REACTIVE VALUE THE CANVAS DRAWS FROM IS READ
    HERE", contradicted by its own next sentence and by the three theme `$derived`s in the same file;
    and the test header's fourth bullet, a name-list presented as covering the rest.

- [x] **Step 8: Eighth adversarial-review remediation.** Step 7 widened the scene description DOWNWARD,
      into the children of a column view, but not UPWARD to the roots those children hang off - and
      three of the values the reference compared against were BORROWED FROM THE RENDERER's own
      self-report, so a defect in one of them was endorsed rather than caught. One coherent class.
  - **A borrowed reference value is worse than a missing one**, because it reads as coverage. The
    sharpest case needed no test scenario at all: `geometry.columnWidth` was read off the
    ComposerCache the renderer had just built, so doubling `computeCanvasSize`'s
    `nearestEven(width / columnsPerCanvas)` - which shows 10 columns of a 20-column setting with the
    playhead pinned to the right edge - left every comparison stated in terms of that same doubled
    width, and all 464 tests passed. The harness derives it now, from the reported width by the rule
    the renderer states, and asserts the derivation and the cache AGREE so a divergence is a failure
    rather than a silent substitution. Same treatment for the row height (`height /
NOTES_PER_COLUMN`).
  - **The canvas DIMENSIONS are pinned.** `canvasWidth` is what the renderer reports through its own
    `onGeometryChange`, and nothing checked the canvas it actually SIZED matched - a full-width scene
    onto a half-width canvas passed. The resize mock records every call, and geometry() compares both
    canvases' widths against the reported one and both heights against what the cache was handed. The
    remaining limit is stated where it lives: this file does not re-derive `computeCanvasSize`, so a
    size wrong the same way in all three places is outside what it sees.
  - **Both Application stages and the timeline's content container are in the description.** It was
    rooted one level too low, at `notesColumnsContainer` and at the timeline's children, so hiding,
    fading or displacing the root of either pixi scene graph passed with every child of it still
    reading correct. All three are recorded (x, y, alpha, visible) and stated as `AT_ORIGIN`.
  - **The DOM channel is the element's whole inline style**, not one property: `cssText` compared
    against a probe element carrying the one declaration the rules put there, so a `display:none`, a
    `visibility:hidden` or a `transform` is a difference as much as a changed opacity is.
  - **The notes stage's CLEAR COLOUR is carried**, from ThemeProvider - it was excused by a
    "what it does not carry" list that named pixi state the fakes do not model, while this is state
    they DO model. That list is now a set of omissions stated as omissions, each with the reason.
    A new test moves `primary` and waits both debounces out, because init() and handleThemeChange
    write both canvas-level channels from the same expressions: without an edit that moves them, a
    live channel and a frozen one read alike (measured - deleting either write passed).
  - **The scroll offset has a second, independent consequence.** `expectedNotesOffset` was the only
    statement of it in the repo, and its stated anchor - `handleClickStageUp`, the inverse - had no
    test at all. A pointerup is driven through the fake at the x the PAINTED SCENE puts the selected
    column at: a click there selects nothing, one column-width either way selects the neighbour.
  - **Comments**, the same over-claiming kinds as every round before: `needsFullRepaint`'s closing
    paragraph gave a false reason for not diffing `inPreview` ("changes no pixel" - it decides both
    canvas dimensions, so every column x, every note y and both canvas sizes) and contradicted
    `inPreview`'s own field comment, which already had the honest one (a static prop); `update()`'s
    second bullet asserted "`selected` moved and NOTHING else did", contradicted by its own third
    bullet three lines later; `drawSelectedMoved`'s "and nothing beyond it" over an enumeration that
    did not cover its body, and its "the preconditions are not restated" followed by restating all
    three; a count of the columns whose selection flag can change; `ComposerCanvas.svelte`'s "every
    value the renderer takes from this component is read here", which has exceptions in the same file;
    `isColumnVisible`'s "over every columnsPerCanvas option", which named a test that hardcoded the
    seven values - it reads them out of `ComposerSettings.data.columnsPerCanvas` now, and asserts the
    value this file drives with is one of them; the file header's "the only values this class reports
    back to the Svelte side", contradicted by `selectColumn`; a cross-reference to `canvasOpacity`,
    an identifier the test no longer has; and the test header's channel list, now scoped to the
    counters it is actually about.
  - **Sweep re-run: 40 mutations, 39 caught.** The 14 survivors from the previous review (both
    stages, the timeline container, the column width, the canvas dimensions, the canvas CSS, the
    offset inverse) all fail now, in 1 to 46 tests each, as do 25 newly invented ones in the same
    class. The one survivor is behaviour-preserving: a release that hides a view is undone by
    `ColumnView.paint`, which writes `visible` on every paint - break that pairing and it fails 8.

## Phase 4 (R2) — fine-grained repaint

**Files:** `src/lib/components/pages/Composer/ComposerRenderer.ts`,
`src/lib/core/Songs/SongClasses.ts`, `ComposedSong.svelte.ts`, `test/composerRenderer.test.ts`,
`test/reactivePublish.test.ts`

- [x] **Step 1:** Repaint only the columns whose `version` counter differs from what the view
      last painted, instead of every visible column on a structure change.
      _Done as a FOURTH outcome in `update()` rather than as a change to the existing three:
      `needsFullRepaint` lost its `structureVersion` term (and became `needsUnconditionalRepaint`),
      and a moved structure version with nothing else moved now calls `draw({previousSelected})`._
  - **`draw()` is identical either way** - same container offset, same release/acquire pass, same
    whole timeline rebuild, both renders, same baseline record - and its parameter DEFAULTS to off,
    so `recalculateCacheAndSizes`' call cannot enable it. The skip sits in `drawNotesStage`'s window
    loop, BEFORE `paintColumn` and never inside `ColumnView.paint`: that class writing every
    property it owns unconditionally is what makes a reused view safe, and a "set it only if it
    changed" paint would invert exactly that.
  - **The key a view holds is the PAIR (column object, version)**, written by `paintColumn` beside
    the pixels. The object half is not belt and braces:
    `addColumns`/`removeColumns`/`pasteColumns` splice the live array IN PLACE, so column objects
    move to new indexes with the array identity unmoved - i.e. through the narrowed path - and two
    counters sitting at the same number is ordinary. It carries no index: `columnViews` is keyed by
    index, a view enters that map only via `acquireColumnView`, and its one caller paints it there
    immediately.
  - **Everything else stays on the full repaint, as decisions:** `instruments`, `currentLayer`,
    `beatMarks`, `breakpoints`, `selectedColumns`, the `columns` array identity, `isRecordingAudio`,
    a null baseline, and every entry from `recalculateCacheAndSizes`. Narrowing
    `breakpoints`/`selectedColumns` would need a symmetric-difference diff costing about what it
    saves; the rest change the pixels of columns whose own counter did not move. `selected` is the
    one exception, handled the way `drawSelectedMoved` does it - the two overlays are repainted after
    the loop, because note entry is not gated on `isPlaying` and a structural edit really does arrive
    with a moved playhead.
  - **Two redundancies found while proving the guards**, both kept and both now stated as
    redundancies at their declaration rather than as the mechanism: clearing a released view's key
    (the acquire/paint pairing already means an entering column is painted before any key is read -
    removing the line alone leaves the file green), and `!==` versus `>` (while the object half is in
    the key the two cannot differ, since a given column's counter only increments).
    `NoteColumn.version`'s CONSUMER CONTRACT is re-written around that: rule 1 is the pair, rule 2 is
    `!==`, and the `>` hazard is named for a version-only consumer - the undo case it used to cite
    cannot reach the skip at all, because `restoreColumns` installs a new array.

- [x] **Step 2: Verify.**
      _All six gates green; no fixture moved._
  - **`Repainted` gained `paintedColumns: number[]`** - the same channel `columnPaints` already
    counted (a paint clears that view's tail `Graphics`), read per view instead of globally, with
    `push()` asserting the two agree so neither reading can narrow on its own. The four
    `#touchColumns` rows now state exact index sets, the same ranges
    `test/reactivePublish.test.ts`'s `touches` column states from the model side; the two headers
    cross-reference each other.
  - **Three REPAINTS rows are new:** a note added while `selected` also moved, and the two
    deliberately-constructed version collisions - `addColumns(1, 39)` puts a brand-new column at
    version 1 where the view painted 2, and old-column-40 at index 41 at exactly the version index
    41's view painted; `removeColumns(1, 34)` is the mirror. Each asserts its preconditions, so a
    drift in `makeSong` fails loudly instead of quietly turning them into rows that prove nothing.
  - **Nine WINDOWS rows are new:** a span shortened from OFF-SCREEN whose bars are inside the window
    (the only thing driving `#touchColumns`' range rule from the far side), the two index-shifting
    edits for their content, an edit in the same update as a playhead move, and five for a column
    parked across a change to each of
    `currentLayer`/`instruments`/`breakpoints`/`selectedColumns`/`beatMarks`.
  - **Sabotages, one at a time:** a version-only key fails 10 tests with `!==` and 10 with `>`;
    ignoring the covered range (marking only the column that owns the note) fails 14 in
    `composerRenderer.test.ts` and 18 across `test:sky` — the figure first recorded here was 23,
    which did not reproduce; re-measured after the selection-fix-up row below was added; skipping every
    column already on screen fails 29; dropping the `previousSelected` overlay fails 3 and the
    `state.selected` one fails 1 (that half was pinned by NOTHING until a content row for "an edit
    arrived in the same update as a moved playhead" was added — an overlay is not a column paint, so
    only a content comparison sees it); moving any one of
    `currentLayer`/`instruments`/`breakpoints`/`selectedColumns`/`beatMarks` onto the narrowed path
    fails 3-5; deleting the `columns`-identity comparison fails 2. The two redundancies above are the
    two that fail nothing, and say so where they live.
  - **Measured** on the file's own harness (window 23), 800-column song, one-note add/remove: 23
    column paints per edit -> 1, and `update()` 0.169 ms -> 0.086 ms. On the 100-column song: add
    23->1, remove 23->1, a span 3->4 23->4 (the union of the old and new ranges), a tempo changer
    23->1, and an edit arriving with a playhead move 23->2. The residual per structural edit is
    `maxSpan()`'s O(notes) rescan and the timeline's full rebuild, both unchanged by this phase. It
    is not the performance win - phase 3 took the playback tick to zero allocations and structural
    edits are user-paced - it is a smaller repaint on edits.

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
