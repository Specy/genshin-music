import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import s from './menu.module.scss'
import {MenuContext, MenuContextState, useMenuContext} from "$cmp/shared/Menu/MenuContext";
import {cn} from "$lib/utils/Utilities";
import {ForwardedRef, forwardRef, ReactNode} from "react";

export interface MenuProps extends Stylable {
    opacity?: number
}

export function MenuSidebar({
                                style,
                                className,
                                opacity,
                                children
                            }: MaybeChildren<MenuProps>) {
    const {visible} = useMenuContext()
    return <div
        className={cn(`${s['menu']} ${className}`, [visible, s['menu-visible']])}
        style={{
            opacity,
            ...style
        }}
    >
        {children}
    </div>
}

export interface MenuContextProviderProps<T extends string> extends Partial<MenuContextState<T>>, Stylable {
}

function _MenuContextProvider<T extends string>({
                                                    children,
                                                    className,
                                                    style,
                                                    current,
                                                    open,
                                                    setOpen,
                                                    setCurrent,
                                                    visible,
                                                    setVisible
                                                }: MaybeChildren<MenuContextProviderProps<T>>,
                                                ref: ForwardedRef<HTMLDivElement>) {

    return <MenuContext.Provider
        value={{
            current: (current ?? "") as T,
            // @ts-ignore TODO
            setCurrent: setCurrent ?? ((current: T) => {
            }),
            open: open ?? false,
            setOpen: setOpen ?? (() => {
            }),
            visible: visible ?? true,
            setVisible: setVisible ?? (() => {
            })
        }}
    >
        <div className={`${s['menu-wrapper']} ${className}`} ref={ref} style={style}>
            {children}
        </div>
    </MenuContext.Provider>
}

//TODO for some reason react doesn't infer the generics properly in forwardRef
export const MenuContextProvider = forwardRef(_MenuContextProvider) as <T extends string>(props: MaybeChildren<MenuContextProviderProps<T> & Stylable> & {
    ref?: ForwardedRef<HTMLDivElement>
}) => ReactNode
