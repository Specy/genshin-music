import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {BlogImage} from "$cmp/pages/blog/BlogImage";
import {Header} from "$cmp/shared/header/Header";
import {AppLink} from "$cmp/shared/link/AppLink";
import {BlogLi, BlogOl, BlogP} from "$cmp/pages/blog/BlogUl";


export const _midiTransposeMetadata: BlogMetadata = {
    title: "🎛️ MIDI music transposition",
    relativeUrl: "midi-transpose",
    tags: ["Guide"],
    image: '/assets/blog/midi-1.webp',
    description: "Use MIDI songs to transpose music into the app's sheet",
    createdAt: new Date("2024/03/19"),
    author: SpecyAuthor,

}


export default function BlogPage() {
    return <BaseBlogPost metadata={_midiTransposeMetadata}>
        <BlogP>
            If you want to compose a song but you don't want to start from 0, you can try to find a MIDI file for the
            song
            and use the MIDI transposing tools to convert it into a music sheet.
        </BlogP>

        <Header margin={'1rem 0'}>
            Open a MIDI file
        </Header>
        <BlogP>

            Once you found your MIDI file, visit the <AppLink href={'/composer'}>composer</AppLink> and open the song
            menu.
        </BlogP>
        Now click the "Create from MIDI/Audio", it will open the MIDI transposition tool, and select your file after
        pressing the
        "Open MIDI/Audio/Video file" button. If you want to import a video or audio file instead, visit the <AppLink
        href={'/blog/posts/ai-transpose'}> Ai transpose guide </AppLink>.
        <BlogImage src={'/assets/blog/midi-btn.webp'} alt={"MIDI button"}/>
        <Header margin={'1rem 0'}>
            Transpose a MIDI file
        </Header>
        <BlogP>
            After having selected the file, you can start changing the import settings to best convert the song to the
            app sheet.
            The MIDI song doesn't perfectly match the music sheet of the app, so you will have to adjust the settings to
            best fit the song.
        </BlogP>

        <BlogImage src={'/assets/blog/midi-1.webp'} alt={"MIDI import settings"}/>
        <BlogOl>
            <BlogLi>This is the button to press to select the MIDI file.</BlogLi>
            <BlogLi>
                Here you can select the BPM of the imported song, usually a higher value is preferred, as it leads
                to a better
                conversion accuracy. By default it uses 4 times the song's BPM.
            </BlogLi>
            <BlogLi>
                The note offset is the amount by which notes are "pushed" one note up or down, this is useful when
                the original song is in a
                different pitch, or in a scale that doesn't match the music sheet. This is a value that is applied to
                all tracks, they can then be manually overridden.
            </BlogLi>
            <BlogLi>This is the default pitch of the song, it will be applied to all instruments.</BlogLi>
            <BlogLi>The app's keyboard is made up only of non-accidental notes, by selecting this, all the "accidental"
                notes
                will be pushed one note down, to try to "adapt" the notes to the keyboard. This not always sounds good,
                so try to turn it
                on or off to check which is better.</BlogLi>
            <BlogLi>
                This removes all MIDI tracks which have no notes inside of it, for example, the item at number (7) has
                no notes, so it will be ignored.
            </BlogLi>
            <BlogLi>
                This checkbox decides if to include the track in the conversion or not, next to it there is the name of
                the track, the number of notes inside
                of it, and the instrument that it uses.
            </BlogLi>
            <BlogLi>
                Here you can select the name of the instrument that you want to use for this track.
            </BlogLi>
            <BlogLi>
                This opens the setting of the track, where you can see more information, and override the global values.
            </BlogLi>
        </BlogOl>
        <BlogImage src={'/assets/blog/midi-2.webp'} alt={"MIDI track settings"}/>
        <BlogOl>
            <BlogLi>
                With this you can override the note offset that you wrote in the global settings, leave it blank to use
                the same
                value of the global offset
            </BlogLi>
            <BlogLi>
                When a note goes over the visible notes of the app, with this value you specify how many times the notes
                should be
                tried to be "scaled down" by one octave (8 notes), this might allow you to fit more notes of a track,
                and make it sound
                better.
            </BlogLi>
        </BlogOl>
    </BaseBlogPost>
}