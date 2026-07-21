<script lang="ts" generics="K extends string, V extends Shortcut<string>">
    import type {Shortcut} from '$stores/KeybindsStore.svelte'
    import ShortcutElement from './ShortcutElement.svelte'

    // Old: src/components/pages/Keybinds/ShortcutEditor.tsx (109 lines total incl. the local
    // ShortcutElement, extracted into its own file - see ShortcutElement.svelte's header comment).
    interface ShortcutEditorProps<K, V> {
        map: Map<K, V>
        onChangeShortcut: (oldKey: K, newKey: K, shortcut: V) => void
    }

    let {map, onChangeShortcut}: ShortcutEditorProps<K, V> = $props()

    let selected: K | null = $state(null)

    // Old: `const items = Array.from(map.entries())` recomputed on every render (a plain function-
    // component body reruns in full each time). `map` here is a live `SvelteMap` (KeybindsStore.svelte.ts
    // - reactive-collection convention), so `$derived` is the direct Svelte-runes equivalent: it
    // reruns whenever any entry is added/removed/reassigned, exactly matching old's always-fresh
    // per-render read. Old's own comparator sorts DESCENDING by name (`a[1].name < b[1].name ? 1 :
    // -1`) - preserved verbatim, not "fixed" to ascending.
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
