<script module lang="ts">
    // Old: src/components/pages/VsrgComposer/MultipleOptionSlider.tsx. RELOCATED (per this task's
    // brief) from the vsrg-composer-only folder to this shared components/ directory - backup/
    // +page.svelte (Task 8) is its first consumer, ahead of the vsrg-composer page itself
    // (Phase 4c). LEDGER NOTE for whoever ports vsrg-composer: import this component, do NOT
    // re-port a second copy.
    //
    // `Option<T>` lives in this module block (unconstrained T, matching old exactly) rather than
    // the generics-attributed instance script below, same split as FilePicker.svelte's own
    // `FileElement<T>`/`generics="T"` - only a `<script module>` block's exports are real ES
    // exports consumers can import; a bare `export type` inside the instance script is not valid.
    export type Option<T> = {
        value: T
        text: string
        color: string
    }
</script>

<script lang="ts" generics="T extends string">
    import {capitalize} from '$core/utils/Utilities'
    // `Option<T>` above (module block) is already in scope here, same-file - no import needed,
    // same as FilePicker.svelte's instance script referencing its own module-level `FileElement<T>`.

    let {options, selected, onChange}: {
        options: Option<T>[]
        selected: T
        onChange: (value: T) => void
    } = $props()

    let rootEl: HTMLDivElement | undefined = $state()
    let overlayState = $state({width: 0, left: 0})

    const selectedOption = $derived(options.find(option => option.value === selected))

    // old: a `useEffect(..., [ref, options, selected])` that measured the selected <button>'s
    // DOMRect against the container's. `$effect` re-runs on the same reads (rootEl/options/
    // selected, via selectedOption) without a dependency array.
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
    /* Old: src/app/_client-pages/vsrg-composer/VsrgComposer.css - only the 4 selectors this
       component itself owns (`.multiple-option-slider`, its `button` child, `.multiple-options-
       selected`, `.multiple-option-slider-overlay`), pulled forward verbatim into this relocated
       component's own scoped styles. The unrelated `.decorated-vsrg-canvas` rule that was
       physically interleaved between them in the old file is NOT part of this component and stays
       behind for Phase 4c's VsrgComposer.css port.

       The one `@media (max-width: 1000px) { .multiple-option-slider button { padding: 0 1rem } }`
       override (also in VsrgComposer.css, batched with unrelated vsrg-composer-only rules in that
       same query) is folded in here too, INSTEAD of being left for 4c: Svelte's CSS scoping does
       not pierce component boundaries, so a copy left behind in the vsrg-composer page's own
       <style> block would silently stop applying to this component's internal <button>s once they
       are rendered from an imported child component rather than inline page markup. Keeping the
       component's own responsive behavior with the component, regardless of host page, is the
       conservative parity-preserving choice (both current consumer - backup - and the future
       vsrg-composer one get identical behavior).

       LEDGER NOTE for Phase 4c (VsrgComposer.css port): SKIP `.multiple-option-slider`,
       `.multiple-option-slider button`, `.multiple-options-selected`,
       `.multiple-option-slider-overlay`, and the one `.multiple-option-slider button` line inside
       the `max-width: 1000px` media query - all already ported here. */
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
