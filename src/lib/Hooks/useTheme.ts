import {Theme, ThemeProvider} from "$stores/ThemeStore/ThemeProvider";
import {useEffect, useState} from "react";
import {observe} from "mobx";
import {createDebouncer} from "$lib/utils/Utilities";


type UseTheme = [Theme, (theme: Theme) => void]

export function useTheme(): UseTheme {
    const [theme, setTheme] = useState(ThemeProvider)
    useEffect(() => {
        return subscribeTheme(setTheme)
    }, [])
    return [theme, setTheme]
}


export function subscribeTheme(callback: (theme: Theme) => void) {
    const debouncer = createDebouncer(50)
    const dispose = observe(ThemeProvider.state.data, () => {
        debouncer(() => callback({...ThemeProvider}))
    })
    const dispose2 = observe(ThemeProvider.state.other, () => {
        debouncer(() => callback({...ThemeProvider}))
    })
    callback({...ThemeProvider})
    return () => {
        dispose()
        dispose2()
    }
}