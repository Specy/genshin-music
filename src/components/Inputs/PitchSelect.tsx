import { Pitch, PITCHES } from "appConfig"

interface PitchSelectProps {
    selected: Pitch
    onChange: (pitch: Pitch) => void
    style?: React.CSSProperties
    children?: React.ReactNode
}
export function PitchSelect({ selected, onChange, style, children }: PitchSelectProps) {
    return <select
        className="select"
        style={{ width: '100%', padding: '0.3rem', ...style }}
        onChange={(e) => onChange(e.target.value as Pitch)}
        value={selected}
    >   
        {children}
        {PITCHES.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}