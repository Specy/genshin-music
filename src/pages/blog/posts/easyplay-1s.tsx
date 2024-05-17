import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {Header} from "$cmp/shared/header/Header";
import {BlogIframe, BlogLi, BlogLink, BlogP, BlogUl} from "$cmp/pages/blog/BlogUl";
import {BASE_PATH} from "$config";
import {BlogImage} from "$cmp/pages/blog/BlogImage";


export const _easyplay1sMetadata: BlogMetadata = {
    title: "🎹 EASYPLAY 1s",
    tags: ["Product"],
    relativeUrl: "easyplay-1s",
    image: BASE_PATH + '/assets/blog/easyplay.webp',
    description: "The EASYPLAY 1s, the perfect keyboard for Sky Music Nightly",
    createdAt: new Date("2024/04/24"),
    author: SpecyAuthor,
}


export default function Easyplay1sPageBlog() {
    return <BaseBlogPost metadata={_easyplay1sMetadata}>
        <Header>
            What it is
        </Header>

        <BlogP>
            The EASYPLAY 1s is a keyboard that uses the same layout as Sky Music Nightly, and you can use it in the app
            to help you
            to compose songs and to learn them. <BlogLink external href={'https://summertones-1.kckb.me/18287a61'}>You
            can find the keyboard on kickstarter here</BlogLink>.
        </BlogP>
        <BlogLink href={'https://summertones-1.kckb.me/18287a61'}>
            <BlogImage
                src={BASE_PATH + '/assets/blog/easyplay.webp'}
                alt={'Easyplay 1S'}
                height={'15rem'}
            />
        </BlogLink>
        <Header>
            The features
        </Header>
        <BlogP>
            It is a MIDI keyboard which uses the same layout as Sky Music Nightly, the main features are:
        </BlogP>
        <BlogUl>
            <BlogLi>20 instruments, most of which can be sustained</BlogLi>
            <BlogLi>4 octaves of pitch change</BlogLi>
            <BlogLi>Adjustable volume through a speaker and an headphone jack</BlogLi>
            <BlogLi>MIDI support through USB-C</BlogLi>
        </BlogUl>
        <BlogP>
            It's made out of translucent black plastic with replaceable keycaps and rubber pads to prevent slipping.

        </BlogP>
        <Header>
            Demo video
        </Header>
        <BlogIframe src={'https://www.youtube.com/embed/l64Qdm-FpVU?si=NmbU0nVSrLlWTsBh'}/>
        <BlogP>
            If you are interested, <BlogLink external href={'https://summertones-1.kckb.me/18287a61'}>you can find the
            keyboard on kickstarter here</BlogLink>.
        </BlogP>
    </BaseBlogPost>
}

