<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/pagesLayout/Folder.tsx (SongFolderContent export). CSS
    // (.folder-content/.folder-title/.folder-songs-wrapper) is already global (App.css) - no
    // component-local <style> needed.
    let {children, title}: {
        children?: Snippet
        title?: string
    } = $props()
</script>

<div class="folder-content">
    {#if title}
        <h2 class="folder-title">{title}</h2>
    {/if}
    <div class="folder-songs-wrapper">
        {@render children?.()}
    </div>
</div>
