import {BlogMetadata} from "$pages/blog/types";
import {BaseBlogPost} from "$cmp/pages/blog/BaseBlogPost";
import {Header} from "$cmp/shared/header/Header";
import Link from "next/link";
import {AppLink} from "$cmp/shared/link/AppLink";


export const _midiDeviceMetadata: BlogMetadata = {
    title: "Use a MIDI keyboard/device",
    relativeUrl: "connect-midi-device",
    image: 'https://picsum.photos/200/300',
    description: "How to connect a MIDI keyboard/device to the app, and how to use it in the player and composer. ",
    createdAt: new Date(),
}


export default function BlogPage() {
    return <BaseBlogPost metadata={_midiDeviceMetadata}>
        <div>
            Since vesion V2.3 there has been the possibility to connect a MIDI keyboard to the app. This functionality
            is
            available
            everywhere except on Safari browsers.
            <br/>
            <Header  margin={'1rem 0'}>
                How to connect the MIDI device
            </Header>
            To connect the MIDI keyboard to the app, get the appropriate cable to connect it to your device. If you are
            on android
            you might have to select the "midi" option in the USB connection settings.
            < br/>
            Once connected, you must map your keyboard to the app layout, to do this visit the <AppLink
            href={'/keybinds'}>keybinds</AppLink> page.
            A list of selected devices will appear, select the one you wish to connect and then configure the key mapping.
            A default preset is provided, in case it does not match your keyboard, you can create a new preset.
            <Header  margin={'1rem 0'}>
                Create a new MIDI preset
            </Header>
            To create a new midi preset click the "create new preset" button, you will be asked how to name it, once
            written,
            a new empty preset will be created. You now have to press the button of the note in the app that you want to
            start mapping,
            and then press the corresponding key on your keyboard. This will register that note to the MIDI key.
            <br/>
            <br/>
            You can also assign other keys of your MIDI keyboard to shortcuts in the composer, to map it, follow the
            same technique as the notes,
            click the button of the shortcut you want to map, and then press the corresponding key on your keyboard.
            <Header margin={'1rem 0'}>
                Use your phone/pc as a MIDI keyboard
            </Header>
            Using the app, you can turn your phone or pc into a MIDI keyboard, using the <AppLink
            href={'/zen-keyboard'}>Zen Keyboard</AppLink>,
            anytime you press a note in the app, a MIDI event will be triggered. This keyboard will use the same layout
            as the default layout.
            <br/>
            <br/>
            This means you can connect your (android) phone to your PC via an USB cable, select the MIDI USB settings on your phone,
            and select it in the <AppLink href={'/keybinds'}>keybinds</AppLink> page.
            <br/>
            You can use this to make it easier to compose songs on PC, you can use the phone to select/deselect notes, and the computer
            for the rest of the composer features. Another way to use it, is to record songs on your pc by playing it on the phone, or practicing a song.
        </div>

    </BaseBlogPost>
}