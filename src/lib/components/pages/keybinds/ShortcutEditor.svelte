<script lang="ts" generics="K extends string, V extends Shortcut<string>">
    import type {Shortcut} from '$stores/KeybindsStore.svelte'
    import ShortcutElement from './ShortcutElement.svelte'

    interface ShortcutEditorProps<K, V> {
        map: Map<K, V>
        onChangeShortcut: (oldKey: K, newKey: K, shortcut: V) => void
    }

    let {map, onChangeShortcut}: ShortcutEditorProps<K, V> = $props()

    let selected: K | null = $state(null)

    // QUIRK: sorts DESCENDING by name (a[1].name < b[1].name ? 1 : -1) - preserved as-is, not
    // "fixed" to ascending.
    const items = $derived(
        Array.from(map.entries()).sort((a, b) => (a[1].name < b[1].name ? 1 : -1))
    )
</script>

<div class="column" style="gap:0.4rem">
    {#each items as [key, value] (key)}
        <ShortcutElement
            mapKey={key}
            {value}
            selected={selected === key}
            setSelected={(k) => (selected = k)}
            onChangeShortcut={(k, v) => {
                onChangeShortcut(key, k, v)
                selected = null
            }}
        />
    {/each}
</div>
