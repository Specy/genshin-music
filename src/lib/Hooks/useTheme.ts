import { ThemeProvider, ThemeStoreClass } from "stores/ThemeStore";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseTheme = [ThemeStoreClass, (theme: ThemeStoreClass) => void]
export function useTheme(): UseTheme{
    const [theme,setTheme] = useState(ThemeProvider)
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data,() => {
            setTheme({...ThemeProvider})
        })
        return dispose
    },[]) 
    return [theme,setTheme]
}