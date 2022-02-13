import { BASE_THEME_CONFIG } from "appConfig";
import { observe } from "mobx";
import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";

type Props = {
    children?: JSX.Element | JSX.Element[];
}
function ThemeProvider({ children }: Props) {
    const [theme,setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,(newState) => {
            setTheme({...ThemeStore})
        })
        return dispose
    },[])
    const noteColor = theme.get('note_background')
    return <>
        <style>
            {`:root{
                ${theme.toArray().map(e => {
                    return `--${e.css}:${e.value};
                            --${e.css}-text: ${e.text};
                            `
                }).join('\n')}
                --note-background-text:${noteColor.isDark() ? BASE_THEME_CONFIG.text.dark: BASE_THEME_CONFIG.text.note};
            }`}
        </style>
        {children}
    </>
}

export {
    ThemeProvider
}