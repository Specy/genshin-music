<script module lang="ts">
    import {base} from '$app/paths'
    import {APP_NAME} from '$core/legacyConfig'
    import type {Snippet} from 'svelte'
    import type {BlogAuthor} from './types'
    import Row from '../layout/Row.svelte'

    // Old: src/components/pages/blog/BaseBlogPost.tsx (117 lines) - exports `BaseBlogPost`,
    // `SpecyAuthor`, `useHasVisitedBlogPost`, `BlogNavbar`. `SpecyAuthor`/`hasVisitedBlogPost`/
    // `BlogNavbar` are module-level exports (Svelte 5.5+ snippet-export mechanism for the last one
    // - see inputs/ComboBox.svelte's note) so routes/blog/+page.svelte can reuse all three exactly
    // as the old index.tsx reused them from this same file.
    export const SpecyAuthor: BlogAuthor = {
        name: 'Specy',
        picture: `${base}/assets/images/specy.png`
    }

    const visitedBlogPostsKey = `${APP_NAME}_visited_blog_posts`

    // old: `useHasVisitedBlogPost` (a `useState(false)` + one-time `useEffect(() => {...}, [])`
    // hook - reads the map ONCE after mount, never subscribes to later changes) -> a plain
    // function (the "-> store helper" the brief calls for, same naming convention as
    // PageVisitStore.svelte.ts's `hasVisitedPage`). Callers that need the old hook's "corrects
    // once after mount" timing (routes/blog/+page.svelte, so prerendered/SSR output and the first
    // client paint both start from the same "not visited" state, exactly like old's `useState(false)`
    // initial value) gate their own call behind a local mounted flag - see that file.
    export function hasVisitedBlogPost(name: string): boolean {
        if (typeof localStorage === 'undefined') return false
        const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}')
        return visited[name] ?? false
    }

    export {blogNavbar}
</script>

{#snippet blogNavbar(children: Snippet, style: string = '')}
    <Row justify="between" {style} className="blog-nav">
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

    // old: `useEffect(() => { const visited = JSON.parse(...); visited[metadata.relativeUrl] =
    // true; localStorage.setItem(...) }, [metadata.relativeUrl])` - onMount is the direct
    // equivalent (this post's `relativeUrl` never changes across the component's own lifetime, so
    // there's nothing for a dependency-array re-run to do here that onMount-once doesn't already
    // cover).
    onMount(() => {
        const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}')
        visited[metadata.relativeUrl] = true
        localStorage.setItem(visitedBlogPostsKey, JSON.stringify(visited))
    })

    // old: `useMemo(() => new Intl.DateTimeFormat(...).format(metadata.createdAt), [metadata.createdAt])`.
    const date = $derived(
        new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    )
    // old also passed `suppressHydrationWarning={true}` on the date div - a React-only escape
    // hatch with nothing to port it to, same call as ChangelogRow.svelte's identical case.

    // old: `useMediaQuery("(orientation: portrait)") && IS_MOBILE` -> `createMediaQuery` ($lib/
    // utils/mediaQuery.svelte.ts) + globalConfigStore.state.IS_MOBILE (GlobalConfigStore.svelte.ts,
    // already loaded by AppInit).
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
            <Header className="blog-title" style="padding:1rem;font-weight:bold;font-size:2.5rem">
                {metadata.title}
            </Header>
        </div>
    </div>

    <!-- old: `<article className={\`${s['blog-article']}\`} style={...}>` - `blog-article` is
         never defined anywhere in blog.module.scss (grepped), so the CSS-module import produced
         `undefined`, and the template literal rendered the literal string "undefined" as the
         class attribute (a dead, purposeless class matching no rule either way). Same class of
         artifact Card.svelte's own port already normalized away (its header comment: "rendered
         the literal string 'undefined'... harmless... clearly unintentional") - no class attribute
         emitted here, matching that precedent; the visible/functional result is identical. -->
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
    /* Old: src/components/pages/blog/blog.module.scss - this file's 7 selectors (BlogElements.svelte
       owns the other 5 - see that file's own style block for the split accounting). `.blog-nav`/
       `.blog-title` are applied via Row/Header's `className` prop (foreign elements); `.blog-nav a`
       (both its plain and :hover forms) targets an `<a>` that's TWO component-boundaries removed
       (Row, then AppLink, both foreign) - all four need :global(). `.blog-back`/`.blog-tag` are
       dead in the old app too (grepped: no `s['blog-back']`/`s['blog-tag']` reference anywhere) -
       ported anyway wrapped in :global() so svelte-check's unused-selector check doesn't flag them,
       same disclosed-preservation call as SettingsRow.svelte's `.invalid` rule. `.blog-header`/
       `.blog-header-content`/`.blog-image-mask` are native divs this file's own template renders
       directly - plain scoped CSS already reaches them. */
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
