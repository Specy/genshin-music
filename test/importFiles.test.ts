// FileService.importFiles: the one route every Import button and every drop on the window takes.
//
// What is pinned is the SORTING - which file goes where - not the library writes behind it, so the
// library half (importAndLog) is replaced by a recorder. A file that lands in the wrong place is
// either a song the user has to dig out of an importer screen they did not ask for, or a file
// dropped on the floor with an error.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {INSTRUMENTS} from './imports'
import {fileService} from '$core/Services/FileService'
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
        const openInComposer = vi.fn()
        await fileService.importFiles([ownMidiFile('Exported.mid')], openInComposer)
        expect(openInComposer).not.toHaveBeenCalled()
        expect(imported).toHaveLength(1)
        expect(imported[0]).toMatchObject({name: 'Exported', type: 'composed'})
    })

    it('knows a MIDI by its extension in any case', async () => {
        const openInComposer = vi.fn()
        await fileService.importFiles([ownMidiFile('LOUD.MID')], openInComposer)
        expect(imported).toHaveLength(1)
    })

    it('sends a foreign MIDI, an audio and a video file to the composer importer', async () => {
        for (const file of [foreignMidiFile('foreign.mid'), new File(['x'], 'take.mp3'), new File(['x'], 'clip.mp4')]) {
            const openInComposer = vi.fn()
            await fileService.importFiles([file], openInComposer)
            expect(openInComposer, file.name).toHaveBeenCalledWith(file)
            expect(imported, file.name).toHaveLength(0)
        }
    })

    it('imports a mixed batch file by file, and opens only the first file meant for the importer', async () => {
        const firstForeign = foreignMidiFile('first.mid')
        const openInComposer = vi.fn()
        await fileService.importFiles(
            [sheet('a.genshinsheet'), firstForeign, ownMidiFile('mine.mid'), new File(['x'], 'second.wav')],
            openInComposer
        )
        expect(imported).toHaveLength(2)
        expect(openInComposer).toHaveBeenCalledTimes(1)
        expect(openInComposer).toHaveBeenCalledWith(firstForeign)
        //the second file is named, not silently dropped
        expect(warnings).toHaveLength(1)
    })

    it('opens the importer only after everything else has been imported', async () => {
        const order: string[] = []
        vi.mocked(fileService.importAndLog).mockImplementation(async () => {
            order.push('imported')
            return undefined as never
        })
        await fileService.importFiles([foreignMidiFile('foreign.mid'), sheet('a.json')], () => order.push('importer'))
        expect(order).toEqual(['imported', 'importer'])
    })

    it('reports a file that is neither valid JSON nor MIDI, and carries on with the rest', async () => {
        const openInComposer = vi.fn()
        await fileService.importFiles([new File(['not json'], 'broken.txt'), sheet('ok.json')], openInComposer)
        expect(errors).toHaveLength(1)
        expect(imported).toHaveLength(1)
        expect(openInComposer).not.toHaveBeenCalled()
    })

    it('reports a .mid that is not a MIDI file instead of sending it on', async () => {
        const openInComposer = vi.fn()
        await fileService.importFiles([new File(['definitely not midi'], 'fake.mid')], openInComposer)
        expect(errors).toHaveLength(1)
        expect(openInComposer).not.toHaveBeenCalled()
    })
})
