# Wave 2 Task 5 (shared+shell+blog) — verification-record correction

Corrects two problems in `61180100`'s own commit message ("refactor: clsx classes + scoped styles
- shared+shell+blog", Wave 2 Task 5). Both are corrections to the verification record, not to code
— none of the 8 `.svelte` files that commit touched need a change for either. Follows the precedent
`docs/superpowers/audits/2026-07-27-wave-2-task-4-live-measurement.md` set for Task 4's own
after-the-fact correction, and the style guide's "re-derive any factual claim in the session you
write it": every number below was re-run this session, not copied from an earlier draft.

## 1. `.default-page` did not match old vs new on blog-post pages

The commit message claims computed styles for a list of selectors including `.default-page`
"matched old vs new on every property checked" on `/`, `/blog`, `/blog/posts/how-to-use-player`,
and `/changelog`. Re-measured live this session on one of the exact pages named — it does not
match there.

**Method**: local dev server (`npm run dev:genshin`) at this branch's `HEAD` (no source changes,
only this document) vs `https://genshin-music.specy.app`, confirmed this session still the
pre-migration Next.js build (`document.scripts` shows `/_next/static/chunks/...` paths, an
`id="__next"` root, zero `svelte-*` classes anywhere in its DOM). Both tabs resized to `1280x800`;
`getComputedStyle` read directly on both origins in the same session.

**`.default-page` on `/blog/posts/how-to-use-player`:**

| | Old | New |
|---|---|---|
| class | `"default-page "` | `"default-page"` |
| raw `style` attribute | `--left-mobile-padding:5rem;--right-mobile-padding:1.4rem;padding-left:var(--menu-size);gap:1rem;line-height:1.5;padding:0` | `--left-mobile-padding:5rem;--right-mobile-padding:1.4rem;padding:0;padding-left:var(--menu-size);gap:1rem;line-height:1.5` |
| computed `padding` | `0px` (all four sides) | `0px 0px 0px 64px` |

**Root cause**, read from source rather than guessed: `BaseBlogPost.svelte` passes `DefaultPage`
`cropped={false}` and `style="padding-left:var(--menu-size);gap:1rem;line-height:1.5"`.
`DefaultPage.svelte`'s `pageStyle` is `` cropped ? style : `padding:0;${style}` ``, so with
`cropped={false}` the element's actual inline style becomes
`padding:0;padding-left:var(--menu-size);...` — shorthand first, longhand second, so the longhand
`padding-left` survives the shorthand and the other three sides stay `0`. The old app's own inline
style places its `padding-left` *before* its trailing `padding:0` (see the raw attribute above,
right column vs left) — opposite order — so its shorthand overwrites the longhand and every side
ends at `0`. Same CSS cascade rule on both sides (a later inline declaration beats an earlier one
covering the same longhand), different source-side declaration order, different visible result: a
real `64px` left inset on the new app that the old app never had.

**Not a Task 5 regression.** `git diff 7e66e6f7..61180100 -- src/lib/components/shell/DefaultPage.svelte`
shows the only change to that file is the `class` attribute's clsx conversion
(`class="default-page {cls}"` → `class={['default-page', cls]}`); `pageStyle`'s template-string
logic is untouched. `BaseBlogPost.svelte` (the file supplying the conflicting `style` prop) does not
appear in `61180100`'s diff at all (absent from `git diff --stat 7e66e6f7..61180100`). This predates
Wave 2 entirely. It is the same category of issue as the commit's own correctly-disclosed "old
app's CSS-modules 'undefined' token" gap — except, unlike that one, this gap is not cosmetically
inert: it is a real, visible `64px` left inset on every blog-post page in the new app, absent in the
old one.

**Scope of the gap**: confined to pages that route through `BaseBlogPost.svelte` (every
`/blog/posts/<slug>` page), because that is the only caller found that passes a `style` prop
containing `padding-left` into `DefaultPage`. Re-checked the other pages `61180100` named:
`routes/blog/+page.svelte` calls `<DefaultPage excludeMenu={closeMenu} contentStyle="gap:1rem">`
and `routes/changelog/+page.svelte` calls `<DefaultPage excludeMenu={true} menu={changelogMenu}>` —
neither passes a `style` prop, so this specific conflict never reaches them. `routes/+page.svelte`
(`/`) renders `<Player>` inside `<AppBackground>`, not `<DefaultPage>` at all, so `.default-page` is
not present on that page; the commit's selector list must have meant a different element there
(`.home`, listed separately in the same sentence).

**Correction**: the commit's blanket "`.default-page` ... matched old vs new on every property
checked" holds for `/blog` and `/changelog` (no conflicting style reaches those pages) but is false
for `/blog/posts/how-to-use-player`, one of the four pages that same sentence names. Record instead:
`.default-page` matched on `/blog` and `/changelog`; on `/blog/posts/*` pages it carries a known,
pre-existing `--menu-size` left-inset (`padding-left: 64px`) that the old app does not have,
unrelated to this diff and not fixed here — the responsible file, `BaseBlogPost.svelte`, is outside
this task's 8-file scope.

## 2. `:global()` census arithmetic

The commit message's `:global()` paragraph reads: "this scope's 5 surviving :global() sites
(ExpandableContainer x2, DonateButton x2, PromotionCard x2, plus BaseBlogPost/BlogElements' 14)".
The parenthetical sums to 20, not 5.

Re-derived by grepping each named file for actual `:global(` selector occurrences (excluding each
file's own prose comments that mention ":global()" without opening a rule):

| File | `:global(` sites |
|---|---:|
| `ExpandableContainer.svelte` | 2 |
| `PromotionCard.svelte` | 2 |
| `DonateButton.svelte` | 2 |
| `BaseBlogPost.svelte` | 7 |
| `BlogElements.svelte` | 7 |
| **Total** | **20** |

"5" was likely meant as "5 files," not "5 sites." **Correction: 20 total `:global()` sites across
5 files, not 5.** Grepped `docs/superpowers/` for the parenthetical's file list and for "5
surviving" — no other tracked document repeats the wrong number. Wave 2's Task 8 wave-exit
`:global()` census (its ledger block is gitignored scratch, per the Wave 1 plan's "none modified
except the ledger (gitignored)") has not run yet, so this document is the correction of record for
that future pass to read the right number from.

## Re-verification after this correction

No `.svelte` file changed, so `node scripts/classAttrCheck.js compare` against the existing
pre-Task-5 snapshot reproduces the commit's own headline unchanged: **421 changed, 0 added, 0
removed.** Independently re-tokenized with a fresh script (not the implementer's, not reused from
Task 4): the 421 changed lines reduce to exactly **11 unique before→after pairs**, every one
whitespace-only — same token set, same order, on both sides of all 11:

| Count | Before | After |
|---:|---|---|
| 200 | `" "` | `""` |
| 78 | `"middle-size-page row "` | `"middle-size-page row"` |
| 51 | `" home-content-element "` | `"home-content-element"` |
| 27 | `"flex-centered pill "` | `"flex-centered pill"` |
| 18 | `"default-page "` | `"default-page"` |
| 17 | `"folder "` | `"folder"` |
| 16 | `" current-page"` | `"current-page"` |
| 7 | `"separator  svelte-cysdcr"` | `"separator svelte-cysdcr"` |
| 3 | `"expandable-container  column"` | `"expandable-container column"` |
| 3 | `" home-content-element current-page"` | `"home-content-element current-page"` |
| 1 | `" promotion-card column"` | `"promotion-card column"` |

Matches the commit's own claimed "421 changed... 11 unique before->after pairs, every one
whitespace-only" exactly.

Gates: `npm run check` and `npm run check:sky` both 2065 files/0 errors/0 warnings; `npm run lint`
clean; `npm test` 137/138 (genshin, 1 skipped) and 136/138 (sky, 2 skipped), matching the
pre-existing skip counts. Node Buffer scan (byte 13) of every file touched by this fix: 0 CR bytes.
