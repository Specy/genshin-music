import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => {
    const pendingDelays: {ms: number, resolve: () => void}[] = []
    return {
        pendingDelays,
        delay: vi.fn((ms: number) => new Promise<void>(resolve => pendingDelays.push({ms, resolve}))),
    }
})

vi.mock('$core/utils/Utilities', async importOriginal => ({
    ...(await importOriginal<typeof import('../src/lib/core/utils/Utilities')>()),
    delay: mocks.delay,
}))

// The transport's wakes are worker-timers, which run inside a Worker jsdom does not provide; route
// them to the global timers so the real scheduler runs here.
vi.mock('worker-timers', () => ({
    setTimeout: (handler: () => void, ms: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
    setInterval: (handler: () => void, ms: number) => globalThis.setInterval(handler, ms),
    clearInterval: (id: number) => globalThis.clearInterval(id),
}))

// Player's lifecycle is what these tests exercise; loading/connecting sample buffers is orthogonal
// and jsdom has no AudioContext. Keep the real Instrument model (notes/shapes/ids) with a no-I/O
// load method so the full Player + PlayerKeyboard component graph can mount.
vi.mock('$lib/audio/Instrument.svelte', async importOriginal => {
    const actual = await importOriginal<typeof import('../src/lib/audio/Instrument.svelte')>()
    return {
        ...actual,
        Instrument: class extends actual.Instrument {
            load = vi.fn(async () => true)
        },
    }
})

// PLAY MODE runs on the audio clock now (ADR-0009). jsdom has no AudioContext, so `currentTime` is
// the (real or faked) wall clock in seconds - all the transport asks of a clock is that it advance,
// since it only ever differences two readings.
vi.mock('$lib/providers/AudioProvider', () => ({
    AudioProvider: {
        waitReverb: vi.fn(async () => {}),
        ensureRunning: vi.fn(async () => {}),
        // PlayerKeyboard/Player subscribe so a context rebuild can end a run whose
        // absolute timestamps belong to the retired clock. Returns an unsubscribe fn.
        onContextTeardown: vi.fn(() => () => {}),
        getAudioContext: vi.fn(() => ({
            get currentTime() {
                return Date.now() / 1000
            },
        })),
        disconnect: vi.fn(),
        connect: vi.fn(),
        setReverb: vi.fn(),
        setReverbOfNode: vi.fn(),
        clear: vi.fn(),
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
    },
}))

import Player from '../src/lib/components/pages/Player/Player.svelte'
import {metronome} from '../src/lib/audio/Metronome'
import {playerStore} from '../src/lib/stores/PlayerStore.svelte'
import {playerControlsStore} from '../src/lib/stores/PlayerControlsStore.svelte'
import {settingsService} from '../src/lib/core/Services/SettingsService'
import {buildRecordedSong} from './builders'

type Mounted = ReturnType<typeof mount>

function takePendingDelay(ms: number) {
    const index = mocks.pendingDelays.findIndex(delay => delay.ms === ms)
    if (index === -1) throw new Error(`No pending ${ms}ms player delay`)
    return mocks.pendingDelays.splice(index, 1)[0]
}

describe('Player metronome transport synchronization', () => {
    let target: HTMLDivElement
    let component: Mounted | null
    let restart: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        localStorage.clear()
        // getPlayerSettings() returns the base object directly when storage is empty. Restore the
        // two fields these cases deliberately mutate so test order cannot leak through that object.
        const defaults = settingsService.getDefaultPlayerSettings()
        defaults.loopPractice.value = false
        defaults.bpm.value = 220
        mocks.pendingDelays.splice(0)
        mocks.delay.mockClear()
        playerStore.resetSong()
        playerControlsStore.clearPages()
        playerControlsStore.resetScore()
        metronome.stop()
        metronome.bpm = 220
        restart = vi.spyOn(metronome, 'restart')

        target = document.createElement('div')
        document.body.append(target)
        component = mount(Player, {target})
        flushSync()
    })

    afterEach(async () => {
        if (component) unmount(component)
        component = null
        target.remove()
        mocks.pendingDelays.splice(0).forEach(({resolve}) => resolve())
        await Promise.resolve()
        playerStore.resetSong()
        metronome.stop()
        vi.restoreAllMocks()
    })

    function clickMetronomeToggle() {
        const button = target.querySelector<HTMLButtonElement>('.metronome-button')
        if (!button) throw new Error('Player metronome button was not rendered')
        button.click()
        flushSync()
    }

    function clickNoteRecordingToggle() {
        const button = target.querySelector<HTMLButtonElement>('.upper-right button')
        if (!button) throw new Error('Player note-recording button was not rendered')
        button.click()
        flushSync()
    }

    it('restarts only on the start edge of a note recording, at the player BPM', () => {
        clickMetronomeToggle()
        restart.mockClear()

        clickNoteRecordingToggle()

        expect(restart).toHaveBeenCalledTimes(1)
        expect(metronome.bpm).toBe(220)

        // Stopping an empty recording also creates a fresh Recording object internally. That is
        // not a start edge and must not move the metronome origin.
        clickNoteRecordingToggle()
        expect(restart).toHaveBeenCalledTimes(1)
    })

    it('does nothing at record/play boundaries while the metronome is disabled', async () => {
        clickNoteRecordingToggle()
        const song = buildRecordedSong()
        playerStore.play(song)
        await new Promise(resolve => setTimeout(resolve, 20))

        expect(restart).not.toHaveBeenCalled()
    })

    it('restarts play, replay and transport restart at the song BPM and playback origin', async () => {
        clickMetronomeToggle()
        restart.mockClear()
        const song = buildRecordedSong()

        playerStore.play(song)
        await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1))
        expect(metronome.bpm).toBe(song.bpm)
        // PlayerKeyboard gives the song a 200ms lead-in and hands the same number to both: the
        // metronome anchors its downbeat there, and the transport anchors the first note there.
        expect(restart).toHaveBeenLastCalledWith(200)
        // Nothing has SOUNDED yet - the lead-in is still running, and the cursor moves at the
        // boundary rather than when the note was committed to the audio clock.
        expect(playerControlsStore.current).toBe(0)
        await vi.waitFor(() => expect(playerControlsStore.current).toBe(1))

        playerStore.play(song)
        await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(2))
        expect(restart).toHaveBeenLastCalledWith(200)

        playerStore.restartSong(0, song.notes.length)
        await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(3))
        expect(metronome.bpm).toBe(song.bpm)
        expect(restart).toHaveBeenLastCalledWith(200)
    })

    it('uses the effective playback BPM after a speed change', async () => {
        clickMetronomeToggle()
        const song = buildRecordedSong()
        playerStore.play(song)
        await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(2))

        const speed = target.querySelector<HTMLSelectElement>('select.slider-select')
        if (!speed) throw new Error('Player speed selector was not rendered')
        speed.value = 'x2'
        speed.dispatchEvent(new Event('change', {bubbles: true}))
        flushSync()

        await vi.waitFor(() => expect(metronome.bpm).toBe(song.bpm * 2))
        expect(restart).toHaveBeenCalledTimes(3)
    })

    it('restores the manual BPM when the song is stopped', async () => {
        clickMetronomeToggle()
        const song = buildRecordedSong()
        playerStore.play(song)
        await vi.waitFor(() => expect(metronome.bpm).toBe(song.bpm))

        playerStore.resetSong()

        await vi.waitFor(() => expect(metronome.bpm).toBe(220))
    })
})

describe('Player delayed loop ownership', () => {
    let target: HTMLDivElement
    let component: Mounted | null

    beforeEach(() => {
        localStorage.clear()
        const defaults = settingsService.getDefaultPlayerSettings()
        defaults.loopPractice.value = false
        mocks.pendingDelays.splice(0)
        playerStore.resetSong()
        target = document.createElement('div')
        document.body.append(target)
        component = mount(Player, {target})
        flushSync()
    })

    afterEach(async () => {
        if (component) unmount(component)
        component = null
        target.remove()
        mocks.pendingDelays.splice(0).forEach(({resolve}) => resolve())
        await Promise.resolve()
        playerStore.resetSong()
    })

    it('does not let an old completion restart a newer mode after the loop pause', async () => {
        const song = buildRecordedSong()
        playerStore.practice(song, 0, song.notes.length)
        await vi.waitFor(() => expect(target.querySelector('.note-red')).not.toBeNull())

        const loopButton = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
            button => button.textContent?.includes('Loop'),
        )
        if (!loopButton) throw new Error('Player loop button was not rendered')
        loopButton.click()
        flushSync()

        // Consume every note in the first practice chunk. The last one calls onSongFinished(),
        // which parks for the one-second loop pause through the mocked delay above.
        while (!mocks.pendingDelays.some(({ms}) => ms === 1000)) {
            const red = target.querySelector<HTMLElement>('.note-red')
            const hitbox = red?.closest<HTMLButtonElement>('.button-hitbox-bigger')
            if (!hitbox) throw new Error('Practice mode exposed no clickable current note')
            const press = new Event('pointerdown', {bubbles: true, cancelable: true})
            Object.defineProperty(press, 'pointerId', {value: 1})
            hitbox.dispatchEvent(press)
            flushSync()
        }
        const staleLoop = takePendingDelay(1000)

        playerStore.play(song, 0, song.notes.length)
        await vi.waitFor(() => expect(playerStore.eventType).toBe('play'))
        const newerKey = playerStore.state.key

        staleLoop.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(playerStore.state.key).toBe(newerKey)
        expect(playerStore.eventType).toBe('play')
    })
})
