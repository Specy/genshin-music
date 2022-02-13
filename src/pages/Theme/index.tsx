import { useEffect, useState } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import { SimpleMenu } from "components/SimpleMenu";
import { capitalize } from "lib/Utils";
import Color from "color";
import { AppButton } from "components/AppButton";
import { FileElement, FilePicker } from "components/FilePicker"
import './Theme.css'

import Main from "pages/Main";
function Theme() {
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTheme({ ...ThemeStore })
        })
        const dispose2 = observe(ThemeStore.state.other, () => {
            setTheme({ ...ThemeStore })
        })
        return () => {
            dispose()
            dispose2()
        }
    }, [])

    function handleChange(name: string, value: string) {
        ThemeStore.set(name, value)
    }

    function handleImport(file: FileElement[]) {
        if (file.length) ThemeStore.loadFromJson(file[0].data)
    }

    return <div className="default-page">
        <SimpleMenu />
        <div className="default-content">
            <div style={{ display: 'flex' }}>
                <AppButton onClick={ThemeStore.download} style={{ margin: '0.25rem' }}>
                    Download Theme
                </AppButton>
                <FilePicker onChange={handleImport} as='json'>
                    <AppButton style={{ margin: '0.25rem' }}>
                        Import Theme
                    </AppButton>
                </FilePicker>
            </div>
            {theme.toArray().map(e =>
                <ThemePropriety
                    {...e}
                    key={e.name}
                    onChange={handleChange}
                    modified={e.value !== theme.baseTheme.data[e.name].value}
                />
            )}
            <div className="theme-row">
                <div>
                    Background image (URL)
                </div>
                <input 
                    className="app-button"
                    style={{width: '7.7rem'}}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageMain')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value,'Main')}
                />
            </div>
            <div className="theme-row">
                <div>
                    Composer Background image (URL)
                </div>
                <input 
                    className="app-button"
                    style={{width: '7.7rem'}}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageComposer')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value,'Composer')}
                />
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '3rem' }}>
                Preview
            </div>
            <div className="theme-preview">
                <Main />
            </div>
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

    return <div className="theme-row">
        <div>
            {capitalize(name.split('_').join(' '))}
        </div>
        <div className="color-input-wrapper">
            <input
                style={{ borderColor: Color(color).darken(0.5).hex() }}
                type='color'
                value={color.hex()}
                className='color-input'
                onChange={handleChange}
                onBlur={sendEvent}
            />
            <button
                onClick={() => ThemeStore.reset(name)}
                className={`genshin-button theme-reset-button ${modified ? 'active' : ''}`}
            >
                RESET
            </button>
        </div>
    </div>
}
export default Theme