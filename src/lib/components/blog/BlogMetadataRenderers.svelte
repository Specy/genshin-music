<script module lang="ts">
  import { base } from '$app/paths';
  import type { BlogAuthor } from './types';
  import Row from '../layout/Row.svelte';

  // `blogAuthorRenderer`/`blogTagsRenderer` are snippets defined below and
  // re-exported here - the Svelte 5.5+ mechanism for exporting a snippet
  // from a module block.
  export { blogAuthorRenderer, blogTagsRenderer };
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
  <!-- Deliberately a bare div with the global `.row` utility class, not the
         Row component like blogAuthorRenderer above - both produce the same
         flex row. -->
  <div class="row" style="flex-wrap:wrap">
    {#each tags as tag (tag)}
      <div
        style="padding:{padding};border-radius:2rem;background-color:var(--secondary);color:var(--secondary-text)"
      >
        {tag}
      </div>
    {/each}
  </div>
{/snippet}
