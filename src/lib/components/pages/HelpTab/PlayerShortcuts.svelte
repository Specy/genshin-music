<script lang="ts">
    import Header from '$cmp/header/Header.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {shortcutsTable} from '$cmp/pages/ShortcutsTable.svelte'
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/Index/HelpTab/index.tsx's `PlayerShortcuts` export.
    // `useTranslation(['tutorials', 'home'])` (default ns 'tutorials' - every bare t() call below
    // resolves against it). `useConfig().IS_MOBILE` -> `globalConfigStore.state.IS_MOBILE` (read
    // directly in the template below so it stays reactive). `useObservableMap(keyBinds
    // .getShortcutMap('player'))` -> a direct read (already a reactive SvelteMap living inside the
    // store's own $state) - same established idiom as pages/ShortcutsTable.svelte's own header
    // comment and the how-to-use-player blog post (P4a Task 7). Old's `if (IS_MOBILE) return`
    // (render nothing) -> the whole markup wrapped in `{#if !IS_MOBILE}`.
    const playerShortcuts = keyBinds.getShortcutMap('player')
</script>

{#if !globalConfigStore.state.IS_MOBILE}
    <Header type="h2">{t('tutorials:help.player_shortcuts')}</Header>
    <AppLink href="/keybinds" style="margin-top:1rem">
        <AppButton>{t('tutorials:help.change_keybinds')}</AppButton>
    </AppLink>
    {@render shortcutsTable(playerShortcuts, 'margin-top:1rem')}
{/if}
