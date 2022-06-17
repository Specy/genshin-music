import { ThemeProvider, ThemeStoreClass } from "stores/ThemeStore";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseTheme = [ThemeStoreClass, (theme: ThemeStoreClass) => void]
export function useTheme(): UseTheme{
    const [theme,setTheme] = useState(ThemeProvider)
    useEffect(() => {
        return subscribeTheme(setTheme)
    },[]) 
    return [theme,setTheme]
}


export function subscribeTheme(callback: (theme: ThemeStoreClass) => void) {
    const dispose = observe(ThemeProvider.state.data, () => {
        callback({...ThemeProvider})
    })
    return dispose
}