import { IS_MOBILE } from "appConfig"
import { useVsrgKey } from "lib/Hooks/useVsrgKey"
import { useVsrgKeyboardLayout } from "lib/Hooks/useVsrgKeyboardLayout"
import { KeyboardProvider } from "lib/Providers/KeyboardProvider"
import { KeyboardCode } from "lib/Providers/KeyboardProvider/KeyboardTypes"
import { useCallback, useEffect } from "react"
import { KeyboardKey, vsrgPlayerStore } from "stores/VsrgPlayerStore"


interface VsrgPlayerKeyboardProps {
    hitObjectSize: number
    keyboardLayout: VsrgKeyboardLayout
    offset: number
}
export type VsrgKeyboardLayout = 'line' | 'circles'

export function VsrgPlayerKeyboard({ hitObjectSize, offset, keyboardLayout }: VsrgPlayerKeyboardProps) {
    const layout = useVsrgKeyboardLayout()
    useEffect(() => {
        //TODO not sure if this is the best place
        layout.forEach((letter, i) => {
            KeyboardProvider.listen(({ letter, event }) => {
                if (event.repeat) return
                const index = layout.findIndex((l) => l.key === letter)
                if(index >= 0) vsrgPlayerStore.pressKey(index)
            }, { type: 'keydown', id: 'vsrg-player-keyboard' })
            KeyboardProvider.listen(({ letter, event }) => {
                if (event.repeat) return
                const index = layout.findIndex((l) => l.key === letter)
                if(index >= 0) vsrgPlayerStore.releaseKey(index)
            }, { type: 'keyup', id: 'vsrg-player-keyboard' })
        })
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    }, [layout])
    return <>
        <div
            className={`vsrg-player-keyboard-${keyboardLayout}`}
            key={layout.length}

        >
            {layout.map((letter, index) =>
                <VsrgPlayerKeyboardKey
                    key={letter.key}
                    index={index}
                    layout={layout}
                    offset={offset}
                    layoutType={keyboardLayout}
                    size={hitObjectSize}
                />
            )}
        </div>
    </>
}



interface VsrgPlayerKeyboardKeyProps {
    index: number
    layout: KeyboardKey[]
    offset: number
    layoutType: VsrgKeyboardLayout
    size: number
}
function VsrgPlayerKeyboardKey({ index, layout, size, layoutType, offset }: VsrgPlayerKeyboardKeyProps) {
    const data = useVsrgKey(index, layout)

    const pressKey = useCallback(() => {
        vsrgPlayerStore.pressKey(index)
    }, [index])
    const releaseKey = useCallback(() => {
        vsrgPlayerStore.releaseKey(index)
    }, [index])


    if (layoutType === 'circles') {
        return <button
            className="vsrg-player-key-hitbox-circle flex-centered"
            style={{
                paddingBottom: `${offset}px`,
            }}
            onPointerDown={pressKey}
            onPointerUp={releaseKey}
        >
            <div
                className={`vsrg-player-key-circle ${data.isPressed ? 'vsrg-key-pressed' : ''}`}
                style={{
                    width: size,
                    height: size,
                }}
            >
                {data.key}
            </div>
        </button>
    }
    if (layoutType === 'line') {
        return <button
            className="vsrg-player-key-hitbox-line"
            onPointerDown={pressKey}
            onPointerUp={releaseKey}
        >
            <div
                className={`vsrg-player-key-line ${data.isPressed ? 'vsrg-key-pressed' : ''}`}
                style={{
                    height: `${offset}px`,
                }}
            >
            </div>
        </button>
    }

    return null
}