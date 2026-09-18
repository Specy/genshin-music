// THE WEB MIDI TYPES ARE lib.dom's NOW, and there is no `@types/webmidi` in this project any more
// (2026-09-18): `MIDIAccess`, `MIDIInput` and `MIDIMessageEvent` are plain global interfaces from
// TypeScript's own DOM library, so MIDIProvider.ts and the two components that name them need no
// reference here and no `WebMidi.` prefix.
//
// DO NOT RE-ADD THE PACKAGE. `@types/webmidi` stopped at 2.1.0; everything published since (3.0.1
// is what a dependency update pulled in) is a STUB with no declarations at all, redirecting to the
// unrelated `webmidi` npm library - installing it does not bring the `WebMidi` namespace back, it
// just makes 15 "Cannot find namespace 'WebMidi'" errors look like a missing dependency.
// One real difference the switch carries, handled at its one call site: lib.dom types
// `MIDIMessageEvent.data` as nullable, where the retired package did not.

// Declares the virtual `~icons/<set>/<name>` modules unplugin-icons resolves at build time as
// Svelte components (see vite.config.ts). It is global-ambient with no importable runtime module,
// so tsc's automatic `@types/*` scan does not pick it up - and a `types` array in tsconfig would
// opt the whole project out of that scan, so this reference is the narrow fix.
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
