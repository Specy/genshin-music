<script lang="ts">
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import Header from '$cmp/header/Header.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {keyBadge, shortcutsTable} from '$cmp/pages/ShortcutsTable.svelte'

    // Old: src/components/pages/VsrgComposer/VsrgComposerHelp.tsx (42 lines) - the vsrg-composer
    // page's Help menu tab. `Key`/`ShortcutsTable` (old: $cmp/pages/Index/HelpTab/ShortcutsHelp.tsx)
    // -> this migration's already-ported `keyBadge`/`shortcutsTable` snippets
    // ($cmp/pages/ShortcutsTable.svelte, P4a Task 7) - that file's own header comment explicitly
    // names this file as a future consumer; imported here, not re-ported.
    //
    // `useObservableMap(keyBinds.getShortcutMap(...))` collapses to a plain read: `getShortcutMap`
    // already returns a `SvelteMap` living inside KeybindsStore's own `$state`, so reading it
    // directly here auto-tracks it on any rebind (same established precedent as
    // ShortcutsTable.svelte's own header comment / ComposerShortcuts.svelte).
    //
    // `useConfig().IS_MOBILE` -> `globalConfigStore.state.IS_MOBILE`, matching the established
    // precedent (ComposerShortcuts.svelte / ZenKeyboardMenu.svelte's own `IS_MOBILE` gate).
    //
    // i18n: old's `useTranslation(['tutorials', 'shortcuts'])` default (first) namespace is
    // 'tutorials' - every bare (unprefixed) `t(...)` call below is written with an explicit
    // `tutorials:` prefix to resolve to the identical key, per this migration's established
    // convention.
    //
    // PRESERVED QUIRK (verified against the raw old blob, not a transcription slip): the
    // "click_to_visit_blog" link points at `/blog/posts/how-to-use-player`, NOT
    // `/blog/posts/how-to-use-vsrg-composer` (which genuinely exists as its own blog post) - a real
    // pre-existing old bug (this Help tab links to the PLAYER tutorial post instead of its own),
    // reproduced byte-for-byte, not corrected.
    //
    // PRESERVED QUIRK: `keyBinds.getVsrgKeybinds(6)` hardcodes the 6-key layout's keybinds
    // regardless of whatever song is currently open (4-key or 6-key) - this component takes no
    // props at all (old rendered it bare, `<VsrgComposerHelp/>`), so it has no way to know the live
    // song's actual key count even if it wanted to; old had the exact same blind spot. Not "fixed".
    const keys = keyBinds.getVsrgKeybinds(6)
    const vsrgComposerShortcuts = keyBinds.getShortcutMap('vsrg_composer')
</script>

<Column>
    <Header type="h2">{t('tutorials:help.learn_how_to_use_vsrg_composer')}</Header>
    <p>
        <AppLink href="/blog/posts/how-to-use-player">{t('tutorials:help.click_to_visit_blog')}</AppLink>
    </p>
    {#if !globalConfigStore.state.IS_MOBILE}
        <Header type="h2">{t('tutorials:help.vsrg_composer_shortcuts')}</Header>
        <AppLink href="/keybinds" style="margin-top:1rem">
            <AppButton>{t('tutorials:help.change_keybinds')}</AppButton>
        </AppLink>
        {@render shortcutsTable(vsrgComposerShortcuts)}
        <div class="row" style="padding:0.1rem;gap:1rem;margin-top:-0.1rem">
            {@render keyBadge(keys.join('/'))}
            <div>{t('shortcuts:props.vsrg_add_hit_object')}</div>
        </div>
    {/if}
</Column>
