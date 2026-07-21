// old tsconfig.json had `"compilerOptions": {"types": ["webmidi"]}` - the ambient global
// `WebMidi` namespace + `Navigator.requestMIDIAccess` augmentation MIDIProvider.ts/AppInit.svelte
// need (Phase-4a Task 2). This project's tsconfig has no `types` array (so it can keep
// auto-including every other `@types/*` package), but `@types/webmidi` - a pure global-ambient
// package with no runtime module of its own - isn't picked up by that automatic scan (verified:
// `tsc --listFiles` omits it, unlike e.g. `@types/lodash.clonedeep`/`@types/semver`, which are;
// `@types/color` has the same gap but is masked there because the `color` package ships its own
// bundled types). A triple-slash reference is the standard, narrowly-scoped fix for exactly this
// gap - it does not restrict the default "include every other @types package" behavior the way
// adding a `types` array to compilerOptions would.
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
