import {keyBinds} from "$stores/KeybindsStore";
import {useConfig} from "$lib/Hooks/useConfig";
import {useObservableMap} from "$lib/Hooks/useObservable";
import {Key, ShortcutsTable} from "$cmp/pages/Index/HelpTab/ShortcutsHelp";
import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {BlogB, BlogLi, BlogOl, BlogP} from "$cmp/pages/blog/BlogUl";
import {Header} from "$cmp/shared/header/Header";
import {BlogImage} from "$cmp/pages/blog/BlogImage";
import {AppLink} from "$cmp/shared/link/AppLink";
import {BASE_PATH} from "$config";

export const _howUseVsrgComposer: BlogMetadata = {
    title: "🥁 How to use the VSRG composer",
    author: SpecyAuthor,
    description: "Learn how to use the VSRG composer to create beatmaps of a song",
    createdAt: new Date("2024/03/19"),
    tags: ["Guide"],
    image: "/assets/blog/help-vsrg-composer.webp",
    relativeUrl: "how-to-use-vsrg-composer"
}


export default function BlogPost() {
    const keys = keyBinds.getVsrgKeybinds(6)
    const {IS_MOBILE} = useConfig()
    const [vsrgComposerShortcuts] = useObservableMap(keyBinds.getShortcutMap("vsrg_composer"))
    return <>
        <BaseBlogPost metadata={_howUseVsrgComposer}>
            <BlogP>
                This is a composer to create beatmaps for the songs you have in the app.
                You select a song you want to create the beatmap for, and then place notes in the canvas.
                Each note you place can also play a sound, you can even fully compose a song in the VSRG composer
                (VSRG means "Vertically Scrolling Rhythm Game").
                Once created, you or whoever has the beatmap, can play the song with the <AppLink href={'/vsrg-player'}>VSRG
                player</AppLink>.
                You will have to press the notes in time to earn more points.
            </BlogP>
            <Header margin={'1rem 0'}>
                How to setup a beatmap
            </Header>
            <BlogP>
                When creating a beatmap, you first have to choose which song the beatmap is for, and set some settings
                related to it.
                Let's start off exploring all the settings in the VSRG composer!
            </BlogP>
            <BlogImage src={BASE_PATH + '/assets/blog/help-vsrg-composer-2.webp'} alt={'VSRG composer settings'}/>
            <BlogOl>
                <BlogLi>
                    <BlogB>Keys</BlogB>: This is the number of tracks you want the beatmap to have, choose this wisely
                    as changing it
                    after
                    you already made most of the beatmap might be difficult. A beatmap with less tracks might be easier
                    to play, but harder
                    to compose.
                </BlogLi>
                <BlogLi>
                    <BlogB> BPM </BlogB>: The bpm of the beatmap, it is used to give you guiding "columns" where to
                    place notes, in the
                    composer you can
                    also select the "snap points" from 1/1 to 1/16 of the bpm. The BPM of the beatmap should either be
                    the same
                    of the song, or 1/2th or 1/4th of it
                </BlogLi>
                <BlogLi>
                    <BlogB>Base pitch</BlogB>: This is the base pitch of the instruments of the beatmap, you can use the
                    instruments to
                    play sounds when
                    a note is pressed.
                </BlogLi>
                <BlogLi>
                    <BlogB>Difficulty</BlogB>: This is just a number that will be used for the points in your beatmap,
                    it's your choice
                    what difficulty to give.
                </BlogLi>
                <BlogLi>
                    <BlogB>Vertical Editor</BlogB>: With this you can decide if either having the editor be oriented
                    vertically or
                    horizontally, it doesn't affect the beatmap.
                </BlogLi>
                <BlogLi>
                    <BlogB>Max FPS</BlogB>: When you "play" the beatmap inside the editor, it moves at a certain FPS,
                    high values might
                    make the editor
                    look smoother, but give a bit of inaccuracies in the audio, find a value that is best for your
                    device, it doesn't affect the beatmap.
                </BlogLi>
                <BlogLi>
                    <BlogB>Snap scroll to snap point</BlogB>: When this is enabled, once you release your mouse/finger
                    from moving the
                    canvas, it will "snap" to the closest
                    snap point it can find.
                </BlogLi>
                <BlogLi>
                    <BlogB>Auto save changes</BlogB>: Auto saves the changes to a song every 5 edits.
                </BlogLi>
                <BlogLi>
                    <BlogB>Background song</BlogB>: Here you can select which of your songs will be used as a background
                    for the
                    beatmap, look further for more info about
                    this section.
                </BlogLi>
            </BlogOl>
            <BlogP>
                When you select a song for a beatmap, you can decide which layers to include in the final song, one good
                reason for this
                is to mute a specific layer that you are going to replace with the beatmap instrument, making the song
                seem
                more interctive.
                You can also "show" the notes of the layers inside of the editor, to more easily guide you where to
                place
                notes
            </BlogP>
            <BlogImage
                src={"/assets/blog/help-vsrg-composer-3.webp"}
                alt="VSRG song settings"
            />
            <BlogOl>
                <BlogLi>
                    Deselects this song from the beatmap
                </BlogLi>
                <BlogLi>
                    Hides the layer in the editor
                </BlogLi>
                <BlogLi>
                    Mutes the layer
                </BlogLi>
            </BlogOl>

            <Header margin={'1rem 0'}>
                How to use the composer
            </Header>
            <BlogP>
                Once finished setting up the song and settings, you can start actually composing the beatmap.
                To do actions on the canvas you can click the boxes, you have 3 actions you can do, add a "tap" hit
                object,
                add a "held" hit object, or remove one.
                You can select which of the 3 actions you want to do by pressing the selector on the bottom left.
            </BlogP>
            <BlogImage
                src={"/assets/blog/help-vsrg-composer.webp"}
                alt="tutorial for the vsrg composer page"
            />
            <BlogOl>
                <BlogLi>This is the currently selected hit object, you can drag it around and change the notes that will
                    be played when that note is pressed.</BlogLi>
                <BlogLi>This is a held hit object, the person who will play the song will have to hold the button
                    instead of just tapping it.</BlogLi>
                <BlogLi>This is the timeline, you will be shown the notes of the song you selected so that you can more
                    easily place hit objects in your beatmap.</BlogLi>
                <BlogLi>
                    This is the layer selection, a hit object is going to be part of a layer, each layer can have a
                    different color and a different instrument.
                    When you want to create a hit object of that layer, select the layer and then press on the canvas to
                    create it.
                </BlogLi>
                <BlogLi>You can assign notes to a hit object, you need to select a hit object and then will be able to
                    assign notes to it. Whenever
                    the hit object will be pressed, the sound will be played.</BlogLi>
                <BlogLi>The action to execute whenever you tap, either create a new tap hit object, a held hit object,
                    or delete the hit object that you click</BlogLi>
                <BlogLi>With this slider you can choose how much to "scale" the beatmap, to make it easier to view the
                    whole beatmap</BlogLi>
                <BlogLi>Select the playback speed of the song, it's useful to listen more carefully to a song when
                    composing</BlogLi>
                <BlogLi>Select how many snap points you want to create, 1/1 is one snap point per BPM, 1/2, ..., 1/16 is
                    to place more snap points between 1 BPM unit.
                    Every unit's BPM snap point will have a different color than the inner BPM snap points.
                </BlogLi>
                <BlogLi>Current timestamp in the timeline.</BlogLi>
                <BlogLi>Add/Remove or move between the breakpoints of the beatmap, they are sections which you can more
                    easily jump to</BlogLi>
            </BlogOl>
            {!IS_MOBILE && <>
                <Header margin={'1rem 0'}>
                    VSRG Composer shortcuts
                </Header>

                <BlogP>
                    The VSRG composer has some shortcuts you can use, if you want to change them, go to the <AppLink
                    href={'/keybinds'}>keybinds page</AppLink>
                </BlogP>
                <ShortcutsTable shortcuts={vsrgComposerShortcuts}/>
                <div className='row' style={{padding: '0.1rem', gap: "1rem", marginTop: "-0.1rem"}}>
                    <Key>{keys.join("/")}</Key>
                    <div> Add hit object (syncs to the registered keybinds)</div>
                </div>

            </>}
        </BaseBlogPost>
    </>
}