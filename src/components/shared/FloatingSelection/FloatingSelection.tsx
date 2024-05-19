import {IconType} from "react-icons";
import {useState} from "react";
import useClickOutside from "$lib/Hooks/useClickOutside";
import {IconButton} from "$cmp/shared/Inputs/IconButton";
import s from "./FloatingSelection.module.scss";

interface FloatingSelectionProps<T extends string | number> {
    items: {
        value: T
        label: string
        key?: string
    }[]
    value: T
    Icon: IconType
    onChange: (val: T) => void
}

export function FloatingSelection<T extends string | number>({
                                                                 items,
                                                                 onChange,
                                                                 value,
                                                                 Icon
                                                             }: FloatingSelectionProps<T>) {

    const [open, setOpen] = useState(false)
    const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), {active: open})

    function selectItem(item: T) {
        onChange(item)
        setOpen(false)
    }

    return <div
        className={'column'}
        ref={ref}
        style={{
            alignItems: 'flex-end',
            gap: '0.5rem'
        }}
    >
        <IconButton
            onClick={() => setOpen(!open)}
            style={{
                zIndex: 2,
                borderRadius: '1rem',
                border: "solid 0.1rem var(--secondary)"
            }}
            toggled={open}
        >
            <Icon size={18}/>
        </IconButton>
        {open &&
            <div
                className={s['floating-selection-card']}
                style={{
                    maxHeight: '75vh'
                }}
            >
                {items.map(ins =>
                    <button
                        className={`${s['floating-selection-card-item']}`}
                        style={value === ins.value ? {
                            backgroundColor: 'var(--accent)',
                            color: "var(--accent-text)"
                        } : {}}
                        key={ins.key ?? ins.label}
                        onClick={() => selectItem(ins.value)}
                    >
                        {ins.label}
                    </button>
                )}
            </div>
        }
    </div>
}
