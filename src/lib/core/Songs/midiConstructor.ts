// THE `Midi` CONSTRUCTOR, resolved once for every runtime this app is evaluated in.
//
// @tonejs/midi is a badly packaged CJS module and there is NO static import form that works
// everywhere. Both of its entry points are CommonJS - `main` (build/Midi.js) is a minified webpack
// UMD bundle that assigns its exports dynamically, and `module` (dist/Midi.js) is *mislabeled*: it
// is CJS too, using `exports.Midi = ...`, despite the field that names it meaning ESM. Neither
// declares a `default` export.
//
// The two forms that were tried before this module existed each fixed one runtime and broke
// another:
//
//  - `import {Midi} from "@tonejs/midi"` (named). Fails at LINK time under Node's native ESM
//    loader, which adapter-static uses verbatim while prerendering: cjs-module-lexer cannot see
//    exports that are assigned dynamically, so the specifier resolves with no named exports and
//    Node throws "Named export 'Midi' not found". The build never completes.
//  - `import TonejsMidiPkg from "@tonejs/midi"` (default). Fixes prerendering - Node gives a CJS
//    module's namespace a `default` that is its whole module.exports - and breaks the CLIENT
//    bundle, where Rollup interops the same file into named exports and no `default`. That shipped:
//    `new TonejsMidiPkg.Midi(...)` reached users as `Lt.default.Midi` and threw
//    "Cannot read properties of undefined (reading 'Midi')" on every MIDI import and export.
//
// A NAMESPACE import is the one form that cannot fail at link time - it never asks for a named
// binding - so it loads under all four runtimes (Node native ESM, Vite dev SSR, Vite prod SSR,
// Rollup client) and leaves only the question of WHERE the constructor ended up. That question has
// exactly two answers and this file tries both, which is why the resolution is a `??` rather than a
// claim about which runtime is in use.
import * as TonejsMidi from '@tonejs/midi';
import type { Midi as MidiInstance } from '@tonejs/midi';

type MidiConstructor = new (data?: ArrayBuffer) => MidiInstance;

// The two shapes, named rather than cast away: `Midi` is what a bundler that interops the CJS into
// named exports produces, `default.Midi` is what a loader that hands back module.exports produces.
const namespace = TonejsMidi as unknown as {
  Midi?: MidiConstructor;
  default?: { Midi?: MidiConstructor };
};

/**
 * Use this for every `new Midi(...)`. Importing `Midi` from '@tonejs/midi' as a VALUE anywhere else
 * reintroduces one of the two failures above, and which one depends on the runtime rather than on
 * anything visible in the file doing it.
 *
 * `import type {Midi}` is unaffected and stays the right thing for annotations - it is erased, so
 * there is no runtime import to resolve. FileService.ts and ComposedSong.svelte.ts only ever need
 * the type and deliberately import nothing else.
 */
export const Midi = (namespace.Midi ?? namespace.default?.Midi) as MidiConstructor;
