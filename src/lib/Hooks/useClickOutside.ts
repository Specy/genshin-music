import { useEffect, useRef } from "react";


type Callback = (e: MouseEvent) => void
interface Options {
    active: boolean
    ignoreFocusable: boolean
}
export default function useClickOutside<T extends HTMLElement>(callback: Callback, options?: Partial<Options>) {
    const callbackRef = useRef<Function>();
    const innerRef = useRef<T>(null);

    //i have no idea why this is here, but i'm too scared to remove it
    useEffect(() => { 
        callbackRef.current = callback; 
    });

    useEffect(() => {
        if (!options?.active) return
        function onClick(e: any): void {
            const clickedOutside = !(innerRef.current?.contains(e.target));
            if (clickedOutside) {
                if (options?.ignoreFocusable && hasFocusable(e)) return
                callbackRef.current?.(e);
            }
        }
        document.addEventListener("click", onClick);
        return () => {
            document.removeEventListener("click", onClick);
        }
    }, [options?.active, options?.ignoreFocusable]);

    return innerRef;
}
export function hasFocusable(e: MouseEvent) {
    const path = e.composedPath()
    //@ts-ignore
    return path.some(e => {
        //@ts-ignore
        if(e.tagName === "INPUT" || e.tagName === "BUTTON") return !e.classList?.contains?.("include_click_outside")
        //@ts-ignore
        return e.classList?.contains?.("ignore_click_outside")
    })
}



