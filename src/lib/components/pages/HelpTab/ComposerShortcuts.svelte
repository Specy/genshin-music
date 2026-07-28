<script lang="ts">
  import Header from '$cmp/header/Header.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import { shortcutsTable } from '$cmp/pages/ShortcutsTable.svelte';
  import { keyBinds } from '$stores/KeybindsStore.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { t } from '$i18n/binding.svelte';

  const composerShortcuts = keyBinds.getShortcutMap('composer');
</script>

{#if !globalConfigStore.state.IS_MOBILE}
  <Header type="h2">{t('tutorials:help.composer_shortcuts')}</Header>
  <AppLink href="/keybinds" style="margin-top:1rem">
    <AppButton>{t('tutorials:help.change_keybinds')}</AppButton>
  </AppLink>
  {@render shortcutsTable(composerShortcuts, 'margin-top:1rem')}
{/if}
