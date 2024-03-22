import {APP_NAME} from "$config";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import BaseNote from "$cmp/shared/Miscellaneous/BaseNote";
import {PageMeta} from "$cmp/shared/Miscellaneous/PageMeta";
import useClickOutside from "$lib/Hooks/useClickOutside";
import {useObservableArray, useObservableMap} from "$lib/Hooks/useObservable";
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider";
import {VsrgSongKeys} from "$lib/Songs/VsrgSong";
import {Fragment, useEffect, useState} from "react";
import {keyBinds} from "$stores/KeybindsStore";
import Instrument from "$lib/Instrument";
import {logger} from "$/stores/LoggerStore";
import {ShortcutEditor} from "$cmp/pages/Keybinds/ShortcutEditor";
import {useConfig} from "$/lib/Hooks/useConfig";
import svs from "$cmp/pages/VsrgPlayer/VsrgPlayerKeyboard.module.css"
import MidiSetup from "components/pages/MidiSetup";


const baseInstrument = new Instrument()
export default function Keybinds() {

    const [keyboard] = useObservableMap(keyBinds.getShortcutMap("keyboard"))
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))
    const [playerShortcuts] = useObservableMap(keyBinds.getShortcutMap("player"))
    const [vsrgComposerShortcuts] = useObservableMap(keyBinds.getShortcutMap("vsrg_composer"))
    const [vsrgPlayerShortcuts] =  useObservableMap(keyBinds.getShortcutMap("vsrg_player"))
    const { IS_MOBILE } = useConfig()
    const [selected, setSelected] = useState({
        type: '',
        index: -1
    })
    useEffect(() => {
        KeyboardProvider.listen(({ letter, code }) => {
            if (letter === 'Escape') return setSelected({
                type: '',
                index: -1
            })
            const { type, index } = selected
            const note = baseInstrument.getNoteFromIndex(index)
            if (type === 'keyboard' && index !== -1) {
                const existing = keyBinds.setKeyboardKeybind(note.noteNames.keyboard, code)
                if (existing !== undefined) logger.warn(`This keybind is already used by the ${existing.name} note`)
                setSelected({ type: '', index: -1 })
            }
            if (['k4', 'k6', 'k8'].includes(type) && index !== -1) {
                const kind = Number(type.replace('k', '')) as VsrgSongKeys
                keyBinds.setVsrgKeybind(kind, index, letter)
                setSelected({ type: '', index: -1 })
            }
        }, { id: 'keybinds' })
        return () => KeyboardProvider.unregisterById('keybinds')
    }, [selected])
    const k4 = useObservableArray(keyBinds.getVsrgKeybinds(4))
    const k6 = useObservableArray(keyBinds.getVsrgKeybinds(6))
    return <DefaultPage>
        <PageMeta text="Keybinds" description="Change the app keyboard keybinds and MIDI input keys" />
        <h1>
            MIDI keybinds
        </h1>
        <MidiSetup />
        {!IS_MOBILE
            && <>
                <h1>
                    Composer shortcuts
                </h1>
                <div className="column">
                    <ShortcutEditor
                        map={composerShortcuts}
                        onChangeShortcut={(oldKey, newKey) => {
                            if(oldKey === newKey) return
                            const existing = keyBinds.setShortcut("composer", oldKey, newKey)
                            if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                        }}
                    />
                </div>
                <h1>
                    Player shortcuts
                </h1>
                <div className="column">
                    <ShortcutEditor
                        map={playerShortcuts}
                        onChangeShortcut={(oldKey, newKey) => {
                            if(oldKey === newKey) return
                            const existing = keyBinds.setShortcut("player", oldKey, newKey)
                            if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                        }}
                    />
                </div>
                <h1>
                    Vsrg composer shortcuts
                </h1>
                <div className="column">
                    <ShortcutEditor
                        map={vsrgComposerShortcuts}
                        onChangeShortcut={(oldKey, newKey) => {
                            if(oldKey === newKey) return
                            const existing = keyBinds.setShortcut("vsrg_composer", oldKey, newKey)
                            if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                        }}
                    />
                </div>
                <h1>
                    Vsrg player shortcuts
                </h1>
                <div className="column">
                    <ShortcutEditor
                        map={vsrgPlayerShortcuts}
                        onChangeShortcut={(oldKey, newKey) => {
                            if(oldKey === newKey) return
                            const existing = keyBinds.setShortcut("vsrg_player", oldKey, newKey)
                            if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                        }}
                    />
                </div>
                <h1>
                    Keyboard keybinds
                </h1>
                <div>
                    You can remap the keyboard keys to whatever key on your keyboard
                </div>
                <div className="flex-centered">
                    <div
                        className={`keyboard ${APP_NAME === 'Sky' ? 'keyboard-5' : ''}`}
                        style={{
                            margin: '1rem 0'
                        }}
                    >
                        {baseInstrument.notes.map((note, i) =>
                            <BaseNote
                                key={i}
                                data={{
                                    status: (selected.type === 'keyboard' && i === selected.index) ? 'clicked' : ''
                                }}
                                noteImage={baseInstrument.notes[i].noteImage}
                                noteText={(
                                    keyBinds.getKeyOfShortcut(
                                        "keyboard",
                                        {name: note.noteNames.keyboard, holdable: false}
                                    ) ?? "???")
                                    .replace("Key", "")
                                }
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
                <h1>
                    Vsrg keybinds
                </h1>
                <div className="column" style={{ marginLeft: '1rem' }}>
                    {[k4, k6].map((keys, j) =>
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
            </>
        }
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
        className={svs['vsrg-player-key-circle']}
        ref={ref}
        style={{
            width: '3.5rem',
            fontSize: '1rem',
            height: '3.5rem',
            margin: '0.4rem',
            border: 'none',
            backgroundColor: isActive ? 'var(--accent)' : 'var(--primary)',
            color: isActive ? 'var(--accent-text)' : 'var(--primary-text)',
            cursor: 'pointer'
        }}
        onClick={() => handleClick(!isActive)}
    >
        {letter}
    </button>
}