<script module lang="ts">
    // `Option<T>` lives in this module block, not the generics-attributed
    // instance script below, because only a `<script module>` block's exports
    // are real ES exports a consumer can import.
    export type Option<T> = {
        value: T
        text: string
        color: string
    }
</script>

<script lang="ts" generics="T extends string">
    import {capitalize} from '$core/utils/Utilities'

    let {options, selected, onChange}: {
        options: Option<T>[]
        selected: T
        onChange: (value: T) => void
    } = $props()

    let rootEl: HTMLDivElement | undefined = $state()
    let overlayState = $state({width: 0, left: 0})

    const selectedOption = $derived(options.find(option => option.value === selected))

    $effect(() => {
        const elements = rootEl?.querySelectorAll('button')
        const index = options.findIndex(e => e.value === selected)
        if (!elements || index < 0) return
        const bounds = elements[index].getBoundingClientRect()
        const parentBounds = rootEl!.getBoundingClientRect()
        overlayState = {
            width: bounds.width - 3,
            //TODO for some reason first item is off by 2px
            left: bounds.left - parentBounds.left,
        }
    })
</script>

<div
    class="multiple-option-slider"
    bind:this={rootEl}
    style="border: solid 0.1rem {selectedOption?.color ?? 'var(--accent)'}"
>
    {#each options as option (option.value)}
        <button
            onclick={() => onChange(option.value)}
            class={option === selectedOption ? 'multiple-options-selected' : ''}
        >
            {capitalize(option.text)}
        </button>
    {/each}
    <div
        class="multiple-option-slider-overlay"
        style="width:{overlayState.width}px;left:{overlayState.left}px;background-color:{selectedOption?.color}"
    ></div>
</div>

<style>
    /* The max-width:1000px override below lives with this component rather
       than a page-level stylesheet because scoped CSS can't pierce into a
       child component from outside - a copy left on a host page would
       silently stop applying to this component's own buttons. */
    .multiple-option-slider {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        height: 100%;
        width: fit-content;
        border-radius: 3rem;
        position: relative;
        transition: border 0.2s;
        background-color: var(--primary);
    }

    .multiple-option-slider button {
        height: 100%;
        padding: 0 1.4rem;
        color: var(--primary-text);
        transition: color 0.2s;
        z-index: 2;
        cursor: pointer;
        background-color: transparent;
        border-radius: 0.4rem;
        border: none;
    }

    .multiple-options-selected {
        color: var(--accent-text) !important;
    }

    .multiple-option-slider-overlay {
        transition: all 0.15s ease-out;
        position: absolute;
        height: calc(100% - 0.2rem);
        top: 0.1rem;
        border-radius: 3rem;
        background-color: var(--accent);
    }

    @media only screen and (max-width: 1000px) {
        .multiple-option-slider button {
            padding: 0 1rem;
        }
    }
</style>
