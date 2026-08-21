# Pages Polish — Keybind Cards, Theme Reorder, Home Menu Slimming — Design

Status: SPEC 2026-08-22. Four user-directed items, entirely outside the composer —
companion to `2026-08-22-solo-tracks-and-composer-polish-design.md`, same delivery
discipline. The items are the user's own words; every fact below was verified in code.

The card pattern every "card" below means is the backup page's
([backup/+page.svelte](../../../src/routes/backup/+page.svelte) lines ~251–268):
`<Column gap="1rem">` wrapping `<Card background="none" border="secondary" gap="0.8rem">`
sections, each led by a `<Header type="h2">`.

## 1. Item G — keybinds page sections

[keybinds/+page.svelte](../../../src/routes/keybinds/+page.svelte) is today a flat run of
bare `<h1>`s. Restructure into outlined cards with meaningful grouping:

- **MIDI** card (the `MidiSetup` component) — always rendered;
- everything else stays inside the existing `!globalConfigStore.state.IS_MOBILE` gate,
  exactly as today:
  - **Keyboard keybinds** card — the description line + the `ShapeKeyboard` grid;
  - **Composer shortcuts** card;
  - **Player shortcuts** card;
  - **VSRG** card — vsrg composer shortcuts, vsrg player shortcuts, and the k4/k6 lane
    keybinds together, each with its own smaller header inside the card (they are three
    views of one feature; five sibling cards of near-identical shortcut tables would be
    noise, not separation).

The bare `<h1>`s become the cards' `Header type="h2"`. No i18n changes — every section
title already exists. THE LOAD-BEARING COMMENT in the `vsrgKeyGroup` snippet (Svelte
fine-grained tracking breaks if `getVsrgKeybinds(n)`'s array is wrapped in an intermediate
literal) must survive the restructure — keep the direct call-site pattern it protects.

## 2. Item H — theme page reorder and cards

[theme/+page.svelte](../../../src/routes/theme/+page.svelte) currently runs: import button
→ color editor → your themes → default themes → preview. New order (user's words: "put the
'default themes' selection as the first thing, then the 'your themes' and below that there
is the thing to edit colors"):

1. **Default themes** — the first section, plain heading + preview grid as today (the user
   carded only the two below);
2. **Your themes** card — the saved-theme grid, the new-theme button, AND the import-theme
   `FilePicker` button (it moves down from the page top; importing lands in your themes);
3. **Edit colors** card — the current theme's name display, the `ThemePropriety` loop, the
   three `ThemeInput`s, and the opaque-performance warning;
4. the **preview** section, unchanged, still last.

New i18n key for the third card's header: `theme:edit_colors` ("Edit colors"), REAL
translations in all 9 `static/locales/*.json`. `theme:your_themes` and
`theme:default_themes` already exist and stay the other headers.

**THE QUIRK IS LOAD-BEARING**: the trailing `{#key selectedPagePreview}` `PageMetadata` at
the bottom of the template carries a comment beginning "read before restructuring this
page" — read it, and keep that block the LAST thing in the template.

## 3. Item I — partners moves into the blog

- Remove the partners `pageRedirect` from
  [Home.svelte](../../../src/lib/components/shell/Home.svelte) (~line 506).
- `home:blog_and_guides_name` becomes **"Blog, Guides & Partners"** in
  [en/index.ts](../../../src/lib/i18n/locales/en/index.ts) (line ~153), and each of the 9
  static locales gets a real combined translation — BUILD IT from that locale's OWN
  existing words for `blog_and_guides_name` and `partners_name` (e.g. ja already has
  「ブログとガイド」 and 「パートナー」), never invent new terminology.
- The blog index page ([blog/+page.svelte](../../../src/routes/blog/+page.svelte)) gets an
  obvious Partners entry point labeled `t('home:partners_name')` linking to `/partners`:
  place it where it reads naturally (beside the "Posts" header row, or under the welcome
  header — judge against a screenshot), and add a Partners link to the
  `indexNavChildren` nav links too.
- The `/partners` page itself is unchanged — still routable, still titled with
  `home:partners_name`, which therefore KEEPS its key.

## 4. Item J — the home menu loses its clear-cache button

Delete the clear-cache `AppButton` (Home.svelte ~line 523), the `clearCache()` function
(~line 43), and whatever imports that leaves unused (`clearClientCache` if nothing else
uses it). The surviving affordances are the changelog page's own button and the
`/delete-cache` page.

**Key surgery, uniform across en + all 9 locales** (the i18n parity test pins key sets):

- REMOVE `home:clear_cache_name` and `home:cache_reload_warning` — this button was their
  only consumer.
- KEEP `home:cache_cleared` and `home:error_clearing_cache` — the `/delete-cache` page
  uses both.
- KEEP `home:clear_cache_warning` — it is the first-visit welcome blurb, not the button.

## 5. Out of scope

The `/partners` and `/delete-cache` pages' own content; the changelog page; any changelog
entry (deferred with the rest of the feedback stream); PagesVersions/page-visit tracking.

## 6. Delivery

One opus worktree agent (never fable). It may run in parallel with the Solo agent — the
only shared files are the locale JSONs and `en/index.ts`, in different namespaces; merges
land sequentially with the operator resolving any overlap. Gates as ever: `npm test`
(genshin then sky), `check`, `check:sky`, `lint`, `format:check`, and screenshots of the
keybinds page, theme page, blog index, and home menu.
