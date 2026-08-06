// `@types/webmidi` is global-ambient with no runtime module of its own, so tsc's automatic
// `@types/*` scan does not pick it up: drop this reference and `tsc --listFiles` omits the
// package entirely, leaving MIDIProvider.ts with "Cannot find namespace 'WebMidi'". A `types`
// array in compilerOptions would also pull it in, but doing so opts out of the automatic scan
// for every other @types package as well - this reference is the narrow fix.
/// <reference types="webmidi" />

// Declares the virtual `~icons/<set>/<name>` modules unplugin-icons resolves at build time as
// Svelte components (see vite.config.ts). Same reasoning as the webmidi reference above: this
// is global-ambient with no importable runtime module, and a `types` array in tsconfig would
// opt the whole project out of the automatic @types scan.
/// <reference types="unplugin-icons/types/svelte" />

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
