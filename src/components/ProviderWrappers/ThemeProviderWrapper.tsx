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
                const layers = [10, 20]
                const layersMore = [10, 15, 20]
                return `
                        --${e.css}:${e.value};
                        --${e.css}-rgb:${colorToRGB(theme.get(e.name))};
                        --${e.css}-text: ${e.text};
                        ${layers.map(v => `--${e.css}-darken-${v}: ${theme.get(e.name).darken(v / 100).toString()};`).join('\n')}
                        ${layers.map(v => `--${e.css}-lighten-${v}: ${theme.get(e.name).lighten(v / 100).toString()};`).join('\n')}
                        ${layersMore.map(v => `--${e.css}-layer-${v}: ${theme.layer(e.name, v / 100)};`).join('\n')}
                    `
            }).join('\n')}
                --clicked-note:${clickColor};
                --note-border-fill:${borderFill};
            }`}
        </style>
        {children}
    </>
}