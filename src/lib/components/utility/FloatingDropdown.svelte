<script lang="ts">
    import type {Component, Snippet} from 'svelte'
    import AppButton from '../inputs/AppButton.svelte'

    // Old: src/components/shared/Utility/FloatingDropdown.tsx
    // The old file also exported `FloatingDropdownRow`/`FloatingDropdownText`
    // as separate named components; ported as sibling files
    // (FloatingDropdownRow.svelte / FloatingDropdownText.svelte) since one
    // .svelte file can only default-export a single component, mirroring the
    // old three-export surface.
    //
    // `SongActionButton` (old, the toggle button) was deferred to Phase 4 with
    // its page-menu consumers (per the phase-3 plan) and wasn't in this task's
    // file list - it has since landed (SongActionButton.svelte, now used by
    // ComposerSongRow/PlayerSongRow/VsrgComposerMenu/ThemePreview/
    // ErrorSongRow), but this file's own toggle button below still uses
    // `AppButton` instead (a superset of SongActionButtonProps: onClick/style/
    // tooltip/ariaLabel/className/children) - a deliberate, documented
    // substitution that renders `.app-button` instead of the old
    // `.song-button` class.
    //
    // Two claims once made alongside that substitution are stale and
    // corrected here: FloatingDropdown did NOT stay a zero-consumer,
    // zero-blast-radius file, and its CSS did NOT stay unported. The
    // `.floating-dropdown*` CSS shipped with Phase 4a Task 3's menu.css port
    // (App.css). This component plus its FloatingDropdownRow/
    // FloatingDropdownText siblings now have 15 real import sites across 5
    // files (each imports all three) - SongFolder.svelte, ComposerSongRow.svelte,
    // PlayerSongRow.svelte, VsrgComposerSongRow.svelte, VsrgPlayerSongRow.svelte
    // - so the `AppButton`-over-`SongActionButton` substitution above is no
    // longer revisitable in isolation with zero blast radius; it would need
    // re-checking against all 5.
    //
    // `FaTimes` (react-icons/fa) is inlined as a raw SVG (no react-icons dep),
    // markup + path data copied byte-for-byte from react-icons@5.6.0
    // (unpkg.com/react-icons@5.6.0/fa/index.mjs, FaTimes) including its default
    // svg wrapper attributes.
    //
    // `useClickOutside` (old hook) is inlined below rather than ported as a
    // reusable file, since it isn't in this task's file list and FloatingDropdown
    // is its only consumer. Behavior preserved exactly: the document click
    // listener is only attached while `isActive` is true (old: the hook's effect
    // early-returned when `options.active` was false), and `ignoreClickOutside`
    // is checked inside the callback rather than gating attachment (matching the
    // old call site, which hardcoded `ignoreFocusable: true` and passed
    // `ignoreClickOutside` through the callback body, not through the hook's
    // options).
    let {
        children,
        Icon,
        className = '',
        style = '',
        onClose,
        tooltip,
        offset = 3,
        ignoreClickOutside = false,
    }: {
        children: Snippet
        tooltip?: string
        Icon: Component
        className?: string
        offset?: number
        style?: string
        ignoreClickOutside?: boolean
        onClose?: () => void
    } = $props()

    let isActive = $state(false)
    let overflows = $state(false)
    let ref: HTMLDivElement | undefined = $state()

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

<div class="{className} floating-dropdown {isActive ? 'floating-dropdown-active' : ''}">
    <AppButton
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
    </AppButton>
    <div
        bind:this={ref}
        class="floating-dropdown-children"
        style="transform:{transform};--existing-transform:{transform};transform-origin:{overflows ? 'bottom' : 'top'}"
    >
        {@render children()}
    </div>
</div>
