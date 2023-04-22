import { capitalize, cn } from "$/lib/Utilities";
import { useState, useEffect } from "react";
import { AppButton } from "../Inputs/AppButton";
import { createKeyComboComposer } from "$/stores/KeybindsStore";
import { FaCheck } from "react-icons/fa";
import s from './ShortcutEditor.module.css'
import { IconButton } from "$cmp/Inputs/IconButton";
interface ShortcutEditorProps<K, V> {
    map: Map<K, V>;
    onChangeShortcut: (oldKey: K, newKey: K, shortcut: V) => void;
}

export function ShortcutEditor<K extends string, V>({ map, onChangeShortcut }: ShortcutEditorProps<K, V>) {
    const items = Array.from(map.entries())
    const [selected, setSelected] = useState<K | null>(null)
    return <div className="column" style={{ gap: "0.4rem" }}>
        {items.sort((a,b) => a[1] < b[1] ? 1 : -1  ).map(([key, value], i) =>
            <ShortcutElement
                key={i}
                mapKey={key}
                value={value}
                selected={selected === key}
                setSelected={setSelected}
                onChangeShortcut={(k, v) => {
                    onChangeShortcut(key, k, v)
                    setSelected(null)
                }}
            />
        )}

    </div>
}


interface ShortcutElementProps<K extends string, V> {
    mapKey: K;
    value: V;
    selected: boolean;
    setSelected: (key: K) => void;
    onChangeShortcut: (key: K, shortcut: V) => void;
}

function ShortcutElement<K extends string, V>({ mapKey, value, selected, setSelected, onChangeShortcut }: ShortcutElementProps<K, V>) {
    const [newKey, setNewKey] = useState<K>(mapKey)
    useEffect(() => {
        if (!selected) return
        return createKeyComboComposer(`shortcut_${value}`, ({ keyCombo }) => {
            setNewKey(keyCombo.join('+') as K)
        })
    }, [selected, value])
    useEffect(() => {
        setNewKey(mapKey)
    }, [mapKey, selected])
    return <div className={cn(`row ${s["shortcut-element"]}`, [selected, s['shortcut-element-selected']])}>
        <div>{capitalize((value as string).toString?.().replaceAll("_", " ") ?? value as any)}</div>
        <div className="row" style={{gap: "0.4rem"}}>
            {selected &&
                <IconButton
                    cssVar="accent"
                    onClick={() => {
                        onChangeShortcut(newKey, value)
                    }} >
                    <FaCheck />
                </IconButton>
            }
            <AppButton
                className={s["shortcut-button"]}
                onClick={() => setSelected(mapKey)}
            >
                {newKey}
            </AppButton>
        </div>

    </div>
}