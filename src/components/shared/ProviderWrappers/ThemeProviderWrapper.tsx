import {useTheme} from '$lib/Hooks/useTheme'
import {useEffect, useMemo, useState} from 'react';
import {ThemeProvider} from '$stores/ThemeStore/ThemeProvider';
import {colorToRGB} from '$lib/utils/Utilities';
import Head from 'next/head';
import {TEMPO_CHANGERS} from '$config';
import Color from 'color';

type Props = {
    children?: React.ReactNode;
}

export function ThemeProviderWrapper({children}: Props) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
        ThemeProvider.load()
    }, [])
    const [theme] = useTheme()
    const obj = useMemo(() => {
        const clickColor = theme.get('accent').isDark()
            ? theme.get('accent').mix(theme.get("note_background")).lighten(0.1)
            : theme.get('accent').mix(theme.get("note_background")).lighten(0.2)
        const backgroundDesaturate = ThemeProvider.get('note_background').desaturate(0.6)
        const borderFill = backgroundDesaturate.isDark()
            ? backgroundDesaturate.lighten(0.50).toString()
            : backgroundDesaturate.darken(0.18).toString()

        const map = new Map<string, string>()
        map.set('--clicked-note', clickColor.toString())
        map.set('--note-border-fill', borderFill.toString())
        theme.toArray().forEach(e => {
            const layers = [10, 20]
            const layersMore = [10, 15, 20]
            map.set(`--${e.css}`, e.value)
            map.set(`--${e.css}-rgb`, colorToRGB(theme.get(e.name)).join(','))
            map.set(`--${e.css}-text`, e.text)
            layers.forEach(v => map.set(`--${e.css}-darken-${v}`, theme.get(e.name).darken(v / 100).toString()))
            layers.forEach(v => map.set(`--${e.css}-lighten-${v}`, theme.get(e.name).lighten(v / 100).toString()))
            layersMore.forEach(v => map.set(`--${e.css}-layer-${v}`, theme.layer(e.name, v / 100).toString()))
        })
        TEMPO_CHANGERS.forEach(t => {
            map.set(`--tempo-changer-${t.id}`, Color(t.color).toString())
        })
        return Object.fromEntries(map)
    }, [theme])


    return <>
        <Head>
            <meta name="theme-color" content={theme.get(mounted ? "primary" : "accent").toString()}/>
        </Head>
        <style>
            {`
                :root{
                    --html-background: ${theme.get('background').alpha(1).toString()};
                    --background: ${theme.get('background').toString()};
                    --primary: ${theme.get('primary').toString()};
                    --background-text: ${theme.getText('background')};
                }
            `}
        </style>
        <div style={{display: 'flex', width: "100%", flex: 1, ...obj}}>
            {children}
        </div>
    </>
}