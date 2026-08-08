// THE @tonejs/midi INTEROP, which shipped broken twice in opposite directions - see
// src/lib/core/Songs/midiConstructor.ts for both, and why no single static import form works.
//
// WHAT THIS FILE CAN AND CANNOT SEE. It runs under vitest, i.e. Vite's resolution, which is ONE of
// the four runtimes that have to agree. It catches the resolution falling through to `undefined`
// there, and it catches anyone reintroducing a value import of '@tonejs/midi' in the two files that
// construct one. It does NOT exercise the other three:
//
//  - Node's native ESM loader (adapter-static's prerender) is covered by `npm run build` - a link
//    error there fails the build outright, which is how the NAMED import was caught.
//  - the Rollup CLIENT bundle is the one that shipped the reported break, and no test run sees it:
//    the symptom was `Lt.default.Midi` in a built chunk. The check that catches it is a grep over
//    build output for `.default.Midi`, which is recorded here rather than automated because
//    nothing in this suite builds.
import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {Midi as MidiConstructor} from '../src/lib/core/Songs/midiConstructor'

describe('the Midi constructor resolves whichever shape the runtime produced', () => {
    it('is a constructor, not undefined', () => {
        //the failure that shipped: the namespace had no `default`, so `.default.Midi` was undefined
        //and `new` threw. Asserted as a callable rather than as truthy, since `undefined` and a
        //plain object both read as "something" to a bare existence check.
        expect(typeof MidiConstructor).toBe('function')
    })

    it('builds an empty Midi with the header a caller writes to', () => {
        //RecordedSong.toMidi() constructs with no argument and then writes header.setTempo and
        //header.keySignatures, so a resolution that produced some OTHER function would fail here
        //rather than at the first user download.
        const midi = new MidiConstructor()
        expect(midi.header).toBeDefined()
        midi.header.setTempo(120)
        expect(midi.tracks).toEqual([])
    })

    it('parses a real MIDI file, which is what the composer import does with it', () => {
        //the reported bug's own path: MidiParser hands the constructor an ArrayBuffer read off a
        //file input. test-songs/ carries a real one, so this is the whole shape of that call.
        //copied into a fresh, exactly-sized ArrayBuffer: readFileSync returns a Buffer over Node's
        //shared pool, so handing its `.buffer` straight over passes the whole pool. This is the
        //shape MidiParser really sees, a FileReader readAsArrayBuffer result.
        const bytes = new Uint8Array(readFileSync('test-songs/MIDI Test.mid'))
        const midi = new MidiConstructor(bytes.buffer as ArrayBuffer)
        expect(midi.tracks.length).toBeGreaterThan(0)
    })
})

describe('the two files that construct a Midi do not import it as a value', () => {
    //Reintroducing `import {Midi} from '@tonejs/midi'` fails only at PRERENDER, and reintroducing
    //the default import fails only in the CLIENT BUNDLE - neither shows up in a test run. This
    //reads the source instead, which is the one place both are visible at once.
    const constructingFiles = [
        'src/lib/core/Songs/RecordedSong.ts',
        'src/lib/components/pages/Composer/MidiParser/MidiParser.svelte',
    ]
    for (const file of constructingFiles) {
        it(`${file} takes the constructor from midiConstructor`, () => {
            const source = readFileSync(file, 'utf8')
            const valueImports = source
                .split('\n')
                .filter(line => line.includes("from '@tonejs/midi'") || line.includes('from "@tonejs/midi"'))
                .filter(line => !line.trimStart().startsWith('//'))
                //`import type` is erased and is the correct way to annotate; anything else is a
                //runtime import of a module that cannot be imported as a value portably
                .filter(line => !/^\s*import\s+type\s/.test(line))
            expect(valueImports).toEqual([])
            expect(source).toContain('midiConstructor')
        })
    }
})
