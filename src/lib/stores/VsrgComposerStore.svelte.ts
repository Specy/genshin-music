// old src/stores/VsrgComposerStore.ts (39 lines) - verbatim port. No mobx in the original (unlike
// PlayerStore/VsrgPlayerStore) - it was already a plain event-emitter class, so this is a
// straight copy, not a runes conversion: zero `@observable`/`makeObservable` to strip, zero
// `$state` to introduce. `listeners` stays a plain `Map` (not `SvelteMap`) DELIBERATELY: it is
// never read from a Svelte template/`$derived`/`$effect` - `addEventListener`/`removeEventListener`
// /`emitEvent` are the only three operations on it, all imperative, called by the Phase-4c
// VsrgComposer page and its pixi renderer class - so there is no reactivity for `SvelteMap` to
// provide here (do not read this as a missed convention). `data?: any` (both here and on
// `VsrcComposerEventCallback.callback`) is preserved from old byte-for-byte: `emitEvent`'s payload
// genuinely varies by event (e.g. `timestampChange` passes a breakpoint object, most others pass
// nothing), so `any` is the correct type-level bound, matching the established
// `WindowProtocol.ts` precedent (Phase-4a Task 8) for the same situation - `eslint-disable-next-line`
// at each of the two use sites rather than narrowing to `unknown` (which would force every future
// consumer to cast anyway, with zero added safety).
export type VsrgComposerEvents =
    'ALL'
    | 'colorChange'
    | 'updateKeys'
    | 'updateOrientation'
    | 'snapPointChange'
    | 'tracksChange'
    | 'songLoad'
    | 'scaleChange'
    | 'maxFpsChange'
    | 'timestampChange'
export type VsrcComposerEventCallback = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape genuinely varies by event, see file header
    callback: (event: VsrgComposerEvents, data?: any) => void,
    id: string
}

class VsrgComposerStore {
    listeners: Map<VsrgComposerEvents, VsrcComposerEventCallback[]> = new Map()

    addEventListener(event: VsrgComposerEvents, callback: VsrcComposerEventCallback) {
        const exists = this.listeners.has(event)
        if (!exists) this.listeners.set(event, [])
        this.listeners.get(event)!.push(callback)
    }

    removeEventListener(event: VsrgComposerEvents, callback: Partial<VsrcComposerEventCallback>) {
        const callbacks = this.listeners.get(event)
        if (!callbacks) return
        const index = callbacks.findIndex(x => x.id === callback.id || x.callback === callback.callback)
        if (index === -1) return
        callbacks.splice(index, 1)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape genuinely varies by event, see file header
    emitEvent(event: VsrgComposerEvents, data?: any) {
        const callbacks = [...(this.listeners.get(event) ?? []), ...(this.listeners.get('ALL') ?? [])]
        callbacks.forEach(c => c.callback(event, data))
    }
}

export const vsrgComposerStore = new VsrgComposerStore()
