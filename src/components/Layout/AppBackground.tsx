import { useThemeOther } from "$lib/Hooks/useThemeOther"

interface AppBackgroundProps {
    children: React.ReactNode,
    page: 'Composer' | 'Main'
}
export function AppBackground({ children, page }: AppBackgroundProps) {
    const [theme] = useThemeOther()
    return <div 
        className='app bg-image' 
        //@ts-ignore
        style={{ backgroundImage: `url(${theme.getOther('backgroundImage' + page)})` }}>
        {children}
    </div>
}