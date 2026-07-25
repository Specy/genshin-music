<script lang="ts">
    // Old: src/components/pages/VsrgComposer/VsrgComposerKeyboard.tsx (37 lines) - a pure,
    // stateless "mini keyboard" grid used by VsrgTop.svelte's sidebar (highlighting which notes the
    // currently-selected hit object plays) and by SongClasses' the note-select flow. Direct 1:1
    // port - no props/behavior dropped or added.
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
        <!-- old's own <button> had no text/icon content and no aria-label either (a plain colored
             square) - preserved as-is rather than inventing new a11y attributes old didn't have,
             same established convention as ColorPicker.svelte's identical cancel/confirm buttons. -->
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
            onclick={() => onClick(el)}
            style={selected?.includes(el) ? 'background-color:var(--accent)' : ''}
        ></button>
    {/each}
</div>
