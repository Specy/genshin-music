import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {Header} from "$cmp/shared/header/Header";
import {AppLink} from "$cmp/shared/link/AppLink";
import {BlogP} from "$cmp/pages/blog/BlogUl";
import {BASE_PATH} from "$config";


export const _midiDeviceMetadata: BlogMetadata = {
    title: "🎹 Use a MIDI keyboard/device",
    tags: ["Guide"],
    relativeUrl: "connect-midi-device",
    image: BASE_PATH + '/assets/blog/zen-keyboard.webp',
    description: "How to connect a MIDI keyboard/device to the app, and how to use it in the player and composer.",
    createdAt: new Date("2024/03/19"),
    author: SpecyAuthor,

}


export default function BlogPage() {
    return <BaseBlogPost metadata={_midiDeviceMetadata}>
        <div>
            <BlogP>
                Since vesion V2.3 there has been the possibility to connect a MIDI keyboard to the app. This
                functionality
                is
                available
                everywhere except on Safari browsers.
            </BlogP>
            <Header margin={'1rem 0'}>
                How to connect the MIDI device
            </Header>
            <BlogP>
                To connect the MIDI keyboard to the app, get the appropriate cable to connect it to your device. If you
                are
                on android
                you might have to select the "midi" option in the USB connection settings.
            </BlogP>
            <BlogP>
                Once connected, you must map your keyboard to the app layout, to do this visit the <AppLink
                href={'/keybinds'}>keybinds</AppLink> page.
                A list of all connected devices will appear, you can now start to map the MIDI keys to the app's keys.
                A default preset is provided, in case it does not match your keyboard, you can create a new preset and
                assign
                the keys as you wish.
            </BlogP>
            <Header margin={'1rem 0'}>
                Create a new MIDI preset
            </Header>
            <BlogP>
                To create a new midi preset click the "create new preset" button, you will be asked how to name it, once
                written,
                a new empty preset will be created. You now have to press the button of the note in the app that you
                want to
                start mapping,
                and then press the corresponding key on your keyboard. This will register that note to the MIDI key.
            </BlogP>
            <BlogP>
                You can also assign other keys of your MIDI keyboard to shortcuts in the composer, to map it, follow the
                same technique as the notes,
                click the button of the shortcut you want to map, and then press the corresponding key on your keyboard.
            </BlogP>
            <Header margin={'1rem 0'}>
                Use your phone/pc as a MIDI keyboard
            </Header>
            <BlogP>
                Using the app, you can turn your phone or pc into a MIDI keyboard, using the <AppLink
                href={'/zen-keyboard'}>Zen Keyboard</AppLink>,
                anytime you press a note in the app, a MIDI event will be triggered. This keyboard will use the same
                layout
                as the default layout.
            </BlogP>

            <BlogP>
                This means you can connect your (android) phone to your PC via an USB cable, select the MIDI USB
                settings on
                your phone,
                and select it in the <AppLink href={'/keybinds'}>keybinds</AppLink> page.
            </BlogP>
            <BlogP>
                You can use this to make it easier to compose songs on PC, you can use the phone to select/deselect
                notes,
                and the computer
                for the rest of the composer features. Another way to use it, is to record songs on your pc by playing
                it on
                the phone, or practicing a song.
            </BlogP>

        </div>

    </BaseBlogPost>
}