<script lang="ts" generics="T extends string | number">
    import type {Snippet} from 'svelte'
    import {clickOutside} from '$lib/utils/clickOutside'
    import IconButton from '../inputs/IconButton.svelte'

    // Old: src/components/shared/FloatingSelection/FloatingSelection.tsx (75 lines) - the
    // icon-triggered floating value picker ZenKeyboardMenu.svelte uses for its pitch/instrument
    // pickers (this task).
    //
    // `Icon: IconType` (old, a react-icons component reference rendered via `<Icon size={18}/>`)
    // becomes `Icon: Snippet` here, rendered via `{@render Icon()}` - a Snippet, not a Component
    // reference, is the mechanism every other ported menu/page file in this migration uses to pass
    // one-off inlined-SVG icon content across a component boundary (e.g. MenuButton/MenuItem's own
    // `children: Snippet`); a Component-typed prop would force each one-off icon into its own
    // dedicated .svelte file, which no real (non-FloatingDropdown) caller in this codebase does.
    // The `size={18}` old baked into the icon call is instead baked directly into each snippet's
    // own `height`/`width` attributes by the caller (see ZenKeyboardMenu.svelte).
    //
    // `useClickOutside<HTMLDivElement>(() => setOpen(false), {active: open})` (no `ignoreFocusable`
    // here, unlike ZenKeyboardMenu's OWN click-outside call) -> the `clickOutside` action (Phase-4a
    // Task 1) applied directly via `use:` on this component's own root div - no manual $effect
    // indirection needed (unlike SheetVisualizerMenu.svelte, which binds into a CHILD component's
    // DOM node); this component renders its own wrapper directly, so a plain `use:` directive
    // reaches it.
    let {
        items,
        value,
        onChange,
        Icon,
    }: {
        items: {value: T; label: string; key?: string}[]
        value: T
        Icon: Snippet
        onChange: (val: T) => void
    } = $props()

    let open = $state(false)

    function selectItem(item: T) {
        onChange(item)
        open = false
    }
</script>

<div
    class="column"
    style="align-items:flex-end;gap:0.5rem"
    use:clickOutside={{active: open, onOutside: () => open = false}}
>
    <IconButton
        onclick={() => open = !open}
        style="z-index:2;border-radius:1rem;border:solid 0.1rem var(--secondary)"
        toggled={open}
    >
        {@render Icon()}
    </IconButton>
    {#if open}
        <div class="floating-selection-card" style="max-height:75vh">
            {#each items as item (item.key ?? item.label)}
                <button
                    class="floating-selection-card-item"
                    style={value === item.value ? 'background-color:var(--accent);color:var(--accent-text)' : ''}
                    onclick={() => selectItem(item.value)}
                >
                    {item.label}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Old FloatingSelection.module.scss, ported verbatim - inline here rather than promoted to
       global App.css (same "keep this task's blast radius to new files only" rationale
       InstrumentSelect.svelte's own comment documents for its identical CSS-Modules-inlining
       situation). */
    .floating-selection-card {
        display: flex;
        flex-direction: column;
        background: var(--primary);
        color: var(--primary-text);
        border: 0.1rem solid var(--secondary);
        border-radius: 0.4rem;
        animation: fadeIn 0.2s;
        overflow-y: auto;
    }

    .floating-selection-card::-webkit-scrollbar-thumb {
        background: var(--secondary);
    }

    .floating-selection-card::-webkit-scrollbar {
        width: 0.2rem;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-0.3rem);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .floating-selection-card-item {
        padding: 0.4rem;
        background: var(--primary);
        cursor: pointer;
        color: var(--primary-text);
        border: none;
        border-bottom: 0.1rem solid var(--secondary);
    }

    .floating-selection-card-item:hover {
        background: var(--primary-5);
    }

    .floating-selection-card-item:last-child {
        border-bottom: none;
    }
</style>
