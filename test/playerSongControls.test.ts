import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import PlayerSongControls from '../src/lib/components/pages/Player/PlayerSongControls.svelte'
import {SPEED_CHANGERS} from '../src/lib/core/legacyConfig'
import {playerStore} from '../src/lib/stores/PlayerStore.svelte'
import {playerControlsStore} from '../src/lib/stores/PlayerControlsStore.svelte'
import {Chunk, RecordedNote} from './imports'

describe('Player song controls', () => {
    let target: HTMLDivElement
    let component: ReturnType<typeof mount> | null
    let onRestart: ReturnType<typeof vi.fn>

    beforeEach(() => {
        playerStore.resetSong()
        playerControlsStore.clearPages()
        playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0, runEnd: 0})
        target = document.createElement('div')
        document.body.append(target)
        onRestart = vi.fn()
        component = mount(PlayerSongControls, {
            target,
            props: {
                onRestart,
                onSeek: vi.fn(),
                onRawSpeedChange: vi.fn(),
                onToggleRecordAudio: vi.fn(),
                onToggleMetronome: vi.fn(),
                speedChanger: SPEED_CHANGERS.find(changer => changer.name === 'x1')!,
                loopEnabled: false,
                hidePracticeNotes: false,
                setHidePracticeNotes: vi.fn(),
                setLoopEnabled: vi.fn(),
                isVisualSheetVisible: true,
                visualSheetColumns: 4,
                isMetronomePlaying: false,
                isRecordingAudio: false,
            },
        })
        flushSync()
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
        playerStore.resetSong()
        playerControlsStore.clearPages()
    })

    it('swaps availability between the eye and speed controls in practice mode', () => {
        const speed = target.querySelector<HTMLSelectElement>('select.slider-select')
        const eye = target.querySelector<HTMLButtonElement>('button.practice-mode-control')
        if (!speed) throw new Error('Player speed selector was not rendered')
        if (!eye) throw new Error('Player practice-note visibility button was not rendered')
        expect(speed.disabled).toBe(false)
        expect(eye.disabled).toBe(true)

        playerStore.setState({eventType: 'practice'})
        flushSync()
        expect(speed.disabled).toBe(true)
        expect(eye.disabled).toBe(false)

        playerStore.setState({eventType: 'play'})
        flushSync()
        expect(speed.disabled).toBe(false)
        expect(eye.disabled).toBe(true)
    })

    it('offers audio recording only when no song is running', () => {
        const recordButton = () => [...target.querySelectorAll('button')]
            .find(button => button.textContent?.trim() === 'Record audio')

        expect(recordButton()).toBeDefined()
        playerStore.setState({eventType: 'play'})
        flushSync()
        expect(recordButton()).toBeUndefined()

        playerStore.setState({eventType: 'practice'})
        flushSync()
        expect(recordButton()).toBeUndefined()

        playerStore.setState({eventType: 'approaching'})
        flushSync()
        expect(recordButton()).toBeUndefined()
    })

    it('restarts an active run immediately after a sheet-frame Section change', () => {
        const note = (index: number) => {
            const recorded = new RecordedNote(0, index * 100)
            recorded.displayButton = 0
            return new Chunk([recorded], 0, index, index)
        }
        playerControlsStore.setPages([[note(0), note(1)]])
        playerControlsStore.setState({position: 0, current: 0, size: 2, end: 2, runEnd: 2})
        playerStore.setState({eventType: 'play'})
        flushSync()

        target.querySelector<HTMLElement>('[data-frame-index="1"] button')!.click()
        flushSync()
        const sectionStart = [...document.querySelectorAll<HTMLButtonElement>('.frame-popover button')]
            .find(button => button.textContent?.trim() === 'Section starts here')
        if (!sectionStart) throw new Error('Section start action was not rendered')
        sectionStart.click()
        flushSync()

        expect(playerControlsStore.position).toBe(1)
        expect(onRestart).toHaveBeenCalledTimes(1)

        target.querySelector<HTMLElement>('[data-frame-index="1"] button')!.click()
        flushSync()
        const removeSectionStart = [...document.querySelectorAll<HTMLButtonElement>('.frame-popover button')]
            .find(button => button.textContent?.trim() === 'Remove section start')
        if (!removeSectionStart) throw new Error('Remove section start action was not rendered')
        removeSectionStart.click()
        flushSync()

        expect(playerControlsStore.position).toBe(0)
        expect(onRestart).toHaveBeenCalledTimes(2)
    })
})
