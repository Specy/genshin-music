import './switch.css'
import { ThemeStore } from 'stores/ThemeStore'
import { useEffect, useState } from 'react'
import { observe } from 'mobx'
export default function Switch({checked, onChange}){
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTheme({...ThemeStore})
        })
        return dispose
    },[])
    return <div className="switch-wrapper" onClick={() => onChange(!checked)}>
        <div 
            className={`switch-inner ${checked ? 'switch-inner-on' : ''}`}
            style={{backgroundColor: checked ? theme.get('accent') : theme.layer('primary',0.3)}}
        >

        </div>
    </div>
}