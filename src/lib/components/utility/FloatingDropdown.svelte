<script lang="ts">
    import type {Component, Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import SongActionButton from '../inputs/SongActionButton.svelte'

    // `.floating-dropdown*` CSS lives in global App.css.
    //
    // QUIRK: the toggle button below MUST use SongActionButton, not AppButton
    // - AppButton compiles fine (a compatible prop superset) but renders
    // `.app-button` instead of `.song-button`, which carries different
    // padding/min-width and makes the "..." toggle ~2.5x wider than the icon
    // buttons beside it.
    let {
        children,
        Icon,
        class: cls = '',
        style = '',
        onClose,
        tooltip,
        offset = 3,
        ignoreClickOutside = false,
    }: {
        children: Snippet
        tooltip?: string
        Icon: Component
        class?: ClassValue
        offset?: number
        style?: string
        ignoreClickOutside?: boolean
        onClose?: () => void
    } = $props()

    let isActive = $state(false)
    let overflows = $state(false)
    let ref: HTMLDivElement | undefined = $state()

    // Own local click-outside handling below (hasFocusable + the $effect
    // further down), not the shared `clickOutside` action from
    // $lib/utils/clickOutside.ts - `ignoreClickOutside` here is checked inside
    // the click callback itself, not via the action's `active` gating.
    function hasFocusable(e: MouseEvent): boolean {
        const path = e.composedPath()
        return path.some(el => {
            const element = el as HTMLElement
            if (element.tagName === 'INPUT' || element.tagName === 'BUTTON') {
                return !(element.classList?.contains?.('include_click_outside') ?? false)
            }
            return element.classList?.contains?.('ignore_click_outside') ?? false
        })
    }

    function handleClickOutside(e: MouseEvent) {
        if (ignoreClickOutside) return
        const clickedOutside = !(ref?.contains(e.target as Node) ?? false)
        if (clickedOutside) {
            if (hasFocusable(e)) return
            isActive = false
            onClose?.()
        }
    }

    $effect(() => {
        if (!isActive) return
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    })

    $effect(() => {
        void isActive
        if (!ref) return
        const bounds = ref.getBoundingClientRect()
        const overflowsBottom = bounds.top + bounds.height > (window.innerHeight ?? 0)
        const overflowsTop = (bounds.top - bounds.height - 2 * 16) < 0
        // if it overflows on top, force it to overflow on bottom
        overflows = overflowsTop ? false : overflowsBottom
    })

    const transform = $derived(`translateX(calc(-100% + ${offset}rem)) ${overflows ? 'translateY(calc(-100% - 2rem))' : ''}`)

    function toggle() {
        const wasActive = isActive
        isActive = !isActive
        if (wasActive && onClose) onClose()
    }
</script>

<div class={[cls, 'floating-dropdown', isActive && 'floating-dropdown-active']}>
    <SongActionButton
        style="margin:0;{style}{isActive ? 'background-color:var(--accent);color:var(--accent-text);' : ''}"
        onclick={toggle}
        ariaLabel={isActive ? 'Close' : 'Open'}
        {tooltip}
    >
        {#if isActive}
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                <path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z" />
            </svg>
        {:else}
            <Icon />
        {/if}
    </SongActionButton>
    <div
        bind:this={ref}
        class="floating-dropdown-children"
        style="transform:{transform};--existing-transform:{transform};transform-origin:{overflows ? 'bottom' : 'top'}"
    >
        {@render children()}
    </div>
</div>
