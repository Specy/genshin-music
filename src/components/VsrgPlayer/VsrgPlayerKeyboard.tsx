import { useVsrgKey } from "lib/Hooks/useVsrgKey"
import { useVsrgKeyboardLayout } from "lib/Hooks/useVsrgKeyboardLayout"
import { KeyboardProvider } from "lib/Providers/KeyboardProvider"
import React, { Fragment, useCallback, useEffect, useState } from "react"
import { KeyboardKey, vsrgPlayerStore } from "stores/VsrgPlayerStore"


interface VsrgPlayerKeyboardProps {
    hitObjectSize: number
    keyboardLayout: VsrgKeyboardLayout
    offset: number
}
export type VsrgKeyboardLayout = 'line' | 'circles'
interface RenderLayout {
    left: KeyboardKey[]
    center: KeyboardKey[]
    right: KeyboardKey[]
}

export function VsrgPlayerKeyboard({ hitObjectSize, offset, keyboardLayout }: VsrgPlayerKeyboardProps) {
    const layout = useVsrgKeyboardLayout()

    useEffect(() => {
        //TODO not sure if this is the best place
        KeyboardProvider.listen(({ letter, event }) => {
            if (event.repeat) return
            const index = layout.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.pressKey(index)
        }, { type: 'keydown', id: 'vsrg-player-keyboard' })
        KeyboardProvider.listen(({ letter, event }) => {
            if (event.repeat) return
            const index = layout.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.releaseKey(index)
        }, { type: 'keyup', id: 'vsrg-player-keyboard' })
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    }, [layout])
    const perSide = Math.ceil(layout.length / 2)
    const middle = layout.length - perSide * 2
    const left = layout.slice(0, perSide)
    const right = layout.slice(perSide + middle)
    //const center = layout.slice(perSide, perSide + middle)

    return <>

        {keyboardLayout === 'line' &&
            <>
                <div
                    className="vsrg-player-keyboard-control-left"
                    style={{
                        '--vertical-offset': `-${left.length * 2}vw`
                    } as React.CSSProperties}
                >
                    {left.map(letter =>
                        <VsrgPlayerKeyboardKey
                            key={`${letter.key}-${layout.length}`}

                            index={letter.index}
                            layout={layout}
                            offset={offset}
                            layoutType={'circles'}
                            size={hitObjectSize}
                        />
                    )}
                </div>
                <div

                    className="vsrg-player-keyboard-control-right"
                    style={{
                        '--vertical-offset': `-${left.length * 2}vw`
                    } as React.CSSProperties}
                >
                    {right.map(letter =>
                        <VsrgPlayerKeyboardKey
                            key={`${letter.key}-${layout.length}`}

                            index={letter.index}
                            layout={layout}
                            offset={offset}
                            layoutType={'circles'}
                            size={hitObjectSize}
                        />
                    )}
                </div>

            </>
        }
        <div
            className={`vsrg-player-keyboard-circles`}
        >
            {layout.map(letter =>
                <VsrgPlayerKeyboardKey
                    key={`${letter.key}-${layout.length}`}
                    index={letter.index}
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



