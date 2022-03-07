import { ThemeStore, ThemeStoreClass } from "stores/ThemeStore";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseTheme = [ThemeStoreClass, (theme: ThemeStoreClass) => void]
export function useTheme(): UseTheme{
    const [theme,setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTheme({...ThemeStore})
        })
        return dispose
    },[]) 
    return [theme,setTheme]
}