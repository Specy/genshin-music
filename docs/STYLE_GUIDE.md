# Style Guide

Assumes Svelte 5.56+, SvelteKit 2.70+, TypeScript 6.0+. Several rules below depend on recent
additions — `{@attach}` needs 5.29, `class` arrays/objects 5.16, `createContext` 5.40,
`MediaQuery` 5.7 — so check the floor before applying them to an older project.

Rules marked **[lint]** are enforced by `npm run lint` and will fail CI. Everything else is
enforced at review. (`any` and `@ts-ignore` become **[lint]** at the end of the refactor's Wave 5;
until then they are review-only, so a clean lint run does not mean a file complies.)

## Readability

- **No one-off helper functions.** If a function is called exactly once, from one place, inline it — unless extraction genuinely clarifies (a named guard clause, a recursive step, a pure helper worth unit-testing). A reader should be able to follow a file top to bottom without chasing indirection.
- **Comments explain _why_, never _what was ported_.** Old file paths, prop-rename tables, "React did X so we do Y" — that belongs in git history, not in code every future reader has to read.
- **Long design rationale lives in `docs/`, not in a file header.** Leave a one-line pointer from the file to the doc. A header is not the place for an essay; it pushes the code a reader came for below the fold.

## Comment rules

_Not style preferences. Every rule below is the exact wording pattern that let a real defect survive multiple review rounds on this branch — treat them as hard rules._

- **Never write another file's line numbers into a comment.** Cite by stable content instead: a quoted fragment, a selector, a symbol name. Line numbers are invalidated by any edit above them — including the author's own edit in the same commit.
  - Bad: `// see the guard at parser.ts:42` Good: `// see the guard in parser.ts`
- **Never write repo-wide quantifiers** — "exactly once in the whole tree", "the only place", "all 12 sites". They're unmaintainable by construction: the next edit anywhere in the tree makes them false, and nothing flags it. State the mechanism instead, because mechanisms stay true and counts don't.
  - Bad: `// the only place that parses this format` Good: `// single source for parsing this format; every caller imports it`
- **Re-derive any factual claim in the session you write it.** Build it, grep it, paste the output. Never restate an earlier draft's reasoning as though it were freshly checked.
- **Run the grep the sentence licenses, not the grep you meant.** If the two disagree, the sentence is wrong — rewrite the sentence, don't rationalize the mismatch.
- **After rewriting a claim, re-verify it under the new wording, before committing.** A fix must verify its own output, not just the input it started from.
- **`QUIRK:` marks deliberate bug-for-bug behaviour. Never delete one.** It's the only thing standing between a future reader and them "helpfully" fixing a bug that something else — a save format, another game definition, a parity guarantee — depends on.
  ```
  // QUIRK: <what looks wrong> is intentional — <what breaks if you "fix" it>.
  ```

## TypeScript

- **`any` is banned. `@ts-ignore` is banned. `@ts-expect-error` requires a written reason.** All three suppress the type checker instead of fixing what it's complaining about; a required reason at least makes the suppression reviewable and greppable later.
- **Don't cast — parse.** A string from a `<select>`, `localStorage`, or a URL is not a union member until it's been checked. Validate once at the boundary and return the union (or `undefined`); nothing downstream needs to assert again. This covers the non-null assertion `!` too: `x!` is a cast that claims a value exists without checking, and fails the same way when the claim is wrong.
  ```ts
  // Bad — asserts, doesn't check; wrong at runtime if the value has drifted
  const pitch = value as Pitch;

  // Good — checked once at the boundary, and cast-free: because PITCHES is
  // typed readonly Pitch[], `find` already returns `Pitch | undefined`
  function parsePitch(value: string): Pitch | undefined {
    return PITCHES.find((pitch) => pitch === value);
  }
  ```
  Reach for a type predicate (`value is Pitch`) only when the check genuinely cannot be expressed as a lookup — a predicate is still an assertion the compiler takes on trust.
- **Derive unions from data, so the table and the type cannot drift apart:**
  ```ts
  const PITCHES = ['C', 'Db', 'D'] as const satisfies readonly string[];
  type Pitch = (typeof PITCHES)[number];
  ```
- **Use `satisfies` for data tables** (config objects, settings definitions, game data) so excess-property checks still apply without widening the literal types away. **Use `unknown` + narrowing at genuine boundaries** (JSON, dynamic imports) — it forces a check before the value can be used for anything, where `any` would not.

## Svelte

- **`{@attach}` over `use:` actions.** Attachments are reactive and compose; actions are wired through an older, separate lifecycle.
- **`$derived` over `$effect` for anything computed. Never assign state inside an effect.**
  ```ts
  // Bad — a second, effect-driven source of truth for something computable
  let doubled = $state(0);
  $effect(() => {
    doubled = count * 2;
  });

  // Good
  let doubled = $derived(count * 2);
  ```
  State written inside an effect can run after whatever it depends on has already changed elsewhere — a timing bug `$derived` structurally can't have.
- **`<svelte:window>` / `<svelte:document>`, or `on()` from `svelte/events`, over manual `addEventListener`.** A manual listener needs a manual, matching removal on every exit path; these clean up automatically when the component is destroyed, so there's no separate step to forget.
- **`createContext` over `setContext`/`getContext`.** It's typed — no key strings, no casts at the call site.
- **`class` as `ClassValue` with clsx-style arrays/objects — not string interpolation, not `class:`.**
  ```svelte
  <!-- Bad -->
  <div class={`card ${isActive ? 'active' : ''}`}>...</div>

  <!-- Good -->
  <div class={['card', { active: isActive }]}>...</div>
  ```
  A template string can't merge with a class the parent passes in without more string surgery; the array/object form composes and stays readable as conditions grow.
- **`svelte/reactivity` built-ins (`SvelteMap`, `SvelteSet`, `MediaQuery`) over hand-rolled equivalents.** Already reactive, already tested, already understood by the next reader — a hand-rolled version is a maintenance liability with no upside.
- **`$state.raw` for large objects that are only ever reassigned, never mutated.** Skips the cost of making something deeply reactive that never needed it. **Keyed `{#each}` always** — never index as key — so Svelte matches items by identity instead of position when the list changes.
- **Styles scoped to the component; CSS custom properties let a parent influence a child.** A scoped style can't leak out and can't be leaked into; a custom property is an explicit, narrow API instead of a global selector reaching in from outside.

## Component API

- **The class prop is `class`, typed `ClassValue` — not `className`.** `className` is a React-ism the port carried over; `class` is what Svelte and HTML actually call it. `class` is a reserved word, so destructuring still needs a local alias — that's a JS syntax limit, not license to rename the prop itself:
  ```ts
  // ClassValue comes from 'svelte/elements'
  let { class: cls }: { class?: ClassValue } = $props();
  ```
- **Props derived from other props use `$derived`, never a one-time computation.** A one-time computation is correct until the source prop changes, then silently stale.
- **Snippets over wrapper elements** where markup is passed through. A snippet hands over markup without forcing an extra DOM node the parent never asked for.
