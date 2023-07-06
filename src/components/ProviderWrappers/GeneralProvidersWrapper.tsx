import { AudioProvider } from "$lib/Providers/AudioProvider"
import { MIDIProvider } from "$lib/Providers/MIDIProvider"
import { KeyboardProvider } from "$lib/Providers/KeyboardProvider";
import { useCallback, useEffect, useState } from "react"
import { songsStore } from "$stores/SongsStore";
import { folderStore } from "$stores/FoldersStore";
import { metronome } from "$lib/Metronome";
import { IconButton } from "../Inputs/IconButton";
import { FaVolumeMute } from "react-icons/fa";
import { keyBinds } from "$stores/KeybindsStore";
import { themeStore } from "$stores/ThemeStore/ThemeStore";
import { ThemeProvider } from "$stores/ThemeStore/ThemeProvider";
import { globalConfigStore } from "$stores/GlobalConfig";
import Logger from '$cmp/Index/Logger'
import { AsyncPromptWrapper } from '$cmp/Utility/AsyncPrompt';
import { setupProtocol } from "$lib/Hooks/useWindowProtocol";

interface GeneralProvidersWrapperProps {
    children: React.ReactNode
    onLoaded?: () => void
}
export function GeneralProvidersWrapper({ children, onLoaded }: GeneralProvidersWrapperProps) {
    useEffect(() => {
        AudioProvider.init().catch(console.error)
        metronome.init(AudioProvider.getAudioContext())
        KeyboardProvider.create()
        MIDIProvider.init().catch(console.error)
        songsStore.sync().catch(console.error)
        folderStore.sync().catch(console.error)
        themeStore.sync().catch(console.error)
        keyBinds.load()
        ThemeProvider.load().catch(console.error)
        globalConfigStore.load()
        setupProtocol().catch(console.error)
        return () => {
            AudioProvider.destroy()
            KeyboardProvider.destroy()
            MIDIProvider.destroy()
        }
    }, [])
    return <>
        <Logger />
        <AsyncPromptWrapper />
        {children}
    </>
}