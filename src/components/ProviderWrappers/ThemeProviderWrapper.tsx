import { useTheme } from '$lib/Hooks/useTheme'
import { useEffect, useState } from 'react';
import { ThemeProvider } from '$stores/ThemeStore/ThemeProvider';
import { colorToRGB } from '$lib/Utilities';
import Head from 'next/head';
type Props = {
    children?: React.ReactNode;
}
export function ThemeProviderWrapper({ children }: Props) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
        ThemeProvider.load()
    }, [])
    const [theme] = useTheme()
    const clickColor = theme.get('accent').isDark()
        ? theme.get('accent').mix(theme.get("note_background")).lighten(0.1)
        : theme.get('accent').mix(theme.get("note_background")).lighten(0.2)
    const backgroundDesaturate = ThemeProvider.get('note_background').desaturate(0.6)
    const borderFill = backgroundDesaturate.isDark() 
        ? backgroundDesaturate.lighten(0.50).toString() 
        : backgroundDesaturate.darken(0.18).toString()
    return <>
        <Head>
            <meta name="theme-color" content={theme.get(mounted ? "primary" : "accent").toString()} />
        </Head>
        <style>
            {`:root{
                ${theme.toArray().map(e => {
                return `--${e.css}:${e.value};
                            --${e.css}-rgb:${colorToRGB(ThemeProvider.get(e.name))};
                            --${e.css}-text: ${e.text};
                            ${new Array(2).fill(0).map((_, i) =>
                    `--${e.css}-darken-${i * 10 + 10}: ${ThemeProvider.get(e.name).darken(i * 0.1 + 0.1).toString()};`
                ).join('\n')}
                            ${new Array(2).fill(0).map((_, i) =>
                    `--${e.css}-lighten-${i * 10 + 10}: ${ThemeProvider.get(e.name).lighten(i * 0.1 + 0.1).toString()};`
                ).join('\n')}
                            `
            }).join('\n')}
                --clicked-note:${clickColor};
                --note-border-fill:${borderFill};
            }`}
        </style>
        {children}
    </>
}