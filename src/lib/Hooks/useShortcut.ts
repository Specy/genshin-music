import {createShortcutListener, ShortcutListener, ShortcutPage} from "$/stores/KeybindsStore";
import {useEffect} from "react"


export function useShortcut<T extends ShortcutPage>(page: T, id: string, callback: ShortcutListener<T>) {
    useEffect(() => {
        return createShortcutListener(page, id, callback)
    }, [callback, page, id])
}