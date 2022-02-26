import './switch.css'
import { useTheme } from 'lib/hooks/useTheme'
export default function Switch({checked, onChange}){
    const [theme] = useTheme()
    return <div className="switch-wrapper" onClick={() => onChange(!checked)}>
        <div 
            className={`switch-inner ${checked ? 'switch-inner-on' : ''}`}
            style={{backgroundColor: checked ? theme.get('accent') : theme.layer('primary',0.4)}}
        >

        </div>
    </div>
}