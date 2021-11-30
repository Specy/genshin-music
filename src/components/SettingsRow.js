import {useState } from 'react'

export default function SettingsRow(props) {
    const { data, update, objKey, changeVolume } = props
    const [valueHook, setter] = useState(data.value)
    const [volumeHook, setterVolume] = useState(data.volume)
    function handleChange(e) {
        let el = e.target
        let value = data.type === "checkbox" ? el.checked : el.value
        if (data.type === "number") {
            value = Number(value)
            e.target.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (value < data.threshold[0] || value > data.threshold[1]) {
                return
            }
        }
        if(el.type === 'checkbox'){
            data.value = value
            let obj = {
                key: objKey,
                data
            }
            update(obj)
        }
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
            ? <select value={data.value}
                onChange={sendChangeSelect}
            >
                {data.options.map(e => {
                    return <option value={e} key={e}>{e}</option>
                })}
            </select>
            : null
        }
        {["number", "text", "checkbox"].includes(data.type) ?
            <input
                type={data.type}
                value={valueHook}
                placeholder={data.placeholder || ""}
                checked={valueHook}
                onChange={handleChange}
                onBlur={sendChange}
            />
            : null
        }
        {data.type === "instrument"
            ? <div className="instrument-picker">
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
            : null
        }
    </div>
}