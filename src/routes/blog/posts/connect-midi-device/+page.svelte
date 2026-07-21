<script lang="ts">
    import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import Header from '$cmp/header/Header.svelte'
    import {midiDeviceMetadata} from '$cmp/blog/posts/connect-midi-device'

    // Old: src/app/_client-pages/blog/posts/connect-midi-device.tsx (95 lines). BlogP -> native
    // `<p class="blog-p">`; raw `$cmp/shared/link/AppLink` (not BlogLink, same as video-audio-
    // transpose.tsx) -> plain AppLink, no blog-link class/target. Content: the old file wraps
    // everything in one bare (unstyled) `<div>` - preserved for DOM/class parity even though it
    // has no visible effect either way. 3 headers, 7 paragraphs, 3 internal links (2 to /keybinds,
    // 1 to /zen-keyboard) - verified against the old blob.
</script>

<BaseBlogPost metadata={midiDeviceMetadata}>
    <div>
        <p class="blog-p">
            Since vesion V2.3 there has been the possibility to connect a MIDI keyboard to the app. This
            functionality
            is
            available
            everywhere except on Safari browsers.
        </p>
        <Header margin="1rem 0">
            How to connect the MIDI device
        </Header>
        <p class="blog-p">
            To connect the MIDI keyboard to the app, get the appropriate cable to connect it to your device. If you
            are
            on android
            you might have to select the "midi" option in the USB connection settings.
        </p>
        <p class="blog-p">
            Once connected, you must map your keyboard to the app layout, to do this visit the <AppLink
            href="/keybinds">keybinds</AppLink> page.
            A list of all connected devices will appear, you can now start to map the MIDI keys to the app's keys.
            A default preset is provided, in case it does not match your keyboard, you can create a new preset and
            assign
            the keys as you wish.
        </p>
        <Header margin="1rem 0">
            Create a new MIDI preset
        </Header>
        <p class="blog-p">
            To create a new midi preset click the "create new preset" button, you will be asked how to name it, once
            written,
            a new empty preset will be created. You now have to press the button of the note in the app that you
            want to
            start mapping,
            and then press the corresponding key on your keyboard. This will register that note to the MIDI key.
        </p>
        <p class="blog-p">
            You can also assign other keys of your MIDI keyboard to shortcuts in the composer, to map it, follow the
            same technique as the notes,
            click the button of the shortcut you want to map, and then press the corresponding key on your keyboard.
        </p>
        <Header margin="1rem 0">
            Use your phone/pc as a MIDI keyboard
        </Header>
        <p class="blog-p">
            Using the app, you can turn your phone or pc into a MIDI keyboard, using the <AppLink
            href="/zen-keyboard">Zen Keyboard</AppLink>,
            anytime you press a note in the app, a MIDI event will be triggered. This keyboard will use the same
            layout
            as the default layout.
        </p>

        <p class="blog-p">
            This means you can connect your (android) phone to your PC via an USB cable, select the MIDI USB
            settings on
            your phone,
            and select it in the <AppLink href="/keybinds">keybinds</AppLink> page.
        </p>
        <p class="blog-p">
            You can use this to make it easier to compose songs on PC, you can use the phone to select/deselect
            notes,
            and the computer
            for the rest of the composer features. Another way to use it, is to record songs on your pc by playing
            it on
            the phone, or practicing a song.
        </p>

    </div>
</BaseBlogPost>
