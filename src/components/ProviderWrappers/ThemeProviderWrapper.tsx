import { useTheme } from '$lib/Hooks/useTheme'
import { useEffect, useState } from 'react';
import { ThemeProvider } from '$stores/ThemeStore/ThemeProvider';
import { colorToRGB } from '$lib/Utilities';
import Head from 'next/head';
type Props = {
    children?: React.ReactNode;
}
export function ThemeProviderWrapper({ children }: Props) {

    useEffect(() => {
        ThemeProvider.load()
    },[])
    const [theme] = useTheme()
    const clickColor = theme.get('accent').isDark() 
        ? theme.get('accent').lighten(0.1)
        : theme.get('accent').saturate(0.2).lighten(0.25)
        useEffect(() => {
            const meta = document.querySelector('meta[name="theme-color"]')
            if(meta) meta.setAttribute('content', theme.get('secondary').toString())
        }, [theme])
    return <>
        <Head>
            <meta name="theme-color" content={theme.get('accent').toString()} />
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
            }`}
        </style>
        {children}
    </>
}