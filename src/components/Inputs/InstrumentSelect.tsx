import { INSTRUMENTS } from "$/appConfig"
import { InstrumentName } from "$types/GeneralTypes"

interface InstrumentSelectProps {
    selected: InstrumentName
    onChange: (instrument: InstrumentName) => void
    style?: React.CSSProperties
}

const instruments: InstrumentName[] = []
const SFXInstruments: InstrumentName[] = []
for (const instrument of INSTRUMENTS) {
    if (instrument.startsWith("SFX")) SFXInstruments.push(instrument)
    else instruments.push(instrument)
}
export function InstrumentSelect({ selected, onChange, style }: InstrumentSelectProps) {
    return <select
        className="select"
        style={{ width: '100%', padding: '0.3rem', ...style }}
        onChange={(e) => onChange(e.target.value as InstrumentName)}
        value={selected}
    >
        {SFXInstruments.length === 0
            ? <>
                {instruments.map(ins =>
                    <option
                        key={ins}
                        value={ins}
                    >
                        {ins.replace("-", " ")}
                    </option>
                )}
            </>
            : <>
                <optgroup label="Instruments">
                    {instruments.map(ins =>
                        <option
                            key={ins}
                            value={ins}
                        >
                            {ins.replace("-", " ")}
                        </option>
                    )}
                </optgroup>
                <optgroup label="SFX">
                    {SFXInstruments.map(ins =>
                        <option
                            key={ins}
                            value={ins}
                        >
                            {ins.replace("-", " ").replace("SFX_", "")}
                        </option>
                    )}
                </optgroup>
            </>
        }
    </select>
}