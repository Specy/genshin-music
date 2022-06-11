import { useEffect, useRef } from "react";



export default function useClickOutside<T extends HTMLElement>(callback: Function, active: boolean) {
    const callbackRef = useRef<Function>();
    const innerRef = useRef<T>(null);

    useEffect(() => { callbackRef.current = callback; });

    useEffect(() => {
        if(!active) return
        function onClick(e: any): void {
            const clickedOutside = !(innerRef.current?.contains(e.target));
            if (clickedOutside) callbackRef.current?.(e);
        }
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [active]);

    return innerRef;
}
