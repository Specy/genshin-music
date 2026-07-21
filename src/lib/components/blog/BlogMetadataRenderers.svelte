<script module lang="ts">
    import {base} from '$app/paths'
    import type {BlogAuthor} from './types'
    import Row from '../layout/Row.svelte'

    // Old: src/components/pages/blog/BlogMetadataRenderers.tsx (48 lines) - exports
    // `BlogAuthorRenderer`/`BlogTagsRenderer`. Ported as snippets exported from this module
    // (Svelte 5.5+, see the note in inputs/ComboBox.svelte for the mechanism) - consumed by both
    // BaseBlogPost.svelte and routes/blog/+page.svelte.
    //
    // Both renderers style purely via inline `style` strings in the old file (no CSS-module class
    // anywhere in either) - this file needs no style block at all. `BASE_PATH` (old `$config`)
    // -> `base` from `$app/paths`, the same substitution used throughout this migration.
    export {blogAuthorRenderer, blogTagsRenderer}
</script>

{#snippet blogAuthorRenderer(author: BlogAuthor, size: string = '2.5rem', noName: boolean = false)}
    <Row gap="0.5rem" align="center">
        <img
            src={author.picture ?? `${base}/assets/images/specy.png`}
            alt="{author.name} picture"
            style="width:{size};height:{size};border-radius:50%;border:solid 0.1rem var(--secondary)"
        />
        {#if !noName}
            <div>{author.name}</div>
        {/if}
    </Row>
{/snippet}

{#snippet blogTagsRenderer(tags: string[], padding: string = '0.2rem 0.5rem')}
    <!-- old rendered a plain `<div className={'row'}>`, NOT the Row component (unlike
         blogAuthorRenderer above) - `.row` is the global flex-row utility class (src/lib/css/
         App.css, already ported) - preserved as the same bare native div. -->
    <div class="row" style="flex-wrap:wrap">
        {#each tags as tag (tag)}
            <div style="padding:{padding};border-radius:2rem;background-color:var(--secondary);color:var(--secondary-text)">
                {tag}
            </div>
        {/each}
    </div>
{/snippet}
