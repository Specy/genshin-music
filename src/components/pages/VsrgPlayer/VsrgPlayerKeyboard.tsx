import {useVsrgKey} from "$lib/Hooks/useVsrgKey"
import {useVsrgKeyboardLayout} from "$lib/Hooks/useVsrgKeyboardLayout"
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider"
import React, {useCallback, useEffect} from "react"
import {KeyboardKey, vsrgPlayerStore} from "$stores/VsrgPlayerStore"
import s from "./VsrgPlayerKeyboard.module.css"

interface VsrgPlayerKeyboardProps {
    hitObjectSize: number
    keyboardLayout: VsrgKeyboardLayout
    offset: number
    verticalOffset: number
    horizontalOffset: number
}

export type VsrgKeyboardLayout = 'line' | 'circles'

export function VsrgPlayerKeyboard({
                                       hitObjectSize,
                                       offset,
                                       keyboardLayout,
                                       verticalOffset,
                                       horizontalOffset
                                   }: VsrgPlayerKeyboardProps) {
    const layout = useVsrgKeyboardLayout()
    useEffect(() => {
        KeyboardProvider.listen(({letter, event}) => {
            if (event.repeat) return
            const index = layout.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.pressKey(index)
        }, {type: 'keydown', id: 'vsrg-player-keyboard'})
        KeyboardProvider.listen(({letter, event}) => {
            if (event.repeat) return
            const index = layout.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.releaseKey(index)
        }, {type: 'keyup', id: 'vsrg-player-keyboard'})
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    }, [layout])
    const perSide = Math.ceil(layout.length / 2)
    const middle = layout.length - perSide * 2
    const left = layout.slice(0, perSide)
    const right = layout.slice(perSide + middle)

    return <>

        {keyboardLayout === 'line' &&
            <>
                <div
                    className={s['vsrg-player-keyboard-control-left']}
                    style={{
                        '--vertical-offset': `calc(-${left.length * 2}vw + ${verticalOffset * 0.1}rem)`,
                        '--horizontal-offset': `${horizontalOffset * 0.1 + 1}rem`
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

                    className={s['vsrg-player-keyboard-control-right']}
                    style={{
                        '--vertical-offset': `calc(-${left.length * 2}vw + ${verticalOffset * 0.1}rem)`,
                        '--horizontal-offset': `${horizontalOffset * 0.1 + 1}rem`
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
            className={s['vsrg-player-keyboard-circles']}
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

function VsrgPlayerKeyboardKey({index, layout, size, layoutType, offset}: VsrgPlayerKeyboardKeyProps) {
    const data = useVsrgKey(index, layout)
    const pressKey = useCallback(() => {
        vsrgPlayerStore.pressKey(index)
    }, [index])
    const releaseKey = useCallback(() => {
        vsrgPlayerStore.releaseKey(index)
    }, [index])


    if (layoutType === 'circles') {
        return <button
            className={`${s['vsrg-player-key-hitbox-circle']} flex-centered`}
            style={{
                paddingBottom: `${offset}px`,
            }}
            onPointerDown={pressKey}
            onPointerUp={releaseKey}
            onPointerLeave={releaseKey}
        >
            <div
                className={`${s['vsrg-player-key-circle']} ${data.isPressed ? s['vsrg-key-pressed'] : ''}`}
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
            className={s['vsrg-player-key-hitbox-line']}
            onPointerDown={pressKey}
            onPointerUp={releaseKey}
            onPointerLeave={releaseKey}
        >
            <div
                className={`${s['vsrg-player-key-line']} ${data.isPressed ? s['vsrg-key-pressed'] : ''}`}
                style={{
                    height: `${offset}px`,
                }}
            >
            </div>
        </button>
    }

    return null
}



