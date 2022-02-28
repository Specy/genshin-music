import { useState, useEffect, memo } from 'react'
import Switch from 'components/Switch'
import { InstrumentInput } from './InstrumentInput'
import { Input } from './Input'
import { Slider } from './Slider'
import { Select } from './Select'
import { useTheme } from 'lib/hooks/useTheme'
import './Settings.css'
import { SettingsPropriety } from 'types/SettingsPropriety'
interface SettingsRowProps {
    data: SettingsPropriety,
    update: (data:{
        key: string, 
        data: SettingsPropriety
    }) => void,
    objKey: string, 
    changeVolume: () => void
}

function SettingsRow({ data, update, objKey, changeVolume }:SettingsRowProps) {
    const [currentValue, setValue] = useState(data.value)
    const [volume, setVolume] = useState(data.type === 'instrument' ? data.volume : 0)
    const [theme] = useTheme()
    const { type } = data
    useEffect(() => {
        setValue(data.value)

    }, [data.value])

    function handleCheckbox(value: boolean) {
        if(type === 'checkbox'){
            update({
                key: objKey,
                data: { ...data, value }
            })
        }
    }

    if (objKey === "settingVesion") return null
    return <div className="settings-row" style={{ backgroundColor: theme.layer('menu_background', 0.15).toString() }}>
        <div>
            {data.name}
        </div>
        {type === "select" &&
            <Select
                onChange={update}
                value={data.value}
                objectKey={objKey}
                data={data}
            >
                {data.options.map(e => {
                    return <option value={e} key={e}>{e}</option>
                })}
            </Select>
        }
        {(type === 'number' || type === 'text') &&
            <Input
                data={data}
                //@ts-ignore
                value={currentValue}
                onChange={setValue}
                onComplete={update}
                objectKey={objKey}
            />
        }
        {type === 'checkbox' &&
            <Switch
                //@ts-ignore
                checked={currentValue}
                onChange={handleCheckbox}
            />
        }
        {type === 'slider' &&
            <Slider
                objectKey={objKey}
                data={data}
                //@ts-ignore
                value={currentValue}
                onChange={update}
            />
        }
        {type === "instrument" &&
            <InstrumentInput
                volume={volume}
                onInstrumentPick={update}
                onVolumeChange={setVolume}
                onVolumeComplete={changeVolume}
                instrument={data.value}
                data={data}
                objectKey={objKey}
            />
        }
    </div>
}
export default memo(SettingsRow, (p, n) => {
    return p.data.value === n.data.value
        //@ts-ignore
        && p.data.volume === n.data.volume
        && p.update === n.update
})