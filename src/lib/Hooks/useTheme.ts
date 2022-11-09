import { ThemeProvider, Theme } from "$stores/ThemeStore/ThemeProvider";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseTheme = [Theme, (theme: Theme) => void]
export function useTheme(): UseTheme{
    const [theme,setTheme] = useState(ThemeProvider)
    useEffect(() => {
        return subscribeTheme(setTheme)
    },[]) 
    return [theme,setTheme]
}


export function subscribeTheme(callback: (theme: Theme) => void) {
    const dispose = observe(ThemeProvider.state.data, () => {
        callback({...ThemeProvider})
    })
    callback({...ThemeProvider})
    return dispose
}