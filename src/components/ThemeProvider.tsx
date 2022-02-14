import { observe } from "mobx";
import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";

type Props = {
    children?: JSX.Element | JSX.Element[];
}
function ThemeProvider({ children }: Props) {
    const [theme,setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTheme({...ThemeStore})
        })
        return dispose
    },[])
    const clickColor = theme.get('accent').isDark() 
        ? theme.get('accent').lighten(0.1)
        : theme.get('accent').saturate(0.2).lighten(0.25)
    return <>
        <style>
            {`:root{
                ${theme.toArray().map(e => {
                    return `--${e.css}:${e.value};
                            --${e.css}-text: ${e.text};
                            `
                }).join('\n')}
                --clicked-note:${clickColor};
            }`}
        </style>
        {children}
    </>
}

export {
    ThemeProvider
}