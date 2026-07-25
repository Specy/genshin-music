<script lang="ts" generics="T extends string">
    // Old: src/components/pages/Composer/MultiSwitch.tsx (27 lines, generic
    // `MultiSwitch<T extends ReactNode>`). PRESERVED QUIRK, disclosed: this component has ZERO
    // consumers anywhere in the old app (verified via a whole-branch grep of
    // migration/next16-react19 - only its own definition file matches "MultiSwitch"; the one
    // plausible candidate, ComposerKeyboard.tsx's tempo-changer row, renders its own plain
    // `<button>` loop directly instead - see ComposerKeyboard.svelte's own header comment). Ported
    // byte-parity anyway per this task's file list.
    //
    // `ReactNode` (old's generic bound - unconstrained in practice, since nothing anywhere
    // instantiates this component, so its real shape is unknowable) narrows to `T extends string`
    // here: Svelte's own `generics="..."` attribute requires a concrete TS constraint (unlike a
    // bare `<T,>` in TSX), and `T extends string` is the same constraint this migration's one
    // closely analogous sibling (`$cmp/MultipleOptionSlider.svelte`'s own `Option<T>`, P4a Task 8)
    // already settled on for the same "switch between N labelled option values" shape - kept for
    // consistency, not derived from any real caller.
    // `memo(MultiSwitch, comparator)` dropped (Svelte 5 fine-grained reactivity, established
    // precedent throughout this migration - the comparator only ever short-circuited a whole-tree
    // React re-render that has no equivalent here).
    let {
        options,
        selected,
        buttonsClass,
        onSelect,
    }: {
        options: readonly T[]
        selected: T
        buttonsClass?: string
        onSelect: (selected: T) => void
    } = $props()
</script>

{#each options as value, i (i)}
    <button
        style={selected === value ? 'background-color:var(--accent);color:var(--accent-text)' : ''}
        class={buttonsClass}
        onclick={() => onSelect(value)}
    >
        {value}
    </button>
{/each}
