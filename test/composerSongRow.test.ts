import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import ComposerSongRow from '../src/lib/components/pages/Composer/ComposerSongRow.svelte'

const mocks = vi.hoisted(() => ({
    serialized: {
        id: 'song-1',
        name: 'Focus song',
        type: 'composed',
        version: 4,
        folderId: null,
        bpm: 220,
        pitch: 'C',
        reverb: false,
        data: {},
        breakpoints: [0],
        columnTempos: [],
        tracks: [],
    },
    getOneSerializedFromStorable: vi.fn(),
    showPill: vi.fn(),
    hidePill: vi.fn(),
    error: vi.fn(),
}))

vi.mock('$core/Services/SongService', () => ({
    songService: {
        getOneSerializedFromStorable: mocks.getOneSerializedFromStorable,
    },
}))

vi.mock('$stores/SongsStore.svelte', () => ({
    songsStore: {
        addSong: vi.fn(),
        addSongToFolder: vi.fn(),
    },
}))

vi.mock('$stores/LoggerStore.svelte', () => ({
    logger: {
        showPill: mocks.showPill,
        hidePill: mocks.hidePill,
        error: mocks.error,
        log: vi.fn(),
        warn: vi.fn(),
    },
}))

type Mounted = ReturnType<typeof mount>

describe('ComposerSongRow focus handoff', () => {
    let target: HTMLDivElement
    let component: Mounted | null
    let loadSong: ReturnType<typeof vi.fn>
    let toggleMenu: ReturnType<typeof vi.fn>

    beforeEach(() => {
        mocks.getOneSerializedFromStorable.mockReset().mockResolvedValue(mocks.serialized)
        mocks.showPill.mockReset()
        mocks.hidePill.mockReset()
        mocks.error.mockReset()
        loadSong = vi.fn()
        toggleMenu = vi.fn()
        target = document.createElement('div')
        document.body.append(target)
        component = mount(ComposerSongRow, {
            target,
            props: {
                data: {
                    id: 'song-1',
                    name: 'Focus song',
                    type: 'composed',
                    folderId: null,
                },
                folders: [],
                currentSongId: null,
                functions: {
                    removeSong: vi.fn(),
                    renameSong: vi.fn(),
                    toggleMenu,
                    loadSong,
                    downloadSong: vi.fn(),
                },
            },
        })
        flushSync()
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
    })

    function songButton(): HTMLElement {
        const button = target.querySelector<HTMLElement>('.song-name[role="button"]')
        if (!button) throw new Error('composer song role-button was not rendered')
        return button
    }

    it('blurs the activated song row synchronously on pointer selection', async () => {
        const button = songButton()
        button.focus()
        expect(document.activeElement).toBe(button)

        button.dispatchEvent(new MouseEvent('click', {bubbles: true}))

        expect(document.activeElement).not.toBe(button)
        await vi.waitFor(() => expect(loadSong).toHaveBeenCalledWith(mocks.serialized))
        expect(toggleMenu).toHaveBeenCalledWith(false)
    })

    it.each(['Enter', ' '])('keeps native-equivalent %j keyboard activation and releases focus', async key => {
        const button = songButton()
        button.focus()
        const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})

        expect(button.dispatchEvent(event)).toBe(false)

        expect(event.defaultPrevented).toBe(true)
        expect(document.activeElement).not.toBe(button)
        await vi.waitFor(() => expect(loadSong).toHaveBeenCalledWith(mocks.serialized))
        expect(toggleMenu).toHaveBeenCalledWith(false)
    })

    it('leaves focus and selection untouched for unrelated keys', () => {
        const button = songButton()
        button.focus()
        const event = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true})

        expect(button.dispatchEvent(event)).toBe(true)

        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(button)
        expect(mocks.getOneSerializedFromStorable).not.toHaveBeenCalled()
        expect(loadSong).not.toHaveBeenCalled()
    })
})
