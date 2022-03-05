import { ChangeEvent } from "react"
import { InstrumentKeys } from "types/GeneralTypes"
import { SettingsInstrument, SettingUpdateKey } from "types/SettingsPropriety"

interface InstrumentInputProps{
    data: SettingsInstrument,
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

export function InstrumentInput({data,volume, onVolumeChange, onVolumeComplete, onInstrumentPick, objectKey, instrument}: InstrumentInputProps) {
    function handleVolumeChange(e: ChangeEvent<HTMLInputElement>){
        onVolumeChange(Number(e.target.value))
    }
    function handleVolumePick(){
        onVolumeComplete({
            key: objectKey,
            value: volume
        })
    }
    function handleInstrument(e: ChangeEvent<HTMLSelectElement>){
        onInstrumentPick({
            key: objectKey,
            data: { ...data, value: e.target.value as InstrumentKeys }
        })
    }

    return <div className="instrument-picker">
        <select value={instrument}
            onChange={handleInstrument}
        >
            {data.options.map(e => {
                return <option value={e} key={e}>{e}</option>
            })}
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