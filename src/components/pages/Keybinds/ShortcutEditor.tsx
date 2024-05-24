import {cn} from "$lib/utils/Utilities";
import {useEffect, useState} from "react";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {createKeyComboComposer, Shortcut} from "$stores/KeybindsStore";
import {FaCheck} from "react-icons/fa";
import s from './ShortcutEditor.module.css'
import {IconButton} from "$cmp/shared/Inputs/IconButton";
import {hasTooltip, Tooltip} from "$cmp/shared/Utility/Tooltip";
import {Row} from "$cmp/shared/layout/Row";
import {useTranslation} from "react-i18next";

interface ShortcutEditorProps<K, V> {
    map: Map<K, V>;
    onChangeShortcut: (oldKey: K, newKey: K, shortcut: V) => void;
}

export function ShortcutEditor<K extends string, V extends Shortcut<string>>({
                                                                                 map,
                                                                                 onChangeShortcut
                                                                             }: ShortcutEditorProps<K, V>) {
    const items = Array.from(map.entries())
    const [selected, setSelected] = useState<K | null>(null)
    return <div className="column" style={{gap: "0.4rem"}}>
        {items.sort((a, b) => a[1].name < b[1].name ? 1 : -1).map(([key, value], i) =>
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

function ShortcutElement<K extends string, V extends Shortcut<string>>({
                                                                           mapKey,
                                                                           value,
                                                                           selected,
                                                                           setSelected,
                                                                           onChangeShortcut
                                                                       }: ShortcutElementProps<K, V>) {
    const {t} = useTranslation('shortcuts')
    const [newKey, setNewKey] = useState<K>(mapKey)
    useEffect(() => {
        if (!selected) return
        return createKeyComboComposer(`shortcut_${value}`, ({keyCombo}) => {
            setNewKey(keyCombo.join('+') as K)
        })
    }, [selected, value])
    useEffect(() => {
        setNewKey(mapKey)
    }, [mapKey, selected])
    return <div
        className={cn(
            `row ${s["shortcut-element"]}`,
            [selected, s['shortcut-element-selected']],
            hasTooltip(value.description)
        )}
    >
        <Row align={'center'} gap={'0.4rem'}>
            {//@ts-ignore TODO type this
                t(`props.${value.name}`)
            }
            {value.holdable &&
                <div style={{fontSize: '0.8rem'}}>
                    ({t('holdable')})
                </div>
            }

        </Row>
        <Row gap={'0.4rem'}>
            {selected &&
                <IconButton
                    cssVar="accent"
                    onClick={() => {
                        onChangeShortcut(newKey, value)
                    }}>
                    <FaCheck/>
                </IconButton>
            }
            <AppButton
                className={s["shortcut-button"]}
                onClick={() => setSelected(mapKey)}
            >
                {newKey}
            </AppButton>
        </Row>
        {value.description &&
            <Tooltip>
                {//@ts-ignore TODO type this
                    t(`props.${value.description}`)
                }
            </Tooltip>
        }
    </div>
}