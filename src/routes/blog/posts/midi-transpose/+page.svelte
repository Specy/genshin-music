<script lang="ts">
    import {base} from '$app/paths'
    import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte'
    import BlogImage from '$cmp/blog/BlogImage.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import Header from '$cmp/header/Header.svelte'
    import {midiTransposeMetadata} from '$cmp/blog/posts/midi-transpose'

    // Old: src/app/_client-pages/blog/posts/midi-transpose.tsx (107 lines). BlogP/BlogOl/BlogLi ->
    // native tags; raw AppLink (not BlogLink) -> plain AppLink, no blog-link class/target. Content:
    // 3 headers, 3 paragraphs, 3 images, 2 ordered lists (9 + 2 items), 2 internal links.
    //
    // PRESERVED QUIRK: the "Now click..." paragraph is NOT wrapped in a <BlogP> in the old file -
    // it's a bare text node (with one inline AppLink) sitting directly under <BaseBlogPost>'s
    // <article>, unlike every other paragraph in this post. Reproduced exactly: no <p>/blog-p
    // class around that one block below.
</script>

<BaseBlogPost metadata={midiTransposeMetadata}>
    <p class="blog-p">
        If you want to compose a song but you don't want to start from 0, you can try to find a MIDI file for the
        song
        and use the MIDI transposing tools to convert it into a music sheet.
    </p>

    <Header margin="1rem 0">
        Open a MIDI file
    </Header>
    <p class="blog-p">

        Once you found your MIDI file, visit the <AppLink href="/composer">composer</AppLink> and open the song
        menu.
    </p>
    Now click the "Create from MIDI/Audio", it will open the MIDI transposition tool, and select your file after
    pressing the
    "Open MIDI/Audio/Video file" button. If you want to import a video or audio file instead, visit the <AppLink
    href="/blog/posts/video-audio-transpose"> Audio transpose guide </AppLink>.
    <BlogImage src="{base}/assets/blog/midi-btn.webp" alt="MIDI button" />
    <Header margin="1rem 0">
        Transpose a MIDI file
    </Header>
    <p class="blog-p">
        After having selected the file, you can start changing the import settings to best convert the song to the
        app sheet.
        The MIDI song doesn't perfectly match the music sheet of the app, so you will have to adjust the settings to
        best fit the song.
    </p>

    <BlogImage src="{base}/assets/blog/midi-1.webp" alt="MIDI import settings" />
    <ol class="blog-ol">
        <li>This is the button to press to select the MIDI file.</li>
        <li>
            Here you can select the BPM of the imported song, usually a higher value is preferred, as it leads
            to a better
            conversion accuracy. By default it uses 4 times the song's BPM.
        </li>
        <li>
            The note offset is the amount by which notes are "pushed" one note up or down, this is useful when
            the original song is in a
            different pitch, or in a scale that doesn't match the music sheet. This is a value that is applied to
            all tracks, they can then be manually overridden.
        </li>
        <li>This is the default pitch of the song, it will be applied to all instruments.</li>
        <li>The app's keyboard is made up only of non-accidental notes, by selecting this, all the "accidental"
            notes
            will be pushed one note down, to try to "adapt" the notes to the keyboard. This not always sounds good,
            so try to turn it
            on or off to check which is better.</li>
        <li>
            This removes all MIDI tracks which have no notes inside of it, for example, the item at number (7) has
            no notes, so it will be ignored.
        </li>
        <li>
            This checkbox decides if to include the track in the conversion or not, next to it there is the name of
            the track, the number of notes inside
            of it, and the instrument that it uses.
        </li>
        <li>
            Here you can select the name of the instrument that you want to use for this track.
        </li>
        <li>
            This opens the setting of the track, where you can see more information, and override the global values.
        </li>
    </ol>
    <BlogImage src="{base}/assets/blog/midi-2.webp" alt="MIDI track settings" />
    <ol class="blog-ol">
        <li>
            With this you can override the note offset that you wrote in the global settings, leave it blank to use
            the same
            value of the global offset
        </li>
        <li>
            When a note goes over the visible notes of the app, with this value you specify how many times the notes
            should be
            tried to be "scaled down" by one octave (8 notes), this might allow you to fit more notes of a track,
            and make it sound
            better.
        </li>
    </ol>
</BaseBlogPost>
