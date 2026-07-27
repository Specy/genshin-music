<script lang="ts">
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import Header from '$cmp/header/Header.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {keyBadge, shortcutsTable} from '$cmp/pages/ShortcutsTable.svelte'

    // QUIRK: hardcodes the 6-key layout's keybinds regardless of whatever song is currently open
    // (4-key or 6-key) - this component takes no props, so it has no way to know the live song's
    // actual key count. Not "fixed".
    const keys = keyBinds.getVsrgKeybinds(6)
    const vsrgComposerShortcuts = keyBinds.getShortcutMap('vsrg_composer')
</script>

<Column>
    <Header type="h2">{t('tutorials:help.learn_how_to_use_vsrg_composer')}</Header>
    <p>
        <!-- QUIRK: links to the player tutorial post, not vsrg-composer's own (which exists at
             /blog/posts/how-to-use-vsrg-composer) - a pre-existing bug, reproduced not corrected. -->
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
