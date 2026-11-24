// FileService.importFiles: the one route every Import button and every drop on the window takes.
//
// What is pinned is the SORTING - which file goes where - not the library writes behind it, so the
// library half (importAndLog) is replaced by a recorder. A file that lands in the wrong place is
// either a song the user has to dig out of an importer screen they did not ask for, or a file
// dropped on the floor with an error.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {INSTRUMENTS} from './imports'
import {fileService, type ComposerImporter} from '$core/Services/FileService'
import {logger} from '$stores/LoggerStore.svelte'
import {ComposedSong} from '../src/lib/core/Songs/ComposedSong.svelte'
import {NoteColumn} from '../src/lib/core/Songs/SongClasses'
import {Midi} from '../src/lib/core/Songs/midiConstructor'

function ownMidiFile(name: string): File {
    const song = new ComposedSong('Exported', [INSTRUMENTS[0]])
    const column = new NoteColumn()
    column.notes = [{trackIndex: 0, id: 60, span: 1}]
    song.initColumnsForConstruction([column])
    return new File([new Uint8Array(song.toMidi().toArray())], name)
}

function foreignMidiFile(name: string): File {
    const midi = new Midi()
    midi.addTrack().addNote({midi: 60, time: 0, duration: 0.5})
    return new File([new Uint8Array(midi.toArray())], name)
}

const sheet = (name: string) => new File([JSON.stringify([{name: 'sheet song'}])], name)

/** An importer that takes every file it is offered (or refuses, with `opens: false`). */
function importer({opens = true, isOpen = false} = {}) {
    const open = vi.fn(async (_file: File) => opens)
    return {open, isOpen: () => isOpen} satisfies ComposerImporter
}

let imported: unknown[]
let warnings: string[]
let errors: string[]

beforeEach(() => {
    imported = []
    warnings = []
    errors = []
    vi.spyOn(fileService, 'importAndLog').mockImplementation(async (data) => {
        imported.push(data)
        return undefined as never
    })
    vi.spyOn(logger, 'warn').mockImplementation((text: string) => void warnings.push(text))
    vi.spyOn(logger, 'error').mockImplementation((text: string) => void errors.push(text))
})

afterEach(() => vi.restoreAllMocks())

describe('importFiles', () => {
    it('imports one of our own MIDI exports straight into the library', async () => {
        const target = importer()
        await fileService.importFiles([ownMidiFile('Exported.mid')], target)
        expect(target.open).not.toHaveBeenCalled()
        expect(imported).toHaveLength(1)
        expect(imported[0]).toMatchObject({name: 'Exported', type: 'composed'})
    })

    it('knows a file by its extension in any case', async () => {
        const target = importer()
        await fileService.importFiles([ownMidiFile('LOUD.MID')], target)
        expect(imported).toHaveLength(1)
        //and the importer, which reads the same helpers, will not take an upper-case audio file for MIDI
        const audio = new File(['x'], 'TAKE.MP3')
        await fileService.importFiles([audio], target)
        expect(target.open).toHaveBeenCalledWith(audio)
    })

    it('sends a foreign MIDI, an audio and a video file to the composer importer', async () => {
        for (const file of [foreignMidiFile('foreign.mid'), new File(['x'], 'take.mp3'), new File(['x'], 'clip.mp4')]) {
            const target = importer()
            await fileService.importFiles([file], target)
            expect(target.open, file.name).toHaveBeenCalledWith(file)
            expect(imported, file.name).toHaveLength(0)
        }
    })

    it('sends even our own MIDI to the importer while it is open', async () => {
        //the user is in the middle of an import: the file is for the screen in front of them
        const own = ownMidiFile('mine.mid')
        const target = importer({isOpen: true})
        await fileService.importFiles([own, sheet('a.json')], target)
        expect(target.open).toHaveBeenCalledWith(own)
        //a sheet is not something the importer reads, and still goes to the library
        expect(imported).toHaveLength(1)
    })

    it('imports a mixed batch file by file, and opens only the first file meant for the importer', async () => {
        const firstForeign = foreignMidiFile('first.mid')
        const target = importer()
        await fileService.importFiles(
            [sheet('a.genshinsheet'), firstForeign, ownMidiFile('mine.mid'), new File(['x'], 'second.wav')],
            target
        )
        expect(imported).toHaveLength(2)
        expect(target.open).toHaveBeenCalledTimes(1)
        expect(target.open).toHaveBeenCalledWith(firstForeign)
        //the second file is named, not silently dropped
        expect(warnings).toHaveLength(1)
    })

    it('says nothing about the other files when the importer did not take the first', async () => {
        //a declined "open it in the composer?" or a cancelled save question opened nothing at all
        const target = importer({opens: false})
        await fileService.importFiles([foreignMidiFile('a.mid'), foreignMidiFile('b.mid')], target)
        expect(target.open).toHaveBeenCalledTimes(1)
        expect(warnings).toHaveLength(0)
    })

    it('opens the importer only after everything else has been imported', async () => {
        const order: string[] = []
        vi.mocked(fileService.importAndLog).mockImplementation(async () => {
            order.push('imported')
            return undefined as never
        })
        await fileService.importFiles([foreignMidiFile('foreign.mid'), sheet('a.json')], {
            open: () => {
                order.push('importer')
                return true
            },
        })
        expect(order).toEqual(['imported', 'importer'])
    })

    it('reports a file that is neither valid JSON nor MIDI, and carries on with the rest', async () => {
        const target = importer()
        await fileService.importFiles([new File(['not json'], 'broken.txt'), sheet('ok.json')], target)
        expect(errors).toHaveLength(1)
        expect(imported).toHaveLength(1)
        expect(target.open).not.toHaveBeenCalled()
    })

    it('reports a .mid that is not a MIDI file instead of sending it on', async () => {
        const target = importer()
        await fileService.importFiles([new File(['definitely not midi'], 'fake.mid')], target)
        expect(errors).toHaveLength(1)
        expect(target.open).not.toHaveBeenCalled()
    })
})
