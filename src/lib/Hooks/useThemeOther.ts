import {Theme, ThemeProvider} from "$stores/ThemeStore/ThemeProvider";
import {useEffect, useState} from "react";
import {observe} from "mobx";


type UseThemeOther = [Theme, (theme: Theme) => void]
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