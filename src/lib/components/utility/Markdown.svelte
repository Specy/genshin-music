<script lang="ts">
  // Renders a markdown string (a translated one, typically) as real elements, one per node of the
  // fixed set parseMarkdown produces - see markdown.ts for what is kept and what becomes text.
  // Every string here reaches the DOM as an escaped text node; nothing is ever inserted as markup.
  //
  // Unstyled, like AppLink: the caller styles what this renders through its own :global() rules.
  import AppLink from '../AppLink.svelte';
  import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from './markdown';

  let { source }: { source: string } = $props();

  const blocks = $derived(parseMarkdown(source));
</script>

{#snippet inlines(nodes: MarkdownInline[])}
  {#each nodes as node, i (i)}
    {#if node.kind === 'text'}
      {node.text}
    {:else if node.kind === 'strong'}
      <strong>{@render inlines(node.children)}</strong>
    {:else if node.kind === 'em'}
      <em>{@render inlines(node.children)}</em>
    {:else if node.kind === 'code'}
      <code>{node.text}</code>
    {:else if node.external}
      <AppLink href={node.href} target="_blank" rel="noopener noreferrer"
        >{@render inlines(node.children)}</AppLink
      >
    {:else}
      <AppLink href={node.href}>{@render inlines(node.children)}</AppLink>
    {/if}
  {/each}
{/snippet}

{#snippet blockList(nodes: MarkdownBlock[])}
  {#each nodes as node, i (i)}
    {#if node.kind === 'heading'}
      <svelte:element this={`h${node.level}`}>{@render inlines(node.children)}</svelte:element>
    {:else if node.kind === 'paragraph'}
      <p>{@render inlines(node.children)}</p>
    {:else if node.kind === 'text'}
      {@render inlines(node.children)}
    {:else if node.ordered}
      <ol start={node.start}>
        {#each node.items as item, j (j)}
          <li>{@render blockList(item)}</li>
        {/each}
      </ol>
    {:else}
      <ul>
        {#each node.items as item, j (j)}
          <li>{@render blockList(item)}</li>
        {/each}
      </ul>
    {/if}
  {/each}
{/snippet}

{@render blockList(blocks)}
