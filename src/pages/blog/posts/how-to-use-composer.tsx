import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";
import {BlogImage} from "$cmp/pages/blog/BlogImage";
import {APP_NAME, BASE_PATH} from "$config";
import {BlogB, BlogLi, BlogOl, BlogP} from "$cmp/pages/blog/BlogUl";
import {ShortcutsTable} from "$cmp/pages/Index/HelpTab/ShortcutsHelp";
import {useConfig} from "$lib/Hooks/useConfig";
import {useObservableMap} from "$lib/Hooks/useObservable";
import {keyBinds} from "$stores/KeybindsStore";
import {NoteLayer} from "$lib/Songs/Layer";

export const _composerTutorialMetadata: BlogMetadata = {
    title: "📀 How to use the composer",
    tags: ["Guide"],
    relativeUrl: "how-to-use-composer",
    image: BASE_PATH + '/assets/blog/help-composer.webp',
    description: "This is a guide to help you learn how to use the song composer to create and edit songs!",
    createdAt: new Date("2024/03/19"),
    author: SpecyAuthor,

}


export default function BlogPage() {
    const {IS_MOBILE} = useConfig()
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))

    return <BaseBlogPost metadata={_composerTutorialMetadata}>
        <BlogP>
            The composer is made to help you create and edit songs, it allows you to use multiple instruments, each of
            them
            with
            different pitches, reverb, volume etc... <br/>
            It is a simple music DAW with which you can even create rather complex songs (there will be some examples
            after)
        </BlogP>
        {APP_NAME !== "Genshin" && <BlogP>
            The images below are from the genshin version of the app, but the functionality is the same
        </BlogP>}
        <BlogImage src={BASE_PATH + '/assets/blog/help-composer.webp'} alt={"Composer UI"}/>
        <BlogOl>
            <BlogLi>Go to the next / previous breakpoint, a breakpoint can be added from the button in the timeline,
                it's
                a marker that you will be able to "jump" to</BlogLi>
            <BlogLi>This is a "timeline" where all breakpoints will be shown, the window inside of it shows you how the
                piece
                of the song which is currently visible in the composer canvas. You can drag this window to quickly move
                inside
                the song</BlogLi>
            <BlogLi>Opens the tools, there will be more information about them in this post</BlogLi>
            <BlogLi>Adds 16 columns at the end of the song, a column is the unit of time where you can place
                notes</BlogLi>
            <BlogLi>Remove the current selected column</BlogLi>
            <BlogLi>Adds a column after the current one</BlogLi>
            <BlogLi>Layer selection, here you can select your current layer, and create/remove other ones. Each layer
                can
                have a different instrument, pitch, reverb, volume, etc...<br/>To make it easier to distinguish between
                layers,
                each of them has a different icon inside the canvas, so you can identify more easily which note is part
                of what layer <br/>
            </BlogLi>
            <BlogLi>Those are the "tempo changers", they are meant to change the tempo of a single column. The number
                (1/2, 1/4, etc...) tells
                you how much that column is gonna last compared to the song's BPM. You can use it to have little
                "bursts" of quick notes, or also
                to make a whole section go faster. If you see yourself using a lot of them, it might be better to
                increase (double) the BPM of your song</BlogLi>
        </BlogOl>
        <Header>
            Composer Tools
        </Header>
        <BlogP>

            The composer has useful tools that you can use to make it easier to edit/compose a song. <br/>
            A very useful tool is the MIDI conversion, which transposes a MIDI song into a format that can be used
            in the app. For more info on how to use it, go to the <AppLink href={'/blog/midi-conversion'}>Midi
            conversion
            guide</AppLink>.
            Also similar is a video/audio transposer, find more info in the <AppLink href={'/blog/ai-conversion'}>Audio
            conversion guide</AppLink>.
        </BlogP>
        <BlogP>
            This next tools are the ones available by clicking the "tools" button on the right of the composer
        </BlogP>
        <BlogImage src={BASE_PATH + '/assets/blog/help-composer-2.webp'} alt={"Composer tools UI"}/>
        <BlogOl>
            <BlogLi>
                This is the currently selected columns, the initial operations like copy/erase/delete will be applied to
                them.
                You can select more columns by moving the canvas to the left/right, if you want to clear the selection,
                press the
                "clear selection" button on the right. This mode is called the "selection" mode.
            </BlogLi>
            <BlogLi>
                With this you can decide to which layers to apply those tools, you can either select to make it apply to
                all layers,
                or only to the currently selected layer.
            </BlogLi>
            <BlogLi>
                The tools you view translucent are disabled untill you "copy" the notes in the columns with the copy
                button. Once you
                press the Copy button, the selection will be cleared and you will enter the "insert" mode, the next
                image will show you more info for it.
            </BlogLi>
            <BlogLi>
                The "erase" button will erase all the notes that are currently selected, if you selected all layers, it
                will
                clear the contents of the whole columns, while if you selected only one layer, it will clear the notes
                of that layer. < br/>
                The "move notes up/down" button will move the notes you selected one position up or down, be careful
                when a note is on the
                edges of the canvas, if they go "beyond" it, they will be deleted. You can always press "undo" to go
                back to the last edit <br/>
                the "delete" button is only available when all alyers are selected, it will delete all the selected
                columns.
            </BlogLi>
            <BlogLi>
                When you are in the selection mode, you can also press the tempo changers to set the tempo changer of
                that whole selection.
            </BlogLi>
        </BlogOl>
        <BlogImage src={BASE_PATH + '/assets/blog/help-composer-3.webp'} alt={"Composer tools selected notes UI"}/>
        <BlogP>
            Once having copied the notes you want, you will be inside the "insert" mode.
        </BlogP>
        <BlogOl>
            <BlogLi>
                Inserting will put the notes from the currently selected column, without creating new columns <br/>
                Pasting will create new columns (as many as needed) and paste inside of it, the notes you copied
                before.
            </BlogLi>
            <BlogLi>
                If you want to clear the current selection and select more notes, you can press the "clear selection"
                button,
                this will also make you exit the insert mode.
            </BlogLi>
        </BlogOl>
        <BlogImage src={BASE_PATH + '/assets/blog/help-composer-4.webp'} alt={"Composer settings"}/>
        <BlogP>
            Those are the settings of the composer, you can open it by pressing the settings button in the side menu
        </BlogP>
        <BlogOl>
            <BlogLi>
                <BlogP>Bpm</BlogP>: This setting will set the Beats Per Minute of the whole song, one column will last
                for as long as
                (60000ms / bpm), for example
                with a bpm of 200, one column will last for (60000ms / 200) = 300ms.
            </BlogLi>
            <BlogLi>
                <BlogB>Base pitch</BlogB>: This is the default pitch of all instruments, you can override the pitch of a
                single
                instrument inside the settings of the instrument.
            </BlogLi>
            <BlogLi>
                <BlogB>Beat marks</BlogB>: This will cut the canvas into 3 or 4 "sections" of 4 columns, you can use
                those to help
                yourself
                with the tempo of the song.
            </BlogLi>
            <BlogLi>
                <BlogB>Note name type</BlogB>: The name that the notes in the keyboard of the composer will use.
            </BlogLi>
            <BlogLi>
                <BlogB>Number of visible columns</BlogB>: The number of columns that will be visible at a time in the
                canvas. Warning,
                a high
                value might cause lags, if you have lag issues, try to reduce this value.
            </BlogLi>
            <BlogLi>
                <BlogB>Base reverb</BlogB>: This will enable reverb by default for all instruments in the song, you
                can override
                this in the
                instrument.
            </BlogLi>
            <BlogLi>
                <BlogB>Autosave changes</BlogB>: It will auto save the changes you applied to a song every 5 edits.
            </BlogLi>
            <BlogLi>
                <BlogB>Put next/previous column buttons around keyboard</BlogB>: This adds two buttons on the left and
                right of the
                keyboard that
                selects the previous and next columns.
            </BlogLi>
            <BlogLi>
                <BlogB>Autoplay in all tabs</BlogB>: This is a feature that will start/stop playing all your browser
                tabs that have the
                composer open.
            </BlogLi>
            <BlogLi>
                <BlogB>Lookahead time</BlogB>: To prevent lags from the app affecting audio, notes are "scheduled" to be
                played a few
                milliseconds before
                than they are actually played, this value will give the app a certain amount of time where lags in the
                app won't affect the
                audio timing accuracy. This will cause the audio to "lag behind" the canvas, you can reduce or disable
                this lookahead. If your audio
                stutters, try to increase this value.
            </BlogLi>
            <BlogLi>
                <BlogB>Connect MIDI keyboard</BlogB>: You can use a MIDI keyboard to make it easier to compose a song,
                by using the
                keyboard to select/deselect notes.
                <br/> If you want to know how to connect your MIDI keyboard, follow the <AppLink
                href={'/blog/connect-midi-device'}>connect MIDI device</AppLink> guide.
            </BlogLi>
        </BlogOl>
        <BlogImage src={BASE_PATH + '/assets/blog/help-composer-5.webp'} alt={"Instrument settings"}/>
        <BlogP>
            This is the layer settings, on the left there is the layer selection, the highlighted one is the currently
            selected
            layer, to create a new layer, press the "+" button. The icon on the top right is the same icon used inside
            the
            canvas for that
            instrument, you can have as many as {NoteLayer.MAX_LAYERS} layers
        </BlogP>
        <BlogOl>
            <BlogLi>
                Opens the settings menu of this layer.
            </BlogLi>
            <BlogLi>
                Toggles the visibility of this layer inside the canvas. If the layer is hidden, when it is deselected,
                the notes
                of this layer won't be visible inside the canvas.
            </BlogLi>
            <BlogLi>
                This is the name of the layer which you will be able to see in the layer selection, if left empty, it
                will show the
                instrument name.
            </BlogLi>
            <BlogLi>
                This is the instrument of this layer.
            </BlogLi>
            <BlogLi>
                This is the pitch of this instrument, leave it as "Use song pitch" to use whichever pitch the song is
                using.
            </BlogLi>
            <BlogLi>
                This is the reverb selection, it will set the instrument to have or not the reverb, leave it to "Use
                song reverb" to
                use the value of the song is using.
            </BlogLi>
            <BlogLi>
                This lets you choose which icon you want to see inside the canvas for this instrument. As there are only
                a few icons,
                those will have to be repeated in case you have many instruments.
            </BlogLi>
            <BlogLi>
                This will let you choose the volume for this instrument, a higher value might cause distortions in the
                audio. If you hear
                distortions, try to lower the volume of the instrument. You can also press the "mute" button to mute
                this instrument.
            </BlogLi>
            <BlogLi>
                This will move the layer one position up or down, just used to organise layers.
            </BlogLi>
        </BlogOl>
        {!IS_MOBILE && <>
            <Header margin={'1rem 0'}>
                Composer shortcuts
            </Header>
            <BlogP>
                The composer has some shortcuts you can use, if you want to change them, go to the <AppLink
                href={'/keybinds'}>keybinds page</AppLink>
            </BlogP>
            <ShortcutsTable shortcuts={composerShortcuts} style={{marginTop: '1rem'}}/>
        </>}
    </BaseBlogPost>
}
