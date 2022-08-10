import { useVsrgKey } from "lib/Hooks/useVsrgKey"
import { useVsrgKeyboardLayout } from "lib/Hooks/useVsrgKeyboardLayout"
import { KeyboardProvider } from "lib/Providers/KeyboardProvider"
import { useCallback, useEffect } from "react"
import { KeyboardKey, vsrgPlayerStore } from "stores/VsrgPlayerStore"


interface VsrgPlayerKeyboardProps{
    hitObjectSize: number
    offset: number
}

export function VsrgPlayerKeyboard({hitObjectSize, offset}: VsrgPlayerKeyboardProps){
    const layout = useVsrgKeyboardLayout()
    useEffect(() => {
        //TODO not sure if this is the best place
        layout.forEach((letter,i) => {
            KeyboardProvider.registerLetter(letter.key, ({event}) => {
                if(event.repeat) return
                vsrgPlayerStore.pressKey(i)
            }, { type: 'keydown', id: 'vsrg-player-keyboard'})
            KeyboardProvider.registerLetter(letter.key, ({event}) => {
                if(event.repeat) return
                vsrgPlayerStore.releaseKey(i)
            }, { type: 'keyup', id: 'vsrg-player-keyboard'})
        })
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    },[layout])
    return <>
        <div 
            className="vsrg-player-keyboard" 
            style={{
                bottom: offset
            }}
            key={layout.length}
        >
            {layout.map((letter, index) => 
                <VsrgPlayerKeyboardKey 
                    key={letter.key} 
                    index={index} 
                    layout={layout}
                    size={hitObjectSize}
                />
            )}
        </div>
    </>
}



interface VsrgPlayerKeyboardKeyProps{
    index: number
    layout: KeyboardKey[]
    size: number
}
function VsrgPlayerKeyboardKey({index, layout, size}: VsrgPlayerKeyboardKeyProps){
    const data = useVsrgKey(index, layout)

    const pressKey = useCallback(() => {
        vsrgPlayerStore.pressKey(index)
    }, [index])
    const releaseKey = useCallback(() => {
        vsrgPlayerStore.releaseKey(index)
    }, [index])
    return <button 
        className="vsrg-player-key-hitbox flex-centered"
        onPointerDown={pressKey}
        onPointerUp={releaseKey}
    >
        <div 
            className={`vsrg-player-key ${data.isPressed ? 'vsrg-key-pressed' : ''}`}
            style={{
                width: size,
                height: size,
            }}
        > 
            {data.key}
        </div>
    </button>
}