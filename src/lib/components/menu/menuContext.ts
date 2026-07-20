import {getContext, setContext} from 'svelte'

// Old: src/components/shared/Menu/MenuContext.ts (React createContext<MenuContextState<string>>
// + useContext wrapper). Ported as a typed Svelte context: a module-level Symbol key (unique per
// module instantiation, so it can never collide with an unrelated setContext call elsewhere in
// the tree - same purpose React's own per-createContext() identity served) plus typed
// setContext/getContext wrapper functions. The old default context object (current: '',
// setCurrent/setOpen: no-ops, open: false, visible: true) is preserved verbatim as this module's
// `defaultState`, returned by getMenuContext() when no MenuSidebar ancestor has called
// setMenuContext() - mirrors React's createContext(defaultValue) fallback when there's no
// Provider above the caller.
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
