import { INSTRUMENTS } from "appConfig"
import { InstrumentName } from "types/GeneralTypes"

interface InstrumentSelectProps {
    selected: InstrumentName
    onChange: (instrument: InstrumentName) => void
    style?: React.CSSProperties
}
export function InstrumentSelect({ selected, onChange, style }: InstrumentSelectProps) {
    return <select
        className="select"
        style={{ width: '100%', padding: '0.3rem', ...style }}
        onChange={(e) => onChange(e.target.value as InstrumentName)}
        value={selected}
    >
        {INSTRUMENTS.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}