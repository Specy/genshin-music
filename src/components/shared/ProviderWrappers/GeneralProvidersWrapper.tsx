import {AudioProvider} from "$lib/Providers/AudioProvider"
import {MIDIProvider} from "$lib/Providers/MIDIProvider"
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider";
import {useEffect} from "react"
import {songsStore} from "$stores/SongsStore";
import {folderStore} from "$stores/FoldersStore";
import {metronome} from "$lib/audio/Metronome";
import {keyBinds} from "$stores/KeybindsStore";
import {themeStore} from "$stores/ThemeStore/ThemeStore";
import {ThemeProvider} from "$stores/ThemeStore/ThemeProvider";
import {globalConfigStore} from "$stores/GlobalConfigStore";
import Logger from '$cmp/pages/Index/Logger'
import {AsyncPromptWrapper} from '$cmp/shared/Utility/AsyncPrompt';
import {setupProtocol} from "$lib/Hooks/useWindowProtocol";
import {logger} from "$stores/LoggerStore";
import {pwaStore} from "$stores/PwaStore";

interface GeneralProvidersWrapperProps {
    children: React.ReactNode
    onLoaded?: () => void
}

export function GeneralProvidersWrapper({children, onLoaded}: GeneralProvidersWrapperProps) {
    useEffect(() => {
        AudioProvider.init().catch(console.error)
        metronome.init(AudioProvider.getAudioContext())
        KeyboardProvider.create()
        MIDIProvider.init().catch(console.error)
        globalConfigStore.load() //before songsStore
        songsStore.sync().catch(console.error)
        folderStore.sync().catch(console.error)
        themeStore.sync().catch(console.error)
        keyBinds.load()
        pwaStore.load()
        ThemeProvider.load().catch(console.error)
        setupProtocol().catch(console.error)
        return () => {
            AudioProvider.destroy()
            KeyboardProvider.destroy()
            MIDIProvider.destroy()
        }
    }, [])

    useEffect(() => {
        //TODO should this be here?
        let sources = MIDIProvider.inputs
        const cb = (inputs: WebMidi.MIDIInput[]) => {
            if (sources.length > inputs.length)
                logger.warn('MIDI device disconnected')
            else if (inputs.length > 0)
                logger.warn('MIDI device connected')
            sources = inputs
        }
        MIDIProvider.addInputsListener(cb)
        return () => {
            MIDIProvider.removeInputsListener(cb)
        }
    }, []);
    return <>
        <Logger/>
        <AsyncPromptWrapper/>
        {children}
    </>
}