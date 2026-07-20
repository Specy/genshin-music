<script lang="ts">
    import type {Snippet} from 'svelte'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'

    // Old: src/components/shared/Inputs/Select.tsx
    // Old declared a `className` prop in its TS interface but never referenced
    // it in the render (a pre-existing dead prop) - dropped here since it never
    // did anything and porting an intentionally-unused destructured prop only
    // risks an eslint no-unused-vars flag for zero behavioral gain.
    // `useTheme()` (old, a debounced mobx subscription hook) is replaced by a
    // direct import of the now-reactive ThemeProvider singleton (Task 4) -
    // `$derived` below re-runs automatically whenever theme state changes.
    // The `.select`/`:focus`/`option:checked` rules are the one class this
    // component uses out of the shared (non-module-dedicated)
    // Settings.module.css - inlined below rather than the whole shared file,
    // since the rest of that file belongs to the Settings pane components
    // deferred to Phase 4.
    let {
        onchange,
        value,
        children,
        style = '',
    }: {
        onchange: (e: Event & {currentTarget: EventTarget & HTMLSelectElement}) => void
        value: string | number | string[] | undefined
        children?: Snippet
        style?: string
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLSelectElement}) {
        onchange(e)
        e.currentTarget.blur()
    }

    const backgroundImage = $derived(
        `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
    )
</script>

<select onchange={handleChange} {value} class="select" style="background-image:{backgroundImage};{style}">
    {@render children?.()}
</select>

<style>
    .select {
        background-color: var(--primary);
        border-radius: 0.2rem;
        border: none;
        color: var(--primary-text);
        padding: 0.5rem;
    }

    .select:focus {
        outline: none;
    }

    /* :global() because the <option> elements come from the caller via
       {@render children()}, not from this component's own template - Svelte's
       scoped-CSS pruning can't see them and would otherwise drop this rule as
       an "unused selector". */
    .select :global(option:checked) {
        color: var(--accent);
    }
</style>
