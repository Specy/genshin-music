import {blurEvent} from "$lib/utils/Utilities"
import s from './menu.module.scss'
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {useMenuContext} from "$cmp/shared/Menu/MenuContext";


interface MenuItemProps extends Stylable {
    onClick?: () => void
    ariaLabel: string,
    id: string
}

export function MenuItem({className, style, onClick, children, ariaLabel, id}: MaybeChildren<MenuItemProps>) {
    const {current, open, visible, setCurrent, setOpen} = useMenuContext()
    const isActive = current === id && open && visible
    return <button
        className={`${s['menu-item']} ${isActive ? s['menu-item-active'] : ''} ${className}`}
        style={style}
        aria-label={ariaLabel}
        onClick={(e) => {
            blurEvent(e)
            onClick?.()
            setCurrent(id)
            if (isActive) {
                setOpen(false)
            } else {
                setOpen(true)
            }
        }}
    >
        {children}
    </button>
}

interface MenuButtonProps extends Stylable {
    onClick?: () => void
    ariaLabel: string,
}

export function MenuButton({className, style, onClick, children, ariaLabel}: MaybeChildren<MenuButtonProps>) {
    return <button
        className={`${s['menu-item']} ${className}`}
        style={style}
        aria-label={ariaLabel}
        onClick={(e) => {
            blurEvent(e)
            onClick?.()
        }}
    >
        {children}
    </button>
}