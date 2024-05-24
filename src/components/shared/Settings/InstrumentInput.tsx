import {ChangeEvent} from "react"
import {Theme} from "$stores/ThemeStore/ThemeProvider"
import {InstrumentName} from "$types/GeneralTypes"
import {SettingsInstrument, SettingUpdateKey} from "$types/SettingsPropriety"
import s from './Settings.module.css'
import {InstrumentSelect} from "$cmp/shared/Inputs/InstrumentSelect";

interface InstrumentInputProps {
    data: SettingsInstrument,
    theme: Theme,
    volume: number,
    instrument: InstrumentName,
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

export function InstrumentInput({
                                    data,
                                    volume,
                                    onVolumeChange,
                                    onVolumeComplete,
                                    onInstrumentPick,
                                    objectKey,
                                    instrument,
                                    theme
                                }: InstrumentInputProps) {

    function handleVolumeChange(e: ChangeEvent<HTMLInputElement>) {
        onVolumeChange(Number(e.target.value))
    }

    function handleVolumePick() {
        onVolumeComplete({
            key: objectKey,
            value: volume
        })
    }

    function handleInstrument(ins: InstrumentName) {
        onInstrumentPick({
            key: objectKey,
            data: {...data, value: ins}
        })
    }

    return <div className={s['instrument-picker']}>
        <InstrumentSelect
            selected={instrument}
            onChange={handleInstrument}
            className={s.select}
            style={{
                textAlign: 'left',
                paddingLeft: '0.4rem',
            }}
        />
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