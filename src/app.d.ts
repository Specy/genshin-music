// `@types/webmidi` is global-ambient with no runtime module of its own, so tsc's automatic
// `@types/*` scan does not pick it up: drop this reference and `tsc --listFiles` omits the
// package entirely, leaving MIDIProvider.ts with "Cannot find namespace 'WebMidi'". A `types`
// array in compilerOptions would also pull it in, but doing so opts out of the automatic scan
// for every other @types package as well - this reference is the narrow fix.
/// <reference types="webmidi" />

declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {}
