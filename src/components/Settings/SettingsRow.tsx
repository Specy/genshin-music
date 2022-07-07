import { useState, useEffect, memo } from 'react'
import Switch from 'components/Switch'
import { InstrumentInput } from './InstrumentInput'
import { Input } from './Input'
import { Slider } from './Slider'
import { Select } from './Select'
import { useTheme } from 'lib/Hooks/useTheme'
import './Settings.css'
import { SettingsPropriety, SettingUpdate, SettingUpdateKey, SettingVolumeUpdate } from 'types/SettingsPropriety'
import { hasTooltip, Tooltip } from 'components/Utility/Tooltip'

interface SettingsRowProps {
    data: SettingsPropriety,
    update: (data: SettingUpdate) => void,
    objKey: SettingUpdateKey,
    changeVolume: (data: SettingVolumeUpdate) => void
}

function SettingsRow({ data, update, objKey, changeVolume }: SettingsRowProps) {
    const [currentValue, setValue] = useState(data.value)
    const [volume, setVolume] = useState(data.type === 'instrument' ? data.volume : 0)
    const [theme] = useTheme()
    const { type } = data
    useEffect(() => {
        setValue(data.value)

    }, [data.value])

    function handleCheckbox(value: boolean) {
        if (type === 'checkbox') {
            update({
                key: objKey,
                data: { ...data, value }
            })
        }
    }

    return <div
        className={`settings-row`}

        style={{ backgroundColor: theme.layer('menu_background', 0.15).toString() }}
    >

        <div className={hasTooltip(data.tooltip)} style={{flex:'1'}}>
            {data.name}
            {data.tooltip &&
                <Tooltip style={{width: '12rem'}}>
                    {data.tooltip}
                </Tooltip>
            }
        </div>
        {type === "select" &&
            <Select
                theme={theme}
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
                value={currentValue as string | number}
                onChange={setValue}
                onComplete={update}
                objectKey={objKey}
            />
        }
        {type === 'checkbox' &&
            <Switch
                checked={currentValue as boolean}
                onChange={handleCheckbox}
            />
        }
        {type === 'slider' &&
            <Slider
                objectKey={objKey}
                data={data}
                value={currentValue as number}
                onChange={update}
            />
        }
        {type === "instrument" &&
            <InstrumentInput
                theme={theme}
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