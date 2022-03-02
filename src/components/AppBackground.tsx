import { observe } from "mobx"
import { useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore"

interface AppBackgroundProps {
    children: React.ReactNode,
    page: 'Composer' | 'Main'
}
export function AppBackground({ children, page }: AppBackgroundProps) {
    //@ts-ignore
    const [background, setBackground] = useState(ThemeStore.getOther('backgroundImage' + page))
    useEffect(() => {
        const dispose = observe(ThemeStore.state.other, () => {
            //@ts-ignore
            setBackground(ThemeStore.getOther('backgroundImage' + page))
        })
        return dispose
    }, [page])
    return <div className='app bg-image' style={{ backgroundImage: `url(${background}` }}>
        {children}
    </div>
}