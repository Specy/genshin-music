import {getContext, setContext} from 'svelte'

// `key` is a module-level Symbol, not a string, so it can never collide with
// an unrelated setContext call elsewhere in the tree.
export type MenuContextState<T extends string = string> = {
    current: T
    setCurrent: (current: T) => void
    open: boolean
    setOpen: (open: boolean) => void
    visible: boolean
    setVisible?: (visible: boolean) => void
}

const key = Symbol('menu-context')

const defaultState: MenuContextState = {
    current: '',
    setCurrent: () => {
    },
    open: false,
    setOpen: () => {
    },
    visible: true,
    setVisible: () => {
    },
}

export function setMenuContext<T extends string = string>(state: MenuContextState<T>): void {
    setContext(key, state)
}

export function getMenuContext<T extends string = string>(): MenuContextState<T> {
    const ctx = getContext<MenuContextState<T> | undefined>(key)
    return ctx ?? (defaultState as unknown as MenuContextState<T>)
}
