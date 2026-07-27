<script lang="ts">
    import {base} from '$app/paths'
    import {APP_NAME} from '$core/legacyConfig'
    import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte'
    import BlogImage from '$cmp/blog/BlogImage.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import Header from '$cmp/header/Header.svelte'
    import {shortcutsTable} from '$cmp/pages/ShortcutsTable.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {playerTutorialMetadata} from '$cmp/blog/posts/how-to-use-player'

    const playerShortcuts = keyBinds.getShortcutMap('player')
</script>

<BaseBlogPost metadata={playerTutorialMetadata}>
    <p class="blog-p">

        The player is meant to help you record a song by hand or practice an existing song with the two
        practice tools. <br />
        You can also import sheets made in the app / record audio of the keyboard and play freely, you also have a
        metronome to help you
        with the tempo. <br />
        If you want a simpler keyboard you can use the <AppLink href="/zen-keyboard">Zen keyboard</AppLink> which
        has
        all the instruments and pitch settings, but bigger keyboard and simpler interface.<br />
        In the settings you can change the instrument, pitch, reverb, volume, keyboard size, etc...

        If you have a MIDI keyboard, you can connect it to your device, follow the <AppLink
        href="/blog/connect-midi-device">MIDI device </AppLink>
        <!-- QUIRK: /blog/connect-midi-device above is a broken link (missing /posts/) - same
             preserved bug as how-to-use-composer.tsx's equivalent link. -->
    </p>

    <Header margin="1rem 0">
        How to use the player
    </Header>
    {#if APP_NAME !== 'Genshin'}
        <p class="blog-p">
            The images below are from the genshin version of the app, but the functionality is the same
        </p>
    {/if}
    <BlogImage src="{base}/assets/blog/help-player.webp" alt="Player UI" />
    <ol class="blog-ol">
        <li>Pressing this button will start an audio recording, everything you play from that moment will be
            recorded, then downloaded as an audio file </li>
        <li>When you start practicing or playing a song, this bar on the left will tell you the progress of the
            song. You can move the start and end markers to set where to make the song/practice start and
            end</li>
        <li>This selects the playback speed of the song, useful when you are trying to play along with the
            approaching
            circles learning tool</li>
        <li>Together with point (2), this will restart the song from the selected start point</li>
        <li>When in practice mode, this is a note that you should press now. When this note appears, it will
            fade
            in red, when the fade in finishes, it will indicate the moment when you should press the note to stay in
            tempo</li>
        <li>This indicator tells you that this note will be pressed after you finished pressing all the current
            red
            notes.</li>
        <li>This opens the song library, it's a small library made years ago by the sky music community</li>
        <li>View your songs</li>
        <li>Opens the menu of the app where you can go to all the other pages</li>
        <li>Visual sheet of the song</li>
    </ol>
    <BlogImage src="{base}/assets/blog/help-player-2.webp" alt="Player menu help" />
    <p class="blog-p">
        When you open the "song menu", you will be shown this window. Your songs will be split between recorded and
        composed
        songs. The recorded songs are the ones which were recorded by hand, the composed songs are the ones which
        were
        composed using
        the <AppLink href="/composer">composer</AppLink>.
        Here you can select the song to play/practice. Or download, change, rename and move between your folders.
    </p>
    <ol class="blog-ol">
        <li>
            This is a song that you have saved in the app, by pressing the song name, you will start playing the
            song.
        </li>
        <li>
            Pressing this button will start the song practice, the notes will become red, showing which notes you
            have to
            press in that moment. This should be used to learn a song, you can select sections to replay by using
            the
            notes selection bar on the right.
        </li>
        <li>
            Pressing this button will start the second kind of practice, the approaching circles, circles will
            appear coming
            towards the note, once they reach it, you should press the note. This is meant to be used once you are
            more
            comfortable with the song, it is harder to play compared to the practice mode, but will test your muscle
            memory.
        </li>
        <li>
            Opens the menu for that song, showing options to rename, move to a folder, edit, download and delete the
            song.
        </li>
        <li>
            By clicking this you can select in which folder to move this song.
        </li>
        <li>
            Those two are the download buttons, the first one is the suggested one to share it with other people, or
            to backup your
            songs. The second one downloads the song as a MIDI song, this will convert it to MIDI, but it will cause
            some information
            to be lost, as MIDI cannot store some information that is needed by the app, use it only if you need to
            import it in another
            app which is not this one.
        </li>
    </ol>
    <Header margin="1rem 0">
        Player settings
    </Header>
    <BlogImage src="{base}/assets/blog/help-player-3.webp" alt="Player settings" />
    <ol class="blog-ol">
        <li>
            <b class="blog-b">Instrument</b>: This is the instrument of the keyboard, you can change the volume
        </li>
        <li>
            <b class="blog-b">Pitch</b>: This is the pitch of the instrument
        </li>
        <li>
            <b class="blog-b">BPM</b>: The BPM which will be saved when you record the song, also used for the
            metronome
        </li>
        <li>
            <b class="blog-b">Auto sync the song's instrument and pitch</b>: When selecting a song to play, change the
            current instrument and pitch
            to match the song
        </li>
        <li>
            <b class="blog-b">Metronome beats</b>: Set how many beats to use in the metronome, every nth beats there
            will be a different sound played
        </li>
        <li>
            <b class="blog-b">Metronome volume</b>: The volume of the metronome
        </li>
        <li>
            <b class="blog-b">Reverb (cave mode)</b>: Sets if the instrument should use reverb or not.
        </li>
        <li>
            <b class="blog-b">Note name type</b>: Sets the kind of text to show inside of the note
        </li>
        <li>
            <b class="blog-b">Keyboard size</b>: Scales the size of the keyboard up/down
        </li>
        <li>
            <b class="blog-b">Keyboard vertical position</b>: Pushes the keyboard up or down
        </li>
        <li>
            <b class="blog-b">Approach rate</b>: When playing the "approaching circles" mode, this is how many ms the note
            will take from when it appears, to when it should be pressed.
        </li>
        <li>
            <b class="blog-b">Note animation</b>: Show an animation when you press the note
        </li>
        <li>
            <b class="blog-b">Show visual sheet</b>: Show the visual sheet above the keyboard. This helps to visualize the
            notes that are about to be played. Useful both in practice and playback of a song.
        </li>
    </ol>
    {#if !globalConfigStore.state.IS_MOBILE}
        <Header>
            Player shortcuts
        </Header>
        <p class="blog-p">
            The player has some shortcuts you can use, if you want to change them, go to the <AppLink
            href="/keybinds">keybinds page</AppLink>
        </p>
        {@render shortcutsTable(playerShortcuts, 'margin-top:1rem')}
    {/if}
</BaseBlogPost>
