import {CSSProperties, ReactNode, useState} from "react";
import useClickOutside from "$lib/Hooks/useClickOutside";
import s from './combobox.module.scss'
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {cn} from "$lib/utils/Utilities";

interface ComboBoxItemData<T> {
    item: T
    selected: boolean

}

interface ComboBoxProps<T> extends Stylable {
    items: ComboBoxItemData<T>[]
    position?: 'left' | 'right' | 'center'
    title: ReactNode
    onChange: (items: ComboBoxItemData<T>[]) => void
    children: (item: ComboBoxItemData<T>, onClick: () => void) => React.ReactNode
}

const positionMap = {
    left: {left: 0},
    right: {right: 0, transform: 'translateX(100%)'},
    center: {left: '50%', transform: 'translateX(-50%)'}
} satisfies Record<string, CSSProperties>

export function ComboBox<T>({items, onChange, children, title, position = 'left', style, className}: ComboBoxProps<T>) {
    const [open, setOpen] = useState(false)
    const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), {active: open})
    return <div ref={ref} className={`${className} ${s['combo-box-wrapper']}`} style={style}>
        <button
            onClick={() => setOpen(!open)}
            className={`${s['combo-box-title']}`}
        >
            {title}
        </button>
        {open &&
            <div
                className={`${s['combo-box-items']}`}
                style={positionMap[position]}
            >
                {items.map((item, i) =>
                    children(item, () => {
                        const newItems = items.map((it, j) => i === j ? {...it, selected: !it.selected} : it)
                        onChange(newItems)
                    })
                )}
            </div>
        }
    </div>
}


interface ComboBoxItemProps<T> extends Stylable {
    item: ComboBoxItemData<T>
    onClick: (item: T) => void
}

export function ComboBoxItem<T = any>({
                                          children,
                                          onClick,
                                          item,
                                          style,
                                          className
                                      }: MaybeChildren<ComboBoxItemProps<T>>) {
    return <button
        onClick={() => onClick(item.item)}
        style={style}
        className={cn(`${s['combo-box-item']} ${className}`, [item.selected, s['combo-box-item-selected']])}
    >
        {children}
    </button>
}


export function ComboBoxTitle({children}: { children: ReactNode }) {
    return <div className={s['combo-box-title-item']}>
        {children}
    </div>
}
