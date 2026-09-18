<script lang="ts" generics="K extends string, V extends Shortcut<string>">
  import type { Shortcut } from '$stores/KeybindsStore.svelte';
  import ShortcutElement from './ShortcutElement.svelte';

  interface ShortcutEditorProps<K, V> {
    map: Map<K, V>;
    onChangeShortcut: (oldKey: K, newKey: K, shortcut: V) => void;
  }

  let { map, onChangeShortcut }: ShortcutEditorProps<K, V> = $props();

  let selected: K | null = $state(null);

  // QUIRK: sorts DESCENDING by name (a[1].name < b[1].name ? 1 : -1) - preserved as-is, not
  // "fixed" to ascending.
  //
  // Aliases never get a row: they cannot be rebound (KeybindsStore, `Shortcut.alias`) and they
  // carry their action's name, so a row for one would offer an edit this store cannot honour and
  // sit right next to the real row for the same action.
  const items = $derived(
    Array.from(map.entries())
      .filter(([, value]) => !value.alias)
      .sort((a, b) => (a[1].name < b[1].name ? 1 : -1))
  );
</script>

<div class="column" style="gap:0.4rem">
  {#each items as [key, value] (key)}
    <ShortcutElement
      mapKey={key}
      {value}
      selected={selected === key}
      setSelected={(k) => (selected = k)}
      onChangeShortcut={(k, v) => {
        onChangeShortcut(key, k, v);
        selected = null;
      }}
    />
  {/each}
</div>
