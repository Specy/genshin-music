import {readFileSync} from 'node:fs'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {vsrgPlayerStore} from '../src/lib/stores/VsrgPlayerStore.svelte'
import {VsrgSong} from '../src/lib/core/Songs/VsrgSong.svelte'
import {flushEffects, observeSignal} from './signals.svelte'

// vsrgPlayerStore is a module-level singleton (matches the old mobx store's own singleton export,
// same convention as playerControlsStore.test.ts) - reset the sub-state each test actually reads
// before every test so execution order never matters.
beforeEach(() => {
    vsrgPlayerStore.resetScore()
    vsrgPlayerStore.setLayout([])
    vsrgPlayerStore.stopSong()
})

describe('incrementScore (combo/score math)', () => {
    it('accumulates combo and uses the baseScoreMap product on a run of the same hit type', () => {
        // resetScore() baseline: combo 0, score 0
        vsrgPlayerStore.incrementScore('amazing') // combo 0->1, score += 300*1
        expect(vsrgPlayerStore.score.amazing).toBe(1)
        expect(vsrgPlayerStore.score.combo).toBe(1)
        expect(vsrgPlayerStore.score.score).toBe(300)

        vsrgPlayerStore.incrementScore('amazing') // combo 1->2, score += 300*2
        expect(vsrgPlayerStore.score.amazing).toBe(2)
        expect(vsrgPlayerStore.score.combo).toBe(2)
        expect(vsrgPlayerStore.score.score).toBe(900)
    })

    it('scores every hit type by its exact baseScoreMap product (300/200/100/50/25/0)', () => {
        vsrgPlayerStore.incrementScore('perfect') // combo 0->1, +200*1 = 200
        expect(vsrgPlayerStore.score.score).toBe(200)
        vsrgPlayerStore.incrementScore('great')   // combo 1->2, +100*2 = 200 -> 400
        expect(vsrgPlayerStore.score.score).toBe(400)
        vsrgPlayerStore.incrementScore('good')    // combo 2->3, +50*3 = 150 -> 550
        expect(vsrgPlayerStore.score.score).toBe(550)
        vsrgPlayerStore.incrementScore('bad')     // combo 3->4, +25*4 = 100 -> 650
        expect(vsrgPlayerStore.score.score).toBe(650)
        expect(vsrgPlayerStore.score).toMatchObject({perfect: 1, great: 1, good: 1, bad: 1})
    })

    it('resets combo to 0 on a miss and awards zero points regardless of the pre-miss combo', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('amazing')
        expect(vsrgPlayerStore.score.combo).toBe(2)
        expect(vsrgPlayerStore.score.score).toBe(900)

        vsrgPlayerStore.incrementScore('miss') // combo forced to 0, getScore('miss')=0 -> +0
        expect(vsrgPlayerStore.score.combo).toBe(0)
        expect(vsrgPlayerStore.score.miss).toBe(1)
        expect(vsrgPlayerStore.score.score).toBe(900)

        vsrgPlayerStore.incrementScore('amazing') // combo restarts at 1 after the miss
        expect(vsrgPlayerStore.score.combo).toBe(1)
        expect(vsrgPlayerStore.score.score).toBe(1200)
    })

    it('records lastScore with the post-increment type and combo', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('good')
        expect(vsrgPlayerStore.score.lastScore.type).toBe('good')
        expect(vsrgPlayerStore.score.lastScore.combo).toBe(2)
        expect(typeof vsrgPlayerStore.score.lastScore.timestamp).toBe('number')
    })
})

/**
 * The peak combo a run reached, which is what the end-of-song panel prints where it used to print
 * the live one. It is the only number on that panel that cannot be recomputed after the fact: the
 * grade and the accuracy are derived from the tallies on every read (vsrgGrade.ts), but a combo is a
 * property of the ORDER the judgments arrived in, and a tally is an unordered count.
 *
 * What silently breaks without these:
 * - the peak goes down with the live combo. Both are written from the same local in incrementScore,
 *   and that local is forced to 0 on a miss - so the panel would report the streak the run happened
 *   to end on rather than its best, and 0 for every run whose last note was dropped, which is
 *   exactly the reading this replaced.
 * - the peak leaks into the next run. resetScore's literal is the only reset path there is (both
 *   callers reach it: VsrgPlayerRenderer.onSongPick, which the panel's own Retry button ends at, and
 *   the route's teardown), and a field left out of it is carried over by the Object.assign in
 *   silence, so a fresh chart would open showing the previous one's best.
 */
describe('maxCombo (the peak a run reached)', () => {
    it('keeps the peak across the miss that zeroes the live combo', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('amazing')
        expect(vsrgPlayerStore.score.maxCombo).toBe(2)

        vsrgPlayerStore.incrementScore('miss')
        expect(vsrgPlayerStore.score.combo).toBe(0)
        expect(vsrgPlayerStore.score.maxCombo).toBe(2)
    })

    it('is never pulled down by a shorter streak that follows', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('miss')
        vsrgPlayerStore.incrementScore('good') // a new streak, one long
        expect(vsrgPlayerStore.score.combo).toBe(1)
        expect(vsrgPlayerStore.score.maxCombo).toBe(3)
    })

    it('rises again once the new streak passes the old peak', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('miss')
        vsrgPlayerStore.incrementScore('great')
        vsrgPlayerStore.incrementScore('great')
        expect(vsrgPlayerStore.score.maxCombo).toBe(2)
    })

    it('equals the final combo on a run with no misses', () => {
        //`bad` is a judgment, not a break - only `miss` cuts the combo, so a run without one holds a
        //single streak from its first note to its last and the two numbers have to agree
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('bad')
        vsrgPlayerStore.incrementScore('perfect')
        expect(vsrgPlayerStore.score.combo).toBe(3)
        expect(vsrgPlayerStore.score.maxCombo).toBe(3)
    })

    it('is back to 0 for a new run - the path Retry takes', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.showScore()

        vsrgPlayerStore.resetScore()
        expect(vsrgPlayerStore.score.maxCombo).toBe(0)

        //and the fresh run counts from there rather than resuming the old peak
        vsrgPlayerStore.incrementScore('good')
        expect(vsrgPlayerStore.score.maxCombo).toBe(1)
    })
})

describe('resetScore (full-shape reset)', () => {
    it('resets every field back to its zero/empty shape, including scoreVisible and lastScore', () => {
        vsrgPlayerStore.incrementScore('amazing')
        vsrgPlayerStore.incrementScore('miss')
        vsrgPlayerStore.showScore()
        expect(vsrgPlayerStore.score.scoreVisible).toBe(true)

        vsrgPlayerStore.resetScore()

        expect(vsrgPlayerStore.score).toEqual({
            scoreVisible: false,
            combo: 0,
            maxCombo: 0,
            score: 0,
            amazing: 0,
            perfect: 0,
            great: 0,
            good: 0,
            bad: 0,
            miss: 0,
            lastScore: {timestamp: 0, type: '', combo: 0},
        })
    })
})

describe('setLayout (index/key assignment)', () => {
    it('assigns sequential index and the key string, every entry unpressed', () => {
        vsrgPlayerStore.setLayout(['A', 'S', 'D', 'G'])
        expect(vsrgPlayerStore.keyboard).toEqual([
            {key: 'A', index: 0, isPressed: false},
            {key: 'S', index: 1, isPressed: false},
            {key: 'D', index: 2, isPressed: false},
            {key: 'G', index: 3, isPressed: false},
        ])
    })

    it('replaces the layout (including shrinking) on a second call', () => {
        vsrgPlayerStore.setLayout(['A', 'S', 'D', 'G', 'H', 'J'])
        vsrgPlayerStore.setLayout(['A', 'S'])
        expect(vsrgPlayerStore.keyboard).toEqual([
            {key: 'A', index: 0, isPressed: false},
            {key: 'S', index: 1, isPressed: false},
        ])
    })
})

describe('pressKey / releaseKey (keyboard-listener emission)', () => {
    beforeEach(() => {
        vsrgPlayerStore.setLayout(['A', 'S'])
    })

    it('emits exactly one "down" then exactly one "up" per call, to every registered listener', () => {
        const listener1 = vi.fn()
        const listener2 = vi.fn()
        vsrgPlayerStore.addKeyboardListener({id: 'l1', callback: listener1})
        vsrgPlayerStore.addKeyboardListener({id: 'l2', callback: listener2})

        vsrgPlayerStore.pressKey(0)
        expect(vsrgPlayerStore.keyboard[0].isPressed).toBe(true)
        expect(listener1).toHaveBeenCalledTimes(1)
        expect(listener1).toHaveBeenLastCalledWith({key: 'A', index: 0, isPressed: true}, 'down')
        expect(listener2).toHaveBeenCalledTimes(1)
        expect(listener2).toHaveBeenLastCalledWith({key: 'A', index: 0, isPressed: true}, 'down')

        vsrgPlayerStore.releaseKey(0)
        expect(vsrgPlayerStore.keyboard[0].isPressed).toBe(false)
        expect(listener1).toHaveBeenCalledTimes(2)
        expect(listener1).toHaveBeenLastCalledWith({key: 'A', index: 0, isPressed: false}, 'up')
        expect(listener2).toHaveBeenCalledTimes(2)
        expect(listener2).toHaveBeenLastCalledWith({key: 'A', index: 0, isPressed: false}, 'up')

        vsrgPlayerStore.removeKeyboardListener({id: 'l1'})
        vsrgPlayerStore.removeKeyboardListener({id: 'l2'})
    })

    it('removeKeyboardListener stops further emission for that listener only', () => {
        const removed = vi.fn()
        const kept = vi.fn()
        vsrgPlayerStore.addKeyboardListener({id: 'removed', callback: removed})
        vsrgPlayerStore.addKeyboardListener({id: 'kept', callback: kept})

        vsrgPlayerStore.pressKey(0)
        vsrgPlayerStore.removeKeyboardListener({id: 'removed'})
        vsrgPlayerStore.releaseKey(0)

        expect(removed).toHaveBeenCalledTimes(1) // only the press, before removal
        expect(kept).toHaveBeenCalledTimes(2) // both press and release

        vsrgPlayerStore.removeKeyboardListener({id: 'kept'})
    })

    it('presses/releases a second key independently, each targeting only its own index', () => {
        const listener = vi.fn()
        vsrgPlayerStore.addKeyboardListener({id: 'independent', callback: listener})

        vsrgPlayerStore.pressKey(1)
        expect(vsrgPlayerStore.keyboard[0].isPressed).toBe(false)
        expect(vsrgPlayerStore.keyboard[1].isPressed).toBe(true)
        expect(listener).toHaveBeenLastCalledWith({key: 'S', index: 1, isPressed: true}, 'down')

        vsrgPlayerStore.removeKeyboardListener({id: 'independent'})
    })
})

/**
 * `keyboard` is `$state.raw` (see the field's comment: the player's renderer indexes it per hit
 * object per frame, so its elements have to be plain). Under raw, "published" means the FIELD was
 * assigned - and for the keyboard UI it also means the touched element is a new object, because
 * VsrgPlayerKeyboard reads each key through an identity-compared `{@const}`.
 *
 * Both halves are silent when they break - the store keeps reporting the right thing and the keys
 * stop lighting up - and they break on DIFFERENT regressions, which is why the two are separate:
 *  - 'a press installs a new array AND a new key' is the one that fails if a press goes back to
 *    editing the KeyboardKey IN PLACE while still assigning the array. The array signal fires, so
 *    nothing that watches the array notices anything is wrong; the identity-compared `{@const}`
 *    still holds the same object and draws the key unpressed (verified: with that form in place it
 *    is the only failing test in this file).
 *  - 'a subscriber reading a key through the array is notified' is the one that fails if a press
 *    stops ASSIGNING the array - under `$state.raw` an element write publishes nothing at all, so
 *    no subscriber runs.
 */
describe('the keyboard publishes by assigning', () => {
    beforeEach(() => {
        vsrgPlayerStore.setLayout(['A', 'S'])
    })

    it('setLayout installs a new array', () => {
        const before = vsrgPlayerStore.keyboard
        vsrgPlayerStore.setLayout(['A', 'S', 'D', 'G'])
        expect(vsrgPlayerStore.keyboard).not.toBe(before)
    })

    it('a press installs a new array AND a new key, leaving the previous ones as they were', () => {
        const before = vsrgPlayerStore.keyboard
        const beforeKey = before[0]
        vsrgPlayerStore.pressKey(0)
        expect(vsrgPlayerStore.keyboard).not.toBe(before)
        expect(vsrgPlayerStore.keyboard[0]).not.toBe(beforeKey)
        expect(beforeKey.isPressed).toBe(false)
        //the untouched key is carried over as-is: only the pressed index is rebuilt
        expect(vsrgPlayerStore.keyboard[1]).toBe(before[1])
    })

    it('a subscriber reading a key through the array is notified of a press', async () => {
        //optional-chained so a failing run reports the count rather than crashing the effect on the
        //next test's empty layout - the effect outlives a failed assertion, dispose() is below it
        const observer = observeSignal(() => vsrgPlayerStore.keyboard[0]?.isPressed)
        await flushEffects()
        const baseline = observer.runs()
        vsrgPlayerStore.pressKey(0)
        await flushEffects()
        expect(observer.runs()).toBe(baseline + 1)
        vsrgPlayerStore.releaseKey(0)
        await flushEffects()
        expect(observer.runs()).toBe(baseline + 2)
        observer.dispose()
    })
})

describe('playSong / stopSong / showScore', () => {
    it('playSong stores a CLONE of the song (not the same reference) and sets type to "play"', () => {
        const song = new VsrgSong('Test song')
        vsrgPlayerStore.playSong(song)
        expect(vsrgPlayerStore.currentSong.type).toBe('play')
        expect(vsrgPlayerStore.currentSong.song).not.toBeNull()
        expect(vsrgPlayerStore.currentSong.song).not.toBe(song)
        expect(vsrgPlayerStore.currentSong.song?.name).toBe('Test song')
    })

    it('stopSong clears the song back to null and type to "stop"', () => {
        vsrgPlayerStore.playSong(new VsrgSong('Test song'))
        vsrgPlayerStore.stopSong()
        expect(vsrgPlayerStore.currentSong).toEqual({song: null, type: 'stop'})
    })

    it('showScore sets scoreVisible without touching any other score field', () => {
        vsrgPlayerStore.incrementScore('amazing')
        const before = {...vsrgPlayerStore.score}
        vsrgPlayerStore.showScore()
        expect(vsrgPlayerStore.score).toEqual({...before, scoreVisible: true})
    })
})

// The two surfaces that print a combo read DIFFERENT fields now - the corner takes `lastScore.combo`
// (the live streak) and the end-of-song panel takes `maxCombo` (the peak) - and only the panel's
// carries a label. Nothing zeroes the corner one when a run ends: the 800ms timeout in
// VsrgLatestScore blanks the judgment only, and `resetScore` does not run until the next song pick,
// so without the guard below both numbers sit on screen at once, disagreeing.
describe('only one combo is on screen once the run is over', () => {
    it('the corner readout is gated on the result panel being closed', () => {
        const latestScore = readFileSync(
            'src/lib/components/pages/VsrgPlayer/VsrgLatestScore.svelte', 'utf8')
        expect(latestScore).toMatch(/\{#if data\.combo > 0 && !vsrgPlayerStore\.score\.scoreVisible\}/)
    })

    it('the panel prints the peak, which is the only combo left up at that point', () => {
        const panel = readFileSync(
            'src/lib/components/pages/VsrgPlayer/VsrgPlayerScore.svelte', 'utf8')
        expect(panel).toMatch(/vsrg_player:max_combo.*\}x/s)
        expect(panel).not.toMatch(/vsrgPlayerStore\.score\.combo\b/)
    })
})
