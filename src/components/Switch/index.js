import './switch.css'

export default function Switch({checked, onChange}){
    return <div className="switch-wrapper" onClick={() => onChange(!checked)}>
        <div className={`switch-inner ${checked ? 'switch-inner-on' : ''}`}>

        </div>
    </div>
}