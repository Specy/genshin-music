# Solo Tracks, Icon Width Cap, Lowered-Sheet Playback Clear — Design

Status: SPEC 2026-08-22 (grilled and confirmed; awaiting implementation via worktree
agents — the user launches them). Three independent work items from the Pro View feedback
stream, plus the glossary term they resolved: CONTEXT.md now defines **Solo** under Songs.

Every decision below was put to the user during grilling on 2026-08-22 and is quoted where
the answer reshaped the plan. Nothing here changes the song format version, any settings
version, or the changelog (the changelog lines — these AND the still-pending zoom line —
stay deferred until the user calls the feedback rounds done).

## 1. Goal

- **A. Icon width cap**: no note mark ever draws past the column's margin. The circle mark
  is the offender — its radius is row-height-derived and Pro View rows can be taller than
  the column is wide.
- **B. Solo**: a per-track flag that narrows playback to the solo set, stacking, saved with
  the song, derived at play time — never rewriting anyone's mute. With the layer-panel UI
  to drive it and a dim cue for what it silences.
- **C. Lowered-sheet playback clear**: in Pro View with the keyboard sheet lowered, playback
  must not spend work animating key states nobody can see — the keys show nothing and cost
  nothing per column until the sheet raises or the song stops.

## 2. Item A — one shared content box for note marks

**Decision (user-confirmed)**: cap the circle to the border rect's box; rect and line stay
as they are. The shared box is `noteWidth − margin` wide — the exact box the filled rect,
the border rect, and the line already respect (all three span
`[margin/2, noteWidth − margin/2]`).

**The defect**: `ComposerCache.drawNote` ([ComposerCache.ts:261](../../../src/lib/components/pages/Composer/ComposerCache.ts))
draws the circle mark at radius `noteHeight / 3 − 0.5` — height-derived, width-blind. The
texture frame is the full column (`noteWidth = width`), so when a cell is taller than it is
wide the circle's diameter outgrows the column and the frame clips it flat at the column's
very edge, past the margin. Pro View makes such cells routine: Sky's small Editable Zones
fit tall rows, and the ×3 zoom multiplies them ("circle in max scale clips out in sky").

**The fix**, in the one shared `drawNote` so both games and both views inherit it:

```
radius = min(noteHeight / 3 − 0.5, (noteWidth − margin) / 2 − 0.5)
```

The height rule keeps the size it has always had whenever it fits; the width term only
bites when the cell is taller than wide. The `− 0.5` on both terms is the existing stroke
allowance (stroke width 1, centered on the path) and keeps the ink inside the box.

**Scope fence**: the timeline breakpoint circle (ComposerCache.ts:178) is a different mark
with a different box — untouched. The DOM keyboard's marks are CSS classes, not these
textures — untouched. The transient aspect distortion during a live zoom (sprite scaled to
the live row height until the debounced cache rebake) is pre-existing and out of scope.

**Test**: extract the radius rule as an exported pure helper (house pattern — the cache
keeps calling it, the test imports it): tall-cell inputs get the width cap, wide-cell
inputs keep the height rule, and the returned diameter never exceeds `noteWidth − margin`.

## 3. Item B — Solo

### 3.1 The rule (all user-confirmed)

- `solo: boolean` on `InstrumentData`, default `false`, serialized beside `muted` in
  `SerializedInstrumentData` ([SongClasses.ts](../../../src/lib/core/Songs/SongClasses.ts)),
  deserialized with `?? false`. **No format version bump**: old files load with no solos,
  old app versions ignore the field.
- Audibility is DERIVED, never written onto other tracks:

  ```
  audible(track) = !track.muted && (no track is solo || track.solo)
  ```

  Mute wins on its own track ("Solo selects the set; the track's own Mute still silences it
  inside that set"). Stacking falls out of the rule — soloing one track never un-solos
  another (CONTEXT.md: _avoid_ exclusive solo).

- One pure helper owns the rule for every caller —
  `isTrackAudible(instruments: readonly InstrumentData[], index: number): boolean` in
  SongClasses.ts beside InstrumentData. **Missing-roster-entry rule**: a track with no
  roster entry stays audible when no solo exists (today's Player behavior — its gate is
  `insData?.muted`) and is silent when a solo set exists (it is not in the set):

  ```ts
  const data = instruments[index];
  if (data?.muted) return false;
  return !instruments.some((i) => i.solo) || !!data?.solo;
  ```

### 3.2 Playback seams

Replace the three `muted` gates with the helper — they are the complete set:

- Composer `playSound` ([Composer.svelte:628](../../../src/lib/components/pages/Composer/Composer.svelte)) —
  covers committed playback AND live keyboard previews. **Deliberate consequence the user
  accepted**: previews on a non-solo layer go silent while any solo exists, exactly as they
  already do on a muted layer. The rule is uniform.
- Composer `playHeldSound` (Composer.svelte:651) — the live sustain-recording press.
- Player `playSound`'s song branch ([Player.svelte:375](../../../src/lib/components/pages/Player/Player.svelte))
  — **the Player honors solo** (user-confirmed): a saved solo state sounds identical
  wherever the song plays, consistent with the Player already honoring mute. The Player's
  main-instrument live branch (no `songNote`) is not a track and is untouched.

Audio recording records what plays, so it follows for free. MIDI export ignores mute today
and ignores solo the same way — untouched.

**Toggling rides the mute funnel**: the panel buttons call
`onInstrumentChange(ins.set({ solo: !ins.solo }), i)` → `editInstrument`
(Composer.svelte:531) → `song.setInstrument` + `handleAutoSave` + `syncInstruments`. That
funnel is load-bearing: it marks the song dirty, autosaves, and carries the ADR-0006
committed-audio resync so a mid-playback solo flip retracts/recommits correctly — and it
takes **no undo snapshot** (only name/Basepoint changes do; solo behaves like mute here).

### 3.3 Panel UI ([InstrumentControls.svelte](../../../src/lib/components/pages/Composer/InstrumentControls.svelte))

- **The solo button**: a full-width toggled AppButton labeled with
  `t('instrument_settings:solo')`, rendered as a row BELOW the existing gear|eye grid
  (`.instrument-settings` is `grid-template-columns: 1fr 1fr`; the solo bar spans both
  columns). Visibility rule (user-confirmed, "same bar on soloed rows"):
  - **selected row**: always shown (this is where solo is turned ON);
  - **unselected row**: shown ONLY while that track's solo is on — the always-visible
    remove control, under the name, no gear/eye beside it;
  - unselected row without solo: nothing, as today.
    Rows showing the bar need more height (selected today: 4.2rem; plain: 3rem — implementer
    picks exact values against screenshots; `scrollIntoViewOnSelect` must still work).
- **Shared button language** (USER REVISION during grilling — "add a background to the
  visible and settings buttons so that they share the same UI. also for when they are
  selected, show an accent color"): `.instrument-settings .app-button` drops its
  `background-color: transparent` (App.css:2800) for a real resting background, identical
  across gear, eye and solo; the active state is the accent pair
  (`--accent` / `--accent-text`), where active means: gear — while its settings popup is
  open; eye — while the layer is hidden; solo — while solo is on.
- **Dim cue** (user chose list-only; canvas untouched — dimming canvas marks would need new
  baked texture variants per mark combination and the canvas already has the hide toggle):
  while ANY track is solo, every non-solo track's row renders at reduced opacity
  (recommend ~0.55) — **including the selected row if it is non-solo**; the cue stays
  honest about what is silent. Soloed rows stay full opacity. The mute/hidden status icons
  keep rendering inside the dimmed rows.
- The InstrumentSettingsPopup gets NO solo control (user placed it in the row; popup
  untouched).

### 3.4 i18n

New key `instrument_settings:solo`. English in
[src/lib/i18n/locales/en/index.ts](../../../src/lib/i18n/locales/en/index.ts); REAL
translations (not English mirrors) in all 9 `static/locales/*.json`: ja ソロ, ko 솔로,
zh 独奏, zh-TW/zh-HK 獨奏, ru Соло, pt/id/tr Solo. The i18n parity test pins the key set.

### 3.5 Fixtures

`composed-song-v5.json` is a LIVING golden (test/golden.ts): adding `solo: false` to
serialized instruments legitimately moves it. Regenerate with
`npm run test:update-fixtures` for BOTH games and review the diff — the only acceptable
change is `"solo": false` appearing per serialized instrument (in every member of the
golden that embeds instruments, `toRecorded` included if RecordedSong carries them).
FROZEN fixtures (composed-song.json, composed-song-v4.json, …) must not change by a byte.

### 3.6 Tests

- SongClasses: serialize/deserialize round-trip carries `solo`; a v5 payload without the
  field deserializes to `false`.
- `isTrackAudible`: no-solo case reduces to `!muted`; one solo silences the others; stacked
  solos both sound; muted+solo is silent; missing roster entry follows §3.1's rule.
- Panel (component-mount, house style of test/composerInstrumentPanel.test.ts): solo bar
  visibility (selected always; unselected only while on); toggling calls
  `onInstrumentChange` with a `solo`-flipped entry and the row's own index; dim applied to
  non-solo rows (selected included) exactly while any solo exists.

## 4. Item C — lowered-sheet playback clear

**Decision (user's own words)**: "no i dont want to unmount it, i just dont want the note
states to show. i dont want it to update when playback but if you are just moving around
the sheet and editing notes it should still work. During playback if the keyboard is
lowered, all notes in it are unselected."

**The gate**: `proView && !keyboardSheetRaised && isPlaying` — one derived boolean in
Composer.svelte (`keyboardSheetRaised` already includes `isRecordingAudio`, so recording —
which force-raises the sheet — is unaffected by construction). NOT a freeze: while the gate
holds the keyboard shows **all keys unselected**; browsing/editing with the sheet lowered
while stopped keeps updating exactly as today; raising the sheet mid-playback restores live
flashes immediately.

**Where it lands** (two consumers, both currently recomputing per column advance):

- `heldButtons` ([Composer.svelte:1229](../../../src/lib/components/pages/Composer/Composer.svelte)):
  first line returns a module-constant empty `Set` while the gate holds — the early return
  reads nothing else, so column advances stop re-running the derived entirely.
- `layerStatuses` ([ComposerKeyboard.svelte:56](../../../src/lib/components/pages/Composer/ComposerKeyboard.svelte)):
  Composer passes the gate into the keyboard's `data` (e.g. `noteStatesCleared`); the
  derived returns a module-constant empty `Map` before reading the column. `get(i) ?? 0`
  then answers 0 for every key — unselected — and the STABLE reference is the point: the
  `data` object literal still gets fresh identity per column, so the derived re-enters, but
  it must return the same Map so no key's `layer` prop changes and no DOM repaints. Do not
  return `null` — that is the existing error branch ("Err").

**Comments that become lies** and must be rewritten with the new rule: the
`data.proView` doc in ComposerKeyboard ("it stays MOUNTED while lowered so it keeps
[flashing]") and Composer's template comment above `<ComposerKeyboard>` ("still mounted
while it is down so its active-note flashes keep running") — both now hold only while the
song is stopped.

**Test** (component-mount of ComposerKeyboard): with `noteStatesCleared` true no key
carries a `layer-N` class despite a populated column; flipping it false repaints the
statuses; `held` marks follow the same gate through the `heldButtons` prop.

## 5. Round additions (USER ADDITION, 2026-08-22 — found while reviewing the batch)

### 5.1 Item D — right tool column minimum width

`.buttons-composer-wrapper-right` must never be narrower than **3.5rem**. Its width comes
from the `.tool` buttons inside it (`width: 4vw`, App.css:2413), and 4vw drops below
3.5rem on every viewport under 1400px — so this bites on most laptops, and THE CANVAS
FORMULA MUST FOLLOW: composerCanvasGeometry.ts owns the complement in two places —
`bodyWidth × 0.96 − DESKTOP_CANVAS_INSET_PX` (line ~319) and the printed CSS twin
`calc(96vw − …px)` (line ~419) — and test/composerCanvasCss.test.ts pins the stylesheet
declarations to that formula. A min-width the formula doesn't know shifts the canvas under
or past the column. So, together: `.tool` becomes `width: max(4vw, 3.5rem)`; the JS term
becomes `bodyWidth − max(0.04 × bodyWidth, 3.5 × ROOT_FONT_SIZE) − INSET`; the CSS string
becomes the matching `calc(100vw − max(4vw, 3.5rem) − …px)`; the pinning test learns the
`max()`. The mobile media block (`flex: 1`, App.css ~3313) keeps ruling below
COMPOSER_MOBILE_MAX_WIDTH — the desktop formula's guard already scopes this.

### 5.2 Item E — closing the tools discards the clipboard

Today `toggleTools` (Composer.svelte:1657) clears the selection on close but deliberately
keeps the clipboard (its comment: "is not a clipboard clear") so a copy could cross songs.
USER REVISION of that decision: cross-song copy/paste stays supported ONLY while the panel
remains open — closing the panel discards the clipboard
(`clipboard = { columns: [], pitches: [] }`, the same reset `resetSelection` does) along
with the selection clear that already happens. Rewrite the now-false comment with the new
rule. Reopening starts clean, exactly as the user asked ("if i close it, it should be
discarded").

### 5.3 Item F — Pro View floating tools translucency

With the tools open in Pro View, the floating panel renders at **opacity 0.8** (today
`.tools-visible` sets 1) and **`--backdrop-amount: 2px`** (today 3px). Compressed View
keeps today's values. THE TRAP: ComposerTools is a SIBLING of `.composer-grid`, not a
descendant — the song-info overlay already documents this exact trap in the template — so
`.composer-grid-pro .tools-visible` can never match. Pass `proView` into ComposerTools and
put a modifier class on the floating panel element itself.

## 6. Out of scope

Solo in the settings popup; canvas dimming of non-solo marks; MIDI export changes; any
settings-version bump (no new app setting exists); changelog + changelog i18n (deferred
with the zoom line until feedback rounds close); unmounting the lowered keyboard.

## 7. Delivery

Worktree agents on **opus, never fable** (standing rule), landed sequentially — B and C
both edit Composer.svelte (B: the two play gates; C: `heldButtons` + the keyboard `data`
wiring), and E edits it too (toggleTools):

- **Agent 1 — the small batch**: items A (§2), C (§4), D, E, F (§5). Touches
  ComposerCache, Composer.svelte (C + E regions), ComposerKeyboard, ComposerTools,
  composerCanvasGeometry + its pinning test, App.css.
- **Agent 2 — Solo (§3)**, launched only after Agent 1 merges: SongClasses, the three play
  gates, InstrumentControls, App.css panel block, i18n, fixtures.

Gates per landing, as ever: both game suites (`npm test` = genshin then sky), `check`,
`check:sky`, `lint`, `format:check`, screenshot smoke of the panel and the Pro View
keyboard, and a reviewed `git diff --stat test/fixtures/` for §3.5's regeneration.

## 8. Panel polish (USER REVISION, 2026-08-22, after the solo landing)

Four adjustments to §3.3's shipped panel, all in InstrumentControls.svelte + App.css:

- `.instrument-settings` gains `gap: 0.2rem` and `padding: 0.2rem`;
  `.instrument-solo-button` loses its `margin-top: 0.15rem` (the grid gap replaces it).
  Row heights follow if the spacing changes what fits.
- The gear and eye buttons render at different heights today (15px vs 16px icons inside
  `height: fit-content` buttons) — uniform them: same box height for both regardless of
  icon size.
- The resting surface becomes `background-color: var(--secondary)` with
  `color: var(--secondary-text)` — replacing the translucent black. This supersedes §3.3's
  "inherited text colour has to keep reading over it" rationale: the secondary pair brings
  its own text colour. The accent active state is unchanged.
- The layer rows lose their TEXT COLOR TRANSITION: `.app-button`'s base transition carries
  `color 0.2s`, so selecting a layer fades the row's text into the selected colours.
  Scope an override to the instrument rows' buttons that drops the `color` term (keep
  background/filter transitions as they are everywhere else).

## 9. The open tools take the bottom (USER ADDITION, 2026-08-22, after §8)

In Pro View the floating tools panel and the keyboard sheet compete for the bottom of the
window, so while the tools are open the sheet goes down — and closing the tools gives the
sheet back exactly as it stood before they opened. The restore is the derivation itself:
`keyboardSheetRaised` becomes `(keyboardRaised && !isToolsVisible) || isRecordingAudio`,
and `keyboardRaised` is never rewritten, so there is no memory to keep or corrupt.
Recording still outranks the tools (its only stop control lives on the sheet). The two
raise controls go inert while the tools are open — the KeyK shortcut and the sliver (which
is hidden) — because a control that visibly does nothing must not spring its stored flip
on the user at the tools' close. The §4 playback clear composes with this for free: a
tools-lowered sheet during playback clears its keys like any lowered sheet.

## 10. The open lock wears a tint (USER ADDITION, 2026-08-22, with §9)

While the View Lock is open, its tool button carries
`background-color: color-mix(in srgb, var(--accent) 50%, var(--primary-darken-10))` — a
half-accent tint of the tool column's own resting surface, saying the frame is in the
user's hands. `CanvasTool` gains a `toggled` prop mapping to App.css's `.tool.tool-toggled`
(two classes so the tint holds through `:hover`); the lock is its only wearer today.
