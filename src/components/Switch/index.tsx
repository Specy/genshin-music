import './switch.css'
import { useTheme } from 'lib/hooks/useTheme'

interface SwitchProps{
    checked: boolean, 
    onChange: (change: boolean) => void
}
export default function Switch({checked, onChange}: SwitchProps){
    const [theme] = useTheme()
    return <div className="switch-wrapper" onClick={() => onChange(!checked)}>
        <div 
            className={`switch-inner ${checked ? 'switch-inner-on' : ''}`}
            style={{backgroundColor: (checked ? theme.get('accent') : theme.layer('primary',0.4)).toString()}}
        >

        </div>
    </div>
}