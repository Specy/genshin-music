import { ShortcutListener, ShortcutOptions, ShortcutPage, createShortcutListener } from "$/stores/KeybindsStore";
import { useEffect } from "react"





export function useShortcut<T extends ShortcutPage >(page: T, id: string,  callback: ShortcutListener<T>, options?: ShortcutOptions){
    useEffect(() => {
        return createShortcutListener(page, id, callback, options)
    }, [callback, options, page, id])
}