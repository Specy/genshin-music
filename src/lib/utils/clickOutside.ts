// old: src/lib/Hooks/useClickOutside.ts - a React hook returning a ref to attach to the
// "container" element, plus a `document` click listener wired up in an effect gated on
// `options.active` (re-subscribing whenever `active`/`ignoreFocusable` changed). Ported as a
// Svelte action instead of a hook: the hook's `innerRef` becomes the action's own `node`
// (Svelte already hands every `use:` action the element it's attached to - no ref needed), and
// the old callback-ref indirection (`callbackRef.current` kept fresh every render purely so the
// effect's stable closure could call the LATEST callback without re-subscribing on every
// identity change - see the hook's own "i have no idea why this is here" comment) is replaced
// by `update()` refreshing a plain closure variable: the direct Svelte-action equivalent of
// "always call the latest params, don't re-attach just because a callback identity changed".
// Semantics preserved exactly: the `document` click listener is attached ONLY while `active` is
// true, and outside-click detection + the `ignoreFocusable` bail both work identically to the
// old hook.
type ClickOutsideParams = {
    active?: boolean
    ignoreFocusable?: boolean
    onOutside: () => void
}

export function clickOutside(node: HTMLElement, params: ClickOutsideParams) {
    let current = params

    function onClick(e: MouseEvent): void {
        const clickedOutside = !node.contains(e.target as Node | null)
        if (clickedOutside) {
            if (current.ignoreFocusable && hasFocusable(e)) return
            current.onOutside()
        }
    }

    function attach() {
        document.addEventListener('click', onClick)
    }

    function detach() {
        document.removeEventListener('click', onClick)
    }

    if (current.active) attach()

    return {
        update(newParams: ClickOutsideParams) {
            const wasActive = current.active
            current = newParams
            if (current.active && !wasActive) attach()
            else if (!current.active && wasActive) detach()
        },
        destroy() {
            if (current.active) detach()
        }
    }
}

// Ported verbatim (same logic/branches/class-name strings as old - neither export below has any
// React dependency in the old file either). Only deviation: the old file's three `//@ts-ignore`
// comments (suppressing `EventTarget` not having `tagName`/`classList`) are replaced by a single
// explicit `as HTMLElement` cast - this file, unlike the old untyped-`.tsx` one, is linted under
// `@typescript-eslint/ban-ts-comment` (src/lib/utils is outside the core eslint ignore), which
// bans bare `ts-ignore` outright; a cast reaches the same runtime behavior without a suppression.
export function hasFocusable(e: MouseEvent) {
    const path = e.composedPath()
    return path.some(e => {
        const el = e as HTMLElement
        if (el.tagName === "INPUT" || el.tagName === "BUTTON") return !el.classList?.contains?.("include_click_outside")
        return el.classList?.contains?.("ignore_click_outside")
    })
}

export const IGNORE_CLICK_CLASS = 'ignore_click_outside'
