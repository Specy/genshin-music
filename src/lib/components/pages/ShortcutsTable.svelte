<script module lang="ts">
    import type {Shortcut} from '$stores/KeybindsStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/Index/HelpTab/ShortcutsHelp.tsx (36 lines) - exports `Key` and
    // `ShortcutsTable`. Not in this task's file list (P4a Task 7 only names the blog/PromotionCard
    // files) - a hard content dependency instead: the how-to-use-player/-composer/-vsrg-composer
    // blog posts each render their page's own shortcut list this way, and
    // how-to-use-vsrg-composer also renders one bare `<Key>` badge directly for its "add hit
    // object" keybind. The real Home Help tab (`HelpTab/index.tsx`) and
    // `VsrgComposer/VsrgComposerHelp.tsx` import from the same old file too - both out of scope
    // this task, reusing this component once ported rather than re-porting it.
    //
    // `Key`'s children were always plain text at every real call site (grepped the whole old
    // branch) - ported as a `text: string` param instead of a `Snippet`, a disclosed
    // simplification (old's `ReactNode` surface was never exercised beyond strings).
    //
    // Reactivity: old used `useObservableMap(keyBinds.getShortcutMap(page))` (a mobx-subscribing
    // hook) to re-render on shortcut edits. `keyBinds.getShortcutMap()` already returns a
    // `SvelteMap` living inside the store's own `$state` (KeybindsStore.svelte.ts) - reading it
    // directly in a template/each-block auto-tracks it, so the hook collapses to nothing (callers
    // just pass the Map straight through).
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
                        <!-- old: `description ? t(\`props.${description}\`) : name` under
                             `useTranslation('shortcuts')` - the RAW (untranslated) `name` fallback
                             is preserved as-is; every current shortcut always supplies a
                             description so this branch is presently dead, same as old. -->
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
    /* Old: src/components/pages/Index/HelpTab/HelpTab.module.css - ONLY the `.keys-table tr`
       selector this component needs (the module's other rules - .help-icon/.help-title/.help-img/
       etc - belong to the real Home Help tab UI, not ported here; delimited pull-forward, same
       convention as the menu.css/Keyboard.css pulls in P4a Task 3).
       `.keys-table :nth-child(2)` and `.keyboard-key` are ALREADY global (src/lib/css/App.css,
       ported verbatim in P3 Task 5 straight from the old app's own global App.css, which is where
       those two rules lived even in the old app) - not redeclared here. `<table>`/`<tr>`/`<td>`/
       `<div class="keyboard-key">` are native elements this file's own snippets render directly,
       so plain scoped CSS already reaches them; no :global() needed anywhere in this file. */
    .keys-table tr {
        display: flex;
        gap: 0.8rem;
        align-items: center;
    }
</style>
