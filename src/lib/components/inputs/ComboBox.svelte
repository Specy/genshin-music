<script module lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/Inputs/ComboBox/ComboBox.tsx (79 lines) + combobox.module.scss
    // (67 lines) - exports `ComboBox`, `ComboBoxItem`, `ComboBoxTitle`. Not in this task's file
    // list by name, but explicitly called for in the brief's own parenthetical for the blog index
    // page ("tag ComboBox filter") - its ONLY consumer anywhere in the old branch (grepped) is
    // that one tag-filter dropdown.
    //
    // `ComboBoxItem`/`ComboBoxTitle` are ported as snippets exported from this module (Svelte
    // 5.5+: a snippet declared at a .svelte file's top level that references only module-script
    // declarations can be exported for other files to `{@render}` - see
    // https://svelte.dev/docs/svelte/snippet#Exporting-snippets). `ComboBoxItem<T = any>`'s own
    // generic collapses to `unknown` here - it was never tied to the SAME `T` as its ComboBox
    // instance even in the old file (independent `<T = any>|`), and the sole real call site only
    // ever reads `item.selected`, so the snippet takes that boolean directly instead of a whole
    // generic item object (disclosed simplification - `style`/`className` on ComboBoxItem were
    // also never passed at the real call site and are dropped the same way).
    export {comboBoxItem, comboBoxTitle}
</script>

<script lang="ts" generics="T">
    import {clickOutside} from '$lib/utils/clickOutside'

    interface ComboBoxItemData<T> {
        item: T
        selected: boolean
    }

    interface ComboBoxProps<T> {
        items: ComboBoxItemData<T>[]
        position?: 'left' | 'right' | 'center'
        title: Snippet
        onChange: (items: ComboBoxItemData<T>[]) => void
        // old: `children: (item: ComboBoxItemData<T>, onClick: () => void) => React.ReactNode` - a
        // render-prop function, the direct Svelte 5 equivalent of a parameterized snippet prop.
        children: Snippet<[ComboBoxItemData<T>, () => void]>
        style?: string
        className?: string
    }

    const positionMap = {
        left: 'left:0',
        right: 'right:0;transform:translateX(100%)',
        center: 'left:50%;transform:translateX(-50%)',
    } satisfies Record<'left' | 'right' | 'center', string>

    let {
        items,
        onChange,
        children,
        title,
        position = 'left',
        style = '',
        className = '',
    }: ComboBoxProps<T> = $props()

    // old: `useClickOutside<HTMLDivElement>(() => setOpen(false), {active: open})` -> the
    // `clickOutside` action (Task 1), same substitution used throughout this migration.
    let open = $state(false)
</script>

{#snippet comboBoxItem(selected: boolean, onClick: () => void, children: Snippet)}
    <button
        onclick={onClick}
        class="combo-box-item {selected ? 'combo-box-item-selected' : ''}"
    >
        {@render children()}
    </button>
{/snippet}

{#snippet comboBoxTitle(children: Snippet)}
    <div class="combo-box-title-item">
        {@render children()}
    </div>
{/snippet}

<div
    use:clickOutside={{active: open, onOutside: () => open = false}}
    class="combo-box-wrapper {className}"
    {style}
>
    <button onclick={() => open = !open} class="combo-box-title">
        {@render title()}
    </button>
    {#if open}
        <div class="combo-box-items" style={positionMap[position]}>
            {#each items as item, i (i)}
                {@render children(item, () => {
                    onChange(items.map((it, j) => i === j ? {...it, selected: !it.selected} : it))
                })}
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Old: src/components/shared/Inputs/ComboBox/combobox.module.scss. Every class here is
       applied to a native element THIS file's own template/snippets render directly (the wrapper
       div, its title/items-list children, and the comboBoxItem/comboBoxTitle snippets exported
       above - which stay part of this file's compiled scope no matter which file `{@render}`s
       them) - plain scoped CSS reaches all of them, no :global() needed anywhere in this file. */
    .combo-box-title {
        background-color: transparent;
        padding: 0;
        margin: 0;
        border: none;
    }

    .combo-box-title-item {
        padding: 0.5rem 1rem;
        transition: background-color 0.3s;
        cursor: pointer;
        color: var(--primary-text);
        background-color: var(--primary);
        border-radius: 0.3rem;
    }

    .combo-box-title-item:hover {
        background-color: var(--primary-layer-10);
    }

    .combo-box-wrapper {
        position: relative;
        width: fit-content;
    }

    .combo-box-items {
        display: flex;
        gap: 0.3rem;
        flex-direction: column;
        position: absolute;
        background-color: var(--primary);
        box-shadow: 0 0.5rem 0.7rem 0.5rem rgba(0, 0, 0, 0.2);
        transform: translateY(0.2rem);
        min-width: 100%;
        padding: 0.3rem;
        border-radius: 0.4rem;
        animation: fadeIn 0.2s;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            translate: 0 -0.2rem;
        }
        to {
            opacity: 1;
            translate: 0 0;
        }
    }

    .combo-box-item {
        padding: 0.5rem;
        transition: background-color 0.3s;
        background-color: var(--primary);
        cursor: pointer;
        border-radius: 0.2rem;
        color: var(--primary-text);
        border: none;
    }

    .combo-box-item:hover:not(.combo-box-item-selected) {
        background-color: var(--primary-layer-20);
    }

    .combo-box-item:last-child {
        border-bottom: none;
    }

    .combo-box-item-selected {
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.2rem;
    }
</style>
