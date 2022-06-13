import { useEffect, useRef } from "react";


type Callback = (e: MouseEvent) => void
interface Options {
    active: boolean
    ignoreFocusable: boolean
}
export default function useClickOutside<T extends HTMLElement>(callback: Callback, options?: Partial<Options>) {
    const callbackRef = useRef<Function>();
    const innerRef = useRef<T>(null);

    useEffect(() => { callbackRef.current = callback; });

    useEffect(() => {
        if(!options?.active) return
        function onClick(e: any): void {
            const clickedOutside = !(innerRef.current?.contains(e.target));
            if (clickedOutside) {
                if(options?.ignoreFocusable && hasFocusable(e)) return
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
export function hasFocusable(e: MouseEvent){
    const path = e.composedPath()

    //@ts-ignore
    return path.some(e => e.tagName === "INPUT" || e.tagName === "BUTTON" || e.classList?.contains?.("ignore_click_outside"))
}