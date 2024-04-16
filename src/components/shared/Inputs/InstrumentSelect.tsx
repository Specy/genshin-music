import {INSTRUMENTS} from "$config"
import {InstrumentName} from "$types/GeneralTypes"
import s from '$cmp/shared/Settings/Settings.module.css'
import {capitalize} from "$lib/utils/Utilities"
import {Stylable} from "$lib/utils/UtilTypes";

interface InstrumentSelectProps extends Stylable {
    selected: InstrumentName
    onChange: (instrument: InstrumentName) => void
}


const prefixes = new Set<string>(
    INSTRUMENTS
        .filter(ins => ins.includes("_"))
        .map(ins => ins.split("_")[0])
)
const instruments = {
    instruments: INSTRUMENTS.filter(ins => !ins.includes("_")),
} as Record<string, InstrumentName[]>
for (const prefix of prefixes) {
    instruments[prefix] = INSTRUMENTS.filter(ins => ins.startsWith(prefix))
}
const entries = Object.entries(instruments)

export function InstrumentSelect({selected, onChange, style, className}: InstrumentSelectProps) {
    return <select
        className={`${s.select} ${className}`}
        style={{width: '100%', padding: '0.3rem', ...style}}
        onChange={(e) => {
            onChange(e.target.value as InstrumentName)
            e.target.blur()
        }}
        value={selected}
    >
        {entries.length === 1
            ? <>
                {instruments.instruments.map(ins =>
                    <option
                        key={ins}
                        value={ins}
                    >
                        {ins.replace("-", " ")}
                    </option>
                )}
            </>
            : <>
                {entries.map(([prefix, ins]) =>
                    <optgroup
                        label={capitalize(prefix)}
                        key={prefix}
                    >
                        {ins.map(ins =>
                            <option
                                key={ins}
                                value={ins}
                            >
                                {ins
                                    .replace("-", " ")
                                    .replace(`${prefix}_`, "")
                                }
                            </option>
                        )}
                    </optgroup>
                )}
            </>
        }
    </select>
}