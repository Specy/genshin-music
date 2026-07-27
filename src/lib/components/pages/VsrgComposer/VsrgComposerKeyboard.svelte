<script lang="ts">
    // A pure, stateless "mini keyboard" grid used by VsrgTop.svelte's sidebar to highlight which
    // notes the currently-selected hit object plays.
    let {
        elements,
        selected,
        perRow,
        onClick,
    }: {
        elements: number[]
        selected?: number[]
        perRow: number
        onClick: (index: number) => void
    } = $props()
</script>

<div
    class="vsrg-keyboard"
    style="grid-template-columns:repeat({perRow}, 1fr);grid-template-rows:repeat({Math.ceil(elements.length / perRow)}, 1fr);opacity:{selected ? 1 : 0.5};pointer-events:{selected ? 'all' : 'none'};cursor:{selected ? 'pointer' : 'not-allowed'}"
>
    {#each elements as el (el)}
        <!-- A plain colored square, no text/icon/aria-label by design - not adding a label this
             control never had. -->
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
            onclick={() => onClick(el)}
            style={selected?.includes(el) ? 'background-color:var(--accent)' : ''}
        ></button>
    {/each}
</div>
