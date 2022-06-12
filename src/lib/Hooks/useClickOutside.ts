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
            if(options?.ignoreFocusable && hasFocusable(e)) return
            const clickedOutside = !(innerRef.current?.contains(e.target));
            if (clickedOutside) callbackRef.current?.(e);
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
    const tags = path.map(e => e.tagName)
    return tags.some(tag => tag === "INPUT" || tag === "BUTTON")
}