import { Pitch, PITCHES } from "@/appConfig"

interface PitchSelectProps {
    selected: Pitch
    onChange: (pitch: Pitch) => void
    style?: React.CSSProperties
    children?: React.ReactNode
    className?: string
}
export function PitchSelect({ selected, onChange, style, children, className}: PitchSelectProps) {
    return <select
        className={`select ${className ?? ''}`}
        style={{ width: '100%', padding: '0.3rem', ...style }}
        onChange={(e) => onChange(e.target.value as Pitch)}
        value={selected}
    >   
        {children}
        {PITCHES.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}