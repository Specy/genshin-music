import {flushSync, mount, unmount, type ComponentProps} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => {
    const pendingDelays: {ms: number, resolve: () => void}[] = []
    return {
        pendingDelays,
        delay: vi.fn((ms: number) => new Promise<void>(resolve => pendingDelays.push({ms, resolve}))),
        songEvent: vi.fn(),
    }
})

// PlayerKeyboard's real delay uses worker-timers (which jsdom cannot run). Keeping each promise
// pending also gives the test direct control over an old approach run's two-second preparation.
vi.mock('$core/utils/Utilities', async importOriginal => ({
    ...(await importOriginal<typeof import('../src/lib/core/utils/Utilities')>()),
    delay: mocks.delay,
}))

vi.mock('$stores/KeybindsStore.svelte', () => ({
    createKeyboardListener: () => () => {},
    createShortcutListener: () => () => {},
}))

vi.mock('$lib/providers/MIDIProvider', () => ({
    MIDIProvider: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addInputsListener: vi.fn(),
        removeInputsListener: vi.fn(),
        isNoteRelease: vi.fn(() => false),
        isDown: vi.fn(() => false),
        getNotesOfMIDIevent: vi.fn(() => []),
    },
}))

vi.mock('$core/Analytics', () => ({default: {songEvent: mocks.songEvent}}))

// PLAY MODE runs on the audio clock now (ADR-0009), so the component needs both of the transport's
// seams. jsdom has no AudioContext: the clock below is the (real or faked) wall clock in seconds,
// which is all the transport asks of it - it only ever differences two readings. And worker-timers
// runs its wakes inside a Worker jsdom does not provide, so they are routed to the global timers,
// which vi.useFakeTimers can then drive where a test wants to.
vi.mock('$lib/providers/AudioProvider', () => ({
    AudioProvider: {
        ensureRunning: vi.fn(async () => {}),
        // PlayerKeyboard/Player subscribe so a context rebuild can end a run whose
        // absolute timestamps belong to the retired clock. Returns an unsubscribe fn.
        onContextTeardown: vi.fn(() => () => {}),
        getAudioContext: vi.fn(() => ({
            get currentTime() {
                return Date.now() / 1000
            },
        })),
    },
}))

vi.mock('worker-timers', () => ({
    setTimeout: (handler: () => void, ms: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
    setInterval: (handler: () => void, ms: number) => globalThis.setInterval(handler, ms),
    clearInterval: (id: number) => globalThis.clearInterval(id),
}))

import PlayerKeyboard from '../src/lib/components/pages/Player/PlayerKeyboard.svelte'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {playerStore} from '../src/lib/stores/PlayerStore.svelte'
import {playerControlsStore} from '../src/lib/stores/PlayerControlsStore.svelte'
import {buildRecordedSong} from './builders'
import {INSTRUMENTS} from './imports'

type Mounted = ReturnType<typeof mount>

describe('Player mode transition ownership', () => {
    let target: HTMLDivElement
    let component: Mounted | null
    let playSound: ReturnType<typeof vi.fn>
    let releaseSound: ReturnType<typeof vi.fn>
    let releaseAllSounds: ReturnType<typeof vi.fn>
    let commitSongNote: ReturnType<typeof vi.fn>
    let recordSoundedNote: ReturnType<typeof vi.fn>
    let cancelScheduledSounds: ReturnType<typeof vi.fn>
    let onSongFinished: ReturnType<typeof vi.fn>
    // the props object the component keeps reading from - the harness mutates it where
    // Player.svelte would republish it (see setHasSong below)
    let data: ComponentProps<typeof PlayerKeyboard>['data']
    /** Seconds each committed note was handed to the audio clock BEFORE the clock reached it. */
    const commitLeads: number[] = []
    /** Which teardown step ran first: retracting the window has to precede fading what sounds. */
    const teardownOrder: string[] = []

    beforeEach(() => {
        mocks.pendingDelays.splice(0)
        mocks.delay.mockClear()
        mocks.songEvent.mockClear()
        playerStore.resetSong()
        playerControlsStore.clearPages()
        playerControlsStore.resetScore()
        playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0})

        target = document.createElement('div')
        document.body.append(target)
        const instrument = new Instrument(INSTRUMENTS[0])
        data = {
            isLoading: false,
            instrument,
            songDisplayInstrument: instrument,
            pitch: 'C' as const,
            keyboardSize: 100,
            noteNameType: 'key' as const,
            hasSong: false,
            hasAnimation: false,
            approachRate: 1500,
            keyboardYPosition: 0,
            speedChanger: {name: 'x1' as const, value: 1},
            visualSheetSize: 4,
            hideNotesInPracticeMode: false,
        }
        commitLeads.splice(0)
        teardownOrder.splice(0)
        playSound = vi.fn()
        releaseSound = vi.fn()
        releaseAllSounds = vi.fn(() => teardownOrder.push('release'))
        commitSongNote = vi.fn((_event: unknown, _track: unknown, atAudioTime: number) =>
            commitLeads.push(atAudioTime - Date.now() / 1000))
        recordSoundedNote = vi.fn()
        cancelScheduledSounds = vi.fn(() => teardownOrder.push('cancel'))
        onSongFinished = vi.fn()
        component = mount(PlayerKeyboard, {
            target,
            props: {
                data,
                functions: {
                    playSound,
                    releaseSound,
                    releaseAllSounds,
                    commitSongNote,
                    recordSoundedNote,
                    cancelScheduledSounds,
                    restartMetronome: vi.fn(),
                    setHasSong: (hasSong: boolean) => {
                        // Player.svelte normally republishes this prop. The component reads the
                        // same object from timer callbacks, so mutating the harness copy models it.
                        data.hasSong = hasSong
                    },
                    onSongFinished,
                },
            },
        })
        flushSync()
    })

    afterEach(async () => {
        if (component) unmount(component)
        component = null
        target.remove()
        // Settle any deliberately parked async functions after unmount; their mounted guard makes
        // them no-ops, and leaving unresolved promises around obscures leaked-work regressions.
        mocks.pendingDelays.splice(0).forEach(({resolve}) => resolve())
        await Promise.resolve()
        playerStore.resetSong()
        playerControlsStore.clearPages()
        playerControlsStore.resetScore()
        vi.useRealTimers()
    })

    async function enterPractice() {
        const song = buildRecordedSong()
        playerStore.practice(song, 0, song.notes.length)
        await vi.waitFor(() => expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
        return song
    }

    async function beginApproach() {
        const song = buildRecordedSong()
        playerStore.approaching(song, 0, song.notes.length)
        await vi.waitFor(() =>
            expect(mocks.pendingDelays.some(({ms}) => ms === 2000)).toBe(true))
        return song
    }

    function takePendingDelay(ms: number) {
        const index = mocks.pendingDelays.findIndex(delay => delay.ms === ms)
        if (index === -1) throw new Error(`No pending ${ms}ms player delay`)
        return mocks.pendingDelays.splice(index, 1)[0]
    }

    // ADR-0007: what a key enters depends on the Basepoint, and the Basepoint can move while the
    // key is down (the settings menu, a MIDI pitch change) - applySetting releases nothing. The
    // press-time number is therefore remembered per held note and handed back on the up edge;
    // re-deriving it left the engine's voice (looping forever on a sustaining instrument) and the
    // recording's open note both unclosed.
    it('releases the Note Number the press ENTERED at, not one re-derived at the Basepoint of the key-up', async () => {
        await vi.waitFor(() =>
            expect(target.querySelector('.button-hitbox-bigger')).not.toBeNull())
        const hitbox = target.querySelector<HTMLButtonElement>('.button-hitbox-bigger')!
        const note = playerStore.keyboard[0]
        const pressedNumber = note.numberAt('C')

        const press = new Event('pointerdown', {bubbles: true, cancelable: true})
        Object.defineProperty(press, 'pointerId', {value: 7})
        hitbox.dispatchEvent(press)
        flushSync()
        expect(playSound).toHaveBeenLastCalledWith(pressedNumber)

        data.pitch = 'D'
        expect(note.numberAt('D')).not.toBe(pressedNumber)

        const release = new Event('pointerup', {bubbles: true, cancelable: true})
        Object.defineProperty(release, 'pointerId', {value: 7})
        hitbox.dispatchEvent(release)
        flushSync()

        expect(releaseSound).toHaveBeenCalledWith(pressedNumber)
        expect(releaseSound).not.toHaveBeenCalledWith(note.numberAt('D'))
    })

    // ADR-0009: play mode runs on the audio clock. Sound is committed to it up to a horizon ahead
    // of being heard, while everything visible about a note happens at the boundary the listener
    // hears it on - the two used to be one main-thread instant.
    it('commits every play-mode note ahead of the audio clock, and moves the cursor when it sounds', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 0, song.notes.length)

        await vi.waitFor(() => expect(commitSongNote).toHaveBeenCalled())
        //committed AHEAD: a note handed over at the clock's own instant is at the mercy of
        //whatever the main thread does next, which is the defect the transport removes
        expect(commitLeads.length).toBeGreaterThan(0)
        commitLeads.forEach(lead => expect(lead).toBeGreaterThan(0))
        //...and nothing has SOUNDED yet, so the cursor has not moved with the commits
        expect(playerControlsStore.current).toBe(0)

        await vi.waitFor(
            () => expect(playerControlsStore.current).toBe(song.notes.length),
            {timeout: 4000},
        )
        expect(commitSongNote).toHaveBeenCalledTimes(song.notes.length)
        //every note reached the ear, and the recording hook was handed the sounding note's own id
        expect(recordSoundedNote.mock.calls.map(([id]) => id)).toEqual(song.notes.map(n => n.id))
        await vi.waitFor(() => expect(onSongFinished).toHaveBeenCalled())
    }, 10000)

    it('retracts the committed window before releasing what already sounds, on stop', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 0, song.notes.length)
        await vi.waitFor(() => expect(commitSongNote).toHaveBeenCalled())
        const committedBeforeStop = commitSongNote.mock.calls.length
        const sweepsBeforeStop = cancelScheduledSounds.mock.calls.length
        teardownOrder.splice(0)

        playerStore.resetSong()
        await vi.waitFor(() =>
            expect(cancelScheduledSounds.mock.calls.length).toBeGreaterThan(sweepsBeforeStop))

        //ADR-0006's exact rationale: with a ~1 s horizon, fading first and cancelling afterwards
        //leaks a full second of runaway notes
        expect(teardownOrder).toEqual(['cancel', 'release'])
        //and the stopped transport commits nothing more, however long the rest of the song was
        await new Promise(resolve => setTimeout(resolve, 400))
        expect(commitSongNote).toHaveBeenCalledTimes(committedBeforeStop)
        expect(onSongFinished).not.toHaveBeenCalled()
    }, 10000)

    it('clears the practice sheet and score as soon as approach preparation starts', async () => {
        const song = await enterPractice()
        playerControlsStore.increaseScore(true)
        expect(playerControlsStore.score.correct).toBe(2)

        playerStore.approaching(song, 0, song.notes.length)

        await vi.waitFor(() => expect(playerControlsStore.pagesState.pages).toEqual([]))
        expect(playerControlsStore.score).toEqual({correct: 1, wrong: 1, score: 0, combo: 0})
        expect(mocks.pendingDelays.some(({ms}) => ms === 2000)).toBe(true)
    })

    it.each(['practice', 'play'] as const)(
        'does not let a stale approach initializer overwrite a newer %s run',
        async destination => {
            const song = await beginApproach()
            const staleApproach = takePendingDelay(2000)

            if (destination === 'practice') playerStore.practice(song, 0, song.notes.length)
            else playerStore.play(song, 0, song.notes.length)
            await vi.waitFor(() =>
                expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
            playerControlsStore.increaseScore(true)
            const pagesBefore = playerControlsStore.pagesState.pages.map(page =>
                page.map(chunk => chunk.clone()))
            const scoreBefore = {...playerControlsStore.score}

            staleApproach.resolve()
            await Promise.resolve()
            await Promise.resolve()
            flushSync()

            expect(playerStore.eventType).toBe(destination)
            expect(playerControlsStore.pagesState.pages).toEqual(pagesBefore)
            expect(playerControlsStore.score).toEqual(scoreBefore)
        },
    )

    it('clears practice state when stopped through the store/shortcut path', async () => {
        await enterPractice()
        const releasesBefore = releaseAllSounds.mock.calls.length

        playerStore.resetSong()

        await vi.waitFor(() => expect(releaseAllSounds.mock.calls.length).toBeGreaterThan(releasesBefore))
        expect(playerControlsStore.pagesState.pages).toEqual([])
        expect(playerControlsStore.score).toEqual({correct: 1, wrong: 1, score: 0, combo: 0})
        expect(playerStore.keyboard.every(note => note.status === '')).toBe(true)
    })

    it('does not apply an old practice click to a newer same-mode run during teardown', async () => {
        const song = await enterPractice()
        const currentNote = target.querySelector<HTMLElement>('.note-red')
        const hitbox = currentNote?.closest<HTMLButtonElement>('.button-hitbox-bigger')
        if (!hitbox) throw new Error('Practice mode exposed no clickable current note')
        const currentBefore = playerControlsStore.current

        // The store changes synchronously, while PlayerKeyboard intentionally performs teardown
        // four milliseconds later. Until then the rendered key and queue still belong to the old
        // practice run even though eventType already says `practice` for the new one.
        playerStore.practice(song, 1, song.notes.length)
        const press = new Event('pointerdown', {bubbles: true, cancelable: true})
        Object.defineProperty(press, 'pointerId', {value: 1})
        hitbox.dispatchEvent(press)
        flushSync()

        expect(playerControlsStore.current).toBe(currentBefore)
        expect(onSongFinished).not.toHaveBeenCalled()
    })

    it('ignores an old approach tick that becomes due before the debounced transition teardown', async () => {
        const song = buildRecordedSong()
        // A one-note range finishes on the 31st 50ms approach tick: the first tick moves the note
        // onto the grid at 1450ms, then thirty more take it just below zero.
        playerStore.approaching(song, 0, 1)
        await vi.waitFor(() =>
            expect(mocks.pendingDelays.some(({ms}) => ms === 2000)).toBe(true))
        const preparation = takePendingDelay(2000)

        vi.useFakeTimers()
        preparation.resolve()
        await Promise.resolve()
        await Promise.resolve()
        flushSync()

        // Leave the old queue exactly one tick from completion, then place the transition 1ms
        // before that tick. PlayerKeyboard intentionally tears transitions down on a 4ms debounce,
        // so the old interval is the next timer due and exercises the ownership guard itself.
        vi.advanceTimersByTime(1500)
        expect(onSongFinished).not.toHaveBeenCalled()
        vi.advanceTimersByTime(49)
        playerStore.play(song, 0, song.notes.length)
        flushSync()
        vi.advanceTimersByTime(1)

        expect(playerStore.eventType).toBe('play')
        expect(onSongFinished).not.toHaveBeenCalled()
        expect(playerControlsStore.score.wrong).toBe(1)
    })
})
