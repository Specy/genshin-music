import { useTheme } from '$lib/Hooks/useTheme'
import s from './Switch.module.css'
interface SwitchProps{
    checked: boolean, 
    onChange: (change: boolean) => void,
    styleOuter?: React.CSSProperties
}
export default function Switch({checked, onChange, styleOuter}: SwitchProps){
    const [theme] = useTheme()
    return <button 
        className={s["switch-wrapper" ]}
        onClick={() => onChange(!checked)} style={styleOuter || {}}
        aria-label={checked ? 'Switch to off' : 'Switch to on'}
    >
        <div 
            className={`${s["switch-inner"]} ${checked ? s['switch-inner-on'] : ''}`}
            style={{backgroundColor: (checked ? theme.get('accent') : theme.layer('primary',0.4)).toString()}}
        >
        </div>
    </button>
}