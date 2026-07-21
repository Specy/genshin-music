<script module lang="ts">
    import type {BlogMetadata} from '$cmp/blog/types'
    import {addToHomeScreenMetadata} from '$cmp/blog/posts/add-to-home-screen'
    import {easyplay1sMetadata} from '$cmp/blog/posts/easyplay-1s'
    import {composerTutorialMetadata} from '$cmp/blog/posts/how-to-use-composer'
    import {playerTutorialMetadata} from '$cmp/blog/posts/how-to-use-player'
    import {midiTransposeMetadata} from '$cmp/blog/posts/midi-transpose'
    import {midiDeviceMetadata} from '$cmp/blog/posts/connect-midi-device'
    import {aiTransposeMetadata} from '$cmp/blog/posts/video-audio-transpose'
    import {howUseVsrgComposerMetadata} from '$cmp/blog/posts/how-to-use-vsrg-composer'

    // Old: src/app/_client-pages/blog/index.tsx (171 lines) + blog.module.scss (66 lines).
    //
    // `posts`/`tags` are module-level consts (computed once, like old's own module-level consts,
    // not per-render) - same literal array order as old's `posts` array; `Array.prototype.sort`
    // has been spec-guaranteed stable since ES2019, so the 6 posts sharing the same 2024/03/19
    // `createdAt` keep old's exact relative order (composer, player, midi-transpose,
    // connect-midi-device, video-audio-transpose, vsrg-composer) after the descending sort, same
    // as old relied on implicitly. `new Date(x).getTime()`/`.values()` (old's `new
    // Date(b.createdAt).getTime()`/`new Set(...).values()`) drop their redundant wrapping - both
    // no-ops here (`createdAt` is already a Date; `Array.from` already iterates a Set's values) -
    // disclosed no-op simplifications.
    const posts: BlogMetadata[] = [
        addToHomeScreenMetadata,
        easyplay1sMetadata,
        composerTutorialMetadata,
        playerTutorialMetadata,
        midiTransposeMetadata,
        midiDeviceMetadata,
        aiTransposeMetadata,
        howUseVsrgComposerMetadata,
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const tags = Array.from(new Set(posts.flatMap(p => p.tags)))
</script>

<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import Header from '$cmp/header/Header.svelte'
    import Card from '$cmp/layout/Card.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Grid from '$cmp/layout/Grid.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import PromotionCard from '$cmp/PromotionCard.svelte'
    import ComboBox, {comboBoxItem, comboBoxTitle} from '$cmp/inputs/ComboBox.svelte'
    import {blogNavbar, hasVisitedBlogPost} from '$cmp/blog/BaseBlogPost.svelte'
    import {blogAuthorRenderer, blogTagsRenderer} from '$cmp/blog/BlogMetadataRenderers.svelte'
    import {game} from '$game'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {createMediaQuery} from '$lib/utils/mediaQuery.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'

    // old: `useSetPageVisited('blog')` (the generic page-visit tracker - distinct from the
    // per-post `${APP_NAME}_visited_blog_posts` map BaseBlogPost.svelte owns).
    //
    // old: `useHasVisitedBlogPost` reads its map ONCE after mount (`useState(false)` initial
    // value, corrected in a `useEffect(..., [])`) - `mounted` reproduces that exact timing so
    // prerendered/SSR output and the first client paint both start every card "not visited"
    // (shows "New!"), exactly like old, then corrects once real localStorage is available.
    let mounted = $state(false)

    onMount(() => {
        setPageVisited('blog')
        mounted = true
    })

    // old: `useState(() => tags.map(i => ({item: i, selected: false})))`.
    let selectedTags = $state(tags.map(item => ({item, selected: false})))

    // old: `useMemo(() => {...}, [selectedTags])`.
    const filteredPosts = $derived(
        selectedTags.every(t => !t.selected)
            ? posts
            : posts.filter(p => selectedTags.some(t => t.selected && p.tags.includes(t.item)))
    )

    // old: `useMediaQuery("(orientation: portrait)") && IS_MOBILE`.
    const isPortrait = createMediaQuery('(orientation: portrait)')
    const closeMenu = $derived(isPortrait.matches && globalConfigStore.state.IS_MOBILE)
</script>

{#snippet indexNavChildren()}
    <!-- old: both "Home" and "Player" link to '/' - a pre-existing duplicate-href quirk,
         reproduced exactly (not this file's BlogNavbar - BaseBlogPost.svelte's own post-page
         navbar uses "Posts"/"Player"/"Composer" instead, a genuinely different label set). -->
    <AppLink href="/">Home</AppLink>
    <AppLink href="/">Player</AppLink>
    <AppLink href="/composer">Composer</AppLink>
{/snippet}

{#snippet selectTagsLabel()}Select tags{/snippet}

{#snippet blogPostCard(metadata: BlogMetadata)}
    {@const visited = mounted && hasVisitedBlogPost(metadata.relativeUrl)}
    {@const date = new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)}
    <AppLink href="/blog/posts/{metadata.relativeUrl}">
        <Card className="blog-card {visited ? '' : 'blog-card-new'}" style="height:100%">
            <Header type="h2" className="blog-card-title" style="margin-bottom:-1.5rem">
                <div class="blog-card-image" style="background-image:url('{metadata.image}')"></div>
                <div class="blog-card-title-content">
                    {metadata.title}
                </div>
                {#if metadata.author}
                    <div style="position:absolute;top:0.5rem;right:0.5rem">
                        {@render blogAuthorRenderer(metadata.author, '2rem', true)}
                    </div>
                {/if}
            </Header>
            <Column padding="1rem" style="padding-top:0.5rem" className="blog-card-description">
                {metadata.description}
            </Column>
            <Row justify="between" align="end" style="padding:0.5rem" flex1>
                <Row style="font-size:0.8rem">
                    {@render blogTagsRenderer(metadata.tags)}
                </Row>
                <!-- old also passed `suppressHydrationWarning={true}` here - a React-only escape
                     hatch with nothing to port it to, same call as ChangelogRow.svelte's/
                     BaseBlogPost.svelte's identical case. -->
                <div>{date}</div>
            </Row>
        </Card>
    </AppLink>
{/snippet}

<DefaultPage excludeMenu={closeMenu} contentStyle="gap:1rem">
    <PageMetadata
        text="{game.meta.title} Blog"
        description="Welcome to {game.meta.title} blog! Here there will be written guides, news and info about the app!"
    />
    {#if closeMenu}
        {@render blogNavbar(indexNavChildren, 'border-radius:0.5rem;padding:1rem 1.5rem')}
    {/if}
    <Column gap="2rem">
        <Header style="font-size:2.2rem;text-align:center">
            Welcome to {game.meta.title} blog!
        </Header>
        <PromotionCard alwaysVisible />
        <Column gap="1rem">
            <Row justify="between" align="center">
                <Header>Posts</Header>
                <ComboBox
                    items={selectedTags}
                    onChange={(newItems) => selectedTags = newItems}
                    style="z-index:3"
                >
                    {#snippet title()}
                        {@render comboBoxTitle(selectTagsLabel)}
                    {/snippet}
                    {#snippet children(item, onClick)}
                        {#snippet tagLabel()}{item.item}{/snippet}
                        {@render comboBoxItem(item.selected, onClick, tagLabel)}
                    {/snippet}
                </ComboBox>
            </Row>

            <Grid columns={closeMenu ? '1fr' : 'repeat(2, 1fr)'} gap="1rem">
                {#each filteredPosts as metadata (metadata.relativeUrl)}
                    {@render blogPostCard(metadata)}
                {/each}
            </Grid>
        </Column>
    </Column>
</DefaultPage>

<style>
    /* Old: src/app/_client-pages/blog/blog.module.scss (this page's own module - distinct from
       the shared components/pages/blog/blog.module.scss split across BaseBlogPost.svelte/
       BlogElements.svelte). `.blog-card`/`.blog-card-title`/`.blog-card-description` are applied
       via Card/Header/Column's `className` prop (foreign elements) - all need :global(), as does
       the `.blog-card:hover` / `.blog-card:hover .blog-card-image` pair (rooted at the same
       foreign `.blog-card`). `.blog-card-new::after` is likewise foreign-rooted. `.blog-card-image`/
       `.blog-card-title-content` are native divs passed as Header's CHILDREN content - children
       are compiled as part of THIS file's template (not the child component's), so plain scoped
       CSS reaches them; only the base (non-hover) `.blog-card-image` rule needs no :global().
       Old's `.blog-image {}` rule is dropped entirely (unlike `.blog-back`/`.blog-tag`/
       SettingsRow.svelte's `.invalid`, which are dead-but-non-empty and preserved wrapped in
       :global()) - it was ALREADY empty in old (no declarations, no consumer either), so unlike
       those it has zero effect whether present or not; keeping it would only trip svelte-check's
       separate "empty ruleset" warning for no behavioral gain. */
    :global(.blog-card) {
        position: relative;
        transition: transform 0.3s, box-shadow 0.3s;
        box-shadow: 0 0.25rem 0.5rem rgba(0, 0, 0, 0.05);
        min-height: 8rem;
    }

    :global(.blog-card-new::after) {
        content: "New!";
        position: absolute;
        top: 0;
        transform: rotate(45deg) translate(18%, -80%);
        right: 0;
        background-color: var(--accent);
        color: var(--accent-text);
        font-size: 0.8rem;
        z-index: 4;
        border-radius: 0.2rem;
        padding: 0.2rem 0.5rem;
    }

    :global(.blog-card-title) {
        position: relative;
        padding: 1rem 1.2rem;
        overflow: hidden;
        border-top-left-radius: 0.4rem;
        border-top-right-radius: 0.4rem;
    }

    :global(.blog-card-description) {
        font-family: RobotoSerif, serif;
        opacity: 0.9;
    }

    .blog-card-title-content {
        z-index: 2;
        padding-bottom: 1.3rem;
        position: relative;
        text-shadow: 1px 1px 0.2rem #000000;
    }

    :global(.blog-card:hover) {
        transform: translateY(-0.05rem);
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    :global(.blog-card:hover .blog-card-image) {
        transform: scale(1.03);
    }

    .blog-card-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-repeat: no-repeat;
        background-size: cover;
        filter: blur(3px);
        background-position: center;
        mask-image: linear-gradient(0deg, #00000000, rgba(0, 0, 0, 1));
        transition: transform 0.3s;
    }
</style>
