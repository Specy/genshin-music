import { useTheme } from 'lib/hooks/useTheme'
type Props = {
    children?: React.ReactNode;
}
function ThemeProvider({ children }: Props) {
    const [theme] = useTheme()
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