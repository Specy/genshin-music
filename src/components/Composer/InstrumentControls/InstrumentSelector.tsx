import { INSTRUMENTS } from "appConfig"
import { InstrumentData } from "lib/Songs/SongClasses"
import { InstrumentName } from "types/GeneralTypes"

interface InstrumentSelectorProps {
    selected: InstrumentData
    onChange: (instrument: InstrumentName) => void
}
export function InstrumentSelector({ selected, onChange }: InstrumentSelectorProps) {
    return <select
        className="select"
        style={{ width: '100%', padding: '0.3rem' }}
        onChange={(e) => onChange(e.target.value as InstrumentName)}
        value={selected.name}
    >
        {INSTRUMENTS.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}