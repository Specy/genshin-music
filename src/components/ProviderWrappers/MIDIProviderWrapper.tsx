import { MIDIProvider } from "$lib/Providers/MIDIProvider"
import { useEffect } from "react"

interface MIDIListenerProviderProps{
    children: React.ReactNode
}
export function MIDIProviderWrapper({children}:MIDIListenerProviderProps){
    useEffect(() => {
        MIDIProvider.create()
        return () =>  MIDIProvider.destroy()
    },[])

    return < >   
        {children}
    </>
}