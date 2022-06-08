import { ThemeProvider, ThemeStoreClass } from "stores/ThemeStore";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseThemeOther = [ThemeStoreClass, (theme: ThemeStoreClass) => void]
export function useThemeOther(): UseThemeOther{
    const [themeOther,setThemeOther] = useState(ThemeProvider)
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.other,() => {
            setThemeOther({...ThemeProvider})
        })
        return dispose
    },[]) 
    return [themeOther,setThemeOther]
}