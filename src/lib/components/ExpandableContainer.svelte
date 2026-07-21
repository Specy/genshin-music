<script lang="ts">
    import {untrack} from 'svelte'
    import type {Snippet} from 'svelte'
    import type {ThemeKeys} from '$core/theme/ThemeProvider.svelte'
    import Card from './layout/Card.svelte'
    import Column from './layout/Column.svelte'

    // Old: src/components/shared/expandableContainer/ExpandableContainer.tsx (72 lines) +
    // expandableContainer.module.scss (23 lines). Not in this task's file list (P4a Task 7 only
    // names the blog/PromotionCard files) - a hard content dependency instead: grepped the whole
    // old branch, its ONLY consumer anywhere is the add-to-home-screen blog post (3 call sites,
    // one per device section), all of them bare (`headerContent` + children only) - no
    // borderColor/headerBackground/contentBackground/contentColor/expanded/onExpanded/
    // defaultExpanded/style/className ever passed. Full prop surface still ported below for
    // parity/future reuse (VsrgComposerHelp and the real Home HelpTab also import ShortcutsTable
    // from a sibling old file the same way - a general-purpose primitive, not blog-only).
    interface ExpandableContainerProps {
        defaultExpanded?: boolean
        onExpanded?: (expanded: boolean) => void
        expanded?: boolean
        borderColor?: ThemeKeys
        headerBackground?: ThemeKeys
        contentBackground?: string
        contentColor?: string
        headerContent: Snippet
        headerStyle?: string
        contentStyle?: string
        className?: string
        style?: string
        children?: Snippet
    }

    let {
        headerContent,
        children,
        defaultExpanded,
        expanded: expandedProp,
        onExpanded,
        contentStyle = '',
        headerStyle = '',
        className = '',
        style = '',
        headerBackground = 'primary',
        contentBackground = 'var(--background-layer-10)',
        contentColor = 'var(--background-text)',
        borderColor = 'secondary',
    }: ExpandableContainerProps = $props()

    // old: `useState(_expanded ?? defaultExpanded ?? false)` for the initial value, plus a
    // `useEffect(() => { if (typeof _expanded !== 'undefined') setExpanded(_expanded) }, [_expanded])`
    // to keep the internal flag in sync with a CONTROLLED `expanded` prop across later updates.
    // `untrack()` makes the "only read once" intent explicit (matching `useState`'s own
    // initializer-only-runs-once semantics) instead of tripping Svelte's state_referenced_locally
    // hint - the $effect below is what actually keeps it in sync on later prop changes.
    let expanded = $state(untrack(() => expandedProp ?? defaultExpanded ?? false))

    $effect(() => {
        if (expandedProp !== undefined) expanded = expandedProp
    })

    function toggle() {
        const next = !expanded
        expanded = next
        onExpanded?.(next)
    }
</script>

{#snippet chevronRightIcon()}
    <!-- react-icons/fa's FaChevronRight, fetched from unpkg.com/react-icons@5.6.0/fa/index.mjs
         (same sourcing convention as icons/FaEllipsisH.svelte and other inlined FA snippets across
         this migration). Old passed no explicit size, so this keeps the default "1em"/"1em". -->
    <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 320 512"
        height="1em"
        width="1em"
        style="transition:0.3s"
        class={expanded ? 'transform rotate-90' : ''}
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z" /></svg>
{/snippet}

<Card
    radius="0.4rem"
    className="expandable-container {className}"
    background="var(--{headerBackground})"
    style="border:solid 0.1rem var(--{borderColor}-layer-10);{style}"
>
    <button class="expandable-container-header" style={headerStyle} onclick={toggle}>
        <div class="expandable-container-arrow">
            {@render chevronRightIcon()}
        </div>
        {@render headerContent()}
    </button>
    {#if expanded}
        <Column
            className="expandable-container-content"
            style="border-top:0.1rem solid var(--{borderColor}-layer-10);background-color:{contentBackground};color:{contentColor};{contentStyle}"
        >
            {@render children?.()}
        </Column>
    {/if}
</Card>

<style>
    /* Old: src/components/shared/expandableContainer/expandableContainer.module.scss.
       `.expandable-container`/`.expandable-container-content` are applied via Card/Column's own
       `className` prop - elements belonging to THEIR compiled templates, not this file's - so
       both need :global(). `.expandable-container-header`/`.expandable-container-arrow` are
       native elements this file's own template renders directly, so plain scoped CSS already
       reaches them. */
    :global(.expandable-container) {
        box-shadow: 0 0.2rem 0.4rem rgba(0, 0, 0, 0.1);
    }

    .expandable-container-header {
        background: transparent;
        color: inherit;
        display: flex;
        align-items: center;
        border: none;
        cursor: pointer;
        flex: 1;
        padding: 0.6rem 1rem;
    }

    :global(.expandable-container-content) {
        padding: 0.8rem;
        border-bottom-right-radius: 0.4rem;
        border-bottom-left-radius: 0.4rem;
    }

    .expandable-container-arrow {
        font-size: 1.3rem;
        padding: 0 0.5rem;
        display: flex;
        align-items: center;
    }
</style>
