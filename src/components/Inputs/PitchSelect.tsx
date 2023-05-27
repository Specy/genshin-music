import { Pitch, PITCHES } from "$config"
import s from '$cmp/Settings/Settings.module.css'
interface PitchSelectProps {
    selected: Pitch
    onChange: (pitch: Pitch) => void
    style?: React.CSSProperties
    children?: React.ReactNode
    className?: string
}
export function PitchSelect({ selected, onChange, style, children, className}: PitchSelectProps) {
    return <select
        className={`${s.select} ${className ?? ''}`}
        style={{ width: '100%', padding: '0.3rem', ...style }}
        onChange={(e) => {
            onChange(e.target.value as Pitch)
            e.target.blur()
        }}
        value={selected}
    >   
        {children}
        {PITCHES.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}