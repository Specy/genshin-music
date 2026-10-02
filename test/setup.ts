// ZangoDB (imported transitively via services) requires IndexedDB at module load.
import 'fake-indexeddb/auto'

// jsdom has no ResizeObserver; SongFolder.svelte's height measurement attaches one, so any
// test that mounts a menu (e.g. playerMetronomeSync) needs at least an inert stand-in. It
// never fires - jsdom does no layout, so there is nothing truthful it could report anyway.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}

// Same story for IntersectionObserver: PlayerFramePopover watches its anchor with one to close
// itself when the frame scrolls out of the Sheet Card's clipped box. Inert for the same reason -
// jsdom does no layout, so every element would be "not intersecting" if it ever fired.
if (typeof globalThis.IntersectionObserver === 'undefined') {
    // @ts-expect-error inert stand-in: jsdom provides no layout for a real one to report on
    globalThis.IntersectionObserver = class IntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}
