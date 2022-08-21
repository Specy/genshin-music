import { ThemeProvider, ThemeStore } from "$/stores/ThemeStore/ThemeProvider";
import { useState, useEffect } from "react";
import { observe } from "mobx";


type UseThemeOther = [ThemeStore, (theme: ThemeStore) => void]
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