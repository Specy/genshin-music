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
// pending also gives the test direct control over every phase of an approach run's preparation.
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
const approachCountdown = [3, 2, 1] as const
const approachPreparationMs = 2000 * 0.65
const approachCountdownStepMs = approachPreparationMs / approachCountdown.length

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
        playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0, runEnd: 0})

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

    /**
     * Two notes close enough to share a frame, both playable on this keyboard and on different
     * keys, so neither the playability filter nor the dedupe thins the frame out: the frame's
     * `lastNoteIndex` is then carried by a note the user actually has to press, which is the only
     * shape in which an unclamped per-note advance can walk the cursor off an unfinished frame.
     */
    function buildAdjacentFrameSong() {
        const song = buildRecordedSong()
        //the three track-0 notes of the golden song (buttons 0, 7 and 14 of the display instrument)
        const [low, , mid, , high] = song.notes
        low.time = 100
        mid.time = 120
        high.time = 900
        song.notes = [low, mid, high]
        return song
    }

    async function enterPractice(start = 0, end?: number, song = buildRecordedSong()) {
        playerStore.practice(song, start, end ?? song.notes.length)
        // `position` is written by the run dispatch itself, after the mode has built its pages and
        // queue - waiting on the pages alone would let a second call read the previous run's state
        await vi.waitFor(() => {
            expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0)
            expect(playerControlsStore.position).toBe(start)
        })
        return song
    }

    async function beginApproach(start = 0, end?: number) {
        const song = buildRecordedSong()
        playerStore.approaching(song, start, end ?? song.notes.length)
        await vi.waitFor(() =>
            expect(mocks.pendingDelays.some(({ms}) => ms === approachCountdownStepMs)).toBe(true))
        return song
    }

    async function finishApproachCountdown(beforeRunStarts?: () => void) {
        const durations: number[] = []
        for (const count of approachCountdown) {
            await vi.waitFor(() =>
                expect(target.querySelector('.approach-countdown')?.textContent?.trim())
                    .toBe(String(count)))
            const phase = takePendingDelay(approachCountdownStepMs)
            durations.push(phase.ms)
            if (count === 1) beforeRunStarts?.()
            phase.resolve()
            await Promise.resolve()
            await Promise.resolve()
            flushSync()
        }
        flushSync()
        expect(target.querySelector('.approach-countdown')).toBeNull()
        return durations
    }

    /** The absolute span of every frame on the sheet, in page order. */
    function sheetSpans() {
        return playerControlsStore.pagesState.pages
            .flat()
            .map(chunk => [chunk.firstNoteIndex, chunk.lastNoteIndex])
    }

    let nextPointerId = 1

    function pressButton(button: number, pointerId = nextPointerId++) {
        const hitboxes = target.querySelectorAll<HTMLButtonElement>('.button-hitbox-bigger')
        const hitbox = hitboxes[button]
        if (!hitbox) throw new Error(`No keyboard hitbox for button ${button}`)
        const press = new Event('pointerdown', {bubbles: true, cancelable: true})
        Object.defineProperty(press, 'pointerId', {value: pointerId})
        hitbox.dispatchEvent(press)
        flushSync()
    }

    function takePendingDelay(ms: number) {
        const index = mocks.pendingDelays.findIndex(delay => Math.abs(delay.ms - ms) < 0.001)
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

        //waited on the FINISH, not on the cursor: `current` reaches the note after the last one
        //while that note is still sounding, so it cannot signal "every note was heard"
        await vi.waitFor(() => expect(onSongFinished).toHaveBeenCalled(), {timeout: 4000})
        expect(commitSongNote).toHaveBeenCalledTimes(song.notes.length)
        //every note reached the ear, and the recording hook was handed the sounding note's own id
        expect(recordSoundedNote.mock.calls.map(([id]) => id)).toEqual(song.notes.map(n => n.id))
        //the cursor ends ON the run's exclusive end; the frame-based slider turns that into the
        //boundary after the final frame, while `runEnd` keeps the sheet highlight on that frame
        expect(playerControlsStore.current).toBe(song.notes.length)
        expect(playerControlsStore.currentGlobalChunkIndex)
            .toBe(playerControlsStore.pagesState.pages.flat().length - 1)
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

    // PAUSE IS NOT A STOP. It takes the same three audio steps (the transport never touches audio,
    // so an uncancelled pause leaks the whole committed horizon) but none of the run teardown
    // around them, because the sheet, the Section and the cursor all belong to the run that is
    // about to carry on.
    it('pauses a play run without losing its sheet, and re-anchors from the cursor on resume', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 0, song.notes.length)
        await vi.waitFor(() => expect(playerControlsStore.current).toBeGreaterThan(0), {timeout: 4000})
        const frames = playerControlsStore.pagesState.pages.flat().length
        const committedBefore = commitSongNote.mock.calls.length
        const cursor = playerControlsStore.current
        teardownOrder.splice(0)

        playerStore.setPaused(true)
        flushSync()
        expect(teardownOrder).toEqual(['cancel', 'release'])
        expect(playerStore.eventType).toBe('play')
        expect(playerControlsStore.pagesState.pages.flat().length).toBe(frames)
        expect(playerControlsStore.current).toBe(cursor)
        //the stopped transport commits nothing more, however much song was left
        await new Promise(resolve => setTimeout(resolve, 400))
        expect(commitSongNote).toHaveBeenCalledTimes(committedBefore)
        expect(onSongFinished).not.toHaveBeenCalled()

        playerStore.setPaused(false)
        flushSync()
        await vi.waitFor(() =>
            expect(commitSongNote.mock.calls.length).toBeGreaterThan(committedBefore))
        //resumed through the SEEK path: the run re-anchors on the cursor while the Section the
        //user drew stays exactly where it was
        expect(playerStore.state.preservesSection).toBe(true)
        expect(playerControlsStore.position).toBe(0)
        expect(playerControlsStore.end).toBe(song.notes.length)
        expect(playerControlsStore.current).toBe(cursor)
        await vi.waitFor(() => expect(onSongFinished).toHaveBeenCalled(), {timeout: 4000})
    }, 15000)

    // Approaching owns nothing but its tick, so that IS its pause: no re-anchoring, and in
    // particular no teardown - a run whose score was reset by a pause would be unplayable.
    it('freezes an approach run on pause, keeping its circles, score and sheet', async () => {
        await beginApproach()
        await finishApproachCountdown(() => vi.useFakeTimers())

        let elapsed = 0
        while (playerControlsStore.current === 0 && elapsed < 10000) {
            vi.advanceTimersByTime(50)
            elapsed += 50
        }
        const cursor = playerControlsStore.current
        const score = {...playerControlsStore.score}
        const frames = playerControlsStore.pagesState.pages.flat().length
        expect(cursor).toBeGreaterThan(0)

        playerStore.setPaused(true)
        flushSync()
        vi.advanceTimersByTime(10000)
        flushSync()
        expect(playerControlsStore.current).toBe(cursor)
        expect({...playerControlsStore.score}).toEqual(score)
        expect(playerControlsStore.pagesState.pages.flat().length).toBe(frames)
        expect(onSongFinished).not.toHaveBeenCalled()

        playerStore.setPaused(false)
        flushSync()
        vi.advanceTimersByTime(10000)
        flushSync()
        expect(onSongFinished).toHaveBeenCalled()
    })

    // Every transport command clears `paused` as a side effect (a run can never start out paused),
    // so the un-pause edge alone cannot mean "resume": without keying the pause to the run it was
    // taken on, stopping or picking another song would re-anchor the run just replaced.
    it('does not resume a paused run that a stop or another song took over', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 0, song.notes.length)
        await vi.waitFor(() => expect(commitSongNote).toHaveBeenCalled())
        playerStore.setPaused(true)
        flushSync()
        const committed = commitSongNote.mock.calls.length

        playerStore.resetSong()
        flushSync()
        await new Promise(resolve => setTimeout(resolve, 300))
        expect(playerStore.eventType).toBe('stop')
        expect(commitSongNote).toHaveBeenCalledTimes(committed)

        playerStore.play(song, 0, song.notes.length)
        await vi.waitFor(() => expect(playerControlsStore.current).toBeGreaterThan(0), {timeout: 4000})
        playerStore.setPaused(true)
        flushSync()
        playerStore.play(song, 2, song.notes.length)
        await vi.waitFor(() => expect(playerControlsStore.position).toBe(2))
        //a stale resume would have issued a seek back to the previous run's cursor, which is
        //exactly what publishing the new Section rules out
        expect(playerStore.state.preservesSection).toBe(false)
        expect(playerControlsStore.end).toBe(song.notes.length)
    }, 15000)

    it('clears the practice sheet and score as soon as approach preparation starts', async () => {
        const song = await enterPractice()
        playerControlsStore.increaseScore(true)
        expect(playerControlsStore.score.correct).toBe(2)

        playerStore.approaching(song, 0, song.notes.length)

        await vi.waitFor(() => expect(playerControlsStore.pagesState.pages).toEqual([]))
        expect(playerControlsStore.score).toEqual({correct: 1, wrong: 1, score: 0, combo: 0})
        expect(mocks.pendingDelays.some(({ms}) => ms === approachCountdownStepMs)).toBe(true)
        expect(target.querySelector('.approach-countdown')?.textContent?.trim()).toBe('3')
    })

    it('shows 3, 2, 1 across the 35%-shorter approach preparation', async () => {
        await beginApproach()

        const durations = await finishApproachCountdown()

        expect(durations).toHaveLength(3)
        expect(durations.reduce((total, duration) => total + duration, 0))
            .toBeCloseTo(approachPreparationMs, 6)
        expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0)
    })

    it('does not let an old approach phase change the replacement run countdown', async () => {
        const song = await beginApproach()
        const stalePhase = takePendingDelay(approachCountdownStepMs)

        playerStore.approaching(song, 1, song.notes.length)
        await vi.waitFor(() => {
            expect(mocks.pendingDelays).toHaveLength(1)
            expect(target.querySelector('.approach-countdown')?.textContent?.trim()).toBe('3')
        })
        const replacementPhase = mocks.pendingDelays[0]

        stalePhase.resolve()
        await Promise.resolve()
        await Promise.resolve()
        flushSync()

        expect(target.querySelector('.approach-countdown')?.textContent?.trim()).toBe('3')
        expect(mocks.pendingDelays).toEqual([replacementPhase])
        await finishApproachCountdown()
    })

    it('removes the approach countdown when the run is stopped', async () => {
        await beginApproach()
        expect(target.querySelector('.approach-countdown')?.textContent?.trim()).toBe('3')

        playerStore.resetSong()

        await vi.waitFor(() => expect(target.querySelector('.approach-countdown')).toBeNull())
    })

    // ADR-0010: the sheet is the WHOLE song in every mode - approaching included, which built no
    // pages at all before - and the Section only bounds what runs. The assertions below are
    // written against the sheet a full-song run produces rather than against literal spans,
    // because which notes are playable is a property of the game's keyboard.
    it('builds the play-mode sheet from the whole song, not from the Section', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 2, 4)

        await vi.waitFor(() =>
            expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
        const spans = sheetSpans()
        // frames outside [2,4) are on the sheet as targets; only the plan is Section-bounded. Play
        // filters nothing, so its frames cover every note of the song exactly once.
        expect(spans[0][0]).toBe(0)
        expect(spans[spans.length - 1][1]).toBe(song.notes.length - 1)
        expect(playerControlsStore.pagesState.pages.flat()
            .reduce((total, chunk) => total + chunk.notes.length, 0)).toBe(song.notes.length)
    })

    it('publishes a run range as the Section, but leaves the Section alone for a seek', async () => {
        const song = buildRecordedSong()
        playerStore.play(song, 1, 3)
        await vi.waitFor(() => expect(playerControlsStore.position).toBe(1))
        expect(playerControlsStore.end).toBe(3)

        // "Go to here" on a frame past the Section's end: that ONE run reaches the song's end and
        // the cursor moves there, while the bounds the user drew are untouched (ADR-0010)
        playerStore.seek(4, song.notes.length)
        await vi.waitFor(() => expect(playerControlsStore.current).toBe(4))
        expect(playerControlsStore.position).toBe(1)
        expect(playerControlsStore.end).toBe(3)
        expect(playerControlsStore.size).toBe(song.notes.length)

        // ...and the next ordinary restart publishes the Section again
        playerStore.restartSong(playerControlsStore.position, playerControlsStore.end)
        await vi.waitFor(() => expect(playerControlsStore.current).toBe(1))
        expect(playerControlsStore.position).toBe(1)
        expect(playerControlsStore.end).toBe(3)
    })

    it('shows the whole song in practice while queueing only the Section', async () => {
        await enterPractice()
        const wholeSong = sheetSpans()
        expect(wholeSong.length).toBeGreaterThan(1)

        // a Section that is exactly the second frame
        await enterPractice(wholeSong[1][0], wholeSong[1][1] + 1)

        expect(sheetSpans()).toEqual(wholeSong)
        // the cursor starts on the queue's first frame, and which frame is current follows from it
        expect(playerControlsStore.current).toBe(wholeSong[1][0])
        expect(playerControlsStore.currentChunkIndex).toBe(1)
    })

    it('jumps the practice cursor to the next queued frame, over notes no click can clear', async () => {
        const song = await enterPractice()
        const frames = playerControlsStore.pagesState.pages.flat()
            .map(chunk => ({
                first: chunk.firstNoteIndex,
                last: chunk.lastNoteIndex,
                buttons: chunk.notes.map(note => note.keyboardButton),
                lastNote: chunk.notes[chunk.notes.length - 1].absoluteIndex,
            }))
        expect(frames.length).toBeGreaterThan(1)
        // the case this test exists for is live: some frame spans an absolute index none of its
        // surviving notes carries (a doubled key the dedupe dropped), so counting one per click
        // would leave the cursor short of the next frame forever
        expect(frames.some(frame => frame.last > frame.lastNote)).toBe(true)
        expect(playerControlsStore.current).toBe(frames[0].first)

        frames.forEach((frame, index) => {
            frame.buttons.forEach(button => pressButton(button))
            // a completed frame hands the cursor to the next QUEUED frame's first note - and, once
            // the queue empties, to the run's exclusive `end`, whatever the last frame's own notes
            // were
            expect(playerControlsStore.current)
                .toBe(frames[index + 1]?.first ?? song.notes.length)
        })
        expect(playerControlsStore.current).toBe(song.notes.length)
        // ...while the highlight stays on the last frame the run played
        expect(playerControlsStore.currentChunkIndex).toBe(frames.length - 1)
        expect(onSongFinished).toHaveBeenCalledTimes(1)
    })

    it('keeps the practice highlight on a frame until every one of its notes is clicked', async () => {
        const song = buildAdjacentFrameSong()
        await enterPractice(0, song.notes.length, song)
        const frames = playerControlsStore.pagesState.pages.flat()
        expect(frames[0].notes.length).toBe(2)
        // the frame's span ENDS on a note that still has to be pressed - see buildAdjacentFrameSong
        expect(frames[0].lastNoteIndex).toBe(frames[0].notes[1].absoluteIndex)

        // its highest-indexed note first: the per-note advance is clamped to the frame, so the
        // highlight only leaves a frame the completion branch declared done
        pressButton(frames[0].notes[1].keyboardButton)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(0)
        pressButton(frames[0].notes[0].keyboardButton)
        // completion hands the highlight to the next queued frame - unless this game's keyboard
        // has no key for the third note (Sky's doesn't), in which case the sheet holds only this
        // one frame, the run ends here, and the run-end cap keeps the highlight on it
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(frames.length > 1 ? 1 : 0)
    })

    it('lands the finished practice cursor on the run end, with the highlight on the last frame it queued', async () => {
        await enterPractice()
        const frames = playerControlsStore.pagesState.pages.flat()
        expect(frames.length).toBeGreaterThan(1)
        const lastQueued = frames.length - 2

        // a Section ending one past that frame: `end` is exclusive, so the final frame never runs
        const sectionEnd = frames[lastQueued].lastNoteIndex + 1
        await enterPractice(0, sectionEnd)
        // both runs start at 0, so the published `end` is the only proof the SECOND one is up
        await vi.waitFor(() => expect(playerControlsStore.end).toBe(sectionEnd))
        for (let index = 0; index <= lastQueued; index++)
            frames[index].notes.forEach(note => pressButton(note.keyboardButton))

        expect(onSongFinished).toHaveBeenCalled()
        // the cursor reaches `end` itself, so the slider's progress line does too - and the
        // highlight still sits on the last frame the run queued rather than on the first frame
        // AFTER the Section, which is what the store's `runEnd` lookup clamp buys
        expect(playerControlsStore.current).toBe(playerControlsStore.end)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(lastQueued)
    })

    it('advances the approaching cursor by the circles that resolve, and lands it on the last frame', async () => {
        await beginApproach()
        await finishApproachCountdown(() => vi.useFakeTimers())

        const frames = playerControlsStore.pagesState.pages.flat()
        expect(frames.length).toBeGreaterThan(1)
        expect(playerControlsStore.current).toBe(0)

        // the cursor follows the CIRCLES now, not a count of how many left the grid: the first one
        // to resolve puts it one past its own note
        let elapsed = 0
        while (playerControlsStore.current === 0 && elapsed < 10000) {
            vi.advanceTimersByTime(50)
            elapsed += 50
        }
        expect(playerControlsStore.current).toBe(frames[0].notes[0].absoluteIndex + 1)

        // ...and the run ending takes it to the run's exclusive `end`, which is where the slider's
        // progress line has to reach, while the highlight stays on the last frame the run played
        // (the store's `runEnd` lookup clamp) rather than the dimmed one after it.
        vi.advanceTimersByTime(10000)
        expect(onSongFinished).toHaveBeenCalled()
        expect(playerControlsStore.current).toBe(playerControlsStore.end)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(frames.length - 1)
    })

    it('keeps the approaching sheet whole-song while the circles stay Section-bounded', async () => {
        await beginApproach()
        await finishApproachCountdown()
        await vi.waitFor(() =>
            expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
        const wholeSong = sheetSpans()
        expect(wholeSong.length).toBeGreaterThan(1)

        await beginApproach(wholeSong[1][0], wholeSong[1][1] + 1)
        // the pages stay empty for the whole preparation window, so a stale run cannot install
        // them over a newer mode's
        expect(playerControlsStore.pagesState.pages).toEqual([])
        await finishApproachCountdown()
        await vi.waitFor(() =>
            expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))

        expect(sheetSpans()).toEqual(wholeSong)
    })

    it.each(['practice', 'play'] as const)(
        'does not let a stale approach initializer overwrite a newer %s run',
        async destination => {
            const song = await beginApproach()
            const staleApproach = takePendingDelay(approachCountdownStepMs)

            if (destination === 'practice') playerStore.practice(song, 0, song.notes.length)
            else playerStore.play(song, 0, song.notes.length)
            await vi.waitFor(() =>
                expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
            expect(target.querySelector('.approach-countdown')).toBeNull()
            playerControlsStore.increaseScore(true)
            const pagesBefore = playerControlsStore.pagesState.pages.map(page =>
                page.map(chunk => chunk.clone()))
            const scoreBefore = {...playerControlsStore.score}

            staleApproach.resolve()
            await Promise.resolve()
            await Promise.resolve()
            flushSync()

            expect(playerStore.eventType).toBe(destination)
            expect(target.querySelector('.approach-countdown')).toBeNull()
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

    it.each(['play', 'practice', 'approaching', 'stop', 'restart', 'seek'] as const)(
        'synchronously resets every outgoing note UI field before a %s transition',
        transition => {
            const song = buildRecordedSong()
            const note = playerStore.keyboard[0]
            note.setState({
                status: 'toClickNext',
                delay: 123,
                animationId: 456,
                holdMs: 789,
                holdTimerMs: 321,
            })
            const previousHoldTimerId = note.data.holdTimerId

            if (transition === 'play') playerStore.play(song, 0, song.notes.length)
            if (transition === 'practice') playerStore.practice(song, 0, song.notes.length)
            if (transition === 'approaching') playerStore.approaching(song, 0, song.notes.length)
            if (transition === 'stop') playerStore.resetSong()
            if (transition === 'restart') playerStore.restartSong(0, song.notes.length)
            if (transition === 'seek') playerStore.seek(0, song.notes.length)

            expect(note.data).toMatchObject({
                status: '',
                animationId: 0,
                holdMs: 0,
                holdTimerMs: 0,
                holdTimerId: previousHoldTimerId + 1,
            })
        },
    )

    it('does not carry practice hints through a stop immediately followed by playback', async () => {
        const song = await enterPractice()
        const outgoingKeyboard = [...playerStore.keyboard]
        expect(outgoingKeyboard.some(note => note.status === 'toClick')).toBe(true)
        expect(outgoingKeyboard.some(note =>
            note.status === 'toClickNext' || note.status === 'toClickAndNext')).toBe(true)

        // This is deliberately back-to-back: the old debounced teardown has not had an
        // opportunity to run before the replacement command arrives.
        playerStore.resetSong()
        playerStore.play(song, 0, song.notes.length)

        expect(outgoingKeyboard.every(note => note.status === '')).toBe(true)
        await vi.waitFor(() => expect(playerStore.eventType).toBe('play'))
        await vi.waitFor(() =>
            expect(playerControlsStore.pagesState.pages.length).toBeGreaterThan(0))
        expect(playerStore.keyboard.every(note =>
            !['toClick', 'toClickNext', 'toClickAndNext'].includes(note.status))).toBe(true)
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
            expect(mocks.pendingDelays.some(({ms}) => ms === approachCountdownStepMs)).toBe(true))
        await finishApproachCountdown(() => vi.useFakeTimers())

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
