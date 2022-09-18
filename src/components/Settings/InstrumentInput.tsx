import { ChangeEvent } from "react"
import { ThemeStore } from "$stores/ThemeStore/ThemeProvider"
import { InstrumentName } from "$types/GeneralTypes"
import { SettingsInstrument, SettingUpdateKey } from "$types/SettingsPropriety"

interface InstrumentInputProps {
    data: SettingsInstrument,
    theme: ThemeStore,
    volume: number,
    instrument: string,
    objectKey: SettingUpdateKey,
    onVolumeChange: (value: number) => void,
    onVolumeComplete: (data: {
        value: number
        key: SettingUpdateKey
    }) => void,
    onInstrumentPick: (data: {
        key: SettingUpdateKey,
        data: SettingsInstrument
    }) => void
}

export function InstrumentInput({ data, volume, onVolumeChange, onVolumeComplete, onInstrumentPick, objectKey, instrument, theme }: InstrumentInputProps) {
    const instruments: InstrumentName[] = []
    const SFXInstruments: InstrumentName[] = []
    for (const instrument of data.options) {
        if (instrument.startsWith("SFX")) SFXInstruments.push(instrument)
        else instruments.push(instrument)
    }

    function handleVolumeChange(e: ChangeEvent<HTMLInputElement>) {
        onVolumeChange(Number(e.target.value))
    }
    function handleVolumePick() {
        onVolumeComplete({
            key: objectKey,
            value: volume
        })
    }
    function handleInstrument(e: ChangeEvent<HTMLSelectElement>) {
        onInstrumentPick({
            key: objectKey,
            data: { ...data, value: e.target.value as InstrumentName }
        })
    }

    return <div className="instrument-picker">
        <select value={instrument}
            style={{
                textAlign: 'left',
                paddingLeft: '0.4rem',
                backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
            }}
            className="select"
            onChange={handleInstrument}
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
        <input
            type="range"
            min={1}
            max={100}
            value={volume}
            onChange={handleVolumeChange}
            onPointerUp={handleVolumePick}
        />
    </div>
}