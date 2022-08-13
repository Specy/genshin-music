import { AudioProvider } from "lib/Providers/AudioProvider"
import { useEffect } from "react"


interface AudioProviderProps{
    children: React.ReactNode
}
export function AudioProviderWrapper({children}:AudioProviderProps){
    useEffect(() => {
        AudioProvider.init()
        return () =>  AudioProvider.destroy()
    },[])
    return <>
        {children}
    </>
}