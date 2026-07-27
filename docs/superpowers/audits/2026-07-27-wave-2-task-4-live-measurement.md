# Wave 2 Task 4 (menu+utility+layout) — live-measurement evidence

Supersedes the unsubstantiated claim in `a01b1936` ("refactor: clsx classes + scoped styles -
menu+utility+layout")'s own commit message, which asserted computed styles were checked
"Live-measured against https://genshin-music.specy.app on /player and /composer ... byte-for-byte
identical old vs new" without citing a single selector, value, or old-vs-new pair. Per
`docs/superpowers/plans/2026-07-27-wave-2-component-api-and-styling.md` Task step 4 ("Report the
measurements") and Exit Criterion 5 ("Live measurement performed per family ... with results
recorded") — this document is that report, produced after the fact from a review round that
flagged the gap. Static reasoning about CSS is not evidence per that plan; the numbers below are.

## Method

- **Old app**: `https://genshin-music.specy.app`, confirmed this session (not assumed) to still be
  serving the pre-migration Next.js/React build — `document.scripts` shows
  `/_next/static/chunks/...` paths, zero `svelte-*` scoped-style classes anywhere in the DOM, no
  `#root` React marker either (checked directly), matching the "old (Next.js/React)" framing
  `docs/superpowers/audits/2026-07-26-bundle-comparison.md` already established for this same
  origin.
- **New app**: local `vite dev` server (`npm run dev:genshin`) at this session's `HEAD` (`a01b1936`,
  no source changes made by this fix beyond this file) — i.e. the exact tree the reviewed commit
  produced.
- **Tool**: Claude Code's Browser pane. Screenshot compositing was unavailable in this session (as
  it reportedly was for the review session), but `javascript_tool`'s `getComputedStyle()` calls,
  `read_page`, `get_page_text`, and `computer` clicks all worked — arguably stronger evidence than
  a screenshot anyway, since it reads exact string values instead of eyeballing pixels.
- **Matched viewport**: both tabs resized to `1280x800` before the headline comparisons. A first
  pass (below, "viewport-mismatch control") was taken *before* the resize with the two tabs at
  different viewport heights (old explicitly `1280x720`, new left at its default `1280x900`) and is
  kept here deliberately: it shows exactly the divergence you'd expect (`.column`'s viewport-relative
  height tracking each tab's own height, 720px vs 900px, every other property still identical) —
  proof this comparison method is sensitive to a real difference and not a rubber stamp. All
  headline numbers use the matched `1280x800` pair.
- **Matched interaction state**: for the interaction-gated classes (`.side-menu-open`,
  `.menu-panel-visible`, `.menu-item-active`), both tabs were driven through the identical sequence
  — reload, `document.querySelector('.close-home').click()`, then click the same named menu button
  (`aria-label` `"Open library menu"` on `/player`, `"Open songs menu"` on `/composer`) — using
  `element.click()` rather than coordinate-based clicks after the first attempt showed coordinate
  clicks on the "close home" control were unreliable in this headless setup (didn't flip
  `homeStore.state.visible`, confirmed by reading the element's own inline `style` attribute before
  and after).
- Every value below is `getComputedStyle(el).getPropertyValue(prop)` read directly, for the same
  named CSS class, from both origins in the same session — not retyped from memory.

## A. Mechanical parity (`classAttrCheck`) — re-derived, not restated

Independently re-ran `node scripts/classAttrCheck.js compare` against
`.superpowers/sdd/class-attr-snapshot.json` (mtime confirms it was written ~20 min before
`a01b1936`, i.e. the correct pre-task-4 baseline) rebuilt at `HEAD`:

```
Changed (306). Added: none. Removed: none.
```

Then wrote and ran an independent tokenizing script (not the implementer's) over the same
before/after pairs. All 306 reduce to exactly **8 unique before→after pairs**, all whitespace-only
(identical token content and order on both sides — only leading/trailing/doubled spaces that clsx
drops differ):

| Count | Before | After |
|---:|---|---|
| 167 | `"row "` | `"row"` |
| 53 | `"menu-item "` | `"menu-item"` |
| 27 | `"menu-wrapper "` | `"menu-wrapper"` |
| 21 | `"menu-item  "` | `"menu-item"` |
| 17 | `"menu-panel "` | `"menu-panel"` |
| 10 | `"column "` | `"column"` |
| 8 | `"side-menu  "` | `"side-menu"` |
| 3 | `"menu "` | `"menu"` |

Since HTML tokenizes `class` on whitespace, a whitespace-only difference cannot change which CSS
rules match an element — this is why the live numbers below come out identical.

## B. Live computed-style measurement — real numbers

All properties the plan names: padding, margin, background-color, color, border, border-radius,
width, height, gap. Every row below is old vs new, side by side; **every property matched** unless
otherwise flagged.

### `/player`, matched viewport `1280x800`

**`.side-menu` / `.side-menu-open`** (`MenuPanelWrapper.svelte`, the `isOpen === true` branch —
one of the three sites the review round flagged as unexercised by the static corpus; now
live-verified):

| Property | Old | New |
|---|---|---|
| class | `menu_side-menu__pcB3K undefined ` | `side-menu` |
| padding | `16px` | `16px` |
| margin | `0px` | `0px` |
| background-color | `rgba(237, 229, 216, 0.95)` | `rgba(237, 229, 216, 0.95)` |
| color | `rgb(21, 20, 20)` | `rgb(21, 20, 20)` |
| border | `0px none rgb(21, 20, 20)` | `0px none rgb(21, 20, 20)` |
| border-radius | `0px 4.8px 4.8px 0px` | `0px 4.8px 4.8px 0px` |
| width | `512px` | `512px` |
| height | `800px` | `800px` |
| gap | `normal` | `normal` |

**`.menu-panel` / `.menu-panel-visible`** (`MenuPanel.svelte`):

| Property | Old | New |
|---|---|---|
| class | `menu_menu-panel__52O_y menu_menu-panel-visible__vEqiD` | `menu-panel menu-panel-visible` |
| padding | `0px` | `0px` |
| margin | `0px` | `0px` |
| background-color | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |
| color | `rgb(21, 20, 20)` | `rgb(21, 20, 20)` |
| border | `0px none rgb(21, 20, 20)` | `0px none rgb(21, 20, 20)` |
| border-radius | `0px` | `0px` |
| width | `480px` | `480px` |
| height | `768px` | `768px` |
| gap | `normal` | `normal` |

**`.menu-item`** (the `close-home` `MenuButton` instance):

| Property | Old | New |
|---|---|---|
| padding | `8px` | `8px` |
| margin | `0px` | `0px` |
| background-color | `rgb(73, 84, 102)` | `rgb(73, 84, 102)` |
| color | `rgb(211, 189, 142)` | `rgb(211, 189, 142)` |
| border-radius | `8px` | `8px` |
| width | `44.7969px` | `44.7969px` |
| height | `44.7969px` | `44.7969px` |

**`.menu-item-active`** (`MenuItem.svelte`, the "Library" item — required unwinding a real quirk:
the `close-home` button's coordinate click didn't actually flip `homeStore.state.visible`, which
gates `MenuItem`'s `isActive`; switching to `element.click()` fixed it, confirmed by reading
`.home`'s inline `style` before/after):

| Property | Old | New |
|---|---|---|
| class | `menu_menu-item__srmws menu_menu-item-active__ddcQB undefined` | `menu-item menu-item-active` |
| padding | `1px 6px` | `1px 6px` |
| margin | `0px` | `0px` |
| background-color | `rgb(73, 84, 102)` | `rgb(73, 84, 102)` |
| color | `rgb(211, 189, 142)` | `rgb(211, 189, 142)` |
| border | `0px none rgb(211, 189, 142)` | `0px none rgb(211, 189, 142)` |
| border-radius | `8px` | `8px` |
| width | `44.7969px` | `44.7969px` |
| height | `44.7969px` | `44.7969px` |
| gap | `normal` | `normal` |

**`.row`** (`Row.svelte`, `middle-size-pages-wrapper` and its child link) — viewport-independent,
so this pair is valid even from the pre-resize round:

| Property | Old (wrapper / child) | New (wrapper / child) |
|---|---|---|
| padding | `0px` / `9.6px 16px` | `0px` / `9.6px 16px` |
| margin | `16px 0px 0px` / `0px` | `16px 0px 0px` / `0px` |
| background-color | `rgba(0,0,0,0)` / `rgb(73,84,102)` | `rgba(0,0,0,0)` / `rgb(73,84,102)` |
| border-radius | `0px` / `8px` | `0px` / `8px` |
| width | `640px` / `202.656px` | `640px` / `202.656px` |
| height | `59.1875px` / `59.1875px` | `59.1875px` / `59.1875px` |
| gap | `16px` / `16px` | `16px` / `16px` |

**`.floating-dropdown` / `.floating-dropdown-active`** (`FloatingDropdown.svelte`, the "..." toggle
on a song row — added in a follow-up pass; this document's first pass waved this site off instead
of measuring it, which section C now corrects). Recipe, run once per origin since songs live in
that origin's own IndexedDB: composed and saved a song via the actual composer UI, then on
`/player`, reload → `document.querySelector('.close-home').click()` → click the `"Open songs
menu"` menu item → locate that song's row → read the toggle wrapper's `class` and computed style
closed → click its toggle (`button[aria-label="Open"]`) → read both again open. `cls` is `''` (the
prop default; no real caller passes one) and `isActive` starts `false` (its `$state` default) in
both states measured, i.e. the real, only-ever state every instance is in — not a synthetic one:

| | Old | New |
|---|---|---|
| class (closed) | `" floating-dropdown "` (leading **and** trailing space) | `"floating-dropdown"` |
| class (open) | `" floating-dropdown floating-dropdown-active"` (leading space only) | `"floating-dropdown floating-dropdown-active"` |

| Property | Old (closed / open) | New (closed / open) |
|---|---|---|
| padding | `0px` / `0px` | `0px` / `0px` |
| margin | `0px` / `0px` | `0px` / `0px` |
| background-color | `rgba(0, 0, 0, 0)` / `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` / `rgba(0, 0, 0, 0)` |
| color | `rgb(234, 232, 230)` / `rgb(234, 232, 230)` | `rgb(234, 232, 230)` / `rgb(234, 232, 230)` |
| border | `0px none rgb(234, 232, 230)` / same | `0px none rgb(234, 232, 230)` / same |
| border-radius | `0px` / `0px` | `0px` / `0px` |
| width | `32px` / `32px` | `32px` / `32px` |
| height | `32px` / `32px` | `32px` / `32px` |
| gap | `normal` / `normal` | `normal` / `normal` |

Every property matched old vs new in both states. Expected: `.floating-dropdown`'s only rule is
`position: relative`, and `.floating-dropdown-active` alone (no descendant) styles nothing on this
element itself — the extra whitespace token can't change which rule matches it either way.

**`.column` viewport-mismatch control** (pre-resize, old tab explicitly `1280x720`, new tab left at
its default `1280x900` — kept as a methodology check, not a headline number): class
`home home-visible ignore_click_outside column` on both; padding/margin/background-color/color/
border/border-radius/gap all identical on both (`0px`/`0px`/`rgba(57,66,72,0.9)`/
`rgb(234,232,230)`/`0px none ...`/`0px`/`normal`); **height differs, 720px vs 900px — exactly
matching each tab's own viewport height**, nothing else. This is the expected signature of an
unmatched-viewport artifact, not a code difference, and it is exactly the kind of divergence a
check that couldn't detect real differences would also fail to flag — so its presence here is
evidence the method works.

### `/composer`, matched viewport `1280x800`, Home closed, "Songs" panel opened

| Class | Property | Old | New |
|---|---|---|---|
| `.row` (`middle-size-pages-wrapper`) | padding/margin/background-color/color/border/border-radius/width/height/gap | `0px` / `16px 0px 0px` / `rgba(0,0,0,0)` / `rgb(234,232,230)` / `0px none ...` / `0px` / `auto` / `auto` / `16px` | identical on every property |
| `.column` (`.home`, now closed → `display:none`) | class, padding, margin, background-color, color, border, border-radius, width, height, gap | `home ignore_click_outside column`; `0px`/`0px`/`rgba(57,66,72,0.9)`/`rgb(234,232,230)`/`0px none ...`/`0px`/`100%`/`100%`/`normal` | identical on every property (both report the literal `100%`/`100%`, not a resolved pixel value, because both are `display:none` at measurement time — expected, and identical either way) |
| `.side-menu-open` (Songs panel) | padding/margin/background-color/color/border/border-radius/width/height/gap | `16px`/`0px`/`rgba(237,229,216,0.95)`/`rgb(21,20,20)`/`0px none ...`/`0px 4.8px 4.8px 0px`/`512px`/`800px`/`normal` | identical on every property |
| `.menu-panel-visible` (Songs panel) | padding/margin/background-color/color/border/border-radius/width/height/gap | `0px`/`0px`/`rgba(0,0,0,0)`/`rgb(21,20,20)`/`0px none ...`/`0px`/`480px`/`768px`/`normal` | identical on every property |

No console errors on either origin during the `/player` and `/composer` passes above
(`read_console_messages`, `onlyErrors`). The one exception, from the follow-up
`.floating-dropdown` pass: the old origin logged two errors — `[object DOMException]` and
`NotAllowedError: Permission to use Web MIDI API was not granted.` The new origin logged none at
the same point. Unrelated to class rendering either way — a Web MIDI auto-connect attempt failing
in an automated browser with no MIDI permission granted, not something the clsx conversion could
cause or fix.

## C. The three residual-coverage sites — closed, two corrections made

The review round that requested this evidence named three conversion sites it believed the static
28-page `classAttrCheck` corpus never exercises with a non-empty `cls`/`isOpen`: `Card.svelte`'s
`[cls, row ? 'row' : 'column']`, `FloatingDropdown.svelte`'s leading-`cls` element, and
`MenuPanelWrapper.svelte`'s `isOpen === true` branch. Re-verifying each independently (per the
style guide's "re-derive any factual claim in the session you write it") found one of the three
premises **wrong**, not just unclosed. A later review round found a second problem, one level
deeper: this document's own first-pass closure of the `FloatingDropdown` bullet below was itself
wrong, not just under-evidenced — corrected in place, with the live measurement it should have had
the first time now in section B:

- **`Card.svelte` — the "unexercised" premise was incorrect.** `PromotionCard.svelte` passes a
  non-empty `class="{cls} promotion-card"` into `Card`, and `routes/blog/+page.svelte:125`'s
  `<PromotionCard alwaysVisible />` reaches it **unconditionally** — it's already in the static
  corpus. Checked directly: `.superpowers/sdd/class-attr-snapshot.json`'s `blog.html` index `77`
  (the pre-task-4 baseline) is `" promotion-card column"`; the same index is **absent** from this
  session's re-run `compare` output (grepped for `blog.html#77` — not present, only `#71/#73/#76/#79`
  are), meaning old and new produce the byte-identical string for this real non-empty-`cls` call —
  it was never flagged because there was nothing to flag. Live-confirmed too: the local dev
  server's `/blog` page renders `.promotion-card` with `border: 1px solid rgb(140, 112, 99)` and
  `border-radius: 6.4px` — exactly the `:global(.promotion-card)` rule from `PromotionCard.svelte`
  (`solid 0.1rem var(--secondary)`, and `Card`'s own `radius="0.4rem"` prop = `6.4px`) — confirming
  the clsx array carries the token through correctly in a real rendered DOM, not just in a string
  diff.
- **`FloatingDropdown.svelte`'s leading-`cls` branch — this document's earlier closure was wrong;
  corrected here.** The first pass called it "genuinely unexercised, on both sides equally" and
  stopped there. That conflated two different things: whether the *static* corpus reaches this
  branch (it doesn't — see below) and whether the branch itself ever runs with real values (it
  does, on every render). Re-grepped this session: there are 5 real `<FloatingDropdown` call sites
  in `src/` (`SongFolder.svelte`, `ComposerSongRow.svelte`, `PlayerSongRow.svelte`,
  `VsrgComposerSongRow.svelte`, `VsrgPlayerSongRow.svelte` — 5, not the first pass's claimed 6),
  and none passes a `class` prop, so `cls` is `''` at every one of them. `isActive`'s `$state(false)`
  default is the state every instance mounts in. That's not an edge case this component sometimes
  hits — `cls=''` with `isActive` closed-then-open is the *only* state `FloatingDropdown` is ever
  really in. Hand-derived and now live-confirmed (section B): closed, old `" floating-dropdown "`
  (leading **and** trailing space) vs new `"floating-dropdown"`; open, old
  `" floating-dropdown floating-dropdown-active"` (leading space only) vs new
  `"floating-dropdown floating-dropdown-active"` — a real, reachable divergence, not a theoretical
  one. It's still true that `classAttrCheck`'s static 28-page corpus never reaches it —
  `FloatingDropdown` only renders inside song-list rows populated from IndexedDB at runtime,
  re-confirmed this session (`grep -rl "floating-dropdown" build/genshinMusic --include="*.html"`
  returns zero files) — but "the static corpus can't see it" and "it's fine as-is" are not the same
  claim, and only the first one is true. Since HTML tokenizes `class` on whitespace, the difference
  is functionally inert (same reasoning the other 8 whitespace-only patterns in section A already
  rely on) — section B's new row now confirms that empirically instead of asserting it. No source
  change was made: the plan (Task step 2) explicitly permits converting a site and recording an
  incidental difference instead of reverting to a template string, which is what task 4 already did
  here.
- **`MenuPanelWrapper.svelte`'s `isOpen === true` branch — closed above.** See `.side-menu-open` in
  section B (`/player` and `/composer`, real numbers, both identical old vs new). It remains true
  that the *static* corpus alone never reaches this state (it's gated by user interaction, which
  `classAttrCheck`'s build-only scan cannot produce) — that part of the original observation stands
  — but it is no longer unverified: live interaction now covers it.

## Conclusion

Every computed-style property the plan names, for every class the review round asked for
(`.menu-item`, `.menu-item-active`, `.menu-panel`/`.menu-panel-visible`,
`.side-menu`/`.side-menu-open`, `.row`, `.column`) plus `.floating-dropdown`/
`.floating-dropdown-active` (added in a follow-up pass — see section C), on both `/player` and
`/composer`, matched old vs new as identical strings. Combined with section A's independent
re-derivation (306 changed / 0 added / 0 removed, all 8 unique pairs whitespace-only, same token
content and order), this replaces `a01b1936`'s unqualified "byte-for-byte identical" assertion with
the actual numbers behind it. All three residual-coverage sites are now closed: `Card` was already
covered by the static corpus (the review round's belief that it wasn't was itself wrong),
`MenuPanelWrapper` was closed live in this document's first pass, and `FloatingDropdown` — waved
off instead of measured in that same first pass — is now closed live too, on record with a genuine
old-vs-new string difference that is computed-style-identical because HTML tokenizes `class` on
whitespace, confirmed above rather than assumed.
