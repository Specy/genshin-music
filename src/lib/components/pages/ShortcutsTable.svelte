<script module lang="ts">
  import type { Shortcut } from '$stores/KeybindsStore.svelte';
  import { t } from '$i18n/binding.svelte';

  // Rendered by the how-to-use-player/-composer/-vsrg-composer blog posts (their own shortcut
  // lists), plus the Home HelpTab and VsrgComposerHelp — check those call sites before changing
  // either snippet's signature.
  //
  // shortcuts is a SvelteMap living in the keybinds store's own $state (KeybindsStore.svelte.ts);
  // reading it here in the each-block below already auto-tracks edits, no subscription needed.
  export { fixedShortcutsTable, keyBadge, shortcutsTable };

  /**
   * The composer's WHEEL gestures (user, 2026-08-22), documented beside the rebindable shortcuts
   * wherever those are listed — the Home help tab, the /keybinds page and the how-to-use-composer
   * post — but NOT in the KeybindsStore: a wheel gesture is not a key combo, so it cannot be
   * rebound and the shortcut editor must not offer to. Rendered through fixedShortcutsTable below.
   * The description values are `shortcuts:props.*` keys, the same catalog the store's own rows use.
   */
  export const COMPOSER_WHEEL_SHORTCUTS: readonly { keys: string; description: string }[] = [
    { keys: 'Shift + Wheel', description: 'pro_vertical_scroll_description' },
    { keys: 'Ctrl/⌘ + Wheel', description: 'pro_zoom_description' },
  ];
</script>

{#snippet keyBadge(text: string)}
  <div class="keyboard-key">{text}</div>
{/snippet}

{#snippet shortcutsTable(shortcuts: Map<string, Shortcut<string>>, style: string = '')}
  <table class="keys-table" {style}>
    <tbody>
      <!-- Aliases are filtered out, and the keyed each is why it is not optional: an alias shares
           its action's name (KeybindsStore, `Shortcut.alias`), so listing one would be a duplicate
           {#each} key as well as a second row for a shortcut the reader already saw. The row shown
           is the rebindable one, which is also the only one /keybinds can move. -->
      {#each [...shortcuts.entries()].filter(([, s]) => !s.alias) as [key, shortcut] (shortcut.name)}
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

<!-- The fixed rows' sibling of shortcutsTable: same table, same badge, but entries that are not
     in the store and cannot be rebound (see COMPOSER_WHEEL_SHORTCUTS above). -->
{#snippet fixedShortcutsTable(
  entries: readonly { keys: string; description: string }[],
  style: string = ''
)}
  <table class="keys-table" {style}>
    <tbody>
      {#each entries as entry (entry.keys)}
        <tr>
          <td>
            {@render keyBadge(entry.keys)}
          </td>
          <td>
            {t(`shortcuts:props.${entry.description}`)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<style>
  /* .keyboard-key is styled globally in App.css, not here.
       :nth-child(2) targets the description <td>, so reordering the <td>s below would misapply it.
       No :global() needed even though these snippets are exported and rendered from other files'
       templates: Svelte attaches the scoped-style class at this file's compile time, so it stays
       attached regardless of where {@render} is called from. */
  .keys-table tr {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }

  .keys-table :nth-child(2) {
    width: 100%;
  }
</style>
