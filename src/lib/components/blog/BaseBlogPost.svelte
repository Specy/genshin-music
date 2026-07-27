<script module lang="ts">
    import {base} from '$app/paths'
    import {APP_NAME} from '$core/legacyConfig'
    import type {Snippet} from 'svelte'
    import type {BlogAuthor} from './types'
    import Row from '../layout/Row.svelte'

    // `blogNavbar` is a snippet defined in the markup below (not inside this
    // module script) and re-exported here via `export {blogNavbar}` - the
    // Svelte 5.5+ mechanism for exporting a snippet from a module block.
    export const SpecyAuthor: BlogAuthor = {
        name: 'Specy',
        picture: `${base}/assets/images/specy.png`
    }

    const visitedBlogPostsKey = `${APP_NAME}_visited_blog_posts`

    // Reads localStorage synchronously - unlike a mount-gated hook, this has
    // no built-in SSR safety. Callers that render during SSR/prerender must
    // gate their own call behind a mounted flag to avoid a hydration
    // mismatch (see routes/blog/+page.svelte).
    export function hasVisitedBlogPost(name: string): boolean {
        if (typeof localStorage === 'undefined') return false
        const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}')
        return visited[name] ?? false
    }

    export {blogNavbar}
</script>

{#snippet blogNavbar(children: Snippet, style: string = '')}
    <Row justify="between" {style} class="blog-nav">
        {@render children()}
    </Row>
{/snippet}

<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '../shell/DefaultPage.svelte'
    import PageMetadata from '../shell/PageMetadata.svelte'
    import AppLink from '../AppLink.svelte'
    import Header from '../header/Header.svelte'
    import BlogElements from './BlogElements.svelte'
    import {blogAuthorRenderer, blogTagsRenderer} from './BlogMetadataRenderers.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {createMediaQuery} from '$lib/utils/mediaQuery.svelte'
    import type {BlogMetadata} from './types'

    interface BaseBlogPostProps {
        metadata: BlogMetadata
        cropped?: boolean
        children?: Snippet
    }

    let {metadata, cropped = true, children}: BaseBlogPostProps = $props()

    onMount(() => {
        const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}')
        visited[metadata.relativeUrl] = true
        localStorage.setItem(visitedBlogPostsKey, JSON.stringify(visited))
    })

    // Locale-dependent (Intl.DateTimeFormat with the runtime's own locale), so
    // server- and client-rendered text can differ - this can produce a
    // hydration warning in the console; it's expected, not a bug to chase.
    const date = $derived(
        new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    )

    const isPortrait = createMediaQuery('(orientation: portrait)')
    const closeMenu = $derived(isPortrait.matches && globalConfigStore.state.IS_MOBILE)
</script>

{#snippet navChildren()}
    <AppLink href="/blog">Posts</AppLink>
    <AppLink href="/">Player</AppLink>
    <AppLink href="/composer">Composer</AppLink>
{/snippet}

<DefaultPage
    cropped={false}
    excludeMenu={closeMenu}
    style="padding-left:var(--menu-size);gap:1rem;line-height:1.5"
>
    <PageMetadata text={metadata.title} description={metadata.description} image={metadata.image}>
        <meta name="author" content={metadata.author?.name ?? 'Specy'} />
        <meta name="date" content={metadata.createdAt.toISOString()} />
        <meta name="keywords" content={metadata.tags.join(', ')} />
    </PageMetadata>
    {@render blogNavbar(navChildren, closeMenu ? 'padding:1rem 1.5rem' : '')}
    <div class="blog-header">
        <img
            src={metadata.image ?? ''}
            alt="{metadata.title} image"
            style="object-fit:cover;width:100%;height:100%"
        />
        <div class="blog-image-mask"></div>
        <div class="blog-header-content">
            <Header class="blog-title" style="padding:1rem;font-weight:bold;font-size:2.5rem">
                {metadata.title}
            </Header>
        </div>
    </div>

    <article
        style={cropped
            ? `max-width:60rem;margin:0 auto;padding:2rem;padding-left:${closeMenu ? '2rem' : 'calc(var(--menu-size) + 2rem)'}`
            : 'padding:2rem'}
    >
        <Row align="center" gap="2rem" style="font-size:1.2rem;margin-bottom:1rem;flex-wrap:wrap">
            {#if metadata.author}
                {@render blogAuthorRenderer(metadata.author)}
            {/if}
            <div>{date}</div>
            {@render blogTagsRenderer(metadata.tags, '0.2rem 1rem')}
        </Row>

        <BlogElements>
            {@render children?.()}
        </BlogElements>
    </article>
</DefaultPage>

<style>
    /* `.blog-nav`/`.blog-title` are applied via Row/Header's `class` prop
       (foreign elements); `.blog-nav a` (plain and :hover) targets an <a> two
       component boundaries away (Row, then AppLink) - all need :global().
       QUIRK: `.blog-back`/`.blog-tag` below are unused - no current template
       applies either class to an element - but are kept, wrapped in
       :global(), so svelte-check's unused-selector check doesn't flag them.
       Not dead code to prune. */
    :global(.blog-nav) {
        display: flex;
        align-items: center;
        padding: 0.5rem 2rem;
        border-bottom: solid 0.1rem var(--secondary);
        background-color: var(--primary);
        padding-left: calc(var(--menu-size) + 2rem);
        z-index: 1;
        height: calc(var(--menu-size) - 0.1rem);
        box-shadow: 0 0.5rem 0.7rem 0.5rem rgba(0, 0, 0, 0.2);
    }

    :global(.blog-nav a) {
        color: var(--primary-text);
        font-size: 1.2rem;
        user-select: text;
    }

    :global(.blog-nav a:hover) {
        color: var(--accent);
        text-decoration: underline;
    }

    .blog-header {
        width: 100%;
        position: relative;
        height: 50vh;
    }

    :global(.blog-back) {
        position: absolute;
        top: 0;
        left: var(--menu-size);
        border: none;
        background: rgba(var(--primary-rgb), 0.8);
        border-bottom: solid 0.1rem var(--secondary);
        border-right: solid 0.1rem var(--secondary);
        transition: background 0.3s;
        border-bottom-right-radius: 0.4rem;
        font-size: 1.2rem;
        color: var(--primary-text);
        z-index: 4;
        cursor: pointer;
        padding: 1rem 1.5rem;
    }

    :global(.blog-back:hover) {
        background: rgba(var(--primary-rgb), 1);
    }

    :global(.blog-title) {
        text-align: center;
        text-shadow: 0.1rem 0.1rem 0.3rem rgba(0, 0, 0, 0.6);
        user-select: text;
    }

    :global(.blog-tag) {
        background-color: var(--secondary);
        color: var(--secondary-text);
        text-align: center;
        border-radius: 1rem;
        padding: 0.2rem 0.8rem;
    }

    .blog-header-content {
        z-index: 3;
        top: 0;
        position: absolute;
        height: 100%;
        width: 100%;
        align-items: flex-end;
        padding-bottom: 3rem;
        justify-content: center;
        display: flex;
    }

    .blog-image-mask {
        z-index: 2;
        backdrop-filter: blur(8px);
        position: absolute;
        mask: linear-gradient(transparent, black 60%);
        background: linear-gradient(180deg, rgba(var(--background-rgb), 0) 24%, rgba(var(--background-rgb), 1) 94%, rgba(var(--background-rgb), 1) 100%);
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
    }
</style>
