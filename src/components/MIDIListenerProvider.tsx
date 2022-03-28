import { MIDIListener } from "lib/MIDIListener"
import { useEffect } from "react"

interface MIDIListenerProviderProps{
    children: React.ReactNode
}
export function MIDIListenerProvider({children}:MIDIListenerProviderProps){
    useEffect(() => {
        MIDIListener.create()
        return MIDIListener.dispose
    },[])

    return <>
        {children}
    </>
}