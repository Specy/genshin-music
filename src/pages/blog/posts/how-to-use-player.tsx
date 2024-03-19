import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost} from "$cmp/pages/blog/BaseBlogPost";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";
import {BlogImage} from "$cmp/pages/blog/BlogImage";
import {APP_NAME} from "$config";
import {BlogLi, BlogOl} from "$cmp/pages/blog/BlogUl";
import {ShortcutsTable} from "$cmp/HelpTab/ShortcutsHelp";
import {useConfig} from "$lib/Hooks/useConfig";
import {useObservableMap} from "$lib/Hooks/useObservable";
import {keyBinds} from "$stores/KeybindsStore";

export const _playerTutorialMetadata: BlogMetadata = {
    title: "🎵 How to use the player",
    relativeUrl: "how-to-use-player",
    image: '/assets/blog/help-player.webp',
    description: "This is a guide to help you learn how to use the player to learn, record and play songs!",
    createdAt: new Date("2024/03/19"),
}


export default function BlogPage() {
    const {IS_MOBILE} = useConfig()
    const [playerShortcuts] = useObservableMap(keyBinds.getShortcutMap("player"))

    return <BaseBlogPost metadata={_playerTutorialMetadata}>
        The player is meant to help you record a song by hand or practice an existing song with the two
        practice tools. <br/>
        You can also import sheets made in the app / record audio of the keyboard and play freely, you also have a
        metronome to help you
        with the tempo. <br/>
        If you want a simpler keyboard you can use the <AppLink href={'/zen-keyboard'}>Zen keyboard</AppLink> which has
        all the instruments and pitch settings, but bigger keyboard and simpler interface.<br/>
        In the settings you can change the instrument, pitch, reverb, volume, keyboard size, etc...

        If you have a MIDI keyboard, you can connect it to your device, follow the <AppLink href={'/blog/connect-midi-device'}>MIDI device </AppLink>
        <Header margin={'1rem 0'}>
            How to
        </Header>
        {APP_NAME !== "Genshin" && <span>
            The images below are from the genshin version of the app, but the functionality is the same
        </span>}

        <BlogImage src={'/assets/blog/help-player.webp'} alt={"Player UI"} />
        <BlogOl>
            <BlogLi>Pressing this button will start an audio recording, everything you play from that moment will be
                recorded, then downloaded as an audio file </BlogLi>
            <BlogLi>When you start practicing or playing a song, this bar on the left will tell you the progress of the
                song. You can move the start and end markers to set where to make the song/practice start and
                end</BlogLi>
            <BlogLi>This selects the playback speed of the song, useful when you are trying to play along with the
                approaching
                circles learning tool</BlogLi>
            <BlogLi>Together with point (2), this will restart the song from the selected start point</BlogLi>
            <BlogLi>When in practice mode, this is a note that you should press now. When this note appears, it will
                fade
                in red, when the fade in finishes, it will indicate the moment when you should press the note to stay in
                tempo</BlogLi>
            <BlogLi>This indicator tells you that this note will be pressed after you finished pressing all the current
                red
                notes.</BlogLi>
            <BlogLi>This opens the song library, it's a small library made years ago by the sky music community</BlogLi>
            <BlogLi>View your songs</BlogLi>
            <BlogLi>Opens the menu of the app where you can go to all the other pages</BlogLi>
            <BlogLi>Visual sheet of the song</BlogLi>
        </BlogOl>
        <BlogImage src={'/assets/blog/help-player-2.webp'} alt={"Player menu help"}  />
        When you open the "song menu", you will be shown this window. Your songs will be split between recorded and composed
        songs. The recorded songs are the ones which were recorded by hand, the composed songs are the ones which were composed using
        the <AppLink href={'/composer'}>composer</AppLink>.
        Here you can select the song to play/practice. Or download, change, rename and move between your folders.
        <BlogOl>
            <BlogLi>
                This is a song that you have saved in the app, by pressing the song name, you will start playing the song.
            </BlogLi>
            <BlogLi>
                Pressing this button will start the song practice, the notes will become red, showing which notes you have to
                press in that moment. This should be used to learn a song, you can select sections to replay by using the
                notes selection bar on the right.
            </BlogLi>
            <BlogLi>
                Pressing this button will start the second kind of practice, the approaching circles, circles will appear coming
                towards the note, once they reach it, you should press the note. This is meant to be used once you are more
                comfortable with the song, it is harder to play compared to the practice mode, but will test your muscle memory.
            </BlogLi>
            <BlogLi>
                Opens the menu for that song, showing options to rename, move to a folder, edit, download and delete the song.
            </BlogLi>
            <BlogLi>
                By clicking this you can select in which folder to move this song.
            </BlogLi>
            <BlogLi>
                Those two are the download buttons, the first one is the suggested one to share it with other people, or to backup your
                songs. The second one downloads the song as a MIDI song, this will convert it to MIDI, but it will cause some information
                to be lost, as MIDI cannot store some information that is needed by the app, use it only if you need to import it in another
                app which is not this one.
            </BlogLi>
        </BlogOl>
        {!IS_MOBILE && <>
            <Header type={'1rem 0'}>
                Player shortcuts
            </Header>
            The player has some shortcuts you can use, if you want to change them, go to the <AppLink
            href={'/keybinds'}>keybinds page</AppLink>
            <ShortcutsTable shortcuts={playerShortcuts} style={{marginTop: '1rem'}}/>
        </>
        }
    </BaseBlogPost>
}
