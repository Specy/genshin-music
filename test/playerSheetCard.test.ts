import {flushSync, mount, unmount} from 'svelte'
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
    })

    function render() {
        component = mount(PlayerSheetCard, {target, props: {columns: 5, onSeek, onSectionChange}})
        flushSync()
    }

    function frames() {
        return [...target.querySelectorAll<HTMLElement>('[data-frame-index]')]
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

    it('sets a bound from a frame without restarting, and pushes the partner it would cross', () => {
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
        // the run is untouched; only the restart hint is asked to light
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

    it('shows every frame of the song when expanded, and none when the sheet is cleared', async () => {
        threeFramesOverTwoPages()
        playerControlsStore.setState({size: 5, position: 0, end: 5, current: 0})
        render()
        expect(frames().length).toBe(2)

        target.querySelector<HTMLButtonElement>('.player-sheet-expand button')!.click()
        await Promise.resolve()
        flushSync()
        expect(frames().map(f => f.dataset.frameIndex)).toEqual(['0', '1', '2'])
        expect(frames()[0].querySelector('.sheet-frame-bracket-start')).not.toBeNull()
        expect(frames()[2].querySelector('.sheet-frame-bracket-end')).not.toBeNull()

        playerControlsStore.clearPages()
        flushSync()
        expect(target.querySelector('.player-sheet-card')).toBeNull()
    })
})
