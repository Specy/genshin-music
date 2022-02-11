import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import './Theme.css'

import { SimpleMenu } from "components/SimpleMenu";
import { capitalize } from "lib/Utils";
import Color from "color";

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
        <div className="default-page" style={{justifyContent: 'center', height: '100%'}}>

            {theme.toArray().map(e =>
                <ThemePropriety 
                    {...e} 
                    key={e.name} 
                    onChange={handleChange} 
                    modified={e.value !== theme.baseTheme.data[e.name].value}
                />
            )}

        </div>
    </div>
}


interface ThemeProprietyProps {
    name: string,
    value: string,
    modified: boolean,
    onChange: (name: string, value: string) => void
}

function ThemePropriety({ name, value, onChange, modified }: ThemeProprietyProps) {
    const [color, setColor] = useState(Color(value))
    
    useEffect(() => {
        setColor(Color(value))
    }, [value])

    function handleChange(e: any) {
        setColor(Color(e.target.value))
    }

    function sendEvent() {
        onChange(name, color.hex())
    }

    return <div className="color-row">
        <div>
            {capitalize(name.split('_').join(' '))}
        </div>
        <div className="color-input-wrapper">
            <input
                style={{borderColor: Color(color).darken(0.5).hex()}}
                type='color'
                value={color.hex()}
                className='color-input'
                onChange={handleChange}
                onBlur={sendEvent}
            />
            <button
                onClick={() => ThemeStore.reset(name)}
                className={`genshin-button theme-reset-button ${modified? 'active' : ''}`}
            >
                RESET
            </button>
        </div>
    </div>
}
export default Theme