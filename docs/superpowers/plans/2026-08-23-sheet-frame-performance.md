# Sheet Frame performance: slim DOM (A) + deferred fullscreen mount (B1) + content-visibility (B2)

**Date:** 2026-08-23 · **Status:** planned, not started · **Requested by:** Specy (session handoff)

## Goal

The Sheet Frames (the small per-chunk note-grid previews) are DOM-heavy: ~25–30 nodes per frame
(wrapper + button + outer + grid + one div per cell, 7×3=21 cells on Genshin, 5×3=15 on Sky, each
cell carrying an interpolated inline `style`). Two surfaces render the **entire song** at once and
jank:

1. **Player fullscreen frame picker** — `PlayerSheetCard` swaps `visibleChunks` to `allChunks`
   (one chunk per musical instant; a few-minute song is 500–1500 frames → 15k–40k nodes) the
   instant the expand phase flips, so node creation + layout runs *inside* the 150ms height
   animation.
2. **Sheet visualizer page** — one `SheetFrame2` per `VisualSong` chunk (for composed songs
   essentially one per column) → 25k–100k nodes on first song load; first render takes seconds.

Three work items, in implementation order:

- **A — slim the frame DOM**: empty-dot lattice becomes a CSS background; only real notes render
  as children (~25 → ~6–8 nodes/frame); hoist per-frame computed colors/inline styles to
  container-level CSS vars.
- **B1 — defer the fullscreen mount**: animate the card's growth showing the current inline page;
  mount all frames only after `animationend`.
- **B2 — `content-visibility: auto`** on the two long lists so offscreen frames skip layout/paint.

Decided in-session after research; the pause/play button + controls redesign discussed in the same
session is **explicitly out of scope** here (separate task).

---

## Repo rules and traps (read before touching anything)

- **CLAUDE.md mandates the Svelte MCP tools**: run `svelte-autofixer` on every modified `.svelte`
  file until it reports no issues. Use `list-sections`/`get-documentation` if unsure of Svelte 5
  idioms.
- **Never branch on game id** (user rule "config-driven correctness"): the per-row cell count must
  come from `game.notes.perRow`, never from `APP_NAME`. Tests run for BOTH games
  (`npm run test:genshin && npm run test:sky`), so hardcoding 7 breaks Sky.
- **[SheetFrame.css](../../../src/lib/components/pages/SheetVisualizer/SheetFrame.css) must stay a
  plain unscoped stylesheet** — its header QUIRK comment explains it is shared by two separately
  scoped components (`SheetFrame.svelte`, `SheetFrame2.svelte`). Do not fold rules into either
  component's `<style>`.
- **[PlayerPagesRenderer.svelte](../../../src/lib/components/pages/Player/PlayerPagesRenderer.svelte)
  keys its `{#each}` by index on purpose** (QUIRK comment in file). Leave that alone.
- **Preserve the narrative comments** (the `displayButton` / ADR-0004 / ADR-0007 blocks, the
  "Dead code, deliberately kept inert" block in SheetFrame2, the containing-block notes in
  PlayerSheetCard). Update a comment's *content* where this plan changes the behavior it
  describes (e.g. references to per-cell divs); never delete the rationale.
- **The working tree has many unrelated uncommitted changes** (the user edits while agents run —
  see memory "Don't revert unexplained tree changes"). Touch only the files this plan names. Do
  not commit unless the user asks; if asked, no `Co-Authored-By` trailer (user rule).
- Icons rule (`~icons/*`) is not relevant — this plan adds no icons. No i18n strings needed.

### Files touched (complete list)

| File | Items |
|---|---|
| `src/lib/components/pages/SheetVisualizer/SheetFrame.css` | A, B2 |
| `src/lib/components/pages/SheetVisualizer/SheetFrame.svelte` | A |
| `src/lib/components/pages/SheetVisualizer/SheetFrame2.svelte` | A |
| `src/routes/sheet-visualizer/+page.svelte` | A |
| `src/lib/components/pages/Player/PlayerPagesRenderer.svelte` | A |
| `src/lib/components/pages/Player/PlayerSheetFrame.svelte` | A, B2 |
| `src/lib/components/pages/Player/PlayerSheetCard.svelte` | B1 |
| `test/playerSheetCard.test.ts` | B1 |

Verified consumer map (2026-08-23): `SheetFrame.svelte` is imported **only** by
`PlayerSheetFrame.svelte`; `SheetFrame2.svelte` **only** by `sheet-visualizer/+page.svelte`; the
`frame-note-*` / `visualizer-frame` / `frame-outer*` classes appear **only** in those four files.
No test queries `.frame-note-*` (the sheet-card test queries `[data-frame-index]`,
`.sheet-frame-*`, `.frame-popover`, `.player-sheet-expand`, `.player-sheet-card`). Re-grep before
relying on this if the tree has moved.

---

## Item A — slim the frame DOM

**Idea:** the empty-cell dot lattice is identical in every frame, so it does not need 15–20 divs
per frame. Paint it once as a repeating `background-image` on `.visualizer-frame`, and render only
the actual notes as explicitly grid-placed children. A typical chunk holds 1–4 notes → a frame
drops from ~25 nodes to ~6–8, and the per-cell inline `style` strings disappear. The dot under a
filled cell is simply hidden beneath the opaque note block (25%-size dot centered under an
80%-size opaque cell), so painting the lattice in all cells is visually identical to the old
"dots only in empty cells".

### A.1 `SheetFrame.css`

```css
.visualizer-frame {
  /* existing: width/height/position/top/left/display:grid/rows/justify/align … */
  grid-template-columns: repeat(var(--sheet-cols, 7), 1fr); /* was inline per frame */
  background-image: radial-gradient(
    circle closest-side,
    var(--sheet-dot-color, var(--primary)) calc(var(--sheet-dot-r, 25%) - 0.5px),
    transparent var(--sheet-dot-r, 25%)
  );
  background-size: calc(100% / var(--sheet-cols, 7)) calc(100% / 3);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.frame-note-s {
  /* existing rules, plus: */
  position: relative;                                        /* was inline on filled cells */
  background-color: var(--selected-note-background, var(--accent)); /* add the fallback */
}

/* held-note marker (Duration over the visual threshold) — replaces the inline-styled div */
.frame-note-held::after {
  content: '';
  position: absolute;
  bottom: 8%;
  left: 22%;
  right: 22%;
  height: 0.14rem;
  border-radius: 1rem;
  background-color: currentColor;
  opacity: 0.75;
  pointer-events: none;
}
```

- **Delete `.frame-note-ns`** (grep first to confirm it is unreferenced after A.2/A.3).
- **Print block**: delete the `.frame-note-ns { background-color: black !important }` rule and add
  (inside the existing `@media print`, after the base rules so source order wins):
  `.visualizer-frame { --sheet-dot-color: black; }`.
- Keep everything else byte-identical, including the two "intentionally empty, preserved
  byte-for-byte" QUIRK rules and the disabled `@supports` block.
- **Dot geometry note:** the old dot's diameter was 25% of the *cell width*
  (`width:25%; padding-bottom:25%`). `circle closest-side` keys the 25% stop to half the cell's
  *shorter* side — identical on Genshin (cells ≈ square), slightly smaller on Sky player frames
  (5 columns → cells wider than tall). `--sheet-dot-r` is the tuning knob if the eyeball check
  (see Verification) says Sky dots shrank noticeably; bump it via the container var rather than
  adding any game branch.

### A.2 `SheetFrame.svelte` (player frames)

Replace the dense-array `notes` derived with a filled-only list. Keep the whole `displayButton`
comment block (ADR-0004/ADR-0007) attached to the lookup:

```ts
const filledNotes = $derived.by(() => {
  const byButton = new Map<number, boolean>(); // button -> held
  const max = columnsPerRow * rows;
  chunk.notes.forEach((note) => {
    /* …existing displayButton comment block stays here… */
    const button = note.displayButton;
    if (button < 0 || button >= max) return;
    const held =
      note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS || (byButton.get(button) ?? false);
    byButton.set(button, held);
  });
  return [...byButton.entries()].map(([button, held]) => ({
    button,
    held,
    row: Math.floor(button / columnsPerRow) + 1,
    column: (button % columnsPerRow) + 1,
  }));
});
```

Template — the non-empty branch becomes:

```svelte
<div class="visualizer-frame">
  {#each filledNotes as note (note.button)}
    <div
      class={note.held ? 'frame-note-s frame-note-held' : 'frame-note-s'}
      style="grid-row:{note.row};grid-column:{note.column}"
    >
      {hasText ? baseInstrument.getNoteText(note.button, keyboardLayout, 'C') : ''}
    </div>
  {/each}
</div>
```

- Explicit `grid-row`/`grid-column` are required — auto-placement would pack the sparse children
  sequentially. `justify-items`/`align-items: center` on the grid keeps centering the 80% cells.
- Keying by `note.button` is per-frame-internal and does not conflict with the outer
  keyed-by-index QUIRK in PlayerPagesRenderer.
- Remove from the template's `.visualizer-frame` the inline `grid-template-columns` **and**
  `--selected-note-background:var(--accent)` (now the CSS fallback).
- Delete the `color` derived (`theme.layer('primary', 0.2)`) — the dot color now arrives via
  `--sheet-dot-color` from the container (A.4/A.5). The `theme` prop then becomes unused: remove
  it from this component, from `PlayerSheetFrame.svelte` (prop + pass-through), and from
  `PlayerPagesRenderer.svelte`'s `<PlayerSheetFrame …>` call. **Keep** the `ThemeProvider` import
  in PlayerPagesRenderer — A.4 uses it for the dot color.
- The `selected` border handling (`cs([selected, …])`) may stay as-is; if you simplify it to
  `style={selected ? 'border-color:var(--accent)' : ''}`, also prune the then-unused `cs` import.
- Update the component's header comment (it describes the per-cell grid).

### A.3 `SheetFrame2.svelte` (sheet visualizer)

Same transformation per column, plus the multi-color rows concern:

- In `columnsWithNotes`, replace the dense `notes` array with a filled list
  (`{ cell, held, rowIndex, gridRow, gridColumn }`), built like A.2 but from `column.notes`
  (`note.note` is the cell index, `note.held` the held flag). Add the same bounds check
  (`0 ≤ note.note < columnsPerRow * rows`) — the old array write had none, so this is a strict
  tightening; keep it.
- Delete the `colors` derived (both `none` and the `rows` triple — hoisted to the page, A.5) and
  the now-unused `theme` prop.
- `outerStyle` (tempo-changer background + `getBorderStyle`) is **unchanged**.
- Filled-cell template:

```svelte
<div
  class={f.held ? 'frame-note-s frame-note-held' : 'frame-note-s'}
  style="grid-row:{f.gridRow};grid-column:{f.gridColumn};--selected-note-background:var(--sheet-row-color-{f.rowIndex})"
>
  {f && hasText ? baseInstrument.getNoteText(f.cell, keyboardLayout, 'C') : ''}
</div>
```

- Remove the inline `grid-template-columns` from its `.visualizer-frame` too.
- Leave the "Dead code, deliberately kept inert" emptyAhead comment and the `visualizer-ball`
  branch untouched.

### A.4 `PlayerPagesRenderer.svelte` (container vars, player)

On the `.player-chunks-page` element, extend the existing style attribute (the outer
`grid-template-columns:repeat({columns},1fr)` — the *frames-per-row* grid — stays; `--sheet-cols`
is the *cells-within-a-frame* count, a different number):

```svelte
style="grid-template-columns:repeat({columns}, 1fr);--sheet-cols:{game.notes.perRow};--sheet-dot-color:{dotColor}"
```

with `const dotColor = $derived(theme.layer('primary', 0.2).toString());` — computed **once per
container** instead of once per frame (theme changes stay reactive through the derived).

### A.5 `sheet-visualizer/+page.svelte` (container vars, visualizer)

On `.visualizer-frame-wrapper`, extend the style attribute with `--sheet-cols`,
`--sheet-dot-color` and the three row colors:

```ts
const dotColor = $derived(theme.layer('primary', 0.2).toString());
const rowColors = $derived.by(() => {
  if (!multiColor) return ['var(--accent)', 'var(--accent)', 'var(--accent)'];
  const base = theme.get('accent');
  return [base.hue(90).toString(), base.toString(), base.hue(-30).toString()];
});
```

```svelte
style="grid-template-columns:repeat({framesPerRow},1fr);--sheet-cols:{game.notes.perRow};--sheet-dot-color:{dotColor};--sheet-row-color-0:{rowColors[0]};--sheet-row-color-1:{rowColors[1]};--sheet-row-color-2:{rowColors[2]}"
```

(`game` and `theme` are already imported here.) This preserves the exact old color math from
SheetFrame2's `colors` derived — copy it verbatim, do not re-derive.

**A parity checklist:** empty chunk still renders the `visualizer-ball` branch (no lattice — the
background lives on `.visualizer-frame`, which that branch doesn't render); held marker position
identical; note text unchanged; `framesPerRow` width-guard in the page's `handleSettingChange`
still finds a frame via `ref.children[0]?.children[0]` (SheetFrame2's outer structure is
unchanged); print dots come out black and aligned.

---

## Item B1 — defer the fullscreen mount until the growth animation ends

**File:** `PlayerSheetCard.svelte` (+ test). Today `showsAllFrames` flips the moment
`openFullscreen()` sets the phase, so the whole-song mount competes with the 150ms height
animation. New behavior: the growth animates over the *current inline page*; all frames mount at
`animationend`; the collapse continues to show all frames while shrinking (unchanged, per the
existing comment).

### B1.1 The new phase machine

`fullscreenPhase: 'closed' | 'opening' | 'open' | 'closing'` — transitions:

```
closed --openFullscreen()--> opening --animationend|250ms fallback--> open
open  --collapseFullscreen()--> closing --animationend|250ms fallback--> closed
opening --collapseFullscreen()--> closing        (Escape/outside-tap mid-growth; see note)
any   --playerStore stop event--> closed          (existing effect, unchanged shape)
```

Derived mapping (replaces today's booleans — get each one right, several gates move):

| Concern | Phases |
|---|---|
| `.player-sheet-card-expanded` class (runs the grow animation) | `opening`, `open` |
| `.player-sheet-card-closing` class | `closing` |
| `showsAllFrames` (content = `allChunks`) | `open`, `closing` |
| `--sheet-collapsed-height` style var applied | any phase `!== 'closed'` ⚠ today it's gated on `showsAllFrames`; during `opening` the animation needs it, so this gate MUST widen |
| collapse icon shown / Escape collapses / outside-pointerdown collapses | `opening`, `open` |
| scroll thumb visible (`updateScrollThumb` guard) | `open` only (unchanged) |
| re-centre-on-new-pages effect guard | `open` only (unchanged) |
| `cardVisible` | unchanged (`pages.length > 0 || (phase !== 'closed' && eventType !== 'stop')`) |

Popover invalidation (`activePopover`): the stored `fullscreen` field describes which *content
view* the anchor element lives in, so capture and compare it against `showsAllFrames` (not the
chrome state): `popover.fullscreen !== showsAllFrames → null`, and keep the
`pageIndex` check applying only when `!showsAllFrames`. Net effect: a popover opened inline
survives the growth (its page is still what's mounted) and closes when the content swaps at
`open` — which is also when its anchor element is replaced.

### B1.2 Function changes

- `openFullscreen()`: keep the `!== 'closed'` guard and the `collapsedHeight` measurement; set
  phase to `'opening'`; **delete** the `tick()/centerOnCurrentFrame/updateScrollThumb` tail (moves
  to promotion).
- New `promoteToOpen()`: `if (fullscreenPhase !== 'opening') return;` set `'open'`; set
  `centeredPages = pages` (claim the current page set **before** centering so the
  re-centre-on-new-pages effect doesn't immediately re-run on the same identity); then
  `tick().then(() => { centerOnCurrentFrame(); updateScrollThumb(); })`.
- `collapseFullscreen()`: allow from `'opening'` **or** `'open'` → `'closing'`;
  keep the `updateScrollThumb()` call. Note in a comment: collapsing mid-growth restarts the
  collapse keyframe from full height (a one-frame snap) — accepted, the window is 150ms.
- `handleCardAnimationEnd`: keep the `e.target !== cardElement` guard; `closing → 'closed'`
  (unchanged); `opening → promoteToOpen()`. **Delete `hasCenteredThisOpen` entirely** (its three
  uses: the flag, the reset in openFullscreen/stop-effect/centeredPages-effect, and the
  animationend re-centre branch) — centering now happens exactly once at promotion, plus the
  existing centeredPages identity effect for later page replacements.
- **Fallback timer** (environments where `animationend` never fires — animations disabled, jsdom):

```ts
// The phase machine is driven by animationend; if the animation never runs (disabled
// animations, tests), this fallback fires the same transition a beat after the 150ms
// keyframe would have ended.
$effect(() => {
  if (fullscreenPhase !== 'opening' && fullscreenPhase !== 'closing') return;
  const from = fullscreenPhase;
  const id = setTimeout(() => {
    if (fullscreenPhase !== from) return;
    if (from === 'opening') promoteToOpen();
    else fullscreenPhase = 'closed';
  }, 250);
  return () => clearTimeout(id);
});
```

Plain `setTimeout` is fine here (UI fallback, not audio timing). The effect cleanup clears it on
any phase change and on unmount.

### B1.3 Test update — `test/playerSheetCard.test.ts`

The last case (*"shows every frame of the song when expanded…"*) asserts all frames immediately
after the expand click; under B1 that's now the **intermediate** state. Rework it to cover both
halves — dispatch `animationend` directly on the card (the handler checks
`e.target === cardElement`, and jsdom never fires it naturally):

```ts
target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
await Promise.resolve()
flushSync()
// growth still animating: the card shows the inline page, not the whole song
expect(frames().length).toBe(2)

target.querySelector('.player-sheet-card')!.dispatchEvent(new Event('animationend'))
await Promise.resolve() // promoteToOpen awaits tick() before centering
flushSync()
expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1', '2'])
```

(Adjust the microtask awaits until green — the semantics above are the contract.) The
`clearPages()` tail of the test is unchanged. All other cases don't touch the fullscreen path.

---

## Item B2 — `content-visibility: auto` on the two long lists

### B2.1 Player frames — on the **button**, not the wrapper ⚠

`content-visibility: auto` implies paint containment, which **clips descendants to the element's
bounds** — and the Section brackets deliberately overhang `.player-sheet-frame` by 0.25rem (see
the comment in `PlayerSheetFrame.svelte`). Putting it on the wrapper would clip the brackets.
Put it on `.sheet-frame-target` (the button) instead: the brackets are its *siblings*, and
nothing inside the button overhangs it. In `PlayerSheetFrame.svelte`'s scoped style:

```css
.sheet-frame-target {
  /* existing rules, plus: */
  content-visibility: auto;
  /* height ≈ width × 0.49 (the frame aspect); ~4rem at the default 5-column card width.
     `auto` makes the browser remember the real size after first layout, so the estimate
     only affects never-seen frames' scroll math. */
  contain-intrinsic-size: auto 4rem;
}
```

Width is settled by the grid track (1fr), so only the height estimate matters. This is inert for
the small inline page and pays off in the fullscreen list. The popover's IntersectionObserver
observes this same button and keeps working.

### B2.2 Visualizer frames — in `SheetFrame.css`

`.frame-outer-background` is SheetFrame2's per-column outer (already lives in the shared CSS):

```css
.frame-outer-background {
  /* existing rules, plus: */
  content-visibility: auto;
  contain-intrinsic-size: auto 5rem;
}
```

Only-overhanging-child check: `.frame-empty-counter` would overhang, but it's the dead
"emptyAhead" feature that never renders (see the inert-code comment) — safe. The tempo-changer
background paints on the element itself, not clipped.

**Print insurance** (Chromium has had bugs skipping `content-visibility:auto` content in print) —
add inside the existing `@media print` block:

```css
.frame-outer-background {
  content-visibility: visible;
}
```

(The player card has no print story, so no equivalent needed for `.sheet-frame-target`.)

jsdom ignores unknown properties, so tests are unaffected.

---

## Verification

Automated (all must pass, both games):

```
npm run test:genshin && npm run test:sky
npm run check && npm run check:sky
npm run lint
npm run format:check   # repo uses prettier; recent history has dedicated fmt commits
```

Plus `svelte-autofixer` (Svelte MCP) clean on every modified `.svelte` file.

Manual QA (dev servers: `npm run dev:genshin`, `npm run dev:sky`; the memory
`browser-driving-this-app` has the headless-chromium recipe if no display):

1. **Player, play mode, long song:** sheet card shows the current page; dots/notes/held markers
   look identical to before; the moving accent border (current frame) still tracks playback.
2. **Fullscreen picker:** expand — growth animates smoothly over the inline page, then all frames
   appear and the view centers on the current frame; **Section brackets visible and NOT clipped**
   (the B2 regression to look for); dimming outside the Section; frame click opens the popover;
   "Go to here"/"starts/ends here" work; scroll works and the overlay thumb tracks; Escape and
   outside-tap collapse, including mid-growth; collapse animation still shows all frames while
   shrinking; stop mid-fullscreen drops the card.
3. **Practice + approaching modes:** sheet renders (frames come from filtered playable notes).
4. **Sheet visualizer:** load a long composed song — first paint should be fast and scrolling
   smooth; toggle note names (text appears in filled cells), multi-color rows (three row hues),
   merge empty spaces; **print preview**: dots print black, lattice aligns under filled cells,
   nothing missing at the document tail (the content-visibility print insurance).
5. **Both games:** eyeball dot size/alignment on Sky (5-column frames — the `closest-side` note in
   A.1); tune `--sheet-dot-r` only if visibly off.
6. **Theme switch** while a sheet is on screen: dot color follows (the container-level deriveds).
7. **Node-count sanity** (console, fullscreen open on the same song before/after):
   `document.querySelectorAll('*').length` — expect roughly 3–4× lower after A.

## Acceptance criteria

- Fullscreen expand animation runs without a visible hitch on a 500+ chunk song; frames appear at
  animation end, centered.
- Sheet visualizer first render of a long song no longer blocks for seconds (streaming/windowing
  is *not* in this scope — B2 + A only reduce the constant; note remaining cost honestly if still
  slow on target hardware).
- Zero visual regressions in the checklist above; print output equivalent.
- All tests/checks/lint/format green for both games; no new i18n keys; no game-id branches.

## Explicit non-goals

- Windowing/virtualization and streaming render (the session's "Option B3") — future work if this
  isn't enough on low-end phones.
- Rasterized/canvas frames (Option C).
- The player pause/play button and song-controls regrouping researched in the same session —
  separate task, do not start it from this plan.
