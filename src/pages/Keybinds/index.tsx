import { APP_NAME, LAYOUT_IMAGES } from "appConfig";
import { DefaultPage } from "components/Layout/DefaultPage";
import BaseNote from "components/Miscellaneous/BaseNote";
import { Title } from "components/Miscellaneous/Title";
import useClickOutside from "lib/Hooks/useClickOutside";
import { useObservableArray } from "lib/Hooks/useObserve";
import { KeyboardProvider } from "lib/Providers/KeyboardProvider";
import { VsrgSongKeys } from "lib/Songs/VsrgSong";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { keyBinds } from "stores/Keybinds";
import { InstrumentNotesLayout } from "types/GeneralTypes";
import { NoteImage } from "types/Keyboard";




export function Keybinds() {
    const keyboard = useObservableArray(keyBinds.getKeyboardKeybinds())
    const [selected, setSelected] = useState({
        type: '',
        index: -1
    })
    const resetSelection = useCallback(() => {
        setSelected({
            type: '',
            index: -1
        })
    }, [])
    useEffect(() => {
        KeyboardProvider.listen(({ letter }) => {
            if (letter === 'Escape') return resetSelection()
            const { type, index } = selected
            if (type === 'keyboard' && index !== -1) {
                keyBinds.setKeyboardKeybind(index, letter)
                setSelected({ type: '', index: -1 })
            }
            if (['k4', 'k6', 'k8'].includes(type) && index !== -1) {
                const kind = Number(type.replace('k', '')) as VsrgSongKeys
                keyBinds.setVsrgKeybind(kind, index, letter)
                setSelected({ type: '', index: -1 })
            }
        }, { id: 'keybinds' })
        return () => KeyboardProvider.unregisterById('keybinds')
    }, [selected, resetSelection])
    const k4 = useObservableArray(keyBinds.getVsrgKeybinds(4))
    const k6 = useObservableArray(keyBinds.getVsrgKeybinds(6))
    const k8 = useObservableArray(keyBinds.getVsrgKeybinds(8))
    return <DefaultPage>
        <Title text="Keybinds" />
        {false && <>
            <h1>
                Keyboard keybinds
            </h1>
            <div className="flex-centered">
                <div
                    className={`keyboard ${APP_NAME === 'Sky' ? 'keyboard-5' : ''}`}
                    style={{
                        margin: 0
                    }}
                >
                    {keyboard.map((key, i) =>
                        <BaseNote
                            key={i}
                            data={{
                                status: (selected.type === 'keyboard' && i === selected.index) ? 'clicked' : ''
                            }}
                            noteImage={LAYOUT_IMAGES[keyboard.length as InstrumentNotesLayout][i] as NoteImage}
                            noteText={key}
                            handleClick={() => {
                                setSelected({
                                    type: 'keyboard',
                                    index: selected.index === i ? -1 : i
                                })
                            }}
                        />
                    )}
                </div>
            </div>
        </>}

        <h1>
            Vsrg keybinds
        </h1>
        <div className="column" style={{ marginLeft: '1rem' }}>
            {[k4, k6, k8].map((keys, j) =>
                <Fragment key={j}>
                    <h2>
                        {keys.length} keys
                    </h2>
                    <div className="row">
                        {keys.map((key, i) =>
                            <VsrgKey
                                key={i}
                                letter={key}
                                isActive={selected.type === `k${keys.length}` && selected.index === i}
                                handleClick={(willBeSelected) =>
                                    setSelected({
                                        type: `k${keys.length}`,
                                        index: willBeSelected ? i : -1
                                    })

                                }
                            />
                        )}
                    </div>
                </Fragment>
            )}
        </div>
    </DefaultPage>
}

interface VsrgKeyProps {
    letter: string
    isActive: boolean
    handleClick: (status: boolean) => void
}

function VsrgKey({ letter, isActive, handleClick }: VsrgKeyProps) {
    const ref = useClickOutside<HTMLButtonElement>(() => handleClick(false), { ignoreFocusable: true, active: isActive })

    return <button
        className="vsrg-player-key-circle"
        ref={ref}
        style={{
            width: '3.5rem',
            height: '3.5rem',
            margin: '0.4rem',
            backgroundColor: isActive ? 'var(--accent)' : 'var(--primary)',
            color: isActive ? 'var(--accent-text)' : 'var(--primary-text)',
            cursor: 'pointer'
        }}
        onClick={() => handleClick(!isActive)}
    >
        {letter}
    </button>
}