import {createRawSnippet, flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import FloatingDropdown from '../src/lib/components/utility/FloatingDropdown.svelte'
import FaEllipsisH from '../src/lib/components/icons/FaEllipsisH.svelte'

type Mounted = ReturnType<typeof mount>

// One mounted dropdown plus the handles a test needs to drive and inspect it.
type Row = {
    target: HTMLDivElement
    component: Mounted
    onClose: ReturnType<typeof vi.fn>
}

describe('FloatingDropdown single-open rule', () => {
    let rows: Row[]

    function mountRow(options?: {ignoreClickOutside?: boolean}): Row {
        const target = document.createElement('div')
        document.body.append(target)
        const onClose = vi.fn()
        const component = mount(FloatingDropdown, {
            target,
            props: {
                Icon: FaEllipsisH,
                onClose,
                ignoreClickOutside: options?.ignoreClickOutside ?? false,
                children: createRawSnippet(() => ({render: () => '<span>row menu</span>'})),
            },
        })
        flushSync()
        const row = {target, component, onClose}
        rows.push(row)
        return row
    }

    function toggleOf(row: Row): HTMLElement {
        const button = row.target.querySelector<HTMLElement>('button.song-button')
        if (!button) throw new Error('dropdown toggle button was not rendered')
        return button
    }

    function isOpen(row: Row): boolean {
        return row.target.querySelector('.floating-dropdown-active') !== null
    }

    function click(element: HTMLElement) {
        element.dispatchEvent(new MouseEvent('click', {bubbles: true}))
        flushSync()
    }

    // Drops the row from `rows` too, so the afterEach sweep can't unmount it twice.
    function destroy(row: Row) {
        rows = rows.filter(other => other !== row)
        unmount(row.component)
        row.target.remove()
        flushSync()
    }

    beforeEach(() => {
        rows = []
    })

    afterEach(() => {
        for (const row of rows) {
            unmount(row.component)
            row.target.remove()
        }
        rows = []
    })

    it('closes the previously open dropdown, firing its onClose, when another opens', () => {
        const a = mountRow()
        const b = mountRow()

        click(toggleOf(a))
        expect(isOpen(a)).toBe(true)

        click(toggleOf(b))

        expect(isOpen(a)).toBe(false)
        expect(a.onClose).toHaveBeenCalledTimes(1)
        expect(isOpen(b)).toBe(true)
        expect(b.onClose).not.toHaveBeenCalled()
    })

    it('supersedes a dropdown that is ignoring click-outside, e.g. mid-rename', () => {
        // The rename flow sets `ignoreClickOutside`; another dropdown opening is not
        // a click-outside, so the single-open rule closes it anyway - and `onClose`
        // must still run, or the row stays stuck in rename mode with its menu closed.
        const a = mountRow({ignoreClickOutside: true})
        const b = mountRow()

        click(toggleOf(a))
        click(toggleOf(b))

        expect(isOpen(a)).toBe(false)
        expect(a.onClose).toHaveBeenCalledTimes(1)
    })

    it('deregisters on toggle-close, so reopening does not close an unrelated dropdown', () => {
        const a = mountRow()
        const b = mountRow()

        click(toggleOf(a))
        click(toggleOf(a))
        expect(isOpen(a)).toBe(false)
        expect(a.onClose).toHaveBeenCalledTimes(1)

        click(toggleOf(b))

        expect(isOpen(b)).toBe(true)
        // Already closed: superseding must not fire a second onClose on a closed row.
        expect(a.onClose).toHaveBeenCalledTimes(1)
    })

    it('releases the token when an open dropdown is destroyed', () => {
        const a = mountRow()
        const b = mountRow()

        click(toggleOf(a))
        destroy(a)

        click(toggleOf(b))

        expect(isOpen(b)).toBe(true)
        // A stale token would have called close() on the destroyed instance.
        expect(a.onClose).not.toHaveBeenCalled()
    })
})
