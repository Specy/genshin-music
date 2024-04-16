import {createContext, useContext} from "react";


export type MenuContextState<T> = {
    current: T,
    setCurrent: (current: NoInfer<T>) => void
    open: boolean,
    setOpen: (open: boolean) => void
    visible: boolean,
    setVisible?: (visible: boolean) => void
}


export const MenuContext = createContext<MenuContextState<string>>({
    current: "",
    setCurrent: () => {
    },
    open: false,
    setOpen: () => {
    },
    visible: true
} satisfies MenuContextState<string>)


export function useMenuContext<T extends string>() {
    return useContext(MenuContext) as unknown as MenuContextState<T>
}