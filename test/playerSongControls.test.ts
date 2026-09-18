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
    let onSwitchMode: ReturnType<typeof vi.fn>

    beforeEach(() => {
        playerStore.resetSong()
        playerControlsStore.clearPages()
        playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0, runEnd: 0})
        target = document.createElement('div')
        document.body.append(target)
        onRestart = vi.fn()
        onSwitchMode = vi.fn()
        component = mount(PlayerSongControls, {
            target,
            props: {
                onRestart,
                onSeek: vi.fn(),
                onSwitchMode,
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

    // ONE SLOT beside the stop button, and the mode decides which control is in it: practice is the
    // only mode the eye affects and the only one with no clock to pause, so the two are exact
    // complements. The speed picker (now on the loop's row) is the mirror image - live everywhere
    // but practice.
    it('swaps the eye and the play/pause button between practice and the played modes', () => {
        const speed = () => target.querySelector<HTMLSelectElement>('select.slider-select')!
        const eye = () => target.querySelector<HTMLButtonElement>('button.practice-mode-control')
        const playPause = () => target.querySelector<HTMLButtonElement>('button.play-pause-control')
        if (!speed()) throw new Error('Player speed selector was not rendered')

        playerStore.setState({eventType: 'play'})
        flushSync()
        expect(speed().disabled).toBe(false)
        expect(eye()).toBe(null)
        expect(playPause()).not.toBe(null)

        playerStore.setState({eventType: 'practice'})
        flushSync()
        expect(speed().disabled).toBe(true)
        expect(eye()).not.toBe(null)
        expect(playPause()).toBe(null)

        playerStore.setState({eventType: 'approaching'})
        flushSync()
        expect(speed().disabled).toBe(false)
        expect(eye()).toBe(null)
        expect(playPause()).not.toBe(null)
    })

    it('toggles the run\'s pause flag and swaps the button between pause and play', () => {
        playerStore.setState({eventType: 'play'})
        flushSync()
        const playPause = () => target.querySelector<HTMLButtonElement>('button.play-pause-control')!

        expect(playerStore.paused).toBe(false)
        expect(playPause().getAttribute('aria-label')).toBe('Pause')

        playPause().click()
        flushSync()
        expect(playerStore.paused).toBe(true)
        expect(playPause().getAttribute('aria-label')).toBe('Play')

        playPause().click()
        flushSync()
        expect(playerStore.paused).toBe(false)
        expect(playPause().getAttribute('aria-label')).toBe('Pause')
    })

    // The switcher is a picker of the CURRENT run's mode, so it exists only while a run does - with
    // no song loaded there is nothing to re-aim, and the song list's rows are where a mode is
    // chosen from scratch. That makes it the exact complement of the record-audio button below.
    it('shows the three-mode switcher only while a run is active, marking the running mode', () => {
        const modes = ['play', 'practice', 'approaching'] as const
        // `data-value` and not a class of the host's: the slider's own buttons say which option
        // each one is, which is the only thing about an icon-faced button that is not a glyph.
        const buttons = () => modes.map(mode =>
            target.querySelector<HTMLButtonElement>(
                `.player-mode-selector button[data-value="${mode}"]`))

        expect(buttons()).toEqual([null, null, null])

        for (const running of modes) {
            playerStore.setState({eventType: running})
            flushSync()
            const rendered = buttons()
            expect(rendered.every(button => button !== null)).toBe(true)
            // exactly one answer: the pill sits under the running mode and under no other
            expect(modes.filter((mode, index) =>
                rendered[index]!.classList.contains('multiple-options-selected')))
                .toEqual([running])
            // ...and the label the glyph replaced is still the button's accessible name
            expect(rendered.every(button => (button!.getAttribute('aria-label') ?? '').length > 0))
                .toBe(true)
        }

        playerStore.setState({eventType: 'stop'})
        flushSync()
        expect(buttons()).toEqual([null, null, null])
    })

    // The option only asks; Player decides where to aim the new run and whether the press is a
    // no-op (pressing the mode already running). The switcher itself hands every press over.
    it('asks for the pressed mode, including the one already running', () => {
        playerStore.setState({eventType: 'practice'})
        flushSync()
        const option = (mode: string) => target.querySelector<HTMLButtonElement>(
            `.player-mode-selector button[data-value="${mode}"]`)!

        option('play').click()
        flushSync()
        expect(onSwitchMode).toHaveBeenCalledWith('play')

        option('approaching').click()
        flushSync()
        expect(onSwitchMode).toHaveBeenLastCalledWith('approaching')

        option('practice').click()
        flushSync()
        expect(onSwitchMode).toHaveBeenLastCalledWith('practice')
        expect(onSwitchMode).toHaveBeenCalledTimes(3)
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

    it('shows and advances the right selector in Sheet Frames instead of notes', () => {
        const frame = (first: number, last: number) => {
            const recorded = new RecordedNote(0, first * 100)
            recorded.displayButton = 0
            return new Chunk([recorded], 0, first, last)
        }
        playerControlsStore.setPages([[frame(0, 2), frame(3, 4), frame(5, 8)]])
        playerControlsStore.setState({position: 0, current: 0, size: 9, end: 9, runEnd: 9})
        playerStore.setState({eventType: 'play'})
        flushSync()

        // The thumbs are placed by FRAME boundary, not by note: the end arrow sits after frame
        // three (the whole song) and the start arrow before frame one, whatever the note counts are.
        const thumbs = target.querySelectorAll<HTMLElement>('.two-way-slider-thumb')
        expect(thumbs.length).toBe(2)
        expect(thumbs[0].style.bottom).toBe('calc(100% - 18px)')
        expect(thumbs[1].style.bottom).toBe('calc(0% - 14px)')

        // Frame two only: start at absolute note 3, exclusive end at 5.
        playerControlsStore.setSectionStart(3)
        playerControlsStore.setSectionEnd(5)
        flushSync()
        // jsdom rounds the serialised percentage to four decimals.
        expect(thumbs[0].style.bottom).toBe('calc(66.6667% - 18px)')
        expect(thumbs[1].style.bottom).toBe('calc(33.3333% - 14px)')

        playerControlsStore.setState({position: 0, current: 0, end: 9, runEnd: 9})
        flushSync()
        const progress = target.querySelector<HTMLElement>('.slider-current')!
        expect(progress.style.transform).toBe('translateY(100.0%)')
        playerControlsStore.setCurrent(3)
        flushSync()
        expect(progress.style.transform).toBe('translateY(66.7%)')
        // A second note inside the same frame does not move a frame-based cursor.
        playerControlsStore.setCurrent(4)
        flushSync()
        expect(progress.style.transform).toBe('translateY(66.7%)')
        playerControlsStore.setCurrent(9)
        flushSync()
        expect(progress.style.transform).toBe('translateY(0.0%)')
    })

    it('restarts an active run once when a frame-selector drag is released', () => {
        const frame = (first: number, last: number) => {
            const recorded = new RecordedNote(0, first * 100)
            recorded.displayButton = 0
            return new Chunk([recorded], 0, first, last)
        }
        playerControlsStore.setPages([[frame(0, 2), frame(3, 4), frame(5, 8)]])
        playerControlsStore.setState({position: 0, current: 0, size: 9, end: 9, runEnd: 9})
        playerStore.setState({eventType: 'play'})
        flushSync()

        const slider = target.querySelector<HTMLElement>('.slider-outer')!
        const thumbs = target.querySelectorAll<HTMLElement>('.two-way-slider-thumb')
        slider.getBoundingClientRect = () => ({
            x: 0, y: 0, width: 16, height: 100, top: 0, right: 16, bottom: 100, left: 0,
            toJSON: () => ({}),
        })
        thumbs[0].getBoundingClientRect = () => ({
            x: 0, y: 0, width: 16, height: 16, top: 0, right: 16, bottom: 16, left: 0,
            toJSON: () => ({}),
        })
        thumbs[1].getBoundingClientRect = () => ({
            x: 0, y: 100, width: 16, height: 16, top: 100, right: 16, bottom: 116, left: 0,
            toJSON: () => ({}),
        })
        const press = new Event('pointerdown', {bubbles: true, cancelable: true})
        Object.defineProperties(press, {
            clientY: {value: 65},
            pointerId: {value: 7},
        })
        slider.dispatchEvent(press)
        flushSync()

        expect(playerControlsStore.position).toBe(3)
        expect(onRestart).not.toHaveBeenCalled()

        window.dispatchEvent(new Event('pointerup'))
        flushSync()
        expect(onRestart).toHaveBeenCalledTimes(1)
        window.dispatchEvent(new Event('pointerup'))
        flushSync()
        expect(onRestart).toHaveBeenCalledTimes(1)
    })
})
