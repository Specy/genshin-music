import { useState, useEffect, memo } from 'react'
import Switch from 'components/Switch'
import { ThemeStore } from 'stores/ThemeStore'
import { observe } from 'mobx'
export default memo(function SettingsRow({ data, update, objKey, changeVolume }) {
    const [valueHook, setter] = useState(data.value)
    const [volumeHook, setterVolume] = useState(data.volume)
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        setter(data.value)
        const dispose = observe(ThemeStore.state.data, () => {
            setTheme({ ...ThemeStore })
        })
        return dispose
    }, [data.value])

    function handleChange(e) {
        const el = e.target
        let value = el.value
        if (data.type === "number") {
            value = Number(value)
            el.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (value < data.threshold[0] || value > data.threshold[1]) return
        }
        setter(value)
    }

    function handleCheckbox(value) {
        update({
            key: objKey,
            data: { ...data, value }
        })
        setter(value)
    }

    function sendChange() {
        if (data.value === valueHook) return
        let obj = {
            key: objKey,
            data: { ...data, value: valueHook }
        }
        update(obj)
    }
    function sendChangeSelect(e) {
        let value = e.target.value
        let obj = {
            key: objKey,
            data: { ...data, value }
        }
        update(obj)
    }

    function handleVolume(e) {
        setterVolume(Number(e.target.value))
    }
    function handleSlider(e){   
        update({
            key: objKey,
            data: { ...data, value: Number(e.target.value)}
        })
    }
    function sendVolumeChange() {
        changeVolume({
            key: objKey,
            value: volumeHook
        })
    }

    if (objKey === "settingVesion") return null
    return <div className="settings-row" style={{ backgroundColor: theme.layer('menu_background', 0.2).hex() }}>
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
        {data.type === 'slider' &&
            <input
                type="range"
                min={data.threshold[0]}
                max={data.threshold[1]}
                value={valueHook}
                onChange={handleSlider}
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
}, (p, n) => {
    return p.data.value === n.data.value
        && p.data.volume === n.data.volume
        && p.update === n.update
})