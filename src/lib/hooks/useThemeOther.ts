import { ThemeStore, ThemeStoreClass } from "stores/ThemeStore";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseThemeOther = [ThemeStoreClass, (theme: ThemeStoreClass) => void]
export function useThemeOther(): UseThemeOther{
    const [themeOther,setThemeOther] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.other,() => {
            setThemeOther({...ThemeStore})
        })
        return dispose
    },[]) 
    return [themeOther,setThemeOther]
}