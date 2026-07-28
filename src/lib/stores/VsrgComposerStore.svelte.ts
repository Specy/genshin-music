// `listeners` is deliberately a plain Map, not SvelteMap: it's never read from a Svelte
// template/$derived/$effect (addEventListener/removeEventListener/emitEvent are the only
// operations on it, all imperative), so there's no reactivity for SvelteMap to provide here.
//
// data?: any (here and on VsrcComposerEventCallback.callback) is deliberate: emitEvent's payload
// genuinely varies by event (e.g. timestampChange passes a breakpoint object, most others pass
// nothing), so `any` is the correct type-level bound - narrowing to `unknown` would just force
// every consumer to cast anyway, with no added safety.
export type VsrgComposerEvents =
  | 'ALL'
  | 'colorChange'
  | 'updateKeys'
  | 'updateOrientation'
  | 'snapPointChange'
  | 'tracksChange'
  | 'songLoad'
  | 'scaleChange'
  | 'maxFpsChange'
  | 'timestampChange';
export type VsrcComposerEventCallback = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape genuinely varies by event, see file header
  callback: (event: VsrgComposerEvents, data?: any) => void;
  id: string;
};

class VsrgComposerStore {
  listeners: Map<VsrgComposerEvents, VsrcComposerEventCallback[]> = new Map();

  addEventListener(event: VsrgComposerEvents, callback: VsrcComposerEventCallback) {
    const exists = this.listeners.has(event);
    if (!exists) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  removeEventListener(event: VsrgComposerEvents, callback: Partial<VsrcComposerEventCallback>) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    const index = callbacks.findIndex(
      (x) => x.id === callback.id || x.callback === callback.callback
    );
    if (index === -1) return;
    callbacks.splice(index, 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape genuinely varies by event, see file header
  emitEvent(event: VsrgComposerEvents, data?: any) {
    const callbacks = [...(this.listeners.get(event) ?? []), ...(this.listeners.get('ALL') ?? [])];
    callbacks.forEach((c) => c.callback(event, data));
  }
}

export const vsrgComposerStore = new VsrgComposerStore();
