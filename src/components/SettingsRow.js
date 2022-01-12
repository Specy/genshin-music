import { useState, useEffect } from 'react'
import Switch from 'components/Switch'
export default function SettingsRow({ data, update, objKey, changeVolume }) {
    
    const [valueHook, setter] = useState(data.value)
    const [volumeHook, setterVolume] = useState(data.volume)
    
    useEffect(() => {
        setter(data.value)
    },[data.value])

    function handleChange(e) {
        const el = e.target
        let value = el.value
        if (data.type === "number") {
            value = Number(value)
            el.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (value < data.threshold[0] || value > data.threshold[1])  return
        }
        setter(value)
    }

    function handleCheckbox(value){
        data.value = value
        update({
            key: objKey,
            data
        }) 
        setter(value)
    }

    function sendChange() {
        if (data.value === valueHook) return
        data.value = valueHook
        let obj = {
            key: objKey,
            data: data
        }
        update(obj)
    }
    function sendChangeSelect(e) {
        let value = e.target.value
        data.value = value
        let obj = {
            key: objKey,
            data: data
        }
        update(obj)
    }

    function handleVolume(e) {
        setterVolume(Number(e.target.value))
    }

    function sendVolumeChange() {
        changeVolume({
            key: objKey,
            value: volumeHook
        })
    }

    if (objKey === "settingVesion") return null
    return <div className="settings-row">
        <div>
            {data.name}
        </div>

        {data.type === "select"
            && <select value={data.value}
                onChange={sendChangeSelect}
            >
                {data.options.map(e => {
                    return <option value={e} key={e}>{e}</option>
                })}
            </select>
        }

        {["number", "text"].includes(data.type) &&
            <input
                type={data.type}
                value={valueHook}
                placeholder={data.placeholder || ""}
                onBlur={sendChange}
                onChange={handleChange}
            />
        }

        {data.type === 'checkbox' && 
            <Switch 
                checked={valueHook}
                onChange={handleCheckbox}
            />
        }

        {data.type === "instrument" &&
            <div className="instrument-picker">
                <select value={data.value}
                    onChange={sendChangeSelect}
                >
                    {data.options.map(e => {
                        return <option value={e} key={e}>{e}</option>
                    })}
                </select>
                <input
                    type="range"
                    min={1}
                    max={100}
                    value={volumeHook}
                    onChange={handleVolume}
                    onPointerUp={sendVolumeChange}
                />
            </div>
        }
    </div>
}