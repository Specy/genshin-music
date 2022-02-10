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
    return <>
        <style>
            {`:root{
                ${theme.toArray().map(e => `--${e.css}:${e.value};`).join('\n')}
            }`}
        </style>
        {children}
    </>
}

export {
    ThemeProvider
}