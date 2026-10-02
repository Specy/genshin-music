import {flushSync, mount, tick, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import PlayerSheetCard from '../src/lib/components/pages/Player/PlayerSheetCard.svelte'
import {playerControlsStore} from '../src/lib/stores/PlayerControlsStore.svelte'
import {Chunk, RecordedNote} from './imports'

// The Sheet Card mounted on hand-made frames: what the Section looks like ON the sheet (brackets +
// dimming), what a frame's popover does, and that expanding shows every frame of the song rather
// than the current page. Hand-made spans rather than a real run so the cases the mode filters make
// rare - a bound falling between two frames, a Section of one frame - are reachable directly.
function frameChunk(firstNoteIndex: number, lastNoteIndex: number) {
    const note = new RecordedNote(0, 100)
    note.displayButton = 0
    return new Chunk([note], 0, firstNoteIndex, lastNoteIndex)
}

/** Three frames spanning a 5-note song: [0,0], [1,3], [4,4], split over two pages. */
function threeFramesOverTwoPages() {
    const chunks = [frameChunk(0, 0), frameChunk(1, 3), frameChunk(4, 4)]
    playerControlsStore.setPages([[chunks[0], chunks[1]], [chunks[2]]])
}

function manyFrames(count: number, pageSize = 1) {
    const chunks = Array.from({length: count}, (_, i) => frameChunk(i, i))
    const pages: Chunk[][] = []
    for (let i = 0; i < chunks.length; i += pageSize) pages.push(chunks.slice(i, i + pageSize))
    playerControlsStore.setPages(pages)
}

describe('Sheet Card', () => {
    let target: HTMLDivElement
    let component: ReturnType<typeof mount> | null = null
    let onSeek: ReturnType<typeof vi.fn>
    let onSectionChange: ReturnType<typeof vi.fn>

    beforeEach(() => {
        playerControlsStore.clearPages()
        playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0, runEnd: 0})
        target = document.createElement('div')
        document.body.append(target)
        onSeek = vi.fn()
        onSectionChange = vi.fn()
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
        playerControlsStore.clearPages()
        vi.useRealTimers()
    })

    function render() {
        component = mount(PlayerSheetCard, {target, props: {columns: 5, onSeek, onSectionChange}})
        flushSync()
    }

    function frames() {
        return [...target.querySelectorAll<HTMLElement>('[data-frame-index]')]
    }

    /** The two page-bound rules' offsets in the scroll content, in the order they are drawn. */
    function boundOffsets() {
        return [...target.querySelectorAll<HTMLElement>('.player-sheet-page-bound')]
            .map(bound => Number.parseFloat(bound.style.top))
    }

    function popoverItems() {
        //the rows are the song dropdown's own FloatingDropdownRow buttons now
        return [...document.querySelectorAll<HTMLButtonElement>('.frame-popover button')]
    }

    it('brackets the Section and dims what is outside it, without hiding anything', () => {
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 1, end: 4, current: 1})
        render()

        // the inline card holds the CURRENT page, addressed by whole-song frame index
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1'])
        expect(frames()[0].querySelector('.sheet-frame-dimmed')).not.toBeNull()
        expect(frames()[1].querySelector('.sheet-frame-dimmed')).toBeNull()
        // end is exclusive, so frame 2 (span [4,4]) is outside and both markers land on frame 1
        expect(frames()[1].querySelector('.sheet-frame-bracket-start')).not.toBeNull()
        expect(frames()[1].querySelector('.sheet-frame-bracket-end')).not.toBeNull()
        // a dimmed frame is still a target
        expect(frames()[0].querySelector('button')?.disabled).toBe(false)
    })

    it('brackets the frame a bound falls short of, when the bound sits between two frames', () => {
        // spans [0,1] and [4,5]: nothing on the sheet owns absolute 2 or 3
        playerControlsStore.setPages([[frameChunk(0, 1), frameChunk(4, 5)]])
        playerControlsStore.setState({size: 6, position: 2, end: 6, current: 2})
        render()
        expect(frames()[0].querySelector('.sheet-frame-bracket-start')).toBeNull()
        expect(frames()[1].querySelector('.sheet-frame-bracket-start')).not.toBeNull()
        expect(frames()[1].querySelector('.sheet-frame-bracket-end')).not.toBeNull()
        expect(frames()[0].querySelector('.sheet-frame-dimmed')).not.toBeNull()
    })

    it('sets a bound, reports the change, and pushes the partner it would cross', () => {
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 1, current: 0})
        render()

        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(popoverItems().map(i => i.textContent?.trim()))
            .toEqual(['Section starts here', 'Section ends here', 'Go to here'])

        // start 1 would be at/after the stored end 1 - chosen bound wins, end goes to song length
        popoverItems()[0].click()
        flushSync()
        expect(playerControlsStore.position).toBe(1)
        expect(playerControlsStore.end).toBe(5)
        // The card owns only the bound mutation; its parent decides whether this callback lights a
        // hint or immediately restarts an active run.
        expect(playerControlsStore.current).toBe(0)
        expect(onSectionChange).toHaveBeenCalledTimes(1)
        expect(onSeek).not.toHaveBeenCalled()
        expect(document.querySelector('.frame-popover')).toBeNull()

        // "ends here" includes the frame: one past its last note
        frames()[0].querySelector('button')!.click()
        flushSync()
        popoverItems()[1].click()
        flushSync()
        expect(playerControlsStore.end).toBe(1)
        expect(playerControlsStore.position).toBe(0)
    })

    it('removes a bound from its marked frame and disables the full-song boundary actions', () => {
        const chunks = [frameChunk(0, 0), frameChunk(1, 3), frameChunk(4, 4)]
        playerControlsStore.setPages([chunks])
        playerControlsStore.setState({size: 5, position: 1, end: 4, current: 1})
        render()

        // This one frame carries both brackets, so both rows become removal actions.
        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(popoverItems().map(item => item.textContent?.trim()))
            .toEqual(['Remove section start', 'Remove section end', 'Go to here'])
        expect(popoverItems().slice(0, 2).every(item => !item.disabled)).toBe(true)

        popoverItems()[0].click()
        flushSync()
        expect(playerControlsStore.position).toBe(0)
        expect(playerControlsStore.end).toBe(4)
        expect(onSectionChange).toHaveBeenCalledTimes(1)

        // The start marker moved to frame 0, while frame 1 still owns the removable end marker.
        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(popoverItems().map(item => item.textContent?.trim()))
            .toEqual(['Section starts here', 'Remove section end', 'Go to here'])
        popoverItems()[1].click()
        flushSync()
        expect(playerControlsStore.end).toBe(5)
        expect(onSectionChange).toHaveBeenCalledTimes(2)

        // At the song extremes there is no narrower bound to remove. Keep the actions visible so
        // the menu is stable, but disable the row that would be a no-op.
        frames()[0].querySelector('button')!.click()
        flushSync()
        expect(popoverItems()[0].textContent?.trim()).toBe('Section starts here')
        expect(popoverItems()[0].disabled).toBe(true)
        frames()[0].querySelector('button')!.click()
        flushSync()

        frames()[2].querySelector('button')!.click()
        flushSync()
        expect(popoverItems()[1].textContent?.trim()).toBe('Section ends here')
        expect(popoverItems()[1].disabled).toBe(true)
    })

    it('seeks to the frame first note, and keeps at most one popover open', () => {
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 5, current: 0})
        render()

        frames()[0].querySelector('button')!.click()
        flushSync()
        expect(document.querySelectorAll('.frame-popover').length).toBe(1)
        // a second frame replaces the first one's popover rather than adding to it
        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(document.querySelectorAll('.frame-popover').length).toBe(1)
        popoverItems()[2].click()
        flushSync()
        expect(onSeek).toHaveBeenCalledWith(1)
        expect(playerControlsStore.position).toBe(0)
        expect(playerControlsStore.end).toBe(5)

        // clicking the same frame twice closes it
        frames()[1].querySelector('button')!.click()
        flushSync()
        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(document.querySelector('.frame-popover')).toBeNull()
    })

    it('drops an open popover when the page flips under it', () => {
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 5, current: 0})
        render()
        frames()[1].querySelector('button')!.click()
        flushSync()
        expect(document.querySelector('.frame-popover')).not.toBeNull()
        // current 4 lives on frame 2, i.e. the second page
        playerControlsStore.setCurrent(4)
        flushSync()
        expect(playerControlsStore.currentPageIndex).toBe(1)
        expect(document.querySelector('.frame-popover')).toBeNull()
    })

    it('shows the whole short song throughout reveal and collapse, then returns inline', async () => {
        // The reveal/hide are Web Animations; jsdom has no Element.animate, so the component's
        // 250ms fallback timers drive its phase machine here.
        vi.useFakeTimers()
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 5, current: 0})
        render()
        expect(frames().length).toBe(2)

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await tick()
        await tick()
        flushSync()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1', '2'])
        expect(
            Number.parseFloat(
                target.querySelector<HTMLElement>('.player-sheet-card')!.style
                    .getPropertyValue('--sheet-center-shift')
            )
        ).toBe(0)
        expect(frames()[0].querySelector('.sheet-frame-bracket-start')).not.toBeNull()
        expect(frames()[2].querySelector('.sheet-frame-bracket-end')).not.toBeNull()
        expect(target.querySelector('.player-sheet-card-expanded')).not.toBeNull()

        // Reversing mid-reveal waits for its end instead of jumping to a fully-open hide clip.
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}))
        flushSync()
        expect(target.querySelector('.player-sheet-card-closing')).toBeNull()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1', '2'])

        // the reveal ends: the queued reversal starts the hide, still showing every frame
        vi.advanceTimersByTime(251)
        flushSync()
        expect(target.querySelector('.player-sheet-card-closing')).not.toBeNull()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1', '2'])

        vi.advanceTimersByTime(251)
        flushSync()
        expect(target.querySelector('.player-sheet-card-expanded')).toBeNull()
        expect(target.querySelector('.player-sheet-card-closing')).toBeNull()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1'])

        playerControlsStore.clearPages()
        flushSync()
        expect(target.querySelector('.player-sheet-card')).toBeNull()
    })

    it('finishes both phases on the fallback timers when no Web Animation runs', async () => {
        vi.useFakeTimers()
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 5, current: 0})
        render()

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await tick()
        await tick()
        vi.advanceTimersByTime(251)
        flushSync()

        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}))
        flushSync()
        expect(target.querySelector('.player-sheet-card-closing')).not.toBeNull()

        vi.advanceTimersByTime(251)
        flushSync()
        expect(target.querySelector('.player-sheet-card-closing')).toBeNull()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1'])
    })

    it('windows a long song by whole-song row and drops a popover whose row unmounts', async () => {
        //fake timers so the 250ms fallback can stand in for the reveal Web Animation's finish
        vi.useFakeTimers()
        manyFrames(503)
        playerControlsStore.setState({size: 503, position: 0, end: 503, current: 250})
        render()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['250'])

        const card = target.querySelector<HTMLElement>('.player-sheet-card')!
        const surface = target.querySelector<HTMLElement>('.player-sheet-surface')!
        const scroll = target.querySelector<HTMLElement>('.player-sheet-scroll')!
        Object.defineProperty(card, 'clientHeight', {configurable: true, value: 100})
        vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 100.25))
        Object.defineProperty(scroll, 'clientHeight', {configurable: true, value: 320})
        Object.defineProperty(scroll, 'scrollTop', {configurable: true, writable: true, value: 0})
        Object.defineProperty(frames()[0], 'offsetHeight', {configurable: true, value: 48})

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await tick()
        await tick()
        await tick()
        flushSync()

        const revealIndices = frames().map(f => Number(f.dataset.frameIndex))
        expect(card.style.getPropertyValue('--sheet-collapsed-height')).toBe('100.25px')
        const revealCenterShift = Number.parseFloat(
            card.style.getPropertyValue('--sheet-center-shift')
        )
        const revealScrollTop = scroll.scrollTop
        const revealCurrentFrame = frames().find(frame => frame.dataset.frameIndex === '250')
        expect(revealCenterShift).toBeGreaterThan(0)
        expect(target.querySelector('.player-chunks-window')).not.toBeNull()
        expect(target.querySelector('.player-sheet-card-revealing')).not.toBeNull()
        // Browsers emit this after the opening code's programmatic scrollTop write. It must not
        // shrink the pre-seeded reveal/final union and force fresh mounts at the reveal's end.
        scroll.dispatchEvent(new Event('scroll'))
        flushSync()
        expect(frames().map(f => Number(f.dataset.frameIndex))).toEqual(revealIndices)
        vi.advanceTimersByTime(251)
        flushSync()
        const initialIndices = frames().map(f => Number(f.dataset.frameIndex))
        expect(initialIndices.length).toBeGreaterThan(1)
        expect(initialIndices.length).toBeLessThan(200)
        expect(initialIndices).toContain(250)
        expect(initialIndices.every(index => revealIndices.includes(index))).toBe(true)
        expect(initialIndices[0] % 5).toBe(0)
        expect(initialIndices.every((index, i) => i === 0 || index === initialIndices[i - 1] + 1))
            .toBe(true)
        expect(scroll.scrollTop).toBeGreaterThan(0)
        // The reveal's translation reaches this exact delta; swapping it for scrollTop at its end
        // therefore leaves the selected frame on the same pixel instead of jumping into centre.
        expect(scroll.scrollTop).toBeCloseTo(revealScrollTop - revealCenterShift, 5)
        expect(frames().find(frame => frame.dataset.frameIndex === '250')).toBe(revealCurrentFrame)
        expect(target.querySelector('.player-sheet-card-revealing')).toBeNull()

        // The slice's data and its global index must stay paired; local index 0 is not chunk 0.
        const actionIndex = initialIndices.find(index => index !== 250)!
        frames().find(frame => Number(frame.dataset.frameIndex) === actionIndex)!
            .querySelector('button')!
            .click()
        flushSync()
        popoverItems()[2].click()
        flushSync()
        expect(onSeek).toHaveBeenCalledWith(actionIndex)

        const oldFirstIndex = initialIndices[0]
        frames()[0].querySelector('button')!.click()
        flushSync()
        expect(document.querySelector('.frame-popover')).not.toBeNull()

        scroll.scrollTop = 5000
        scroll.dispatchEvent(new Event('scroll'))
        flushSync()
        const laterIndices = frames().map(f => Number(f.dataset.frameIndex))
        expect(laterIndices.length).toBeLessThan(100)
        expect(laterIndices[0]).toBeGreaterThan(oldFirstIndex)
        expect(laterIndices).not.toContain(oldFirstIndex)
        expect(laterIndices).toContain(502)
        expect(laterIndices.every((index, i) => i === 0 || index === laterIndices[i - 1] + 1))
            .toBe(true)
        expect(document.querySelector('.frame-popover')).toBeNull()

        playerControlsStore.setCurrent(375)
        manyFrames(503)
        flushSync()
        await tick()
        await tick()
        flushSync()
        const replacementIndices = frames().map(f => Number(f.dataset.frameIndex))
        expect(target.querySelector('.player-sheet-card-expanded')).not.toBeNull()
        expect(replacementIndices.length).toBeLessThan(100)
        expect(replacementIndices).toContain(375)
        expect(scroll.scrollTop).toBeLessThan(5000)
    })

    it('holds the expanded view on the frame a Section bound was set from', async () => {
        //fake timers so the 250ms fallback can stand in for the reveal Web Animation's finish
        vi.useFakeTimers()
        manyFrames(503)
        playerControlsStore.setState({size: 503, position: 0, end: 503, current: 0})
        render()

        const card = target.querySelector<HTMLElement>('.player-sheet-card')!
        const surface = target.querySelector<HTMLElement>('.player-sheet-surface')!
        const scroll = target.querySelector<HTMLElement>('.player-sheet-scroll')!
        Object.defineProperty(card, 'clientHeight', {configurable: true, value: 100})
        vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 100.25))
        Object.defineProperty(scroll, 'clientHeight', {configurable: true, value: 320})
        Object.defineProperty(scroll, 'scrollTop', {configurable: true, writable: true, value: 0})
        Object.defineProperty(frames()[0], 'offsetHeight', {configurable: true, value: 48})

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await tick()
        await tick()
        await tick()
        flushSync()
        vi.advanceTimersByTime(251)
        flushSync()

        // scroll away from the run's frame, out to the song's tail, and end the Section there
        scroll.scrollTop = 4000
        scroll.dispatchEvent(new Event('scroll'))
        flushSync()
        const markedIndex = Number(frames()[2].dataset.frameIndex)
        frames()[2].querySelector('button')!.click()
        flushSync()
        popoverItems()[1].click()
        flushSync()
        expect(playerControlsStore.end).toBe(markedIndex + 1)
        expect(onSectionChange).toHaveBeenCalledTimes(1)

        // the restart the parent answers that with: the run returns to the Section's START and
        // republishes the whole song's frames. Re-centring on it would scroll the tail away, so
        // the edit's view is held instead - the marked frame stays exactly where it was.
        playerControlsStore.setCurrent(0)
        manyFrames(503)
        flushSync()
        await tick()
        await tick()
        flushSync()
        expect(target.querySelector('.player-sheet-card-expanded')).not.toBeNull()
        expect(scroll.scrollTop).toBe(4000)
        expect(frames().map(f => Number(f.dataset.frameIndex))).toContain(markedIndex)

        // ...and it is held ONCE: the next page set (a loop repeat, a speed change) re-centres on
        // the run's frame again, the rule while a run plays.
        manyFrames(503)
        flushSync()
        await tick()
        await tick()
        flushSync()
        expect(scroll.scrollTop).toBe(0)
        expect(frames().map(f => Number(f.dataset.frameIndex))).toContain(0)
    })

    // WHERE THE COLLAPSED CARD'S WINDOW IS, drawn into the expanded one. Expanded, the sheet is
    // the whole song and nothing on screen says which slice of it the user is left looking at when
    // they close it again - so the pair of rules says so, around the current page and nothing else.
    it('rules off the collapsed card\'s own window inside the expanded one', async () => {
        //fake timers so the 250ms fallback can stand in for the reveal Web Animation's finish
        vi.useFakeTimers()
        //20 pages of 25 frames - five rows each at the card's five columns
        manyFrames(500, 25)
        playerControlsStore.setState({size: 500, position: 0, end: 500, current: 260})
        render()
        //closed, the card holds exactly the current page - the window the rules mark out
        expect(frames().map(f => Number(f.dataset.frameIndex)))
            .toEqual(Array.from({length: 25}, (_, i) => 250 + i))
        expect(target.querySelector('.player-sheet-page-bounds')).toBeNull()

        const card = target.querySelector<HTMLElement>('.player-sheet-card')!
        const surface = target.querySelector<HTMLElement>('.player-sheet-surface')!
        const scroll = target.querySelector<HTMLElement>('.player-sheet-scroll')!
        Object.defineProperty(card, 'clientHeight', {configurable: true, value: 100})
        vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 100.25))
        Object.defineProperty(scroll, 'clientHeight', {configurable: true, value: 320})
        Object.defineProperty(scroll, 'scrollTop', {configurable: true, writable: true, value: 0})
        Object.defineProperty(frames()[0], 'offsetHeight', {configurable: true, value: 48})

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await tick()
        await tick()
        await tick()
        flushSync()
        vi.advanceTimersByTime(251)
        flushSync()

        //inside the scroll box, not beside it: they mark a place in the SONG, so they have to ride
        //away with the content the way the frames do (the thumb is the opposite case)
        expect(target.querySelector('.player-sheet-scroll .player-sheet-page-bounds')).not.toBeNull()
        const [top, bottom] = boundOffsets()
        expect(boundOffsets().length).toBe(2)
        const pageHeight = bottom - top
        expect(pageHeight).toBeGreaterThan(0)

        // the pair follows the run: the next page's window is exactly one page further down, and
        // it is the same height, because every page is the same five rows
        playerControlsStore.setCurrent(275)
        flushSync()
        const [nextTop, nextBottom] = boundOffsets()
        expect(nextTop - top).toBeCloseTo(pageHeight, 5)
        expect(nextBottom - nextTop).toBeCloseTo(pageHeight, 5)

        // ...and page 0's window opens at the top of the scroll content, which is what makes the
        // whole set of offsets the song's own: page N starts N pages in
        playerControlsStore.setCurrent(0)
        flushSync()
        const [firstTop, firstBottom] = boundOffsets()
        expect(firstTop).toBeLessThan(pageHeight / 5)
        expect(firstBottom - firstTop).toBeCloseTo(pageHeight, 5)
        expect(top).toBeCloseTo(firstTop + 10 * pageHeight, 5)

        // they belong to the expanded view alone - collapsed, the card IS the window
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}))
        flushSync()
        vi.advanceTimersByTime(251)
        flushSync()
        expect(target.querySelector('.player-sheet-card-expanded')).toBeNull()
        expect(target.querySelector('.player-sheet-page-bounds')).toBeNull()
    })
})
