import { observe } from "mobx"
import { useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore"

interface AppBackgroundProps{
    children: JSX.Element | JSX.Element[],
    page: 'Composer' | 'Main'
}
export function AppBackground({children,page}: AppBackgroundProps){
    const [background, setBackground] = useState(ThemeStore.getOther('backgroundImage'+page))
    useEffect(() => {
        const dispose = observe(ThemeStore.state.other,() => {
            setBackground(ThemeStore.getOther('backgroundImage'+page))
        })
        return dispose
    },[page])
    return <div className='app bg-image' style={{backgroundImage: `url(${background}`}}>
        {children}
    </div>
}