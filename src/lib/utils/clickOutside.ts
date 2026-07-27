type ClickOutsideParams = {
    active?: boolean
    ignoreFocusable?: boolean
    onOutside: () => void
}

export function clickOutside(node: HTMLElement, params: ClickOutsideParams) {
    let current = params

    function onClick(e: MouseEvent): void {
        const clickedOutside = !node.contains(e.target as Node | null)
        if (clickedOutside) {
            if (current.ignoreFocusable && hasFocusable(e)) return
            current.onOutside()
        }
    }

    function attach() {
        document.addEventListener('click', onClick)
    }

    function detach() {
        document.removeEventListener('click', onClick)
    }

    if (current.active) attach()

    return {
        update(newParams: ClickOutsideParams) {
            const wasActive = current.active
            current = newParams
            if (current.active && !wasActive) attach()
            else if (!current.active && wasActive) detach()
        },
        destroy() {
            if (current.active) detach()
        }
    }
}

export function hasFocusable(e: MouseEvent) {
    const path = e.composedPath()
    return path.some(e => {
        const el = e as HTMLElement
        if (el.tagName === "INPUT" || el.tagName === "BUTTON") return !el.classList?.contains?.("include_click_outside")
        return el.classList?.contains?.("ignore_click_outside")
    })
}

export const IGNORE_CLICK_CLASS = 'ignore_click_outside'
