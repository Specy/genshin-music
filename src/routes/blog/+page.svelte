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

    // posts/tags are computed once at module scope, not per-render. Array.prototype.sort is
    // spec-guaranteed stable since ES2019, so the 6 posts sharing the 2024/03/19 createdAt
    // (composer, player, midi-transpose, connect-midi-device, video-audio-transpose,
    // vsrg-composer) keep this array's literal order after the descending sort below.
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

    // Distinct from BaseBlogPost.svelte's own per-post visited map: this call is the page-level
    // visit tracker only.
    //
    // mounted starts false and flips true onMount so prerendered/SSR output and the first client
    // paint both start every card "not visited" (shows "New!"), then correct once real
    // localStorage is available post-hydration.
    let mounted = $state(false)

    onMount(() => {
        setPageVisited('blog')
        mounted = true
    })

    let selectedTags = $state(tags.map(item => ({item, selected: false})))

    const filteredPosts = $derived(
        selectedTags.every(t => !t.selected)
            ? posts
            : posts.filter(p => selectedTags.some(t => t.selected && p.tags.includes(t.item)))
    )

    const isPortrait = createMediaQuery('(orientation: portrait)')
    const closeMenu = $derived(isPortrait.matches && globalConfigStore.state.IS_MOBILE)
</script>

{#snippet indexNavChildren()}
    <!-- QUIRK: both Home and Player link to "/" - a preserved duplicate-href bug, reproduced
         exactly. -->
    <AppLink href="/">Home</AppLink>
    <AppLink href="/">Player</AppLink>
    <AppLink href="/composer">Composer</AppLink>
{/snippet}

{#snippet selectTagsLabel()}Select tags{/snippet}

{#snippet blogPostCard(metadata: BlogMetadata)}
    {@const visited = mounted && hasVisitedBlogPost(metadata.relativeUrl)}
    {@const date = new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)}
    <AppLink href="/blog/posts/{metadata.relativeUrl}">
        <Card class="blog-card {visited ? '' : 'blog-card-new'}" style="height:100%">
            <Header type="h2" class="blog-card-title" style="margin-bottom:-1.5rem">
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
            <Column padding="1rem" style="padding-top:0.5rem" class="blog-card-description">
                {metadata.description}
            </Column>
            <Row justify="between" align="end" style="padding:0.5rem" flex1>
                <Row style="font-size:0.8rem">
                    {@render blogTagsRenderer(metadata.tags)}
                </Row>
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
    /* .blog-card/.blog-card-title/.blog-card-description are applied via Card/Header/Column's
       class prop (foreign elements), so they need :global() - as do the .blog-card:hover
       rules, rooted at that same foreign class. .blog-card-image/.blog-card-title-content are
       native divs passed as those components' CHILDREN, compiled as part of THIS file's
       template, so plain scoped CSS reaches them - only the base (non-hover) .blog-card-image
       rule can skip :global(). */
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
