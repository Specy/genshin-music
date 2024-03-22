import { useThemeOther } from "$lib/Hooks/useThemeOther"

interface AppBackgroundProps {
    children: React.ReactNode,
    page: 'Composer' | 'Main'
    style?: React.CSSProperties
}

export function AppBackground({ children, page, style }: AppBackgroundProps) {
    const [theme] = useThemeOther()
    return <div 
        className='app bg-image' 
        //@ts-ignore
        style={{ backgroundImage: `url(${theme.getOther('backgroundImage' + page)})`, ...style }}>
        {children}
    </div>
}