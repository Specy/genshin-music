import { ShortcutListener, ShortcutOptions, ShortcutPage, createShortcutListener } from "$/stores/KeybindsStore";
import { useEffect } from "react"





export function useShortcut<T extends ShortcutPage >(page: T, id: string,  callback: ShortcutListener<T>, options?: ShortcutOptions){
    useEffect(() => {
        const demount = createShortcutListener(page, id, callback, options)
        return demount
    }, [callback, options, page, id])
}