import { AudioProvider } from "$lib/Providers/AudioProvider"
import { MIDIProvider } from "$lib/Providers/MIDIProvider"
import { KeyboardProvider } from "$lib/Providers/KeyboardProvider";
import { shortcutsProvider } from "$/lib/Providers/ShortcutsProvider";
import { useCallback, useEffect, useState } from "react"
import { songsStore } from "$/stores/SongsStore";
import { folderStore } from "$/stores/FoldersStore";
import { metronome } from "$/lib/Metronome";
import { IconButton } from "../Inputs/IconButton";
import { FaVolumeMute } from "react-icons/fa";
import { keyBinds } from "$/stores/KeybindsStore";
import { themeStore } from "$/stores/ThemeStore/ThemeStore";
import { ThemeProvider } from "$/stores/ThemeStore/ThemeProvider";
import { globalConfigStore } from "$/stores/GlobalConfig";


interface GeneralProvidersWrapperProps {
    children: React.ReactNode
}
export function GeneralProvidersWrapper({ children }: GeneralProvidersWrapperProps) {
	const [audioContextState, setAudioContextState] = useState<AudioContext['state'] | null>()
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
    const handleAudioContextStateChange = useCallback(() => {
		setAudioContextState(audioContext?.state ?? null)
	}, [audioContext])
	useEffect(() => {
        if(!audioContext) return
		audioContext.addEventListener('statechange', handleAudioContextStateChange)
		return () => {
			audioContext.removeEventListener('statechange', handleAudioContextStateChange)
		}
	}, [handleAudioContextStateChange, audioContext])
    
    useEffect(() => {
        AudioProvider.init()
        setAudioContext(AudioProvider.getAudioContext())
        metronome.init(AudioProvider.getAudioContext())
        KeyboardProvider.create()
        MIDIProvider.init()
        shortcutsProvider.load()
        songsStore.sync()
        folderStore.sync()
        themeStore.sync()
        keyBinds.load()
        ThemeProvider.load()
        globalConfigStore.load()
        return () => {
            AudioProvider.destroy()
            KeyboardProvider.destroy()
            MIDIProvider.destroy()
        }
    }, [])
    return <>
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
        {children}
    </>
}