import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import PlayerSongControls from '../src/lib/components/pages/Player/PlayerSongControls.svelte'
import {SPEED_CHANGERS} from '../src/lib/core/legacyConfig'
import {playerStore} from '../src/lib/stores/PlayerStore.svelte'

describe('Player song controls', () => {
    let target: HTMLDivElement
    let component: ReturnType<typeof mount> | null

    beforeEach(() => {
        playerStore.resetSong()
        target = document.createElement('div')
        document.body.append(target)
        component = mount(PlayerSongControls, {
            target,
            props: {
                onRestart: vi.fn(),
                onSeek: vi.fn(),
                onRawSpeedChange: vi.fn(),
                onToggleRecordAudio: vi.fn(),
                onToggleMetronome: vi.fn(),
                speedChanger: SPEED_CHANGERS.find(changer => changer.name === 'x1')!,
                loopEnabled: false,
                hidePracticeNotes: false,
                setHidePracticeNotes: vi.fn(),
                setLoopEnabled: vi.fn(),
                isVisualSheetVisible: false,
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
})
