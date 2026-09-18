# Composer undo/redo — delta history recorded inside the song model

Design settled 2026-08-24 in a grilling session (all decisions below are the user's, confirmed one by one).
Companion documents: **ADR-0013** (`docs/adr/0013-delta-undo-recorded-inside-the-song-model.md`) records the
architectural decision; **CONTEXT.md § Composer Editing** defines the two domain terms (**Undo Step**,
**Savepoint**). Use those terms; avoid "history entry" and "snapshot".

## 1. What this replaces

The current undo lives in `src/lib/components/pages/Composer/Composer.svelte`:

- `addToHistory()` (~line 2195) takes a **full `song.clone()`** per edit and stores
  `{columns, pitch, instruments}` in `undoHistory: ComposerHistoryEntry[]` (a deep `$state` array —
  which is why `ComposedSong.restoreColumns` needs its proxy-laundering copy).
- It early-returns unless the tools panel is open; `toggleTools()` clears the history on **every**
  panel toggle; there is **no redo**; there is no Ctrl+Z binding; coverage is patchy even while the
  panel is open (keyboard note toggles, add/remove columns, breakpoints, single-column tempo changes,
  layer add/remove/swap/merge, bpm are all non-undoable).
- The undo **button** lives in `ComposerTools.svelte` (~line 361), enabled off `undoHistory.length`.

All of that dies: `addToHistory`, `undoHistory`, `ComposerHistoryEntry`, the tools-panel undo button,
and `ComposedSong.restoreColumns` (its only caller is the old undo).

## 2. Decisions (all confirmed, do not relitigate)

1. **Composer-wide** undo/redo; the VSRG composer is **out of scope** (but the history container is
   song-agnostic so VsrgSong can adopt it later).
2. **Recording happens inside `ComposedSong`**, at the mutation sites, into a history **attached** to
   the song. No history attached ⇒ no recording, by construction (deserialize, MIDI import,
   `toOtherGame`, player loads, clones never attach one).
3. **Every top-level field write moves behind a method** — after this change there are no outside
   writes to song state except `selected` (the one sanctioned cursor write).
4. **One public mutator = one Undo Step**; compound gestures are promoted into single class methods;
   a reentrant explicit group API exists for gestures that span time (the Duration Hold).
5. **Typed primitive deltas** (see §4), replayed in reverse for undo, forward for redo. Three standing
   rules: detached objects ride **by reference, never cloned**; self-inverse rewrites store
   **parameters, not data**; the history is **plain non-reactive data** plus one version signal.
6. **Undoable = everything `serialize()` writes**: notes, spans, tempo changers, breakpoints, columns,
   Basepoints (song + per-track), bpm, reverb, name, roster membership and every roster field
   (volume, mute, solo, visibility, alias, icon, reverbOverride). Cursor state (selected column,
   active layer, tools selection, view framing) is never a Step; `selected` is serialized but is
   explicitly carved out as cursor state.
7. **The merge-layer and remove-layer confirm dialogs are dropped** (they existed because those ops
   were irreversible).
8. **Cursor memo**: each Step records `selected` as it was when the edit was made; undo/redo apply the
   deltas then jump selection to the memo **through the normal `selectColumn` path with audio
   suppressed**. Active layer and tools multi-selection are deliberately not restored.
9. **Lifecycle**: linear history; any new recorded Step clears the redo stack; **cap 100** Steps with
   oldest-eviction; in-memory only; cleared only by song identity change (= attaching a fresh history
   on install). Saving never clears history.
10. **Savepoint semantics**: the history stores the position current at the last save; dirty is
    _derived_ (not at the savepoint, or savepoint evicted/stranded ⇒ dirty). Undoing back to the
    savepoint makes the song clean — no unsaved-changes prompt.
11. **Interaction rules**: undo/redo allowed during playback, followed by `resyncPlayback(true)`;
    undo/redo first **settles live input** (dismiss duration popover, _abandon_ pending
    presses/holds, force-close any open group — the same settle block `changeMidiVisibility` uses);
    disabled while `songLocked`.
12. **Surfaces**: undo/redo buttons leave the tools panel; a two-button row (undo left, redo right)
    goes in `.composer-left-control` **between the play button and `InstrumentControls`**. Rebindable
    shortcuts `Ctrl+Z` (undo), `Ctrl+Y` and `Ctrl+Shift+Z` (redo), plus `Cmd` variants for mac,
    holdable (auto-repeat walks history); `undo`/`redo` MIDI shortcut types join the composer's MIDI
    shortcut switch.
13. **Tests are a hard requirement** (§8): per-mutator round-trip table + an exhaustiveness guard that
    fails CI when a mutator lacks a row + randomized sequence fuzzing + publish-correctness rows +
    group/cap/savepoint lifecycle tests.

## 3. The container: `UndoHistory`

New file `src/lib/core/Songs/UndoHistory.svelte.ts` (needs `.svelte.ts` for its one `$state` signal).
Song-agnostic over a delta type `D`:

```ts
type UndoStep<D> = { deltas: D[]; selected: number; label?: string };

class UndoHistory<D> {
  // plain arrays, NOT $state — entries must never become deep proxies
  #undo: UndoStep<D>[];
  #redo: UndoStep<D>[];
  #version = $state(0); // the ONE signal; bump on any stack/savepoint change
  #groupDepth: number; // explicit groups (Duration Hold)
  #openStep: UndoStep<D> | null; // the step being accumulated
  #savepoint; // identity-based position marker (see below)

  record(delta: D): void; // append into the open step (create one if none)
  beginStep(selected: number, label?: string): void; // called by the song's outermost-mutator scope
  endStep(): void; // closes unless a group is open; empty steps are discarded
  beginGroup(): void;
  endGroup(): void; // reentrant; endGroup at depth 0 is a no-op + dev warn
  undoStep(): UndoStep<D> | null; // pops undo → pushes redo; caller applies
  redoStep(): UndoStep<D> | null; // pops redo → pushes undo; caller applies
  markSavepoint(): void; // on successful save
  get canUndo(): boolean;
  get canRedo(): boolean; // read #version → reactive
  get isDirty(): boolean; // derived savepoint distance; reads #version
}
```

Implementation notes:

- **Savepoint as identity, not index**: hold a reference to the `UndoStep` that was on top of the undo
  stack at save time (or a unique "bottom" sentinel for a freshly-installed song). Dirty ⇔ current
  top-of-undo-stack !== savepoint ref. Eviction past the cap or clearing a redo branch that held the
  savepoint naturally strands the reference ⇒ dirty until the next `markSavepoint()`. No index
  arithmetic to get wrong.
- Cap **100**: evict from the bottom of the undo stack when a new step lands; redo invalidation:
  `record`/`beginStep` with a non-empty redo stack clears it.
- A step that ends with zero deltas is discarded (mutator no-op paths publish nothing and record
  nothing — the class's existing "a call that changed nothing publishes nothing" rule extends to
  recording).
- `undoStep`/`redoStep` while a group/step is open: force-close first (§2.11's settle rule lives in
  the composer, but the container defends itself too).

## 4. The deltas: primitive write-site records

`ComposedSongDelta` is a discriminated union declared in `ComposedSong.svelte.ts`. The design insight
(verified against every mutator body): **mutators do not need bespoke inverse logic**. Every live-graph
mutation in the class decomposes into ~11 primitive writes; record each primitive where it happens and
replay the step's list **in reverse order, each primitive inverted** for undo (forward, uninverted,
for redo). Order-sensitive interleavings (e.g. `setInstrument`: roster swap → in-place id rewrites →
per-column merge filters → `normalizeSpans` clamps) invert correctly because reverse replay exactly
mirrors the forward sequence, and shared object references keep aliasing consistent.

The primitives (names indicative):

| delta                 | payload                                                                                                                                                                                                                 | undo                                                                        | redo                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| `noteAdded`           | `{columnIndex, note}` (live `ColumnNote` **ref**)                                                                                                                                                                       | splice it out by identity                                                   | push it back           |
| `noteRemoved`         | `{columnIndex, note, indexInColumn}`                                                                                                                                                                                    | splice back at `indexInColumn` (exact order matters for serialize-equality) | remove again           |
| `columnNotesReplaced` | `{column, before, after}` (the `NoteColumn` ref + both **array refs** — the sites already assign fresh arrays: `eraseColumns`, `#mergeTrackDuplicates`, `moveNotesBy`, `removeInstrument`, filter-reassign patterns)    | `column.notes = before`                                                     | `column.notes = after` |
| `noteFieldChanged`    | `{note, field: 'id'\|'span'\|'trackIndex', before, after}`                                                                                                                                                              | write `before`                                                              | write `after`          |
| `columnsInserted`     | `{index, columns}` (refs; `addColumns`, `pasteColumns` insert branch)                                                                                                                                                   | splice out `columns.length` at `index`                                      | re-splice them in      |
| `columnsRemoved`      | `{removed: {index, column}[]}` ascending (from `removeColumns`, `deleteColumns`; deleteColumns' whole-array `filter` becomes an equivalent recording form)                                                              | re-insert ascending                                                         | remove again           |
| `tempoChanged`        | `{column, before, after}`                                                                                                                                                                                               |                                                                             |                        |
| `breakpointsReplaced` | `{before, after}` (both **array refs** — the field is `$state.raw` and every mutator already assigns fresh arrays)                                                                                                      | assign `before`                                                             | assign `after`         |
| `instrumentsReplaced` | `{before, after}` (same: the roster is `$state.raw`, every mutator assigns fresh arrays — O(1) recording for `addInstrument`/`setInstrument`/`swapInstruments`/`removeInstrument`/`mergeTrackInto`/`ensureInstruments`) | assign `before`                                                             | assign `after`         |
| `fieldChanged`        | `{field: 'bpm'\|'pitch'\|'reverb'\|'name', before, after}`                                                                                                                                                              |                                                                             |                        |

Recording rules:

- **Live graph only.** Scratch work never records: `pasteLayer`/`pasteColumns` mutate _clones_ before
  installing them (`#rewriteForPaste` runs on the clones); `copyColumns` returns clones; `clone()` is
  a read. The recording sites are the writes into `#columns` / live columns / live notes / the
  `$state.raw` fields / the song's own scalar fields — nothing else.
- **Implicit step per outermost recorded call.** Every public mutator enters a
  `#asStep(label, fn)`-style scope: a reentrant depth counter so nested mutator calls
  (`removeColumns` → `validateBreakpoints` + `normalizeSpans`; `deleteColumns` → possibly
  `addColumns(12, 0)` on emptying the song; `pasteLayer` → `pasteColumns`; `setInstrument` →
  `normalizeSpans`) fold their primitives into the **same** step. The composer-facing
  `history.beginGroup()`/`endGroup()` sits above this and merges _multiple_ mutator calls into one
  step (Duration Hold: group opens with the popover, closes when the popover dismisses — NOT when the
  finger lifts; the popover outlives the hold and `<`/`>`/wheel edits keep landing in the group).
- `#rec(delta)` is a no-op when `this.history` is null **or** when recording is suspended because the
  song is currently applying a step (undo/redo application must never record itself).
- `selected` writes never record (cursor). `deleteColumns` still clamps `selected` as it does today;
  the cursor memo makes undo land correctly anyway.

Application (`#applyStep(step, direction)`):

- Iterate deltas (reversed + inverted for undo), apply each primitive directly to the private state.
- Then publish **coarsely, once**: if any graph primitive was applied → `#touchAllColumns()` +
  `#bumpStructure()` (the documented acceptable coarseness for bulk ops — the renderer repaints only
  the visible window). `breakpointsReplaced`/`instrumentsReplaced` publish by assignment (the restored
  ref differs from the current one, so `$state.raw` identity-publish fires). `fieldChanged` on
  bpm/pitch goes through the signal-backed fields. Re-clamp `selected` to the restored column count.
- `undo()` / `redo()` on the song: settle nothing themselves (the composer settles), pop from the
  attached history, apply, return `{selected}` (the step's cursor memo) or `null`.

Aliasing-safety argument (record it in code comments): history is strict LIFO and any new edit clears
the redo stack, so a detached object (note, column, `notes` array, roster array) referenced by a
stacked delta is unreachable from the live graph while it waits; re-insertion restores the very same
object, which the composer's identity-holding gestures (sustain recordings, `SustainRecording.note`)
already tolerate and in fact prefer.

## 5. Field-to-method migration & compound promotions (behavior-neutral first pass)

New/changed `ComposedSong` methods (each is one Step; all record):

- `setBpm(bpm)`, `setReverb(on)`, `rename(name)` — trivial `fieldChanged` recorders.
- `changeBasepoint(scope: 'song' | number, newPitch)` — **absorbs** today's two-step call-site dance
  (Composer writes `song.pitch` via the dynamic `song[key] = value` write, then calls
  `applyBasepointChange(scope, old, new)` with both ends): the method reads the old pitch itself,
  writes the field (song-level) or is invoked by `setInstrument` (track-level), rewrites the notes,
  records `fieldChanged` + per-note `noteFieldChanged` (id) primitives. `applyBasepointChange`
  becomes internal to it. NOTE: the per-note id rewrite records one primitive per affected note —
  O(notes) small records, NOT a song copy; this satisfies the "parameters, not data" rule well enough
  in the primitive scheme (an optimization to a single `{scope, semitones}` delta is allowed but not
  required; if taken, its inverse must re-derive the affected set identically — prefer the primitive
  records unless measurements say otherwise).
- `swapTracks(a, b)` — absorbs the `swapLayer(len, 0, a, b)` + `swapInstruments(a, b)` pair
  (`switchLayerPosition` in Composer becomes a single call). `swapLayer`/`swapInstruments` stay as
  internals or record independently — implementer's choice, but the public gesture is ONE step.
- Existing mutators keep their signatures (the pointless `async` on `pasteColumns`/`removeInstrument`
  may be dropped if all call sites are updated in the same pass); they gain recording only.

Composer call-site updates: `handleSettingChange` routes bpm/pitch/reverb through the new methods
(killing the `@ts-expect-error` dynamic `song[key]` write for songSettings); the two constructor-seed
writes (`song.bpm = settings.bpm.value` etc., lines ~120/329) go through the setters **before** a
history is attached (or under an explicit no-record path) so a fresh song does not open dirty with a
phantom step.

`InstrumentData.volume` and friends are already funneled through `setInstrument` (the
InstrumentSettingsPopup → `editInstrument` path). Audit the popup's slider event granularity: if a
volume/alias input emits per-tick `onInstrumentChange`, wrap the drag in
`history.beginGroup()`/`endGroup()` at the popup boundary so a slider drag is one Step. The settings
sidebar's per-layer volume (`changeVolume` in Composer, `SettingVolumeUpdate`) does NOT write the
song roster — it is live-gain-only and stays out of scope; verify and leave as is.

## 6. Composer wiring

In `Composer.svelte`:

- Attach: wherever a song is **installed** (initial mount, `loadSong`, `createNewSong`, MIDI-import
  confirm — find every point that today does `undoHistory = []`), create and attach a fresh
  `UndoHistory` instead. Delete the old machinery (§1).
- `undo()` / `redo()` wrappers: `if (songLocked) return;` → settle live input (dismiss
  `durationPopover`, `abandonNotePresses()`, `abandonNoteHolds()`, end sustain recordings
  _abandoning_ them, `history.endGroup()` while depth > 0) → `song.undo()` / `song.redo()` → if a
  step applied: `selectColumn(memo.selected, /*ignoreAudio*/ true)` → re-seed the settings mirrors
  from the song (`settings.pitch`, `settings.bpm`, `settings.reverb` + `updateSettings()`) →
  `syncInstruments()` → `resyncPlayback(true)` → count activity for autosave (see below).
- **Savepoint**: `updateSong()` (and every `changes = 0` site that represents a real save) calls
  `history.markSavepoint()`. The dirty reads — `prepareToLeave` (`changes === 0` guard, ~line 2079),
  `loadSong`/`createNewSong` prompts, the menu's dirty dot — switch to
  `history.isDirty || midiPreviewLoaded`-equivalents. The `changes` counter survives ONLY as the
  autosave cadence counter (`handleAutoSave`), and undo/redo increment it as activity so autosave
  still fires on an undo-heavy session; it no longer answers "is the song dirty".
- Duration Hold: `openDurationPopover`/`handleProCellLongPress` replace their `addToHistory()` with
  `history.beginGroup()`; the popover dismissal paths (all of them — column-jump dismissal, layer
  change, playback start, outside press, close) call `endGroup()`. The hold's many
  `setNoteSpan` calls land in that one group-step.
- Confirms: delete the `asyncConfirm` from `mergeLayer` and `removeInstrument` (keep the
  `songLocked`/bounds guards).
- `handleProCellTap`'s and `handleTempoChanger`'s `addToHistory()` calls simply disappear — recording
  is automatic now. The "deliberate asymmetry" comment block (~1449) dies with them.

## 7. UI, keybinds, MIDI, i18n

- **Buttons**: in the `.composer-left-control` column (Composer.svelte ~line 2618), directly below the
  play `AppButton` and above `InstrumentControls`: one row, undo left, redo right, styled to match the
  play button's height rhythm (it is `3rem`; the pair can be shorter — visually a secondary row).
  Icons from **unplugin-icons** (`~icons/fa6-solid/rotate-left` / `rotate-right`) — repo rule: never
  hand-inlined SVG. Disabled off `!history.canUndo` / `!history.canRedo` or `songLocked`; tooltips +
  `ariaLabel` from i18n. Remove the undo button + `undoHistory` prop + `undo` function prop from
  `ComposerTools.svelte`.
- **Keybinds** (`src/lib/stores/KeybindsStore.svelte.ts`, `defaultShortcuts.composer`):
  `ControlLeft+KeyZ` → `undo` (holdable), `ControlLeft+KeyY` → `redo` (holdable),
  `ControlLeft+ShiftLeft+KeyZ` → `redo`, plus `MetaLeft+KeyZ` / `MetaLeft+ShiftLeft+KeyZ` for mac.
  VERIFY the combo matcher supports two held modifiers (existing defaults only ever hold one,
  `ShiftLeft+KeyS`); if it does not, extend it or ship without the 3-key aliases (Ctrl+Y covers redo).
  Exact-match semantics already guarantee bare `KeyZ` stays note entry. Check the store's
  stored-map/defaults merge so existing users receive the new defaults.
- **MIDI**: add `undo`/`redo` shortcut types where composer MIDI shortcuts are declared and handle
  them in the `handleMidi` switch (Composer.svelte ~line 705).
- **i18n**: `common:undo` exists; add `redo` (+ any tooltip strings) to `en` and run
  `npm run check:translations` to surface what the other locales need (mirror the repo's existing
  practice for untranslated additions).

## 8. Tests (hard requirement — no-data-loss guarantee)

New `test/undoRedo.test.ts` (+ `test/undoRedoFuzz.test.ts`), patterned on the repo's
`test/reactivePublish.test.ts` culture:

1. **Round-trip table, one row per mutator**: seed a song (rich fixture: multi-track, spans,
   overrides, breakpoints, tempo changers, stranded notes), apply the op, assert `serialize()`
   deep-equality through **do → undo (=pre) → redo (=post) → undo (=pre)**. The second undo catches
   single-use deltas (a by-reference object mutated during redo). Rows also assert: `selected` in
   range, breakpoints all address columns, no overlapping same-(track,id) spans.
2. **Exhaustiveness guard**: enumerate `ComposedSong`'s callable surface (own + prototype, the
   `reactivePublish.test.ts` technique) minus a declared read-only list; FAIL if any mutator lacks a
   round-trip row. This is the structural answer to "no accidental data loss in any kind of action".
3. **Fuzz**: seeded PRNG (no `Math.random` without a logged seed), ~50-op random sequences over
   randomized songs × many seeds; record `serialize()` checkpoints after every op; then random
   undo/redo walks asserting live state equals the checkpoint at every visited position, undo-to-
   bottom equals the initial state, redo-to-top equals the final. Snapshots are fine in tests.
4. **Publish-correctness**: extend `reactivePublish.test.ts` with rows for `undo`/`redo` application
   per delta family (structure signal, `instruments`, `breakpoints`, bpm/pitch publish as the forward
   op does).
5. **Lifecycle**: group collapse (N `setNoteSpan` in a group = one step), unbalanced-group defense,
   cap-100 eviction, redo cleared on new edit, savepoint walks (save → edit → undo ⇒ clean;
   eviction/stranding ⇒ dirty), empty-step discard, no-history-attached paths record nothing
   (deserialize/import/clone), undo/redo never record.

Existing suites must stay green — notably `reactivePublish.test.ts` (update rows for renamed/absorbed
methods: `applyBasepointChange` → `changeBasepoint`, `restoreColumns` row deleted, new setters added),
`noAliasing.ts`, `noProxies.ts`. Run `npm run test:genshin && npm run test:sky` (game-dependent
fixtures) and `npm run check`.

## 9. Constraints for implementers

- Svelte 5 runes idioms; this repo's dense rationale-comment style — new code should explain its
  _constraints_, matching the class's existing voice.
- Icons only from `~icons/*` (fa6-solid installed). No game-id branching — capability from config.
- The user may edit the repo while agents run: **never revert an out-of-scope diff you did not make.**
- Do not commit; leave the tree for review. No Co-Authored-By trailers ever in this repo.
- `ComposedSong.svelte.ts` is the contention hotspot — phases that touch it must not run concurrently.
