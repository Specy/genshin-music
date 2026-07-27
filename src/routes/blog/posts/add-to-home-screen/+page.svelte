<script lang="ts">
    import {base} from '$app/paths'
    import {t} from '$i18n/binding.svelte'
    import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte'
    import BlogImage from '$cmp/blog/BlogImage.svelte'
    import Header from '$cmp/header/Header.svelte'
    import ExpandableContainer from '$cmp/ExpandableContainer.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import {pwaStore} from '$stores/PwaStore.svelte'
    import {addToHomeScreenMetadata} from '$cmp/blog/posts/add-to-home-screen'

</script>

{#snippet faDownloadIcon()}
    <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 512 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"/></svg>
{/snippet}

<BaseBlogPost metadata={addToHomeScreenMetadata}>

    <div>
        <p class="blog-p">
            Adding the app to the home screen will make it behave more like an actual native app. It will go full
            screen and
            create an icon to quickly access the app. In certain browsers (like chrome or chromium based) it will
            also allow more
            features, like the ability to open the files created by the app.
        </p>
        {#if pwaStore.state.installEvent}
            <p class="blog-p">
                Your browser allows for the app to be quickly installed, just press this button and then press the "install"
                button that will pop up in your browser.
                <AppButton onclick={pwaStore.install} cssVar="accent" style="margin-left:1rem">
                    {@render faDownloadIcon()} {t('home:install_app')}
                </AppButton>
            </p>
        {/if}
        <Header type="h2" margin="1rem 0">
            How to install the app in different devices
        </Header>

        <Column gap="0.8rem">
            <ExpandableContainer>
                {#snippet headerContent()}
                    <Header type="h2">iPhone / iPad</Header>
                {/snippet}
                <Row gap="0.5rem">
                    <BlogImage
                        src="{base}/assets/blog/add-to-home-screen/ios1.webp"
                        alt="First step to download the app"
                        width="50%"
                    />
                    <BlogImage
                        src="{base}/assets/blog/add-to-home-screen/ios2.webp"
                        alt="Second step to download the app"
                        width="50%"
                    />
                </Row>
            </ExpandableContainer>
            <ExpandableContainer>
                {#snippet headerContent()}
                    <Header type="h2">PC / Mac</Header>
                {/snippet}
                <p class="blog-p">
                    If you are on Mac, i suggest using the app with chrome or chromium based browsers instead of safari.
                </p>
                <BlogImage
                    src="{base}/assets/blog/add-to-home-screen/desktop.webp"
                    alt="Second step to download the app"
                    width="100%"
                />
            </ExpandableContainer>
            <ExpandableContainer>
                {#snippet headerContent()}
                    <Header type="h2">Android</Header>
                {/snippet}
                <Row justify="center" flex1>
                    <BlogImage
                        src="{base}/assets/blog/add-to-home-screen/android.webp"
                        alt="Second step to download the app"
                        width="50%"
                    />
                </Row>
            </ExpandableContainer>
        </Column>
    </div>
</BaseBlogPost>
