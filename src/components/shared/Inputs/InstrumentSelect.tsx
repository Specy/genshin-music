import {INSTRUMENTS} from "$config"
import {InstrumentName} from "$types/GeneralTypes"
import s from '$cmp/shared/Settings/Settings.module.css'
import {capitalize} from "$lib/utils/Utilities"
import {Stylable} from "$lib/utils/UtilTypes";
import {useTranslation} from "react-i18next";
import {useTheme} from "$lib/Hooks/useTheme";
import {useMemo} from "react";

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
    const {t} = useTranslation("instruments")
    const [theme] = useTheme()
    const bg = useMemo(() => {
        return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
    }, [theme])
    return <select
        className={`${s.select} ${className}`}
        style={{
            width: '100%',
            padding: '0.3rem',
            backgroundImage: bg,
            ...style
        }}
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
                        {t(ins)}
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
                                {t(ins)}
                            </option>
                        )}
                    </optgroup>
                )}
            </>
        }
    </select>
}