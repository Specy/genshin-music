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
