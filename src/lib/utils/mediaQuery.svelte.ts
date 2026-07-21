// Old: src/lib/Hooks/useMediaQuery.ts (React hook: `useState` seeded from `window.matchMedia(query)
// .matches`, guarded for SSR - `typeof window === "undefined"` - then a `useEffect` that
// subscribes a `change` listener on the *same query string* and tears it down on unmount/query
// change). Ported as a Svelte 5 "rune hook": a plain function, callable from a component's own
// `<script>` during initialization, that owns a `$state` value and an `$effect` for the
// subscription - the direct idiomatic equivalent of a React hook pair here (see e.g.
// `$core/theme/ThemeProvider.svelte.ts`/other `.svelte.ts` singletons for the same "runes need a
// .svelte.ts file" constraint). `$effect` bodies never run during SSR/prerendering (same
// guarantee `useEffect` gets from React only running client-side), so only the INITIAL value
// needs the explicit `typeof window` guard - exactly mirroring the old hook's own two-tier guard.
//
// Not in this task's file list (P4a Task 7's brief only names the blog/PromotionCard files) - a
// hard content dependency instead: `blog/index.tsx` and `BaseBlogPost.tsx` both compute
// `useMediaQuery("(orientation: portrait)") && IS_MOBILE` for their `closeMenu` gate (hides the
// app's SimpleMenu sidebar + the BlogNavbar top-bar padding on small portrait screens - see the
// old `$config` no. `useIsNarrow` re-export is unused by anything blog touches and is dropped.
//
// `useIsNarrow()` (a `(max-width: 768px)` wrapper) is not restored - it has zero consumers among
// this task's blob (grepped the whole old branch: only unused).
export function createMediaQuery(query: string) {
    let matches = $state(typeof window === 'undefined' ? false : window.matchMedia(query).matches)

    $effect(() => {
        const mediaQueryList = window.matchMedia(query)
        const listener = () => {
            matches = mediaQueryList.matches
        }
        mediaQueryList.addEventListener('change', listener)
        return () => mediaQueryList.removeEventListener('change', listener)
    })

    return {
        get matches() {
            return matches
        }
    }
}
