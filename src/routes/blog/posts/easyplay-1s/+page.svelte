<script lang="ts">
    import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte'
    import BlogImage from '$cmp/blog/BlogImage.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import Header from '$cmp/header/Header.svelte'
    import {base} from '$app/paths'
    import {easyplay1sMetadata} from '$cmp/blog/posts/easyplay-1s'

</script>

<BaseBlogPost metadata={easyplay1sMetadata}>
    <Header>
        What it is
    </Header>

    <p class="blog-p">
        The EASYPLAY 1s is a keyboard that uses the same layout as Sky Music Nightly, and you can use it in the app
        to help you
        to compose songs and to learn them. <AppLink target="_blank" href="https://summertones-1.kckb.me/18287a61" class="blog-link">You
        can find the keyboard on kickstarter here</AppLink>.
    </p>
    <!-- QUIRK: this link doesn't get target="_blank" even though it's the exact same external
         kickstarter URL as the two text links above/below, which do. Reproduced exactly - only
         this one link doesn't open in a new tab. -->
    <AppLink href="https://summertones-1.kckb.me/18287a61" class="blog-link">
        <BlogImage
            src="{base}/assets/blog/easyplay.webp"
            alt="Easyplay 1S"
            height="15rem"
        />
    </AppLink>
    <Header>
        The features
    </Header>
    <p class="blog-p">
        It is a MIDI keyboard which uses the same layout as Sky Music Nightly, the main features are:
    </p>
    <ul>
        <li>20 instruments, most of which can be sustained</li>
        <li>4 octaves of pitch change</li>
        <li>Adjustable volume through a speaker and an headphone jack</li>
        <li>MIDI support through USB-C</li>
    </ul>
    <p class="blog-p">
        It's made out of translucent black plastic with replaceable keycaps and rubber pads to prevent slipping.

    </p>
    <Header>
        Demo video
    </Header>
    <!-- old's own BlogIframe never had a title prop at all (BlogUl.tsx / this post's sole call
         site) - a pre-existing accessibility gap, preserved rather than fabricating a title old
         never had. -->
    <!-- svelte-ignore a11y_missing_attribute -->
    <iframe src="https://www.youtube.com/embed/l64Qdm-FpVU?si=NmbU0nVSrLlWTsBh" class="blog-iframe"></iframe>
    <p class="blog-p">
        If you are interested, <AppLink target="_blank" href="https://summertones-1.kckb.me/18287a61" class="blog-link">you can find the
        keyboard on kickstarter here</AppLink>.
    </p>
</BaseBlogPost>
