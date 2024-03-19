import {BlogMetadata} from "$pages/blog/types";
import {BaseBlogPost} from "$cmp/pages/blog/BaseBlogPost";
import {Header} from "$cmp/shared/header/Header";
import Link from "next/link";
import {AppLink} from "$cmp/shared/link/AppLink";


export const _aiTransposeMetadata: BlogMetadata = {
    title: "🔬 AI music video/audio transposition",
    relativeUrl: "ai-transpose",
    image: '/assets/blog/midi-btn.webp',
    description: "Use the AI feature in the composer to (try to) convert a song/video into a music sheet. This is a experimental feature",
    createdAt: new Date(),
}


export default function TestPage() {
    return <BaseBlogPost metadata={_aiTransposeMetadata}>
        In the V3.3 release, a new experimental feature has been added that allows you to convert any video/audio into a
        sheet, by first
        converting it to MIDI, by using <AppLink href={'https://basicpitch.spotify.com/'}> Spotify&apos;s Basic
        Pitch </AppLink>.
        <Header type={'h1'} margin={'1rem 0'}>
            Warnings
        </Header>
        This feature is to be used only as a last resort after you cannot find a MIDI song to transpose, or you can't do
        it by hand.
        It is not meant to create a perfect transposition, as the conversion is very difficult, but mostly as a starting
        point to
        help you transpose a song manually.
        <Header type={'h1'} margin={'1rem 0'}>
            Best practices
        </Header>
        It is best if you can find a video/audio of a song that uses a single instrument, the piano is the easiest to
        convert. Even
        better if there is no background noise.
        <Header type={'h1'} margin={'1rem 0'}>
            How to
        </Header>
        The transposition steps are very similar to the ones of MIDI transposition, if you want to see how to do that,
        visit the <AppLink href={'/blog/posts/midi-transpose'}> MIDI transposition guide </AppLink>. You have to open
        the MIDI conversion tool, and select the audio/video file by clicking the file selection button "Open MIDI/Audio/Video file"
    </BaseBlogPost>
}