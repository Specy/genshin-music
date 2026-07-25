// Old: src/app/_navigation/leaveGuard.ts (16 lines) + types.ts (12 lines, LeaveHandler/
// NavigationTarget only - AppNavigation/NavigationOptions are a React-Router-shaped push/replace/
// back/pushWithoutGuard abstraction that SvelteKit's own `goto`/`beforeNavigate` already provide,
// so they are NOT ported) + the guard half of NavigationProvider.tsx (66 lines - only the
// `LeaveGuard` instantiation and its `registerLeaveHandler` passthrough; the push/replace/back/
// pushWithoutGuard methods are the React-Router navigation abstraction SvelteKit's own
// `$app/navigation` replaces directly - see src/routes/+layout.svelte's `beforeNavigate` wiring,
// P4c Task 2).
//
// `LeaveGuard` is a verbatim port: a plain class, zero `$state` - like VsrgComposerStore.svelte.ts
// (Phase-4c Task 1), nothing here is read from a Svelte template/`$derived`/`$effect`, so there is
// no reactivity for runes to provide (the `.svelte.ts` extension matches this directory's naming
// convention for singleton store classes, it does not imply rune usage - same precedent).
//
// `hasHandler` has NO old equivalent - it is a deliberate, minimal addition (a getter, the
// register()/canLeave() logic the ported test suite pins is untouched) needed only because of the
// framework-shape deviation documented in +layout.svelte: old gated at the point of INITIATING a
// navigation (`push`/`replace`/`back` all awaited `guard.canLeave()` before calling the router), so
// it never needed to know "is a handler registered" ahead of time. SvelteKit's `beforeNavigate`
// instead intercepts an ALREADY-STARTED navigation and must decide SYNCHRONOUSLY whether to cancel
// it; without this synchronous check, +layout.svelte would have to cancel+reissue every single
// in-app navigation (even when no editor page has registered a handler) just to await `canLeave()`
// and find out it didn't need to.
export type NavigationTarget = string | '__back__'

export type LeaveHandler = (target: NavigationTarget) => Promise<boolean>

export class LeaveGuard {
    private handler: LeaveHandler | null = null

    get hasHandler(): boolean {
        return this.handler !== null
    }

    async canLeave(target: NavigationTarget): Promise<boolean> {
        return this.handler === null ? true : this.handler(target)
    }

    register(handler: LeaveHandler): () => void {
        this.handler = handler
        return () => {
            if (this.handler === handler) this.handler = null
        }
    }
}

export const navigationGuard = new LeaveGuard()

export function registerLeaveHandler(handler: LeaveHandler): () => void {
    return navigationGuard.register(handler)
}

export function canLeave(target: NavigationTarget): Promise<boolean> {
    return navigationGuard.canLeave(target)
}
