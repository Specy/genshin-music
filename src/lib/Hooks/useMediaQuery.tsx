import {useEffect, useState} from "react";

export function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return window.matchMedia(query).matches
    })
    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        const listener = () => {
            setMatches(mediaQuery.matches)
        };
        mediaQuery.addEventListener("change", listener);
        return () => mediaQuery.removeEventListener("change", listener);
    }, [query]);
    return matches;
}

export function useIsNarrow() {
    return useMediaQuery("(max-width: 768px)");
}