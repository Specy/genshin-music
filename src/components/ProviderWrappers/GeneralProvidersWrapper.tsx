import { AudioProvider } from "$lib/Providers/AudioProvider"
import { MIDIProvider } from "$lib/Providers/MIDIProvider"
import { KeyboardProvider } from "$lib/Providers/KeyboardProvider";
import { shortcutsProvider } from "$/lib/Providers/ShortcutsProvider";
import { useEffect } from "react"


interface GeneralProvidersWrapperProps {
    children: React.ReactNode
}
export function GeneralProvidersWrapper({ children }: GeneralProvidersWrapperProps) {
    useEffect(() => {
        AudioProvider.init()
        KeyboardProvider.create()
        MIDIProvider.create()
        shortcutsProvider.load()
        return () => {
            AudioProvider.destroy()
            KeyboardProvider.destroy()
            MIDIProvider.destroy()
        }
    }, [])
    return <>
        {children}
    </>
}