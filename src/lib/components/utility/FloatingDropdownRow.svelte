<script lang="ts">
    import type {Snippet} from 'svelte'
    import AppButton from '../inputs/AppButton.svelte'

    // Old: src/components/shared/Utility/FloatingDropdown.tsx (FloatingDropdownRow export)
    let {
        children,
        onclick,
        style = '',
    }: {
        children: Snippet
        onclick?: () => void
        style?: string
    } = $props()
</script>

<AppButton
    ariaLabel="Floating Dropdown Button"
    className="row row-centered"
    style="padding:0.4rem;min-width:unset;{style}"
    {onclick}
>
    {@render children()}
</AppButton>
