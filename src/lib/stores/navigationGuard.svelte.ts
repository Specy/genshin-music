// See src/routes/+layout.svelte's beforeNavigate wiring for how canLeave() gates an in-app
// navigation. A plain class with zero $state - nothing here is read from a
// template/$derived/$effect, so there's no reactivity for runes to provide; the .svelte.ts
// extension matches this directory's naming convention for singleton store classes and doesn't
// imply rune usage.
//
// hasHandler exists because SvelteKit's beforeNavigate intercepts an already-started navigation
// and must decide synchronously whether to cancel it. Without this synchronous check,
// +layout.svelte would have to cancel+reissue every in-app navigation just to await canLeave()
// and find out it didn't need to.
export type NavigationTarget = string | '__back__';

export type LeaveHandler = (target: NavigationTarget) => Promise<boolean>;

export class LeaveGuard {
  private handler: LeaveHandler | null = null;

  get hasHandler(): boolean {
    return this.handler !== null;
  }

  async canLeave(target: NavigationTarget): Promise<boolean> {
    return this.handler === null ? true : this.handler(target);
  }

  register(handler: LeaveHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = null;
    };
  }
}

export const navigationGuard = new LeaveGuard();

export function registerLeaveHandler(handler: LeaveHandler): () => void {
  return navigationGuard.register(handler);
}

export function canLeave(target: NavigationTarget): Promise<boolean> {
  return navigationGuard.canLeave(target);
}
