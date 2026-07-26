<script lang="ts" generics="T extends string">
    // No consumers anywhere in this tree (verified) - dead code, not wired up to anything.
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
