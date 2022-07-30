import { useVsrgKey } from "lib/Hooks/useVsrgKey"
import { useVsrgKeyboardLayout } from "lib/Hooks/useVsrgKeyboardLayout"
import { KeyboardProvider } from "lib/Providers/KeyboardProvider"
import { useCallback, useEffect } from "react"
import { vsrgPlayerStore } from "stores/VsrgPlayerStore"


interface VsrgPlayerKeyboardProps{

}

export function VsrgPlayerKeyboard({}: VsrgPlayerKeyboardProps){
    const layout = useVsrgKeyboardLayout()
    useEffect(() => {
        //TODO not sure if this is the best place
        layout.forEach((letter,i) => {
            KeyboardProvider.registerLetter(letter.key, () => {
                vsrgPlayerStore.pressKey(i)
            }, { type: 'keydown', id: 'vsrg-player-keyboard'})
            KeyboardProvider.registerLetter(letter.key, () => {
                vsrgPlayerStore.releaseKey(i)
            }, { type: 'keyup', id: 'vsrg-player-keyboard'})
        })
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    },[layout])
    return <>
        <div className="vsrg-player-keyboard" key={layout.length}>
            {layout.map((letter, index) => 
                <VsrgPlayerKeyboardKey key={index} index={index}/>
            )}
        </div>
    </>
}



interface VsrgPlayerKeyboardKeyProps{
    index: number
}
function VsrgPlayerKeyboardKey({index}: VsrgPlayerKeyboardKeyProps){
    const data = useVsrgKey(index)
    const pressKey = useCallback(() => {
        vsrgPlayerStore.pressKey(index)
    }, [index])
    const releaseKey = useCallback(() => {
        vsrgPlayerStore.releaseKey(index)
    }, [index])
    return <button 
        className="vsrg-player-key-hitbox"
        onPointerDown={pressKey}
        onPointerUp={releaseKey}
    >
        <div className={`vsrg-player-key ${data.isPressed ? 'vsrg-key-pressed' : ''}`}> 
            {data.key}
        </div>
    </button>
}