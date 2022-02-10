import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import './Theme.css'

import { SimpleMenu } from "components/SimpleMenu";
import { capitalize } from "lib/Utils";


function Theme() {
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, (newState) => {
            setTheme({ ...ThemeStore })
        })
        return dispose
    }, [])
    function handleChange(name: string, value: string) {
        ThemeStore.set(name, value)
    }
    return <div>
        <SimpleMenu />
        <div className="default-page">
            {theme.toArray().map(e =>
                <ThemePropriety {...e} key={e.name} onChange={handleChange} />
            )}

        </div>
    </div>
}


interface ThemeProprietyProps {
    name: string,
    value: string,
    onChange: (name: string, value: string) => void
}
function ThemePropriety({ name, value, onChange }: ThemeProprietyProps) {
    const [color, setColor] = useState(value)
    useEffect(() => {
        setColor(value)
    }, [value])
    function handleChange(e: any) {
        setColor(e.target.value)
    }
    function sendEvent() {
        onChange(name, color)
    }
    return <div className="color-row">
        <td>
            {capitalize(name.split('_').join(' '))}
        </td>
        <div className="color-input-wrapper">
            <input
                type='color'
                value={color}
                className='color-input'
                onChange={handleChange}
                onBlur={sendEvent}
            />
            <button
                onClick={() => ThemeStore.reset(name)}
                className='genshin-button theme-reset-button'
            >
                RESET
            </button>
        </div>
    </div>
}
export default Theme