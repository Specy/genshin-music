<script module lang="ts">
    import type {Shortcut} from '$stores/KeybindsStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Rendered by the how-to-use-player/-composer/-vsrg-composer blog posts (their own shortcut
    // lists), plus the Home HelpTab and VsrgComposerHelp — check those call sites before changing
    // either snippet's signature.
    //
    // shortcuts is a SvelteMap living in the keybinds store's own $state (KeybindsStore.svelte.ts);
    // reading it here in the each-block below already auto-tracks edits, no subscription needed.
    export {keyBadge, shortcutsTable}
</script>

{#snippet keyBadge(text: string)}
    <div class="keyboard-key">{text}</div>
{/snippet}

{#snippet shortcutsTable(shortcuts: Map<string, Shortcut<string>>, style: string = '')}
    <table class="keys-table" {style}>
        <tbody>
            {#each [...shortcuts.entries()] as [key, shortcut] (shortcut.name)}
                <tr>
                    <td>
                        {@render keyBadge(key)}
                    </td>
                    <td>
                        <!-- QUIRK: the untranslated shortcut.name fallback is currently dead (every
                             shortcut supplies a description) — kept in case a future shortcut omits
                             one; don't force translation on it or delete the branch. -->
                        {shortcut.description ? t(`shortcuts:props.${shortcut.description}`) : shortcut.name}
                        {#if shortcut.holdable}
                            <span style="font-size:0.8rem"> ({t('shortcuts:holdable')})</span>
                        {/if}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
{/snippet}

<style>
    /* .keyboard-key and .keys-table :nth-child(2) are styled globally in App.css, not here —
       :nth-child(2) targets the description <td>, so reordering the <td>s below would misapply it.
       No :global() needed even though these snippets are exported and rendered from other files'
       templates: Svelte attaches the scoped-style class at this file's compile time, so it stays
       attached regardless of where {@render} is called from. */
    .keys-table tr {
        display: flex;
        gap: 0.8rem;
        align-items: center;
    }
</style>
