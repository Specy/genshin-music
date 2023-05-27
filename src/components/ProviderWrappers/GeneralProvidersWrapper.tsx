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
    const [audioContextState, setAudioContextState] = useState<AudioContext['state'] | null>()
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
    const handleAudioContextStateChange = useCallback(() => {
        setAudioContextState(audioContext?.state ?? null)
    }, [audioContext])
    useEffect(() => {
        if (!audioContext) return
        audioContext.addEventListener('statechange', handleAudioContextStateChange)
        return () => {
            audioContext.removeEventListener('statechange', handleAudioContextStateChange)
        }
    }, [handleAudioContextStateChange, audioContext])
    useEffect(() => {
        AudioProvider.init().catch(console.error)
        setAudioContext(AudioProvider.getAudioContext())
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
        {/*
            {audioContextState !== 'running' &&
                <IconButton
                    className='resume-audio-context box-shadow'
                    size='3rem'
                    onClick={() => {
                        setAudioContextState("running") //ignore if it doesn't update
                        metronome.tick()
                    }}
                >
                    <FaVolumeMute style={{ width: '1.4rem', height: '1.4rem' }} />
                </IconButton>
            }
        */}
        {children}
    </>
}